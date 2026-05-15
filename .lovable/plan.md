# Renomear "Atendimento" → "Geral" e transformar Suporte em tag

## Mudanças (admins, no `ChatInterface.tsx`)

1. **Tabs**: passa de 3 abas (`Atendimento | Suporte | Finalizadas`) para 2 (`Geral | Finalizadas`).
   - `mainTab` vira `'geral' | 'finalizadas'`.
   - `queueForFetch` na aba **Geral** = `'all'` (lista vendas + suporte juntos).
   - Contador da Geral = `tabCounts.activeSales + tabCounts.activeSupport`.
   - Badge de não lidas na Geral = `queueUnread.sales + queueUnread.support` (mantém o pulse vermelho se houver suporte pendente).

2. **Tag "Suporte" no item da conversa**: para cada conversa com `queue === 'support'` na lista, exibir uma pílula vermelha pequena com ícone `LifeBuoy` + texto `Suporte` ao lado do nome do contato (ou abaixo, junto às outras tags). Conversas com `queue === 'sales'` ficam sem tag.

3. **Header/chip do topo** ("Conversas"): substituir o chip dinâmico Atendimento/Suporte/Finalizadas por algo neutro:
   - Aba Geral → chip cinza "Geral" (ou simplesmente remover o chip nessa aba para reduzir ruído).
   - Aba Finalizadas → mantém o chip "Finalizadas".

4. **Botão "→ Suporte / → Atendimento" no header da conversa**: continua existindo (é como o usuário marca/desmarca um lead como suporte). Mantém o texto atual.

5. **Não-admins**: comportamento atual preservado (continuam vendo Ativas/Finalizadas da fila do role). Sem mudança visual além de — opcionalmente — mostrar a tag vermelha de Suporte se um SDR estiver vendo a fila `all`. Como hoje não-admins têm fila fixa por role, fica sem efeito prático e nenhuma mudança é necessária.

## Não muda
- Schema do banco: coluna `queue` em `conversations` continua sendo a fonte da verdade.
- Hook `useConversationTabCounts` e `useQueueUnreadCounts` (já contam por queue; só somamos no front).
- Botão de mover entre filas, lógica de roteamento e RLS.

## Detalhes técnicos
- Tag visual: `bg-red-500/15 text-red-300 border border-red-500/40 px-1.5 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1`.
- Onde renderizar a tag: dentro do bloco `filteredConversations.map((chat) => ...)` no item da lista, junto ao nome.
- `mainTab` default: `'geral'` (sem mais ramificação por role no estado inicial dessa UI admin).
