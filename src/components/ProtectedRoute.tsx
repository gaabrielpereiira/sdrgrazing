import React, { useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, defaultRouteForRole, AppRole } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** If set, only these roles can access. Otherwise any authenticated user. */
  allowedRoles?: AppRole[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, loading, role, roleLoading } = useAuth();
  const location = useLocation();

  // Track whether we've completed the initial auth load. Once true, we never
  // show the full-screen spinner again — token refreshes or background role
  // re-fetches must NOT unmount the app (would lose chat state, etc.).
  const hasLoadedOnceRef = useRef(false);
  const stillInitialLoading = loading || (user && roleLoading);
  useEffect(() => {
    if (!stillInitialLoading) hasLoadedOnceRef.current = true;
  }, [stillInitialLoading]);

  if (stillInitialLoading && !hasLoadedOnceRef.current) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    // Redirect to the role's default landing (avoid loop if same path)
    const fallback = defaultRouteForRole(role);
    if (fallback !== location.pathname) {
      return <Navigate to={fallback} replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
