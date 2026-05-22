# WhatsApp Burner Bridge Prototype Risk Note

Scope: disposable-number WhatsApp Web bridge only. Do not connect Friday's main WhatsApp number or Ishant's personal WhatsApp.

## Prototype Shape

- Library: Baileys / WhatsApp Web multi-device via `@whiskeysockets/baileys`.
- Auth/session state: `WHATSAPP_BRIDGE_AUTH_DIR`, defaulting locally to `backend/.cache/whatsapp-bridge-auth`, gitignored and chmod `700` best effort.
- Runtime: disabled by default. Requires `WHATSAPP_BRIDGE_ENABLED=true`.
- Outbound: disabled by default. Requires `WHATSAPP_BRIDGE_OUTBOUND_ENABLED=true` and no `WHATSAPP_BRIDGE_KILL_SWITCH=true`.
- Initial test: chats must be in `WHATSAPP_BRIDGE_ALLOWLIST` unless `WHATSAPP_BRIDGE_ALLOW_ALL=true` is deliberately set.
- Groups: only replies when Judith/the bot is mentioned, the bot is quoted, or a configured trigger phrase is present.

## Key Risks

- Ban risk: Baileys is not the official WhatsApp Business API and is not endorsed by WhatsApp. The burner number may be rate-limited, logged out, or banned.
- Session invalidation: WhatsApp can invalidate linked-device sessions. Recovery is to stop the worker, clear or rotate the auth dir, and re-pair the burner number.
- Data/privacy: inbound WhatsApp content is copied into FAD Inbox tables and the bridge audit table. Do not use this for passports, payment cards, OTPs, sensitive IDs, or emergencies.
- Reply quality: the prototype uses FAD draft generation, then auto-sends the draft. This bypasses human review by design for burner testing only.
- Language risk: FAD operator drafts are English-first. Test in English first; add outbound translation before broader guest-language testing.
- Group risk: group mode can create accidental replies. Keep groups disabled or trigger-only.

## Recovery Steps

1. Set `WHATSAPP_BRIDGE_KILL_SWITCH=true` and restart `fad-backend` to stop all outbound sends immediately.
2. If the session is compromised or noisy, stop the worker and remove the auth dir from the server.
3. Keep `WHATSAPP_BRIDGE_ALLOWLIST` narrow during testing.
4. Inspect `whatsapp_bridge_events` for inbound, generated, sent, blocked, and failed events.
5. If the burner number is banned, discard it and rotate to a new disposable number.
