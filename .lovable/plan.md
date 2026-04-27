## Problema

Seu usuário `allan.abrunhosa@grazingtable.com.br` está com role `user` na tabela `user_roles`, por isso a UI mostra "Somente Leitura" e bloqueia ações de administrador (Configurações, edição de prompts, APIs, etc.).

Já existe um admin no sistema (`gabriel@sharkassessoria.com.br`), e a função `handle_new_user` só dá admin ao primeiro usuário criado — por isso você caiu como `user`.

## Solução

Aplicar uma migration que atualiza seu role para `admin`:

```sql
UPDATE public.user_roles
SET role = 'admin'
WHERE user_id = '45b14871-48ae-4169-92b7-14c4d288e790';
```

Isso usa a tabela `user_roles` existente (separada de `profiles`, conforme boas práticas de segurança já implementadas no projeto) e a função `has_role()` que protege as policies.

## Após aplicar

- Faça **logout e login novamente** (ou recarregue a página) para o hook `useCompanySettings` re-buscar o role.
- Você verá o badge "Admin" no canto superior direito de Configurações e poderá editar Agente, APIs e refazer o Onboarding.

## Observação

Se quiser que o segundo admin seja você e o `gabriel@...` deixe de ser admin, me avise — posso ajustar na mesma migration.