import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function getByPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  // supports "a.b.c" and "a[0].b"
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
    if (c.operator === 'is_first_order') {
      // Heuristic: WooCommerce includes customer's order count via meta or we trust truthy
      return Boolean(payload?._is_first_order ?? false);
    }
    return compareValues(val, c.operator, c.value);
  });

  return logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
}

async function findOrCreateContact(supabase: any, phone: string, payload: any) {
  const { data: existing } = await supabase
    .from('contacts')
    .select('id, name')
    .eq('phone_number', phone)
    .maybeSingle();
  if (existing) return existing;

  const name =
    [getByPath(payload, 'billing.first_name'), getByPath(payload, 'billing.last_name')]
      .filter(Boolean).join(' ').trim() ||
    getByPath(payload, 'first_name') ||
    null;

  const { data: created, error } = await supabase
    .from('contacts')
    .insert({ phone_number: phone, name, whatsapp_id: phone })
    .select('id, name')
    .single();
  if (error) throw new Error(`contact insert: ${error.message}`);
  return created;
}

async function findOrCreateConversation(supabase: any, contactId: string) {
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('contact_id', contactId)
    .eq('is_active', true)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({ contact_id: contactId, status: 'nina', queue: 'sales', is_active: true })
    .select('id')
    .single();
  if (error) throw new Error(`conversation insert: ${error.message}`);
  return created;
}

async function isInCooldown(supabase: any, phone: string, ruleId: string, hours: number): Promise<boolean> {
  if (!hours || hours <= 0) return false;
  const { data } = await supabase
    .from('contact_cooldowns')
    .select('last_sent_at')
    .eq('contact_phone', phone)
    .eq('rule_id', ruleId)
    .maybeSingle();
  if (!data?.last_sent_at) return false;
  const elapsed = (Date.now() - new Date(data.last_sent_at).getTime()) / (1000 * 60 * 60);
  return elapsed < hours;
}

async function processEvent(supabase: any, event: any) {
  const { data: rules, error: rulesErr } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('active', true)
    .eq('trigger_topic', event.topic);

  if (rulesErr) throw rulesErr;
  console.log(`[runner] event=${event.id} topic=${event.topic} matched ${rules?.length || 0} active rule(s)`);

  for (const rule of rules || []) {
    try {
      if (!matchesFilters(event.payload, rule.filters)) {
        await supabase.from('automation_logs').insert({
          rule_id: rule.id, event_id: event.id, status: 'skipped',
          result: { reason: 'filters_not_matched' },
        });
        continue;
      }

      if (rule.action_type !== 'whatsapp_message') {
        await supabase.from('automation_logs').insert({
          rule_id: rule.id, event_id: event.id, status: 'skipped',
          result: { reason: 'action_not_implemented', action_type: rule.action_type },
        });
        continue;
      }

      const cfg = rule.action_config || {};
      const phoneField = cfg.phone_field || 'billing.phone';
      const phone = normalizePhone(getByPath(event.payload, phoneField));

      if (!phone) {
        await supabase.from('automation_logs').insert({
          rule_id: rule.id, event_id: event.id, status: 'failed',
          result: { reason: 'no_phone', phone_field: phoneField },
        });
        continue;
      }

      if (await isInCooldown(supabase, phone, rule.id, rule.cooldown_hours || 0)) {
        await supabase.from('automation_logs').insert({
          rule_id: rule.id, event_id: event.id, status: 'skipped',
          result: { reason: 'cooldown', phone },
        });
        continue;
      }

      const { data: tpl, error: tplErr } = await supabase
        .from('whatsapp_templates')
        .select('id, name, language, components, status')
        .eq('id', cfg.template_id)
        .maybeSingle();

      if (tplErr || !tpl) {
        await supabase.from('automation_logs').insert({
          rule_id: rule.id, event_id: event.id, status: 'failed',
          result: { reason: 'template_not_found', template_id: cfg.template_id },
        });
        continue;
      }
      if (tpl.status !== 'APPROVED') {
        await supabase.from('automation_logs').insert({
          rule_id: rule.id, event_id: event.id, status: 'failed',
          result: { reason: 'template_not_approved', status: tpl.status },
        });
        continue;
      }

      // Resolve variables: each entry is a path on payload → {{1}}, {{2}}, ...
      const variablePaths: string[] = Array.isArray(cfg.variables) ? cfg.variables : [];
      const vars: Record<string, string> = {};
      variablePaths.forEach((path, i) => {
        const v = getByPath(event.payload, path);
        vars[String(i + 1)] = v == null ? '' : String(v);
      });

      const contact = await findOrCreateContact(supabase, phone, event.payload);
      const conversation = await findOrCreateConversation(supabase, contact.id);

      // Build a readable preview content for the messages table
      const previewBody = (tpl.components || [])
        .find((c: any) => (c.type || '').toUpperCase() === 'BODY')?.text || tpl.name;
      const previewText = String(previewBody).replace(/\{\{(\d+)\}\}/g, (_m, n) => vars[String(n)] ?? '');

      const { error: queueErr } = await supabase.from('send_queue').insert({
        conversation_id: conversation.id,
        contact_id: contact.id,
        from_type: 'nina',
        message_type: 'text',
        content: previewText,
        priority: 5,
        metadata: {
          source: 'automation',
          rule_id: rule.id,
          event_id: event.id,
          template: {
            name: tpl.name,
            language: tpl.language || 'pt_BR',
            components: tpl.components,
            variables: vars,
          },
        },
      });

      if (queueErr) {
        await supabase.from('automation_logs').insert({
          rule_id: rule.id, event_id: event.id, status: 'failed',
          result: { reason: 'send_queue_insert_failed', error: queueErr.message },
        });
        continue;
      }

      // Cooldown bookkeeping (upsert)
      await supabase.from('contact_cooldowns').upsert(
        { contact_phone: phone, rule_id: rule.id, last_sent_at: new Date().toISOString() },
        { onConflict: 'contact_phone,rule_id' }
      );

      await supabase.from('automation_logs').insert({
        rule_id: rule.id, event_id: event.id, status: 'success',
        result: { phone, template: tpl.name, conversation_id: conversation.id },
      });

      console.log(`[runner] queued template "${tpl.name}" for ${phone} (rule=${rule.id})`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      console.error(`[runner] rule ${rule.id} failed:`, msg);
      await supabase.from('automation_logs').insert({
        rule_id: rule.id, event_id: event.id, status: 'failed',
        result: { reason: 'exception', error: msg },
      });
    }
  }

  await supabase.from('webhook_events').update({ processed: true }).eq('id', event.id);
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
      if (data && !data.processed) events = [data];
    } else {
      const { data, error } = await supabase
        .from('webhook_events').select('*')
        .eq('processed', false)
        .order('received_at', { ascending: true })
        .limit(50);
      if (error) throw error;
      events = data || [];
    }

    console.log(`[runner] processing ${events.length} event(s)`);
    for (const ev of events) {
      try { await processEvent(supabase, ev); }
      catch (e) {
        const msg = e instanceof Error ? e.message : 'unknown';
        console.error(`[runner] event ${ev.id} failed:`, msg);
        await supabase.from('webhook_events').update({ error: msg }).eq('id', ev.id);
      }
    }

    // Trigger whatsapp-sender so queued messages go out promptly
    if (events.length > 0) {
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
