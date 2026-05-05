## Diagnóstico

Olhando a última mensagem de áudio enviada, o WhatsApp Cloud API rejeitou com erro **131053**:

> *Audio file uploaded with mimetype as audio/ogg; codecs=opus, however on processing it is of type application/octet-stream. Please choose a different file.*

**Por que isso acontece:**

Hoje o `ChatInterface.tsx` faz a gravação assim:
1. `MediaRecorder` no Chrome/Edge produz um blob em **WebM/Opus** (`audio/webm;codecs=opus`).
2. Antes de subir, renomeamos a extensão para `.ogg` e marcamos o `Content-Type` como `audio/ogg`.
3. Mas o **conteúdo binário continua sendo um container WebM** — não é OGG de verdade.
4. Meta baixa o arquivo, abre o container, vê que não é OGG e devolve "application/octet-stream → reject".

WhatsApp Cloud só aceita áudio em: `audio/aac`, `audio/mp4`, `audio/mpeg`, `audio/amr` ou `audio/ogg` **(OGG real, codecs OPUS, mono)**. WebM não é aceito, mesmo renomeado.

Safari já produz `audio/mp4` nativo (que o WhatsApp aceita), por isso provavelmente funciona em iPhone. O bug afeta Chrome / Edge / Firefox no desktop e no Android.

## Correção

Trocar a captura para gravar **OGG/Opus de verdade** no navegador, usando a lib [`opus-recorder`](https://github.com/chris-rudmin/opus-recorder) (~30 KB, baseada em libopus + WebAssembly, gera arquivo `.ogg` válido em todos os navegadores modernos).

### Passos

1. **Instalar dependência**
   - `bun add opus-recorder`

2. **Refatorar a gravação em `src/components/ChatInterface.tsx`**
   - Remover o uso atual de `MediaRecorder` + remap de mime.
   - Criar um `OpusRecorder` (com `encoderPath` apontando para o worker da lib em `public/`).
   - Copiar `encoderWorker.min.js` da lib para `public/opus/encoderWorker.min.js` para o worker carregar.
   - No `start`: `recorder.start()`. No `stop`: receber o `Blob` (`type: 'audio/ogg'`) que **é OGG real**.
   - Manter exatamente a mesma UX (botão mic/check/cancel, timer, limite 2 min, preview no `pendingAttachment`).
   - Fallback Safari: se `OpusRecorder` falhar de inicializar, manter o caminho antigo apenas para Safari produzindo `audio/mp4` (`.m4a`) — esse já é aceito pela Meta.

3. **Defesa extra no upload (`src/services/api.ts → sendMediaMessage`)**
   - Garantir explicitamente `contentType: 'audio/ogg'` quando `mediaType === 'audio'` e o arquivo terminar em `.ogg`, e `audio/mp4` para `.m4a`. Hoje já passamos `file.type`, mas adicionar fallback evita arquivos com type vazio caírem em `application/octet-stream` no bucket.
   - Também fazer um `HEAD` opcional não — só corrigir o `contentType` no upload é suficiente.

4. **Logging para debug futuro**
   - Após o upload, logar no console o `publicUrl` e o `file.type` real, para que próximas falhas fiquem visíveis nos logs do navegador.
   - O `whatsapp-sender` já persiste `whatsapp_error` em `messages.metadata` e o ChatInterface já mostra "Falhou · …" — não precisa mexer.

### Detalhes técnicos

- `opus-recorder` config recomendada: `{ encoderPath: '/opus/encoderWorker.min.js', encoderSampleRate: 16000, numberOfChannels: 1, encoderApplication: 2049 /* VOIP */ }`. Mono e 16 kHz são exatamente o perfil que WhatsApp espera.
- O blob produzido tem cabeçalho OGG válido (`OggS`), então a Meta consegue ler.
- Tamanho final fica menor que o WebM atual (~12–18 KB/s), bom para upload.

### Fora do escopo

- Não alteramos o `whatsapp-sender` (o payload `audio: { link }` já está correto).
- Não mexemos em RLS, bucket ou webhook.
- Mensagens de áudio já enviadas que falharam continuam marcadas como "Falhou"; não há reprocessamento automático.

## Arquivos afetados

- `package.json` (nova dep `opus-recorder`)
- `public/opus/encoderWorker.min.js` (worker da lib)
- `src/components/ChatInterface.tsx` (lógica de gravação)
- `src/services/api.ts` (`sendMediaMessage`: forçar `contentType` correto)
