## Problema

Quando você sai da aba do navegador e volta, dois sintomas aparecem:

1. A tela mostra "Carregando..." de novo, como se estivesse sincronizando do zero.
2. A conversa que estava aberta no chat troca sozinha (volta para a primeira da lista).

## Causa

Ao voltar para a aba, o Supabase dispara um evento `TOKEN_REFRESHED` no `onAuthStateChange`. O hook `useAuth` (`src/hooks/useAuth.tsx`) hoje:

- Substitui `user` por um **novo objeto** mesmo quando é o mesmo usuário.
- Isso reexecuta o `useEffect` que carrega `role`, ativando `roleLoading = true`.
- O `ProtectedRoute` (`src/components/ProtectedRoute.tsx`) tem a condição `if (loading || (user && roleLoading))` → mostra o spinner de "Carregando..." e **desmonta** o `ChatInterface`.
- Ao remontar, o `selectedChatId` (estado local) é perdido e o efeito de auto-seleção coloca a primeira conversa da lista.

Ou seja: o problema não é o fetch das conversas (esse já preserva mensagens), e sim a remontagem da árvore por causa do `roleLoading` disparado a cada refresh de token.

## Plano

Mudanças mínimas, só em frontend, para parar de remontar a tela em refresh de token.

### 1. `src/hooks/useAuth.tsx`
- No callback do `onAuthStateChange`, só atualizar `user`/`session` quando o `user.id` mudar de fato (login, logout ou troca de conta). Token refresh com mesmo usuário não dispara mais re-render do `user`.
- O efeito que carrega `role` depende de `user?.id` em vez do objeto `user`. Assim, refresh de token não reabre o estado `roleLoading = true`.
- Manter o `setLoading(false)` para o estado inicial.

### 2. `src/components/ProtectedRoute.tsx`
- Trocar a guarda para mostrar o spinner apenas **na primeira carga**, não em refreshes posteriores. Usar um ref `hasLoadedOnce` que vira `true` quando `loading` e `roleLoading` ficam `false` pela primeira vez. Depois disso, mesmo que `roleLoading` volte a ser `true` por algum motivo, a tela continua renderizada com o conteúdo atual em vez de desmontar.

### 3. (defesa extra) `src/components/ChatInterface.tsx`
- No efeito de auto-seleção (linhas ~400–425), não trocar `selectedChatId` se o id atual ainda existe na lista. A lógica já faz isso, mas confirmar que nenhum dos `useEffect` que resetam seleção (`chatTab`, `mainTab`) está disparando à toa em refresh de token. Não muda comportamento se o passo 1 e 2 resolverem; serve só como verificação após o fix.

## Resultado esperado

- Ao voltar para a aba, nada de spinner "Carregando...".
- A conversa aberta continua selecionada.
- Mensagens novas que chegaram durante a ausência aparecem normalmente via realtime/polling, sem reset visual.

Sem mudanças de schema, RLS ou backend.
