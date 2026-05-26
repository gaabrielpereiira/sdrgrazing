## Objetivo
Fazer a Donatella sugerir produtos do WooCommerce ativamente e **sempre enviar o link** (URL do produto) junto com nome, preço e descrição curta.

## Diagnóstico
A infra já está pronta:
- `wc-products` edge function retorna `url` (permalink), `name`, `price`, `short_desc`, `on_sale`, `stock`.
- `nina-orchestrator` registra a tool `search_products` quando `nina_settings.wc_products_enabled = true`.
- A tool é chamada, resultado volta pro modelo, e a IA responde em texto.

O que falta é **instrução clara** pra ela: (a) usar a ferramenta proativamente em qualquer conversa sobre produto e (b) sempre incluir o link na resposta.

## Mudanças

### 1. `supabase/functions/nina-orchestrator/index.ts` — tool description (linha 139)
Reforçar comportamento esperado:
- Usar a tool em qualquer menção a produto/preço/recomendação, mesmo que o cliente não peça link explicitamente.
- Nunca inventar produtos, preços ou URLs.

### 2. `supabase/functions/nina-orchestrator/index.ts` — `instructions_for_assistant` no sucesso (linha 937-938)
Trocar a frase atual por instruções específicas:
- Sugerir 1–3 produtos mais relevantes (não despejar a lista toda).
- Para cada produto incluir: **nome, preço (em R$), 1 linha de benefício e o link `url` em texto puro** (sem markdown — WhatsApp não renderiza `[]()`).
- Se o cliente pediu algo específico e nada bateu, dizer isso e oferecer categorias próximas.
- Manter tom da persona já configurada no system prompt.

### 3. `supabase/functions/nina-orchestrator/index.ts` — `buildEnhancedPrompt` (linha 1601)
Quando `wc_products_enabled` estiver ligado, anexar um bloco curto ao system prompt:
> "CATÁLOGO: Você tem acesso ao catálogo real da loja via `search_products`. Use proativamente sempre que houver interesse em produto, sugestão, comparação ou disponibilidade. Em toda recomendação inclua o link do produto."

Para isso a função passa a aceitar `settings` como parâmetro e a chamada na linha 822 é ajustada.

## Fora de escopo
- Não mudar UI de Settings (já existe `WooProductsSettings`).
- Não mudar `wc-products` (já devolve `url`).
- Não tocar em fluxo de mensagens, dedupe, agendamento, handoff.
- Não enviar imagem do produto (só link/texto) — se quiser depois, é outra task.

## Pré-requisito do usuário
Em **Configurações → APIs → WooCommerce — Catálogo de Produtos**, confirmar que o switch *"Permitir que a Nina consulte produtos durante as conversas"* está **ligado e salvo**. Sem isso, a tool não é registrada e a IA não consegue ver o catálogo.
