## Objetivo

Expor a URL de entrega e o Secret do webhook WooCommerce diretamente na aba **Automações**, com a aparência de um "endpoint gerado pelo sistema" — sem que o usuário precise abrir Configurações → APIs.

O backend já existe (`wc-receiver` valida HMAC e grava em `webhook_events`, que dispara o `automation-runner`). Esta mudança é só de UI/UX.

## O que muda

### 1. Novo componente `src/components/automations/WebhookEndpointCard.tsx`
Card destacado mostrando:

- **Status** (Configurado / Aguardando Secret) com bolinha verde/âmbar
- **URL de entrega** (read-only) com botão "Copiar"
  - `${VITE_SUPABASE_URL}/functions/v1/wc-receiver`
- **Secret HMAC** com:
  - Input password + toggle olho
  - Botão **Gerar** (random 32 chars, igual ao WooWebhookSettings atual)
  - Botão **Salvar** (grava em `nina_settings.wc_webhook_secret`, single-tenant fallback `user_id IS NULL`)
- **Instruções rápidas** (3 passos curtos: WooCommerce → Avançado → Webhooks → colar URL/Secret/tópico)
- Link discreto "Testar agora" que abre o `SimulateWebhookModal` já existente

Reaproveita a lógica do `WooWebhookSettings.tsx` (carregar/salvar via `.maybeSingle()`).

### 2. `src/components/Automations.tsx`
- Renderizar `<WebhookEndpointCard />` no topo da aba **Regras**, acima da barra de busca.
- Quando ainda não houver Secret configurado, expandir o card por padrão; quando configurado, render compacto (URL + status, com "Mostrar detalhes" para expandir).

### 3. Sem mudanças em backend
- `wc-receiver`, `automation-runner` e tabela `nina_settings` já fazem o trabalho.
- Sem migrations, sem novas edge functions, sem novos secrets.

## Fora de escopo
- Webhook genérico (não-Woo) — usuário escolheu apenas mostrar o atual.
- Remover o card de Configurações → APIs (fica como atalho redundante, sem prejuízo).

## Detalhes técnicos

```text
Automações (aba Regras)
├── [novo] WebhookEndpointCard      ← URL + Secret + status + instruções
├── Busca
└── Tabela/cards de regras
```

Query single-tenant para ler/gravar o secret (segue padrão do projeto):
```ts
supabase.from('nina_settings')
  .select('id, wc_webhook_secret')
  .order('created_at', { ascending: true })
  .limit(1)
  .maybeSingle();
```
