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
    const { memberId, redirectTo } = body;

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

    // Fetch team member details
    const { data: member, error: fetchErr } = await admin
      .from('team_members')
      .select('id, name, email, role, user_id')
      .eq('id', memberId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!member) {
      return new Response(JSON.stringify({ error: 'Member not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If already linked to an auth user, skip
    if (member.user_id) {
      console.log(`[invite-user] Member ${memberId} already linked to user ${member.user_id}`);
      return new Response(JSON.stringify({ ok: true, alreadyLinked: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const finalRedirectTo = redirectTo || `${Deno.env.get('SUPABASE_URL')!.replace('https://ggwqkyftxhgahqyevsac.supabase.co', 'https://ggwqkyftxhgahqyevsac.supabase.co')}/auth`;

    console.log(`[invite-user] Inviting ${member.email} with redirect ${finalRedirectTo}`);

    // Send invitation email via Supabase Auth
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
      member.email,
      {
        redirectTo: finalRedirectTo,
        data: {
          full_name: member.name,
        },
      }
    );

    if (inviteErr) {
      // User already has an account — just link them to the team_member
      if (
        inviteErr.message.toLowerCase().includes('already been registered') ||
        inviteErr.message.toLowerCase().includes('already registered') ||
        inviteErr.message.toLowerCase().includes('user already exists')
      ) {
        console.log(`[invite-user] User ${member.email} already exists, linking...`);

        // Find user by email in auth.users
        const { data: listData, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
        if (!listErr && listData?.users) {
          const existing = listData.users.find(
            (u) => u.email?.toLowerCase() === member.email.toLowerCase()
          );
          if (existing) {
            await admin
              .from('team_members')
              .update({ user_id: existing.id, status: 'active' })
              .eq('id', memberId);
            return new Response(
              JSON.stringify({ ok: true, alreadyExists: true, userId: existing.id }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
        // Could not find user — surface the original error
        throw inviteErr;
      }
      throw inviteErr;
    }

    // Link the newly created auth user to the team_member record
    if (inviteData?.user?.id) {
      await admin
        .from('team_members')
        .update({ user_id: inviteData.user.id })
        .eq('id', memberId);
      console.log(`[invite-user] Linked user ${inviteData.user.id} to member ${memberId}`);
    }

    return new Response(
      JSON.stringify({ ok: true, userId: inviteData?.user?.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('[invite-user] error:', err);
    return new Response(
      JSON.stringify({ error: err?.message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
