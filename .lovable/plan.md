
## Problema

Hoje o prompt da Donatella instrui a IA a "acionar o atendente humano" enviando uma **mensagem interna** no formato:

```
🔔 ATENDIMENTO NECESSÁRIO — ASSUNTO: ...
- Nome: ...
- Mensagem original: ...
```

Como **não existe nenhuma ferramenta real** de handoff registrada no `nina-orchestrator`, a IA acaba escrevendo essa mensagem como **texto normal** — e ela vai parar no WhatsApp do cliente. Resultado: o cliente vê o "alerta interno".

## Solução

Trocar essa mensagem-texto por uma **tool real de handoff**. Quando a IA decidir transferir, ela chama a tool — não escreve texto. A tool:
1. Marca a conversa como `status = 'human'` no banco.
2. Cria uma **notificação** na plataforma para os usuários.
3. Devolve para o cliente apenas a mensagem amigável (ex: "Vou chamar um especialista...").

E adicionar uma **central de notificações** (sino no topo da Sidebar) para os usuários verem em tempo real.

---

## Mudanças

### 1. Banco — nova tabela `notifications`

```sql
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,                -- 'handoff_requested', 'handoff_urgent', etc.
  title text not null,
  body text,
  conversation_id uuid,
  contact_id uuid,
  metadata jsonb default '{}',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
-- RLS: leitura/update por authenticated (single-tenant, padrão do projeto)
-- Adicionar à publication supabase_realtime
```

### 2. `nina-orchestrator` — nova tool `request_human_handoff`

Definir tool com parâmetros:
- `reason` (enum: `order_status`, `cancel_change`, `payment_invoice`, `complaint`, `qualified_lead`, `other`)
- `summary` (resumo curto para o atendente)
- `urgency` (`normal` | `urgent`)
- `customer_message_for_client` (mensagem amigável que será enviada ao cliente — ex: "Vou chamar um especialista...")

Quando a tool é chamada:
1. `UPDATE conversations SET status='human' WHERE id=...`
2. `INSERT INTO notifications (...)` com título estilo "Atendimento necessário — Maria Silva" e body contendo `summary` + última mensagem do cliente.
3. Retorna ao cliente **apenas** `customer_message_for_client` (substitui qualquer texto que a IA tenha gerado junto, para evitar vazamento do alerta interno).
4. Não chama mais a IA — encerra o turno.

Adicionar a tool ao array `tools` (junto com `create_appointment` etc.) sempre que estiver habilitada.

### 3. Atualizar prompts

No prompt **default** (`getDefaultSystemPrompt`) e instruir o usuário a atualizar o prompt **override** da Donatella:
- Substituir os blocos `<immediate_handoff_triggers>` e `<handoff_protocol>` para dizer:
  > "Quando precisar transferir para humano, **chame a ferramenta `request_human_handoff`**. NUNCA escreva mensagens internas como '🔔 ATENDIMENTO NECESSÁRIO' no texto da resposta — isso vai para o cliente."
- A IA passa a usar a tool em vez do template `🔔 ...`.

Como o prompt da Donatella está no banco (`system_prompt_override`), faremos um **UPDATE** automático nele removendo os blocos com `🔔` e adicionando a instrução de usar a tool.

### 4. Frontend — Central de notificações

- Novo hook `useNotifications`: lê `notifications` ordenadas por `created_at desc`, com realtime subscription, expõe `unreadCount`, `markAsRead`, `markAllAsRead`.
- Novo componente `NotificationsBell` (ícone `Bell` da lucide com badge de contagem) — colocado no topo da `Sidebar.tsx` (acima do menu) ou no header das páginas.
- Popover/Dropdown listando as notificações: título, tempo relativo, e botão "Abrir conversa" que navega para `/chat?conversation=<id>` e marca como lida.
- Toast (sonner) dispara automaticamente quando chega notificação nova via realtime.

### 5. Realtime

Adicionar `notifications` à publicação `supabase_realtime` na mesma migration.

---

## Detalhes técnicos

**Arquivos editados/criados:**
- `supabase/migrations/<novo>.sql` — tabela `notifications`, RLS, realtime, UPDATE no `system_prompt_override`.
- `supabase/functions/nina-orchestrator/index.ts` — definir `requestHandoffTool`, adicionar ao array de tools, processar `tool_calls` (atualizar conversa, inserir notificação, sobrescrever resposta com a mensagem amigável), atualizar `getDefaultSystemPrompt`.
- `src/hooks/useNotifications.ts` (novo).
- `src/components/NotificationsBell.tsx` (novo).
- `src/components/Sidebar.tsx` — montar o sino.
- `src/services/api.ts` — métodos `listNotifications`, `markNotificationRead`, `markAllNotificationsRead`.

**Fluxo final:**
```text
Cliente → "Meu pedido veio revirado"
  → Nina decide handoff
  → tool_call: request_human_handoff(reason=complaint, urgency=urgent, summary="...", customer_message_for_client="Vou chamar um especialista...")
  → orchestrator:
      • UPDATE conversations.status = 'human'
      • INSERT notifications (Atendimento urgente — Gabriel)
      • envia para o cliente APENAS "Vou chamar um especialista..."
  → Sino na plataforma pisca + toast aparece para todos os usuários
  → Atendente clica → vai direto para a conversa
```

Cliente nunca mais recebe o "🔔 ATENDIMENTO NECESSÁRIO".
