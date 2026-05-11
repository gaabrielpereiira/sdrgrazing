## Contadores no topo das abas (Ativas / Finalizadas / Suporte)

Adicionar um badge com o **número total de conversas** ao lado do rótulo de cada aba do painel de chat. Aplica-se às duas barras de abas existentes em `src/components/ChatInterface.tsx`:

- Aba de status: **Ativas** e **Finalizadas**
- Aba de fila (somente admin): **Atendimento** e **Suporte**

### Mudanças

1. **Novo hook `src/hooks/useConversationTabCounts.ts`**
   - Faz um `select id, queue, is_active` em `conversations` (lightweight, RLS já filtra o que o usuário pode ver).
   - Retorna `{ activeSales, finishedSales, activeSupport, finishedSupport, activeTotal, finishedTotal }`.
   - Atualiza a cada 30s e em eventos realtime de `conversations` (mesmo padrão do `useQueueUnreadCounts`).

2. **`ChatInterface.tsx` — adicionar badges nos `TabsTrigger`**
   - Tabs **Atendimento / Suporte** (admin): manter o badge âmbar/ciano de não-lidas, e adicionar um segundo badge neutro (`bg-slate-700 text-slate-200`) com o total da fila correspondente.
   - Tabs **Ativas / Finalizadas**: adicionar badge neutro com o total filtrado pela fila ativa (`effectiveQueue`). Ex.: ao estar na fila Suporte, "Ativas" mostra o total de conversas ativas no Suporte.
   - Formato do badge: `min-w-[1.25rem] h-[1.1rem] px-1 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700`. Para zero, mostrar "0" (ou ocultar — escolha: mostrar sempre, dá mais previsibilidade visual).

### Fora de escopo
- Não muda fonte de dados nem RLS.
- Não altera o badge âmbar pulsante de não-lidas — ele continua sinalizando mensagens novas.

### Arquivos
- criar: `src/hooks/useConversationTabCounts.ts`
- editar: `src/components/ChatInterface.tsx` (apenas os blocos `TabsTrigger`)
