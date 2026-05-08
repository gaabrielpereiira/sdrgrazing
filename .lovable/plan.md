# Recebimento de Contatos Compartilhados (vCard)

Hoje mensagens do tipo `contacts` caem no `default` do switch e gravam apenas `[contacts]`. Vamos tratar corretamente: armazenar a lista de contatos no `metadata` e renderizar cards bonitos no chat.

## 1. Backend — `supabase/functions/whatsapp-webhook/index.ts`

Adicionar `case 'contacts'` no switch, antes do `default`:

- `messageType = 'text'`
- `messageContent = '👤 Contato compartilhado'` (ou `'👥 N contatos compartilhados'` se `length > 1`)
- Salvar no metadata da mensagem:
  - `is_contacts: true`
  - `contacts: message.contacts` (array completo do payload do WhatsApp, com `name`, `phones`, `emails`, `org`, `addresses`, `urls`, `birthday`)

Após o insert da mensagem, **pular a fila da Nina** (igual sticker): atualizar `last_message_at` da conversa, mas dar `continue` antes de inserir em `message_grouping_queue`. Compartilhar vCard não deve disparar resposta automática da IA.

Sem download de mídia (contatos são JSON puros, não têm `media_id`).

## 2. Frontend — `src/components/ChatInterface.tsx`

**Em `renderMessageContent`**, adicionar branch antes do switch de tipos:
```
if (msg.metadata?.is_contacts) { ...render cards... }
```

Para cada contato no array, renderizar um card com:
- Avatar circular com inicial do nome
- Nome formatado (`name.formatted_name` ou `name.first_name + last_name`)
- Empresa/cargo (`org.company`, `org.title`) se existir
- Lista de telefones com botão **Copiar** e botão **Iniciar conversa**
  - "Iniciar conversa": busca `contacts` por `phone_number` normalizado; se achar conversa ativa, abre via `setSelectedConversation`; senão, mostra toast "Contato não encontrado no sistema"
- Lista de emails (se existir) com botão Copiar
- Estilo: `bg-slate-800 border border-slate-700 rounded-lg p-3`, similar aos cards de áudio/documento já existentes

**Previews da lista de conversas** (linhas ~918, ~1189, ~1466 e no preview de reply): se `metadata.is_contacts`, mostrar `👤 Contato` em vez do conteúdo bruto.

## 3. Tipos — `src/types.ts`

Sem mudanças de schema. `metadata` já é propagado em `transformDBToUIMessage`.

## Arquivos afetados
- `supabase/functions/whatsapp-webhook/index.ts`
- `src/components/ChatInterface.tsx`

## Fora de escopo
- Importar contatos recebidos automaticamente para a tabela `contacts`
- Enviar contatos a partir do painel
- Migration de banco (usamos `metadata` jsonb existente)
