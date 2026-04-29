## Objetivo

1. Marcar a conversa como **Pendente** sempre que a IA acionar atendimento humano (`status = 'human'`) e ainda não houver resposta humana — não apenas quando a última mensagem for do cliente.
2. Corrigir datas incorretas no rótulo de tempo da lista de conversas (ex.: conversa de 2 dias atrás aparecendo como "hoje" / "Xh").

---

## 1. Pendente quando IA chamar humano

**Arquivo:** `src/components/ChatInterface.tsx` (função `isPending`, linha ~385)

Hoje a regra é: pendente se a última mensagem for do cliente (`fromType === 'user'`).

Nova regra (OR):
- Última mensagem é do cliente, **OU**
- `chat.status === 'human'` e nenhuma mensagem posterior à transferência veio de um humano (`fromType === 'human'`).

Implementação simples e robusta: pendente se a última mensagem **não for de um humano** quando o status for `human`. Ou seja:

```ts
const isPending = (chat) => {
  const last = chat.messages[chat.messages.length - 1];
  // Cliente mandou e não respondemos
  if (last?.fromType === 'user') return true;
  // IA pediu atendimento humano e ainda ninguém respondeu como humano
  if (chat.status === 'human' && last?.fromType !== 'human') return true;
  // Fallback sem mensagens carregadas
  if (!last && chat.unreadCount > 0) return true;
  return false;
};
```

A tag "Pendente" some automaticamente assim que um humano enviar uma mensagem (a última mensagem passa a ser `fromType === 'human'`). Toda a lógica de ordenação (pendentes no topo) e de exibição da badge "Pendente" no card e no header já depende dessa função, então funciona sem outras mudanças.

---

## 2. Correção do sistema de datas

**Arquivo:** `src/types.ts` — função `formatRelativeTime` (linha ~379) e refresh.

### Bug atual
```
if (diffHours < 24) return `${diffHours}h`;
if (diffDays === 1) return 'Ontem';
```
- Usa `Math.floor(diffMs/3600000)`, então uma mensagem de **anteontem 23h** vista hoje às 10h dá `diffHours = 35`, `diffDays = 1` → mostra **"Ontem"** (errado, é anteontem).
- Pior: mensagem de **ontem 22h** vista hoje às 09h dá `diffHours = 11` → mostra **"11h"**, escondendo que mudou de dia.
- Além disso, `lastMessageTime` é setado como string `"Agora"` no realtime e nunca recalculado — conversas antigas continuam aparecendo como "Agora" / "5min" mesmo dias depois, até o próximo `fetchConversations`.

### Correção da função
Comparar **dias de calendário**, não janela de 24h:

```ts
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round(
    (startOfDay(now) - startOfDay(date)) / 86400000
  );

  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (dayDiff === 0) {
    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `${diffMins}min`;
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  if (dayDiff === 1) return 'Ontem';
  if (dayDiff < 7) return `${dayDiff}d`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
```

Regras resultantes:
- Mesmo dia de calendário: `Agora` / `Xmin` / `HH:MM`.
- Dia de calendário anterior: `Ontem`.
- 2–6 dias: `Nd`.
- ≥7 dias: `dd/mm`.

### Refresh do rótulo
No realtime (`src/hooks/useConversations.ts`) parar de gravar a string `"Agora"` ao receber mensagem nova — gravar o timestamp ISO real e deixar a UI formatar. Para isso:

- No handler de `INSERT` em `messages` e nas otimistic updates de `sendMessage`/`sendMediaMessage`, em vez de `lastMessageTime: 'Agora'` chamar `formatRelativeTime(newMessage.sent_at)` (ou para otimista, `formatRelativeTime(new Date().toISOString())`).
- Em `ChatInterface.tsx`, recomputar o rótulo na renderização da lista usando o `last_message_at` original. Para garantir refresh enquanto o app fica aberto, adicionar um `useEffect` com `setInterval(() => setTick(t=>t+1), 60_000)` no componente da lista para forçar re-render a cada minuto.

Isso resolve tanto o caso "diz que é hoje mas é de 2 dias" quanto o caso "fica preso em Agora".

---

## Detalhes técnicos / arquivos

- `src/components/ChatInterface.tsx`
  - Atualizar `isPending` (regra com `status === 'human'`).
  - Adicionar tick de 60s para re-render dos rótulos relativos.
- `src/types.ts`
  - Reescrever `formatRelativeTime` baseado em **dias de calendário**.
- `src/hooks/useConversations.ts`
  - Trocar `lastMessageTime: 'Agora'` por `formatRelativeTime(...)` nos 4 pontos (insert realtime, sendMessage otimista, sendMediaMessage otimista, optional: media optimistic).

Sem migrações de banco. Sem mudança de API. Compatível com lógica existente de ordenação (pendentes no topo) e de histórico ao reabrir conversas.
