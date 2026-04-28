
## Visão geral

Sim, as três funcionalidades são totalmente possíveis. O backend já tem quase tudo pronto:
- A tabela `messages` já possui a coluna `reply_to_id` (não precisa de migration).
- A função `sendMediaMessage` já lida com upload de imagens/áudios/documentos para o bucket `whatsapp-media`.
- A tabela `contacts` já tem `name` e RLS permissiva.

Faltam apenas ajustes de UI + um pequeno endpoint `updateContact` + suporte a `reply_to_id` no envio.

---

## 1. Drag & Drop + Colar (Ctrl+V) imagens/arquivos no chat

**Arquivo:** `src/components/ChatInterface.tsx`

- Envolver a área principal do chat (lista de mensagens + input) em uma `<div>` com handlers `onDragEnter`, `onDragOver`, `onDragLeave` e `onDrop`.
- Mostrar um overlay visual ("Solte para enviar") quando estiver arrastando arquivos.
- Ao soltar: detectar tipo do arquivo (image/audio/document) automaticamente pelo MIME, validar tamanho (reusar `MAX_SIZE_BY_TYPE`) e abrir o painel de pré-visualização já existente (`pendingAttachment`).
- Adicionar handler `onPaste` no `<textarea>` de mensagem: se `e.clipboardData.files` tiver itens (Ctrl+V de imagem do print, screenshot, etc.), interceptar e enviar para o mesmo fluxo de pré-visualização.
- Suportar também colar imagem copiada do navegador (image/png no clipboard).

Resultado: usuário pode arrastar qualquer arquivo do desktop para a área do chat, ou tirar print e colar com Ctrl+V — ambos abrem a tela de "Enviar com legenda".

---

## 2. Editar nome do contato (Contatos + Chat)

**Backend:** adicionar método em `src/services/api.ts`:
```ts
updateContact(contactId, { name?, email? })  // UPDATE em public.contacts
```

**Aba Contatos** (`src/components/Contacts.tsx`):
- Adicionar botão de editar (ícone `Pencil`) na coluna "Ações" de cada linha.
- Modal "Editar Contato" reaproveitando o layout do "Novo Contato" — campos: nome, email (telefone read-only).
- Após salvar, atualizar a lista local (`setContacts`) e mostrar toast.

**Aba Chat** (`src/components/ChatInterface.tsx`):
- No painel direito de perfil (onde já aparece nome + telefone), tornar o nome clicável/editável.
- Ao clicar no nome: vira um `<input>` inline; salvar no blur ou Enter; chamar `api.updateContact` e atualizar via realtime/refetch.
- Mostrar ícone de lápis discreto ao passar o mouse.

---

## 3. Responder mensagem específica (estilo WhatsApp reply)

**Backend:** a coluna `reply_to_id` já existe em `messages`. Ajustar:
- `api.sendMessage` e `api.sendMediaMessage` para aceitar `replyToId` opcional e gravar em `reply_to_id`.
- `useConversations.sendMessage` / `sendMediaMessage` repassam o parâmetro.
- A função `transformDBToUIMessage` em `src/types.ts` passa a expor `replyToId` no `UIMessage`.
- Quando montar mensagens da UI, incluir um lookup do conteúdo da mensagem citada (já temos o array de messages na conversa, basta um `Map<id, msg>`).

**UI no ChatInterface:**
- Hover em qualquer mensagem mostra um botão "Responder" (ícone seta de resposta).
- Ao clicar, salva a mensagem em estado `replyingTo: UIMessage | null`.
- Acima do input de digitação, mostrar uma "barra de citação" com:
  - Borda lateral colorida + nome (Você / contato / Nina) + preview do conteúdo (texto truncado, "Imagem", "Áudio" ou "Documento").
  - Botão X para cancelar.
- Ao enviar, passar `replyToId` para o sendMessage/sendMediaMessage; limpar o estado.
- Renderização de mensagens com `replyToId`: bloco citado clicável dentro do balão (estilo WhatsApp), com borda lateral colorida e o trecho da mensagem original. Clicar nele faz scroll suave até a mensagem original (usando `id` como `data-msg-id` no DOM).

---

## Detalhes técnicos

**Arquivos editados:**
- `src/components/ChatInterface.tsx` — drag/drop, paste, reply UI, editar nome inline
- `src/components/Contacts.tsx` — modal editar contato
- `src/services/api.ts` — `updateContact()`, suporte a `replyToId` em `sendMessage`/`sendMediaMessage`
- `src/hooks/useConversations.ts` — repasse de `replyToId`
- `src/types.ts` — incluir `replyToId` no `UIMessage`

**Sem migrations necessárias.** Tudo cabe no schema atual.

**Fora de escopo:** envio do "reply quoted" para o WhatsApp Cloud API (a coluna existe no DB, mas o `whatsapp-sender` precisaria mandar `context.message_id`). Isso pode ser uma melhoria depois — confirma se quer incluir agora?
