import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wc-webhook-signature, x-wc-webhook-topic, x-wc-webhook-source, x-wc-webhook-event, x-wc-webhook-resource, x-wc-webhook-id, x-wc-webhook-delivery-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function hmacBase64(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const rawBody = await req.text();
    const signature = req.headers.get('x-wc-webhook-signature') || '';
    const topic = req.headers.get('x-wc-webhook-topic') || 'unknown';

    // Fetch secret with triple fallback (user_id → global → any)
    let secretRow: any = null;
    const { data: globalRow } = await supabase
      .from('nina_settings')
      .select('wc_webhook_secret')
      .is('user_id', null)
      .maybeSingle();
    secretRow = globalRow;
    if (!secretRow?.wc_webhook_secret) {
      const { data: anyRow } = await supabase
        .from('nina_settings')
        .select('wc_webhook_secret')
        .not('wc_webhook_secret', 'is', null)
        .limit(1)
        .maybeSingle();
      secretRow = anyRow;
    }

    const secret = secretRow?.wc_webhook_secret;
    if (!secret) {
      console.error('[wc-receiver] No wc_webhook_secret configured');
      return new Response(JSON.stringify({ error: 'Webhook not configured' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const expected = await hmacBase64(secret, rawBody);
    if (!signature || !timingSafeEqual(signature, expected)) {
      console.warn(
        `[wc-receiver] Invalid signature topic=${topic} bodyLen=${rawBody.length} ` +
        `secretLen=${secret.length} got=${signature.slice(0, 12)}... expected=${expected.slice(0, 12)}...`
      );
      return new Response(JSON.stringify({
        error: 'Invalid signature',
        hint: 'O Secret salvo no painel não bate com o Secret do webhook no WooCommerce. Gere um novo, cole nos dois lados (sem espaços), salve em ambos e tente de novo.',
      }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let payload: any = {};
    try { payload = JSON.parse(rawBody); } catch { payload = { raw: rawBody }; }

    const { data: ev, error: insErr } = await supabase
      .from('webhook_events')
      .insert({ topic, payload, source: 'woocommerce', processed: false })
      .select('id')
      .single();

    if (insErr) {
      console.error('[wc-receiver] Insert error:', insErr);
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[wc-receiver] Stored event ${ev.id} topic=${topic}`);

    // Phase 2: fire-and-forget trigger of the automation runner
    fetch(`${supabaseUrl}/functions/v1/automation-runner`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: ev.id }),
    }).catch((e) => console.warn('[wc-receiver] runner trigger failed:', e));

    return new Response(JSON.stringify({ success: true, event_id: ev.id }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[wc-receiver] Error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
