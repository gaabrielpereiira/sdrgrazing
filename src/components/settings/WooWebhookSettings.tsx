import React, { useEffect, useState } from 'react';
import { ShoppingCart, Copy, Check, Eye, EyeOff, Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '../Button';

const WooWebhookSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [secret, setSecret] = useState('');
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wc-receiver`;

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('nina_settings')
          .select('id, wc_webhook_secret')
          .limit(1)
          .maybeSingle();
        if (data) {
          setSettingsId(data.id);
          setSecret((data as any).wc_webhook_secret || '');
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
      const { error } = await supabase
        .from('nina_settings')
        .update({ wc_webhook_secret: secret || null, updated_at: new Date().toISOString() })
        .eq('id', settingsId);
      if (error) throw error;
      toast.success('Segredo do webhook WooCommerce salvo!');
    } catch (e) {
      toast.error('Erro ao salvar', { description: e instanceof Error ? e.message : 'Tente novamente' });
    } finally {
      setSaving(false);
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success('URL copiada!');
    setTimeout(() => setCopied(false), 2000);
  };

  const generateSecret = () => {
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    setSecret(btoa(String.fromCharCode(...arr)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32));
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
      </div>
    );
  }

  const configured = !!secret;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingCart className="w-5 h-5 text-cyan-400" />
          <h3 className="font-semibold text-white">WooCommerce Webhook</h3>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
          configured ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
        }`}>
          <span className={`h-2 w-2 rounded-full ${configured ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
          {configured ? 'Configurado' : 'Aguardando'}
        </div>
      </div>

      <div className="text-sm text-slate-400 space-y-2">
        <p>Conecte sua loja WooCommerce para receber eventos (pedidos, clientes, produtos) e disparar automações.</p>
        <ol className="list-decimal pl-5 space-y-1 text-xs text-slate-400">
          <li>Em <strong>WooCommerce → Configurações → Avançado → Webhooks</strong>, crie um novo webhook.</li>
          <li>Cole a <strong>URL de entrega</strong> abaixo.</li>
          <li>Defina um <strong>Secret</strong> (gere um e cole também aqui).</li>
          <li>Selecione o tópico (ex: Pedido criado) e salve.</li>
        </ol>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-300 mb-1 block">URL de entrega</label>
        <div className="flex gap-2">
          <input
            readOnly
            value={webhookUrl}
            className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-300 font-mono"
          />
          <Button variant="ghost" size="sm" onClick={copyUrl} className="gap-2">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-300 mb-1 block">Secret (HMAC-SHA256)</label>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type={showSecret ? 'text' : 'password'}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Cole o mesmo Secret configurado no WooCommerce"
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
          <Button variant="ghost" size="sm" onClick={generateSecret}>Gerar</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </Button>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          O mesmo valor precisa estar em ambos os lados — usamos para validar a assinatura HMAC de cada webhook.
        </p>
      </div>
    </div>
  );
};

export default WooWebhookSettings;
