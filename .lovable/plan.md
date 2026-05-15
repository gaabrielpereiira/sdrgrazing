## Tornar o painel "Informações do Lead" editável

Hoje o painel lateral direito do chat (`ChatInterface.tsx`, linhas ~1985-2034) mostra **Nome**, **Telefone** e **Email** apenas como leitura. Vou adicionar edição inline para os mesmos campos já suportados por `api.updateContact`:

- Nome do contato (`name`)
- Email (`email`)
- É empresa? (`is_business`) — toggle
- Nome da empresa (`company_name`) — só aparece se "É empresa" estiver ativo
- *(Telefone permanece read-only — é o ID do WhatsApp e não deve ser editado.)*

### UX

Cada campo vira clicável: ao clicar no valor (ou em um ícone de lápis), ele se transforma em `Input`/`Switch`. Salvamento ocorre no `onBlur` ou ao apertar Enter (Esc cancela). Feedback via toast de sucesso/erro. Validação client-side com Zod:
- nome: 1–100 chars
- email: formato válido, ≤255 chars (opcional)
- empresa: ≤100 chars

Estados:
- `editingField: 'name' | 'email' | 'company' | null`
- `editValues` temporários
- `isSavingField` para spinner

### Reorganização visual

A seção "Dados de Contato" passa a listar:
1. Nome (editável)
2. Telefone (read-only)
3. Email (editável, com placeholder "Adicionar email")
4. Toggle "É uma empresa"
5. Empresa (editável, condicional)

O nome no topo (`<h3>`) e na conversa também devem refletir a edição — já refletem porque vêm de `activeChat.contactName`, que é derivado de `contacts` pelo realtime/refetch.

### Integração

- Reutiliza `api.updateContact` (já existe).
- Após sucesso, chamar `refetch` do hook `useConversations` (ou disparar atualização local) para o painel refletir o novo valor sem esperar o realtime.

### Arquivos

- `src/components/ChatInterface.tsx` — substituir bloco "Dados de Contato" por versão editável; adicionar handler `handleSaveContactField` e estado de edição.

Sem mudanças de schema, RLS ou backend.