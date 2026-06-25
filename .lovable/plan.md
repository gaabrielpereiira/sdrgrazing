## Limpar tags ao arquivar conversa

Quando uma conversa for arquivada/finalizada (`endConversation` em `src/services/api.ts`, ~linha 2291), além de marcar `is_active = false` e `status = 'paused'`, também limpar as tags da conversa.

### Mudança
Em `src/services/api.ts`, dentro de `endConversation`:
- Atualizar `conversations.tags = []` no mesmo `update` que define `is_active: false, status: 'paused'`.
- Em `reopenConversation`, manter como está (não recoloca tags antigas — se cliente voltar a falar de suporte, o fluxo de triagem da Donatella re-classifica e re-aplica `motivo:*` / `sentimento:*`).

### Escopo
- Apenas tags da própria conversa (`conversations.tags`).
- Não mexer em tags do contato (`contacts.tags`), pois são persistentes do lead.

### Pergunta de confirmação
Confirma que devo limpar **todas** as tags da conversa ao arquivar (incluindo `motivo:*`, `sentimento:*` e qualquer tag manual), ou prefere limpar **apenas** as tags de suporte (`motivo:*` e `sentimento:*`) e preservar tags manuais?