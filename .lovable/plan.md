## Pessoa Física vs Jurídica + Nome da Empresa nos Contatos

Adicionar diferenciação PF/PJ no cadastro/edição de contato e um campo opcional para o nome da empresa quando for pessoa jurídica.

### Comportamento
- **Modal "Novo Contato"** (`Contacts.tsx`): toggle/segmented control no topo com duas opções — **Pessoa Física** (padrão) e **Pessoa Jurídica**.
  - Quando "Pessoa Jurídica" estiver selecionada, mostrar campo extra **"Nome da empresa"**.
  - Salva `is_business = true/false` e `company_name`.
- **Modal "Editar Contato"**: mesmo toggle + campo de empresa, permitindo trocar o tipo a qualquer momento.
- **Lista de contatos** (desktop e mobile): badge discreta ao lado do nome — `PF` (cinza) ou `PJ` (cyan, ícone `Building2`). No PJ, mostrar o nome da empresa abaixo do nome do contato (ou no lugar do telefone secundário).
- Sem mudanças na busca por enquanto (mas ela já filtra por nome — o nome da empresa será incluído no índice de busca local).

### Detalhes técnicos

**1. Banco de dados** (`migration`):
- A tabela `contacts` já tem a coluna `is_business boolean default false`.
- Adicionar nova coluna: `company_name text` (nullable). Sem default.

**2. Tipos** (`src/types.ts`):
- Estender `Contact` com `isBusiness: boolean` e `companyName: string | null`.

**3. API** (`src/services/api.ts`):
- `createContact`: aceitar `isBusiness?: boolean` e `companyName?: string | null`; gravar `is_business` e `company_name`. Se `isBusiness === false`, gravar `company_name = null`.
- `fetchContacts`: incluir `is_business` e `company_name` no select e no mapeamento.
- `updateContact`: aceitar os mesmos campos opcionais e atualizar quando informados.
- Atualizar o mapeamento de retorno em todos os pontos para popular `isBusiness`/`companyName`.

**4. UI — `src/components/Contacts.tsx`**:
- Estado `form` ganha `isBusiness: boolean` e `companyName: string`.
- Estado `editForm` idem.
- Componente segmented control inline (dois botões com `Building2` / `User` do lucide), seguindo as classes existentes (slate/cyan, sem cores fora do design system).
- Renderização condicional do input "Nome da empresa".
- Linhas/cards: pequena badge `PJ` quando `contact.isBusiness`, e exibir `companyName` em texto secundário.

### Fora do escopo
- Validação de CNPJ/CPF.
- Campos fiscais adicionais (razão social, IE).
- Filtro/segmentação na listagem por tipo (pode vir depois).
- Sincronização do `company_name` com a coluna `company` da tabela `deals` (continuam independentes).
