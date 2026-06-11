## Objetivo
Adicionar fluxo completo de recuperação de senha na tela de login existente.

## Escopo
1. **Tela de login (`src/pages/Auth.tsx`)**
   - Adicionar link "Esqueci minha senha" abaixo do campo de senha.
   - Ao clicar, exibir um pequeno formulário com apenas o campo de email para enviar o link de recuperação.
   - Usar `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' })`.
   - Exibir toast de confirmação após envio.

2. **Nova página pública `/reset-password`**
   - Criar `src/pages/ResetPassword.tsx`.
   - Verificar `type=recovery` no hash da URL ao montar o componente.
   - Exibir formulário com campo "Nova senha" e "Confirmar nova senha".
   - Chamar `supabase.auth.updateUser({ password })` ao submeter.
   - Após sucesso, redirecionar para `/auth` com toast "Senha atualizada com sucesso".
   - Se não houver token de recovery válido, mostrar mensagem de erro e link para voltar ao login.

3. **Roteamento (`src/App.tsx`)**
   - Adicionar rota pública `<Route path="/reset-password" element={<ResetPassword />} />` fora do `ProtectedRoute`.

## Notas técnicas
- A página `/reset-password` deve ser pública (sem `ProtectedRoute`).
- Sem mudanças no backend — Supabase Auth já gerencia tokens de recovery.
- Sem mudanças no schema do banco.
- Não é necessário configurar email customizado para isso funcionar; os emails de recovery do Supabase Auth (padrão ou customizados via Lovable Emails) já entregam o link corretamente.