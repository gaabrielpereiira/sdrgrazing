## Diagnóstico confirmado

A correção de RLS foi aplicada com sucesso: `conversations` e `messages` já permitem que qualquer usuário autenticado acesse tudo. Então o erro que persiste não é mais o bloqueio do banco.

Encontrei duas causas restantes:

1. **Leads ainda somem para a Tais porque o frontend continua filtrando por papel**
   - No `ChatInterface`, usuários não-admin ainda usam `queueForRole(role)`.
   - Como a Tais tem papel `user`, o app busca só `queue = sales`.
   - No banco existem leads ativos em `support`, então eles continuam ocultos para ela mesmo com RLS corrigido.

2. **Versão antiga pode persistir por cache de app carregado em memória / assets antigos**
   - A versão publicada já está servindo `index.html` com `no-cache`.
   - Mas se a aba antiga ficou aberta, ou se o navegador reaproveitou JS carregado antes, o app pode continuar rodando código antigo até detectar uma nova versão ou forçar reload.

## Plano de correção

### 1. Remover filtro por papel no Chat
Alterar `src/components/ChatInterface.tsx` para que todos os usuários vejam a fila geral:

- `queueForFetch` deve ser sempre `all`.
- A aba principal deve parar de esconder suporte de usuários `user`.
- `queue` continua existindo apenas como etiqueta visual e para mover conversas entre Vendas/Suporte, mas não como bloqueio de visibilidade.

Resultado: Tais e qualquer outro usuário verão todas as conversas ativas/finalizadas, independente de `sales` ou `support`.

### 2. Ajustar contadores das abas para refletirem o total real
Como o chat será compartilhado para todos:

- A aba de ativas deve mostrar `activeTotal`.
- A aba de finalizadas deve mostrar `finishedTotal`.
- Evita a situação em que o contador mostra só vendas enquanto há conversas de suporte ocultas.

### 3. Adicionar verificação automática de nova versão no app
Criar um mecanismo leve no frontend para detectar quando o `index.html` publicado mudou:

- Buscar periodicamente o HTML atual com `cache: 'no-store'`.
- Extrair o arquivo `/assets/index-*.js` atual.
- Comparar com o script carregado na sessão.
- Se mudou, mostrar um toast: “Nova versão disponível” com botão “Atualizar”.

Resultado: se Tais estiver com aba antiga aberta, o próprio sistema avisa e permite recarregar para a versão nova.

### 4. Adicionar fallback de recarregamento seguro
Além do toast, ao voltar para a aba depois de um tempo, o app checa novamente a versão. Isso reduz casos de computador que ficou com o sistema aberto por horas/dias.

## Arquivos previstos

- `src/components/ChatInterface.tsx`
- Novo hook/componente pequeno para version-check, por exemplo `src/hooks/useVersionCheck.ts` ou integração em `src/App.tsx`

## Validação

Após implementar:

- Conferir que usuários `user` não filtram mais `queue = sales`.
- Conferir que a consulta de conversas passa `queue: all`.
- Conferir que a versão publicada já tem headers/metas anti-cache e que o novo aviso cobre abas antigas em memória.