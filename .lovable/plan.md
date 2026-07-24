## Diagnóstico (confirmado no banco)

A conversa da Helena Perez está com `queue = 'support'`, `tags = []` e **nenhum registro em `support_cases`**. Ou seja:

- O chip vermelho "Suporte" na lista de conversas vem do campo `conversations.queue`, não de uma tag → por isso não aparece na seção TAGS e não dá para remover clicando no "x".
- Como não existe `support_case` nem tag `motivo:*`, o painel "Tickets de Suporte" mostra "Nenhum ticket" e o chip fica como "Suporte" genérico (fallback), sem grupo/categoria.

Isso acontece quando a Donatella move para suporte mas a classificação falha, ou quando o handoff é feito manualmente (botão "→ Suporte") sem gerar `support_case`.

## Objetivo

1. Permitir que o operador **remova o status de suporte** da conversa direto pelo chat (voltar para `sales` / Atendimento).
2. Garantir que o painel "Informações do Lead" **sempre mostre o motivo do suporte** quando `queue = 'support'`, mesmo sem `support_case` (usar a tag `motivo:*` ou permitir escolher um motivo agora).
3. Ao arquivar/finalizar a conversa, garantir também que `queue` volte para `sales` (já fazemos as tags, falta a fila).

## Mudanças

### 1. Botão "Remover suporte" no header do chat (`ChatInterface.tsx`)

Ao lado do botão "→ Suporte" existente, quando `activeChat.queue === 'support'` mostrar:

- Botão **"← Atendimento"** que chama `api.moveConversationQueue(id, 'sales')` e limpa tags `motivo:*` e `sentimento:*`.
- Esconder o botão "→ Suporte" quando já está em suporte (hoje aparece dos dois lados).

### 2. Painel "Informações do Lead" — sempre mostrar o motivo atual

Na seção **Tickets de Suporte**, quando não houver `support_case` mas `activeChat.queue === 'support'`:

- Renderizar um card "Suporte ativo" com o motivo derivado de `tags` (`motivo:*`) e o sentimento (`sentimento:*`).
- Se não houver nenhuma tag de motivo, mostrar um seletor "Definir motivo" com as opções de `SUPPORT_REASONS` que grava a tag `motivo:xxx` na conversa.
- Botão "Encerrar ticket" que remove o status de suporte (mesma ação do item 1).

### 3. Chip da lista de conversas (`ChatInterface.tsx` linhas 1461-1494)

Já tem fallback para tag `motivo:*`. Ok, mas quando o operador definir o motivo pelo painel (item 2) o chip vai passar a mostrar o rótulo correto automaticamente.

### 4. `endConversation` em `src/services/api.ts`

Ao arquivar/pausar a conversa, além de limpar `tags`, resetar `queue = 'sales'` para que a conversa não continue contando como suporte no histórico e nos filtros.

### 5. Correção pontual dos dados da Helena

Como parte da mesma migração, resetar `queue` para `'sales'` nas conversas hoje `queue='support'` **sem** `support_case` correspondente e sem tag `motivo:*` (limpeza única — inclui o caso da Helena).

## Detalhes técnicos

- `api.moveConversationQueue` já existe e aceita `reasonKey` opcional; adicionar suporte para "limpar" (passar `null` limpa `motivo:*`/`sentimento:*`).
- Todas as edições ficam em frontend + `api.ts` + uma migração SQL curta de limpeza. Nenhuma mudança no orquestrador.
