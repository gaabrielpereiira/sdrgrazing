## Problema

Ao clicar em "Iniciar Conversa" em `Contacts`, o app navega para `/chat?contact=<telefone>`, mas o `ChatInterface` só entende `?conversation=<id>`. Para contatos novos (sem conversa ainda), nada acontece.

## Mudanças

**1. `src/services/api.ts` — novo helper `getOrCreateConversationForContact(contactId)`**
- Busca a conversa mais recente do contato (`.maybeSingle()`).
- Se existir e estiver inativa, reativa (`is_active=true`, `status='human'`).
- Se não existir, cria uma nova com `status='human'`, `is_active=true`, `user_id` do usuário atual.
- Retorna o `id`.

**2. `src/components/Contacts.tsx`**
- `handleStartConversation` vira `async`: chama o helper, mostra loader/toast e navega para `/chat?conversation=<id>`.

**3. `src/components/ChatInterface.tsx`**
- Manter o `?conversation=<id>` "pendente" via ref: se a conversa ainda não chegou pelo realtime, não cair no fallback "primeira conversa". Selecionar assim que aparecer no array (o INSERT em `conversations` dispara `fetchAndAddConversation` automaticamente).
- Limpar o query param após selecionar (`history.replaceState`).

## Resultado

Clicar em "Iniciar Conversa" em qualquer contato (recém-criado ou existente) abre o chat já naquela conversa.