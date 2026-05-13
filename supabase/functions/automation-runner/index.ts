import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Exponential backoff in minutes per attempt
const RETRY_BACKOFF_MIN = [1, 5, 30, 120, 720];
const MAX_RETRIES = RETRY_BACKOFF_MIN.length;

function getByPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
    .reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function normalizePhone(raw: any): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D+/g, '');
  return digits.length >= 8 ? digits : null;
}

function compareValues(a: any, op: string, b: string): boolean {
  if (op === 'eq') return String(a ?? '') === b;
  if (op === 'neq') return String(a ?? '') !== b;
  if (op === 'contains') return String(a ?? '').toLowerCase().includes(b.toLowerCase());
  if (op === 'gte') return Number(a) >= Number(b);
  if (op === 'lte') return Number(a) <= Number(b);
  return false;
}

function matchesFilters(payload: any, filters: any): boolean {
  const conditions = filters?.conditions || [];
  if (conditions.length === 0) return true;
  const logic = (filters?.logic || 'AND').toUpperCase();
  const results = conditions.map((c: any) => {
    const val = getByPath(payload, c.field);
    if (c.operator === 'is_first_order') return Boolean(payload?._is_first_order ?? false);
    return compareValues(val, c.operator, c.value);
  });
  return logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
}

function renderTemplate(tpl: string, payload: any): string {
  if (!tpl) return '';
  return String(tpl).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, path) => {
    const v = getByPath(payload, String(path).trim());
    return v == null ? '' : String(v);
  });
}

async function findOrCreateContact(supabase: any, phone: string, payload: any) {
  const { data: existing } = await supabase
    .from('contacts').select('id, name').eq('phone_number', phone).maybeSingle();
  if (existing) return existing;
  const name =
    [getByPath(payload, 'billing.first_name'), getByPath(payload, 'billing.last_name')]
      .filter(Boolean).join(' ').trim() ||
    getByPath(payload, 'first_name') || null;
  const { data: created, error } = await supabase
    .from('contacts').insert({ phone_number: phone, name, whatsapp_id: phone })
    .select('id, name').single();
  if (error) throw new Error(`contact insert: ${error.message}`);
  return created;
}

async function findOrCreateConversation(supabase: any, contactId: string) {
  const { data: existing } = await supabase
    .from('conversations').select('id').eq('contact_id', contactId).eq('is_active', true)
    .order('last_message_at', { ascending: false }).limit(1).maybeSingle();
  if (existing) return existing;
  const { data: created, error } = await supabase
    .from('conversations').insert({ contact_id: contactId, status: 'nina', queue: 'sales', is_active: true })
    .select('id').single();
  if (error) throw new Error(`conversation insert: ${error.message}`);
  return created;
}

async function isInCooldown(supabase: any, phone: string, ruleId: string, hours: number): Promise<boolean> {
  if (!hours || hours <= 0) return false;
  const { data } = await supabase
    .from('contact_cooldowns').select('last_sent_at')
    .eq('contact_phone', phone).eq('rule_id', ruleId).maybeSingle();
  if (!data?.last_sent_at) return false;
  const elapsed = (Date.now() - new Date(data.last_sent_at).getTime()) / (1000 * 60 * 60);
  return elapsed < hours;
}

// ─── Action handlers ──────────────────────────────────────────────────

async function actionWhatsapp(supabase: any, rule: any, event: any) {
  const cfg = rule.action_config || {};
  const phoneField = cfg.phone_field || 'billing.phone';
  const phone = normalizePhone(getByPath(event.payload, phoneField));
  if (!phone) return { status: 'failed', result: { reason: 'no_phone', phone_field: phoneField } };

  if (await isInCooldown(supabase, phone, rule.id, rule.cooldown_hours || 0)) {
    return { status: 'skipped', result: { reason: 'cooldown', phone } };
  }

  const { data: tpl } = await supabase
    .from('whatsapp_templates').select('id, name, language, components, status')
    .eq('id', cfg.template_id).maybeSingle();
  if (!tpl) return { status: 'failed', result: { reason: 'template_not_found', template_id: cfg.template_id } };
  if (tpl.status !== 'APPROVED') return { status: 'failed', result: { reason: 'template_not_approved', status: tpl.status } };

  const variablePaths: string[] = Array.isArray(cfg.variables) ? cfg.variables : [];
  const vars: Record<string, string> = {};
  variablePaths.forEach((p, i) => { const v = getByPath(event.payload, p); vars[String(i + 1)] = v == null ? '' : String(v); });

  const contact = await findOrCreateContact(supabase, phone, event.payload);
  const conversation = await findOrCreateConversation(supabase, contact.id);

  const previewBody = (tpl.components || []).find((c: any) => (c.type || '').toUpperCase() === 'BODY')?.text || tpl.name;
  const previewText = String(previewBody).replace(/\{\{(\d+)\}\}/g, (_m, n) => vars[String(n)] ?? '');

  const { error: queueErr } = await supabase.from('send_queue').insert({
    conversation_id: conversation.id, contact_id: contact.id,
    from_type: 'nina', message_type: 'text', content: previewText, priority: 5,
    metadata: {
      source: 'automation', rule_id: rule.id, event_id: event.id,
      template: { name: tpl.name, language: tpl.language || 'pt_BR', components: tpl.components, variables: vars },
    },
  });
  if (queueErr) return { status: 'failed', result: { reason: 'send_queue_insert_failed', error: queueErr.message } };

  await supabase.from('contact_cooldowns').upsert(
    { contact_phone: phone, rule_id: rule.id, last_sent_at: new Date().toISOString() },
    { onConflict: 'contact_phone,rule_id' }
  );

  return { status: 'success', result: { phone, template: tpl.name, conversation_id: conversation.id } };
}

async function actionCrmUpdate(supabase: any, rule: any, event: any) {
  const cfg = rule.action_config || {};
  const phoneField = cfg.phone_field || 'billing.phone';
  const phone = normalizePhone(getByPath(event.payload, phoneField));
  if (!phone) return { status: 'failed', result: { reason: 'no_phone' } };

  const { data: contact } = await supabase
    .from('contacts').select('id, tags').eq('phone_number', phone).maybeSingle();
  if (!contact) return { status: 'skipped', result: { reason: 'contact_not_found', phone } };

  const result: any = { phone, contact_id: contact.id };

  if (Array.isArray(cfg.add_tags) && cfg.add_tags.length > 0) {
    const merged = Array.from(new Set([...(contact.tags || []), ...cfg.add_tags]));
    const { error } = await supabase.from('contacts').update({ tags: merged }).eq('id', contact.id);
    if (error) return { status: 'failed', result: { reason: 'tag_update_failed', error: error.message } };
    result.tags_added = cfg.add_tags;
  }

  if (cfg.move_deal_stage_id) {
    const { data: deal } = await supabase
      .from('deals').select('id').eq('contact_id', contact.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!deal) {
      result.deal_move = 'skipped_no_deal';
    } else {
      const { error } = await supabase.from('deals')
        .update({ stage_id: cfg.move_deal_stage_id, updated_at: new Date().toISOString() })
        .eq('id', deal.id);
      if (error) return { status: 'failed', result: { reason: 'deal_update_failed', error: error.message } };
      result.deal_id = deal.id;
      result.moved_to_stage = cfg.move_deal_stage_id;
    }
  }

  return { status: 'success', result };
}

async function actionInternalNotification(supabase: any, rule: any, event: any) {
  const cfg = rule.action_config || {};
  const title = renderTemplate(cfg.title || `Automação: ${rule.name}`, event.payload).slice(0, 200);
  const body = renderTemplate(cfg.body || '', event.payload).slice(0, 1000);

  let contactId: string | null = null;
  if (cfg.phone_field) {
    const phone = normalizePhone(getByPath(event.payload, cfg.phone_field));
    if (phone) {
      const { data } = await supabase.from('contacts').select('id').eq('phone_number', phone).maybeSingle();
      contactId = data?.id ?? null;
    }
  }

  const { error } = await supabase.from('notifications').insert({
    type: cfg.type || 'automation',
    title, body: body || null,
    contact_id: contactId,
    metadata: { rule_id: rule.id, event_id: event.id, topic: event.topic },
  });
  if (error) return { status: 'failed', result: { reason: 'notification_insert_failed', error: error.message } };
  return { status: 'success', result: { title, contact_id: contactId } };
}

async function actionOutboundWebhook(rule: any, event: any) {
  const cfg = rule.action_config || {};
  const url = cfg.url;
  if (!url) return { status: 'failed', result: { reason: 'no_url' } };

  const method = (cfg.method || 'POST').toUpperCase();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(cfg.headers || {}) };
  const bodyTpl = cfg.body_template;
  let body: string;
  if (typeof bodyTpl === 'string' && bodyTpl.trim()) {
    body = renderTemplate(bodyTpl, event.payload);
  } else {
    body = JSON.stringify({ rule: rule.name, topic: event.topic, event_id: event.id, payload: event.payload });
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { method, headers, body, signal: ctrl.signal });
    clearTimeout(timer);
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      return { status: 'failed', result: { reason: 'http_error', status: res.status, body: text.slice(0, 500) } };
    }
    return { status: 'success', result: { url, http_status: res.status, response_preview: text.slice(0, 200) } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return { status: 'failed', result: { reason: 'fetch_error', error: msg } };
  }
}

// ─── Event processing ─────────────────────────────────────────────────

async function processEvent(supabase: any, event: any) {
  const { data: rules, error: rulesErr } = await supabase
    .from('automation_rules').select('*').eq('active', true).eq('trigger_topic', event.topic);
  if (rulesErr) throw rulesErr;
  console.log(`[runner] event=${event.id} topic=${event.topic} matched ${rules?.length || 0} active rule(s)`);

  let queuedWhatsapp = false;

  for (const rule of rules || []) {
    try {
      if (!matchesFilters(event.payload, rule.filters)) {
        await supabase.from('automation_logs').insert({
          rule_id: rule.id, event_id: event.id, status: 'skipped',
          result: { reason: 'filters_not_matched' },
        });
        continue;
      }

      let outcome: { status: string; result: any };
      switch (rule.action_type) {
        case 'whatsapp_message': outcome = await actionWhatsapp(supabase, rule, event); if (outcome.status === 'success') queuedWhatsapp = true; break;
        case 'crm_update': outcome = await actionCrmUpdate(supabase, rule, event); break;
        case 'internal_notification': outcome = await actionInternalNotification(supabase, rule, event); break;
        case 'outbound_webhook': outcome = await actionOutboundWebhook(rule, event); break;
        default:
          outcome = { status: 'skipped', result: { reason: 'unknown_action_type', action_type: rule.action_type } };
      }

      await supabase.from('automation_logs').insert({
        rule_id: rule.id, event_id: event.id, status: outcome.status, result: outcome.result,
      });
      console.log(`[runner] rule=${rule.id} action=${rule.action_type} → ${outcome.status}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      console.error(`[runner] rule ${rule.id} failed:`, msg);
      await supabase.from('automation_logs').insert({
        rule_id: rule.id, event_id: event.id, status: 'failed',
        result: { reason: 'exception', error: msg },
      });
    }
  }

  await supabase.from('webhook_events')
    .update({ processed: true, error: null, next_retry_at: null }).eq('id', event.id);
  return { queuedWhatsapp };
}

async function scheduleRetry(supabase: any, event: any, errorMsg: string) {
  const attempt = (event.retry_count ?? 0) + 1;
  if (attempt > MAX_RETRIES) {
    await supabase.from('webhook_events').update({
      processed: true, // give up
      error: `[max_retries] ${errorMsg}`,
      retry_count: attempt,
      last_error_at: new Date().toISOString(),
      next_retry_at: null,
    }).eq('id', event.id);
    await supabase.from('automation_logs').insert({
      rule_id: null, event_id: event.id, status: 'failed',
      result: { reason: 'max_retries_exceeded', attempts: attempt, error: errorMsg },
    });
    console.warn(`[runner] event ${event.id} exhausted retries`);
    return;
  }
  const minutes = RETRY_BACKOFF_MIN[attempt - 1];
  const next = new Date(Date.now() + minutes * 60_000).toISOString();
  await supabase.from('webhook_events').update({
    error: errorMsg, retry_count: attempt,
    last_error_at: new Date().toISOString(),
    next_retry_at: next,
  }).eq('id', event.id);
  console.log(`[runner] event ${event.id} retry ${attempt}/${MAX_RETRIES} scheduled at ${next}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    let events: any[] = [];
    if (body.event_id) {
      const { data, error } = await supabase
        .from('webhook_events').select('*').eq('id', body.event_id).maybeSingle();
      if (error) throw error;
      if (data && (!data.processed || body.reprocess === true)) {
        // Manual reprocess resets retry counter
        if (body.reprocess === true && data.processed) {
          await supabase.from('webhook_events').update({
            processed: false, error: null, retry_count: 0, next_retry_at: null,
          }).eq('id', data.id);
          data.processed = false; data.retry_count = 0; data.next_retry_at = null;
        }
        events = [data];
      }
    } else {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('webhook_events').select('*').eq('processed', false)
        .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
        .order('received_at', { ascending: true }).limit(50);
      if (error) throw error;
      events = data || [];
    }

    console.log(`[runner] processing ${events.length} event(s)`);
    let triggerSender = false;
    for (const ev of events) {
      try {
        const r = await processEvent(supabase, ev);
        if (r.queuedWhatsapp) triggerSender = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'unknown';
        console.error(`[runner] event ${ev.id} failed:`, msg);
        await scheduleRetry(supabase, ev, msg);
      }
    }

    if (triggerSender) {
      fetch(`${supabaseUrl}/functions/v1/whatsapp-sender`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).catch((e) => console.warn('[runner] sender trigger failed:', e));
    }

    return new Response(JSON.stringify({ success: true, processed: events.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[runner] fatal:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
