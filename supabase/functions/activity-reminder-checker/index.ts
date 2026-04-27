// Activity reminder checker — runs every 60s checking for due activities and creating notifications.
// Self-schedules using waitUntil pattern (same as message-grouper).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function processDueActivities() {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const nowIso = new Date().toISOString();
  const { data: due, error } = await supabase
    .from('conversation_activities')
    .select('id, conversation_id, contact_id, title, scheduled_at, activity_type')
    .eq('is_completed', false)
    .eq('reminder_sent', false)
    .lte('scheduled_at', nowIso)
    .limit(50);

  if (error) {
    console.error('[activity-reminder] fetch error', error);
    return { processed: 0, error: error.message };
  }

  if (!due || due.length === 0) {
    return { processed: 0 };
  }

  let processed = 0;
  for (const act of due) {
    // Fetch contact name for nicer notification
    let contactName = 'Cliente';
    const { data: contact } = await supabase
      .from('contacts')
      .select('name, call_name, phone_number')
      .eq('id', act.contact_id)
      .maybeSingle();
    if (contact) {
      contactName = contact.name || contact.call_name || contact.phone_number || 'Cliente';
    }

    const typeLabel = act.activity_type === 'call' ? 'Ligar para'
      : act.activity_type === 'message' ? 'Enviar mensagem para'
      : act.activity_type === 'meeting' ? 'Reunião com'
      : 'Atividade com';

    await supabase.from('notifications').insert({
      type: 'activity_reminder',
      title: `⏰ ${typeLabel} ${contactName}`,
      body: act.title,
      conversation_id: act.conversation_id,
      contact_id: act.contact_id,
      metadata: { activity_id: act.id, activity_type: act.activity_type },
    });

    await supabase
      .from('conversation_activities')
      .update({ reminder_sent: true })
      .eq('id', act.id);

    processed += 1;
  }

  console.log(`[activity-reminder] processed ${processed} reminders`);
  return { processed };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const result = await processDueActivities();

    // Self-reschedule in 60s using waitUntil-like pattern
    const ctx = (globalThis as any).EdgeRuntime;
    if (ctx?.waitUntil) {
      ctx.waitUntil(
        new Promise<void>(resolve => {
          setTimeout(async () => {
            try {
              await fetch(`${SUPABASE_URL}/functions/v1/activity-reminder-checker`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${SERVICE_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ trigger: 'self' }),
              });
            } catch (e) {
              console.error('[activity-reminder] self-trigger failed', e);
            }
            resolve();
          }, 60_000);
        })
      );
    }

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[activity-reminder] fatal', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
