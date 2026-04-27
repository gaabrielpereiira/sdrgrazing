import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Phone, MessageSquare, Calendar as CalendarIcon, Sparkles } from 'lucide-react';
import { ActivityType, CreateActivityInput } from '@/hooks/useConversationActivities';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  contactId: string;
  contactName?: string;
  onCreate: (input: CreateActivityInput) => Promise<void>;
}

const TYPES: { value: ActivityType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'call', label: 'Ligar', icon: Phone },
  { value: 'message', label: 'Enviar mensagem', icon: MessageSquare },
  { value: 'meeting', label: 'Reunião', icon: CalendarIcon },
  { value: 'other', label: 'Outro', icon: Sparkles },
];

function defaultDate() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}

export const ActivityModal: React.FC<Props> = ({ open, onOpenChange, conversationId, contactId, contactName, onCreate }) => {
  const initial = defaultDate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ActivityType>('call');
  const [date, setDate] = useState<string>(initial.toISOString().slice(0, 10));
  const [time, setTime] = useState<string>(initial.toTimeString().slice(0, 5));
  const [saving, setSaving] = useState(false);

  const reset = () => {
    const d = defaultDate();
    setTitle('');
    setDescription('');
    setType('call');
    setDate(d.toISOString().slice(0, 10));
    setTime(d.toTimeString().slice(0, 5));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date || !time) return;
    setSaving(true);
    try {
      const scheduled = new Date(`${date}T${time}:00`);
      await onCreate({
        conversation_id: conversationId,
        contact_id: contactId,
        title: title.trim(),
        description: description.trim() || undefined,
        activity_type: type,
        scheduled_at: scheduled.toISOString(),
      });
      reset();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Nova atividade {contactName ? `· ${contactName}` : ''}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-slate-300">Tipo</Label>
            <div className="grid grid-cols-4 gap-2">
              {TYPES.map(t => {
                const Icon = t.icon;
                const active = type === t.value;
                return (
                  <button
                    type="button"
                    key={t.value}
                    onClick={() => setType(t.value)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-colors ${
                      active
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                        : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">Título *</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ex: Ligar para confirmar pedido"
              className="bg-slate-800 border-slate-700 text-slate-100"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-slate-300">Data *</Label>
              <Input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100"
                required
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Hora *</Label>
              <Input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">Descrição (opcional)</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Detalhes ou contexto…"
              className="bg-slate-800 border-slate-700 text-slate-100 min-h-[80px]"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !title.trim()} className="bg-cyan-600 hover:bg-cyan-500 text-white">
              {saving ? 'Salvando…' : 'Agendar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
