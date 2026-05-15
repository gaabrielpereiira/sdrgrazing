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
