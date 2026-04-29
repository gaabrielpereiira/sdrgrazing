import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getMetaCreds(serviceClient: any) {
  // Single-tenant: pega o registro com user_id IS NULL ou o primeiro disponível
  let { data } = await serviceClient
    .from("nina_settings")
    .select("whatsapp_access_token, whatsapp_phone_number_id, whatsapp_business_account_id")
    .is("user_id", null)
    .maybeSingle();

  if (!data) {
    const fallback = await serviceClient
      .from("nina_settings")
      .select("whatsapp_access_token, whatsapp_phone_number_id, whatsapp_business_account_id")
      .limit(1)
      .maybeSingle();
    data = fallback.data;
  }

  if (!data?.whatsapp_access_token) {
    throw new Error("WhatsApp access token não configurado em Configurações > APIs.");
  }
  if (!data?.whatsapp_business_account_id) {
    throw new Error("WhatsApp Business Account ID (WABA ID) não configurado em Configurações > APIs.");
  }

  return {
    accessToken: data.whatsapp_access_token as string,
    wabaId: data.whatsapp_business_account_id as string,
    phoneNumberId: data.whatsapp_phone_number_id as string | null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, serviceKey);

    const creds = await getMetaCreds(serviceClient);

    const fields = "id,name,language,status,category,components,quality_score,rejected_reason";
    const url = `https://graph.facebook.com/v22.0/${creds.wabaId}/message_templates?limit=250&fields=${fields}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    });
    const result = await res.json();

    if (!res.ok) {
      const msg = result?.error?.error_user_msg || result?.error?.message || "Erro ao consultar Meta API";
      return new Response(JSON.stringify({ error: msg, metaError: result?.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const metaTemplates: any[] = result.data || [];
    let imported = 0;
    let updated = 0;

    for (const t of metaTemplates) {
      // Tenta achar por meta_template_id
      const { data: existing } = await serviceClient
        .from("whatsapp_templates")
        .select("id")
        .eq("meta_template_id", t.id)
        .maybeSingle();

      const payload = {
        meta_template_id: t.id,
        name: t.name,
        category: t.category || "MARKETING",
        language: t.language || "pt_BR",
        components: t.components || [],
        status: t.status || "PENDING",
        quality_rating: t.quality_score?.score || null,
        rejected_reason: t.rejected_reason || null,
      };

      if (existing) {
        const { error } = await serviceClient
          .from("whatsapp_templates")
          .update(payload)
          .eq("id", existing.id);
        if (!error) updated++;
        else console.error("Update error:", error);
      } else {
        // Tenta achar por (name, language) — registro local sem meta id
        const { data: byName } = await serviceClient
          .from("whatsapp_templates")
          .select("id")
          .eq("name", t.name)
          .eq("language", t.language)
          .maybeSingle();

        if (byName) {
          const { error } = await serviceClient
            .from("whatsapp_templates")
            .update(payload)
            .eq("id", byName.id);
          if (!error) updated++;
          else console.error("Update by name error:", error);
        } else {
          const { error } = await serviceClient
            .from("whatsapp_templates")
            .insert(payload);
          if (!error) imported++;
          else console.error("Insert error:", error);
        }
      }
    }

    return new Response(
      JSON.stringify({ imported, updated, total: metaTemplates.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("sync-whatsapp-templates error:", err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
