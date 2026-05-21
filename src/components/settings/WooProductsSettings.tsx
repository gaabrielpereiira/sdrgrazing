import React, { useEffect, useState } from 'react';
import { Package, Eye, EyeOff, Loader2, Save, PlugZap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '../Button';

const WooProductsSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  const [siteUrl, setSiteUrl] = useState('');
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('nina_settings')
          .select('id, wc_site_url, wc_consumer_key, wc_consumer_secret, wc_products_enabled')
          .limit(1)
          .maybeSingle();
        if (data) {
          setSettingsId(data.id);
          setSiteUrl((data as any).wc_site_url || '');
          setConsumerKey((data as any).wc_consumer_key || '');
          setConsumerSecret((data as any).wc_consumer_secret || '');
          setEnabled(!!(data as any).wc_products_enabled);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!settingsId) {
      toast.error('Configure as outras APIs primeiro (precisa existir um registro de configurações).');
      return;
    }
    setSaving(true);
    try {
      const cleanUrl = siteUrl.trim().replace(/\/$/, '');
      const { error } = await supabase
        .from('nina_settings')
        .update({
          wc_site_url: cleanUrl || null,
          wc_consumer_key: consumerKey.trim() || null,
          wc_consumer_secret: consumerSecret.trim() || null,
          wc_products_enabled: enabled,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', settingsId);
      if (error) throw error;
      toast.success('Configuração de produtos WooCommerce salva!');
    } catch (e) {
      toast.error('Erro ao salvar', { description: e instanceof Error ? e.message : 'Tente novamente' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('wc-products', {
        body: { action: 'list', limit: 1 },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success('Conexão OK', { description: `${data.count} produto(s) retornado(s).` });
      } else {
        throw new Error(data?.error || 'Falha ao conectar');
      }
    } catch (e) {
      toast.error('Falha na conexão', { description: e instanceof Error ? e.message : 'Erro desconhecido' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
      </div>
    );
  }

  const configured = !!(siteUrl && consumerKey && consumerSecret);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="w-5 h-5 text-cyan-400" />
          <h3 className="font-semibold text-white">WooCommerce — Catálogo de Produtos</h3>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
          configured ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
        }`}>
          <span className={`h-2 w-2 rounded-full ${configured ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
          {configured ? 'Configurado' : 'Aguardando'}
        </div>
      </div>

      <p className="text-sm text-slate-400">
        Permite que a Nina consulte produtos reais da sua loja durante a conversa (busca por nome, listagem, etc.).
        Use credenciais <strong>somente leitura</strong> geradas em <em>WooCommerce → Configurações → Avançado → REST API</em>.
      </p>

      <div className="grid gap-4">
        <div>
          <label className="text-xs font-medium text-slate-300 mb-1 block">URL da loja</label>
          <input
            type="url"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="https://sualoja.com.br"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-50 font-mono focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-300 mb-1 block">Consumer Key</label>
          <input
            type="text"
            value={consumerKey}
            onChange={(e) => setConsumerKey(e.target.value)}
            placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxx"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-50 font-mono focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-300 mb-1 block">Consumer Secret</label>
          <div className="relative">
            <input
              type={showSecret ? 'text' : 'password'}
              value={consumerSecret}
              onChange={(e) => setConsumerSecret(e.target.value)}
              placeholder="cs_xxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-3 py-2 pr-10 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-50 font-mono focus:outline-none focus:border-cyan-500"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200"
            >
              {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-cyan-500"
          />
          <span className="text-sm text-slate-300">
            Permitir que a Nina consulte produtos durante as conversas
          </span>
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={handleTest} disabled={testing || !configured} className="gap-2">
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
          Testar conexão
        </Button>
        <Button variant="primary" size="sm" onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar
        </Button>
      </div>
    </div>
  );
};

export default WooProductsSettings;
