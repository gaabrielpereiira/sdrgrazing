# Bug: Histórico de conversas longas é truncado

## Diagnóstico

Investiguei a conversa da Cintia (`5513996390706`) no banco:

- A conversa **tem 132 mensagens** salvas (de 05/05 a 09/05).
- A UI carrega só uma fração delas, então parece que "sumiu" o histórico.

A causa está em `src/services/api.ts`, função `fetchConversations` (linha ~1390):

```ts
.from('messages')
.select('*')
.eq('conversation_id', conv.id)
.order('sent_at', { ascending: true })   // ← ordena do mais ANTIGO pro mais NOVO
.limit(100);                              // ← pega só 100
```

Ordenando ascendente + `limit(100)` o Postgres retorna as **100 mensagens mais antigas**, e descarta as mais recentes quando há mais de 100. Confirmado via query:

- Total: 132 mensagens
- Retornadas pelo limit(100) asc: 05/05 → **07/05** (faltam 32 das mais recentes)

As mensagens dos últimos dias só aparecem porque o **realtime** vai inserindo-as conforme chegam. **Quando o realtime cai e o polling refaz o `fetchConversations`** (a cada 10s no fallback), o estado é sobrescrito pelas 100 antigas — e as mensagens recentes desaparecem da UI até a próxima chegar pelo realtime.

Esse mesmo padrão também aparece no `simulate-webhook` e em qualquer recarregamento da página: usuários com conversas longas vêem só as mensagens antigas + as que entrarem em tempo real.

## Correção proposta

### 1. `src/services/api.ts` — `fetchConversations` (linha ~1390)

Trocar a ordenação para **descendente** e aumentar o teto, garantindo que as mais recentes (que são as que importam na UI) sejam sempre carregadas. O `transformDBToUIConversation` já reordena ascendente para exibir, então a UI continua igual.

```ts
.order('sent_at', { ascending: false })   // pega as mais NOVAS
.limit(300);                               // teto maior pra cobrir conversas longas
```

300 cobre conversas bem ativas sem carregar payload demais. Se a conversa tiver mais que isso, ainda assim o usuário verá as 300 mais recentes (não as mais antigas).

### 2. `src/hooks/useConversations.ts` — `fetchAndAddConversation` (linha ~56)

Mesma correção defensiva (atualmente não tem limit, mas deixar consistente):

```ts
.order('sent_at', { ascending: false })
.limit(300);
```

### 3. Polling fallback

Não precisa mudar — uma vez que `fetchConversations` retorne as mensagens recentes, o polling para de "apagar" o histórico recente.

## Fora de escopo

- Paginação infinita (carregar mensagens antigas sob demanda ao rolar pra cima). Vale a pena num próximo passo, mas exige mudanças maiores no `ChatInterface` e na assinatura de realtime. Posso abrir como melhoria separada se quiser.
- Mudança no schema/RLS — não é necessária.

## Arquivos afetados

- `src/services/api.ts`
- `src/hooks/useConversations.ts`
