// Edge function: download-whatsapp-media
// Baixa uma mídia da WhatsApp Cloud API e republica no bucket whatsapp-media,
// atualizando messages.media_url. Não requer JWT (chamado pelo webhook).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "whatsapp-media";

function extFromMime(mime: string): string {
  if (!mime) return "bin";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("pdf")) return "pdf";
  const guess = mime.split("/")[1];
  return guess?.split(";")[0] || "bin";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { message_id, media_id } = await req.json();

    if (!message_id || !media_id) {
      return new Response(
        JSON.stringify({ error: "message_id and media_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1. Get WhatsApp access token from nina_settings
    const { data: settings, error: settingsErr } = await supabase
      .from("nina_settings")
      .select("whatsapp_access_token")
      .limit(1)
      .maybeSingle();

    if (settingsErr || !settings?.whatsapp_access_token) {
      console.error("[download-whatsapp-media] Missing WhatsApp token", settingsErr);
      return new Response(
        JSON.stringify({ error: "WhatsApp access token not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = settings.whatsapp_access_token;

    // 2. Get media URL from Graph API
    const metaRes = await fetch(`https://graph.facebook.com/v20.0/${media_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!metaRes.ok) {
      const text = await metaRes.text();
      console.error("[download-whatsapp-media] Graph API metadata error:", metaRes.status, text);
      return new Response(
        JSON.stringify({ error: "Failed to fetch media metadata", detail: text }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const meta = await metaRes.json();
    const mediaUrl: string = meta.url;
    const mimeType: string = meta.mime_type || "application/octet-stream";

    if (!mediaUrl) {
      return new Response(
        JSON.stringify({ error: "Media URL not returned by Graph API" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Download binary
    const binRes = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!binRes.ok) {
      const text = await binRes.text();
      console.error("[download-whatsapp-media] Binary download error:", binRes.status, text);
      return new Response(
        JSON.stringify({ error: "Failed to download media binary" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const buffer = await binRes.arrayBuffer();
    const ext = extFromMime(mimeType);
    const path = `${message_id}.${ext}`;

    // 4. Upload to storage
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadErr) {
      console.error("[download-whatsapp-media] Upload error:", uploadErr);
      return new Response(
        JSON.stringify({ error: "Failed to upload to storage", detail: uploadErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Get public URL
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    // 6. Update messages.media_url
    const { error: updErr } = await supabase
      .from("messages")
      .update({ media_url: publicUrl, media_type: mimeType })
      .eq("id", message_id);

    if (updErr) {
      console.error("[download-whatsapp-media] Message update error:", updErr);
      return new Response(
        JSON.stringify({ error: "Failed to update message", detail: updErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[download-whatsapp-media] ✅ Stored", path, "->", publicUrl);

    return new Response(
      JSON.stringify({ success: true, media_url: publicUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[download-whatsapp-media] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
