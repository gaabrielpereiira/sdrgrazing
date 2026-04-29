## Objetivo

Quando uma mensagem enviada falhar definitivamente (após esgotar as tentativas no `whatsapp-sender`), exibir um alerta vermelho ao lado da mensagem no chat com o motivo do erro, em vez do checkmark cinza.

## Mudanças

### 1. `supabase/functions/whatsapp-sender/index.ts` — propagar falha para `messages`

Hoje, quando o envio falha definitivamente (3ª tentativa), apenas `send_queue` é marcada como `failed`. A linha em `messages` continua com `status='processing'` (mensagem humana) ou nem é criada (Nina). O frontend não consegue indicar a falha.

No bloco `catch` do loop (linhas ~167-186), após o `update` em `send_queue`, quando `!shouldRetry`:

- **Se `item.message_id` existe** (mensagem humana — registro já criado pelo `sendMessage` da API): fazer `UPDATE messages SET status='failed', metadata = metadata || { error_message, failed_at }` para esse ID.
- **Se `item.message_id` é null** (mensagem Nina — registro só seria criado em caso de sucesso): fazer `INSERT` com `status='failed'`, mesmo `content`/`type`/`from_type`/`media_url` do item da fila e `metadata.error_message` + `metadata.failed_at`. Isso garante que a mensagem aparece no histórico marcada como não entregue.

O `errorMessage` já é capturado no catch — vamos persistir a string crua (vinda do `responseData.error?.message` do WhatsApp) em `metadata.error_message`.

### 2. `src/types.ts` — refletir status `failed` no UI

- Estender `UIMessage.status` de `'sent' | 'delivered' | 'read'` para incluir `'failed'`.
- Adicionar campo opcional `errorMessage?: string | null` em `UIMessage`.
- Em `transformDBToUIMessage`: quando `msg.status === 'failed'`, retornar `status: 'failed'` e popular `errorMessage` a partir de `msg.metadata?.error_message`.
- Atualizar `mapDBMessageStatus` para preservar `'failed'`.

### 3. `src/components/ChatInterface.tsx` — indicador visual

No bloco que renderiza os ícones de status (linhas ~1014-1027), adicionar uma ramificação para `msg.status === 'failed'`:

- Substituir o `Check`/`CheckCheck` por um `AlertCircle` vermelho (`text-red-500`) com `Tooltip` (já há `tooltip` no projeto) ou simples `title=` mostrando "Não entregue" + o `msg.errorMessage` quando disponível.
- Acrescentar um pequeno texto inline abaixo do timestamp: `"Não entregue"` em vermelho-claro (`text-red-400 text-[10px]`) seguido do motivo entre parênteses se `errorMessage` existir e for curto (limitar a ~80 chars com truncate via `title`).
- Adicionar `AlertCircle` à lista de imports do `lucide-react` no topo do arquivo.

### 4. Bolha da mensagem (toque visual)

Na `div` da bolha (área `isOutgoing` que já tem classes condicionais por `fromType`), adicionar uma borda vermelha sutil quando `msg.status === 'failed'`: `ring-1 ring-red-500/40`. Mantém o estilo consistente com o tema escuro existente (sem cores hardcoded fora dos tokens — usaremos as classes `red-500/red-400` que já são usadas em outros lugares como `LostReasonModal`).

## Observações técnicas

- Não exige migration: o enum `message_status` já inclui `'failed'`, e `metadata` já é `jsonb` em `messages`.
- Realtime: o `UPDATE` em `messages` já é coberto pelo handler `UPDATE` em `useConversations.ts`, então a UI atualiza sozinha quando a falha for registrada.
- Não mexer em retries em si — apenas refletir o estado final.
- Mensagens temporárias (`temp-*`) seguem mostrando o check normal; só quando o backend marca `failed` é que o alerta aparece.
