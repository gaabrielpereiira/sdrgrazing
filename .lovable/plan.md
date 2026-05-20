## Objetivo
Ordenar a lista de conversas do chat com a seguinte prioridade fixa (de cima para baixo):

1. **Pendentes** — última mensagem do cliente (ou IA encaminhou pra humano e ninguém respondeu)
2. **Tarefas vencidas** — atividade agendada cujo horário já passou
3. **Tarefas a vencer** — atividade agendada futura
4. **Demais conversas** — ordenadas pela data/hora da última mensagem (mais recente primeiro)

Dentro de cada grupo, o desempate continua sendo pela última mensagem mais recente.

## Onde mudar
Apenas `src/components/ChatInterface.tsx`, no bloco que constrói `filteredConversations` (≈ linhas 787–797). Nenhuma mudança de banco, hook ou backend — `isPending()` e `useAllPendingActivities()` já existem no arquivo.

## Lógica de ordenação

Para cada conversa calculamos um "bucket" (quanto menor, mais no topo):

```text
0 → Pendente (isPending(chat) === true)
1 → Tem tarefa vencida   (pendingActivities[chat.id] && nextAt <= now)
2 → Tem tarefa a vencer  (pendingActivities[chat.id] && nextAt  > now)
3 → Nenhuma das anteriores
```

Regra de empate:
- Bucket 0 (Pendentes): pelas mais recentes primeiro (`lastMessageAt` desc).
- Bucket 1 (Vencidas): pela tarefa mais antiga primeiro (vencida há mais tempo no topo).
- Bucket 2 (A vencer): pela tarefa mais próxima de vencer primeiro.
- Bucket 3: `lastMessageAt` desc (comportamento atual).

Uma conversa pode ser Pendente E ter tarefa — Pendente vence (bucket 0), conforme prioridade pedida.

## Implementação (resumo)

Substituir o `.filter(...)` atual por `.filter(...).sort((a, b) => ...)` usando uma função `bucketOf(chat)` baseada em `isPending` e `pendingActivities[chat.id]`. Toda a lógica fica encapsulada dentro do componente, sem alterar tipos nem outros hooks.

## Fora de escopo
- Não vou criar indicadores visuais novos (os badges de pendente e de tarefa já existem na lista).
- Não vou mexer em filtros das abas (Geral / Finalizadas / Minhas) — só na ordenação dentro da aba ativa.
- Sem migrations, sem mudanças de realtime.

## Resultado
Conversas que precisam de atenção (cliente esperando resposta, tarefas vencidas, tarefas próximas) sobem automaticamente para o topo da lista, e a reordenação acontece em tempo real conforme mensagens chegam ou atividades são criadas/concluídas — já que tanto `conversations` quanto `pendingActivities` atualizam via realtime.