# Guest portal chat — scoping pack v0.1 (DRAFT)

> Status: DRAFT for Ishant review. Promote to Notion (FAD Scoping zone) when ready to lock.
> Authored: 2026-05-24 (Ishant + Claude).
> Tracked as: **T4.36** in [`docs/FAD_BACKLOG.md`](../FAD_BACKLOG.md).

## 1. Framing

Today: direct-booking guests communicate via WhatsApp (primary) or email (fallback). WhatsApp wins because it's in their pocket; email is too slow. WhatsApp loses because of: API costs, 24h conversation window rules, template approval friction, no native context on our side (we have to manually pull reservation data into the thread mentally), no way to push structured cards (tasks done, maintenance ETA, etc.).

**Idea:** stop forcing a third-party messaging platform. The guest already needs a guest portal (check-in details, access codes, ongoing reservation state). Add a chat surface RIGHT THERE. Guests talk to us inside the portal; AI is augmented with the full reservation context; we push structured updates (cleaner arriving, maintenance complete) inline.

**Honest framing:** this is a complement to WhatsApp, not a replacement. Discovery friction kills pure-portal strategies — guests forget portal links exist. The win is for **active stays** (guest is already engaging with portal for amenities/check-in) and **direct bookings** (where WhatsApp adoption is patchy). Pre-arrival communication stays multi-channel (WhatsApp + email).

## 2. Where it wins (load-bearing use cases)

- **On-property service requests** — "AC isn't working", "we need more towels", "where's the pool key" — guest is on-property, near their phone, willing to open portal because that's where access codes / amenities also live
- **Pre-arrival logistics** — driver pickup confirmation, early check-in approval, special-request acknowledgement — when guest has the portal open to check the reservation anyway
- **Structured updates from us** — "Bryan completed the maintenance request", "your cleaner will arrive at 11am tomorrow", "we've upgraded you to a larger property" — natively render as cards, not just text
- **AI-with-context Q&A** — "what's the wifi password", "what time is checkout", "is the BBQ available" — answered instantly from Property Cards (mig 077 surface) without staff round-trip
- **Multi-language** — auto-translate inbound/outbound via existing translate.js pipeline

## 3. Where it loses (don't pretend it solves these)

- **Initial guest discovery** — they need to find the link. Mitigation: short branded URL (e.g. `friday.mu/g/<name>`) + portal PWA install prompt at booking confirmation
- **iOS web push reliability** — only works post-PWA-install on iOS 16.4+, often silently denied. Need a non-push notification fallback (email-on-new-message)
- **Always-on availability expectations** — WhatsApp sets "instant" expectations. Portal chat feels closer to email pace. Set expectations in onboarding copy
- **OTA bookings** — Airbnb/Booking.com forbid off-platform contact pre-arrival. Portal chat only invitable post-arrival OR on direct bookings
- **Replacing WhatsApp entirely** — don't try. Keep WhatsApp as secondary outbound for pre-arrival and unreached guests

## 4. Open scoping questions (need Ishant decisions before lock)

| # | Question | Default lean |
|---|---|---|
| 1 | **Channels** — portal chat as primary, WhatsApp/email as fallback, or all 3 surfaced to guest? | Portal primary, WhatsApp + email as secondary surfaces (guest picks per-message) |
| 2 | **Identity model** — per-booking guest record (fresh portal link each stay), OR persistent multi-trip guest account (login, "your bookings" history)? | Persistent. Magic-link login; one guest record across multiple stays. Aligns with the Guests module shape from v0.2 |
| 3 | **Notification** — how does guest know they have a new message from us? | Web push (when PWA-installed + permission) + email-on-new-message fallback (always) + SMS as paid premium (later) |
| 4 | **AI surfaces** — retrieval only (RAG over reservation + Property Cards), OR actions (cancel, modify, special-request capture)? | Retrieval V1. Actions deferred until trust + safety layers in place. Actions = Phase 3 |
| 5 | **Scope** — direct bookings only, or also OTA bookings (Airbnb/BDC) post-arrival? | Direct + OTA post-arrival. Pre-arrival OTA stays on-channel per OTA rules |
| 6 | **Authentication** — magic link per booking, password, or third-party (Google/Apple)? | Magic link via email. Frictionless; matches guest mental model |
| 7 | **Inbound integration** — messages land in FAD Inbox alongside email/WhatsApp threads (unified), OR separate "Portal" channel? | Unified. Same `inbox_threads` schema; channel = `portal_chat`. Re-uses everything we built |
| 8 | **Surfaces / cards** — what structured updates push from FAD → portal? | MVP: task status (cleaner ETA, maintenance complete), payment confirmations, access codes published. v2: photos, weather, local recs |
| 9 | **AI disclosure** — does guest see "Friday AI" branding when AI answered, or always look like Mathias/Franny replied? | Disclose. "Friday AI" badge when auto-answered + show "answered in 2s" timestamp. Builds trust + sets expectations |
| 10 | **Pre-arrival vs on-property modes** — different UI? | Same UI, but card stack on top changes: pre-arrival = "your reservation", on-property = "your stay" (with access codes prominent), post-stay = "we hope you enjoyed it + review prompt" |
| 11 | **PWA install** — soft prompt on booking confirmation, hard prompt mid-stay, or just discoverable? | Soft prompt at booking confirmation + reminder banner on first portal visit. Don't be annoying |
| 12 | **Short URL strategy** — `friday.mu/g/<guest-name>`, `friday.mu/stay/<short-code>`, or `friday.mu/your-stay`? | `friday.mu/g/<short-code>` where short-code is 6 chars + readable (not Guest Name — privacy + uniqueness). Personalized greeting once authed |
| 13 | **Translation parity** — do we auto-translate inbound guest messages → English for staff, and outbound staff messages → guest's language? | Yes. Reuse existing translate.js. Show original alongside translated |
| 14 | **Operator workflow** — staff sees portal-chat messages in the same Inbox they already use? Same draft auto-generation? | Yes. Same Inbox, same draft pipeline. Marked with `portal_chat` channel chip |
| 15 | **Read receipts** — do guests see when staff has read their message? Do staff see when guest has read theirs? | Yes both ways. Helps both sides understand pacing |

## 5. Out of scope (Phase 1)

- Voice / video calls
- Payment-in-chat (handled in main portal flow)
- Group chats (multi-guest threads)
- Marketing broadcast capability
- Third-party bot integrations
- Replacing existing WhatsApp infrastructure (keep dual-channel)

## 6. Architecture sketch (not locked)

```
[Guest browser/PWA]
       ↓
   friday.mu/g/<code>     ← Friday Website (separate codebase per AGENTS.md)
       ↓ JWT short-lived
   FAD /api/public/portal/messages
       ↓
   inbox_threads (existing schema, channel='portal_chat')
       ↓ SSE LISTEN/NOTIFY
   FAD Inbox UI (staff side, existing)
```

Reuses:
- `inbox_threads` + `inbox_messages` from existing inbox infra
- `analytics_events` for read receipts (event_type='portal_message_read')
- `kimi_draft` / Gemini pipeline for staff-side draft suggestions
- `translate.js` for in/out translation
- `web-push` VAPID notifications (working as of 2026-05-23)
- Friday Website's existing portal scaffolding (per memory `fad_gms_dependency_map`)

New:
- Guest auth (magic link to email, persistent guest account)
- Portal-chat UI on Friday Website (separate session — `Don't edit FAD and Friday Website in the same checkout/session`)
- Structured-card schema (task-status / payment / access-code cards)
- `portal_chat` channel handling in `inbox_threads`

## 7. Effort estimate (rough)

- Identity + magic-link auth: **M** (2-3 days)
- Portal chat UI on Friday Website: **L** (3-5 days)
- FAD-side channel integration + draft pipeline tie-in: **M** (2-3 days)
- Structured-card schema + push logic: **M** (2-3 days)
- AI retrieval (RAG over Property Cards + reservation): **L** (3-5 days)
- PWA install flow + push notification reliability: **M** (2-3 days)
- Testing + tuning: **M** (2-3 days)

**Total: 2-3 weeks of focused work** — not a slice. Warrants its own sprint.

## 8. Dependencies + ordering

Hard dependencies (must land first):
- Properties v0.2 W1 backbone — **shipped 2026-05-24** ✓ (Property Cards now exist)
- Reservations v0.2 W1 backbone — **shipped 2026-05-24** ✓ (cleaning_arrangement, special_requests, internal_notes accessible)

Soft dependencies (can land in parallel):
- Guests module v0.2 (persistent guest identity, contact history) — Mathias, Jul 2026
- Stay portal coordination (T3.3 in backlog)

## 9. Cross-cutting locks impacted

- ADR-001 (API-first) — yes, this is API-first
- ADR-002 (3-layer: integration / intelligence / interface) — fits cleanly; chat = interface, AI retrieval = intelligence, WhatsApp/email fallback = integration
- ADR-006 (Reservations is primary key everything cross-links to) — portal chat threads cross-link to reservation_id ✓
- ADR-008 (Internal team comms in FAD Inbox, not Slack) — extends naturally; external guest comms also in FAD Inbox

## 10. Open product decisions

- Naming: "Friday Chat" / "Friday Concierge" / "Friday Guest" / just "Chat"?
- Branding: same Friday brand or sub-brand for guest-facing surface?
- Pricing: free tier (always), paid tier (more storage / SMS), or just free?
- Multi-language UI: which languages at launch? (EN + FR baseline given Mauritius)
