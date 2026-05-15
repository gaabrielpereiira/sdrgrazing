## Mostrar botões da API do WhatsApp no chat

Atender duas coisas:
1. **Botões de templates enviados**: quando enviamos um template com `BUTTONS` (Quick Reply / URL / Phone), renderizá-los dentro do balão da mensagem.
2. **Resposta de botão recebida**: quando o cliente clica num botão (`interactive.button_reply` ou `list_reply` no webhook), salvar e exibir no chat indicando claramente que foi a resposta a um botão.

### 1. Webhook — capturar `interactive` (entrada)
Arquivo: `supabase/functions/whatsapp-webhook/index.ts` (~linha 298, switch `message.type`)

Adicionar um caso `'interactive'`:
- Para `button_reply`: `messageContent = interactive.button_reply.title`, salvar em `metadata.interactive = { kind: 'button_reply', id, title }` e `metadata.original_type = 'interactive'`.
- Para `list_reply`: `messageContent = list_reply.title` (com `description` opcional), salvar em `metadata.interactive = { kind: 'list_reply', id, title, description }`.
- `messageType = 'text'` (cabe na coluna existente; tipo nativo `interactive` não está no enum `message_type`).

### 2. Sender — garantir que botões do template ficam no `metadata`
Arquivo: `supabase/functions/whatsapp-sender/index.ts` (insert/update do registro em `messages`, ~linha 466 e 491)

Hoje `metadata: queueItem.metadata || {}` já é persistido, e o template (incluindo `components` com `BUTTONS`) está em `metadata.template`. Adicionar um campo derivado `metadata.buttons` para a UI consumir sem precisar varrer `components`:

```ts
const buttonsComp = (queueItem.metadata?.template?.components || [])
  .find((c) => (c.type || '').toUpperCase() === 'BUTTONS');
const buttons = buttonsComp?.buttons?.map((b) => ({
  type: (b.type || '').toUpperCase(),       // QUICK_REPLY | URL | PHONE_NUMBER
  text: b.text || '',
  url: b.url || null,
  phone_number: b.phone_number || null,
})) || null;
```

E mesclar `buttons` em `metadata` tanto no `insert` quanto no `update` (preservando `existing.metadata`).

### 3. UI do chat — renderizar botões
Arquivo: `src/components/ChatInterface.tsx` (`renderMessageContent`, ~linha 684)

- **Saída (template enviado)**: se `msg.metadata?.buttons?.length > 0`, abaixo do conteúdo desenhar uma lista vertical de "pílulas" no estilo WhatsApp:
  - `QUICK_REPLY`: pílula apenas leitura (ícone de seta de resposta), sem ação.
  - `URL`: âncora `<a target="_blank" rel="noreferrer">` com ícone externo.
  - `PHONE_NUMBER`: âncora `tel:` com ícone de telefone.
  - Estilo: borda superior separadora, texto centrado em cor primária do tema, hover suave (apenas para URL/PHONE).
- **Entrada (button_reply / list_reply)**: se `msg.metadata?.interactive`, antes do conteúdo de texto exibir um chip pequeno "↩︎ Resposta a botão" e o `title` em destaque. Continua aparecendo na lista de conversas como o `content` normal (já é o `title`).

### 4. Tipos / mapping
Arquivo: `src/types.ts` — `transformDBToUIMessage` já preserva `metadata`. Sem mudanças de tipos obrigatórias; podemos opcionalmente declarar shape de `buttons`/`interactive` em comentário.

### Fora do escopo
- Compositor para enviar mensagens interativas avulsas (sem template) pelo chat.
- Tornar Quick Reply clicável para "auto-responder" pelo agente.
- Suporte a `interactive` `cta_url`, `flow`, `nfm_reply`, etc. (apenas button_reply e list_reply).
- Migrar enum `message_type` para incluir `interactive` (mantemos como `text` com flag em metadata).
