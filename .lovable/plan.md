## Sintoma
A Nina envia mensagens cortadas no meio da palavra (ex.: "Grazing Esp", "Para ad", "Lembrando que pelo site (") e, em outras ocasiões, manda o fallback genérico "Entendi! Como posso ajudar?" sem motivo aparente.

## Investigação feita
Consultei `messages` filtrando respostas da Nina com `length(content) < 30` nos últimos dias. Padrão encontrado:

| created_at | content | chunk | model |
|---|---|---|---|
| 26/05 14:10:50 | `Grazing Esp` | 1/2 | gemini-3-pro-preview |
| 26/05 12:59 | `Para ad` | 1/2 | gemini-3-pro-preview |
| 26/05 12:47 | `Lembrando que pelo site (` | 1/2 | gemini-3-pro-preview |
| Dezenas de vezes | `Entendi! Como posso ajudar?` | 0/1 | gemini-3-pro-preview |

Reconstruí a conversa do "Grazing Esp": a Nina respondeu em 2 chunks. O chunk 0 foi `"Gabriel, que delícia de encontro! Para vocês, a nossa Grazing para 4 pessoas é a base perfeita. Para complementar e impressionar, sugiro muito:"` e o chunk 1 saiu apenas como `"Grazing Esp"` — claramente cortado no meio da palavra "Espresso/Especial".

Olhei a chamada da AI em `supabase/functions/nina-orchestrator/index.ts` linhas 1024-1064:
```ts
const requestBody = {
  model: aiSettings.model,        // google/gemini-3-pro-preview
  messages: [...],
  temperature: aiSettings.temperature,
  max_tokens: 1000                 // <-- aqui
};
```

## Causa raiz
`gemini-3-pro-preview` é um **modelo de reasoning** — ele consome tokens "pensando" antes de escrever a resposta, e esses tokens internos contam dentro de `max_tokens`. Com `max_tokens: 1000`:

1. O reasoning come boa parte do orçamento → sobra pouquíssimo para o texto visível → a resposta termina **truncada no meio da palavra** (vira "Grazing Esp", "Para ad", etc.).
2. Em casos extremos o reasoning consome **tudo** → `content: ""` no retorno → cai no branch de "AI response received, content length: 0" (vi 2 desses nos últimos minutos nos logs) → e quando não há tool call associada, o orchestrator devolve o fallback hardcoded **"Entendi! Como posso ajudar?"** (linha 1340 em diante).

A função `breakMessageIntoChunks` (linha 1813) só faz split por `\n\n`, então uma resposta truncada gera chunks também truncados — não é bug do chunking, é a resposta da AI que já veio cortada.

A chamada de follow-up após `search_products` (linha 1133-1143) também usa `max_tokens: 1000`, com o mesmo problema — e provavelmente é a que produziu o "Grazing Esp".

## Plano de correção

### Fix 1 — Aumentar `max_tokens` das chamadas principais
Em `nina-orchestrator/index.ts`:
- Linha 1032: subir `max_tokens` da chamada principal de **1000 → 4000** (modelos de reasoning Gemini 3 Pro recomendam orçamento maior; 4000 dá folga para o thinking + uma resposta de WhatsApp completa).
- Linha 1142: subir `max_tokens` da chamada de follow-up pós-`search_products` para **4000** também (é aí que normalmente lista produtos longos com link).

Manter as outras chamadas pequenas (linhas 847 com `max_tokens: 80` e 911 com `max_tokens: 5`) — essas são para classificação curta de retomada e não precisam de reasoning extenso.

### Fix 2 — Detectar resposta truncada antes de enviar
Logo após receber `aiData` (linhas 1064-1069), inspecionar `aiData.choices?.[0]?.finish_reason`:
- Se `finish_reason === 'length'` (resposta cortada por limite de tokens) **e** `aiContent` for não vazio: logar warning detalhado (modelo, length, prévia do conteúdo) e descartar o último chunk parcial — só enviar até o último `\n\n` ou ponto final completo. Se sobrar nada coerente, **não enviar nada** (em vez de mandar um pedaço incompreensível).
- Aplicar o mesmo na resposta de follow-up.

### Fix 3 — Remover fallback "Entendi! Como posso ajudar?" quando AI devolve vazio sem tool call
Na linha ~1340 onde hoje gera essa frase: trocar por **não enviar nada** + registrar a notificação `ai_empty_response` (que já existe nas linhas 1346-1357). Hoje o cliente recebe uma frase genérica que parece "Nina está distraída"; é melhor o operador humano ver a notificação e responder do que mandar resposta sem contexto.

### Fix 4 (opcional, depende da resposta abaixo) — Reduzir esforço de reasoning
Adicionar `reasoning: { effort: "low" }` ou `"minimal"` no body da chamada principal. Isso reduz drasticamente os tokens consumidos pelo thinking, fica muito mais barato e rápido, e para um agente de WhatsApp conversacional (não problema de matemática) faz diferença pequena na qualidade. Só aplico se você confirmar.

## Fora de escopo
- Não vou alterar o modelo padrão (continua `gemini-3-pro-preview`) a menos que peça.
- Não mexo em chunking, dedupe, áudio, WooCommerce search ou agendamento.
- Não mexo nas chamadas pequenas (classificação de retomada).

## Pergunta antes de implementar
1. Aplico o **Fix 4** (reduzir reasoning para `low`) junto? Vai deixar a Nina mais rápida e mais barata, com risco baixíssimo de piora perceptível em respostas de venda/atendimento.
2. Confirma que prefere **não mandar nada** quando a AI devolve vazio (em vez de "Entendi! Como posso ajudar?")?
