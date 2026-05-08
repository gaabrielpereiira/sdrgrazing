# Suporte a Stickers e Reactions

Hoje o webhook do WhatsApp cai no `default` para `sticker` e `reaction`, gravando textos genéricos `[sticker]` / `[reaction]`. Vamos tratar os dois tipos corretamente: sticker como mídia visual e reaction como emoji anexado à mensagem original.

## 1. Stickers (figurinhas)

**Backend — `whatsapp-webhook/index.ts`**
- Adicionar `case 'sticker'` no switch:
  - `messageType = 'image'` (o enum `message_type` só aceita text/audio/image/document/video; aproveitamos `image` pois sticker é WebP)
  - `mediaType = 'sticker'`
  - `messageContent = ''`
  - Salvar `metadata.is_sticker = true` e `metadata.media_id = message.sticker.id`
- Incluir `'sticker'` na lista que dispara `download-whatsapp-media` (já é genérico por `media_id`, funciona com WebP).

**Frontend — `ChatInterface.tsx`**
- Em `MessageType.IMAGE`, se `mediaType === 'sticker'` (ou `metadata.is_sticker`), renderizar variante "sticker": imagem ~140px, fundo transparente, sem bubble, sem caption.
- Atualizar previews da lista de conversas (linhas ~918, ~1189, ~1466): mostrar `🎟️ Figurinha` em vez de `📷 Imagem` quando for sticker.

**Tipos — `src/types.ts`**
- Garantir que `transformDBToUIMessage` propague `mediaType` e `metadata.is_sticker` para a UI (adicionar campo `isSticker` ou usar `mediaType === 'sticker'`).

## 2. Reactions (emojis em mensagens)

Reactions do WhatsApp não são mensagens normais — referenciam outra mensagem com um emoji. Vamos armazenar e exibir como badge anexado.

**Backend — `whatsapp-webhook/index.ts`**
- Adicionar `case 'reaction'` no switch ANTES do insert genérico, com fluxo separado:
  - Ler `message.reaction.message_id` (alvo) e `message.reaction.emoji` (vazio = remoção).
  - Buscar a mensagem alvo: `messages.where(whatsapp_message_id = reaction.message_id)`.
  - Se encontrada, fazer `update` em `metadata.reactions` (objeto `{ [from_phone]: emoji }`). Emoji vazio → remover entrada.
  - **Não** inserir nova linha em `messages`, **não** enfileirar em `message_grouping_queue` (reaction não deve gerar resposta da Nina).
  - `continue` no loop.

**Frontend — `ChatInterface.tsx`**
- Ler `metadata.reactions` da mensagem e renderizar um pequeno chip com o(s) emoji(s) sobreposto no canto inferior do bubble (estilo WhatsApp).
- Atualizar `transformDBToUIMessage` para expor `reactions`.

**Realtime**
- A subscription já reage a `UPDATE` em `messages`, então a reaction aparece sem reload. Confirmar que o handler de UPDATE substitui a mensagem inteira (já faz isso em `useConversations.ts`).

## 3. Garantias adicionais
- Stickers e reactions precisam ser ignorados pelo `nina-orchestrator` para não gerar resposta automática inadequada. Reactions já não entram na fila. Para stickers, o orchestrator vai ver uma "imagem" — adicionar verificação simples: se `metadata.is_sticker`, pular geração de resposta (ou tratar como contexto vazio).

## Arquivos afetados
- `supabase/functions/whatsapp-webhook/index.ts`
- `supabase/functions/nina-orchestrator/index.ts` (skip de sticker)
- `src/types.ts`
- `src/components/ChatInterface.tsx`

## Fora de escopo
- Enviar stickers/reactions a partir do painel (apenas recebimento e exibição).
- Migration de banco (usamos `metadata` jsonb existente).
