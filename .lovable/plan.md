## Objetivo

Dar à Nina acesso ao catálogo do WooCommerce em tempo real (produtos, busca, categorias) para recomendar itens reais durante a conversa, mantendo as credenciais protegidas.

A proposta segue o seu plano enviado, mas **adaptada à arquitetura atual do projeto**:

- Single-tenant: credenciais vivem em `nina_settings` (como já fazemos com `wc_webhook_secret`, ElevenLabs, etc.), **não em env vars** — assim continua funcionando após remix.
- Em vez de "injetar produtos no system prompt com regex de intenção", expor um **tool/function-call** que a própria Nina decide quando chamar. Mais preciso, mais barato e segue o padrão dos tools que já existem (`createAppointmentTool`, `requestHandoffTool` etc.).

---

## Mudanças

### 1. Banco — credenciais WooCommerce em `nina_settings`

Nova migration adicionando 3 colunas (todas opcionais):

- `wc_site_url text`
- `wc_consumer_key text`
- `wc_consumer_secret text`

Sem alterar RLS nem triggers. Reaproveita o registro global (`user_id IS NULL`) que já existe.

### 2. Edge function `wc-products` (nova)

`supabase/functions/wc-products/index.ts` + entrada `[functions.wc-products] verify_jwt = false` em `supabase/config.toml`.

Comportamento:

- Lê as credenciais de `nina_settings` (triple fallback igual ao `wc-receiver`: `user_id = null` → qualquer linha com chave preenchida).
- Aceita `{ action, search?, category?, limit? }` com as 4 ações do seu plano: `list`, `search`, `by_category`, `categories`.
- Faz `fetch` ao WooCommerce com `Authorization: Basic base64(key:secret)`.
- Retorna **payload formatado e enxuto** (id, name, price, on_sale, stock, categories, tags, short_desc, url) — exatamente como no seu plano.
- Erros padronizados: 503 quando não há credenciais, 502 quando o Woo responde erro, 400 para ação inválida.

### 3. Tool de produtos na Nina (`nina-orchestrator`)

Em `supabase/functions/nina-orchestrator/index.ts`:

- Adicionar `searchProductsTool` (function declaration) com parâmetros `query` (string opcional) e `category` (string opcional).
- Registrar o tool no array `tools` (já existente em ~linha 811), **gated por flag** `settings?.wc_products_enabled` para poder desligar.
- Implementar o handler: invoca `wc-products` (`action: "search"` se houver `query`, senão `list`), formata o resultado como texto curto e devolve para o modelo continuar a conversa.
- Nada de heurística de intenção (`/compr|quero|.../`). A Nina decide quando chamar — é o que tools são para.

### 4. UI — card de configuração

Novo `src/components/settings/WooProductsSettings.tsx`, renderizado em `ApiSettings.tsx` logo abaixo do `WooWebhookSettings`. Campos:

- URL do site (`https://seusite.com.br`)
- Consumer Key (`ck_...`)
- Consumer Secret (`cs_...`, com toggle mostrar/esconder)
- Toggle "Permitir que a Nina consulte produtos" → grava `wc_products_enabled` em `nina_settings`.
- Botão **Testar conexão** → chama `wc-products` com `action: "list", limit: 1` e mostra "OK — N produtos encontrados" ou o erro.

Salva tudo em `nina_settings` via `update()`, mesmo padrão do `WooWebhookSettings`.

### 5. (Opcional, fora do escopo desta etapa)

Os passos 4 e 5 do seu doc (`src/lib/woocommerce.ts` + `buildSystemPrompt` no front) **não serão implementados** porque a Nina roda 100% no backend (`nina-orchestrator`). Quem precisa do catálogo é a edge function, não o front.

Os "próximos passos" do seu doc (sync local, embeddings/RAG, webhook de produto) ficam para uma segunda fase.

---

## Detalhes técnicos

- `WooWebhookSettings.tsx` já faz `.maybeSingle()` sem `user_id` filter — o novo card segue o mesmo padrão, mantendo o comportamento single-tenant pós-remix.
- O tool da Nina retorna no máximo ~10 produtos por chamada, com `short_desc` cortado em ~200 chars, para não estourar contexto.
- Sem mudanças em realtime, deals, conversas ou no fluxo do WhatsApp.

## Arquivos

- novo: `supabase/migrations/<timestamp>_wc_products_credentials.sql`
- novo: `supabase/functions/wc-products/index.ts`
- editado: `supabase/config.toml` (entrada da função)
- editado: `supabase/functions/nina-orchestrator/index.ts` (tool + handler)
- novo: `src/components/settings/WooProductsSettings.tsx`
- editado: `src/components/settings/ApiSettings.tsx` (mount do card)
