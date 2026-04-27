# Corrigir áudios no chat

## Causa raiz (confirmada nos logs)

No `whatsapp-webhook/index.ts` (linha 286), o disparo do `download-whatsapp-media` cobre apenas `image`, `video` e `document` — **`audio` está fora da lista**. Por isso, todo áudio recebido é gravado em `messages` com `media_url = NULL` e o player do chat não tem o que tocar (botão fica desabilitado).

O `message-grouper` baixa o áudio só para fazer transcrição (Whisper), mas joga o buffer fora — não sobe no bucket nem preenche `media_url`.

Resultado no banco:

```
type=audio | media_url=NULL  ← 2 áudios órfãos
```

## O que vou fazer

### 1. Webhook: incluir `audio` (e `voice`) no download
- Em `supabase/functions/whatsapp-webhook/index.ts`, adicionar `'audio'` à lista que dispara `download-whatsapp-media`, usando `message.audio?.id` como `media_id`.
- A função `download-whatsapp-media` já trata `audio/ogg` corretamente (mapeia `.ogg`), então sobe no bucket público `whatsapp-media` e atualiza `messages.media_url` automaticamente. Sem mudanças nessa função.

### 2. Player tolerante quando `media_url` ainda não chegou
- Em `src/components/ChatInterface.tsx`, quando `msg.type === AUDIO` e `msg.mediaUrl` for null, mostrar um indicador "Carregando áudio…" em vez de um botão desabilitado silencioso. O Realtime já atualiza a mensagem assim que o `download-whatsapp-media` preencher a URL.

### 3. Resgatar os 2 áudios já órfãos no banco (best-effort)
- Os áudios recebidos antes desse fix têm `media_id` salvo em `messages.metadata.media_id`. O link da Meta dura ~30 dias, então provavelmente ainda dá pra baixar.
- Adicionar um botão discreto **"Recarregar mídia"** no player de áudio quando `mediaUrl` for null e existir `metadata.media_id`. Ao clicar, chama `download-whatsapp-media` com aquele `media_id` e o `message_id`. Útil também para qualquer falha futura.

### 4. Documentação
- Atualizar `mem://features/audio-flow-complete-implementation` mencionando o download para storage no webhook (não só STT no grouper).

## Fora do escopo
- **ElevenLabs (TTS):** sem fix de código possível — sua API key é Free e a Meta retornou `402 paid_plan_required`. Resolva fazendo upgrade do plano da ElevenLabs ou trocando a key. Posso melhorar a mensagem de erro do botão de teste num próximo passo se quiser.
- **Lovable AI (créditos):** os logs também mostram `[Nina] AI response error: 402 Not enough credits` no `nina-orchestrator` e no STT do áudio (`message-grouper`). Isso significa que a Nina não responde nem transcreve até você adicionar créditos em Lovable Cloud → AI. Não é parte desse fix.

## Detalhes técnicos

**Diff conceitual no webhook** (linha ~286):
```ts
// antes
if (['image', 'video', 'document'].includes(message.type)) {
  const mediaId = message.image?.id || message.video?.id || message.document?.id;

// depois
if (['image', 'video', 'document', 'audio'].includes(message.type)) {
  const mediaId = message.image?.id || message.video?.id 
                || message.document?.id || message.audio?.id;
```

**Player (`ChatInterface.tsx`)** — adicionar branch para áudio sem URL:
```tsx
if (!msg.mediaUrl) {
  return (
    <div className="flex items-center gap-2 text-xs opacity-70">
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      <span>Carregando áudio…</span>
      {msg.metadata?.media_id && (
        <button onClick={retryDownload}>Recarregar</button>
      )}
    </div>
  );
}
```

Tudo isso é frontend + edição do webhook + uma migration zero. Sem nova tabela, sem nova função.