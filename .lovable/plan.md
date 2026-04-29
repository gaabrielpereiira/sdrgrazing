## Objetivo

Sempre que um atendimento for finalizado (botão "Finalizar conversa" no `ChatInterface`), enviar automaticamente uma mensagem curta de encerramento para o cliente via WhatsApp, antes de marcar a conversa como inativa.

## Mensagem padrão

Texto simples e sucinto, em português:

> "Atendimento encerrado. Caso precise de algo, é só chamar novamente por aqui. 👋"

(Será uma constante exportada para facilitar futura customização — sem criar UI nova agora.)

## Mudanças

### 1. `src/services/api.ts` — `endConversation`

Antes de marcar `is_active: false`, enfileirar a mensagem de encerramento:

- Inserir uma row em `messages` com `from_type: 'human'`, `type: 'text'`, `content` = texto de encerramento, `status: 'sent'`, `sent_at: now()`. Isso garante que a mensagem aparece no histórico do chat (e via realtime para outros atendentes).
- Inserir uma row em `send_queue` referenciando essa `message_id`, com `from_type: 'human'`, `message_type: 'text'`, `content` = texto, `status: 'pending'`, `metadata: { sender_user_id, closing_message: true }`. O `whatsapp-sender` já existente cuidará do envio real (e do prefixo `*Nome*:` do atendente, conforme lógica recente).
- Disparar `trigger-whatsapp-sender` (mesmo padrão usado em `sendMessage`) para processar a fila imediatamente.
- Só depois aplicar o `update` em `conversations` para `is_active: false, status: 'paused'`.

Tratamento de erro: se a inserção da mensagem de encerramento falhar, logar o erro mas **continuar** com o fechamento da conversa (não bloquear o atendente). Usar `console.error` + um `toast.warning` opcional.

### 2. Sem alterações de UI necessárias

- O `ChatInterface` já chama `endConversation(activeChat.id)` no botão de finalizar — nada muda lá.
- A mensagem aparecerá automaticamente no histórico via o INSERT em `messages` (realtime já cobre isso).
- O cliente recebe via WhatsApp através do pipeline existente `send_queue` → `whatsapp-sender`.

### 3. Constante de texto

Criar/usar uma constante em `src/constants.ts`:

```ts
export const CLOSING_MESSAGE_TEXT =
  'Atendimento encerrado. Caso precise de algo, é só chamar novamente por aqui. 👋';
```

## Observações técnicas

- Não é necessária migration — usa tabelas existentes (`messages`, `send_queue`).
- Não mexer em `whatsapp-sender`: ele já lida com `from_type='human'` e prefixo de nome do atendente.
- Não mexer em `reopenConversation` (não envia nada ao reabrir).
- A mensagem fica visível no chat finalizado (aba "Finalizadas") como última mensagem do histórico.
