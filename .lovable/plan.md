## Mostrar nome da empresa no chat

Quando o contato for Pessoa Jurídica, exibir o nome da empresa no chat — discreto, em fonte menor — sempre acompanhando o nome da pessoa.

### Onde aparece
1. **Cabeçalho do chat ativo** (`ChatInterface.tsx`): logo abaixo do nome do contato (mesma linha, sub-texto pequeno) com um ícone `Building2`.
   - Exemplo:
     ```
     João Silva  [PJ] [Pendente]…
     🏢 Acme Ltda.
     ```
2. **Item da lista de conversas** (sidebar): pequeno texto cinza/cyan abaixo do nome, antes do preview da última mensagem, somente quando `isBusiness && companyName`.

### Detalhes técnicos
- **`src/types.ts`**:
  - Adicionar `isBusiness?: boolean` e `companyName?: string | null` em `UIConversation`.
  - Em `transformDBToUIConversation`, popular esses campos a partir de `conv.contact?.is_business` e `conv.contact?.company_name` (já vêm via `select('*')` no `contact:contacts(*)`).
- **`src/components/ChatInterface.tsx`**:
  - Cabeçalho (área do `<h2>` do contato): manter o nome no `<h2>`. Logo abaixo, renderizar condicionalmente `<div class="text-[11px] text-cyan-300/70 flex items-center gap-1"><Building2 className="w-3 h-3" />{activeChat.companyName}</div>` quando `activeChat.isBusiness && activeChat.companyName`.
  - Item da lista (sidebar): após `<h3>` do `contactName`, adicionar `<p class="text-[10px] text-cyan-300/70 truncate flex items-center gap-1">…</p>` condicional, mantendo o preview de última mensagem inalterado.

### Fora do escopo
- Tornar o nome da empresa editável a partir do chat (já é editável no modal "Editar Contato").
- Mostrar a empresa em outras telas (CRM, Dashboard, etc.).
