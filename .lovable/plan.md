## Objetivo
Restringir o que cada departamento vê na lista de conversas e permitir transferir um chat entre departamentos.

## Regras de visibilidade
- **Comercial / Admin** → vê todas as conversas (comportamento atual).
- **Produção** → vê apenas conversas cujo `assigned_team` seja o time **Produção**. (Como o fluxo de "Suporte" da Donatella já roteia para o time Produção, isso cobre "produção + suporte".)
- Usuário sem time definido → mantém visão completa (fallback seguro p/ não esconder dados de ninguém por engano).

A regra é aplicada como filtro client-side em cima de `conversations`, somando-se aos filtros já existentes (Geral / Meus / Arquivados, Responsável, Departamento). O dropdown manual de Departamento continua existindo, mas para usuários da Produção fica travado no próprio time.

## Como descobrir o "meu time"
Já temos `myMemberId` em `ChatInterface.tsx`. Vamos buscar também `team_id` do `team_members` do usuário logado e guardar em `myTeamId` + `myTeamName`. Admin (via `user_roles`) sempre é tratado como "vê tudo", independente do time.

## Transferência entre departamentos
No header do chat aberto (`ChatInterface.tsx`), adicionar um seletor/menu **"Departamento"** ao lado do seletor de Responsável já existente:
- Lista os times ativos (`teams`).
- Ao trocar, faz `update conversations set assigned_team = <novo> where id = <chat>` e registra uma system message ("Conversa transferida para {Time} por {usuário}").
- Disponível para Comercial e Admin. Para Produção, fica somente leitura (não pode "soltar" o ticket sem aprovação).

## Arquivos a alterar
- `src/components/ChatInterface.tsx`
  - Carregar `myTeamId` / `myTeamName` / `isAdmin`.
  - Aplicar filtro de visibilidade em `filteredConversations`.
  - Refletir restrição no `Select` de Departamento (Produção: travado no próprio time).
  - Adicionar controle de transferência de departamento no header da conversa aberta.
- `src/hooks/useConversationTabCounts.ts`
  - Receber `restrictTeamId` opcional e aplicar o mesmo filtro para os contadores das abas baterem com a lista exibida.
- `src/services/api.ts`
  - Pequeno helper `updateConversationTeam(conversationId, teamId)` + system message de transferência (reaproveitando padrão já usado em auto-assignment).

## Não muda
- Esquema do banco (já temos `conversations.assigned_team`, `team_members.team_id`, `user_roles`).
- RLS (continua permissiva single-tenant — visibilidade é de UX, não de segurança).
- Lógica do orquestrador / automações.

## Pergunta antes de implementar
Existem só dois times hoje: **Comercial** e **Produção**. Você quer que eu trate como regra fixa "Produção = visão restrita, qualquer outro time = visão total", ou prefere que isso vire uma configuração por time (ex.: checkbox "Este time vê apenas as próprias conversas") em **Configurações › Times**, deixando flexível para times futuros?