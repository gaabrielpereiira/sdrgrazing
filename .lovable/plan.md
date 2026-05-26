# Corrigir conversas duplicadas para o mesmo contato

## Causa raiz
Race condition entre invocações paralelas de `whatsapp-webhook`. Quando duas mensagens do mesmo contato chegam ao mesmo tempo, ambas as execuções rodam `SELECT → INSERT` em paralelo, sem restrição única no banco. Resultado: duas conversas para o mesmo `contact_id`.

## Plano

### 1. Banco (migration)
- Criar **índice único parcial** em `conversations(contact_id) WHERE is_active = true`. Isso garante que só pode existir 1 conversa ativa por contato, no nível do Postgres — bloqueia a corrida.
- **Reconciliar duplicatas existentes** (Suhaila e quaisquer outras):
  - Para cada `contact_id` com >1 conversa ativa: manter a conversa com `last_message_at` mais recente, mover as `messages` das outras para essa, e marcar as antigas como `is_active = false, status = 'paused'`.

### 2. `supabase/functions/whatsapp-webhook/index.ts`
Tornar a criação de conversa **idempotente** (linhas 207–254):
- Após o `INSERT`, se erro for `23505` (unique violation), re-executar o `SELECT` da conversa ativa e usar a existente. Sem erro fatal, sem `continue`.
- Manter a lógica de reabrir conversa pausada inalterada.

### 3. Aplicar o mesmo padrão idempotente em:
- `supabase/functions/simulate-webhook/index.ts`
- `supabase/functions/simulate-audio-webhook/index.ts`
- `supabase/functions/automation-runner/index.ts` (linhas 74–78)
- `supabase/functions/nina-orchestrator/index.ts` (verificar linha 223, 1100 — só corrigir se também faz INSERT condicional)

Nada muda no front-end nem na lógica de roteamento/atribuição — apenas a criação da conversa fica protegida contra corrida.

## Fora de escopo
- Mudanças no agrupamento de mensagens (`message-grouper`)
- Mudanças em RLS, prompt da Nina, ou fluxo de handoff
- Mudanças em UI de chat (já tratadas em pedidos anteriores)

## Detalhes técnicos

**SQL do índice:**
```sql
CREATE UNIQUE INDEX conversations_one_active_per_contact
  ON public.conversations(contact_id)
  WHERE is_active = true;
```

**SQL de reconciliação (resumo):**
```sql
WITH ranked AS (
  SELECT id, contact_id,
    ROW_NUMBER() OVER (PARTITION BY contact_id ORDER BY last_message_at DESC) AS rn
  FROM conversations WHERE is_active = true
),
keepers AS (SELECT contact_id, id AS keep_id FROM ranked WHERE rn = 1),
losers  AS (SELECT id, contact_id FROM ranked WHERE rn > 1)
UPDATE messages m SET conversation_id = k.keep_id
  FROM losers l JOIN keepers k ON k.contact_id = l.contact_id
  WHERE m.conversation_id = l.id;

UPDATE conversations SET is_active = false, status = 'paused'
  WHERE id IN (SELECT id FROM losers);
```

**Padrão idempotente no webhook:**
```ts
const { data: newConv, error: insErr } = await supabase
  .from('conversations').insert({...}).select().single();
if (insErr?.code === '23505') {
  const { data: existing } = await supabase
    .from('conversations').select('*')
    .eq('contact_id', contact.id).eq('is_active', true)
    .maybeSingle();
  conversation = existing;
} else if (insErr) {
  console.error(...); continue;
} else {
  conversation = newConv;
}
```
