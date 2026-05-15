## Ordenar conversas como o WhatsApp + abrir sempre na última mensagem

### 1. Ordem da lista de conversas (estilo WhatsApp)
Arquivo: `src/components/ChatInterface.tsx` (~linha 665-674)

Hoje a lista força conversas "pendentes" para o topo, quebrando a ordem cronológica. Vamos remover esse re-ordenamento e manter apenas a ordem por `last_message_at desc` que já vem de `useConversations` / `api.fetchConversations` (`.order('last_message_at', { ascending: false })`).

- Remover o `.map(...).sort(...).map(...)` que prioriza `isPending`.
- Manter somente o `.filter(...)` de busca, deixando a ordem natural (mais recente primeiro), igual ao WhatsApp.

### 2. Abrir conversa sempre rolada na última mensagem
Arquivo: `src/components/ChatInterface.tsx` (~linha 406-418)

Hoje `scrollToBottom()` usa `behavior: 'smooth'`, e ao trocar de conversa isso causa animação (e às vezes não chega ao fim antes do render). Ajustes:

- Criar `scrollToBottom(instant = false)` aceitando comportamento.
- No `useEffect` disparado por `activeChat?.id` / `selectedChatId` (abrir conversa): chamar `scrollToBottom(true)` com `behavior: 'auto'` e fazer isso dentro de um `requestAnimationFrame` (ou pequeno `setTimeout`) para garantir que o DOM das mensagens já renderizou. Pode rodar 2x (rAF aninhado) para cobrir o caso de mensagens carregadas async.
- Manter o `useEffect` de novas mensagens (`activeChat?.messages`) com scroll suave (comportamento atual), para que mensagens novas durante a conversa continuem deslizando.

### Fora do escopo
- Mudanças de backend, RLS ou nas queries de `useConversations`.
- Lógica de "não-lidas" / badges / contadores.
- Mudança visual da lista além da ordem.
