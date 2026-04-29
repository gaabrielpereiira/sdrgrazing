## Objetivo

Quando um humano (atendente) envia uma mensagem pelo chat, o cliente deve **ver o nome de quem está atendendo** no início da mensagem do WhatsApp, mesmo quando a conversa não tem responsável atribuído (`assigned_user_id = null`).

Exemplo do que o cliente vai receber no WhatsApp:

```
*João* :
Oi Maria! Tudo bem?
```

Na UI interna do chat continua aparecendo só o conteúdo (sem o prefixo duplicado).

---

## Como vai funcionar

### Resolução do nome do atendente (ordem de prioridade)

Para cada mensagem `from_type = 'human'` enviada:

1. **Responsável da conversa** — se `conversations.assigned_user_id` está setado, buscar `team_members.name` (preferindo `team_members.user_id = assigned_user_id`, com fallback por `email` do auth user).
2. **Usuário logado que clicou em enviar** — se passo 1 falhar, usar o nome do usuário autenticado: `profiles.full_name` pelo `auth.uid()` atual.
3. **Fallback genérico** — se nada disso existir (auth desativado, sem profile), usar o `sdr_name` configurado em `nina_settings` (já é o "nome da casa" exibido para o cliente).
4. Se nem `sdr_name` existir, não prefixa nada (comportamento atual).

Assim o requisito é atendido: **sempre tem um nome**, e prioriza o atendente real quando dá pra identificar.

### Onde o prefixo é aplicado

Apenas no envio para o WhatsApp (`supabase/functions/whatsapp-sender/index.ts`), no momento de montar o `payload.text.body` para mensagens com `from_type = 'human'`. Formato:

```
*<Nome>*:
<conteúdo original>
```

A linha em branco entre nome e conteúdo melhora legibilidade no WhatsApp.

### O que NÃO muda

- A coluna `messages.content` continua sendo salva **sem o prefixo** (UI interna do chat continua limpa, sem nome duplicado em cima da própria mensagem do atendente).
- Mensagens da Nina (`from_type = 'nina'`) **não** recebem prefixo — a Nina já se apresenta pelo prompt.
- Mídia com `caption` (imagem/vídeo) também recebe o prefixo no caption quando enviada por humano.
- Áudio e documento sem texto: não há onde colocar o nome (WhatsApp não permite caption em áudio puro), então enviamos como antes.

---

## Detalhes técnicos

### 1. `supabase/functions/whatsapp-sender/index.ts`

No worker que processa o `send_queue`:

- Após `claim_send_queue_batch`, para cada item com `from_type = 'human'`:
  - Buscar `conversations.assigned_user_id` do item.
  - Resolver nome do atendente nessa ordem:
    1. `team_members` filtrando por `user_id = assigned_user_id` → `name`.
    2. `profiles` por `user_id = assigned_user_id` → `full_name`.
    3. Se a fila tiver `metadata.sender_user_id` (setado no `api.sendMessage`), repetir os passos 1–2 com esse id.
    4. `nina_settings.sdr_name` (cache da settings já feito antes do loop).
  - Sanitizar (truncar nome a ~40 chars, remover `\n`).
  - Construir `prefixedContent = \`*${name}*:\n${queueItem.content}\`` quando há nome.
  - Usar `prefixedContent` em `payload.text.body` (type=text) e em `caption` (type=image/video). Para `document`, manter `filename` original e prefixar somente o `caption` se aplicável.
- **Não** atualizar o `messages.content` com o prefixo — só o payload enviado ao WhatsApp.

### 2. `src/services/api.ts` — `sendMessage` e `sendMediaMessage`

Para garantir que o passo 3 da resolução funcione mesmo sem `assigned_user_id`:

- Pegar `auth.user.id` (se houver) e enviar no `metadata` da fila:

```ts
.from('send_queue').insert({
  ...,
  metadata: { sender_user_id: currentUserId ?? null }
})
```

E também no `messages.metadata` (`sender_user_id`) para auditoria futura. Tolerar usuário ausente (auth desativado).

### 3. Sem migração de banco

Todos os campos necessários já existem (`send_queue.metadata`, `messages.metadata`, `team_members.user_id`, `profiles.full_name`, `nina_settings.sdr_name`).

---

## Arquivos alterados

- `supabase/functions/whatsapp-sender/index.ts` — resolver nome do atendente e prefixar `body`/`caption` em mensagens humanas.
- `src/services/api.ts` — incluir `sender_user_id` no metadata de `send_queue` e `messages` ao enviar (`sendMessage` e `sendMediaMessage`).

Sem mudanças de schema, sem mudanças na UI interna do chat.
