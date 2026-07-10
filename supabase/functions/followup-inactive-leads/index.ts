// Scans conversations where the last message came from Nina and the lead
// went silent for >= welcome_followup_minutes. Sends one automatic
// follow-up per conversation (idempotent via metadata.welcome_followup_sent).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BATCH = 25;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const startedAt = Date.now();

  try {
    const { data: settings } = await supabase
      .from('nina_settings')
      .select('welcome_followup_enabled, welcome_followup_minutes, welcome_followup_message')
      .maybeSingle();

    if (!settings?.welcome_followup_enabled) {
      return json({ ok: true, skipped: 'disabled' });
    }
    const minutes = Math.max(5, Number(settings.welcome_followup_minutes ?? 60));
    const message = String(settings.welcome_followup_message ?? '').trim();
    if (!message) return json({ ok: true, skipped: 'no_message' });

    const upper = new Date(Date.now() - minutes * 60_000).toISOString();
    const lower = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

    // Candidates: still with Nina, sales queue, active, no follow-up yet, last activity within window
    const { data: candidates, error } = await supabase
      .from('conversations')
      .select('id, contact_id, last_message_at, metadata')
      .eq('status', 'nina')
      .eq('queue', 'sales')
      .eq('is_active', true)
      .gte('last_message_at', lower)
      .lte('last_message_at', upper)
      .limit(BATCH);

    if (error) throw error;

    let sent = 0;
    let skipped = 0;
    for (const conv of candidates || []) {
      const meta = (conv.metadata || {}) as Record<string, any>;
      if (meta.welcome_followup_sent === true) { skipped++; continue; }

      // Confirm the last message was NOT from the user
      const { data: lastMsg } = await supabase
        .from('messages')
        .select('from_type')
        .eq('conversation_id', conv.id)
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lastMsg || lastMsg.from_type === 'user') { skipped++; continue; }

      // Mark first (optimistic idempotency); if update affected 0 rows, skip
      const { data: claimed } = await supabase
        .from('conversations')
        .update({
          metadata: {
            ...meta,
            welcome_followup_sent: true,
            welcome_followup_at: new Date().toISOString(),
          },
        })
        .eq('id', conv.id)
        .is('metadata->>welcome_followup_sent', null)
        .select('id')
        .maybeSingle();

      // Fallback claim (some rows may already have the key set to false etc.)
      const claimedId = claimed?.id ?? (await supabase
        .from('conversations')
        .update({
          metadata: { ...meta, welcome_followup_sent: true, welcome_followup_at: new Date().toISOString() },
        })
        .eq('id', conv.id)
        .select('id')
        .maybeSingle()).data?.id;

      if (!claimedId) { skipped++; continue; }

      await supabase.from('send_queue').insert({
        conversation_id: conv.id,
        contact_id: conv.contact_id,
        content: message,
        from_type: 'nina',
        message_type: 'text',
        priority: 2,
        scheduled_at: new Date(Date.now() + 500).toISOString(),
        metadata: { welcome_followup: true },
      });

      sent++;
    }

    // Trigger sender once
    if (sent > 0) {
      fetch(`${SUPABASE_URL}/functions/v1/whatsapp-sender`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      }).catch((e) => console.warn('[followup] trigger sender failed:', e));
    }

    return json({ ok: true, sent, skipped, took_ms: Date.now() - startedAt });
  } catch (e) {
    console.error('[followup-inactive-leads] error', e);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
