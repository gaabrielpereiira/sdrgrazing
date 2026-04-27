# Habilitar anexos no chat

Hoje o botão de clipe (📎) no `ChatInterface` está desabilitado com tooltip "Em breve". O backend já está preparado: `whatsapp-sender` aceita `image`, `audio` e `document`, e o bucket público `whatsapp-media` já existe. Só falta a parte do frontend.

## O que vai mudar

1. **Botão de anexo funcional** no rodapé do chat
   - Remover o `disabled`.
   - Ao clicar, abre um menu com opções:
     - 🖼️ Imagem (jpg, png, webp, gif)
     - 🎵 Áudio (mp3, ogg, m4a)
     - 📄 Documento (pdf, doc, docx, xls, xlsx)
   - Cada opção abre o seletor nativo (`<input type="file">`) já filtrado pelo accept correto.

2. **Pré-visualização antes de enviar**
   - Após selecionar o arquivo, mostrar um card flutuante acima do input com:
     - Miniatura (imagem) ou ícone (áudio/documento) + nome do arquivo + tamanho.
     - Campo de legenda opcional (apenas para imagem).
     - Botões "Cancelar" e "Enviar".
   - Validações: tamanho máximo 16 MB (limite do WhatsApp Cloud API) e tipos permitidos.

3. **Upload + envio**
   - Upload do arquivo para o bucket `whatsapp-media` em `outbound/{conversationId}/{timestamp}-{nome}.ext`.
   - Pegar a URL pública.
   - Inserir no banco:
     - `messages` com `type` = image/audio/document, `media_url`, `media_type`, `content` (legenda ou nome do arquivo) e `status = 'processing'`.
     - `send_queue` com `message_type` correspondente, `media_url`, `content`, `priority = 2` e `message_id` referenciando a mensagem criada.
   - Disparar `whatsapp-sender` igual já é feito para texto.
   - Atualização otimista na UI para o anexo aparecer instantaneamente na conversa.

4. **Renderização de mensagens com mídia outgoing**
   - Garantir que mensagens enviadas pelo humano com `media_url` apareçam corretamente no histórico (imagem inline, player de áudio, link de download para documento). O player de áudio já existe; vamos reaproveitar e adicionar os casos de imagem/documento para o lado outgoing.

## Arquivos afetados

- `src/services/api.ts` — nova função `sendMediaMessage(conversationId, file, { type, caption })` que faz upload, cria a mensagem e enfileira.
- `src/hooks/useConversations.ts` — expor `sendMediaMessage` com optimistic update.
- `src/components/ChatInterface.tsx` — habilitar botão Paperclip, adicionar menu de tipos, input file oculto, modal de preview/legenda, e renderização de mídia outgoing.
- (Opcional) novo subcomponente `src/components/chat/AttachmentPreview.tsx` para o card de pré-visualização.

## Notas técnicas

- Bucket `whatsapp-media` já é público — sem nova migration necessária.
- WhatsApp Cloud API exige URL pública acessível para `link`; a URL pública do Supabase Storage atende.
- Limite de 16 MB respeita o teto da Cloud API para qualquer tipo de mídia (na prática áudio é 16 MB, documento 100 MB, imagem 5 MB; vamos usar limites por tipo: imagem 5 MB, áudio 16 MB, documento 100 MB).
- Sem mudanças no `whatsapp-sender` — ele já trata os 3 tipos.
- Sem mudanças de RLS — políticas existentes em `messages`/`send_queue` já permitem inserts autenticados.
