# Remover mensagem manual fora do horário — IA assume comunicação

## Problema
A seção "Mensagem fora do horário" em **Configurações → Agente** exige que o usuário digite um texto fixo com variáveis (`{{horario}}`, `{{equipe}}`). O usuário quer eliminar esse controle manual e deixar a IA (Nina) identificar naturalmente quando está fora do expediente e se comunicar com o cliente de forma fluida.

## Solução

### 1. Remover campos manuais da UI (`src/components/settings/AgentSettings.tsx`)
- Excluir o card inteiro "Mensagem fora do horário" (textarea + input de intervalo + variáveis).
- Remover os campos `out_of_hours_auto_reply` e `out_of_hours_cooldown_minutes` do state, do `loadSettings` e do `handleSave`.
- Manter os cards de horário por equipe (Atendimento/Comercial e Produção) — eles continuam necessários para a IA saber os horários.

### 2. Implementar `formatBusinessHoursBlock` no orquestrador
Criar a função faltante em `supabase/functions/nina-orchestrator/index.ts`:
- Recebe o `BusinessHoursStatus` retornado por `getTeamBusinessHoursStatus`.
- Retorna um bloco de texto curto em português que é injetado no **system prompt**.
- Se `isOpen: true` → informa o horário atual de funcionamento.
- Se `isOpen: false` → informa que está fora do horário e informa o próximo horário de abertura (`nextOpenLabel`).
- Instrui a IA: "Se o cliente enviar uma mensagem fora do horário de atendimento, mencione de forma natural que estamos fechados agora e diga quando retornaremos. Não use mensagens robóticas ou templates."

### 3. Remover envio de auto-resposta estática no orquestrador
- A função `maybeSendOutOfHoursAutoReply` (referenciada mas não implementada) será **removida** ou substituída por um no-op.
- O trecho no `processQueueItem` que a chamava (linhas ~1392-1394) será removido.
- A IA passa a ser a única responsável pela resposta; não haverá mais dupla mensagem (auto-resposta fixa + resposta da IA).

### 4. Prompt de sistema — instrução implícita
O bloco de horários já injetado no prompt dá à IA todo o contexto necessário para decidir o tom e o conteúdo. Nenhuma configuração adicional é exigida do usuário.

## Critérios de aceitação
- [ ] Aba "Comportamento" não exibe mais textarea "Texto da mensagem automática" nem "Intervalo entre avisos".
- [ ] Ao salvar configurações, `out_of_hours_auto_reply` e `out_of_hours_cooldown_minutes` não são mais enviados ao Supabase.
- [ ] O orquestrador compila e não referencia funções inexistentes.
- [ ] Quando uma mensagem chega fora do horário, a IA responde de forma natural (ex.: "Oi! Já estamos fora do expediente hoje, mas retomamos amanhã (segunda-feira) às 08:00. Deixa sua dúvida aqui que assim que abrirmos te respondemos! 💛").
- [ ] Não há envio de mensagem fixa/template separada da resposta da IA.

## Nota técnica
As colunas `out_of_hours_auto_reply` e `out_of_hours_cooldown_minutes` permanecem no banco (não é necessário migration de remoção). Apenas paramos de ler/escrever nelas no frontend e backend.