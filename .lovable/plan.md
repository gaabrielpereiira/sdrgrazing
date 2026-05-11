## Bug: Nina envia a mesma resposta 2x (ex.: "Olá! Como posso ajudar você hoje? 😊" duplicado)

### Diagnóstico (confirmado no banco)

Cada balão duplicado vem do **mesmo `response_to_message_id`** com `chunk_index:0` repetido. Consultando `nina_processing_queue`:

- Mensagem `5049ca70…` → 2 entradas na fila criadas com 4ms de diferença, ambas processadas → 2 respostas
- Mensagem `95335c1b…` → 2 entradas com 20ms de diferença → 2 sequências completas de 4 chunks (8 mensagens enviadas em vez de 4)
- Mensagem `ddf8151a…` → **3 entradas** com ~30ms de diferença → 3 respostas

Ou seja: a mesma mensagem do cliente está sendo enfileirada várias vezes para a Nina, e a Nina processa cada entrada separadamente (o claim com `FOR UPDATE SKIP LOCKED` é correto, mas as linhas são duplicadas).

### Causa-raiz

`supabase/functions/message-grouper/index.ts` (linhas 162-205) tenta deduplicar com:

```ts
const { data: existingQueue } = await supabase
  .from('nina_processing_queue')
  .select('id').eq('message_id', lastDbMessage.id).maybeSingle();
if (!existingQueue) { /* insert */ }
```

Esse padrão **check-then-insert** tem race condition. Quando o webhook recebe rajada de mensagens, o `message-grouper` é disparado várias vezes em paralelo (cada `waitUntil` do whatsapp-webhook + cada `scheduleNextProcessing`). Duas execuções concorrentes leem a fila ao mesmo tempo, ambas não encontram nada, ambas inserem → 2 linhas idênticas → 2 chamadas à Nina → 2 respostas iguais ao cliente.

Não há `UNIQUE` em `nina_processing_queue.message_id` no schema, então o banco aceita as duplicatas silenciosamente.

### Correção

**1. Migration**: adicionar índice único parcial em `nina_processing_queue(message_id)` para mensagens ainda processáveis (qualquer linha não-failed):

```sql
CREATE UNIQUE INDEX IF NOT EXISTS nina_processing_queue_message_id_unique
  ON public.nina_processing_queue(message_id)
  WHERE status IN ('pending','processing','completed');
```

Isso garante no banco que não pode existir mais de uma entrada para a mesma `message_id`. Falhas (`failed`) ficam de fora para permitir re-tentativas reais futuras.

**2. `supabase/functions/message-grouper/index.ts`**: trocar o check-then-insert por insert idempotente. Tratar erro de unique-violation (`code === '23505'`) como sucesso silencioso ("já enfileirado por outra execução"). Continuar disparando o orchestrator só quando a inserção realmente acontecer (não disparar se foi conflito — a outra execução já disparou).

**3. Defesa extra no `nina-orchestrator/index.ts`** (linha 166, dentro do loop `for (const item of queueItems)`): antes de chamar `processQueueItem`, verificar se já existe alguma mensagem com `metadata->>'response_to_message_id' = item.message_id` E `from_type = 'nina'` criada nos últimos 60s. Se existir, marcar a entrada como `completed` e pular. Isso protege contra qualquer outra fonte futura de duplicação (ex.: re-tentativa após timeout) e também limpa o histórico de duplicatas que estiverem ainda enfileiradas.

### Como validar

- Após deploy, simular rajada (3 mensagens do mesmo número em <1s via `simulate-webhook`) e confirmar que `nina_processing_queue` tem só **1 linha por `message_id`** e o cliente recebeu **uma única resposta**.
- Consultar a Cintia/Ana Beatriz nos próximos atendimentos e confirmar que não há mais `chunk_index:0` repetido para o mesmo `response_to_message_id`.

### Arquivos afetados

- Migration nova (índice único)
- `supabase/functions/message-grouper/index.ts` — insert idempotente
- `supabase/functions/nina-orchestrator/index.ts` — guard de "resposta já existe"

### Fora do escopo

- Limpar duplicatas históricas (não interfere com novas respostas)
- Revisar polling/grouper scheduling (não é a causa, só amplifica)
