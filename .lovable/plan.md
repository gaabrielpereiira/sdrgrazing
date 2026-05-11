## Escalada automática Donatella → Suporte

Hoje, quando a IA chama `request_human_handoff` (ou cai no safety-net), a conversa só recebe `status = 'human'` e uma notificação. Ela continua na fila `sales`, então não aparece na aba Suporte e a Donatella pode voltar a responder. As permissões por aba (Atendimento × Suporte) já estão cobertas pelo `user_queue_access` + RLS e pelas tabs no `ChatInterface`, então o trabalho restante é só no momento da escalada.

### Mudanças (somente backend, em `supabase/functions/nina-orchestrator/index.ts`)

1. **Mover a conversa para a fila Suporte no handoff**
   - No bloco `if (toolCall.function?.name === 'request_human_handoff')` (~linha 943), além de `status: 'human'`, atualizar também `queue: 'support'` na mesma chamada `update`.
   - Replicar no safety-net (~linha 1036) que detecta texto interno de handoff.
   - Resultado: a conversa some da aba Atendimento e aparece imediatamente na aba Suporte (a UI já escuta realtime de `conversations`).

2. **Pausar a Donatella naquela conversa**
   - Já existe o early-skip em `~linha 200`: `if (conversation.queue === 'support') { skip Nina }`. Como agora o handoff muda a fila para `support`, qualquer mensagem futura do cliente naquela conversa será ignorada pela IA automaticamente, até que um humano mova a conversa de volta manualmente.
   - Nada precisa ser feito na resposta atual: a IA ainda envia a última mensagem amigável que ela mesma gerou ao chamar a tool; mensagens subsequentes não disparam mais resposta da IA.

3. **Sinalização de "nova conversa pendente para o suporte"**
   - A notificação `handoff_requested` / `handoff_urgent` já é criada (sino de notificações).
   - O badge da aba Suporte (`useQueueUnreadCounts`) passa a contar essa conversa porque ela agora vive em `queue = 'support'` e a próxima mensagem do cliente fica como não lida.

4. **Histórico preservado**
   - Nenhuma mensagem é movida/duplicada — só muda `queue` e `status` da `conversation`. Toda a troca anterior com a Donatella permanece visível ao abrir a conversa na aba Suporte.

### Fora de escopo (já existe)

- Tabs Atendimento/Suporte e badges de não lidas no `ChatInterface`.
- RLS por fila (`user_queue_access`): SDR só vê `sales`, Suporte só vê `support`, Admin vê ambas — já implementado nas migrations anteriores.
- Tela e fluxo de chat idênticos entre as abas (mesmo componente).

### Reativar Donatella manualmente (opcional, deixar para depois se não pedido agora)

Não vou adicionar UI nova nesta etapa. A reativação manual hoje já é possível mudando a `queue` da conversa de volta para `sales` (via DB ou via uma futura ação "Devolver para IA" no header do chat). Se quiser que eu adicione esse botão agora, me avise no aprovar.

### Arquivos tocados

- `supabase/functions/nina-orchestrator/index.ts` — 2 pequenos updates (handoff + safety-net) para incluir `queue: 'support'`.
