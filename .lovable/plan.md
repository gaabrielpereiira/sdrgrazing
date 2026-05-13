## Reestruturar abas do Chat

Hoje há **dois níveis de abas** na coluna de conversas:
1. Topo: `Atendimento | Suporte` (escolhe a fila)
2. Abaixo: `Ativas | Finalizadas` (escolhe o status)

Vou colapsar para **um único nível com 3 abas**:

```
Atendimento  |  Suporte  |  Finalizadas
```

### Mudanças em `src/components/ChatInterface.tsx`

- Remover o segundo bloco de `<Tabs>` (linhas ~1012–1027) que tinha `Ativas | Finalizadas`.
- Transformar o `<Tabs>` superior em 3 colunas (`grid-cols-3`):
  - **Atendimento** → fila `sales` + apenas `is_active = true`. Contador = `tabCounts.activeSales`.
  - **Suporte** → fila `support` + apenas `is_active = true`. Contador = `tabCounts.activeSupport`.
  - **Finalizadas** → todas as conversas `is_active = false` (sales **e** support juntos). Contador = `tabCounts.finishedSales + tabCounts.finishedSupport`.
- Substituir o estado atual `queueTab` (`'sales' | 'support'`) e `chatTab` (`'active' | 'finished'`) por **um único estado** `mainTab: 'atendimento' | 'suporte' | 'finalizadas'`.
- Ajustar `effectiveQueue` e a lógica de filtragem das conversas:
  - `atendimento` → queue=sales, isActive=true
  - `suporte` → queue=support, isActive=true
  - `finalizadas` → isActive=false (sem filtro de fila)
- Manter os badges de não lidas (`queueUnread.sales`/`.support`) nas abas Atendimento e Suporte.
- O badge de fila no header ("Atendimento"/"Suporte") passa a refletir a aba atual; em "Finalizadas" mostro um rótulo neutro tipo "Finalizadas".
- A aba só aparece para `isAdmin` hoje; manter o mesmo gate (não-admin continua vendo só sua fila — nesse caso mostro `Ativas | Finalizadas` daquela fila, ou removo de vez? Vou **manter o mesmo comportamento atual** para não-admin: a versão de 3 abas só vale para admin; não-admin continua com `Ativas | Finalizadas` da sua fila).

### Fora de escopo
- Hooks de contagem (`useConversationTabCounts`) — já retornam tudo que preciso.
- Lógica de envio/recebimento de mensagem.
- Layout mobile (já feito na Leva 1).

### Pergunta única antes de implementar
A aba **Finalizadas** deve juntar conversas finalizadas de **Atendimento + Suporte** num só lugar (interpretação direta do seu desenho), correto? Se preferir que continue separado por fila, me avise — caso contrário sigo com a versão unificada.
