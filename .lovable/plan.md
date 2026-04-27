## Atualizar badge de Atividades & Lembretes — mostrar data/hora

### Resumo
Substituir o badge de contagem (`{pending.length}`) no header do painel **Atividades & Lembretes** pela **data e hora da atividade pendente mais próxima**.

### Alteração
**Arquivo:** `src/components/chat/ActivitiesPanel.tsx`

- No header do painel (linha 114–118), em vez de exibir a contagem de pendentes em um badge ciano, exibir a data e hora (`DD/MM HH:mm`) da primeira atividade pendente — que já está ordenada por `scheduled_at` ascending.
- Remover o import do ícone `Bell` se deixar de ser usado no componente.

### Exemplo do resultado
```
Atividades & Lembretes    27/04 14:30    [+]
```

Ao invés de:
```
Atividades & Lembretes    [3]    [+]
```