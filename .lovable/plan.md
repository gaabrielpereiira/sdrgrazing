# Por que aparecem mensagens duplicadas

Investiguei os logs e o banco. A mensagem "Olá! Como posso ajudar você hoje? 😊" **não é** uma resposta da IA — é o **fallback hard-coded** em `nina-orchestrator/index.ts` (linha 1062), usado quando o AI Gateway retorna `content` vazio.

Nos logs recentes vi 3 chamadas seguidas com `content length: 0`. O padrão é claro: sempre que o cliente manda **imagens** (ou várias mensagens em sequência muito rápida), a IA devolve vazio → o fallback dispara. Como a frase é sempre a mesma, parece que a Nina "repetiu". Ex. conversa `d1f44b62`:

```
14:33:14  user  "Pode fazer por ai????"
14:33:40  nina  "Olá! Como posso ajudar você hoje? 😊"   ← fallback
14:33:57  nina  "Olá! Como posso ajudar você hoje? 😊"   ← fallback
14:34:03  user  [imagem]
14:34:30  nina  "Olá! Como posso ajudar você hoje? 😊"   ← fallback
14:34:46  nina  "Olá!… 😊\nOlá!… 😊"                      ← fallback duplo
```

## Causas

1. **Imagens não são enviadas para o modelo**: `nina-orchestrator` não inclui `media_url` no payload do AI Gateway. A mensagem chega como `"[imagem recebida]"` puro, sem contexto visual → Gemini não tem o que responder → `choices[0].message.content = ""`.
2. **Fallback sem proteção contra repetição**: quando vem vazio, o código sempre envia "Olá! Como posso ajudar…". Se 3 mensagens do cliente dispararem 3 invocações em curto intervalo, o cliente recebe 3 vezes a mesma saudação.
3. **Mensagens chegam antes do download da mídia**: a função `download-whatsapp-media` roda em background (`EdgeRuntime.waitUntil`), então o `message-grouper` pode chamar a Nina antes do `media_url` existir.

## Plano de correção

### 1. `supabase/functions/nina-orchestrator/index.ts`

- **Suporte a imagens no payload da IA**: quando a mensagem agrupada tiver `type='image'` e `media_url` preenchido, montar o `content` no formato multimodal do Gemini:
  ```ts
  { role: 'user', content: [
    { type: 'text', text: caption || '' },
    { type: 'image_url', image_url: { url: media_url } }
  ]}
  ```
- **Não enviar fallback genérico**: substituir a linha 1062. Se `aiContent` ficar vazio:
  - Logar `[Nina] Empty AI response, skipping send`.
  - **Não inserir nada em `send_queue`**, **não criar `message` da Nina**.
  - Marcar a mensagem original como `processed_by_nina=true` mesmo assim (para não reprocessar).
- **Dedupe defensivo**: antes de inserir resposta no `send_queue`, checar se a última mensagem `from_type='nina'` da conversa nos últimos 30s tem `content` idêntico ao que está prestes a ser enviado. Se sim, abortar o insert.

### 2. `supabase/functions/message-grouper/index.ts`

- **Aguardar download de mídia**: se houver mensagem do tipo `image/audio/video/document` no grupo com `media_url IS NULL`, adiar o processamento (reagendar `process_after` para +10s, com máximo de 2 tentativas) antes de chamar `nina-orchestrator`. Assim a IA recebe a mídia já baixada.

### 3. Sem mudanças no frontend

A duplicação visual vem do backend; o frontend só renderiza o que está em `messages`. Após as correções, as duplicatas históricas continuam visíveis mas novas mensagens não se repetirão.

## Diagnóstico técnico (resumo)

| Sintoma observado | Causa real |
|---|---|
| "Olá!..." repetido | Fallback hard-coded disparando múltiplas vezes |
| AI Gateway `content length: 0` | Imagem chega como texto vazio + `media_url` ainda nulo |
| Duas linhas "Olá!..." num mesmo `messages.content` | Chunking por `\n\n` combinou duas saídas vazias do mesmo ciclo |

## Fora de escopo

- Limpar histórico de mensagens duplicadas já no banco (posso fazer num passo seguinte se quiser).
- Trocar de modelo (Gemini Flash → Pro) por causa de imagens — não é necessário, ambos suportam image_url.
