## Objetivo
Adicionar um **atraso (delay)** opcional nas regras de automação. Quando os filtros baterem, a execução fica agendada para X tempo depois (ex.: 24h), e só então a ação roda — desde que a condição ainda faça sentido.

## Como vai funcionar (visão do usuário)

No modal de criar/editar automação aparece um novo bloco **"Aguardar antes de executar"** entre os filtros e a ação:

- Campo numérico + seletor de unidade: **minutos / horas / dias** (0 = executa imediatamente, comportamento atual)
- Toggle **"Cancelar se o status mudar antes do prazo"** (ex.: regra "Pago há 24h" não dispara se o pedido for cancelado nesse meio tempo)
- Texto de ajuda: *"A ação será executada X depois do gatilho. Pedidos cuja condição deixe de valer antes do prazo serão ignorados."*

Na lista de regras, regras com delay mostram um badge **"⏱ 24h"** ao lado do nome.

Nos **Logs de automação** aparece o novo status **"Agendado"** com a hora prevista, e quando roda vira **"Sucesso"** / **"Cancelado"** (com motivo: status mudou, pedido removido, etc.).

## Como vai funcionar (técnico)

### 1. Schema
Migration adicionando à `automation_rules`:
- `delay_minutes int not null default 0`
- `cancel_if_changed boolean not null default true`

Nova tabela `automation_scheduled` (fila de execuções pendentes):
- `rule_id`, `event_id`, `order_id` (nullable), `contact_id` (nullable)
- `payload jsonb` (snapshot do evento que disparou)
- `status_at_schedule text` (status do pedido no momento do agendamento, para checar mudança)
- `scheduled_for timestamptz`
- `status text` (`pending` | `executed` | `cancelled`)
- `cancel_reason text`
- GRANTs + RLS padrão do projeto

### 2. Edge function `automation-runner` (modificada)
Quando uma regra bate e tem `delay_minutes > 0`:
- Em vez de executar a ação, insere linha em `automation_scheduled` com `scheduled_for = now() + delay`
- Registra log com status `scheduled`
- Mantém a checagem de idempotência (`automation_executions`) para não agendar duas vezes a mesma transição

### 3. Nova edge function `automation-scheduler`
Roda a cada minuto via `pg_cron` + `pg_net` (padrão já usado no projeto). Para cada linha `pending` com `scheduled_for <= now()`:
1. Se `cancel_if_changed = true`: refaz a leitura do pedido/contato e compara com `status_at_schedule`. Se mudou → marca `cancelled` com motivo.
2. Caso contrário: executa a mesma ação que o `automation-runner` executaria (mensagem WhatsApp, update CRM, notificação, webhook externo) reaproveitando o helper já existente.
3. Atualiza status para `executed` ou `failed` e grava `automation_logs`.

### 4. Frontend
- `src/hooks/useAutomations.ts`: adicionar `delay_minutes` e `cancel_if_changed` na interface `AutomationRule`.
- `src/components/AutomationFormModal.tsx`: novo bloco de UI com input numérico + select de unidade + switch de cancelamento. Converte para minutos no save.
- `src/components/Automations.tsx`: badge "⏱ Xh" nas regras com delay.
- `src/components/AutomationLogsModal.tsx`: exibir status `scheduled` / `cancelled` com horário e motivo.

## Pontos a confirmar
1. Quando o status muda antes do prazo, devo **sempre cancelar** (mais seguro) ou quer que isso seja **opcional** por regra (toggle como descrito acima)? *Sugestão: opcional, default ligado.*
2. O delay máximo deve ter limite (ex.: 30 dias) ou pode ser qualquer valor?
