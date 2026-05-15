# Atualização em segundo plano nas abas de Automações

## Problema
Hoje, ao trocar entre **Regras / Painel / Eventos recebidos**, o componente da aba anterior é desmontado e o da nova é montado do zero. Isso dispara:
- Novo `fetch` em `AutomationsDashboard` (logs + events + rules nos últimos N dias)
- Novo `fetch` em `WebhookEventsMonitor` (últimos 100 eventos)
- Novo canal Realtime sendo criado/destruído a cada troca

Resultado: o usuário vê spinner e "recarregamento" toda vez que troca de aba, mesmo que os dados já tivessem sido carregados há segundos.

## Solução
Manter as três abas **sempre montadas** dentro de `Automations.tsx`, alternando apenas a visibilidade. Os componentes seguem com seus dados em memória + Realtime ativo em background, então trocar de aba passa a ser instantâneo e novas alterações chegam sem precisar reabrir a aba.

### Mudanças

**1. `src/components/Automations.tsx`**
- Substituir o `tab === 'x' ? <A/> : tab === 'y' ? <B/> : <C/>` por três wrappers irmãos com `hidden={tab !== 'x'}` (ou classe `hidden`).
- Extrair o conteúdo da aba "Regras" (search + tabela/cards + empty state) num bloco condicionalmente visível, igual aos outros.
- Os modais (`AutomationFormModal`, `AutomationLogsModal`, `SimulateWebhookModal`) continuam no mesmo lugar.

**2. `src/components/AutomationsDashboard.tsx`** (pequeno ajuste de UX)
- Manter `setLoading(true)` somente no **primeiro** carregamento. Em mudanças de range, fazer fetch em background sem trocar a tela inteira por spinner (usar um `refreshing` discreto ou apenas atualizar os dados).
- Já existe Realtime indireto via subscriptions do `useAutomations`, mas o dashboard hoje só recarrega quando `range` muda. Adicionar uma subscription leve a `automation_logs` e `webhook_events` para refletir novas execuções sem precisar trocar de aba.

**3. `src/components/WebhookEventsMonitor.tsx`** (pequeno ajuste de UX)
- O `load` atual já não seta `loading=true` em recargas subsequentes (bom). Apenas garantir que a primeira chamada use `loading` e as recargas via Realtime sejam silenciosas (já é o comportamento — só confirmar).

### Observações
- Sem mudanças de schema, edge functions ou lógica de negócio.
- Sem impacto em outras telas; o padrão "tabs montadas em paralelo" fica restrito a `Automations.tsx`.
- Custo de manter tudo montado é baixo: cada aba mantém ~100–2000 linhas em memória e um canal Realtime — bem dentro do orçamento.

## Detalhes técnicos
```tsx
// Automations.tsx (resumo)
<div hidden={tab !== 'rules'}>     {/* bloco de regras */} </div>
<div hidden={tab !== 'dashboard'}> <AutomationsDashboard /> </div>
<div hidden={tab !== 'events'}>    <WebhookEventsMonitor /> </div>
```
Usar `hidden` (atributo HTML) preserva DOM e estado React, e evita o `display:none` ser sobrescrito por classes Tailwind.
