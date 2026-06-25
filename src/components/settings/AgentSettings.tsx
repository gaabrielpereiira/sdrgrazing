import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Bot, Loader2, Calendar, Wand2, Building2, RotateCcw, Info, Eye, EyeOff, KeyRound } from 'lucide-react';
import { Button } from '../Button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import PromptGeneratorSheet from './PromptGeneratorSheet';
import { DEFAULT_NINA_PROMPT } from '@/prompts/default-nina-prompt';
import { useAuth } from '@/hooks/useAuth';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type AiProvider = 'google' | 'openai' | 'anthropic';

interface AgentSettings {
  id?: string;
  system_prompt_override: string | null;
  is_active: boolean;
  auto_response_enabled: boolean;
  ai_model_mode: 'flash' | 'pro' | 'pro3' | 'adaptive';
  ai_provider: AiProvider;
  ai_model: string;
  ai_api_keys: { google: string; openai: string; anthropic: string };
  message_breaking_enabled: boolean;
  business_hours_start: string;
  business_hours_end: string;
  business_days: number[];
  company_name: string | null;
  sdr_name: string | null;
  ai_scheduling_enabled: boolean;
}

const PROVIDERS: { id: AiProvider; label: string; iconLabel: string; placeholder: string; keyPrefix: RegExp }[] = [
  { id: 'google', label: 'Google', iconLabel: 'G', placeholder: 'AIza...', keyPrefix: /^AIza[0-9A-Za-z_\-]{20,}$/ },
  { id: 'openai', label: 'OpenAI', iconLabel: 'AI', placeholder: 'sk-...', keyPrefix: /^sk-[A-Za-z0-9_\-]{20,}$/ },
  { id: 'anthropic', label: 'Anthropic', iconLabel: 'A', placeholder: 'sk-ant-...', keyPrefix: /^sk-ant-[A-Za-z0-9_\-]{20,}$/ },
];

const MODEL_CATALOG: Record<AiProvider, { id: string; label: string; tag: string; icon: string; desc: string }[]> = {
  google: [
    { id: 'flash', label: 'Flash', tag: 'Rápido', icon: '⚡', desc: 'Gemini 2.5 Flash: respostas rápidas e econômicas' },
    { id: 'pro', label: 'Pro 2.5', tag: 'Inteligente', icon: '🧠', desc: 'Gemini 2.5 Pro: respostas elaboradas e inteligentes' },
    { id: 'pro3', label: 'Pro 3', tag: 'Mais Recente', icon: '🚀', desc: 'Gemini 3 Pro: modelo mais recente e avançado' },
    { id: 'adaptive', label: 'Adaptativo', tag: 'Contexto', icon: '🎯', desc: 'Alterna automaticamente baseado no contexto da conversa' },
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o mini', tag: 'Rápido', icon: '⚡', desc: 'GPT-4o mini: rápido e econômico' },
    { id: 'gpt-4o', label: 'GPT-4o', tag: 'Equilibrado', icon: '🧠', desc: 'GPT-4o: equilíbrio entre custo e qualidade' },
    { id: 'gpt-4.1', label: 'GPT-4.1', tag: 'Mais Recente', icon: '🚀', desc: 'GPT-4.1: última geração de modelos GPT' },
    { id: 'o3', label: 'o3', tag: 'Raciocínio', icon: '🎯', desc: 'o3: modelo focado em raciocínio profundo' },
  ],
  anthropic: [
    { id: 'claude-haiku-3-5-20251001', label: 'Haiku 3.5', tag: 'Rápido', icon: '⚡', desc: 'Claude Haiku 3.5: rápido e econômico' },
    { id: 'claude-sonnet-4-5', label: 'Sonnet 4', tag: 'Equilibrado', icon: '🧠', desc: 'Claude Sonnet 4: equilíbrio entre custo e qualidade' },
    { id: 'claude-sonnet-4-5-20251001', label: 'Sonnet 4.5', tag: 'Mais Recente', icon: '🚀', desc: 'Claude Sonnet 4.5: versão mais recente do Sonnet' },
    { id: 'claude-opus-4-5', label: 'Opus 4', tag: 'Poderoso', icon: '🎯', desc: 'Claude Opus 4: máximo poder de raciocínio' },
  ],
};

const DAYS_OF_WEEK = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
];

// Using shared prompt from @/prompts/default-nina-prompt

export interface AgentSettingsRef {
  save: () => Promise<void>;
  cancel: () => void;
  isSaving: boolean;
}

const AgentSettings = forwardRef<AgentSettingsRef, {}>((props, ref) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [settings, setSettings] = useState<AgentSettings>({
    system_prompt_override: null,
    is_active: true,
    auto_response_enabled: true,
    ai_model_mode: 'flash',
    ai_provider: 'google',
    ai_model: 'flash',
    ai_api_keys: { google: '', openai: '', anthropic: '' },
    message_breaking_enabled: true,
    business_hours_start: '09:00',
    business_hours_end: '18:00',
    business_days: [1, 2, 3, 4, 5],
    company_name: null,
    sdr_name: null,
    ai_scheduling_enabled: true,
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    save: handleSave,
    cancel: loadSettings,
    isSaving: saving
  }));

  useEffect(() => {
    if (user?.id) {
      loadSettings();
    }
  }, [user?.id]);

  const loadSettings = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    
    try {
      // Fetch global nina_settings (no user_id filter - single tenant)
      const { data, error } = await supabase
        .from('nina_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      // Se não existe registro, admin precisa configurar via onboarding
      if (!data) {
        console.log('[AgentSettings] No global settings found');
        setLoading(false);
        return;
      }

      // Load settings from global data
      const rawProvider = (data as any).ai_provider;
      const provider: AiProvider = (rawProvider === 'openai' || rawProvider === 'anthropic') ? rawProvider : 'google';
      const rawKeys = (data as any).ai_api_keys ?? {};
      const apiKeys = {
        google: typeof rawKeys.google === 'string' ? rawKeys.google : '',
        openai: typeof rawKeys.openai === 'string' ? rawKeys.openai : '',
        anthropic: typeof rawKeys.anthropic === 'string' ? rawKeys.anthropic : '',
      };
      const safeModelMode = (data.ai_model_mode === 'flash' || data.ai_model_mode === 'pro' || data.ai_model_mode === 'pro3' || data.ai_model_mode === 'adaptive')
        ? data.ai_model_mode
        : 'flash';
      const catalogIds = MODEL_CATALOG[provider].map(m => m.id);
      const rawModel = (data as any).ai_model;
      const aiModel = (typeof rawModel === 'string' && catalogIds.includes(rawModel))
        ? rawModel
        : (provider === 'google' ? safeModelMode : MODEL_CATALOG[provider][0].id);

      setSettings({
        id: data.id,
        system_prompt_override: data.system_prompt_override,
        is_active: data.is_active,
        auto_response_enabled: data.auto_response_enabled,
        ai_model_mode: safeModelMode,
        ai_provider: provider,
        ai_model: aiModel,
        ai_api_keys: apiKeys,
        message_breaking_enabled: data.message_breaking_enabled,
        business_hours_start: data.business_hours_start,
        business_hours_end: data.business_hours_end,
        business_days: data.business_days,
        company_name: data.company_name,
        sdr_name: data.sdr_name,
        ai_scheduling_enabled: data.ai_scheduling_enabled ?? true,
      });
    } catch (error) {
      console.error('[AgentSettings] Error loading settings:', error);
      toast.error('Erro ao carregar configurações do agente');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update global settings (no user_id filter needed - RLS handles admin check)
      const { error } = await supabase
        .from('nina_settings')
        .update({
          system_prompt_override: settings.system_prompt_override,
          is_active: settings.is_active,
          auto_response_enabled: settings.auto_response_enabled,
          ai_model_mode: settings.ai_provider === 'google' ? settings.ai_model : settings.ai_model_mode,
          ai_provider: settings.ai_provider,
          ai_model: settings.ai_model,
          ai_api_keys: settings.ai_api_keys,
          message_breaking_enabled: settings.message_breaking_enabled,
          business_hours_start: settings.business_hours_start,
          business_hours_end: settings.business_hours_end,
          business_days: settings.business_days,
          out_of_hours_auto_reply: settings.out_of_hours_auto_reply,
          out_of_hours_cooldown_minutes: settings.out_of_hours_cooldown_minutes,
          company_name: settings.company_name,
          sdr_name: settings.sdr_name,
          ai_scheduling_enabled: settings.ai_scheduling_enabled,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', settings.id!);

      if (error) throw error;

      toast.success('Configurações do agente salvas com sucesso!');
    } catch (error) {
      console.error('Error saving agent settings:', error);
      toast.error('Erro ao salvar configurações do agente');
    } finally {
      setSaving(false);
    }
  };

  const toggleBusinessDay = (day: number) => {
    setSettings(prev => ({
      ...prev,
      business_days: prev.business_days.includes(day)
        ? prev.business_days.filter(d => d !== day)
        : [...prev.business_days, day].sort()
    }));
  };

  const handlePromptGenerated = (prompt: string) => {
    setSettings(prev => ({ ...prev, system_prompt_override: prompt }));
  };

  const handleRestoreDefault = () => {
    setSettings(prev => ({ ...prev, system_prompt_override: DEFAULT_NINA_PROMPT }));
    toast.success('Prompt restaurado para o padrão');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-brand-gold-500" />
      </div>
    );
  }

  return (
    <>
      <PromptGeneratorSheet
        open={isGeneratorOpen}
        onOpenChange={setIsGeneratorOpen}
        onPromptGenerated={handlePromptGenerated}
      />
      
      <TooltipProvider>
      <div className="space-y-6">
        {/* System Prompt - PRIMEIRA SEÇÃO */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Bot className="w-5 h-5 text-brand-gold-400" />
              <h3 className="font-semibold text-white">Prompt do Sistema</h3>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRestoreDefault}
                className="text-slate-400 hover:text-white hover:bg-slate-700"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Restaurar Padrão
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsGeneratorOpen(true)}
                className="text-brand-gold-400 hover:text-brand-gold-300 hover:bg-brand-gold-500/10"
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Gerar com IA
              </Button>
            </div>
          </div>
          
          {/* Nota explicativa sobre o prompt */}
          <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
            <p className="flex items-start gap-2">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Template de exemplo:</strong> Este é um modelo inicial para você começar. 
                Personalize completamente com as informações da sua empresa, produtos, serviços e tom de comunicação.
              </span>
            </p>
          </div>
          
          <textarea
            value={settings.system_prompt_override || ''}
            onChange={(e) => setSettings({ ...settings, system_prompt_override: e.target.value || null })}
            placeholder="Cole ou escreva o prompt do agente aqui..."
            rows={12}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-gold-500/50 resize-y font-mono custom-scrollbar"
          />
          <details className="mt-3">
            <summary className="text-xs text-brand-gold-400 cursor-pointer hover:text-brand-gold-300 flex items-center gap-2">
              <span>📋</span> Variáveis dinâmicas disponíveis
            </summary>
            <div className="mt-2 p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono space-y-1">
              <div><span className="text-brand-gold-400">{"{{ data_hora }}"}</span> → Data e hora atual (ex: 29/11/2024 14:35:22)</div>
              <div><span className="text-brand-gold-400">{"{{ data }}"}</span> → Apenas data (ex: 29/11/2024)</div>
              <div><span className="text-brand-gold-400">{"{{ hora }}"}</span> → Apenas hora (ex: 14:35:22)</div>
              <div><span className="text-brand-gold-400">{"{{ dia_semana }}"}</span> → Dia da semana por extenso (ex: sexta-feira)</div>
              <div><span className="text-brand-gold-400">{"{{ cliente_nome }}"}</span> → Nome do cliente na conversa</div>
              <div><span className="text-brand-gold-400">{"{{ cliente_telefone }}"}</span> → Telefone do cliente</div>
            </div>
          </details>
        </div>

        {/* 2-Column Grid: Company Info + Business Hours */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Company Info */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
            <div className="flex items-center gap-3 mb-4">
              <Building2 className="w-5 h-5 text-blue-400" />
              <h3 className="font-semibold text-white">Informações da Empresa</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">
                  Nome da Empresa <span className="text-amber-400 text-[10px]">(recomendado)</span>
                </label>
                <input
                  type="text"
                  value={settings.company_name || ''}
                  onChange={(e) => setSettings({ ...settings, company_name: e.target.value || null })}
                  placeholder="Nome da sua empresa"
                  className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">
                  Nome do Agente <span className="text-amber-400 text-[10px]">(recomendado)</span>
                </label>
                <input
                  type="text"
                  value={settings.sdr_name || ''}
                  onChange={(e) => setSettings({ ...settings, sdr_name: e.target.value || null })}
                  placeholder="Nome do agente (ex: Ana, Sofia)"
                  className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            </div>
          </div>

          {/* Business Hours — per department */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TeamHoursCard teamMatch="comercial" title="Atendimento / Comercial" accent="indigo" />
            <TeamHoursCard teamMatch="produção" title="Produção" accent="emerald" />
          </div>

        </div>

        {/* Comportamento */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Bot className="w-5 h-5 text-violet-400" />
            <h3 className="font-semibold text-white">Comportamento</h3>
          </div>
          
          {/* AI Model Selection */}
          <div className="mb-4">
            <label className="text-xs font-medium text-slate-400 mb-3 block">Modelo de IA</label>

            {/* Provider pill selector */}
            <div className="flex gap-2 mb-3">
              {PROVIDERS.map((p) => {
                const active = settings.ai_provider === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      const catalog = MODEL_CATALOG[p.id];
                      const currentIsValid = catalog.some(m => m.id === settings.ai_model);
                      const nextModel = currentIsValid ? settings.ai_model : catalog[0].id;
                      setSettings({ ...settings, ai_provider: p.id, ai_model: nextModel });
                      setApiKeyError(null);
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all ${
                      active
                        ? 'bg-violet-500/20 border-violet-500 text-violet-300'
                        : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[11px] font-bold ${active ? 'bg-violet-500/30' : 'bg-slate-800'}`}>
                      {p.iconLabel}
                    </span>
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Model cards (dynamic per provider) */}
            <div className="grid grid-cols-4 gap-2">
              {MODEL_CATALOG[settings.ai_provider].map((m) => {
                const active = settings.ai_model === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSettings({ ...settings, ai_model: m.id })}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-all ${
                      active
                        ? 'bg-violet-500/20 border-violet-500 text-violet-300'
                        : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-lg">{m.icon}</span>
                    <span className="text-xs font-medium">{m.label}</span>
                    <span className="text-[10px] text-center opacity-70">{m.tag}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {MODEL_CATALOG[settings.ai_provider].find(m => m.id === settings.ai_model)?.desc ?? ''}
            </p>

            {/* API Key for current provider */}
            {(() => {
              const provider = PROVIDERS.find(p => p.id === settings.ai_provider)!;
              const value = settings.ai_api_keys[settings.ai_provider] ?? '';
              const hasValue = value.trim().length > 0;
              const borderClass = apiKeyError
                ? 'border-red-500 focus:ring-red-500/50'
                : hasValue
                  ? 'border-emerald-500/60 focus:ring-emerald-500/50'
                  : 'border-slate-700 focus:ring-violet-500/50';
              return (
                <div className="mt-4">
                  <label className="text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5" />
                    API Key — {provider.label}
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={value}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          ai_api_keys: { ...settings.ai_api_keys, [settings.ai_provider]: e.target.value },
                        });
                        if (apiKeyError) setApiKeyError(null);
                      }}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v.length === 0) { setApiKeyError(null); return; }
                        setApiKeyError(provider.keyPrefix.test(v) ? null : `Formato inválido. Esperado prefixo "${provider.placeholder.replace('...', '')}"`);
                      }}
                      placeholder={provider.placeholder}
                      autoComplete="off"
                      spellCheck={false}
                      className={`h-9 w-full rounded-lg border bg-slate-950 pl-3 pr-10 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 transition-colors ${borderClass}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(s => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                      aria-label={showApiKey ? 'Ocultar chave' : 'Revelar chave'}
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {apiKeyError ? (
                    <p className="text-[11px] text-red-400 mt-1.5">{apiKeyError}</p>
                  ) : (
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      Sua chave é salva com criptografia e nunca é exposta publicamente.
                    </p>
                  )}
                </div>
              );
            })()}
          </div>


          {/* Toggles em grid 2x2 com tooltips */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-950/50 border border-slate-800">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-sm text-slate-300 cursor-help flex items-center gap-1.5">
                    Agente Ativo
                    <Info className="w-3 h-3 text-slate-500" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-[200px]">Liga ou desliga o agente de IA completamente. Quando desativado, nenhuma resposta automática será enviada.</p>
                </TooltipContent>
              </Tooltip>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.is_active}
                  onChange={(e) => setSettings({ ...settings, is_active: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-gold-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-gold-500"></div>
              </label>
            </div>

            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-950/50 border border-slate-800">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-sm text-slate-300 cursor-help flex items-center gap-1.5">
                    Resposta Automática
                    <Info className="w-3 h-3 text-slate-500" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-[200px]">Quando ativo, o agente responde automaticamente sem necessidade de aprovação humana.</p>
                </TooltipContent>
              </Tooltip>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.auto_response_enabled}
                  onChange={(e) => setSettings({ ...settings, auto_response_enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-gold-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-gold-500"></div>
              </label>
            </div>

            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-950/50 border border-slate-800">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-sm text-slate-300 cursor-help flex items-center gap-1.5">
                    Quebrar Mensagens
                    <Info className="w-3 h-3 text-slate-500" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-[200px]">Divide respostas longas em várias mensagens menores, simulando uma conversa mais natural.</p>
                </TooltipContent>
              </Tooltip>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.message_breaking_enabled}
                  onChange={(e) => setSettings({ ...settings, message_breaking_enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-gold-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-gold-500"></div>
              </label>
            </div>

            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-950/50 border border-slate-800">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-sm text-slate-300 cursor-help flex items-center gap-1.5">
                    Agendamento via IA
                    <Info className="w-3 h-3 text-slate-500" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-[200px]">Permite que o agente crie, altere e cancele agendamentos automaticamente durante a conversa.</p>
                </TooltipContent>
              </Tooltip>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.ai_scheduling_enabled}
                  onChange={(e) => setSettings({ ...settings, ai_scheduling_enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-gold-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-gold-500"></div>
              </label>
            </div>
          </div>
        </div>

      </div>
      </TooltipProvider>
    </>
  );
});

AgentSettings.displayName = 'AgentSettings';

// ===== Per-team business hours card =====
interface TeamHoursCardProps {
  teamMatch: string; // lowercase substring of team name
  title: string;
  accent: 'indigo' | 'emerald';
}

const TeamHoursCard: React.FC<TeamHoursCardProps> = ({ teamMatch, title, accent }) => {
  const accentClasses = accent === 'emerald'
    ? { icon: 'text-emerald-400', ring: 'focus:ring-emerald-500/50', activeBtn: 'bg-emerald-500 text-white', save: 'bg-emerald-500 hover:bg-emerald-400 text-white' }
    : { icon: 'text-indigo-400', ring: 'focus:ring-indigo-500/50', activeBtn: 'bg-indigo-500 text-white', save: 'bg-indigo-500 hover:bg-indigo-400 text-white' };

  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamMissing, setTeamMissing] = useState(false);
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('18:00');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: teams, error } = await supabase.from('teams').select('id,name');
        if (error) throw error;
        const match = (teams || []).find((t: any) => (t.name || '').toLowerCase().includes(teamMatch));
        if (!match) {
          setTeamMissing(true);
          return;
        }
        setTeamId(match.id);
        const { data: rows, error: hErr } = await supabase
          .from('team_business_hours')
          .select('day_of_week,is_open,start_time,end_time')
          .eq('team_id', match.id);
        if (hErr) throw hErr;
        const open = (rows || []).filter((r: any) => r.is_open);
        if (open.length > 0) {
          setDays(open.map((r: any) => r.day_of_week).sort());
          setStart(((open[0] as any).start_time || '08:00').slice(0, 5));
          setEnd(((open[0] as any).end_time || '18:00').slice(0, 5));
        }
      } catch (e) {
        console.error('[TeamHoursCard]', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [teamMatch]);

  const toggleDay = (d: number) => {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());
  };

  const save = async () => {
    if (!teamId) return;
    setSaving(true);
    try {
      const payload = Array.from({ length: 7 }, (_, d) => ({
        team_id: teamId,
        day_of_week: d,
        is_open: days.includes(d),
        start_time: start,
        end_time: end,
      }));
      const { error } = await supabase
        .from('team_business_hours')
        .upsert(payload, { onConflict: 'team_id,day_of_week' });
      if (error) throw error;
      toast.success(`Horário de ${title} salvo!`);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar horário');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <Calendar className={`w-5 h-5 ${accentClasses.icon}`} />
          <h3 className="font-semibold text-white">{title}</h3>
        </div>
        {!loading && !teamMissing && (
          <button
            onClick={save}
            disabled={saving}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all disabled:opacity-50 ${accentClasses.save}`}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-slate-500" /></div>
      ) : teamMissing ? (
        <p className="text-sm text-slate-500">Departamento não encontrado. Crie a equipe "{teamMatch}" em Equipe.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Início</label>
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className={`h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:outline-none focus:ring-2 ${accentClasses.ring}`}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Fim</label>
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className={`h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:outline-none focus:ring-2 ${accentClasses.ring}`}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 mb-2 block">Dias da Semana</label>
            <div className="flex gap-1.5 flex-wrap">
              {DAYS_OF_WEEK.map(day => (
                <button
                  key={day.value}
                  onClick={() => toggleDay(day.value)}
                  className={`flex-1 min-w-[40px] h-9 text-xs font-medium rounded-lg transition-all ${
                    days.includes(day.value)
                      ? accentClasses.activeBtn
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Para horários diferentes por dia (ex: Domingo 08–17), use <b>Equipe → Configurar → Horários</b>.
          </p>
        </div>
      )}
    </div>
  );
};

export default AgentSettings;
