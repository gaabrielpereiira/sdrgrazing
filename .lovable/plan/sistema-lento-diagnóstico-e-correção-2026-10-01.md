# Sistema lento: diagnóstico e correção

## O que encontrei

O banco de dados está funcionando (sem quedas, disco em 33%, conexões moderadas). O problema está em **uma consulta repetida sem parar**:

- O contador de **mensagens não lidas** (as bolinhas de Vendas/Suporte na tela de Conversas) já rodou **147 mil vezes**. Cada vez leva em média 0,26 s e às vezes até 8 s. No total, ocupou o banco por mais de **10 horas**, mais do que todas as outras consultas somadas.
- Por quê: ele refaz a contagem do zero **a cada mensagem nova ou alterada** e a cada conversa atualizada, em cada tela aberta. Com a Donatella respondendo e mensagens sendo marcadas como lidas, isso dispara dezenas de vezes por minuto. Para achar as 22 não lidas, ele vasculha as 47 mil mensagens, porque falta um atalho no banco para isso.
- O contador das abas (Geral/Meus/Arquivados e tickets de suporte) faz algo parecido: rodou 96 mil vezes, baixando todas as 2.688 conversas e 316 tickets a cada mudança.
- Enquanto o banco está ocupado com isso, todo o resto (abrir conversa, enviar mensagem, painel) fica esperando. Esse é o motivo da lentidão.

## O que vou fazer

1. **Criar um atalho no banco para mensagens não lidas.** A contagem passa a olhar só as poucas mensagens não lidas, e não as 47 mil.
2. **Fazer a contagem no próprio banco.** Em vez de baixar listas inteiras para o navegador e contar lá, o banco devolve só os números prontos (não lidas por fila e totais das abas).
3. **Agrupar as atualizações.** Quando chegarem várias mensagens seguidas, o contador espera cerca de 2 s e atualiza uma vez só. Ele também para de atualizar quando a aba do navegador fica em segundo plano.
4. **Ajuste leve nas regras de acesso** de mensagens e conversas, para o banco checar a permissão uma vez por consulta, e não uma vez por linha. Quem pode ver o quê continua igual.
5. **Medir de novo** depois da mudança para confirmar que a consulta saiu do topo e que o sistema ficou rápido.

Os números das bolinhas e das abas continuam exatamente iguais. Só vão ficar mais leves e rápidos.

## Detalhes técnicos

- Índice parcial: `messages (conversation_id) WHERE from_type = 'user' AND read_at IS NULL`.
- Funções SQL `get_queue_unread_counts()` e `get_conversation_tab_counts(_member_id, _team_id)` (`security invoker`, `stable`), chamadas via `rpc` em `useQueueUnreadCounts.ts` e `useConversationTabCounts.ts`. A segunda devolve também os IDs das conversas com ticket aberto.
- Debounce de ~2 s nos handlers de realtime, com pausa quando `document.hidden`. O intervalo de 30 s continua como reserva.
- Políticas RLS reescritas com `(select auth.role()) = 'authenticated'` (initplan), mantendo o mesmo comportamento.
- Validação: `slow_queries` e `db_health` antes e depois, e contagens iguais às atuais (22 não lidas).
