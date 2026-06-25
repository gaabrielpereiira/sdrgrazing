// Canonical list of support ticket reasons.
// Stored as tags in `conversations.tags` with the `motivo:` prefix.

export const SUPPORT_REASON_PREFIX = 'motivo:';

export interface SupportReason {
  key: string; // slug used in tag (without prefix)
  label: string;
}

export const SUPPORT_REASONS: SupportReason[] = [
  { key: 'cobranca', label: 'Cobrança' },
  { key: 'acesso', label: 'Acesso' },
  { key: 'bug', label: 'Bug' },
  { key: 'duvida', label: 'Dúvida' },
  { key: 'pedido', label: 'Pedido' },
  { key: 'outro', label: 'Outro' },
];

export const UNCLASSIFIED_REASON: SupportReason = {
  key: 'nao_classificado',
  label: 'Não classificado',
};

export const reasonTag = (key: string) => `${SUPPORT_REASON_PREFIX}${key}`;

export const isReasonTag = (tag: string) => tag.startsWith(SUPPORT_REASON_PREFIX);

export const reasonKeyFromTag = (tag: string) => tag.slice(SUPPORT_REASON_PREFIX.length);

export const labelForReasonKey = (key: string): string => {
  const found = SUPPORT_REASONS.find((r) => r.key === key);
  if (found) return found.label;
  if (key === UNCLASSIFIED_REASON.key) return UNCLASSIFIED_REASON.label;
  // Fallback: capitalize slug
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
};

// ============================================================
// Sentiment tags (set by Donatella when handing off to Produção)
// ============================================================

export const SENTIMENT_PREFIX = 'sentimento:';

export interface SupportSentiment {
  key: string;
  label: string;
}

export const SUPPORT_SENTIMENTS: SupportSentiment[] = [
  { key: 'calmo', label: 'Calmo' },
  { key: 'neutro', label: 'Neutro' },
  { key: 'frustrado', label: 'Frustrado' },
  { key: 'urgente', label: 'Urgente' },
];

export const sentimentTag = (key: string) => `${SENTIMENT_PREFIX}${key}`;
export const isSentimentTag = (tag: string) => tag.startsWith(SENTIMENT_PREFIX);
export const sentimentKeyFromTag = (tag: string) => tag.slice(SENTIMENT_PREFIX.length);
export const labelForSentimentKey = (key: string): string => {
  const found = SUPPORT_SENTIMENTS.find((s) => s.key === key);
  if (found) return found.label;
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
};

