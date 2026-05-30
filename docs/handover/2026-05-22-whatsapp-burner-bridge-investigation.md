# WhatsApp Burner Bridge Investigation

Date: 2026-05-22
Branch: `codex/fad-ai-inbox-truth-20260522`

## Decision

Build this only as an isolated burner-number prototype. Do not touch Friday's main WhatsApp number, Ishant's personal WhatsApp, or any production Guesty/Meta WhatsApp path.

Use Baileys / WhatsApp Web multi-device first. Do not use Puppeteer/whatsapp-web.js unless Baileys is blocked.

## Source Check

- Baileys docs describe QR/pairing-code connection and `useMultiFileAuthState` for local auth state persistence: https://baileys.wiki/docs/socket/connecting/
- Baileys configuration docs say production should implement its own auth state and that Baileys emulates a web browser by default: https://baileys.wiki/docs/socket/configuration/
- WhatsApp Terms prohibit bulk/auto messaging and unauthorized/automated access patterns; the accepted risk here applies only to the disposable burner number: https://www.whatsapp.com/legal/terms-of-service

## Prototype Shape

Create a separate worker process, not a browser hack inside FAD:

```text
burner WhatsApp number
  -> Baileys socket
  -> bridge normalizer
  -> FAD Inbox website/burner conversation event
  -> Judith/FAD draft generator
  -> auto-send through Baileys if kill switch + allowlist + rate limits pass
  -> bridge audit log
```

Recommended package boundary:

- `backend/src/whatsapp_burner/`
- `backend/src/whatsapp_burner/bridge.js`
- `backend/src/whatsapp_burner/normalizer.js`
- `backend/src/whatsapp_burner/safety.js`
- `backend/src/whatsapp_burner/store.js`
- `backend/src/whatsapp_burner/README.md`

Keep the runtime out of the normal API server until proven. A long-lived socket worker should be started explicitly, for example `npm run whatsapp:burner`, with env flags.

## Required Environment

- `FAD_WHATSAPP_BURNER_ENABLED=false` by default.
- `FAD_WHATSAPP_BURNER_SEND_ENABLED=false` global outbound kill switch by default.
- `FAD_WHATSAPP_BURNER_ALLOWLIST=2305...,2307...` required for first tests.
- `FAD_WHATSAPP_BURNER_AUTH_DIR=/absolute/path/outside/repo` required. Never commit auth/session files.
- `FAD_WHATSAPP_BURNER_RATE_PER_CHAT_PER_HOUR=10`.
- `FAD_WHATSAPP_BURNER_RATE_GLOBAL_PER_MINUTE=3`.
- `FAD_WHATSAPP_BURNER_GROUPS_ENABLED=false` by default.
- `FAD_WHATSAPP_BURNER_GROUP_TRIGGERS=Judith,@Judith,friday`.

## Inbox Contract

Do not fake a Guesty conversation.

Preferred storage options:

1. Add a dedicated `whatsapp.burner_message` event type to `inbox_threads` / `inbox_events`, following the website-inbox event pattern.
2. For a faster MVP, map the normalized message into a website-inbox-like thread with:
   - `guest_email = whatsapp-burner+<chat-id-hash>@friday.mu`
   - `guest_phone = wa jid / sender phone if available`
   - `last_event_type = whatsapp.burner_message`
   - event payload fields: `provider: baileys`, `providerMessageId`, `chatId`, `fromMe`, `body`, `messageType`, `rawProviderId`

Keep backend send truth separate from Guesty send truth. The bridge send log must record provider delivery attempts and not mark Guesty drafts sent.

## Safety Gate

Outbound send requires all gates:

- global enabled flag true,
- chat allowlisted,
- message is 1:1, or group support enabled and message mentions Judith / quotes Judith / includes trigger phrase,
- per-chat and global rate limit pass,
- no OTP/payment/card/passport/medical/legal-emergency/suspicious-link content requiring refusal/escalation,
- generated reply is non-empty and not a cold outbound,
- latest inbound provider message id still matches the generated reply source.

If any gate fails, store the inbound event, write a bridge log row, and do not send.

## Minimal Data Model

Add a small bridge log table when implementation starts:

```sql
CREATE TABLE whatsapp_burner_bridge_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  chat_id TEXT NOT NULL,
  provider_message_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'generated', 'sent', 'failed', 'blocked')),
  status TEXT NOT NULL,
  reason TEXT,
  inbox_thread_id UUID,
  inbox_event_id UUID,
  raw_provider_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Keep raw payloads minimal. Do not store secrets, auth state, QR output, session keys, OTPs, payment/card data, passports, or sensitive IDs in logs.

## Verification Plan

1. Pair burner number by QR/pairing code.
2. Test allowlisted 1:1 inbound -> FAD Inbox event -> Judith/FAD reply -> Baileys send.
3. Test non-allowlisted chat is recorded as blocked and sends nothing.
4. Test global kill switch blocks outbound immediately.
5. Test per-chat and global rate limits.
6. If group support works, test mention-triggered group reply only; verify normal group chatter is ignored.
7. Kill/restart worker and verify auth/session recovery from the external auth dir.

## Risk Note

- Ban risk: high enough that this must stay burner-only. WhatsApp Terms and enforcement posture make unofficial automation unsuitable for Friday's main number.
- Session invalidation risk: medium/high. WhatsApp Web protocol changes can break Baileys sessions and require re-pairing.
- Delivery risk: medium. Messages can silently fail or be rate-limited; bridge logs must distinguish generated from actually sent.
- Privacy risk: medium/high. WhatsApp messages may contain sensitive data. The bridge must refuse/escalate OTPs, payment/card data, passports, sensitive IDs, suspicious links, and emergencies.
- Operational recovery: kill switch first, stop worker, unlink burner linked device, rotate/delete auth dir, inspect bridge logs, and restart only after allowlist/rates are confirmed.

## Deferred Until Implementation

- Installing Baileys dependency.
- Creating the worker.
- Adding migrations.
- Wiring the auto-reply generator.
- Live QR pairing.

This is intentionally deferred because session credentials and burner-number pairing should be done in a controlled terminal with the burner phone available.
