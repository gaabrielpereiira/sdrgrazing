
## Diagnóstico

Investiguei o banco e o código. Encontrei **duas causas** distintas para o que a Tais está vendo:

### 1. Leads sumindo — causa: RLS por papel (role)

O sistema tem 4 usuários: **2 admins** e **2 com papel `user`** (provavelmente a Tais é um deles).

A RLS de `conversations` filtra por `user_queue_access(auth.uid())`:

- `admin` → vê `['sales','support']` (tudo)
- `support` → vê só `['support']`
- `sdr`/`user` → vê só `['sales']`

Hoje no banco existem **30+ conversas misturadas entre `sales` e `support`**. Resultado: quem tem papel `user` (Tais) **não vê nenhum lead da fila `support`** — exatamente o sintoma de "leads sumidos".

Isto contradiz a arquitetura single-tenant do resto do projeto (contatos, deals, appointments já são `auth.role() = 'authenticated'` — compartilhado entre todos).

### 2. "Versão antiga" — causa: cache do navegador

Não existe Service Worker no projeto (verificado). O que acontece é o navegador da Tais segurando bundles JS antigos do Vite/Lovable em cache. Cada deploy gera novos hashes, mas se o `index.html` ficou em cache, o navegador continua puxando os chunks velhos.

---

## Plano

### Passo 1 — Migration: igualar RLS de conversas/mensagens ao padrão single-tenant

Substituir as policies de `conversations`, `messages` e `conversation_states` por uma policy única do tipo "qualquer usuário autenticado acessa tudo" — exatamente o que já está em `contacts`, `deals`, `appointments`.

```sql
-- conversations
DROP POLICY IF EXISTS "Users can view conversations in allowed queues"   ON public.conversations;
DROP POLICY IF EXISTS "Users can insert conversations in allowed queues" ON public.conversations;
DROP POLICY IF EXISTS "Users can update conversations in allowed queues" ON public.conversations;
DROP POLICY IF EXISTS "Admins can delete conversations"                  ON public.conversations;

CREATE POLICY "Authenticated users can access all conversations"
  ON public.conversations FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- messages
DROP POLICY IF EXISTS "Users can view messages in allowed conversations"   ON public.messages;
DROP POLICY IF EXISTS "Users can insert messages in allowed conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can update messages in allowed conversations" ON public.messages;

CREATE POLICY "Authenticated users can access all messages"
  ON public.messages FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- conversation_states (hoje filtra por conversations.user_id, que muitas vezes é NULL)
DROP POLICY IF EXISTS "Users can access states of their conversations" ON public.conversation_states;

CREATE POLICY "Authenticated users can access all conversation_states"
  ON public.conversation_states FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
```

Efeito: Tais (e qualquer futuro usuário) passa a ver **todas** as conversas e mensagens, independente da fila ou do papel — alinhado com o resto do app.

### Passo 2 — Forçar cache busting no `index.html`

Adicionar meta tags no `<head>` do `index.html` para impedir que o navegador segure o HTML em cache (os chunks JS já têm hash, só o HTML que precisa):

```html
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
<meta http-equiv="Pragma" content="no-cache" />
<meta http-equiv="Expires" content="0" />
```

Isso garante que toda vez que a Tais (ou qualquer usuário) abrir o site, o navegador busca o `index.html` novo, que referencia os bundles JS atualizados.

### Passo 3 — Orientação para a Tais (apenas uma vez)

Depois do deploy, pedir para ela:
1. Abrir o site
2. `Ctrl+Shift+R` (Windows) ou `Cmd+Shift+R` (Mac) — hard refresh
3. Ou: DevTools → Application → Clear storage → Clear site data

A partir desse hard refresh, com o passo 2 aplicado, ela nunca mais vai ficar presa em versão antiga.

---

## Fora de escopo
- Nada de mudanças no frontend além do `index.html` (a função `user_queue_access` continua existindo, mas deixa de ser usada por essas tabelas — pode ser limpa depois se quiser).
- Não estou removendo o conceito de `queue` das conversas — ele continua útil para filtros visuais por aba (Vendas/Suporte), apenas deixa de bloquear a visibilidade.
