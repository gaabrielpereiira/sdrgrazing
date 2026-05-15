## Seletor de país no cadastro de contato

Adicionar um seletor de país ao lado do campo de telefone no modal "Novo Contato", para que o DDI seja escolhido visualmente (bandeira + código) e concatenado automaticamente ao número digitado.

### Comportamento
- Modal "Novo Contato" em `Contacts.tsx`: o campo único de telefone vira um par "País + Número".
- Padrão: **Brasil (+55)**.
- Lista de países comuns para vendas/WhatsApp, com busca por nome ou código (Brasil, Portugal, EUA, México, Argentina, Chile, Colômbia, Peru, Uruguai, Paraguai, Espanha, Reino Unido, França, Itália, Alemanha, Canadá, Angola, Moçambique — cobertura ampla mas curada, sem dependência externa).
- Ao salvar, o telefone enviado para `api.createContact` é `${dialCode}${digitsApenas}` (sem `+`, sem espaços), mantendo compatibilidade com o formato atual (ex: `5511999998888`).
- Validação: número precisa ter ao menos 6 dígitos depois do DDI; toast de erro caso contrário.
- Placeholder do campo de número adaptado ao país selecionado quando possível.

### Detalhes técnicos
- **`src/lib/countries.ts`** (novo): array `COUNTRIES = [{ code: 'BR', name: 'Brasil', dial: '55', flag: '🇧🇷' }, ...]` usando emojis de bandeira (sem assets/lib externa).
- **`src/components/Contacts.tsx`**:
  - Estado `form` passa a ter `{ name, countryCode: 'BR', phone, email }` (campo `phone` guarda só os dígitos locais).
  - Novo componente inline (ou popover usando `@/components/ui/popover` já presente no projeto) com botão `🇧🇷 +55 ▾` à esquerda do input e lista filtrável.
  - `handleCreate` monta `fullPhone = dial + phone.replace(/\D/g,'')` e passa para `api.createContact`.
- **Sem mudanças em backend** — a coluna `contacts.phone_number` já é text livre e o restante do app continua lendo/escrevendo a string concatenada.

### Fora do escopo
- Editar país de contato existente (modal "Editar Contato" continua sem telefone editável).
- Formatação avançada por país (máscara dinâmica) — só validação básica de comprimento.
- Detecção automática de país a partir do número colado.
