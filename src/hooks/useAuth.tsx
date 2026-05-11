import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'sdr' | 'support' | 'user' | 'moderator';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole | null;
  roleLoading: boolean;
  isAdmin: boolean;
  isSDR: boolean;
  isSupport: boolean;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load role whenever user changes
  useEffect(() => {
    let cancelled = false;
    const loadRole = async () => {
      if (!user) {
        setRole(null);
        setRoleLoading(false);
        return;
      }
      setRoleLoading(true);
      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);
        if (cancelled) return;
        if (error) {
          console.error('[useAuth] role fetch error', error);
          setRole('user');
        } else if (data && data.length > 0) {
          // Priority: admin > support > sdr > user
          const rs = data.map(r => r.role as AppRole);
          if (rs.includes('admin')) setRole('admin');
          else if (rs.includes('support')) setRole('support');
          else if (rs.includes('sdr')) setRole('sdr');
          else setRole(rs[0]);
        } else {
          setRole('user');
        }
      } finally {
        if (!cancelled) setRoleLoading(false);
      }
    };
    loadRole();
    return () => { cancelled = true; };
  }, [user]);

  const signUp = async (email: string, password: string, fullName?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName || '',
        },
      },
    });
    
    if (!error && data.user) {
      try {
        await supabase.functions.invoke('initialize-system', {
          body: { user_id: data.user.id },
        });
      } catch (initError) {
        console.error('Error initializing system:', initError);
      }
    }
    
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      user, session, loading,
      role, roleLoading,
      isAdmin: role === 'admin',
      isSDR: role === 'sdr',
      isSupport: role === 'support',
      signUp, signIn, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/** Helper: compute the queue this role can see (or null = all). */
export function queueForRole(role: AppRole | null): 'sales' | 'support' | null {
  if (role === 'support') return 'support';
  if (role === 'sdr' || role === 'user') return 'sales';
  return null; // admin/moderator/null = no client filter
}

/** Default landing route for a role after login. */
export function defaultRouteForRole(role: AppRole | null): string {
  if (role === 'support') return '/chat';
  if (role === 'sdr' || role === 'user') return '/chat';
  return '/dashboard';
}
