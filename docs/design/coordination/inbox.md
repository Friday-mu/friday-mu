# Design-input brief — INBOX (for the Claude Design session)

> Paste-ready context for designing the V2 Inbox. Written by the code session so the design fits our
> **real** backend. Rule: wire to the data we actually have; never lose functionality; where V2 deliberately
> replaces a feature, keep the *intent*. The Inbox is **not** a mock — it's a live read+write surface against
> shared Postgres + Guesty + Kimi/Gemini, with **real AI trust signals** already emitted by the backend.

## 0. Already built — DESIGN TO USE THESE, don't redesign them
The V2 "AI trust states" vocabulary already exists in our code (this session, S1/S2):
`frontend/src/app/fad/_components/ai/` → **`TrustStates.tsx`** (`SyncChip`, `Provenance`, `ConfBar`,
`StateBanner`, `AITrustStrip`), **`SourceTag.tsx`** (`SourceTag` 6 kinds: guesty/breezeway/friday/modeled/
stale/failed + `Field`), **`aiHealth.ts`** (`deriveAIHealth(signals)` → healthy/stale/partial/fallback/failed),
**`trustEnvelope.ts`** (maps any AI backend's response → the strip). Tokens in `gm-desktop.css` (scoped `.dwrap`).
→ The design's job is to *place* these on the Inbox surfaces, not invent a parallel set.

## 1. Purpose & core use-cases (priority order)
1. Open a thread with an AI draft → read it **with visible confidence + provenance** → Approve&send (preflight + 5s undo) / Revise / Edit / Reject. **Send is a real Guesty send.**
2. Ask Friday (consult panel) to draft/polish/summarise → see grounded vs fallback clearly → push a draft → send.
3. WhatsApp 24h-window management (live timer; template fallback when closed).
4. Website-AI handoff: see AI confidence + escalation reason → **Take over AI** (real mutation) → reply.
5. Triage at scale: filter Unread / Draft-ready / stay-status / mentions; cross-link to Reservations; create an Ops task from a thread.
6. Internal team coordination (notes + @mentions, Team channels).

## 2. Features we run today (keep the intent — don't drop)
Entity chips **Guest · Owner · Vendor · Unclassified** + Team + AI-draft filter; thread list w/ sentiment, draft badge, unread; **filter sheet** (triage + stay-status + mentions); conversation **timeline** (inbound+outbound+sent-drafts, per-message provenance `viaSystem`/`viaChannel`, **per-message translation** original↔translated); **internal notes** (team-only, @mentions); **WhatsApp 24h timer**; **website booking-event cards** (booking_request / payment_proof); **AI draft panel** (confidence pill, states drafting/failed/ready, Approve/Revise/Edit/Reject, "Teach Friday" rule, **send preflight + 5s undo**); **Friday Consult** (the single compose surface — Reply/Note/Ask funnel through it; embedded draft cards, inline teaching + task-suggestion cards, consult history, full-thread toggle, "no KB" warning); **right context panel** (Reservation / Financials / Guest / Website-AI takeover / actions); **Team Inbox** (channels + DMs + member admin); +Task → Ops.

## 3. Real backend (endpoint → what it gives → live/mock → get vs don't)
Shared Postgres (same instance friday-gms uses), tenant-scoped FR. SSE push (ADR-004), no polling.
| Endpoint | Key fields | Live? | Notes |
|---|---|---|---|
| `GET /api/inbox/conversations` | guest, property, channel, status, last_message, unread, sentiment, **latest_draft_state + confidence**, check-in/out, reservation_id | LIVE | **No subject** (GMS has none — derived); `mentionsMe` always false on guest threads |
| `GET /api/inbox/conversations/:id` | bundle: conversation + messages[] + drafts[] + **reservation (Guesty)** + whatsapp_window + channels | LIVE | one call = full thread |
| `.../messages` | direction, body, original/translated_language, sender, via_system, attachments(meta) | LIVE | translations real; attachments **read-only** (no compose upload) |
| `POST .../drafts/:id/approve` | sends, translates to guest lang, **real Guesty send**, enforces WhatsApp window (409 if closed) | LIVE | the marquee real mutation |
| draft revise/reject/retry/fail/dismiss | learning loop | LIVE (proxied to friday-gms) | feeds real teaching |
| `POST /api/inbox/consult` | response, **confidence**, draft_updates[], teaching_actions[], task_suggestions[], **missingKnowledge**, **metadata.{fallbackUsed,degraded,modelTimeout}** | LIVE | Kimi/Gemini, grounded; confidence is a **backend heuristic band** (0.2/0.55/0.62/0.78/0.82), not calibrated % |
| teachings CRUD · consult history/sessions | persisted | LIVE | real |
| `POST .../send-template` (WhatsApp) | often `template_send_not_configured` | PARTIAL | template **sender not wired in prod** |
| website `/api/inbox/website/threads/*` | ai_handoff, visitor_message, booking.request/proof, takeover, drafts | LIVE | friday.mu webhook + Resend + Guesty |
**Channels actually wired:** Airbnb · Booking · WhatsApp · Email · Website/direct. Owner/vendor channels are inferred from Guesty text, not first-class.
**Don't-fake gaps (design as disabled/"coming soon", not magic):** internal notes **not persisted** (local-only); WhatsApp **template sender unconfigured**; **no @-mentions on guest threads** (only Team); **no guest-thread assignment**; **no attachment upload** on compose.

## 4. The 5 trust-states → REAL signals (bind to these; don't invent)
- **Healthy** → SSE up + reservation loaded + draft `confidence ≥ 0.6` + consult grounded (no missingKnowledge) → green SyncChip + Provenance ("Grounded in: reservation {code}, {property}, N teachings") + ConfBar.
- **Stale** → SSE dropped / `last_message_at` aged / reservation availability cache old → amber + "Re-sync".
- **Partial** → bundle returned but `reservation` null / `availability` missing / consult ran without KB (`missingKnowledge`) → amber; Provenance names the missing source.
- **Fallback** → consult `metadata.fallbackUsed` or `missingKnowledge` (conf ~0.55–0.62) → indigo "general guidance — verify"; sends from a fallback draft flag for review.
- **Failed** → draft `generation_failed`/`send_failed`, consult `metadata.degraded`/`modelTimeout`, 5xx, or `whatsapp_window_expired` 409 → red banner naming WHICH service; "couldn't generate · Retry"; **mutating actions DISABLED**.

## 5. Roles (gate the UI; authoritative in permissions.ts)
- **Director** — full.
- **Manager** (ops_manager + commercial_marketing, identical) — **full guest + team inbox**, BUT **finance-gated**: the right-panel **Financials block (payout/totals) must be hidden** from managers.
- **Field** — **Team channel only, NO guest inbox** (`inbox_guest: {}`); design the field inbox as Team-only (their real surface is the Field PWA).
- **External** — none.

## 6. New-design diff (V2 mock vs current) — reconcile, don't shrink
- **V2 ADDS** the trust-state vocabulary (= §0, already built) — the core deliverable; bind to §4 signals.
- **V2 tabs** = All/Guest/**Needs reply**/Team. Current = Guest/Owner/Vendor/Unclassified + AI-draft + filter sheet. → Keep Owner/Vendor/unclassified (live) + the filter sheet; reconcile "Needs reply" vs "Unread"/"AI-draft" (different axes).
- **V2 right panel** adds **Linked tasks** (good, keep) but the mock drops Financials + Website-AI takeover — those are **real, keep them** (re-skinned with SourceTags, Financials role-gated).
- **V2 mock omits** Owner/Vendor entities, internal notes, translation toggles — treat as mock omissions, **not** decisions; preserve.

## 7. Open questions for the design session
1. **Confidence display:** backend confidence is a heuristic **band**, not a calibrated %. Show band (high/med/low) or qualitative label rather than "88%" (false precision). Decide.
2. **Tab/filter model:** "Needs reply" vs Unread vs AI-draft — one tab axis + the filter sheet, or fold in?
3. **Entities:** confirm Owner/Vendor/unclassified stay; do syndic/group ever get UI (currently permission-only)?
4. **Stale threshold:** what time/signal = "stale"? (SSE-disconnect is clean; `last_message_at` age is fuzzy.)
5. **Provenance copy:** exact citation phrasing (reservation code, property facts, N teachings, KB presence)?
6. **The don't-fake gaps (§3):** show as disabled/"coming soon" or hide?
