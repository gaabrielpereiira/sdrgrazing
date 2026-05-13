import React, { useEffect, useState } from 'react';
import { X, Plus, Trash2, Loader2, Code } from 'lucide-react';
import { Button } from './Button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { TRIGGER_TOPICS, FIELD_SUGGESTIONS, OPERATORS, ACTION_TYPES, AutomationRule } from '@/hooks/useAutomations';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  rule: AutomationRule | null;
  onSaved: () => void;
}

interface Condition { field: string; operator: string; value: string; }

interface WhatsAppTemplate { id: string; name: string; status: string; components: any; }

const AutomationFormModal: React.FC<Props> = ({ isOpen, onClose, rule, onSaved }) => {
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('order.created');
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [logic, setLogic] = useState<'AND' | 'OR'>('AND');
  const [actionType, setActionType] = useState('whatsapp_message');
  const [templateId, setTemplateId] = useState('');
  const [phoneField, setPhoneField] = useState('billing.phone');
  const [variables, setVariables] = useState<string[]>([]);
  const [cooldownHours, setCooldownHours] = useState(0);
  const [active, setActive] = useState(true);
  const [showJson, setShowJson] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    supabase.from('whatsapp_templates').select('id, name, status, components').eq('status', 'APPROVED')
      .then(({ data }) => setTemplates((data || []) as any));
    if (rule) {
      setName(rule.name);
      setTrigger(rule.trigger_topic);
      setConditions(rule.filters?.conditions || []);
      setLogic((rule.filters?.logic as any) || 'AND');
      setActionType(rule.action_type);
      setTemplateId(rule.action_config?.template_id || '');
      setPhoneField(rule.action_config?.phone_field || 'billing.phone');
      setVariables(rule.action_config?.variables || []);
      setCooldownHours(rule.cooldown_hours || 0);
      setActive(rule.active);
    } else {
      setName(''); setTrigger('order.created'); setConditions([]); setLogic('AND');
      setActionType('whatsapp_message'); setTemplateId(''); setPhoneField('billing.phone');
      setVariables([]); setCooldownHours(0); setActive(true);
    }
  }, [isOpen, rule]);

  const addCondition = () => setConditions(c => [...c, { field: '', operator: 'eq', value: '' }]);
  const removeCondition = (i: number) => setConditions(c => c.filter((_, idx) => idx !== i));
  const updateCondition = (i: number, patch: Partial<Condition>) =>
    setConditions(c => c.map((co, idx) => idx === i ? { ...co, ...patch } : co));

  const addVariable = () => setVariables(v => [...v, '']);
  const removeVariable = (i: number) => setVariables(v => v.filter((_, idx) => idx !== i));
  const updateVariable = (i: number, val: string) => setVariables(v => v.map((va, idx) => idx === i ? val : va));

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Dê um nome à automação'); return; }
    if (actionType === 'whatsapp_message' && !templateId) { toast.error('Selecione um template'); return; }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        trigger_topic: trigger,
        filters: { conditions: conditions.filter(c => c.field), logic },
        action_type: actionType,
        action_config: actionType === 'whatsapp_message'
          ? { template_id: templateId, phone_field: phoneField, variables: variables.filter(Boolean) }
          : {},
        cooldown_hours: cooldownHours,
        active,
      };
      const { error } = rule
        ? await supabase.from('automation_rules').update(payload as any).eq('id', rule.id)
        : await supabase.from('automation_rules').insert(payload as any);
      if (error) throw error;
      toast.success(rule ? 'Automação atualizada' : 'Automação criada');
      onSaved();
      onClose();
    } catch (e) {
      toast.error('Erro ao salvar', { description: e instanceof Error ? e.message : '' });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <h2 className="text-xl font-bold text-white">{rule ? 'Editar' : 'Nova'} Automação</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-6">
          {/* Nome */}
          <div>
            <label className="text-xs font-medium text-slate-300 mb-1 block">Nome</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Confirmar pedido criado"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-50 focus:outline-none focus:border-cyan-500" />
          </div>

          {/* Bloco 1 - Quando */}
          <div className="border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-cyan-500/10 text-cyan-400 text-xs rounded font-medium">QUANDO</span>
              <span className="text-sm text-slate-300">o evento ocorrer</span>
            </div>
            <select value={trigger} onChange={e => setTrigger(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-50">
              {TRIGGER_TOPICS.map(t => <option key={t.value} value={t.value}>{t.label} ({t.value})</option>)}
            </select>
          </div>

          {/* Bloco 2 - Se */}
          <div className="border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 text-xs rounded font-medium">SE</span>
                <span className="text-sm text-slate-300">os filtros baterem (opcional)</span>
              </div>
              {conditions.length > 1 && (
                <select value={logic} onChange={e => setLogic(e.target.value as any)}
                  className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-xs text-slate-50">
                  <option value="AND">Todos (AND)</option>
                  <option value="OR">Qualquer (OR)</option>
                </select>
              )}
            </div>

            {conditions.map((c, i) => (
              <div key={i} className="flex flex-col md:flex-row gap-2">
                <input list="field-suggestions" value={c.field} onChange={e => updateCondition(i, { field: e.target.value })}
                  placeholder="campo (ex: total)"
                  className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-50" />
                <select value={c.operator} onChange={e => updateCondition(i, { operator: e.target.value })}
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-50 md:w-48">
                  {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input value={c.value} onChange={e => updateCondition(i, { value: e.target.value })}
                  placeholder="valor"
                  className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-50" />
                <button onClick={() => removeCondition(i)} className="p-2 text-slate-400 hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <datalist id="field-suggestions">
              {FIELD_SUGGESTIONS.map(f => <option key={f} value={f} />)}
            </datalist>

            <Button variant="ghost" size="sm" onClick={addCondition} className="gap-2">
              <Plus className="w-4 h-4" /> Adicionar filtro
            </Button>

            {conditions.length > 0 && (
              <div>
                <button onClick={() => setShowJson(!showJson)}
                  className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1">
                  <Code className="w-3 h-3" /> {showJson ? 'Esconder' : 'Mostrar'} JSON
                </button>
                {showJson && (
                  <pre className="mt-2 p-3 bg-slate-950 border border-slate-800 rounded text-xs text-slate-400 overflow-x-auto">
{JSON.stringify({ conditions, logic }, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>

          {/* Bloco 3 - Então */}
          <div className="border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs rounded font-medium">ENTÃO</span>
              <span className="text-sm text-slate-300">execute esta ação</span>
            </div>
            <select value={actionType} onChange={e => setActionType(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-50">
              {ACTION_TYPES.map(a => <option key={a.value} value={a.value} disabled={!a.enabled}>{a.label}</option>)}
            </select>

            {actionType === 'whatsapp_message' && (
              <div className="space-y-3 pt-2">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Template aprovado</label>
                  <select value={templateId} onChange={e => setTemplateId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-50">
                    <option value="">Selecione...</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  {templates.length === 0 && (
                    <p className="text-xs text-amber-400 mt-1">Nenhum template aprovado. Cadastre em Templates WhatsApp.</p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Campo do telefone (no payload)</label>
                  <input value={phoneField} onChange={e => setPhoneField(e.target.value)}
                    placeholder="billing.phone"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-50 font-mono" />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Variáveis do template (em ordem)</label>
                  <div className="space-y-2">
                    {variables.map((v, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-xs text-slate-400 self-center w-8">{`{{${i + 1}}}`}</span>
                        <input value={v} onChange={e => updateVariable(i, e.target.value)}
                          placeholder="caminho no payload (ex: billing.first_name)"
                          className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-50 font-mono" />
                        <button onClick={() => removeVariable(i)} className="p-2 text-slate-400 hover:text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" onClick={addVariable} className="gap-2 mt-2">
                    <Plus className="w-4 h-4" /> Adicionar variável
                  </Button>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-300 mb-1 block">
                Cooldown (não reenviar para o mesmo contato por X horas)
              </label>
              <input type="number" min={0} value={cooldownHours}
                onChange={e => setCooldownHours(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-32 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-50" />
            </div>
          </div>

          {/* Ativo */}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="active" checked={active} onChange={e => setActive(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 bg-slate-950" />
            <label htmlFor="active" className="text-sm text-slate-300">Ativa</label>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-6 border-t border-slate-800 sticky bottom-0 bg-slate-900">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {rule ? 'Salvar' : 'Criar automação'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AutomationFormModal;
