## Debug das conversas que "perdem histórico"

### O que já foi confirmado no banco

A conversa da Cintia (`5513996390706`) tem **139 mensagens preservadas** no banco (de 05/05 a 09/05) e está hoje com `is_active = false`. Ou seja: **nada foi deletado no banco**. O problema é de **estado do front-end**, e há 2 gatilhos plausíveis para o sintoma "abro a conversa, vejo o histórico, e depois de um tempo somem mensagens":

### Gatilho 1 — UPDATE em `conversations` flipa `is_active` e a conversa é removida da view inteira

`src/hooks/useConversations.ts` (linha ~326):

```ts
if (typeof updated.is_active === 'boolean' && updated.is_active !== isActiveFilter) {
  setConversations(prev => prev.filter(c => c.id !== updated.id));
  return;
}
```

Quando uma conversa que está aberta na aba "Ativas" é marcada como `is_active=false` (por edge function ou ação de outro operador), ela **some inteira da lista** — o usuário pode interpretar isso como "perdeu o histórico". O `activeChat` apontado pela UI fica órfão.

### Gatilho 2 — Polling/refetch ressincroniza o array com o que vier do banco e descarta msgs locais não persistidas ainda

`fetchConversations` (api.ts:1361) tem `.limit(50)` em conversas e `.limit(300)` em mensagens. Quando o polling roda (a cada 10s no fallback) ele **substitui** o `state` inteiro. Qualquer conversa que não esteja no top-50 por `last_message_at` cai da lista. E se houver mensagens "in flight" (temp-id otimista, ou ainda não commitadas) elas são descartadas.

### Gatilho 3 — `fetchAndAddConversation` puxa só 300 msgs descendentes

Já corrigido na rodada anterior, então não deve ser ele agora — mas vou validar com logs.

---

## Plano de debug + correções mínimas

### 1. Instrumentação (diagnóstico)

Adicionar em `src/hooks/useConversations.ts` um log estruturado **toda vez que o array de mensagens de uma conversa diminuir**:

```ts
// wrapper em setConversations que detecta queda
const setConversationsTracked = (updater) => {
  setConversations(prev => {
    const next = typeof updater === 'function' ? updater(prev) : updater;
    next.forEach(nc => {
      const old = prev.find(p => p.id === nc.id);
      if (old && nc.messages.length < old.messages.length) {
        console.error('[Debug] ⚠️ Mensagens diminuíram em', nc.id,
          'de', old.messages.length, '→', nc.messages.length,
          'stack:', new Error().stack);
      }
    });
    // detectar conversa sumindo
    prev.forEach(p => {
      if (!next.some(n => n.id === p.id)) {
        console.error('[Debug] ⚠️ Conversa removida do estado:', p.id, p.contact?.name);
      }
    });
    return next;
  });
};
```

Substituir todos os `setConversations(...)` por essa versão. Em produção podemos manter como `console.warn` silencioso.

### 2. Não remover conversa do array quando `is_active` flipa — apenas marcar

Na aba "Ativas", se uma conversa for marcada como inativa **enquanto o usuário está vendo o chat dela**, mantemos no estado até o próximo refetch manual (ou navegação). Isso evita o "sumiço" percebido.

```ts
// trocar o filter por um update que sinaliza, sem remover
setConversations(prev => prev.map(c =>
  c.id === updated.id ? { ...c, isActive: updated.is_active, status: updated.status } : c
));
```

A aba já filtra por `isActive` na exibição; se não filtra, adicionar filtro local.

### 3. Polling defensivo: merge em vez de replace

No `fetchConversations` chamado pelo polling, fazer **merge** preservando `messages` locais quando o servidor retornar a mesma conversa com menos mensagens:

```ts
setConversations(prev => {
  return fresh.map(f => {
    const old = prev.find(p => p.id === f.id);
    if (!old) return f;
    // se local tem mais msgs que o fetch, preserve as locais
    return f.messages.length >= old.messages.length ? f : { ...f, messages: old.messages };
  });
});
```

### 4. Carregar mensagens sob demanda ao selecionar uma conversa

Quando o usuário clica numa conversa, refazer um fetch das **últimas 500 mensagens** daquela conversa (em vez de depender do que veio no fetch geral). Garante que o chat aberto sempre exibe o histórico completo recente, mesmo se o array em memória tiver sido mexido.

`src/components/ChatInterface.tsx` — no `useEffect` de `activeChat?.id`, chamar `api.fetchConversationMessages(id, 500)` e atualizar só aquela conversa.

### 5. Reproduzir o caso da Cintia

Após implementar (1) e (4), abrir a Cintia (aba Finalizadas) e deixar a aba aberta por uns minutos, alternando para outras conversas. Os logs do passo (1) vão imprimir exatamente em qual handler o array encolhe — confirmando se é polling, UPDATE de is_active, ou outra coisa.

---

## Arquivos afetados

- `src/hooks/useConversations.ts` — wrapper de log, ajuste do handler de UPDATE, merge no polling
- `src/services/api.ts` — adicionar `fetchConversationMessages(id, limit)` (talvez já exista parcialmente em api.ts:1995)
- `src/components/ChatInterface.tsx` — refetch ao selecionar conversa

## Fora do escopo

- Paginação infinita pra carregar mensagens > 500 (próximo passo)
- Mexer no schema/RLS — confirmado que o banco preserva tudo
