import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WHATSAPP_API_URL = "https://graph.facebook.com/v18.0";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[Sender] Starting send process...');

    const MAX_EXECUTION_TIME = 25000; // 25 seconds
    const startTime = Date.now();
    let totalSent = 0;
    let iterations = 0;

    console.log('[Sender] Starting polling loop');

    // Cache de settings por user_id para evitar múltiplas queries
    const settingsCache: Record<string, any> = {};

    while (Date.now() - startTime < MAX_EXECUTION_TIME) {
      iterations++;
      console.log(`[Sender] Iteration ${iterations}, elapsed: ${Date.now() - startTime}ms`);

      // Claim batch of messages to send
      const { data: queueItems, error: claimError } = await supabase
        .rpc('claim_send_queue_batch', { p_limit: 10 });

      if (claimError) {
        console.error('[Sender] Error claiming batch:', claimError);
        throw claimError;
      }

      if (!queueItems || queueItems.length === 0) {
        console.log('[Sender] No messages ready to send, checking for scheduled messages...');
        
        // Check for messages scheduled in the next 5 seconds
        const { data: upcoming, error: upcomingError } = await supabase
          .from('send_queue')
          .select('id, scheduled_at')
          .eq('status', 'pending')
          .gte('scheduled_at', new Date().toISOString())
          .lte('scheduled_at', new Date(Date.now() + 5000).toISOString())
          .order('scheduled_at', { ascending: true })
          .limit(1);

        if (upcomingError) {
          console.error('[Sender] Error checking upcoming messages:', upcomingError);
        }

        if (upcoming && upcoming.length > 0) {
          const scheduledAt = new Date(upcoming[0].scheduled_at).getTime();
          const now = Date.now();
          const waitTime = Math.min(
            Math.max(scheduledAt - now + 100, 0),
            5000
          );
          
          if (waitTime > 0 && (Date.now() - startTime + waitTime) < MAX_EXECUTION_TIME) {
            console.log(`[Sender] Waiting ${waitTime}ms for scheduled message at ${upcoming[0].scheduled_at}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }
        
        // No more messages to process
        console.log('[Sender] No more messages to process, exiting loop');
        break;
      }

      console.log(`[Sender] Processing batch of ${queueItems.length} messages`);

      for (const item of queueItems) {
        try {
          // Buscar user_id da conversation para multi-tenancy
          const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .select('user_id')
            .eq('id', item.conversation_id)
            .single();

          if (convError || !conversation) {
            console.error(`[Sender] Error fetching conversation ${item.conversation_id}:`, convError);
            throw new Error('Conversation not found');
          }

          const userId = conversation.user_id;
          
          // Buscar settings do cache ou do banco com fallback triplo
          const cacheKey = userId || 'global';
          let settings = settingsCache[cacheKey];
          if (!settings) {
            let settingsData = null;

            // 1. Tentar por user_id da conversa
            if (userId) {
              const { data } = await supabase
                .from('nina_settings')
                .select('whatsapp_access_token, whatsapp_phone_number_id')
                .eq('user_id', userId)
                .maybeSingle();
              settingsData = data;
            }

            // 2. Fallback: buscar global (user_id IS NULL)
            if (!settingsData) {
              console.log('[Sender] No user-specific settings, trying global...');
              const { data } = await supabase
                .from('nina_settings')
                .select('whatsapp_access_token, whatsapp_phone_number_id')
                .is('user_id', null)
                .maybeSingle();
              settingsData = data;
            }

            // 3. Último fallback: qualquer settings com WhatsApp configurado
            if (!settingsData) {
              console.log('[Sender] No global settings, fetching any with WhatsApp...');
              const { data } = await supabase
                .from('nina_settings')
                .select('whatsapp_access_token, whatsapp_phone_number_id')
                .not('whatsapp_phone_number_id', 'is', null)
                .limit(1)
                .maybeSingle();
              settingsData = data;
            }

            if (!settingsData) {
              console.error('[Sender] No settings found with any fallback');
              throw new Error('Settings not found');
            }

            if (!settingsData.whatsapp_access_token || !settingsData.whatsapp_phone_number_id) {
              console.error('[Sender] WhatsApp not configured in settings');
              throw new Error('WhatsApp not configured');
            }

            settings = settingsData;
            settingsCache[cacheKey] = settings;
          }

          await sendMessage(supabase, settings, item);
          
          // Mark as completed
          await supabase
            .from('send_queue')
            .update({ 
              status: 'completed', 
              sent_at: new Date().toISOString() 
            })
            .eq('id', item.id);
          
          totalSent++;
          console.log(`[Sender] Successfully sent message ${item.id} (${totalSent} total)`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[Sender] Error sending item ${item.id}:`, error);
          
          // Mark queue row as failed (or pending for retry)
          const newRetryCount = (item.retry_count || 0) + 1;
          const shouldRetry = newRetryCount < 3;
          
          await supabase
            .from('send_queue')
            .update({ 
              status: shouldRetry ? 'pending' : 'failed',
              retry_count: newRetryCount,
              error_message: errorMessage,
              scheduled_at: shouldRetry 
                ? new Date(Date.now() + newRetryCount * 60000).toISOString() 
                : null
            })
            .eq('id', item.id);

          // After last retry, also mark the message itself as failed so the UI can alert.
          if (!shouldRetry) {
            try {
              if (item.message_id) {
                // Human message: existing record — flag failed and store the reason.
                const { data: existing } = await supabase
                  .from('messages')
                  .select('metadata')
                  .eq('id', item.message_id)
                  .maybeSingle();
                const mergedMeta = {
                  ...(existing?.metadata || {}),
                  ...(item.metadata || {}),
                  error_message: errorMessage,
                  failed_at: new Date().toISOString(),
                };
                await supabase
                  .from('messages')
                  .update({ status: 'failed', metadata: mergedMeta })
                  .eq('id', item.message_id);
              } else {
                // Nina/system message with no record yet — create one in failed state.
                await supabase
                  .from('messages')
                  .insert({
                    conversation_id: item.conversation_id,
                    content: item.content,
                    type: item.message_type,
                    from_type: item.from_type,
                    status: 'failed',
                    media_url: item.media_url || null,
                    sent_at: new Date().toISOString(),
                    metadata: {
                      ...(item.metadata || {}),
                      error_message: errorMessage,
                      failed_at: new Date().toISOString(),
                    },
                  });
              }
            } catch (persistErr) {
              console.error('[Sender] Failed to persist failed message state:', persistErr);
            }
          }
        }
      }
    }

    const executionTime = Date.now() - startTime;
    console.log(`[Sender] Completed: sent ${totalSent} messages in ${iterations} iterations (${executionTime}ms)`);

    return new Response(JSON.stringify({ 
      sent: totalSent, 
      iterations,
      executionTime 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Sender] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function resolveHumanSenderName(
  supabase: any,
  conversationId: string,
  metadata: any
): Promise<string | null> {
  try {
    // 1. Try assigned_user_id from conversation
    const { data: conv } = await supabase
      .from('conversations')
      .select('assigned_user_id')
      .eq('id', conversationId)
      .maybeSingle();

    const candidateIds: string[] = [];
    if (conv?.assigned_user_id) candidateIds.push(conv.assigned_user_id);
    const senderId = metadata?.sender_user_id;
    if (senderId && !candidateIds.includes(senderId)) candidateIds.push(senderId);

    for (const id of candidateIds) {
      // The id may be either a team_members.id (legacy) or an auth.users.id.
      // Try team_members.id first
      const { data: tmById } = await supabase
        .from('team_members')
        .select('name')
        .eq('id', id)
        .maybeSingle();
      if (tmById?.name) return tmById.name;

      // Then team_members.user_id (auth user id linked)
      const { data: tmByUser } = await supabase
        .from('team_members')
        .select('name')
        .eq('user_id', id)
        .maybeSingle();
      if (tmByUser?.name) return tmByUser.name;

      // Then profiles.full_name (auth user id)
      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', id)
        .maybeSingle();
      if (prof?.full_name) return prof.full_name;
    }

    // Fallback: nina_settings.sdr_name (any)
    const { data: ninaSettings } = await supabase
      .from('nina_settings')
      .select('sdr_name')
      .not('sdr_name', 'is', null)
      .limit(1)
      .maybeSingle();
    if (ninaSettings?.sdr_name) return ninaSettings.sdr_name;
  } catch (e) {
    console.warn('[Sender] resolveHumanSenderName failed:', e);
  }
  return null;
}

function sanitizeName(name: string): string {
  return name.replace(/[\r\n]+/g, ' ').trim().slice(0, 40);
}

async function sendMessage(supabase: any, settings: any, queueItem: any) {
  console.log(`[Sender] Sending message: ${queueItem.id}`);

  // Get contact phone number
  const { data: contact } = await supabase
    .from('contacts')
    .select('phone_number, whatsapp_id')
    .eq('id', queueItem.contact_id)
    .maybeSingle();

  if (!contact) {
    throw new Error('Contact not found');
  }

  const recipient = contact.whatsapp_id || contact.phone_number;

  // For human-sent messages, resolve attendant name and prefix the outgoing
  // text/caption so the client sees who is attending — even with no assignee.
  // The DB-stored content remains untouched (no duplicate name in internal UI).
  // Templates are NOT prefixed (Meta requires the exact approved content).
  const isTemplate = !!queueItem.metadata?.template;
  let outgoingText: string = queueItem.content || '';
  if (queueItem.from_type === 'human' && !isTemplate) {
    const rawName = await resolveHumanSenderName(
      supabase,
      queueItem.conversation_id,
      queueItem.metadata
    );
    if (rawName) {
      const name = sanitizeName(rawName);
      if (outgoingText && outgoingText.trim().length > 0) {
        outgoingText = `*${name}*:\n${outgoingText}`;
      } else {
        outgoingText = `*${name}*`;
      }
      console.log(`[Sender] Prefixed human message with attendant: ${name}`);
    }
  }

  // Build WhatsApp API payload
  let payload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient
  };

  if (isTemplate) {
    const tpl = queueItem.metadata.template;
    payload.type = 'template';
    payload.template = buildTemplatePayload(tpl);
  } else {
    switch (queueItem.message_type) {
      case 'text':
        payload.type = 'text';
        payload.text = { body: outgoingText };
        break;

      case 'image':
        payload.type = 'image';
        payload.image = {
          link: queueItem.media_url,
          caption: outgoingText || undefined
        };
        break;

      case 'audio':
        payload.type = 'audio';
        payload.audio = { link: queueItem.media_url };
        break;

      case 'document':
        payload.type = 'document';
        payload.document = {
          link: queueItem.media_url,
          filename: queueItem.content || 'document'
        };
        break;

      default:
        payload.type = 'text';
        payload.text = { body: outgoingText };
    }
  }

  console.log('[Sender] WhatsApp API payload:', JSON.stringify(payload, null, 2));

  // Send via WhatsApp Cloud API
  const response = await fetch(
    `${WHATSAPP_API_URL}/${settings.whatsapp_phone_number_id}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.whatsapp_access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );

  const responseData = await response.json();

  if (!response.ok) {
    console.error('[Sender] WhatsApp API error:', JSON.stringify(responseData));
    const err = responseData.error || {};
    const details = err.error_data?.details || '';
    const parts = [
      err.code ? `[${err.code}]` : '',
      err.title || err.message || 'WhatsApp API error',
      details ? `— ${details}` : '',
    ].filter(Boolean).join(' ');
    // Persist full error payload on the message metadata immediately so the UI can show it,
    // even before retry exhaustion.
    if (queueItem.message_id) {
      try {
        const { data: existing } = await supabase
          .from('messages')
          .select('metadata')
          .eq('id', queueItem.message_id)
          .maybeSingle();
        await supabase
          .from('messages')
          .update({
            metadata: {
              ...(existing?.metadata || {}),
              whatsapp_error: { http_status: response.status, ...err },
            },
          })
          .eq('id', queueItem.message_id);
      } catch (persistErr) {
        console.error('[Sender] Could not persist whatsapp_error:', persistErr);
      }
    }
    throw new Error(parts);
  }

  const whatsappMessageId = responseData.messages?.[0]?.id;
  const waMessageStatus = responseData.messages?.[0]?.message_status; // e.g. "accepted"
  console.log('[Sender] Message sent, WA ID:', whatsappMessageId, 'status:', waMessageStatus);

  // Update or create message record in database
  if (queueItem.message_id) {
    // UPDATE existing message (for human messages)
    console.log('[Sender] Updating existing message:', queueItem.message_id);
    const { data: existing } = await supabase
      .from('messages')
      .select('metadata')
      .eq('id', queueItem.message_id)
      .maybeSingle();
    const { error: msgError } = await supabase
      .from('messages')
      .update({
        whatsapp_message_id: whatsappMessageId,
        status: 'sent',
        sent_at: new Date().toISOString(),
        metadata: {
          ...(existing?.metadata || {}),
          whatsapp_response: {
            http_status: response.status,
            wamid: whatsappMessageId,
            message_status: waMessageStatus || null,
            contacts: responseData.contacts || null,
          },
        },
      })
      .eq('id', queueItem.message_id);

    if (msgError) {
      console.error('[Sender] Error updating message record:', msgError);
      // Don't throw - message was sent successfully
    }
  } else {
    // INSERT new message (for Nina messages)
    console.log('[Sender] Creating new message record');
    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: queueItem.conversation_id,
        whatsapp_message_id: whatsappMessageId,
        content: queueItem.content,
        type: queueItem.message_type,
        from_type: queueItem.from_type,
        status: 'sent',
        media_url: queueItem.media_url || null,
        sent_at: new Date().toISOString(),
        metadata: queueItem.metadata || {}
      });

    if (msgError) {
      console.error('[Sender] Error creating message record:', msgError);
      // Don't throw - message was sent successfully
    }
  }

  // Update conversation last_message_at
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', queueItem.conversation_id);
}

function extractVarNumbers(text: string): number[] {
  const matches = [...(text || '').matchAll(/\{\{(\d+)\}\}/g)];
  return [...new Set(matches.map((m) => parseInt(m[1])))].sort((a, b) => a - b);
}

function buildTemplatePayload(tpl: any): any {
  const language = tpl.language || 'pt_BR';
  const components: any[] = [];
  const vars: Record<string, string> = tpl.variables || {};

  const headerComp = (tpl.components || []).find(
    (c: any) => (c.type || '').toUpperCase() === 'HEADER'
  );
  const bodyComp = (tpl.components || []).find(
    (c: any) => (c.type || '').toUpperCase() === 'BODY'
  );
  const buttonsComp = (tpl.components || []).find(
    (c: any) => (c.type || '').toUpperCase() === 'BUTTONS'
  );

  const warnMissing = (loc: string, n: number) => {
    if (vars[String(n)] === undefined || vars[String(n)] === '') {
      console.warn(`[Sender] Template "${tpl.name}" missing variable {{${n}}} in ${loc}`);
    }
  };

  if (headerComp && (headerComp.format || 'TEXT').toUpperCase() === 'TEXT' && headerComp.text) {
    const headerVars = extractVarNumbers(headerComp.text);
    if (headerVars.length > 0) {
      headerVars.forEach((n) => warnMissing('header', n));
      components.push({
        type: 'header',
        parameters: headerVars.map((n) => ({
          type: 'text',
          text: vars[String(n)] ?? '',
        })),
      });
    }
  }

  if (bodyComp?.text) {
    const bodyVars = extractVarNumbers(bodyComp.text);
    if (bodyVars.length > 0) {
      bodyVars.forEach((n) => warnMissing('body', n));
      components.push({
        type: 'body',
        parameters: bodyVars.map((n) => ({
          type: 'text',
          text: vars[String(n)] ?? '',
        })),
      });
    }
  }

  // BUTTONS: add a "button" component only for dynamic URL buttons (those with {{n}} in url).
  // Static URL/QUICK_REPLY/PHONE buttons require no payload.
  if (buttonsComp && Array.isArray(buttonsComp.buttons)) {
    buttonsComp.buttons.forEach((btn: any, index: number) => {
      const subType = (btn.type || '').toUpperCase();
      if (subType === 'URL' && typeof btn.url === 'string') {
        const urlVars = extractVarNumbers(btn.url);
        if (urlVars.length > 0) {
          urlVars.forEach((n) => warnMissing(`button[${index}].url`, n));
          components.push({
            type: 'button',
            sub_type: 'url',
            index: String(index),
            parameters: urlVars.map((n) => ({
              type: 'text',
              text: vars[String(n)] ?? '',
            })),
          });
        }
      }
    });
  }

  const payload: any = {
    name: tpl.name,
    language: { code: language },
  };
  if (components.length > 0) payload.components = components;
  return payload;
}

