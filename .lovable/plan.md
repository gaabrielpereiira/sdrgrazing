
# Separação Atendimento × Suporte com Roles e Filas

## Objetivo
Criar duas filas de conversas distintas no sistema:
- **Atendimento (SDR)** — fluxo atual com Donatella respondendo automaticamente.
- **Suporte** — 100% humano, isolado do time de SDR.

Cada usuário entra com login próprio e vê apenas a fila do seu time. Admin enxerga ambas.

---

## 1. Banco de dados

### 1.1 Roles de aplicação
Adicionar dois valores ao enum `app_role`:
- `sdr` — vê fila Atendimento
- `support` — vê fila Suporte

`admin` continua vendo tudo. `user` permanece como fallback (equivalente a sdr para retrocompatibilidade).

### 1.2 Classificação de fila na conversa
Adicionar coluna em `conversations`:
- `queue` (text, default `'sales'`) com valores permitidos `'sales' | 'support'`.
- Index em `(queue, last_message_at)` para listagem rápida.

A coluna é populada por:
- **IA**: `analyze-conversation` passa a sugerir mudança de fila quando detectar intenção de suporte (ex.: "problema com produto", "não funciona", "cancelar"). Se sugerir `support`, atualiza `conversations.queue`.
- **Manual**: botão na UI do chat para mover conversa entre filas (somente admin e quem tem acesso à fila destino).

### 1.3 Bloquear Nina na fila de suporte
`nina-orchestrator` checa `conversations.queue` antes de processar; se `support`, marca a entry como `completed` e não responde.

`message-grouper` continua agendando normalmente (a guarda fica no orchestrator para preservar idempotência).

---

## 2. Autenticação e roteamento

### 2.1 Cadastro
- Admin cria usuários via tela de Time atribuindo role (`sdr` ou `support`).
- Signup público continua desabilitado (já existe `system_settings.registration_enabled`).

### 2.2 Login → redirecionamento
Após login, ler role do usuário:
- `admin` → `/dashboard` (atual)
- `sdr` → `/chat?queue=sales`
- `support` → `/chat?queue=support`

### 2.3 Guarda de rotas
`ProtectedRoute` ganha prop opcional `allowedRoles`. Rotas restritas:
- `/dashboard`, `/pipeline`, `/contacts`, `/scheduling`, `/team`, `/templates`, `/settings` → admin + sdr
- `/chat` → todos autenticados (mas filtrado por role internamente)

Sidebar oculta itens fora do escopo do role (suporte só vê Chat e Notificações).

---

## 3. Camada de dados (frontend)

### 3.1 `useConversations`
Aceita `queueFilter: 'sales' | 'support' | 'all'`:
- `sdr` → força `'sales'`
- `support` → força `'support'`
- `admin` → default `'all'`, com seletor de aba

Aplica `.eq('queue', ...)` no `fetchConversations` e filtra payloads do realtime que não combinam com a fila ativa.

### 3.2 ChatInterface
- Tabs no topo apenas para admin: **Atendimento | Suporte**.
- Botão "Mover para Suporte / Atendimento" no header da conversa (admin sempre; sdr pode enviar para suporte; support pode devolver para atendimento).
- Indicador visual (badge colorida) na lista de conversas mostrando a fila quando admin está em "all".

### 3.3 Notificações
`useNotifications` filtra por fila correspondente ao role para não vazar conversa de outra área.

---

## 4. IA — classificação automática

`analyze-conversation` (que já roda a cada N mensagens):
- Adiciona ao prompt instrução: "Se a conversa indicar dúvida pós-venda, problema técnico, reclamação, cancelamento ou solicitação de suporte, retorne `should_route_to_support: true` com `reason`".
- Quando flag vier `true`:
  1. `UPDATE conversations SET queue='support', status='waiting' WHERE id=...`
  2. Cria notificação para o time de suporte.
  3. Insere registro em `deal_activities` ou `notifications` com a razão.

Reversa (suporte → vendas) só por ação manual.

---

## 5. RLS

Manter políticas permissivas atuais (single-tenant), mas adicionar policies que filtram por role para `conversations` e `messages`:
- `sdr` lê apenas `conversations.queue = 'sales'`.
- `support` lê apenas `conversations.queue = 'support'`.
- `admin` lê tudo.
- Mesma lógica para `messages` via subquery em `conversations`.

Helper `public.user_queue_access()` retorna o array de queues permitidos baseado em `has_role`.

---

## 6. UI Time (admin)

Tela `/team`:
- Selector de role (`Admin | SDR | Suporte`) ao convidar/editar membro.
- Coluna na lista mostrando role.
- Filtro por fila.

---

## Detalhes técnicos

### Migrações
1. `ALTER TYPE app_role ADD VALUE 'sdr';` + `'support';`
2. `ALTER TABLE conversations ADD COLUMN queue text NOT NULL DEFAULT 'sales' CHECK (queue IN ('sales','support'));`
3. Index `idx_conversations_queue_last_msg`.
4. Função `public.user_queue_access(_user_id uuid) RETURNS text[]`.
5. Substituir policies de SELECT em `conversations` e `messages` por versões que checam `queue = ANY(user_queue_access(auth.uid()))`. Manter ALL para admin.

### Edge functions tocadas
- `nina-orchestrator/index.ts` — guarda `if (conversation.queue === 'support') skip`.
- `analyze-conversation/index.ts` — novo campo no schema do LLM e UPDATE de queue.

### Frontend tocado
- `src/hooks/useAuth.tsx` — expor `role`.
- `src/components/ProtectedRoute.tsx` — `allowedRoles`.
- `src/App.tsx` — redirect pós-login conforme role; restrições por rota.
- `src/components/Sidebar.tsx` — ocultar itens por role.
- `src/hooks/useConversations.ts` — filtro `queue`.
- `src/components/ChatInterface.tsx` — tabs (admin), botão mover fila, badge.
- `src/components/Team.tsx` + `TeamConfigModal.tsx` — selector de role.
- `src/pages/Auth.tsx` — redirect baseado em role.

### Fora de escopo
- Migrar conversas históricas (todas ficam como `sales` por default, admin reclassifica manualmente conforme necessário).
- Métricas separadas no Dashboard (pode ser próxima iteração).
- Atribuição automática a um agente de suporte específico (round-robin).
