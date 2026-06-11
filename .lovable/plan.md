## Objetivo

1. Tocar som de notificação quando a Donatella transferir para humano.
2. Garantir que a IA considere o horário comercial ao decidir transferir (e priorizar handoff fora do horário).

## Diagnóstico

- `supabase/functions/nina-orchestrator/index.ts` cria notificações `handoff_requested` / `handoff_urgent` quando a tool `request_human_handoff` é chamada, mas **não injeta o horário comercial nem o horário atual no contexto da IA**. A IA decide “no escuro”, então pode transferir mesmo fora do expediente sem qualquer regra explícita.
- `nina_settings` já tem `timezone`, `business_hours_start`, `business_hours_end`, `business_days` (configuráveis no onboarding/Settings), mas esses campos nunca chegam ao prompt.
- `src/hooks/useNotifications.ts` recebe novas notificações via Realtime e dispara um `toast`, mas **não toca som**.

## Mudanças

### 1. Som de notificação no front (`src/hooks/useNotifications.ts`)

- Adicionar um asset `src/assets/notification.mp3` (curto, discreto). Pré-instanciar `new Audio(notificationUrl)` no escopo do módulo para evitar bloqueio de gesto.
- No handler de `INSERT` da subscription:
  - Se `n.type === 'handoff_urgent'` → tocar som (volume um pouco maior).
  - Se `n.type === 'handoff_requested'` → tocar mesmo som em volume normal.
  - Demais tipos: sem som (mantém só toast).
- Envolver `audio.play()` em `.catch()` para silenciar erros de autoplay quando a aba ainda não recebeu gesto; nesse caso apenas log no console.
- Opcional: respeitar `document.visibilityState` — sempre tocar, mas só uma vez por notificação (já garantido por `seenIdsRef`).

### 2. Horário comercial na IA (`supabase/functions/nina-orchestrator/index.ts`)

- Ler de `nina_settings` (já carregado no orchestrator) os campos `timezone`, `business_hours_start`, `business_hours_end`, `business_days`.
- Calcular `nowInTz`, `isWithinBusinessHours` usando `Intl.DateTimeFormat` com o timezone configurado (evita `new Date(string)` ambíguo).
- Injetar no system prompt um bloco curto, ex.:
  ```
  Contexto operacional:
  - Agora: quinta-feira 14:32 (America/Sao_Paulo)
  - Horário de atendimento humano: seg-sex, 09:00–18:00
  - Status atual: DENTRO/FORA do expediente
  ```
- Acrescentar regra de comportamento:
  - **Dentro do expediente**: usar `request_human_handoff` normalmente para casos que exigem humano.
  - **Fora do expediente**: ainda pode chamar `request_human_handoff` (a notificação interna deve ser criada), mas a `customer_message_for_client` precisa avisar que o atendimento humano retorna no próximo horário comercial (informar dia/horário). Não prometer retorno imediato.
- Passar o status atual no metadata da notificação (`outside_business_hours: true|false`) para futura priorização/log.

### 3. Sem mudanças de schema

- Tudo já existe em `nina_settings`. Sem migration nova.

## Arquivos editados

- `src/hooks/useNotifications.ts`
- `src/assets/notification.mp3` (novo asset — preciso confirmar com você, ver pergunta abaixo)
- `supabase/functions/nina-orchestrator/index.ts`

## Pergunta antes de implementar

- O som: posso usar um “ding” padrão curto (mp3 leve, ~20kb) embutido no app, ou você tem um arquivo específico que prefere subir depois?
- Quer som diferente para `handoff_urgent` vs `handoff_requested`, ou o mesmo som basta?