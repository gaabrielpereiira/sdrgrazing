// Canonical taxonomy of post-sale support cases.
// Used by:
//  - nina-orchestrator edge function (classification)
//  - AgentSettings (persistence)
//  - SupportReasonsDashboard (labels + colors)
//
// Any change here MUST also be applied to the mirrored constants in
// supabase/functions/nina-orchestrator/index.ts (SUPPORT_GROUPS/CATEGORIES).

export type SupportGroupKey = 'entrega' | 'produto' | 'pedido_pagamento' | 'outros';

export interface SupportGroup {
  key: SupportGroupKey;
  label: string;
  color: string; // tailwind color tag for chips
}

export const SUPPORT_GROUPS: SupportGroup[] = [
  { key: 'entrega',          label: 'Entrega',          color: 'sky' },
  { key: 'produto',          label: 'Produto',          color: 'violet' },
  { key: 'pedido_pagamento', label: 'Pedido / Pagamento', color: 'amber' },
  { key: 'outros',           label: 'Outros',           color: 'slate' },
];

export interface SupportCategory {
  key: string;
  label: string;
  group: SupportGroupKey;
  requerAgenteHumanoDefault: boolean;
}

export const SUPPORT_CATEGORIES: SupportCategory[] = [
  // entrega — sempre humano
  { key: 'atraso_entrega',           label: 'Atraso na entrega',        group: 'entrega', requerAgenteHumanoDefault: true },
  { key: 'nao_entregue',             label: 'Pedido não entregue',      group: 'entrega', requerAgenteHumanoDefault: true },
  { key: 'endereco_incorreto',       label: 'Endereço incorreto',       group: 'entrega', requerAgenteHumanoDefault: true },
  { key: 'dificuldade_acesso',       label: 'Dificuldade de acesso',    group: 'entrega', requerAgenteHumanoDefault: true },
  { key: 'embalagem_danificada',     label: 'Embalagem danificada',     group: 'entrega', requerAgenteHumanoDefault: true },
  // produto — sempre humano
  { key: 'produto_diferente',        label: 'Produto diferente',        group: 'produto', requerAgenteHumanoDefault: true },
  { key: 'produto_incompleto',       label: 'Produto incompleto',       group: 'produto', requerAgenteHumanoDefault: true },
  { key: 'qualidade_abaixo_esperado',label: 'Qualidade abaixo do esperado', group: 'produto', requerAgenteHumanoDefault: true },
  { key: 'produto_avariado',         label: 'Produto avariado',         group: 'produto', requerAgenteHumanoDefault: true },
  { key: 'divergencia_foto_site',    label: 'Divergência foto x site',  group: 'produto', requerAgenteHumanoDefault: true },
  // pedido / pagamento — sempre humano
  { key: 'erro_pedido',              label: 'Erro no pedido',           group: 'pedido_pagamento', requerAgenteHumanoDefault: true },
  { key: 'problema_pagamento',       label: 'Problema no pagamento',    group: 'pedido_pagamento', requerAgenteHumanoDefault: true },
  { key: 'cancelamento',             label: 'Cancelamento',             group: 'pedido_pagamento', requerAgenteHumanoDefault: true },
  { key: 'reembolso_troca',          label: 'Reembolso / troca',        group: 'pedido_pagamento', requerAgenteHumanoDefault: true },
  // outros
  { key: 'elogio_feedback_positivo', label: 'Elogio / feedback positivo', group: 'outros', requerAgenteHumanoDefault: false },
  { key: 'duvida_geral_pos_compra',  label: 'Dúvida geral pós-compra',    group: 'outros', requerAgenteHumanoDefault: false },
  { key: 'outro',                    label: 'Outro',                     group: 'outros', requerAgenteHumanoDefault: true },
];

export const SUPPORT_CATEGORY_KEYS = SUPPORT_CATEGORIES.map((c) => c.key);
export const SUPPORT_GROUP_KEYS = SUPPORT_GROUPS.map((g) => g.key);

const CATEGORY_BY_KEY: Record<string, SupportCategory> = SUPPORT_CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.key]: c }),
  {},
);
const GROUP_BY_KEY: Record<string, SupportGroup> = SUPPORT_GROUPS.reduce(
  (acc, g) => ({ ...acc, [g.key]: g }),
  {},
);

export function getCategory(key: string): SupportCategory | undefined {
  return CATEGORY_BY_KEY[key];
}
export function getGroup(key: string): SupportGroup | undefined {
  return GROUP_BY_KEY[key];
}
export function labelForCategory(key: string): string {
  return CATEGORY_BY_KEY[key]?.label ?? key;
}
export function labelForGroup(key: string): string {
  return GROUP_BY_KEY[key]?.label ?? key;
}

export type SupportResolutionStatus = 'resolvido_pela_ia' | 'encaminhado_agente';

export const RESOLUTION_LABEL: Record<SupportResolutionStatus, string> = {
  resolvido_pela_ia: 'Resolvido pela IA',
  encaminhado_agente: 'Encaminhado ao agente',
};
