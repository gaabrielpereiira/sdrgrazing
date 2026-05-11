## Bug
Ao trocar para a aba "Suporte", continuam aparecendo conversas de Atendimento. Causa: em `useConversations.fetchConversations`, a lógica de merge mantém "órfãos" (conversas presentes no estado anterior que não vieram no novo fetch). O filtro de órfão considera apenas `isActive`, ignorando `queue`. Quando o admin muda de Atendimento → Suporte, todas as conversas de `sales` ficam preservadas como órfãos.

## Correção
Em `src/hooks/useConversations.ts`, no `fetchConversations`:
- Filtrar órfãos também por `queue`: descartar conversas cujo `queue` não bate com `queueFilter` (quando ele não é `'all'`).
- Quando `queueFilter` mudar, qualquer conversa do estado anterior que não pertença à fila ativa deve ser removida.

Trecho alvo (linha 164):
```ts
const orphans = prev.filter(c =>
  !freshIds.has(c.id) &&
  c.isActive === isActiveFilter &&
  (queueFilter === 'all' || (c as any).queue === queueFilter)
);
```

Verificar também que objetos `UIConversation` carregam o campo `queue`. Se `transformDBToUIConversation` ainda não propaga `queue`, adicionar o campo ali (lendo de `conversation.queue`) para que o filtro de órfãos funcione.

## Validação
- Logar como admin, abrir Atendimento (lista cheia) → trocar para Suporte → lista deve ficar vazia (DB hoje não tem conversas com `queue='support'`).
- Mover uma conversa para Suporte pelo botão do header → some de Atendimento e aparece em Suporte.
- Nenhum efeito colateral em SDR/Support puros (que já recebem `queueFilter` fixo).

## Fora de escopo
Roteamento automático pela IA (`analyze-conversation`) — pendente, sem relação com este bug.