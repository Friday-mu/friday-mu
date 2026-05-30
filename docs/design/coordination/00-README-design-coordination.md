# FAD V2 — Design Coordination (read this first)

> **What this is.** The umbrella for coordinating the FAD V2 redesign with the **Claude Design** session.
> It sets the working loop, the design system (including components we've **already built** — use them, don't
> rebuild), and the surface list. Each module then has its own vision-led **Design Brief** (in the Syndic-brief
> house format) under `docs/design/coordination/`. Briefs sit **on top of** the Notion scoping packs (source of
> truth for data/rules) and our code reality — they don't replace either.

## 0. How the design session gets this
Two ways — pick one:
- **Link the repo** to the Claude Design session, **scoped to `frontend/src/app/fad/` + `docs/design/`** (Claude
  Design lags/breaks on very large repos — do NOT link the whole monorepo). It then reads these briefs, the
  prototype (`docs/design/fad-v2/prototype/`), and our actual V2 components + tokens. **Best option.**
- **Or paste** the relevant brief markdown (these files are written paste-ready) into the design chat + point it
  at the prototype.
Hand it **this file (`00-README`) first**, then the per-module brief(s).

## 1. The job, in one line
We built a real, working FAD already. We're redesigning it to be better. Design the **full intended vision** of
every surface; we then move our backend toward it gradually. The design must understand our **current reality**
so it can (a) reuse what exists and (b) flag where the new design clashes with what we built.

## 2. The working loop
1. **We → Design:** the per-module briefs (vision + reality + states), the notifications/emails, the partial build.
2. **Design ↔ us (before designing):** Design lists any questions it has for the code team; Ishant relays; we answer; iterate until Design fully understands. *(Design: please ask before you design.)*
3. **Design compares** its full-vision design against our current build (detailed in each brief) → **flags every clash to Ishant** with options: do the design · keep current · hybrid · discuss. Recorded in `clashes.md`.
4. **Design builds** the whole thing — full vision, all surfaces, all states.
5. **Design → code:** Ishant hands the finished design to the code session; we review and bounce back open questions.
6. **In parallel:** the code session reskins the **shell + presentation-only** changes now (direction is known); module **bodies** wait until each module's design is locked (avoid rebuilding twice).

## 3. Source of truth & grounding (three-way reconcile)
- **Vision** = the Notion **scoping packs** (per module) + the **Running Decisions log** + ADRs. Don't re-derive; design to them. (Properties v0.2 LOCKED, Reservations v0.2 LOCKED, Reviews v0.2, Analytics v0.1 LOCKED, Design OS v0.1 LOCKED, Syndic v0.1, TeamInbox Sprint, FAD Inbox Sprint Prep, FAD Ops Scheduling/Roster/Task Policy, FAD Mobile UX Doctrine.)
- **Reality** = our **code + live APIs** (what we have, what's live vs what we build toward) — captured in each brief's grounding section by the code session.
- **Drawn** = the existing **V2 prototype** (`docs/design/fad-v2/prototype/`) — the design direction so far.
- **Full-vision rule:** design the complete vision even where the backend isn't built yet — we'll build toward it. The only "don't build a screen" cases come from the scoping packs' explicit *out-of-scope*. (Honest *failure/stale/empty* states are different — always design those.)

## 4. Design system — match ours, and USE WHAT EXISTS
- **Stack:** Next.js 14 + Tailwind, static export. Match the existing FAD modules in nav/spacing/components; each module is a peer, not a separate app.
- **V2 skin:** dark token system in `frontend/src/app/fad/gm-desktop.css` (scoped `.dwrap`): `--bg #0a0d12`, `--indigo #4f72cf`, status green/red/amber/violet/teal, fonts Newsreader (serif) / Hanken Grotesk (ui) / JetBrains Mono. Shell = `GmShell` (`gm/kit.tsx`). Owner/portal-facing surfaces use Friday **navy #1F3864**, A4 doc look (logo top, navy headings).
- **⚠ Already built — design to USE these, do NOT design a parallel set:** the **AI trust-state vocabulary** lives in `frontend/src/app/fad/_components/ai/`: `TrustStates.tsx` (`SyncChip`, `Provenance`, `ConfBar`, `StateBanner`, `AITrustStrip`), `SourceTag.tsx` (`SourceTag` 6 kinds: guesty/breezeway/friday/modeled/stale/failed + `Field`), `aiHealth.ts` (`deriveAIHealth` → healthy/stale/partial/fallback/failed), `trustEnvelope.ts`. Plus the V2 state-matrix primitives in `_components/v2/States.tsx` (empty/loading/error/permission) and `GmShell`. *(The prototype references a `fad-states.jsx` "to build first" — it's already built as the above.)*
- **Multi-tenant + bilingual (EN/FR)** from day one; role-scoped views (owner portal = same app, role-scoped).
- **Responsive:** per the **FAD Mobile UX Doctrine** (Notion) — three surfaces: manager desktop, **manager mobile** (GM-on-phone), and the separate **field PWA** (task app). Plus tablet. Don't merge manager-mobile and field-PWA.

## 5. The five AI trust-states (this redesign's theme)
Every AI surface shows the real state, never "magic": **Healthy · Stale · Partial · Fallback · Failed** — derived
from **real backend signals** (confidence, sourceStatus/freshness, fallbackUsed, degraded, failed). The backend
already emits these; the design surfaces them (via the §4 components). On `failed`, mutating actions disable; on
`fallback`, answers are flagged "verify". Per-module signal→state mappings are in each brief.

## 6. Surfaces to design (full vision)
**Priority 1 (now):** Ask Friday (the cross-cutting AI spine) · Inbox · Operations.
**Priority 2:** Calendar · Properties · Reservations · Owners · Guests · Reviews · Training.
**Priority 3 (then "everything"):** Finance · Legal & Admin · Marketing · Leads · Analytics · Agency · Design module · HR · Settings · Tenant trio (Tenant Settings/Billing/Admin Analytics) · Syndic (brief exists).
**Cross-cutting:** login / onboarding / auth · "View as" role switch · global empty/loading/error/permission states · **notifications + emails** (team email + push types; guest/owner comms TBD) · the app **shell** (sidebar/header/nav/command palette).

## 7. Clash protocol
Design **must not silently choose** when its vision clashes with our current build. Flag each clash to Ishant with
options (design / current / hybrid / discuss). The code session maintains `clashes.md` as the running decision log.

## 8. What we want back
For each surface: designed FAD screens (desktop + manager-mobile + field-PWA where relevant) + the relevant
portal, P0 first, consistent with the V2 system above, **built on our existing components**, with the critical
states visibly represented, in a form buildable directly in Next.js + Tailwind. Propose options on the open
decisions rather than guessing.
