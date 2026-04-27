# Plano: Imagens no chat + Finalizar/Reabrir conversas

## Problema 1 — Imagens não carregam

Hoje, quando o WhatsApp envia uma imagem, o webhook (`supabase/functions/whatsapp-webhook/index.ts`) só guarda o `media_id` da Meta no `metadata`. O campo `media_url` da tabela `messages` nunca é preenchido, então no frontend `<img src={msg.mediaUrl} />` fica vazio e cai no fallback "Erro Imagem".

A Graph API só entrega o binário da mídia se autenticarmos com o `WHATSAPP_ACCESS_TOKEN`. Precisamos baixar a imagem e republicar em uma URL pública do Storage.

## Problema 2 — Finalizar conversa manualmente

A tabela `conversations` já tem `is_active` e `fetchConversations` já filtra `is_active = true`. Falta:
- Botão de finalizar no chat
- Uma aba para ver conversas finalizadas (com opção de reabrir)
- Continuar podendo abrir e ler o histórico delas

## Mudanças

### 1. Storage e backend para mídia

- **Migration**: criar bucket público `whatsapp-media` com policies de leitura pública e escrita para `service_role` / authenticated.
- **Nova edge function `download-whatsapp-media`** (verify_jwt = false):
  - Recebe `{ message_id, media_id, mime_type }`.
  - Chama `GET https://graph.facebook.com/v20.0/{media_id}` com Bearer do `WHATSAPP_ACCESS_TOKEN` para obter a URL temporária.
  - Faz `fetch` da URL com o mesmo Bearer (chunk-based para não estourar memória).
  - Faz upload em `whatsapp-media/{conversation_id}/{message_id}.{ext}` via service role.
  - Atualiza `messages.media_url` com a URL pública (`getPublicUrl`).

- **Webhook (`whatsapp-webhook/index.ts`)**: para `image` (e também `video`/`document` por consistência), após criar a `messages`, dispara a função `download-whatsapp-media` com o `media_id`. Mesma estratégia já usada para áudio.

- **Frontend (`ChatInterface.tsx`)**: o `<img>` já lê `msg.mediaUrl`. Sem mudança lógica — só ajustar o fallback para mostrar um placeholder mais amigável e exibir um spinner enquanto `mediaUrl` ainda é `null` (mensagem recém-recebida com download em andamento). O Realtime UPDATE da mensagem já está implementado e vai propagar a URL quando o download terminar.

- Mesma lógica vale para `video` e `document` — exibir link/thumbnail simples para document/video.

### 2. Finalizar e reabrir conversas

- **`src/services/api.ts`**:
  - `fetchConversations(opts?: { active?: boolean })` — quando `active === false`, busca `is_active = false`. Default mantém comportamento atual (`true`).
  - `endConversation(conversationId)` — `update { is_active: false, status: 'paused' }`.
  - `reopenConversation(conversationId)` — `update { is_active: true }`.

- **`src/hooks/useConversations.ts`**:
  - Aceitar `{ active }` como parâmetro do hook e repassar para `api.fetchConversations`.
  - Expor `endConversation` e `reopenConversation` (com optimistic update + toast).
  - Realtime UPDATE de conversation já atualiza `isActive` no estado; quando uma conversa é finalizada na aba "Ativas", removemos do array local; quando reaberta na aba "Finalizadas", também.

- **`src/components/ChatInterface.tsx`**:
  - Adicionar `Tabs` no topo do painel esquerdo com **"Ativas"** e **"Finalizadas"**.
  - Cada aba usa o mesmo componente, alternando o filtro do hook.
  - No header do chat, novo botão **"Finalizar conversa"** (ícone `XCircle`) com `AlertDialog` de confirmação. Ao confirmar: chama `endConversation`, mostra toast e a conversa some da aba ativa.
  - Na aba "Finalizadas", o input de mensagem fica desabilitado e aparece um banner "Conversa finalizada" com botão **"Reabrir conversa"**.
  - Conversas finalizadas continuam clicáveis e mostram todo o histórico, mídia, notas e tags normalmente.

## Detalhes técnicos

```text
WhatsApp Webhook
  └─> insert messages (media_url=null, metadata.media_id=...)
        └─> invoke download-whatsapp-media (async)
              ├─> GET graph.facebook.com/{media_id}  -> url temp
              ├─> GET url temp (Bearer)              -> binary
              ├─> upload storage whatsapp-media/...
              └─> UPDATE messages SET media_url=<public url>
                    └─> Realtime UPDATE -> frontend mostra <img>
```

Bucket: `whatsapp-media` (public read, service role write).
Secrets já existentes usados: `WHATSAPP_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`.

`config.toml`: adicionar `verify_jwt = false` para `download-whatsapp-media`.

## Fora de escopo

- Não vou implementar download retroativo de imagens antigas que já chegaram sem `media_url` (elas continuarão mostrando placeholder). Posso fazer um script de backfill em uma próxima rodada se você quiser.
- Não vou mexer em vídeo/documento além de salvar `media_url` — o player de vídeo/preview de PDF fica para depois.
