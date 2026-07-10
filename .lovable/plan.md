## Objetivo

Na coluna direita do chat (Informações do Lead), logo abaixo da seção **Tags**, adicionar uma nova seção **Tickets de Suporte** que lista todos os casos de suporte já abertos pelo lead — com o motivo — para ficar salvo no histórico.

## Onde

Arquivo único: `src/components/ChatInterface.tsx`, entre a seção "Tags" (linha ~2589) e "Notas Internas" (linha ~2591).

## O que aparece

Para cada ticket do lead atual (`support_cases` filtrado por `conversation_id = activeChat.id`, ou como fallback `contact_id`):

- **Cabeçalho da seção**: "Tickets de Suporte" + contador (ex: `3`)
- **Cada card do ticket** mostra:
  - Data de criação (formatada, ex: `10/07 14:32`)
  - Motivo → `labelForGroup(grupo_suporte)` › `labelForCategory(categoria_suporte)` (helpers já existentes em `@/lib/supportCategories`)
  - Status (`status_resolucao`) como badge colorido (aberto/resolvido)
  - Resumo (`resumo`) em texto pequeno quando existir
  - Nº do pedido (`order_number`) quando existir
- Estado vazio: texto discreto `Nenhum ticket de suporte`

## Como buscar os dados

Novo hook leve `src/hooks/useSupportCasesByContact.ts` seguindo o padrão do `useSupportCaseByConversation.ts` já existente:

- `select` de todas as colunas relevantes (`id, created_at, grupo_suporte, categoria_suporte, status_resolucao, resumo, order_number`)
- Filtra por `contact_id = activeChat.contactId` (retorna histórico completo do lead, não só da conversa atual)
- Ordena por `created_at desc`
- Assina realtime `INSERT/UPDATE` de `support_cases` para atualizar automaticamente quando a Nina abrir um novo ticket

No `ChatInterface.tsx`, chamar o hook com o `contactId` do `activeChat` e renderizar a lista.

## Fora de escopo

- Não muda a lógica de criação de tickets nem o roteamento fila `support`.
- Não altera schema do banco (todas as colunas já existem).
- Não mexe em Notas / Tags / Atividades.
