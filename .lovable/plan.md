# Filtro "Somente suporte" na lista de conversas

Adicionar na aba Chat um filtro que mostra apenas as conversas com ticket de suporte ativo.

## Como vai funcionar

- Novo botão/chip **"Somente suporte"** ao lado dos filtros de Responsável e Departamento, na coluna de Conversas.
- Ao ativar, a lista mostra apenas conversas na fila de suporte (as que exibem o chip vermelho de motivo, ex. "Entrega", "Pedido/Pagamento").
- O chip mostra a contagem de conversas de suporte visíveis.
- Funciona combinado com as abas (Geral, Meus, Arquivados) e com os filtros de responsável/departamento existentes.
- Entra no botão "Limpar" junto com os outros filtros.

## Detalhes técnicos

- `src/components/ChatInterface.tsx`:
  - novo estado `onlySupport` (boolean);
  - no `filteredConversations`, descartar `chat.queue !== 'support'` quando `onlySupport` estiver ativo;
  - incluir `onlySupport` no cálculo de `filtersActive` e no reset do "Limpar";
  - renderizar o chip toggle na linha de filtros, usando `tabCounts.activeSupport` / `finishedSupport` (de `useConversationTabCounts`) conforme a aba ativa.

Nenhuma mudança de banco ou de backend.
