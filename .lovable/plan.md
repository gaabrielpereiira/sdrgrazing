# Atualizar nome/dados do contato no chat em tempo real

## Causa
`src/hooks/useConversations.ts` assina realtime de `messages` e `conversations`, mas não de `contacts`. Quando alguém renomeia "Caroline" → "Caroline A" (ou muda telefone, tags, etc.), o estado do hook mantém o objeto `contact` antigo até um refresh.

A tabela `contacts` já está na publicação `supabase_realtime` e com `REPLICA IDENTITY FULL`, então só falta o subscribe no frontend.

## Mudanças

### `src/hooks/useConversations.ts`
Adicionar um terceiro canal realtime para `contacts`:
- Evento `UPDATE` em `public.contacts` → percorre `conversations` no estado e, para cada conversa cujo `contact.id === payload.new.id`, faz merge dos campos atualizados (`name`, `call_name`, `phone_number`, `email`, `tags`, `profile_picture_url`, `is_blocked`, etc.).
- Evento `DELETE` → remove conversas órfãs do estado (defensivo).
- Mesma estrutura dos canais existentes (status + fallback de polling).

Não vou tocar nos transformadores nem na shape da `UIConversation` — só atualizar campos já presentes.

### `src/components/Contacts.tsx` (update otimista)
Quando o usuário salva edição de contato, atualizar o estado local imediatamente (igual fiz no Team) — assim, mesmo se o realtime falhar, a tela do Contatos reflete na hora. O chat segue via realtime do hook.

## Detalhes técnicos

```ts
const contactsChannel = supabase
  .channel('contacts-realtime')
  .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'contacts' },
      (payload) => {
        const updated = payload.new as any;
        setConversationsTracked(prev => prev.map(conv =>
          conv.contact?.id === updated.id
            ? { ...conv,
                contactName: updated.name ?? conv.contactName,
                contact: { ...conv.contact, ...updated } }
            : conv
        ));
      })
  .on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'contacts' }, ...)
  .subscribe(...);
```

Cleanup no `return` do `useEffect` remove o novo canal junto com os outros.

## Fora do escopo
- Não vou mexer em RLS, migrations ou realtime do banco — tabela `contacts` já está habilitada.
- Não vou refatorar `useConversations` além desse subscribe.

## Resultado
Editar nome/dados do contato em qualquer tela → a lista do chat e o cabeçalho do chat aberto atualizam **na hora**, sem F5.
