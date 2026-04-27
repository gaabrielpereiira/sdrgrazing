# Fix: "Failed to subscribe to the message_echoes webhook field"

## Root cause

When you subscribe to a webhook field (like `message_echoes`) in Meta for Developers, Meta sends a verification request (GET) and a test POST to your callback URL. Both requests come **without any Authorization header** — Meta has no way to send a Supabase JWT.

The `whatsapp-webhook` Edge Function currently requires a JWT (the default). So Meta's request is rejected with **401 Unauthorized by the Supabase gateway before your code runs**, and Meta reports it as "Failed to subscribe to the message_echoes webhook field".

This is the known post-remix limitation: `verify_jwt = false` settings are **not preserved when a project is remixed** (memory `backend/verify-jwt-remix-limitation`). Your verification logic itself is correct — I tested it and it returns the challenge as expected.

## Fix

Update `supabase/config.toml` to explicitly disable JWT verification for every Edge Function that is called by an external service or by another function without a user session. After redeploy, Meta's verification request will reach the function and the subscription will succeed.

Functions that must be public:

- `whatsapp-webhook` (called by Meta — this is your immediate blocker)
- `message-grouper`, `nina-orchestrator`, `whatsapp-sender` (called by other functions / cron)
- `simulate-webhook`, `simulate-audio-webhook`, `trigger-nina-orchestrator`, `trigger-whatsapp-sender` (test/trigger utilities)
- `health-check` (used by status card before login in some flows)

Functions that stay protected (require login): `test-whatsapp-message`, `test-elevenlabs-tts`, `generate-prompt`, `analyze-conversation`, `validate-setup`, `initialize-system`, `seed-appointments`.

## Changes

**`supabase/config.toml`** — append a `verify_jwt = false` block per public function:

```toml
project_id = "ggwqkyftxhgahqyevsac"

[functions.whatsapp-webhook]
verify_jwt = false

[functions.message-grouper]
verify_jwt = false

[functions.nina-orchestrator]
verify_jwt = false

[functions.whatsapp-sender]
verify_jwt = false

[functions.simulate-webhook]
verify_jwt = false

[functions.simulate-audio-webhook]
verify_jwt = false

[functions.trigger-nina-orchestrator]
verify_jwt = false

[functions.trigger-whatsapp-sender]
verify_jwt = false

[functions.health-check]
verify_jwt = false
```

Lovable Cloud will redeploy the functions automatically.

## After the fix — what to do in Meta

1. Go to **Meta for Developers → your app → WhatsApp → Configuration**.
2. Webhook callback URL: `https://ggwqkyftxhgahqyevsac.supabase.co/functions/v1/whatsapp-webhook`
3. Verify token: `viver-ia-4olnkKFd0HKKzRKT` (already saved in your settings).
4. Click **Verify and save** — should succeed.
5. In **Webhook fields**, click **Subscribe** next to `messages` and `message_echoes`. Both will now work.

## Verification

After redeploy I'll re-run a no-auth GET against the webhook to confirm Meta's exact request flow (no Authorization header) returns the challenge with HTTP 200.
