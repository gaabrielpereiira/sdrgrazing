## Objetivo
Reforçar a aba "Suporte" já existente no topo da lista de conversas em `/chat`, com visual mais claro de aba independente e contador de não lidas por fila.

## Mudanças (somente frontend, em `src/components/ChatInterface.tsx`)

1. **Visual das abas Atendimento | Suporte** (admin)
   - Manter o componente `Tabs`, mas reestilizar para ficar mais alto e com ícones (`Bot` para Atendimento, `LifeBuoy` para Suporte) ao lado do label.
   - Trigger ativo ganha cor própria por fila: ciano para Atendimento, âmbar/laranja para Suporte, alinhado ao restante do design system (tokens em `index.css` / `tailwind.config`).
   - Mostrar badge com contador de não lidas em cada aba (somando `unreadCount` das conversas daquela fila no fetch atual).

2. **Contador de não lidas por fila**
   - Para o admin, fazer um segundo fetch leve só de `id, queue, unread` (ou reutilizar `useConversations` com `queue:'all'` em paralelo) — opção mais simples: um hook adicional `useQueueUnreadCounts()` que faz `select id, queue` em `conversations` + count de mensagens com `from_type='user' and read_at is null` agrupado por fila. Atualiza a cada 30s e em eventos realtime de `messages`.
   - Para SDR/Suporte (que veem só a sua fila), mostrar apenas o badge da própria fila no header da lista — sem chamadas extras.

3. **Header da lista**
   - Substituir o `<h2>Conversas · Suporte/Atendimento` atual por:
     - Título grande "Conversas".
     - Linha abaixo com o nome da fila ativa em pill colorida (ciano/âmbar).

4. **Indicador "novas/não lidas" nas conversas** (já existe parcialmente)
   - Manter ponto pulsante ciano + badge numérica.
   - Em conversas de Suporte na lista, trocar a borda esquerda do item selecionado para âmbar quando `chat.queue === 'support'`, deixando claro o contexto.

5. **Reset de seleção** ao trocar `queueTab` (hoje só reseta em `chatTab`): adicionar `useEffect(() => setSelectedChatId(null), [queueTab])` para evitar painel direito mostrando conversa de outra fila.

## Fora de escopo
- Roteamento automático IA → fila Suporte (continua próxima iteração).
- Rota dedicada `/support` na sidebar (descartado).
- Mudanças de backend / RLS (já implementadas).

## Validação
- Admin: alternar Atendimento/Suporte mostra cores distintas; badges de não lidas refletem o estado real; trocar aba zera seleção.
- SDR e Suporte: continuam vendo só sua fila, sem as abas, com badge da própria fila.