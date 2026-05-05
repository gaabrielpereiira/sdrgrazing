# Corrigir separadores de data no chat

## Problema

No print, a conversa do Cy aparece como "Ontem" na lista lateral, mas dentro do chat o cabeçalho mostra **"Hoje"** acima de mensagens enviadas em 22:17 / 22:18 / 22:19 de ontem.

Causa: em `src/components/ChatInterface.tsx` (linha ~1175), o separador de data é uma string fixa:

```tsx
<span ...>Hoje</span>
```

Não existe nenhum cálculo baseado em `msg.sent_at`. Por isso toda conversa mostra "Hoje", independente do dia real das mensagens. Também não há separador quando mensagens passam de um dia para outro dentro da mesma conversa.

## Solução

Tornar o separador dinâmico, agrupando as mensagens por dia (no fuso horário local) e renderizando um chip de data antes do primeiro item de cada grupo.

### Mudanças

1. **`src/types.ts`**
   - Expor `sent_at` cru no `UIMessage` (campo novo `sentAt: string`) ou já incluir, para podermos comparar datas no front sem reparsear strings exibidas. Atualizar `transformDBToUIMessage` para popular esse campo.
   - Atualizar todos os pontos que criam `UIMessage` "otimistas" em `useConversations.ts` (sendMessage, sendMediaMessage, sendTemplateMessage) para também setar `sentAt: new Date().toISOString()`.

2. **`src/components/ChatInterface.tsx`**
   - Remover o bloco fixo `<span>Hoje</span>`.
   - Criar helper `formatDaySeparator(date: Date)` que retorna:
     - `"Hoje"` se for o mesmo dia local
     - `"Ontem"` se for o dia anterior
     - Nome do dia da semana (`"Segunda-feira"`) se < 7 dias
     - Caso contrário `DD/MM/YYYY` via `toLocaleDateString('pt-BR')`
   - No `.map(messages)`, manter um cursor `lastDayKey` (ex.: `YYYY-MM-DD` local). Antes de cada mensagem, se a data muda, renderizar o chip com `formatDaySeparator`.

3. **Comparação de dias**
   - Usar comparação por dia de calendário local (mesma lógica já existente em `formatRelativeTime`: `new Date(y, m, d).getTime()`), evitando `new Date(string)` direto para datas sem timezone.

## Detalhes técnicos

- Manter o estilo visual atual do chip (`px-4 py-1.5 bg-slate-800/80 ...`).
- O cabeçalho "fixo" no topo é removido — o primeiro chip será o do dia da primeira mensagem.
- Mensagens otimistas (`temp-*`) usam `new Date()` agora, então naturalmente caem em "Hoje".
- Não mexer em `formatMessageTime` (HH:MM dentro do balão continua igual).

## Arquivos

- `src/types.ts` — adicionar `sentAt` a `UIMessage` + popular em `transformDBToUIMessage`.
- `src/hooks/useConversations.ts` — popular `sentAt` nas 3 mensagens otimistas.
- `src/components/ChatInterface.tsx` — substituir chip fixo "Hoje" por separadores dinâmicos por dia.
