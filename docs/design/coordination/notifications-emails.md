# Notifications + Emails — Design Brief for Claude Design

> Cross-cutting surface. The in-app notification center is also **Ask Friday surface F** (`ask-friday.md` §6) — this
> brief is the deep-dive. Vision anchor: the **Notifications-redesign note** in Properties scoping §16 ("current
> panel-only surface insufficient — full-screen view, AI auto-prioritization, mark read/unread, filter chips,
> per-module wiring") + the **Ask Friday** filtering model. Read `00-README` + `ask-friday.md` first.
>
> **Scope RESOLVED (Ishant, 2026-05-30): TEAM/SYSTEM ONLY.** This surface owns the in-app notification center, push,
> staff alert-emails, and the AI-filtering ("muted N low-signal"). **Guest/owner *conversational* outbound stays in
> Inbox; statement send stays in Owners** — they are NOT designed here. (The guest/owner-comms-template half is
> dropped from scope.)

## 1. The brief in one line
Design the **AI-filtered notification system** — an in-app **notification center** that surfaces the few things that
*need a human* and visibly mutes the firehose, wired per-module, delivered across **in-app · email · push**, with
per-type **delivery preferences** — so the manager sees "the 6 that need you", not 3,847 status pings.

## 2. Source of truth and grounding (three-way reconcile)
- **Vision** = Properties §16 (the redesign mandate: full-screen, AI auto-prioritization, read/unread, filter chips,
  **per-module wiring**) + the Ask Friday filtering principle (surface the signal, mute the noise, *reviewably*) +
  the **sidebar pending-badges** idea (per-module count chips — needs a per-module signal definition). **Scope fork
  (decide first):** team/system-only vs also-guest/owner-comms (see headline note).
- **Reality** = largely **SPEC/demo**. The prototype's notification list + the "muted N low-signal" filtering are
  **demo copy** (hardcoded `NOTES_DATA`); there are **no notification-suggestion / prioritization endpoints** yet,
  and **per-module signal wiring doesn't exist**. Transactional email exists in pieces (e.g. Resend for owner/website
  flows) but there's no unified notification/email **type registry** or preference center. Tag the whole system SPEC;
  design the full vision, mark backend pending.
- **Drawn** = `fad-desktop-screens.jsx` `ScreenNotifsMgr` — eyebrow "INBOX", title "Notifications", sub *"Friday
  muted 3,847 low-signal alerts this week"*; a **Friday filter bar** ("surfaced the N that actually need a manager;
  muted status pings, auto-syncs & resolved items"); segments **All / Needs you (unread count) / Today / Muted**;
  each item = tone-coloured icon + source + time + message + an **action button that jumps to the task/approvals/
  roster/owner** + unread dot; **Muted** is a reviewable list ("+3,842 more · status pings, syncs & auto-resolved").
  Plus `FAD Manager - Notifications.html` + the mobile variant.
- **Full-vision rule:** design the complete center + preference model + per-module types even though the backend is
  unbuilt; the **muted/why-surfaced/delivery-failed** states are the point.

## 3. Who uses it (roles)
- **Director / Manager** — the full notification center (role-scoped: managers don't get finance-amount alerts they
  can't see; director gets approval/finance/owner alerts). Notifications are filtered to **what's relevant to the
  current role** (the sidebar pending-badges follow the same per-role signal).
- **Field** — notifications live in the **task PWA** (task assigned, schedule published, requirement gated), not this
  manager center.
- **Owner / guest** — **out of scope here.** Their outbound (statements, check-in reminders) is owned by Owners /
  Inbox respectively; this module is the **team/system** notification surface only.

## 4. Design principles and system
- **Surface the signal, mute the noise — reviewably.** The default view is "**Needs you**" (the few that need a
  human). Everything muted is **one tap away** with the reason it was muted — never silently dropped (the same
  honesty doctrine as the AI trust-states).
- **Every notification is actionable + traceable.** Each carries a **jump-to-source** action and a provenance
  (which module/event fired it, when). No dead-end "FYI" pings in the primary view.
- **One system, three channels.** in-app center · **email** · **push** (PWA) — a notification *type* maps to channel
  defaults + user overrides. Use the built kit for any AI-prioritization confidence (band, not %).
- **Per-module wiring is the hard part.** Each module defines its notification **types** + the **signal** that fires
  them; the center + the sidebar badges consume those. The design should propose the per-type taxonomy.

## 5. Information architecture
- **Notification center** (full-screen + a header tray/popover) — segments Needs-you / Today / Muted; filter chips
  (by module / type / unread); mark read/unread; bulk mark-all.
- **Preferences** — per-type channel matrix (in-app / email / push on/off), digest cadence (instant / daily digest),
  quiet hours.
- **Sidebar pending badges** — per-module count chips (role-scoped signal).
- **Channel policy (locked, from the Inbox pack):** **push** fires for *every* FAD message/action needing operator
  attention; **email** fires *only* for **guest inbound + TeamInbox DM/@mention** (don't email every FAD action).
  In-app center carries everything.

## 6. Surfaces to design (full vision) — P0 first
| # | Surface | Purpose | Reality | Priority |
|---|---|---|---|---|
| A | **Notification center (full-screen)** | Needs-you / Today / Muted, filter chips, read/unread, per-item jump-to-source. | SPEC (prototype demo) | **P0** |
| B | **Header tray + sidebar pending badges** | the always-visible entry + per-module role-scoped counts. | SPEC | **P0** |
| C | **The "Friday filtered" affordance** | "surfaced N, muted M low-signal" + the reviewable muted list with *why*. | SPEC | **P0** |
| D | **Preferences (channel × type matrix)** | per-type in-app/email/push, digest cadence, quiet hours. | SPEC | **P1** |
| E | **Staff alert email + push types** | the operator-work types (approval needed, schedule published, store-below-par, send-failed, draft-failed) + the locked channel policy (push-for-all-operator-work; email only for guest-inbound + DM/@mention). | SPEC | **P1** |
| ~~F~~ | ~~Guest/owner outbound comms templates~~ | **Out of scope** (Ishant 2026-05-30) — Inbox owns guest/owner conversational outbound; Owners owns statement send. | — | — |

## 7. Critical states the UI must make legible
- **Surfaced vs muted** — *why* a notification needs you (the firing signal) vs *why* something was muted; both
  visible. The muted count is reviewable, not hidden.
- **Read / unread / acted** — and whether the jump-to-source action was taken.
- **AI-prioritization confidence** — if Friday ranks/auto-mutes, show the confidence **band** + an undo (re-surface).
- **Delivery state (email/push)** — queued / sent / **failed** (bounced email, push-permission denied) → honest
  failure, name the channel; offer retry / fix-permission.
- **Per-channel preference + quiet hours** — what's on/off per type; "muted by your settings" vs "muted by Friday".
- **Role-scoping** — a manager never gets an alert for something they can't see (finance amounts).

## 8. Key flows to storyboard
1. **Triage:** open center → "Needs you (6)" → act (jump to task/approval/roster/owner) → it clears.
2. **Review the mute:** "3,847 muted" → see the categories + a sample → optionally un-mute a type.
3. **Tune preferences:** turn a noisy type to daily-digest / off / push-only; set quiet hours.
4. **Delivery failure:** a staff alert push/email fails (push-permission denied / bounce) → failed state → retry /
   fix-permission.

## 9. Reference artifacts
Prototype `ScreenNotifsMgr` (+ `.html` + mobile); Properties §16 (the redesign mandate + sidebar-badges); the Ask
Friday filtering model (`ask-friday.md` §6 F); the `ai/` kit for any prioritization confidence. **Backend is
SPEC** — per-module notification types + signals need defining (propose the taxonomy).

## 10. Recommended design priority
1. **A–C:** the center, the header tray + sidebar badges, and the "Friday filtered + reviewable muted" affordance.
2. **D–E:** preferences (channel × type) + the staff/system alert email/push types.

## 11. Out of scope (RESOLVED)
**Guest/owner outbound comms is NOT here** — guest messaging lives in **Inbox**, statement send in **Owners**. This
module is the **team/system** notification surface only. The notification **backend / signal pipeline** is unbuilt —
design the system + types, mark SPEC.

## 12. Decisions
**RESOLVED (Ishant, 2026-05-30):** scope = **team/system only** (guest/owner comms out — Inbox/Owners own those).

**Still open (propose options):**
1. **Center home** — its own full-screen module/route vs a header tray vs both (recommend both).
2. **Per-module type taxonomy** — the canonical notification types + firing signals per module (the per-module
   wiring contract).
3. **AI auto-mute aggressiveness** — how hard Friday filters before it risks hiding something (ties to the
   proactivity dial in `ask-friday.md` §12).
4. **Sidebar pending-badge signal** — the per-role count definition per module.

## 13. What we want back
The **notification center** (Needs-you / muted-reviewable) + the **header tray + sidebar badges** + the **"Friday
filtered" affordance** first — desktop + manager-mobile — built on the `ai/` kit, with the surfaced-vs-muted +
delivery-failure states visible; then preferences + the staff/system alert types. **Team/system only** — don't design
guest/owner comms here. Flag any new clash per `00-README` §7.
