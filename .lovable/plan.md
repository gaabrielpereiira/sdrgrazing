## Problema atual

Hoje, quando uma conversa é finalizada (`is_active = false`), três coisas acontecem que apagam visualmente o histórico:

1. **Webhook do WhatsApp** (`whatsapp-webhook/index.ts`): ao receber nova mensagem do contato, busca conversa apenas com `is_active = true`. Como não encontra, cria uma **conversa nova vazia** — o histórico antigo fica órfão em outro registro.
2. **Reabrir manualmente** (`reopenConversation` em `api.ts`): já reativa a conversa correta (`is_active = true`), então este caso já preserva o histórico — mas só funciona se o frontend chamar antes do webhook.
3. **Frontend** (`fetchConversations`): lista apenas conversas com `is_active = true`, então conversas finalizadas somem da aba "Ativas" mesmo tendo histórico.

Resultado: quando o cliente volta a falar após "finalizar", aparece um chat zerado e o histórico anterior fica perdido.

## Solução

Tratar **um contato = uma conversa contínua**. Reabrir a conversa existente em vez de criar uma nova, mantendo todas as mensagens antigas visíveis.

### 1. Webhook reabre em vez de criar

Em `supabase/functions/whatsapp-webhook/index.ts` (linhas 189-215):

- Buscar a conversa **mais recente do contato** (sem filtrar por `is_active`), ordenando por `last_message_at desc`.
- Se existir e estiver `is_active = false`: fazer `UPDATE` para reativar (`is_active = true`, `status = 'nina'`, `last_message_at = now()`) — o histórico de mensagens permanece vinculado a essa mesma conversa.
- Se existir e já estiver ativa: usar como hoje.
- Só criar conversa nova se o contato **nunca** teve uma.

### 2. Frontend mostra a conversa reativada automaticamente

- `useConversations.ts`: o realtime de `conversations` já cobre `UPDATE`, então a conversa que voltou a `is_active = true` reaparece na lista ativa sozinha. Validar que o handler de UPDATE faz refetch quando `is_active` muda de false para true (adicionar fetch caso o item não esteja mais na lista local).

### 3. Reabrir manual mostra histórico imediatamente

- `reopenConversation` em `api.ts` já está correto (faz UPDATE preservando mensagens). Garantir no `ChatInterface.tsx` que após reabrir, o chat ativo continue selecionado e role para a última mensagem (o histórico já vem por `fetchConversations` quando o filtro muda para "Ativas").

### 4. Aba "Finalizadas" continua funcional

- Sem mudanças. Conversas só ficam em "Finalizadas" enquanto não houver nova interação. Quando o contato responde, ela migra automaticamente para "Ativas" com o histórico intacto.

## Detalhes técnicos

**Edge function `whatsapp-webhook`** — substituir o bloco de criação da conversa:

```ts
// Buscar conversa mais recente do contato (qualquer status)
let { data: conversation } = await supabase
  .from('conversations')
  .select('*')
  .eq('contact_id', contact.id)
  .order('last_message_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (conversation && !conversation.is_active) {
  // Reabrir conversa anterior preservando histórico
  const { data: reopened } = await supabase
    .from('conversations')
    .update({ 
      is_active: true, 
      status: 'nina',
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)
    .select()
    .single();
  conversation = reopened;
  console.log('[Webhook] Reopened conversation:', conversation.id);
} else if (!conversation) {
  // Primeira conversa do contato
  const { data: newConversation, error: convError } = await supabase
    .from('conversations')
    .insert({ contact_id: contact.id, status: 'nina', is_active: true, user_id: null })
    .select()
    .single();
  if (convError) { /* ... */ continue; }
  conversation = newConversation;
}
```

**`useConversations.ts`** — no listener realtime de `conversations` UPDATE, se `payload.new.is_active === true` e a conversa não está na lista local atual (filtro = ativas), disparar `fetchConversations()` para trazê-la com mensagens.

## Arquivos afetados

- `supabase/functions/whatsapp-webhook/index.ts` — lógica de reabertura
- `src/hooks/useConversations.ts` — refetch quando conversa é reativada via realtime

Sem migrations de banco. Sem mudança de schema. As mensagens antigas já estão vinculadas via `conversation_id` e voltam automaticamente quando a conversa é reativada.
