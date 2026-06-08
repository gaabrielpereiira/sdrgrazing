import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const memberId = typeof body?.memberId === 'string' ? body.memberId : null;
    if (!memberId) {
      return new Response(JSON.stringify({ error: 'memberId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Fetch team_member to get user_id
    const { data: member, error: fetchErr } = await admin
      .from('team_members')
      .select('id, user_id, email')
      .eq('id', memberId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!member) {
      return new Response(JSON.stringify({ error: 'Member not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId: string | null = member.user_id ?? null;

    // ── 1. Nullify FK references to this team_member ──────────────────────
    // deals.owner_id and deal_activities.created_by both reference
    // team_members(id) without ON DELETE CASCADE/SET NULL, so we must
    // clear them before deleting the row to avoid FK violation errors.
    const { error: dealsErr } = await admin
      .from('deals')
      .update({ owner_id: null })
      .eq('owner_id', memberId);
    if (dealsErr) console.warn('[delete-user] deals SET NULL warning:', dealsErr.message);

    const { error: activitiesErr } = await admin
      .from('deal_activities')
      .update({ created_by: null })
      .eq('created_by', memberId);
    if (activitiesErr) console.warn('[delete-user] deal_activities SET NULL warning:', activitiesErr.message);

    // ── 2. Delete auth user and dependent rows (if linked) ────────────────
    if (userId) {
      await admin.from('user_roles').delete().eq('user_id', userId);
      await admin.from('profiles').delete().eq('user_id', userId);

      const { error: authErr } = await admin.auth.admin.deleteUser(userId);
      if (authErr && !/not found/i.test(authErr.message)) {
        console.error('[delete-user] auth.admin.deleteUser error:', authErr);
        throw authErr;
      }
    }

    // ── 3. Delete the team_member row ─────────────────────────────────────
    const { error: delErr } = await admin
      .from('team_members')
      .delete()
      .eq('id', memberId);
    if (delErr) throw delErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[delete-user] error:', err);
    return new Response(
      JSON.stringify({ error: err?.message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
