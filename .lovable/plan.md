## Objetivo
Na lista de conversas da aba **Chat**, substituir a tag genérica **"Suporte"** (chip vermelho com ícone LifeBuoy) pelo **motivo do suporte já categorizado** pela Donatella — mostrando o **grupo** (Entrega, Produto, Pedido/Pagamento, Outros) ou, quando fizer sentido, a **categoria específica** (ex.: "Atraso na entrega").

Somente UI/apresentação. Não altera classificação, orquestrador, banco ou dashboard.

## Onde mudar
1. **`src/hooks/useSupportCaseByConversation.ts` (novo)**
   - Consulta `support_cases` filtrando pelos `conversation_id` dos chats atualmente carregados.
   - Retorna um `Map<conversationId, { grupo, categoria }>` com o caso **mais recente** por conversa.
   - Refaz o fetch quando a lista de IDs muda e escuta `postgres_changes` em `support_cases` (INSERT/UPDATE) para atualizar em tempo real.

2. **`src/components/ChatInterface.tsx` (linhas ~1430-1438)**
   - Usar o hook novo com os IDs dos chats visíveis.
   - Regra do chip vermelho (só aparece quando `chat.queue === 'support'`):
     - Se existir `support_cases` para a conversa → mostrar **label do grupo** (ex.: "Entrega") usando `labelForGroup()` de `src/lib/supportCategories.ts`. Tooltip com a **categoria específica** (`labelForCategory(categoria_suporte)`).
     - Cor do chip por grupo (mantendo tom "suporte"):
       - entrega → sky, produto → violet, pedido_pagamento → amber, outros → rose (fallback padrão).
     - Ícone `LifeBuoy` mantido à esquerda.
     - Se **não** existir `support_cases` ainda (fallback) → manter texto atual "Suporte" em vermelho.

## Detalhes técnicos
- Query: `select conversation_id, grupo_suporte, categoria_suporte, created_at from support_cases where conversation_id in (...) order by created_at desc` e reduzir pegando o primeiro por `conversation_id`.
- Labels e cores vêm de `src/lib/supportCategories.ts` (já existe `labelForGroup`, `labelForCategory`, `SUPPORT_GROUPS`).
- Nenhum campo novo no tipo `Chat`; o mapeamento fica no componente.
- Não mexer em: `nina-orchestrator`, migrations, dashboard, tags de contato, atribuição de responsável.

## Arquivos
- criar: `src/hooks/useSupportCaseByConversation.ts`
- editar: `src/components/ChatInterface.tsx` (apenas o bloco do chip `Suporte`)