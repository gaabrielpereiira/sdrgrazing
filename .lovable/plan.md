## Mostrar nome do atendente nas mensagens internas

Hoje o WhatsApp Sender prefixa as mensagens humanas com `*Nome*:\n` antes de mandar para o cliente, mas no chat interno o conteúdo armazenado é o original (sem nome). Por isso vemos só o texto, sem saber qual atendente respondeu.

A boa notícia: cada mensagem humana já é salva no banco com `metadata.sender_user_id` (o id do auth user que enviou). Basta resolver esse id para um nome legível e exibir como label acima do balão, igual ao "tais sodre" / "Rafaela Ferreira" que aparece para o cliente.

### O que vai mudar

1. **Hook novo `useAttendantNames` (`src/hooks/useAttendantNames.ts`)**
   - Recebe uma lista de `userIds` (de `metadata.sender_user_id`).
   - Resolve cada um para um nome usando a mesma cascata do edge function:
     1. `team_members.name` por `id`
     2. `team_members.name` por `user_id`
     3. `profiles.full_name` por `user_id`
   - Faz uma única query batch (`in('user_id', ids)`) para `team_members` e `profiles`, e mantém um cache em memória para não refazer lookups.
   - Retorna `{ namesById: Record<string, string>, loading }`.

2. **`ChatInterface.tsx` — renderização do balão**
   - Coletar todos os `metadata.sender_user_id` distintos das mensagens da conversa ativa e passar pro hook.
   - Para cada mensagem com `direction === OUTGOING` e `fromType === 'human'`:
     - Se houver nome resolvido, exibir uma linha de cabeçalho dentro do balão (acima do conteúdo e abaixo do badge de template/reply, se houver):
       ```
       <span class="block text-[11px] font-semibold text-cyan-200 mb-1">
         {attendantName}
       </span>
       ```
     - Se não houver `sender_user_id` no metadata, fazer fallback para o `assigned_user_id` da conversa, e em último caso não mostrar nada (mensagens antigas continuam funcionando).
   - Cor do label: tom claro do gradiente do próprio balão (`text-cyan-100` para humano, mantém o `Bot` icon para Nina — Nina não recebe label de pessoa).
   - Não mexer em mensagens da Nina nem em mensagens recebidas (`fromType === 'user'`) — essas continuam como estão.

3. **Pequeno reuso**
   - O componente `replyToId` já usa `authorFor(replied)` para mostrar quem é o autor da mensagem citada. Vou estender `authorFor` para também consultar o mesmo `namesById` quando `fromType === 'human'`, assim a citação também mostra o atendente correto em vez de só "Você".

### Fora de escopo

- Não vou tocar no edge function `whatsapp-sender` (o prefixo enviado para o cliente continua igual).
- Não vou criar novas colunas no banco — o `metadata.sender_user_id` já é suficiente.
- Mensagens humanas antigas, sem `sender_user_id` no metadata, vão usar o `assigned_user_id` da conversa como fallback; se nem isso existir, ficam sem label (igual hoje).

### Arquivos afetados

- `src/hooks/useAttendantNames.ts` (novo)
- `src/components/ChatInterface.tsx` (render do balão e do reply preview)
