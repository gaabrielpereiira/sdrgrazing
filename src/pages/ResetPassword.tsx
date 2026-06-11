import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Lock, ArrowRight, Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BrandLogo } from '@/components/BrandLogo';

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(null);

  useEffect(() => {
    // Supabase parses the recovery token from the URL hash and emits a PASSWORD_RECOVERY event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setHasRecoverySession(true);
      }
    });

    // Also check existing session (in case the event already fired before mount).
    supabase.auth.getSession().then(({ data: { session } }) => {
      const hash = window.location.hash || '';
      const isRecovery = hash.includes('type=recovery');
      if (session || isRecovery) {
        setHasRecoverySession(true);
      } else {
        setHasRecoverySession(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast.error('Senha deve ter pelo menos 6 caracteres');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('Senha atualizada com sucesso!');
      await supabase.auth.signOut();
      navigate('/auth', { replace: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1D1F2A] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="fixed top-0 left-0 w-[600px] h-[600px] bg-brand-gold-500/5 rounded-full blur-[160px] pointer-events-none -translate-x-1/3 -translate-y-1/3 z-0" />
      <div className="fixed bottom-0 right-0 w-[600px] h-[600px] bg-brand-gold-600/5 rounded-full blur-[160px] pointer-events-none translate-x-1/3 translate-y-1/3 z-0" />

      <div className="w-full max-w-md relative z-10">
        <div className="flex flex-col items-center mb-10">
          <BrandLogo variant="stacked" size={56} asLink={false} />
          <p className="text-muted-foreground mt-6 text-sm">Defina sua nova senha</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
          {hasRecoverySession === null ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-brand-gold-500" />
            </div>
          ) : hasRecoverySession === false ? (
            <div className="text-center space-y-4">
              <p className="text-foreground">Link inválido ou expirado.</p>
              <p className="text-muted-foreground text-sm">
                Solicite um novo link de recuperação na tela de login.
              </p>
              <Button variant="primary" size="lg" className="w-full" onClick={() => navigate('/auth')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar para o login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground">Nova senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-foreground">Confirmar nova senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <Button type="submit" variant="primary" size="lg" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-2" />
                )}
                Atualizar senha
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
