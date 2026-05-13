import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AutomationRule {
  id: string;
  name: string;
  trigger_topic: string;
  filters: { conditions: Array<{ field: string; operator: string; value: string }>; logic: 'AND' | 'OR' };
  action_type: string;
  action_config: Record<string, any>;
  active: boolean;
  cooldown_hours: number;
  created_at: string;
  updated_at: string;
}

export interface AutomationLog {
  id: string;
  rule_id: string | null;
  event_id: string | null;
  status: 'success' | 'failed' | 'skipped' | string;
  result: Record<string, any>;
  executed_at: string;
}

export interface WebhookEvent {
  id: string;
  topic: string;
  payload: any;
  source: string;
  processed: boolean;
  error: string | null;
  received_at: string;
}

export function useAutomations() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingEvents, setPendingEvents] = useState(0);

  const refresh = useCallback(async () => {
    const [rulesRes, eventsRes] = await Promise.all([
      supabase.from('automation_rules').select('*').order('created_at', { ascending: false }),
      supabase.from('webhook_events').select('id', { count: 'exact', head: true }).eq('processed', false),
    ]);
    if (!rulesRes.error) setRules((rulesRes.data || []) as any);
    if (!eventsRes.error) setPendingEvents(eventsRes.count || 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel('automations-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_rules' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'webhook_events' }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  return { rules, loading, pendingEvents, refresh };
}

export const TRIGGER_TOPICS = [
  { value: 'order.created', label: 'Pedido criado' },
  { value: 'order.updated', label: 'Pedido atualizado' },
  { value: 'order.deleted', label: 'Pedido removido' },
  { value: 'customer.created', label: 'Cliente criado' },
  { value: 'customer.updated', label: 'Cliente atualizado' },
  { value: 'product.updated', label: 'Produto atualizado' },
];

export const FIELD_SUGGESTIONS = [
  'total', 'status', 'billing.phone', 'billing.first_name', 'billing.email',
  'customer_id', 'line_items[0].product_id', 'payment_method',
];

export const OPERATORS = [
  { value: 'eq', label: 'igual a (=)' },
  { value: 'neq', label: 'diferente de (≠)' },
  { value: 'gte', label: 'maior ou igual (≥)' },
  { value: 'lte', label: 'menor ou igual (≤)' },
  { value: 'contains', label: 'contém' },
  { value: 'is_first_order', label: 'é primeiro pedido' },
];

export const ACTION_TYPES = [
  { value: 'whatsapp_message', label: 'Enviar mensagem WhatsApp', enabled: true },
  { value: 'crm_update', label: 'Atualizar CRM (tags / mover deal)', enabled: true },
  { value: 'internal_notification', label: 'Notificação interna', enabled: true },
  { value: 'outbound_webhook', label: 'Webhook externo', enabled: true },
];
