import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getMetaCreds(serviceClient: any) {
  let { data } = await serviceClient
    .from("nina_settings")
    .select("whatsapp_access_token, whatsapp_phone_number_id, whatsapp_business_account_id")
    .is("user_id", null)
    .maybeSingle();
  if (!data) {
    const fb = await serviceClient
      .from("nina_settings")
      .select("whatsapp_access_token, whatsapp_phone_number_id, whatsapp_business_account_id")
      .limit(1)
      .maybeSingle();
    data = fb.data;
  }
  if (!data?.whatsapp_access_token) throw new Error("WhatsApp access token não configurado.");
  if (!data?.whatsapp_business_account_id) throw new Error("WABA ID não configurado em Configurações > APIs.");
  return {
    accessToken: data.whatsapp_access_token as string,
    wabaId: data.whatsapp_business_account_id as string,
  };
}

function extractVarNumbers(text: string): number[] {
  const matches = [...(text || "").matchAll(/\{\{(\d+)\}\}/g)];
  return matches.map((m) => parseInt(m[1])).sort((a, b) => a - b);
}

function buildMetaComponents(templateData: any) {
  const samples = templateData.samples || {};
  const out: any[] = [];

  for (const comp of templateData.components || []) {
    if (comp.type === "HEADER") {
      const headerComp: any = { type: "HEADER", format: comp.format || "TEXT" };
      if (comp.format === "TEXT" && comp.text) {
        headerComp.text = comp.text;
        const headerVars = extractVarNumbers(comp.text);
        if (headerVars.length > 0) {
          headerComp.example = {
            header_text: headerVars.map((n) => samples[`header_${n}`] || `exemplo_${n}`),
          };
        }
        out.push(headerComp);
      }
      // mídia ainda não suportada nesta fase
    } else if (comp.type === "BODY") {
      const bodyComp: any = { type: "BODY", text: comp.text };
      const vars = extractVarNumbers(comp.text || "");
      if (vars.length > 0) {
        bodyComp.example = {
          body_text: [vars.map((n) => samples[`body_${n}`] || `exemplo_${n}`)],
        };
      }
      out.push(bodyComp);
    } else if (comp.type === "FOOTER" && comp.text) {
      out.push({ type: "FOOTER", text: comp.text });
    } else if (comp.type === "BUTTONS" && Array.isArray(comp.buttons) && comp.buttons.length > 0) {
      const buttons = comp.buttons.map((btn: any, btnIndex: number) => {
        const sanitizedText = (btn.text || "")
          .replace(/(\r\n|\n|\r)/g, " ")
          .replace(/[*_~`]/g, "")
          .trim();
        const metaBtn: any = { type: btn.type, text: sanitizedText };
        if (btn.type === "URL" && btn.url) {
          let url = String(btn.url).trim().replace(/^http:\/\//i, "https://");
          if (!/^https:\/\//i.test(url)) url = `https://${url}`;
          const urlVars = extractVarNumbers(url);
          if (urlVars.length > 0) {
            url = url.replace(/\{\{\d+\}\}/g, "{{1}}");
            metaBtn.example = [samples[`btn_${btnIndex}_1`] || "https://exemplo.com/valor"];
          }
          metaBtn.url = url;
        }
        if (btn.type === "PHONE_NUMBER") {
          const phone = btn.phone || btn.phoneNumber;
          if (phone) metaBtn.phone_number = phone;
        }
        return metaBtn;
      });
      out.push({ type: "BUTTONS", buttons });
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, serviceKey);

    const creds = await getMetaCreds(serviceClient);
    const { templateData, templateId, isEdit } = await req.json();

    if (!templateData?.name || !templateData?.components) {
      return new Response(JSON.stringify({ error: "templateData inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!/^[a-z0-9_]+$/.test(templateData.name)) {
      return new Response(JSON.stringify({ error: "Nome deve conter apenas letras minúsculas, números e underscores." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const metaComponents = buildMetaComponents(templateData);
    const metaPayload: any = {
      name: templateData.name,
      language: templateData.language || "pt_BR",
      category: templateData.category || "MARKETING",
      components: metaComponents,
    };

    // Buscar meta_template_id se for edição
    let metaTemplateId: string | null = null;
    if (isEdit && templateId) {
      const { data: local } = await serviceClient
        .from("whatsapp_templates")
        .select("meta_template_id")
        .eq("id", templateId)
        .maybeSingle();
      metaTemplateId = local?.meta_template_id || null;
    }

    const url = isEdit && metaTemplateId
      ? `https://graph.facebook.com/v22.0/${metaTemplateId}`
      : `https://graph.facebook.com/v22.0/${creds.wabaId}/message_templates`;

    const editPayload: any = { ...metaPayload };
    if (isEdit && metaTemplateId) delete editPayload.category;

    console.log("[submit-whatsapp-template] Sending to Meta:", JSON.stringify(isEdit ? editPayload : metaPayload));

    const metaRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(isEdit && metaTemplateId ? editPayload : metaPayload),
    });
    const metaResult = await metaRes.json();
    console.log("[submit-whatsapp-template] Meta response:", JSON.stringify(metaResult));

    // Trata duplicado: busca o template existente na Meta e atualiza
    if (!metaRes.ok && metaResult?.error?.error_subcode === 2388024 && !isEdit) {
      const listRes = await fetch(
        `https://graph.facebook.com/v22.0/${creds.wabaId}/message_templates?name=${encodeURIComponent(templateData.name)}&fields=id,name,status`,
        { headers: { Authorization: `Bearer ${creds.accessToken}` } }
      );
      const listData = await listRes.json();
      const existing = listData?.data?.[0];
      if (existing?.id) {
        const upd = { ...metaPayload };
        delete upd.category;
        const retryRes = await fetch(`https://graph.facebook.com/v22.0/${existing.id}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${creds.accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(upd),
        });
        const retryResult = await retryRes.json();
        if (!retryRes.ok) {
          const e = retryResult?.error;
          return new Response(JSON.stringify({ error: e?.error_user_msg || e?.message || "Erro ao atualizar template existente." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const upsertPayload = {
          meta_template_id: existing.id,
          name: templateData.name,
          category: templateData.category,
          language: templateData.language,
          components: templateData.components,
          samples: templateData.samples || null,
          status: retryResult.status || existing.status || "PENDING",
        };

        const { data: existingLocal } = await serviceClient
          .from("whatsapp_templates")
          .select("id")
          .eq("name", templateData.name)
          .eq("language", templateData.language)
          .maybeSingle();

        let saved;
        if (existingLocal) {
          const { data } = await serviceClient
            .from("whatsapp_templates")
            .update(upsertPayload)
            .eq("id", existingLocal.id)
            .select()
            .single();
          saved = data;
        } else {
          const { data } = await serviceClient
            .from("whatsapp_templates")
            .insert(upsertPayload)
            .select()
            .single();
          saved = data;
        }

        return new Response(
          JSON.stringify({ success: true, template: saved, meta_template_id: existing.id, meta_status: retryResult.status }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (!metaRes.ok) {
      const e = metaResult?.error;
      const msg = e?.error_user_msg || e?.message || "Erro desconhecido da API Meta";
      return new Response(JSON.stringify({ error: msg, metaError: e }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const localPayload = {
      meta_template_id: metaResult.id || metaTemplateId,
      name: templateData.name,
      category: templateData.category,
      language: templateData.language,
      components: templateData.components,
      samples: templateData.samples || null,
      status: metaResult.status || "PENDING",
    };

    let saved;
    if (isEdit && templateId) {
      const { data, error } = await serviceClient
        .from("whatsapp_templates")
        .update(localPayload)
        .eq("id", templateId)
        .select()
        .single();
      if (error) console.error("DB update error:", error);
      saved = data;
    } else {
      const { data, error } = await serviceClient
        .from("whatsapp_templates")
        .insert(localPayload)
        .select()
        .single();
      if (error) console.error("DB insert error:", error);
      saved = data;
    }

    return new Response(
      JSON.stringify({ success: true, template: saved, meta_template_id: metaResult.id || metaTemplateId, meta_status: metaResult.status }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("submit-whatsapp-template error:", err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
