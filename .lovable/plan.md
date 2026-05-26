## Diagnóstico
- DB Lovable Cloud: saudável (notifications tem 410 linhas, conexões em 26/60).
- Console mostra `Setting up real-time subscriptions` seguido imediatamente de `Cleaning up subscriptions`, depois `TIMED_OUT` em todos os canais e fallback de polling de 10s que nunca para.
- Causa: o `useEffect` em `src/hooks/useConversations.ts` (linha 486) tem dependências instáveis (`fetchConversations`, `fetchAndAddConversation`, `startPolling`, `stopPolling`) que recriam a cada render, fazendo o efeito desmontar/remontar. Como os canais usam nomes fixos (`messages-realtime`, `conversations-realtime`, `contacts-realtime`), o `.subscribe()` colide com a assinatura anterior antes dela fechar → TIMED_OUT → polling fallback infinito → `Failed to fetch` em cascata (incluindo notifications).

## Correções (frontend apenas)

### 1. `src/hooks/useConversations.ts` — estabilizar o efeito de Realtime
- Trocar as dependências do useEffect (linha 486) para `[]` e referenciar os callbacks via `useRef` atualizado a cada render. Padrão:
  ```ts
  const fetchRef = useRef(fetchConversations);
  useEffect(() => { fetchRef.current = fetchConversations; });
  // dentro do effect: fetchRef.current()
  ```
  Aplicar o mesmo para `fetchAndAddConversation`, `startPolling`, `stopPolling`.
- Usar **nome de canal único por mount** (igual já está em `useNotifications`):
  ```ts
  const suffix = Math.random().toString(36).slice(2, 8);
  supabase.channel(`messages-realtime-${suffix}`)
  ```
  Para os três canais. Isso evita colisão se houver remount residual.
- Manter o polling fallback, mas garantir que `stopPolling()` seja chamado em `SUBSCRIBED` (já é) e na cleanup (já é). Sem o ciclo de remount, ele deixará de disparar.

### 2. `src/hooks/useNotifications.ts` — reduzir ruído
- Já usa canal único e polling de 15s. Ajuste pequeno: aumentar polling para 30s e parar de pollar quando `realtimeConnected === true` (poupar requests; cada `Failed to fetch` polui logs).

### 3. Verificação
- Após salvar, no preview: abrir DevTools → console deve mostrar `Messages channel status: SUBSCRIBED` (não TIMED_OUT) e **não** repetir "Setting up..." em loop.
- O badge de notificações volta a carregar e o chat para de "sincronizar sem parar".

## O que NÃO mudar
- Nenhuma migration, nenhum edge function, nenhuma RLS. O backend está OK; é puramente bug de ciclo de vida do hook no frontend.
