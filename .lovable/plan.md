## Excluir contatos

Adicionar a opção de excluir um contato a partir da tela de Contatos, com confirmação antes da remoção definitiva.

### Comportamento
- Botão de lixeira (ícone) em cada linha da tabela (desktop) e em cada card (mobile), ao lado dos botões existentes "Conversar" e "Editar".
- Ao clicar, abre um diálogo de confirmação ("Excluir contato? Essa ação removerá o contato e todas as conversas, mensagens e deals vinculados. Não pode ser desfeita.").
- Ao confirmar, executa a exclusão em cascata no backend e remove o contato da lista localmente, com toast de sucesso ou erro.

### Detalhes técnicos
- **`src/services/api.ts`**: novo método `deleteContact(contactId)` que apaga, na ordem:
  1. `messages` das conversas do contato
  2. `conversation_activities` do contato
  3. `conversation_states` das conversas do contato
  4. `conversations` do contato
  5. `deal_activities` dos deals do contato
  6. `deals` do contato
  7. `contact_cooldowns` pelo `phone_number`
  8. `contacts` (registro principal)
  Tudo via `supabase.from(...).delete()` para respeitar RLS de usuário autenticado.
- **`src/components/Contacts.tsx`**:
  - Novo estado `deletingContact` e `deleting`.
  - Botão `Trash2` (vermelho) na linha desktop e no card mobile.
  - Modal de confirmação reaproveitando o padrão visual dos outros modais (overlay + card slate).
  - Após sucesso: `setContacts(prev => prev.filter(c => c.id !== id))` + `toast.success`.

### Fora do escopo
- Soft delete / lixeira para restaurar.
- Exclusão em massa.
- Permissão por papel (qualquer usuário autenticado pode excluir, conforme RLS atual).
