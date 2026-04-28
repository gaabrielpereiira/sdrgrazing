# Tag "Pendente" para conversas sem resposta

## Objetivo
No chat, identificar automaticamente conversas onde a última mensagem foi do cliente (sem resposta de humano/Nina ainda), exibir uma tag visual "Pendente" e mover essas conversas para o topo da lista. A tag desaparece assim que respondermos.

## Comportamento
- **Quando aparece**: a última mensagem da conversa é do tipo `user` (cliente).
- **Quando some**: assim que enviamos resposta (última mensagem é `nina` ou `human`).
- **Ordenação**: conversas pendentes ficam no topo, ordenadas pela mais recente. Em seguida, as demais por `lastMessageTime`.
- **Estado derivado**: nada é salvo no banco — a tag é calculada em tempo real a partir das mensagens já carregadas. Reativa automaticamente via Realtime quando uma mensagem nova chega.

## Implementação técnica

Tudo concentrado em `src/components/ChatInterface.tsx`:

1. **Helper `isPending(chat)`**:
   - Pega `chat.messages[chat.messages.length - 1]`.
   - Retorna `true` se `lastMsg.fromType === 'user'`.
   - Se a conversa não tem mensagens carregadas, fallback usa `chat.unreadCount > 0`.

2. **Atualizar `filteredConversations`** (linha ~383):
   - Após o filter de busca, aplicar `.sort()`:
     - Pendentes primeiro (`isPending` desc).
     - Depois por timestamp da última mensagem (mais recente primeiro), usando `chat.messages[last].timestamp` ou `lastMessageTime`.

3. **Renderizar a tag "Pendente"** no card da conversa (dentro do `.map` da linha ~636):
   - Badge âmbar/laranja pulsante ao lado do nome ou junto com `renderStatusBadge`.
   - Estilo: `bg-amber-500/20 text-amber-300 border-amber-500/40` com ícone `Clock` ou `AlertCircle` (já usados no projeto via lucide-react).
   - Pequena animação `animate-pulse` para chamar atenção.

4. **(Opcional) Indicador no header do chat aberto**: mostrar a mesma tag no topo quando `activeChat` está pendente, para reforço visual.

## Arquivos alterados
- `src/components/ChatInterface.tsx` (único arquivo)

## Não-objetivos
- Não persiste a tag no banco (`contacts.tags` ou `conversations.tags`).
- Não altera triggers, RLS, ou edge functions.
- Não muda a lógica de `unreadCount` existente.
