## Problema

Ao excluir um contato, o erro:
```
update or delete on table "messages" violates foreign key constraint "send_queue_message_id_fkey" on table "send_queue"
```
acontece porque `send_queue.message_id` referencia `messages.id` sem `ON DELETE`. Quando `deleteContact` apaga as mensagens da conversa, qualquer linha de `send_queue` apontando para elas bloqueia a operação.

## Plano

**1. Migration no banco** (`supabase--migration`)
- Alterar a FK `send_queue_message_id_fkey` para `ON DELETE SET NULL` (preserva histórico do envio, apenas perde o link).
- Pelo mesmo motivo, garantir o mesmo comportamento em outras FKs que apontam para `messages` se existirem (ex.: `messages.reply_to_id` self-ref → `ON DELETE SET NULL`).

**2. Reforço no `deleteContact` (`src/services/api.ts`)**
Antes de deletar `messages`, limpar/desvincular filas relacionadas à conversa:
- `send_queue`: deletar linhas onde `conversation_id IN (convIds)` (filas de envio do contato perdem sentido).
- `nina_processing_queue`: deletar onde `conversation_id IN (convIds)`.
- `message_processing_queue` e `message_grouping_queue`: deletar por `message_id IN (msgIds)` ou onde possível.

Isso evita futuros erros de FK e remove resíduos de processamento ligados ao contato.

**3. Validação**
- Após a migration, repetir a exclusão pelo modal "Excluir contato" e confirmar sucesso (sem erro de FK).
- Conferir no console que nenhuma das tabelas de fila retém linhas órfãs do contato.

## Fora do escopo
- Mudanças no fluxo de envio de mensagens.
- Soft delete de contatos.