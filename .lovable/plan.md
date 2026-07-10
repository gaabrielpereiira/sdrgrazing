## Problema
No card da conversa (aba Chat), quando a conversa está na fila `support` mas ainda não existe registro em `support_cases` (ex: foi movida manualmente com um "motivo" simples via popover "→ Suporte"), o chip cai no fallback e mostra apenas "Suporte" em vez do motivo escolhido.

## Solução
Ampliar o fallback do chip de suporte em `src/components/ChatInterface.tsx` (bloco `chat.queue === 'support'`, ~linha 1442) para, na seguinte ordem:

1. Se existir `support_cases` (categorização estruturada da Nina) → mostrar o `labelForGroup(sc.grupo)` com a cor do grupo, como já faz hoje. Tooltip: `Suporte • <categoria>`.
2. Senão, procurar em `chat.tags` uma tag `motivo:*` (`isReasonTag`/`reasonKeyFromTag` de `@/lib/supportReasons`) e mostrar `labelForReasonKey(key)` — cor âmbar/rose neutra. Tooltip: `Motivo: <label>`.
3. Só se nenhum dos dois existir → manter o chip "Suporte" vermelho atual.

Nada além disso muda (mesma altura, ícone LifeBuoy, mesmo posicionamento). Nenhuma migração, edge function ou dashboard é tocada.

## Arquivos
- `src/components/ChatInterface.tsx`: adicionar imports de `isReasonTag`, `reasonKeyFromTag`, `labelForReasonKey` (de `@/lib/supportReasons`) e substituir o bloco do chip de suporte pela lógica de 3 níveis acima.
