## Finalizar conversa sem enviar mensagem de finalização

Hoje "Finalizar" sempre dispara a `CLOSING_MESSAGE_TEXT` antes de marcar a conversa como inativa. Adicionar a opção de finalizar **sem** enviar essa mensagem.

### 1. API
`src/services/api.ts` — `endConversation(conversationId)`:
- Aceitar segundo parâmetro `options?: { sendClosingMessage?: boolean }` (default `true`, mantém comportamento atual).
- Só chamar `api.sendMessage(...CLOSING_MESSAGE_TEXT)` quando `sendClosingMessage !== false`.

### 2. Hook
`src/hooks/useConversations.ts` — `endConversation`:
- Repassar o mesmo segundo parâmetro `options` para `api.endConversation`.

### 3. UI (diálogo de finalização)
`src/components/ChatInterface.tsx` (~linha 1370-1389):
- No `AlertDialog` de "Finalizar esta conversa?", adicionar um `Checkbox` (`shadcn/ui`) marcado por padrão: **"Enviar mensagem de finalização ao cliente"**.
- Texto auxiliar discreto: prévia do texto que seria enviado (`CLOSING_MESSAGE_TEXT`, truncada).
- Ao confirmar, chamar `endConversation(activeChat.id, { sendClosingMessage: checked })`.
- Manter estado local do checkbox no componente do diálogo (resetar para `true` ao abrir).

### Fora do escopo
- Editar o texto de finalização padrão.
- Lembrar a preferência do usuário entre conversas (sempre volta marcado).
- Mudar fluxo de "Reabrir".
