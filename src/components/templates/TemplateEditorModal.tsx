import React, { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '../Button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { X, Plus, Trash2, Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

export type TemplateButton = {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  phone?: string;
};

export type TemplateComponent =
  | { type: 'HEADER'; format: 'TEXT'; text: string }
  | { type: 'BODY'; text: string }
  | { type: 'FOOTER'; text: string }
  | { type: 'BUTTONS'; buttons: TemplateButton[] };

export type TemplateData = {
  id?: string;
  name: string;
  category: string;
  language: string;
  components: TemplateComponent[];
  samples?: Record<string, string>;
};

const LANGUAGES = [
  { code: 'pt_BR', label: 'Português (Brasil)' },
  { code: 'en_US', label: 'English (US)' },
  { code: 'es_ES', label: 'Español' },
  { code: 'es_MX', label: 'Español (México)' },
];

const CATEGORIES = [
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'UTILITY', label: 'Utilidade' },
  { value: 'AUTHENTICATION', label: 'Autenticação' },
];

function extractVarNumbers(text: string): number[] {
  const matches = [...(text || '').matchAll(/\{\{(\d+)\}\}/g)];
  return [...new Set(matches.map((m) => parseInt(m[1])))].sort((a, b) => a - b);
}

function findComp<T extends TemplateComponent['type']>(
  comps: TemplateComponent[],
  type: T
): Extract<TemplateComponent, { type: T }> | undefined {
  return comps.find((c) => c.type === type) as any;
}

interface Props {
  initial: TemplateData | null;
  onClose: () => void;
  onSaved: () => void;
}

const TemplateEditorModal: React.FC<Props> = ({ initial, onClose, onSaved }) => {
  const [name, setName] = useState(initial?.name || '');
  const [category, setCategory] = useState(initial?.category || 'MARKETING');
  const [language, setLanguage] = useState(initial?.language || 'pt_BR');

  const initComps = (initial?.components || []) as TemplateComponent[];
  const [headerText, setHeaderText] = useState((findComp(initComps, 'HEADER')?.text) || '');
  const [bodyText, setBodyText] = useState((findComp(initComps, 'BODY')?.text) || '');
  const [footerText, setFooterText] = useState((findComp(initComps, 'FOOTER')?.text) || '');
  const [buttons, setButtons] = useState<TemplateButton[]>(
    (findComp(initComps, 'BUTTONS')?.buttons) || []
  );
  const [samples, setSamples] = useState<Record<string, string>>(initial?.samples || {});
  const [saving, setSaving] = useState(false);

  const headerVars = useMemo(() => extractVarNumbers(headerText), [headerText]);
  const bodyVars = useMemo(() => extractVarNumbers(bodyText), [bodyText]);

  const isEdit = !!initial?.id;

  const updateSample = (key: string, value: string) => {
    setSamples((prev) => ({ ...prev, [key]: value }));
  };

  const addButton = () => {
    if (buttons.length >= 10) return;
    setButtons([...buttons, { type: 'QUICK_REPLY', text: '' }]);
  };

  const updateButton = (i: number, patch: Partial<TemplateButton>) => {
    setButtons(buttons.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  };

  const removeButton = (i: number) => {
    setButtons(buttons.filter((_, idx) => idx !== i));
  };

  const renderPreviewText = (text: string, prefix: 'header' | 'body') => {
    return (text || '').replace(/\{\{(\d+)\}\}/g, (_, n) => samples[`${prefix}_${n}`] || `{{${n}}}`);
  };

  const handleSave = async () => {
    // Validações básicas
    if (!/^[a-z0-9_]+$/.test(name)) {
      toast.error('Nome inválido. Use apenas letras minúsculas, números e _');
      return;
    }
    if (!bodyText.trim()) {
      toast.error('O Body é obrigatório');
      return;
    }
    if (bodyText.length > 1024) {
      toast.error('Body excede 1024 caracteres');
      return;
    }
    for (const n of bodyVars) {
      if (!samples[`body_${n}`]) {
        toast.error(`Preencha o exemplo da variável {{${n}}} do body`);
        return;
      }
    }
    for (const n of headerVars) {
      if (!samples[`header_${n}`]) {
        toast.error(`Preencha o exemplo da variável {{${n}}} do header`);
        return;
      }
    }

    const components: TemplateComponent[] = [];
    if (headerText.trim()) components.push({ type: 'HEADER', format: 'TEXT', text: headerText });
    components.push({ type: 'BODY', text: bodyText });
    if (footerText.trim()) components.push({ type: 'FOOTER', text: footerText });
    if (buttons.length > 0) {
      const cleanBtns = buttons.filter((b) => b.text.trim());
      if (cleanBtns.length > 0) components.push({ type: 'BUTTONS', buttons: cleanBtns });
    }

    const templateData: TemplateData = { name, category, language, components, samples };

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('submit-whatsapp-template', {
        body: { templateData, templateId: initial?.id, isEdit },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(isEdit ? 'Template atualizado e enviado para a Meta' : 'Template criado e enviado para a Meta');
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">
            {isEdit ? 'Editar Template' : 'Novo Template'}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar grid md:grid-cols-[1fr_360px] gap-0">
          {/* Form */}
          <div className="p-6 space-y-6 border-r border-border">
            {/* Básico */}
            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">Básico</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Nome (apenas a-z, 0-9, _)</label>
                  <Input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="boas_vindas_cliente" disabled={isEdit} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Categoria</label>
                  <Select value={category} onValueChange={setCategory} disabled={isEdit}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Idioma</label>
                <Select value={language} onValueChange={setLanguage} disabled={isEdit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </section>

            {/* Header */}
            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">Header (opcional)</h4>
              <Input
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                placeholder="Título do template (até 60 caracteres)"
                maxLength={60}
              />
              {headerVars.map((n) => (
                <div key={`hv-${n}`}>
                  <label className="text-xs text-muted-foreground mb-1 block">Exemplo para {`{{${n}}}`}</label>
                  <Input
                    value={samples[`header_${n}`] || ''}
                    onChange={(e) => updateSample(`header_${n}`, e.target.value)}
                    placeholder={`exemplo_${n}`}
                  />
                </div>
              ))}
            </section>

            {/* Body */}
            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">Body (obrigatório)</h4>
              <Textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="Olá {{1}}, sua reserva foi confirmada para {{2}}. Qualquer dúvida estou à disposição!"
                rows={6}
                maxLength={1024}
              />
              <p className="text-xs text-muted-foreground text-right">{bodyText.length}/1024</p>
              {bodyVars.map((n) => (
                <div key={`bv-${n}`}>
                  <label className="text-xs text-muted-foreground mb-1 block">Exemplo para {`{{${n}}}`}</label>
                  <Input
                    value={samples[`body_${n}`] || ''}
                    onChange={(e) => updateSample(`body_${n}`, e.target.value)}
                    placeholder={`exemplo_${n}`}
                  />
                </div>
              ))}
            </section>

            {/* Footer */}
            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">Footer (opcional)</h4>
              <Input
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                placeholder="Texto curto sem variáveis (até 60 caracteres)"
                maxLength={60}
              />
            </section>

            {/* Buttons */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">Botões (opcional)</h4>
                <Button variant="ghost" size="sm" onClick={addButton} disabled={buttons.length >= 10} className="gap-1">
                  <Plus className="w-3.5 h-3.5" /> Adicionar
                </Button>
              </div>
              {buttons.map((btn, i) => (
                <div key={i} className="border border-border rounded-lg p-3 space-y-2 bg-muted/20">
                  <div className="flex gap-2">
                    <Select value={btn.type} onValueChange={(v) => updateButton(i, { type: v as any })}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="QUICK_REPLY">Quick Reply</SelectItem>
                        <SelectItem value="URL">URL</SelectItem>
                        <SelectItem value="PHONE_NUMBER">Telefone</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={btn.text}
                      onChange={(e) => updateButton(i, { text: e.target.value })}
                      placeholder="Texto do botão"
                      maxLength={25}
                      className="flex-1"
                    />
                    <Button variant="ghost" size="sm" onClick={() => removeButton(i)} className="text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  {btn.type === 'URL' && (
                    <Input
                      value={btn.url || ''}
                      onChange={(e) => updateButton(i, { url: e.target.value })}
                      placeholder="https://exemplo.com"
                    />
                  )}
                  {btn.type === 'PHONE_NUMBER' && (
                    <Input
                      value={btn.phone || ''}
                      onChange={(e) => updateButton(i, { phone: e.target.value })}
                      placeholder="+5511999999999"
                    />
                  )}
                </div>
              ))}
            </section>
          </div>

          {/* Preview */}
          <div className="p-6 bg-muted/10">
            <div className="sticky top-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider mb-3">
                <Smartphone className="w-4 h-4" />
                Preview
              </div>
              <div className="bg-[#0b141a] rounded-xl p-3 border border-border min-h-[400px]">
                <div className="bg-[#005c4b] text-white rounded-lg rounded-tl-none p-3 max-w-full shadow-md">
                  {headerText && (
                    <p className="font-bold mb-2 text-sm">{renderPreviewText(headerText, 'header')}</p>
                  )}
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {renderPreviewText(bodyText, 'body') || <span className="text-white/40">Seu body aparecerá aqui...</span>}
                  </p>
                  {footerText && (
                    <p className="text-xs text-white/60 mt-2">{footerText}</p>
                  )}
                </div>
                {buttons.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {buttons.filter((b) => b.text).map((b, i) => (
                      <div key={i} className="bg-[#1f2c33] text-[#00a884] text-center text-sm py-2 rounded-lg border border-white/5">
                        {b.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isEdit ? 'Salvar e enviar à Meta' : 'Criar e enviar à Meta'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TemplateEditorModal;
