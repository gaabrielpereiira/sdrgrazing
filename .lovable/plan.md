## Problema

A mensagem "Oi" do Gabriel chegou no webhook, mas nunca foi respondida pela Nina. Os logs mostram:

```
[Webhook] Error creating contact: column "status" of relation "deals" does not exist
```

### Causa raiz

Existem **dois triggers** disparando em `INSERT` na tabela `contacts`:

1. `create_deal_for_new_contact` — correto (usa coluna `stage`)
2. `auto_create_deal_on_contact` — **quebrado**: tenta inserir em `deals.status`, coluna que não existe nesta tabela (deals tem `stage`, não `status`)

Quando o webhook tenta criar o contato do Gabriel, o trigger quebrado aborta o INSERT inteiro. Sem contato → sem conversa → sem mensagem salva → `message-grouper` e `nina-orchestrator` nunca são acionados → nada é enviado de volta.

Além disso os dois triggers são redundantes — ambos criam um deal para cada novo contato, gerando duplicatas quando o trigger quebrado for corrigido.

## Correção

Criar uma migration que:

1. **Remove o trigger quebrado** `auto_create_deal_on_contact` da tabela `contacts` e dropa a função `auto_create_deal_on_contact()` (que referencia coluna inexistente `deals.status`).
2. **Mantém apenas** `create_deal_for_new_contact` como trigger único de auto-criação de deal (já está correto, usa `stage` e respeita `user_id`).
3. **Garante o trigger ativo**: recria `CREATE TRIGGER trg_create_deal_for_new_contact AFTER INSERT ON contacts ...` caso não tenha sido preservado pelo remix.

## Após aplicar

A próxima mensagem recebida no webhook vai:
1. Criar contato com sucesso
2. Disparar `create_deal_for_new_contact` (deal criado corretamente)
3. Enfileirar mensagem em `message_grouping_queue`
4. `message-grouper` agrupa → `nina-orchestrator` gera resposta → `whatsapp-sender` envia

Não é necessário reenviar a mensagem do teste anterior — basta o Gabriel mandar uma nova mensagem ("Oi" de novo, por exemplo) para validar.

## Detalhes técnicos

```sql
DROP TRIGGER IF EXISTS auto_create_deal_on_contact ON public.contacts;
DROP FUNCTION IF EXISTS public.auto_create_deal_on_contact();

-- Garantir trigger correto ativo
DROP TRIGGER IF EXISTS trg_create_deal_for_new_contact ON public.contacts;
CREATE TRIGGER trg_create_deal_for_new_contact
  AFTER INSERT ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.create_deal_for_new_contact();
```
