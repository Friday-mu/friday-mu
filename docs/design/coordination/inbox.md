# Inbox — Design Brief for Claude Design

> Sits on top of the **FAD Inbox Sprint Prep** ([36543ca8849281e981d2c942caddd3f4](https://www.notion.so/36543ca8849281e981d2c942caddd3f4))
> and **TeamInbox Sprint — Scoping + Decisions** ([36343ca884928180a38bcd2a433661df](https://www.notion.so/36343ca884928180a38bcd2a433661df)).
> Read `00-README` + `ask-friday.md` first. *(Reframed 2026-05-30 from the earlier engineering-first brief into the
> house format.)*

## 1. The brief in one line
Design Inbox as the **multi-audience operational comms surface** — guest · team · owner · vendor · website/direct ·
email — where **internal team comms replace Slack** (ADR-008), where **Friday Consult is the single compose/refine
surface** (the operator talks to Friday; Friday drafts inside the conversation), and where every message shows its
**real AI trust state** and every operator-relevant event drives a **push**.

## 2. Source of truth and grounding (three-way reconcile)
- **Vision.** Inbox is **broader than guest messaging**: the Running-Decisions log puts **internal team comms in FAD
  Inbox, not Slack**. **Consult-first reset** (Ishant): Friday Consult is *the* review/refine surface — the operator
  talks to Friday, Friday generates/updates a draft inside that conversation; **no separate old-style review/revise
  workflow**. **Visible-draft policy:** a visible draft appears **only** when there's an unanswered real inbound *or*
  the operator explicitly asks — background analysis runs but never surprises with draft cards. **Notification
  policy:** **push** for every FAD message/action needing operator attention; **email** only for **guest inbound +
  TeamInbox DM/@mention**.
- **Reality.** Active module `_components/modules/InboxModule.tsx`; `useLiveConversations()` / `useThreadDetail()`
  load/refetch but **don't yet consume SSE** (ADR-004 push is the target). Inbox **CRUD/read + send orchestrator +
  draft reject/retry/fail/dismiss are FAD-native**; **compose/revise/consult/teachings/template-send still
  GMS-proxied or incomplete**. **TeamInbox shipped** (mig **052**, `backend/src/team_inbox`,
  `_data/teamInboxClient.ts`, `modules/inbox/TeamInbox.tsx`). **Push backend is missing** (frontend hook + service
  worker exist; `/api/push/*` + `web-push` + VAPID + subscription table absent). Endpoints: `GET /api/inbox/
  conversations` (+ `/:id` bundle), `.../drafts/:id/approve` (**real Guesty send**, WhatsApp-window 409),
  `/api/inbox/consult` (confidence band + draft_updates + teaching/task suggestions + `missingKnowledge` +
  `metadata.{fallbackUsed,degraded,modelTimeout}`), teachings CRUD, `send-template` (often
  `template_send_not_configured`), website `/api/inbox/website/*`.
- **Drawn.** Prototype inbox screens (`fad-desktop-screens.jsx` / `fad-mobile-screens.jsx`): a clean list + timeline
  + the Friday Consult compose surface + the V2 trust vocabulary (= the spine's `ai/` kit, already built).
- **Full-vision rule:** design email/unclassified, owner/vendor channels, and the inline widgets complete even where
  SPEC; the **send-failed / WhatsApp-expired / fallback-draft** states are the point.

## 3. Who uses it (roles)
- **Director** — full.
- **Manager** (ops_manager ≡ commercial_marketing, identical) — **full guest + team inbox**, but **finance-gated**:
  the right-panel **Financials block (payout/totals) is hidden** from managers.
- **Field** — **Team channel only, NO guest inbox** (`inbox_guest: {}`); their real surface is the field PWA.
- **External** — none.

## 4. Design principles and system
- **One inbox, many audiences.** Guest · Team · Owner · Vendor · Website/direct · Email (guest/owner/vendor/team/
  **unclassified**). Audience is a first-class axis; entity chips + a filter sheet, not separate apps.
- **Consult-first compose.** Reply / Note / Ask all funnel through **Friday Consult** — embedded draft cards, inline
  teaching, task-suggestion cards, consult history, full-thread toggle, "no KB" warning. No old review/revise flow.
- **Friday assists, never autonomous on team chat.** The same interpretation pass runs on team messages, but Friday
  never sends without operator confirmation.
- **Use the built `ai/` kit + the trust states** (this is `ask-friday.md` §0's "already built — place it, don't
  rebuild"). Confidence is a band, not a %.

## 5. Information architecture
- **Guest inbox** — entity chips (Guest · Owner · Vendor · Unclassified) + AI-draft filter; thread list (sentiment,
  draft badge, unread); filter sheet (triage + stay-status + mentions); conversation **timeline** (per-message
  provenance + per-message translation); **AI draft panel** (confidence pill, drafting/failed/ready, Approve/Revise/
  Edit/Reject, "Teach Friday", **send preflight + 5s undo**); **right context panel** (Reservation / Financials
  [gated] / Guest / Website-AI takeover / actions).
- **TeamInbox** — 13 seeded channels (**public:** gm · announce · random · ops · reservations · syndic · agency ·
  marketing · **photoshoot** [full-quality storage]; **private:** finance · admin · refunds · adjustments); DMs (1:1
  + group); @mentions; threading; **3 semantic reactions** (👀 looking / ✅ done / 🙋 need-help); file uploads
  (photoshoot quality exception); search (FTS); read receipts; **future inline widgets** (create task / capture
  expense / capture income); Google Meet links (not embedded video).
- **Email / multi-audience** — Gmail v1 (generic provider schema for Outlook later); email threads render like guest
  threads (no AI-draft pipeline yet); classification heuristics → LLM fallback → cached per sender; the
  **Unclassified** fallback chip.

## 6. Surfaces to design (full vision) — P0 first
| # | Surface | Purpose | Reality | Priority |
|---|---|---|---|---|
| A | **Guest thread + Friday Consult compose** | timeline + the single Consult compose/refine surface; draft cards w/ confidence + provenance; Approve&send (preflight + 5s undo). | LIVE (send) / GMS-proxied (consult) | **P0** |
| B | **AI trust-state placement** | SyncChip / Provenance / ConfBar on drafts + messages; the five states (§7). | BUILT kit, partly unwired | **P0** |
| C | **TeamInbox** | channels + DMs + mentions + threading + reactions + uploads + search + read receipts. | LIVE | **P0** |
| D | **Right context panel** | Reservation / **Financials (role-gated)** / Guest / Website-AI takeover / actions + **Linked tasks**. | LIVE | **P0** |
| E | **WhatsApp 24h window + template recovery** | live timer + the closed-window template path. | PARTIAL (template sender unconfigured) | **P1** |
| F | **Email / unclassified + owner/vendor** | email-thread rendering, audience routing, the Unclassified chip; owner/vendor channels. | SPEC | **P1** |
| G | **Website-AI handoff / takeover** | AI confidence + escalation reason → "Take over AI" (real mutation) → reply. | LIVE | **P1** |
| H | **Inline widgets (from chat)** | create task / capture expense / capture income from a TeamInbox message. | SPEC | **P2** |

## 7. Critical states the UI must make legible (bind to real signals)
- **Healthy** → SSE up + reservation loaded + draft `confidence ≥ 0.6` + consult grounded → green `SyncChip` +
  `Provenance` ("Grounded in: reservation {code}, {property}, N teachings") + `ConfBar`.
- **Stale** → SSE dropped / `last_message_at` aged / availability cache old → amber + "Re-sync".
- **Partial** → bundle returned but `reservation` null / consult ran with `missingKnowledge` → amber; Provenance
  names the missing source.
- **Fallback** → consult `metadata.fallbackUsed` / `missingKnowledge` (conf ~0.55–0.62) → indigo "general guidance —
  verify"; a send from a fallback draft is flagged for review.
- **Failed** → draft `generation_failed` / `send_failed`, consult `metadata.degraded`/`modelTimeout`, 5xx, or
  `whatsapp_window_expired` 409 → red banner **naming which service**; "couldn't generate · Retry"; **mutating
  actions DISABLED**.
- **Visible-draft policy** → no draft card when the last real message is outbound/team; a draft appears only on an
  unanswered inbound or an explicit ask (don't surprise the operator).
- **Don't-fake gaps** (design as disabled/"coming soon", not magic): internal notes **not persisted** (local-only);
  WhatsApp **template sender unconfigured**; **no @-mentions on guest threads** (Team only); **no guest-thread
  assignment**; **no attachment upload** on compose.

## 8. Key flows to storyboard
1. **Reply to a guest:** open thread → Friday Consult draft (confidence + provenance) → Approve&send (preflight + 5s
   undo) / Revise (keep talking to Friday) / Edit / Reject (+ Teach).
2. **WhatsApp closed window:** timer expired → template-recovery path (or honest "template sender not configured").
3. **Website handoff:** AI escalates (reason) → "Take over AI" → reply.
4. **Team coordination:** post in `ops`, @mention, react ✅, thread; (future) "create task" inline widget.
5. **Triage at scale:** filter Unread / Draft-ready / mentions; cross-link to Reservations; +Task → Operations.

## 9. Reference artifacts
Built `InboxModule` + `modules/inbox/TeamInbox.tsx` + `_data/{teamInboxClient,teamInbox}.ts` + `/api/inbox/*` +
TeamInbox mig 052; the `ai/` kit; the notification policy (push-for-all-operator-work, email-for-guest-inbound +
DM/@mention) → see `notifications-emails.md`; the 13-channel seed; the Consult action protocol (draft_updates /
teaching_actions / task_suggestions / missingKnowledge).

## 10. Recommended design priority
1. **A–D:** the guest thread + Consult compose, the trust-state placement, TeamInbox, and the role-gated context
   panel.
2. **E–G:** WhatsApp window + template recovery, email/unclassified + owner/vendor, website handoff.
3. **H:** the inline widgets.

## 11. Out of scope / honest-future
Internal notes persistence, guest-thread @-mentions + assignment, compose attachment upload, the WhatsApp template
**sender** (unconfigured), embedded video (Google Meet links only), the AI-draft pipeline **for email** (renders like
guest threads, no draft yet) — design as disabled/"coming soon", not magic. SSE push + the push **backend** are the
build dependency for live freshness + notifications.

## 12. Open decisions (propose options, don't guess)
1. **Confidence display** — band/label, not "88%" (the global clash #1).
2. **Tab/filter model** — "Needs reply" vs Unread vs AI-draft (different axes): one tab axis + the filter sheet, or
   fold in? Keep Owner/Vendor/Unclassified (live) + the filter sheet.
3. **Entities** — confirm Owner/Vendor/Unclassified stay; do syndic/group get UI (currently permission-only)?
4. **Stale threshold** — what signal = "stale" (SSE-disconnect is clean; `last_message_at` age is fuzzy)?
5. **Provenance copy** — exact citation phrasing (reservation code, property facts, N teachings, KB presence).
6. **The don't-fake gaps (§11)** — show disabled/"coming soon" or hide?

## 13. What we want back
The **guest thread + Friday Consult compose** (with the five trust-states + visible-draft policy + send-preflight/
undo), the **TeamInbox**, and the **role-gated context panel** first — desktop + manager-mobile — built on the live
`/api/inbox` + `teamInboxClient` + the `ai/` kit. Then WhatsApp/template, email/unclassified + owner/vendor, website
handoff, and the inline widgets. Flag clashes per `00-README` §7.
