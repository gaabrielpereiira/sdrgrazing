import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '../Button';
import { Search, X, FileText, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

interface TemplateRow {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: any[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSend: (payload: {
    template: TemplateRow;
    variables: Record<string, string>;
    interpolatedBody: string;
  }) => Promise<void>;
}

const CATEGORIES = ['ALL', 'MARKETING', 'UTILITY', 'AUTHENTICATION'];

function extractVarNumbers(text: string): number[] {
  const matches = [...(text || '').matchAll(/\{\{(\d+)\}\}/g)];
  return [...new Set(matches.map((m) => parseInt(m[1])))].sort((a, b) => a - b);
}

function getBodyText(components: any[]): string {
  const body = components?.find((c) => (c.type || '').toUpperCase() === 'BODY');
  return body?.text || '';
}

function getHeaderText(components: any[]): string {
  const header = components?.find((c) => (c.type || '').toUpperCase() === 'HEADER');
  if (!header) return '';
  if ((header.format || 'TEXT').toUpperCase() === 'TEXT') return header.text || '';
  return '';
}

function getFooterText(components: any[]): string {
  const footer = components?.find((c) => (c.type || '').toUpperCase() === 'FOOTER');
  return footer?.text || '';
}

function interpolate(text: string, vars: Record<string, string>): string {
  return (text || '').replace(/\{\{(\d+)\}\}/g, (_, n) => vars[n] ?? `{{${n}}}`);
}

export const TemplatePickerModal: React.FC<Props> = ({ open, onClose, onSend }) => {
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setVariables({});
    setSearch('');

    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('whatsapp_templates')
          .select('id, name, language, category, status, components')
          .eq('status', 'APPROVED')
          .order('name', { ascending: true });
        if (error) throw error;
        setTemplates((data || []) as TemplateRow[]);
      } catch (err) {
        console.error('[TemplatePicker] Error loading templates', err);
        toast.error('Erro ao carregar templates');
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (category !== 'ALL' && (t.category || '').toUpperCase() !== category) return false;
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [templates, category, search]);

  const selected = templates.find((t) => t.id === selectedId) || null;

  const allVarNumbers = useMemo(() => {
    if (!selected) return [];
    const bodyVars = extractVarNumbers(getBodyText(selected.components));
    const headerVars = extractVarNumbers(getHeaderText(selected.components));
    return [...new Set([...headerVars, ...bodyVars])].sort((a, b) => a - b);
  }, [selected]);

  const allFilled = allVarNumbers.every((n) => (variables[String(n)] || '').trim().length > 0);

  const handleSend = async () => {
    if (!selected) return;
    if (!allFilled) {
      toast.error('Preencha todas as variáveis do template');
      return;
    }
    setSending(true);
    try {
      const interpolatedBody = interpolate(getBodyText(selected.components), variables);
      await onSend({ template: selected, variables, interpolatedBody });
      onClose();
    } catch (err: any) {
      console.error('[TemplatePicker] Send failed', err);
      toast.error(err?.message || 'Erro ao enviar template');
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-white">Enviar template do WhatsApp</h2>
            <p className="text-xs text-slate-400 mt-0.5">Apenas templates aprovados pela Meta podem ser enviados.</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body: list + preview */}
        <div className="flex-1 flex min-h-0">
          {/* Left: list */}
          <div className="w-1/2 border-r border-slate-800 flex flex-col min-h-0">
            <div className="p-3 border-b border-slate-800 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar template..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-brand-gold-500/40"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                      category === c
                        ? 'bg-brand-gold-500/20 text-brand-gold-300 border-brand-gold-500/50'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {c === 'ALL' ? 'Todos' : c}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-32 text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center">
                  <FileText className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                  <p className="text-sm text-slate-400 mb-2">Nenhum template aprovado encontrado.</p>
                  <Link
                    to="/templates"
                    onClick={onClose}
                    className="inline-flex items-center gap-1.5 text-xs text-brand-gold-400 hover:text-brand-gold-300"
                  >
                    Ir para Templates WhatsApp <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-slate-800">
                  {filtered.map((t) => {
                    const isActive = t.id === selectedId;
                    return (
                      <li key={t.id}>
                        <button
                          onClick={() => {
                            setSelectedId(t.id);
                            setVariables({});
                          }}
                          className={`w-full text-left px-4 py-3 transition ${
                            isActive ? 'bg-brand-gold-500/10' : 'hover:bg-slate-800/50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-slate-100 truncate">{t.name}</span>
                            <span className="text-[10px] text-slate-500 uppercase">{t.language}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
                              {t.category}
                            </span>
                            <span className="text-[11px] text-slate-500 truncate">
                              {getBodyText(t.components).slice(0, 60)}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Right: preview + variables */}
          <div className="w-1/2 flex flex-col min-h-0">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500 px-6 text-center">
                Selecione um template ao lado para visualizar e enviar.
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* WhatsApp-style preview */}
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Pré-visualização</p>
                    <div className="bg-emerald-950/40 border border-emerald-900/40 rounded-lg p-3 max-w-sm">
                      {getHeaderText(selected.components) && (
                        <p className="text-sm font-semibold text-emerald-100 mb-1.5">
                          {interpolate(getHeaderText(selected.components), variables)}
                        </p>
                      )}
                      <p className="text-sm text-slate-100 whitespace-pre-wrap">
                        {interpolate(getBodyText(selected.components), variables)}
                      </p>
                      {getFooterText(selected.components) && (
                        <p className="text-[11px] text-slate-400 mt-2">{getFooterText(selected.components)}</p>
                      )}
                    </div>
                  </div>

                  {/* Variables */}
                  {allVarNumbers.length > 0 && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Variáveis</p>
                      <div className="space-y-2">
                        {allVarNumbers.map((n) => (
                          <div key={n}>
                            <label className="block text-xs text-slate-400 mb-1">
                              Variável {`{{${n}}}`}
                            </label>
                            <input
                              value={variables[String(n)] || ''}
                              onChange={(e) =>
                                setVariables((v) => ({ ...v, [String(n)]: e.target.value }))
                              }
                              placeholder={`Valor para {{${n}}}`}
                              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-brand-gold-500/40"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-2 text-[11px] text-amber-400/90 bg-amber-500/5 border border-amber-500/20 rounded-lg p-2.5">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span>
                      Templates com mídia no cabeçalho (imagem/vídeo/documento) ainda não são suportados nesta tela.
                    </span>
                  </div>

                  {(() => {
                    const lang = (selected.language || '').toLowerCase();
                    const text = `${getHeaderText(selected.components)} ${getBodyText(selected.components)}`.toLowerCase();
                    const looksPt = /\b(olá|você|obrigad|agradec|pedido|experi[eê]ncia|grazi|por favor)\b/.test(text);
                    if (looksPt && !lang.startsWith('pt')) {
                      return (
                        <div className="flex items-start gap-2 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">
                          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          <span>
                            Este template está cadastrado como <strong>{selected.language}</strong>, mas o conteúdo parece estar em português. Se o WhatsApp do cliente não estiver no mesmo idioma, a mensagem pode ser silenciosamente bloqueada pela Meta. Recadastre como <strong>pt_BR</strong>.
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {(selected.category || '').toUpperCase() === 'MARKETING' && (
                    <div className="flex items-start gap-2 text-[11px] text-orange-300 bg-orange-500/10 border border-orange-500/30 rounded-lg p-2.5">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>
                        Categoria <strong>MARKETING</strong>: a Meta pode marcar como entregue mas <strong>não exibir</strong> ao destinatário caso ele tenha optado por não receber promoções no WhatsApp. Se for um template transacional (confirmação, pós-venda, suporte), recadastre como <strong>UTILITY</strong>.
                      </span>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-800 p-3 flex items-center justify-end gap-2">
                  <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                  <Button onClick={handleSend} disabled={!allFilled || sending}>
                    {sending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                    ) : (
                      'Enviar template'
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
