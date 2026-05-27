## Diagnóstico

Olhando os logs e os eventos, o WooCommerce dispara `order.updated` **a cada micro-alteração** do pedido (mudança de status, nota interna, e‑mail enviado, pagamento, etc.). Hoje o `automation-runner`:

1. Roda **todas as regras** com `trigger_topic = order.updated` em **toda** chamada.
2. O filtro só compara o `status` **atual** do payload (`status eq processing`), sem saber se houve **transição**. Se o pedido fica em `processing` por horas, qualquer outro `order.updated` durante esse tempo dispara a regra de novo.
3. `cooldown_hours = 0` nas regras → nada barra o reenvio.
4. Não existe chave de idempotência por (regra + pedido + status-alvo), então a mesma transição pode logar várias vezes (ex.: webhook reenviado pelo Woo, retry, race).
5. A regra `Pedido atualizado | Retirado` casa com `status = retirado-entrega`, mas a mensagem "Pedido feito" (`PEDIDO_FEITO`) que aparece no print é da regra `Pedido atualizado | Pago` — ela continua disparando porque o status do payload anterior já era `processing`/`completed` e o webhook foi reentregue, dando a sensação de "mensagem errada para um pedido que já foi atualizado para retirado".

## Objetivo

Garantir que cada regra **dispare uma única vez por transição real de status** de cada pedido, e nunca rode em re‑entregas/duplicatas do mesmo webhook.

## Mudanças

### 1. Idempotência por evento (proteção total contra reenvio)

Adicionar uma chave única no `webhook_events` para a combinação `source + topic + external_id`, onde `external_id` é extraído do payload (`payload.id` para pedidos Woo). No `wc-receiver`:

- Calcular `external_id` antes do insert.
- Inserir com `onConflict: (source, topic, external_id, event_signature)` retornando o evento (novo ou existente).
- `event_signature` = hash curto de `(status, date_modified)` do payload, para diferenciar updates reais de reenvios idênticos.
- Se o conflito ocorrer e o evento já existir com `processed = true` e mesma assinatura → responder 200 sem reprocessar.

### 2. Idempotência por regra/transição

Nova tabela `automation_executions`:

```text
rule_id           uuid
external_id       text   -- ex: woo_order_id como texto
target_signature  text   -- ex: "status:retirado-entrega"
executed_at       timestamptz default now()
UNIQUE (rule_id, external_id, target_signature)
```

No `automation-runner`, antes de executar a ação:

- Montar `target_signature` a partir das condições do filtro com operador `eq` sobre campos "de transição" (ver §3).
- Tentar `insert` em `automation_executions`. Se vier `23505` (já existe) → logar `skipped` com `reason: already_executed_for_transition` e parar.
- Só executar a ação após o insert bem-sucedido.

Isso garante: mesmo que o Woo reentregue o webhook 10 vezes ou outro `order.updated` chegue com o mesmo status, a regra roda **uma vez só** por (pedido, status-alvo).

### 3. Filtro por transição real (status mudou para X)

Hoje as condições só olham o valor atual. Adicionar:

- Novo operador `changed_to` no `AutomationFormModal` (UI) e em `compareValues` do runner.
- Para `order.*`: o runner busca o registro anterior em `public.orders` (antes do upsert) e compara `prev.status` vs `payload.status`. A condição `status changed_to "retirado-entrega"` só passa se `prev.status !== "retirado-entrega"` **e** `payload.status === "retirado-entrega"`.
- Mover o `upsertOrderFromEvent` para depois da avaliação das regras (ou ler o estado anterior antes de chamar o upsert).

### 4. Migrar regras existentes

Migration de dados convertendo as 3 regras `order.updated` atuais (`Pago`, `Retirado`, `Mensagem pedido feito`) do operador `eq` em `status` para o novo operador `changed_to`. Comportamento humano-visível continua igual, mas só dispara na transição.

### 5. UI

Em `AutomationFormModal.tsx`, ao escolher o campo `status` num trigger `order.updated`, mostrar como operadores: `igual a`, `mudou para` (default sugerido), `contém`. Texto de ajuda curto explicando que "mudou para" só dispara quando o pedido entra naquele status.

### 6. Limpeza de duplicatas anteriores (opcional, recomendado)

Migration única que marca como `processed = true` os `webhook_events` duplicados antigos por `(topic, payload->>id, payload->>status)` mantendo só o mais antigo, para evitar reprocessamento se alguém clicar em "reprocessar".

## Arquivos tocados

- `supabase/migrations/<new>_automation_idempotency.sql` — tabela `automation_executions`, índice único em `webhook_events`, ajuste de regras existentes.
- `supabase/functions/wc-receiver/index.ts` — calcular `external_id`/`event_signature`, insert idempotente.
- `supabase/functions/automation-runner/index.ts` — operador `changed_to`, leitura do status anterior, guard `automation_executions`, mover upsert.
- `src/components/AutomationFormModal.tsx` — operador `changed_to` no select de operadores.
- `src/hooks/useAutomations.ts` — tipos do operador, se houver enum.

## Detalhes técnicos

- `event_signature` = `sha1(status + '|' + date_modified)` truncado em 16 chars, calculado no `wc-receiver`.
- `automation_executions.target_signature`:
  - Se houver condições `changed_to` → join `field=value` (`status=retirado-entrega`).
  - Caso contrário (regras sem transição) → `external_id` puro + `rule_id` ainda dá idempotência por pedido; usar `event_id` como sufixo se a regra for explicitamente "rodar em todo evento".
- Não alterar o fluxo do `whatsapp-sender`; a deduplicação acontece antes da entrada na `send_queue`.
- Manter retries existentes (`scheduleRetry`) intactos; eles continuam funcionando porque a 2ª tentativa cai na proteção `automation_executions` se a 1ª já tinha enfileirado.
