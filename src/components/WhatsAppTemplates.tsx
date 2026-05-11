import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './Button';
import { FileText, RefreshCw, Plus, Trash2, Pencil, AlertTriangle, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import TemplateEditorModal, { TemplateData } from './templates/TemplateEditorModal';

type WhatsAppTemplate = {
  id: string;
  meta_template_id: string | null;
  name: string;
  category: string;
  language: string;
  components: any[];
  samples: Record<string, string> | null;
  status: string;
  quality_rating: string | null;
  rejected_reason: string | null;
  updated_at: string;
};

const CATEGORY_MAP: Record<string, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utilidade',
  AUTHENTICATION: 'Autenticação',
};

const STATUS_STYLES: Record<string, string> = {
  APPROVED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  REJECTED: 'bg-red-500/10 text-red-400 border-red-500/30',
  PAUSED: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  DISABLED: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  draft: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
};

const WhatsAppTemplates: React.FC = () => {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [wabaConfigured, setWabaConfigured] = useState<boolean>(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<WhatsAppTemplate | null>(null);

  const fetchTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('whatsapp_templates' as any)
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) {
      console.error(error);
      toast.error('Erro ao carregar templates');
    } else {
      setTemplates((data || []) as unknown as WhatsAppTemplate[]);
    }
    setLoading(false);
  };

  const checkWabaConfig = async () => {
    const { data } = await supabase
      .from('nina_settings')
      .select('whatsapp_business_account_id, whatsapp_access_token')
      .limit(1)
      .maybeSingle();
    setWabaConfigured(!!data?.whatsapp_business_account_id && !!data?.whatsapp_access_token);
  };

  useEffect(() => {
    fetchTemplates();
    checkWabaConfig();

    const channel = supabase
      .channel('whatsapp_templates_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_templates' }, () => {
        fetchTemplates();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-whatsapp-templates');
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const { imported = 0, updated = 0, total = 0 } = data as any;
      toast.success(`Sincronização concluída: ${imported} novos, ${updated} atualizados (${total} no total).`);
      await fetchTemplates();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao sincronizar templates');
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (t: WhatsAppTemplate) => {
    if (!confirm(`Excluir template "${t.name}"? Isso também removerá da Meta.`)) return;
    try {
      const { data, error } = await supabase.functions.invoke('delete-whatsapp-template', {
        body: { id: t.id, name: t.name, metaTemplateId: t.meta_template_id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Template excluído');
      await fetchTemplates();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao excluir');
    }
  };

  const handleEdit = (t: WhatsAppTemplate) => {
    setEditing(t);
    setEditorOpen(true);
  };

  const handleNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const handleSaved = async () => {
    setEditorOpen(false);
    setEditing(null);
    await fetchTemplates();
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto h-full overflow-y-auto bg-background text-foreground custom-scrollbar">
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <FileText className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
            Templates WhatsApp
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie modelos de mensagem aprovados pela Meta para envio em massa e iniciar conversas.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="ghost" onClick={handleSync} disabled={syncing || !wabaConfigured} className="gap-2">
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sincronizar com Meta
          </Button>
          <Button variant="primary" onClick={handleNew} disabled={!wabaConfigured} className="gap-2">
            <Plus className="w-4 h-4" />
            Novo Template
          </Button>
        </div>
      </div>

      {!wabaConfigured && (
        <div className="mb-6 p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="text-amber-300 font-medium">Configuração incompleta</p>
            <p className="text-amber-200/80 mt-1">
              É necessário configurar o <strong>WhatsApp Access Token</strong> e o <strong>WABA ID</strong> em{' '}
              <Link to="/settings" className="underline hover:text-amber-100">Configurações &gt; APIs</Link>{' '}
              para sincronizar e criar templates.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando templates...
          </div>
        ) : templates.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">Nenhum template ainda.</p>
            <div className="flex gap-2 justify-center">
              <Button variant="ghost" onClick={handleSync} disabled={!wabaConfigured} className="gap-2">
                <RefreshCw className="w-4 h-4" /> Importar da Meta
              </Button>
              <Button variant="primary" onClick={handleNew} disabled={!wabaConfigured} className="gap-2">
                <Plus className="w-4 h-4" /> Criar primeiro template
              </Button>
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Nome</th>
                <th className="text-left px-4 py-3">Categoria</th>
                <th className="text-left px-4 py-3">Idioma</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Atualizado</th>
                <th className="px-4 py-3 w-32"></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {t.name}
                    {t.status === 'REJECTED' && t.rejected_reason && (
                      <p className="text-xs text-red-400/80 mt-1">{t.rejected_reason}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{CATEGORY_MAP[t.category] || t.category}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.language}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${STATUS_STYLES[t.status] || 'bg-slate-500/10 text-slate-400 border-slate-500/30'}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {new Date(t.updated_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(t)} className="gap-1 h-8">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(t)} className="gap-1 h-8 text-red-400 hover:text-red-300">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editorOpen && (
        <TemplateEditorModal
          initial={editing as unknown as TemplateData | null}
          onClose={() => { setEditorOpen(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
};

export default WhatsAppTemplates;
