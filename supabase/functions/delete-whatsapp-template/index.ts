import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getMetaCreds(serviceClient: any) {
  let { data } = await serviceClient
    .from("nina_settings")
    .select("whatsapp_access_token, whatsapp_business_account_id")
    .is("user_id", null)
    .maybeSingle();
  if (!data) {
    const fb = await serviceClient
      .from("nina_settings")
      .select("whatsapp_access_token, whatsapp_business_account_id")
      .limit(1)
      .maybeSingle();
    data = fb.data;
  }
  if (!data?.whatsapp_access_token) throw new Error("WhatsApp access token não configurado.");
  if (!data?.whatsapp_business_account_id) throw new Error("WABA ID não configurado.");
  return {
    accessToken: data.whatsapp_access_token as string,
    wabaId: data.whatsapp_business_account_id as string,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, serviceKey);

    const { id, name, metaTemplateId } = await req.json();
    if (!id) {
      return new Response(JSON.stringify({ error: "id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Busca template local para pegar meta_template_id e nome
    const { data: local } = await serviceClient
      .from("whatsapp_templates")
      .select("id, name, meta_template_id")
      .eq("id", id)
      .maybeSingle();

    const finalName = name || local?.name;
    const finalMetaId = metaTemplateId || local?.meta_template_id;

    // Tenta deletar na Meta (só se já foi submetido)
    if (finalMetaId || finalName) {
      try {
        const creds = await getMetaCreds(serviceClient);
        const params = new URLSearchParams();
        if (finalName) params.set("name", finalName);
        if (finalMetaId) params.set("hsm_id", finalMetaId);
        const url = `https://graph.facebook.com/v22.0/${creds.wabaId}/message_templates?${params.toString()}`;
        const res = await fetch(url, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${creds.accessToken}` },
        });
        const result = await res.json();
        if (!res.ok) {
          console.warn("Meta delete warning:", JSON.stringify(result));
          // continua mesmo assim — exclui localmente
        }
      } catch (e) {
        console.warn("Meta delete skipped:", (e as Error).message);
      }
    }

    const { error } = await serviceClient.from("whatsapp_templates").delete().eq("id", id);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("delete-whatsapp-template error:", err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
