## Contexto verificado

- **Erasmo Alencar** — a conversa **está** com `assigned_user_id = ffec7a15` (Gabriel) no banco, e o `team_members.user_id` do Gabriel é o mesmo `sender_user_id` gravado nas mensagens. Ou seja, a sticky reassignment em `api._autoAssignIfUnassigned` gravou certo. O que falha é a **UI do painel do chat não refletir** o novo responsável logo após o envio — só aparece depois de recarregar / esperar o realtime.
- **Botões da triagem** — a Donatella grava a mensagem interativa em `messages` com `metadata.interactive = { kind: 'button', buttons: [...] }`, e a resposta do cliente chega via `metadata.interactive = { kind: 'button_reply', id, title }`. Hoje o `ChatInterface` renderiza só `content` como texto, então os chips de botão e o "botão clicado" ficam invisíveis para o operador.

## Mudanças

### 1. UI reflete o novo responsável imediatamente após enviar (`src/hooks/useConversations.ts`)

No `sendMessage`, `sendMediaMessage` e `sendTemplateMessage` (as três wrappers do hook), depois de disparar o envio com sucesso:

- Ler `supabase.auth.getUser()` no cliente.
- Buscar `team_members.id` onde `user_id = auth.uid()` (uma vez, com cache local no hook).
- Se o `assignedUserId` atual da conversa for diferente do `member.id`, atualizar otimisticamente `setConversationsTracked` com o novo `assignedUserId`.
- O realtime UPDATE que chegar em seguida vai apenas confirmar o mesmo valor (idempotente).

Isso resolve o "não atribuiu a mim" percebido — o chip de responsável no cabeçalho e a badge na lista passam a mostrar o Gabriel na hora.

### 2. Renderizar os botões de triagem no chat (`src/components/ChatInterface.tsx`)

No renderizador de mensagem (procurar o bloco que imprime `msg.content`):

**Saída (Donatella → cliente):** quando `msg.metadata?.interactive?.kind === 'button'`:
- Renderizar o `content` normalmente.
- Abaixo, uma linha de chips desabilitados (`<button disabled>` estilizado como pill outline) com o `title` de cada `metadata.interactive.buttons[i]`.
- Legenda pequena `Botões enviados`.

**Entrada (cliente → Donatella):** quando `msg.metadata?.interactive?.kind === 'button_reply'`:
- Se `content` estiver vazio, usar `metadata.interactive.title` como texto.
- Renderizar um badge acima da mensagem: `↳ Botão clicado` com o `title` destacado (mesma cor do accent do chat).

Sem mudança no orquestrador, no schema, ou no fluxo do WhatsApp — os dados já estão persistidos em `metadata`.

## Fora de escopo

- Não muda a lógica sticky do backend (`api._autoAssignIfUnassigned`) — já funciona.
- Não muda o envio da mensagem interativa pela Meta Graph API.
- Não muda schema nem RLS.

## Como validar depois

1. Abrir uma conversa não atribuída a você, mandar uma mensagem → chip de "Responsável: {seu nome}" aparece imediatamente na coluna direita e na lista.
2. Abrir uma conversa recém-triada da Donatella → ver os chips "Atendimento" / "Suporte" logo abaixo da mensagem de saudação, e, quando o cliente clicar, ver o badge "Botão clicado: Suporte" na próxima mensagem de entrada.