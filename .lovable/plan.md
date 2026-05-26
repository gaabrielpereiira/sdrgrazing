# Por que a Nina fica repetindo "Entendi! Como posso ajudar?"

## Diagnóstico

Confirmei no banco que a mensagem repetida no print é literalmente `"Entendi! Como posso ajudar?"`, enviada 4 vezes para a Paty entre 01:13 e 01:19 de 25/05. Essa string só existe **uma vez** no código, em `supabase/functions/nina-orchestrator/index.ts:1137`:

```ts
// Linhas 1128–1139
if (!aiContent && toolCalls.length > 0) {
  if (appointmentCreated && !appointmentCreated.error) { ... }
  else if (appointmentRescheduled && ...) { ... }
  else if (appointmentCancelled && ...) { ... }
  else {
    aiContent = 'Entendi! Como posso ajudar?';   // <-- aqui
  }
}
```

Ou seja: esse fallback dispara **toda vez que a IA devolve conteúdo vazio mas com `tool_calls` que não são de agendamento**. Os culpados possíveis hoje são:

1. **`search_products` (WooCommerce)** — fluxo de re-chamada (linhas 906–970):
   - A IA chama `search_products`, retorna `content=""`.
   - O orquestrador chama `wc-products`, monta `toolMessages`, e refaz a chamada à IA.
   - Se essa segunda chamada falhar (`followupRes.ok === false`, ex.: 429/402/timeout) ou voltar `content=""` novamente, `aiContent` continua vazio e os `tool_calls` originais continuam contando — cai no fallback.
   - Pior: a segunda chamada ainda envia `tools` + `tool_choice: 'auto'`, então o modelo pode pedir **mais** tool calls em vez de responder texto.

2. **`request_human_handoff` com argumentos inválidos** (linhas 1063–1125): se o `JSON.parse(toolCall.function.arguments)` lança, o `catch` só loga, `handoffRequested` fica `null`, `aiContent` continua vazio → fallback.

3. **`create_appointment` / `reschedule` / `cancel` com erro de parse**: mesmo padrão, cai no fallback.

Em todos os casos o **cliente recebe a mesma frase genérica repetidas vezes**, exatamente o sintoma reportado. Hoje, com WC já configurado, a re-chamada está funcionando (vi `Follow-up AI reply length: 341` nos logs de 26/05), mas em 25/05 a configuração ainda não estava completa / a chamada falhou silenciosamente.

## Correções propostas

### 1. Endurecer o re-call de `search_products` (linhas 940–969)
- Remover `tools` e `tool_choice` no `followupBody` (forçar a IA a redigir texto, sem pedir mais ferramentas).
- Se `wc-products` voltar `success: false` ou status != 200, **incluir o erro dentro do `tool` message** (já é feito, mas hoje o JSON cru tem chave `error` — adicionar um campo `instructions_for_assistant` claro tipo: "A busca falhou, peça desculpa e ofereça ajuda manual").
- Se `followupRes.ok` for false **ou** o conteúdo voltar vazio, logar `aiMessage` cru para diagnóstico e tratar como "skip send" (mesma rota de linha 1180) — não enviar fallback genérico.

### 2. Substituir o fallback genérico (linha 1137)
- Em vez de `"Entendi! Como posso ajudar?"`, **não enviar mensagem** (mesma estratégia da linha 1181 para resposta vazia: marcar `processed_by_nina = true` e retornar).
- Motivo: enviar uma resposta genérica é pior que silêncio porque polui a conversa e mascara o bug.
- Para o operador entender, inserir um registro em `notifications` (`type: 'ai_empty_response'`) com o nome da tool, args e razão (parse error / followup falhou / etc.), igual ao safety-net de handoff (linhas 1145–1178).

### 3. Tornar visíveis os erros de `JSON.parse` em tool calls
Nos três blocos de `request_human_handoff`, `create_appointment`, `reschedule_appointment`, `cancel_appointment`, quando o `catch` for acionado:
- Logar `toolCall.function.arguments` cru (truncado).
- Criar `notification` `ai_tool_parse_error` para a equipe inspecionar.

### 4. Adicionar logs de telemetria no orquestrador
- Logar `toolCalls.map(tc => tc.function?.name)` toda vez que `aiContent` for vazio, para identificar o padrão exato no Edge Function Logs.

## Arquivos a alterar

- `supabase/functions/nina-orchestrator/index.ts` — todas as mudanças acima ficam neste arquivo. Sem migrações nem mudanças de UI.

## O que NÃO vai mudar

- Tabela `messages`, RLS, prompt da Nina, configuração de WC.
- Comportamento de agendamento / handoff bem-sucedidos.
- Não cria nenhum endpoint novo.

## Como validar depois do fix

1. Forçar erro: desabilitar `wc_products_enabled` temporariamente, pedir cardápio → Nina deve ficar em silêncio (não repetir "Entendi! Como posso ajudar?") e gerar `notification` `ai_empty_response`.
2. Reativar WC, pedir cardápio → Nina responde com produtos reais via follow-up.
3. Verificar nos Edge Function Logs as novas linhas `[Nina] Empty content with tool_calls: [search_products]` para confirmar a telemetria.
