## Objetivo

Hoje já é possível **anexar** um arquivo de áudio pelo clipe (📎 → Áudio), mas não dá para **gravar** áudio na hora dentro do chat. Vou adicionar o clássico botão de microfone estilo WhatsApp, permitindo gravar e enviar áudios diretamente da conversa.

## O que será adicionado

### 1. Botão de microfone na barra de envio (`ChatInterface.tsx`)
- Novo ícone `Mic` ao lado do botão de anexo.
- Quando o usuário **não está** digitando nada, o botão "Enviar" do canto direito vira um microfone (igual WhatsApp). Se houver texto, volta ao avião de envio.
- Clique inicia gravação imediatamente (após autorização do navegador).

### 2. Estado de gravação (UI)
Durante a gravação, a barra de input é substituída por um painel com:
- Indicador vermelho pulsante + tempo decorrido (`MM:SS`).
- Botão "Cancelar" (lixeira) — descarta o áudio.
- Botão "Enviar" (check verde) — finaliza e envia.
- Limite automático de **2 minutos** (corta e pré-visualiza).

### 3. Pré-visualização antes do envio (opcional, leve)
Reaproveita o card de `pendingAttachment` já existente — após parar a gravação, o áudio cai no mesmo fluxo de anexo (preview com player), permitindo o usuário ouvir antes de mandar ou descartar.

### 4. Captura técnica
- Usa `navigator.mediaDevices.getUserMedia({ audio: true })` + `MediaRecorder`.
- Formato preferencial: `audio/webm;codecs=opus` (suporte nativo Chrome/Edge/Firefox). Fallback: `audio/mp4` (Safari).
- Empacota o `Blob` em um `File` e injeta no fluxo já existente (`pendingAttachment` com `mediaType: 'audio'`).

### 5. Compatibilidade com WhatsApp
A API do WhatsApp Cloud aceita `audio/ogg` (opus), `audio/mpeg`, `audio/mp4` e `audio/aac`. Como `webm/opus` não é aceito diretamente pela Meta, vou:
- Renomear o blob para `.ogg` e enviar com `Content-Type: audio/ogg` (a Meta aceita o container OGG/Opus).
- Para Safari (`audio/mp4`), enviar como `.m4a` com `audio/mp4`.

O bucket `whatsapp-media` e o `whatsapp-sender` já tratam o `type: 'audio'` via `link`, então não precisa mexer no edge function.

### 6. Tratamento de permissão
- Se o usuário negar acesso ao microfone, mostra um `toast` orientando a habilitar nas configurações do navegador.
- Se o navegador não suportar `MediaRecorder`, esconde o botão.

## Arquivos afetados

- `src/components/ChatInterface.tsx` — novo botão Mic, estado de gravação, hook `MediaRecorder`, integração com `pendingAttachment`.
- `mem://features/chat-attachments-outgoing` — atualizar nota mencionando gravação ao vivo.

Sem mudanças no backend — o pipeline atual (`api.sendMediaMessage` → bucket → `send_queue` → `whatsapp-sender`) já cobre áudio.

## Fora de escopo

- Transcrição automática do áudio gravado (já existe para áudios recebidos).
- Forma de onda (waveform) animada durante a gravação — fica para depois se você quiser.
