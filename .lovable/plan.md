
## Objetivo

Transformar o registro de chamados de suporte da Donatella numa estrutura formal, com **grupo + categoria fechados**, decisão explícita entre "resolvido pela IA" e "encaminhado a agente humano", responsável fixo de Produção, e um dashboard novo de Motivos de Suporte.

---

## 1. Banco de dados

Hoje o "chamado de suporte" não é uma linha própria — é a `conversation` com `queue='support'` + tags `motivo:*` + notificação. Isso limita relatórios. Vou criar uma tabela dedicada.

**Nova tabela `public.support_cases`:**

- `id uuid pk`
- `conversation_id uuid` (FK conversations)
- `contact_id uuid` (FK contacts)
- `grupo_suporte text NOT NULL` — CHECK em `('entrega','produto','pedido_pagamento','outros')`
- `categoria_suporte text NOT NULL` — CHECK nos 17 valores da lista fechada
- `requer_agente_humano boolean NOT NULL`
- `status_resolucao text NOT NULL` — CHECK `('resolvido_pela_ia','encaminhado_agente')`
- `responsavel_id uuid NULL` — FK `team_members(id)` (usuário de Produção)
- `causa text`, `resumo text`, `sentimento text`
- `order_number text`, `metadata jsonb`
- `created_at`, `updated_at` + trigger `updated_at`

CHECK composto extra: garante que `categoria_suporte` pertence ao `grupo_suporte` correto (função `public.support_category_belongs_to_group`).

RLS: `authenticated` acessa tudo (padrão single-tenant do projeto). GRANTs para `authenticated` e `service_role`.

Adicionar ao publisher `supabase_realtime`.

**Nova coluna em `nina_settings`:**
- `producao_user_id uuid` — referência ao `team_members.id` fixo de Produção (o `responsavel_id` default).

---

## 2. Lógica da Donatella

Editar `classifySupportIntake` em `supabase/functions/nina-orchestrator/index.ts`:

**a) Novo prompt** pedindo JSON com: `grupo`, `categoria`, `causa`, `resumo`, `sentiment`, `intent_side_channel` (enum: `none|rastreio|nota_fiscal`), `pede_humano` (bool), `customer_message`. Enums de `grupo` e `categoria` fechados, e no prompt a matriz grupo→categorias.

**b) Desvio pré-suporte:** se `intent_side_channel !== 'none'`, NÃO abrir caso. Tratar como Comercial:
- `rastreio` → chamar helper novo `fetchOrderStatusFromWoo(orderNumber)` (usa `wc-products`/Woo API já configurada) e responder direto ao cliente. Se não achar → responder que o time comercial retornará.
- `nota_fiscal` → responder que a NF é enviada automaticamente no momento da compra e pedir para o cliente checar o e-mail; oferecer reencaminhar via comercial se não achar.
Em ambos os casos: **sem `support_cases`**, sem transferência para Produção, sem alert WhatsApp; mantém `queue='sales'`.

**c) Aplicar `requer_agente_humano`:**
- default do mapa categoria→bool (só `elogio_feedback_positivo` e `duvida_geral_pos_compra` são `false`)
- forçar `true` se `pede_humano === true`, sentimento ∈ `frustrado|urgente`, ou fallback categoria `outro`.

**d) Se `requer_agente_humano === false`:**
- inserir `support_cases` com `status_resolucao='resolvido_pela_ia'`, `responsavel_id=null`
- Donatella responde direto (`customer_message`), conversa permanece com ela (não muda `queue`, não vai pra Produção)
- sem alerta WhatsApp

**e) Se `requer_agente_humano === true`:**
- ler `nina_settings.producao_user_id`; validar em `team_members` (status `active`). Se ativo → `responsavel_id = producao_user_id`; senão → `responsavel_id = null` + `notifications` `type='support_producao_missing'`.
- inserir `support_cases` com `status_resolucao='encaminhado_agente'`
- manter o fluxo atual: transfer para queue `support`, tags `motivo:<categoria>`/`sentimento:*`/`grupo:*`, system note, notification, `dispatchSupportAlert` (template WhatsApp já existente).

---

## 3. UI — Settings

Em `src/components/settings/AgentSettings.tsx`, dentro da seção de Alertas de Suporte, adicionar **Select "Responsável fixo de Produção"** carregado de `team_members` (status active), persistindo `producao_user_id`.

---

## 4. Dashboard — nova aba "Motivos de Suporte"

Novo componente `src/components/support/SupportReasonsDashboard.tsx`, plugado no `Dashboard.tsx` como **nova seção abaixo da atual "Principais motivos de suporte"** (não substituir a existente para não quebrar métricas antigas — a nova opera sobre `support_cases`).

Elementos, todos com paleta/cards já usados:

1. **Filtros:** período (7/30/90d/custom com date pickers) + segmented control `status_resolucao` (todos / resolvido_pela_ia / encaminhado_agente).
2. **Barras horizontais** por `categoria_suporte`, ordenado desc. Cor: verde se maioria dos casos daquela categoria foi resolvida pela IA, âmbar/rosa se encaminhada. Ícone `Bot` vs `User`.
3. **Cards de grupo** (4 cards ou donut com Recharts `PieChart`) — `entrega`, `produto`, `pedido_pagamento`, `outros` com contagem + %.
4. **Card KPI** "IA vs Humano" — 2 números grandes + barra 100% stacked.
5. **Card "Maior crescimento"** — compara período atual vs período anterior de mesmo tamanho; destaca a categoria com maior delta % (`TrendingUp`).
6. **Tabela** com colunas: data, categoria (label PT-BR), responsável (join `team_members.name`), resumo, sentimento (badge), status (badge). Paginação simples 20/pg.

Dados via `src/services/api.ts` — novas funções `fetchSupportCasesSummary(range, statusFilter)` e `fetchSupportCasesList(range, statusFilter, page)` que consultam `support_cases` + join `team_members`.

Labels em `src/lib/supportReasons.ts`: adicionar `SUPPORT_GROUPS` e `SUPPORT_CATEGORIES` (17 chaves com label PT-BR + grupo pai + `requerAgenteDefault`), reutilizados no orchestrator via constante compartilhada duplicada no edge function (não dá import cross-boundary).

---

## 5. Detalhes técnicos

**Arquivos criados:**
- `supabase/migrations/<ts>_create_support_cases.sql` — tabela + CHECK + trigger + coluna `producao_user_id` + publisher
- `src/components/support/SupportReasonsDashboard.tsx`
- `src/lib/supportCategories.ts` — matriz canônica

**Arquivos editados:**
- `supabase/functions/nina-orchestrator/index.ts` — `classifySupportIntake` (novo schema), branch de rastreio/NF, `insert support_cases`, resolução do `responsavel_id`
- `src/components/settings/AgentSettings.tsx` — select de responsável de Produção
- `src/components/Dashboard.tsx` — inclusão da nova seção
- `src/services/api.ts` — funções `fetchSupportCasesSummary`, `fetchSupportCasesList`
- `src/integrations/supabase/types.ts` — regenera automaticamente

**Sem alterações em:** `whatsapp-sender`, schema de `send_queue`, template HSM já criado, Meta config, `useConversations`, kanban.

**Compatibilidade:** casos abertos antes da migration continuam funcionando (nada quebra); apenas não aparecem no novo dashboard.

---

## Resultado esperado

Cada chamado passa a ter classificação estruturada e determinística, o responsável de Produção é preenchido automaticamente, dúvidas de rastreio/NF param de virar "suporte" desnecessariamente, e o dashboard mostra volume por categoria/grupo, % IA vs humano, crescimento e detalhe caso a caso.
