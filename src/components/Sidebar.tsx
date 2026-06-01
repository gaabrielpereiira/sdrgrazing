import React, { useState } from 'react';
import { LayoutDashboard, MessageSquare, Users, Settings as SettingsIcon, LogOut, ShieldCheck, Calendar, Kanban, FileText, Zap } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Sidebar, SidebarBody, SidebarLink, useSidebar } from '@/components/ui/sidebar';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { BrandLogo, GrazingMark } from '@/components/BrandLogo';
import { NotificationsBell } from '@/components/NotificationsBell';
import { useIsMobile } from '@/hooks/use-mobile';

type MenuRole = 'admin' | 'sdr' | 'support' | 'user';

const menuItems: { id: string; label: string; icon: any; roles: MenuRole[] }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin','sdr','user'] },
  { id: 'pipeline', label: 'Pipeline', icon: Kanban, roles: ['admin','sdr','user'] },
  { id: 'chat', label: 'Chat Ao Vivo', icon: MessageSquare, roles: ['admin','sdr','support','user'] },
  { id: 'contacts', label: 'Contatos', icon: Users, roles: ['admin','sdr','user'] },
  { id: 'scheduling', label: 'Agendamentos', icon: Calendar, roles: ['admin','sdr','user'] },
  { id: 'templates', label: 'Templates WhatsApp', icon: FileText, roles: ['admin','sdr','user'] },
  { id: 'team', label: 'Equipe', icon: ShieldCheck, roles: ['admin'] },
  { id: 'automations', label: 'Automações', icon: Zap, roles: ['admin'] },
  { id: 'settings', label: 'Configurações', icon: SettingsIcon, roles: ['admin'] },
];

const Logo = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ duration: 0.2 }}
    className="py-1"
  >
    <BrandLogo variant="full" size={36} />
  </motion.div>
);

const LogoIcon = () => (
  <BrandLogo variant="icon" size={36} className="py-1" />
);

const SidebarContent = () => {
  const { user, signOut, role } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname.substring(1) || 'dashboard';
  const { open, setOpen } = useSidebar();
  const isMobile = useIsMobile();

  const effectiveRole: MenuRole = (role as MenuRole) || 'user';
  const links = menuItems
    .filter(item => item.roles.includes(effectiveRole))
    .map(item => ({
      label: item.label,
      href: `/${item.id}`,
      icon: <item.icon className="h-5 w-5" />,
    }));

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success('Logout realizado com sucesso');
      navigate('/auth', { replace: true });
    } catch (error) {
      toast.error('Erro ao fazer logout');
    }
  };

  // Get user initials
  const getUserInitials = () => {
    if (!user?.email) return 'US';
    const email = user.email;
    return email.substring(0, 2).toUpperCase();
  };

  // Get display name
  const getDisplayName = () => {
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name;
    }
    return 'Usuário';
  };

  return (
    <>
      <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
        <div className="mb-6">
          {open ? <Logo /> : <LogoIcon />}
        </div>
        
        <nav className="flex flex-col gap-1.5">
          {links.map((link, idx) => (
            <SidebarLink
              key={idx}
              link={link}
              isActive={currentPath.startsWith(link.href.slice(1))}
              onClick={() => { if (isMobile) setOpen(false); }}
            />
          ))}
          <div className="mt-2 pt-2 border-t border-border/30">
            <NotificationsBell collapsed={!open} />
          </div>
        </nav>
      </div>

      {/* User Footer */}
      <div className="border-t border-border/50 pt-4">
        <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-secondary/50 transition-colors cursor-pointer group">
          <div className="w-9 h-9 rounded-full bg-brand-gold-900/50 flex items-center justify-center text-xs font-bold text-brand-gold-400 border border-brand-gold-700/40 ring-2 ring-transparent group-hover:ring-brand-gold-500/20 transition-all flex-shrink-0">
            {getUserInitials()}
          </div>
          <motion.div
            animate={{
              display: open ? "block" : "none",
              opacity: open ? 1 : 0,
            }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-hidden"
          >
            <p className="text-sm font-medium text-foreground group-hover:text-foreground whitespace-nowrap">{getDisplayName()}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email || 'email@example.com'}</p>
          </motion.div>
          <motion.div
            animate={{
              display: open ? "block" : "none",
              opacity: open ? 1 : 0,
            }}
            transition={{ duration: 0.2 }}
          >
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
              title="Sair"
            >
              <LogOut className="w-4 h-4 text-muted-foreground hover:text-destructive transition-colors" />
            </button>
          </motion.div>
        </div>
      </div>
    </>
  );
};

const AppSidebar: React.FC = () => {
  const [open, setOpen] = useState(false);

  return (
    <Sidebar open={open} setOpen={setOpen}>
      <SidebarBody className="justify-between gap-10 bg-card/50 backdrop-blur-xl border-r border-border/50">
        <SidebarContent />
      </SidebarBody>
    </Sidebar>
  );
};

export default AppSidebar;
