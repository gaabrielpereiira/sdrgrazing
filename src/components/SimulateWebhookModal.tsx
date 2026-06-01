import React, { useState } from 'react';
import { X, Play, Loader2, FlaskConical } from 'lucide-react';
import { Button } from './Button';
import { TRIGGER_TOPICS } from '@/hooks/useAutomations';
import { toast } from 'sonner';

interface Props { isOpen: boolean; onClose: () => void; }

const SimulateWebhookModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [topic, setTopic] = useState('order.created');
  const [phone, setPhone] = useState('5511999990001');
  const [total, setTotal] = useState('297.00');
  const [firstName, setFirstName] = useState('Cliente');
  const [sending, setSending] = useState(false);

  if (!isOpen) return null;

  const submit = async () => {
    setSending(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/simulate-wc-webhook`;
      const overrides: any = {
        billing: { phone, first_name: firstName },
      };
      if (topic.startsWith('order.')) overrides.total = total;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ topic, overrides }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha no simulador');
      toast.success(`Evento ${topic} disparado`, { description: `event_id: ${json.event_id?.slice(0, 8)}…` });
      onClose();
    } catch (e: any) {
      toast.error('Erro ao simular', { description: e?.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-slate-50 flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-brand-gold-400" /> Simular evento WooCommerce
          </h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-400">
            Cria um evento de teste em <code className="text-brand-gold-300">webhook_events</code> e dispara o runner — sem precisar do WooCommerce real.
          </p>

          <Field label="Tipo de evento">
            <select value={topic} onChange={e => setTopic(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-50 focus:outline-none focus:border-brand-gold-500">
              {TRIGGER_TOPICS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>

          <Field label="Telefone (billing.phone)">
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="5511999990001"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-50 focus:outline-none focus:border-brand-gold-500" />
          </Field>

          <Field label="Nome (billing.first_name)">
            <input value={firstName} onChange={e => setFirstName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-50 focus:outline-none focus:border-brand-gold-500" />
          </Field>

          {topic.startsWith('order.') && (
            <Field label="Valor total">
              <input value={total} onChange={e => setTotal(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-50 focus:outline-none focus:border-brand-gold-500" />
            </Field>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-slate-800">
          <Button variant="ghost" onClick={onClose} disabled={sending}>Cancelar</Button>
          <Button variant="primary" onClick={submit} disabled={sending} className="gap-2">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Disparar evento
          </Button>
        </div>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="text-xs font-medium text-slate-400 mb-1 block">{label}</label>
    {children}
  </div>
);

export default SimulateWebhookModal;
