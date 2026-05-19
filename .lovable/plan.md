## Problema

Usuários não-admin (ex.: Tais) ainda veem a UI antiga do chat:
- Abas **"Ativas | Finalizadas"** em vez de **"Geral | Finalizadas"**
- Chip de fila no topo mostrando **"Atendimento"** (ou "Suporte") em vez de **"Geral"**
- Conversas da fila de **Suporte** não aparecem visualmente diferenciadas

A busca de dados já está correta (`queueForFetch = 'all'`), então as conversas de suporte JÁ vêm do banco — o problema é só visual: o componente ainda tem dois ramos de UI (admin vs não-admin) e o ramo não-admin é o "antigo".

## O que mudar

Arquivo único: `src/components/ChatInterface.tsx`

1. **Remover a ramificação admin/não-admin nas abas.** Todos os usuários autenticados passam a usar o mesmo bloco `Tabs` de admin: **Geral | Finalizadas**, controlado por `mainTab` (`'geral' | 'finalizadas'`).
   - Apagar o estado `nonAdminChatTab` e o bloco `else` que renderiza "Ativas | Finalizadas" (linhas ~1152–1168).
   - `chatTab` deriva sempre de `mainTab`.

2. **Atualizar o chip de fila no header** (linhas ~1104–1120): remover os ramos `effectiveQueue === 'support'` e o fallback "Atendimento". O chip vira só dois estados:
   - `mainTab === 'finalizadas'` → "Finalizadas" (cinza)
   - caso contrário → "Geral" (ciano) com ícone `Bot`

3. **Limpeza de variáveis órfãs:** após o passo 2, `effectiveQueue` só é usado em outros pontos do arquivo (botões "Mover para Atendimento" etc.). Manter `effectiveQueue = 'all'` para não quebrar essas branches — elas já caem no fallback correto.

4. **Contadores das abas:** manter `tabCounts.activeSales + tabCounts.activeSupport` (Geral) e `tabCounts.finishedSales + tabCounts.finishedSupport` (Finalizadas) — soma de ambas as filas, como já está no ramo admin.

5. **Não mudar lógica de fetch:** `queueForFetch` continua `'all'`, `useConversations` já retorna tudo, `useConversationTabCounts` já calcula totais. Nenhuma mudança em hooks ou backend.

## Resultado esperado

Tais (e qualquer outro usuário não-admin) verá exatamente a mesma UI do admin: abas **Geral | Finalizadas**, chip **"Geral"**, e as conversas de suporte aparecerão misturadas na aba Geral (identificadas pela tag de fila já existente em cada card de conversa).
