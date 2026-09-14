# Respostas com mensagem citada (dois lados)

Hoje a citação de mensagem só existe dentro do painel. Quando alguém do time responde citando uma mensagem, o WhatsApp do cliente recebe um texto solto (print 2). E quando o cliente responde citando uma mensagem nossa, essa citação não é guardada nem aparece no painel.

## O que muda

1. **Nossas respostas chegam citando a mensagem no WhatsApp**
   A mensagem citada escolhida no painel passa a ir junto no envio, então o cliente vê o mesmo balão de citação que ele veria em uma conversa normal do WhatsApp. Vale para texto, imagem, documento e áudio.

2. **Respostas do cliente com citação aparecem para nós**
   Quando o cliente responde citando uma mensagem, guardamos qual mensagem foi citada e o balão aparece no chat igual ao print 1.

3. **Citação de mensagem antiga continua visível**
   Se a mensagem citada for antiga e não estiver carregada na tela, mostramos um resumo dela (autor e trecho do texto) em vez de esconder a citação.

## Detalhes técnicos

- `whatsapp-sender`: incluir `context: { message_id: <whatsapp_message_id da mensagem citada> }` no payload da Cloud API. O `send_queue` não carrega essa informação hoje — resolver a partir de `messages.reply_to_id` do `message_id` da fila, buscando o `whatsapp_message_id` correspondente. Se a mensagem citada não tiver `whatsapp_message_id` (nunca chegou ao WhatsApp), enviar sem `context` em vez de falhar. Não aplicar em templates.
- `whatsapp-webhook`: ler `message.context.id` do payload recebido, procurar em `messages` pelo `whatsapp_message_id` e gravar `reply_to_id` na mensagem criada; guardar também `context` bruto em `metadata` para diagnóstico. Sem correspondência local, apenas registrar em `metadata` e seguir.
- `message-grouper`: preservar `reply_to_id` já gravado ao consolidar/atualizar a mensagem agrupada.
- Frontend (`ChatInterface.tsx`, `api.ts`, `types.ts`): o render em `msgsById` depende da mensagem citada estar na página carregada. Trazer um resumo da mensagem citada junto do carregamento (conteúdo/autor/tipo) para exibir a citação também quando ela estiver fora da janela carregada.
- Deploy das funções alteradas: `whatsapp-sender`, `whatsapp-webhook`, `message-grouper`.

## Fora do escopo

Nenhuma mudança em fluxo de IA, filas, automações ou tickets de suporte.
