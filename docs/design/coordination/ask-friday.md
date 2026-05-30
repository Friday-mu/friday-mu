# Ask Friday — Design Brief for Claude Design (the AI spine)

> **What this is.** A design-layer brief for the **Ask Friday** experience across FAD / FridayOS. It sits on
> top of, and does not replace, the **Ask Friday Intelligence Master Plan**
> ([Notion 36c43ca884928123bc72ceb547efe1a2](https://www.notion.so/36c43ca884928123bc72ceb547efe1a2)) and its
> v0.2 execution tree ([36c43ca88492815d9644e44b14a297d0](https://www.notion.so/36c43ca88492815d9644e44b14a297d0)),
> which stay the source of truth for the agent architecture, surface registry, memory model, and learning loop.
> This brief turns that into a **design problem**: where the assistant appears, how it expresses scope and trust,
> how it acts with approval, and which real states the UI must make legible.
>
> **Read this right after `00-README`.** Ask Friday is the cross-cutting spine — Inbox, Operations, Calendar,
> Properties, Reservations, Owners, Guests, Reviews and the rest all *embed* it. The trust-state vocabulary and the
> panel / full-page / palette patterns defined here are reused by every module brief. Design these once, well.

## 1. The brief in one line
Design Ask Friday as the **intelligence layer expressed across FAD** — a full-page surface aware of every module, a
context-aware panel that lives in the right rail of every screen, the command-palette / search / FAB entry, the
AI-filtered notifications surface, and the scoped per-module assistants — **one assistant, many scopes, that always
shows its sources, always shows how confident it is, and never mutates anything without approval.**

## 2. Source of truth and grounding (three-way reconcile)
- **Vision** = the **Ask Friday Intelligence Master Plan** + v0.2 execution tree (the north star: Mind / Body /
  Growth architecture, the 16-surface registry, memory typing, learning loop, eval gates). Plus the **Ops
  Scheduling/Roster/Task Policy** and the **Inbox Sprint** packs for the scoped surfaces. **Design to these; don't
  re-derive.** Core principle (Master Plan, Executive Position): *"The UI should express the agent architecture. It
  should not define the agent architecture."*
- **Reality** = our **code, already built**. This is unusually mature — the trust vocabulary, the consult surfaces,
  and the Core control-plane all exist in the repo. See §4 and §6.
- **Drawn** = the **V2 prototype** (`docs/design/fad-v2/prototype/`): `ScreenAskFull` (full-page, in
  `fad-desktop-screens.jsx`), `AskPanel` (the reusable right-rail panel, in `fad-desktop.jsx`), `ScreenNotifsMgr`
  (AI-filtered notifications), the ⌘K search-bar / sidebar "Ask Friday" entries, the mobile Ask Friday screen
  (`fad-mobile-screens.jsx`), and `FAD Manager - Ask Friday.html`.
- **Full-vision rule:** design the complete assistant even where a given scope's backend isn't built yet (owner,
  guest, finance assistants are spec-stage) — we build toward it. The honest **failed / fallback / stale** states
  are *not* "future" — always design those.

## 3. Who uses it — one brain, many scopes
Ask Friday is the same assistant everywhere, but **what it can see and do changes by surface**. That scoping *is*
the design problem — a public website FAB and a finance assistant must not look or behave identically. The Master
Plan's **Surface Registry v0.2** defines the scopes; the FAD-internal ones are this brief's focus.

| Surface (registry id) | Audience | Knowledge scope | Can act → | Memory |
|---|---|---|---|---|
| **Full-page Ask Friday** (`fad` global, `/api/friday/ask`) | director / manager | all modules in role scope | draft + propose actions across FAD | durable, team-visible |
| **`fad_consult`** (Inbox) | staff | inbox, reservation, property, teachings | draft reply · task candidate · KB candidate | durable team-visible (live) |
| **`fad_ops_assistant`** (Operations) | staff / ops | tasks, schedule, reservations, properties, runbooks | draft/create task · approval request | durable team-visible (live; live key is `ops-consult` — alias) |
| **`fad_finance_assistant`** | restricted staff (director) | finance workflow, owner statements, VAT/tax | finance candidate · approval request | restricted need-to-know (spec) |
| **`fad_legal_admin_assistant`** | restricted staff | contracts, compliance, filings | draft doc/task · approval request | restricted (spec) |
| **`fad_hr_training_assistant`** | staff / managers | SOPs, training, roles | training task/candidate | staff-scoped (spec) |
| **`fad_owners_assistant`** | staff (owners later) | owner records, terms, statements | draft owner reply · action request | owner-scoped (spec) |
| **`fad_analytics_intelligence`** | director / Ishant | aggregate metrics, evals, learning loop | candidate · report | aggregate (spec) |
| **`guest_portal_ask_friday`** | stay guests | stay guide, property guide, Mauritius | request help · handoff | stay-token scoped (portal, **not FAD**) |
| **`website_*` FAB / hero / enquiry / feedback** | public | public packs | request booking · feedback · handoff | session-only (**website, not FAD**) |
| **`public_mcp`** / **`internal_agent_bridge`** | external / internal agents | public packs / sanitized | action request / candidate only | disabled-in-V1 / sanitized (no UI in FAD) |

**For this brief, design the FAD-staff surfaces** (rows 1–8). The website / portal / MCP surfaces share the same
brain and trust vocabulary but live in other codebases — note the consistency, don't design their screens here.

**Roles inside FAD** (authoritative in `permissions.ts`): **Director** sees all scopes incl. finance/legal amounts.
**Manager** (ops_manager + commercial_marketing, identical) gets the operational scopes but **finance amounts and
team/role admin are director-only**. **Field** uses the mobile task PWA, not the manager assistant.

## 4. Design principles and system — and USE WHAT EXISTS
- **Express the architecture, don't reinvent it.** Friday is the intelligence layer surfaced in the UI, not a
  chatbot bolted on. Scope, provenance, confidence and the approval gate are first-class, always visible.
- **One assistant, many scopes.** The same visual identity (the `spark` mark, indigo `--indigo #4f72cf`) across the
  full-page, the panel, the palette and every module — differentiated by a visible **scope chip** ("All of FAD" vs
  "GBH-B4" vs "this reservation"), never by looking like a different product.
- **Honesty over magic — the five trust-states are the theme** (see §7). Every AI answer shows its real state.
- **⚠ Already built — design to PLACE these, do NOT design a parallel set.** This redesign's AI vocabulary is
  already in the repo (`frontend/src/app/fad/_components/`):
  - **`ai/TrustStates.tsx`** — `SyncChip`, `Provenance`, `ConfBar`, `StateBanner`, `AITrustStrip`.
  - **`ai/SourceTag.tsx`** — `SourceTag` (6 kinds: guesty / breezeway / friday / modeled / stale / failed) + `Field`.
  - **`ai/aiHealth.ts`** — `deriveAIHealth(signals)` → `healthy | stale | partial | fallback | failed` (precedence
    failed > fallback > partial > stale > healthy).
  - **`ai/trustEnvelope.ts`** — maps any AI backend's response into the strip. **`ai/useAITelemetry.ts`** — telemetry.
  - **`FridayDrawer.tsx`** (the right-rail / drawer panel), **`FridayFullscreen.tsx`** (the full-page surface),
    **`FridayConsult.tsx`** (embedded consult), **`FridayCards.tsx`** (draft / action / teaching cards),
    **`_components/v2/States.tsx`** (empty / loading / error / permission), and the `GmShell`.
  - **`_data/fridayClient.ts` + `_data/askFridayContracts.ts`** — the **focus envelope** (`AskFridayFocus`:
    surfaceId / route / view / focusedObject / selection / visibleState / allowedActions / privacyClass /
    stalenessMs), `buildAskFridayFocusFromLocation` (derives the surfaceId via `contractFor`), and `mergeFocus`.
    *(The panel in `PropertiesModuleV2.tsx` already wires this — that's the pattern to spread.)*
  - *(The prototype references a `fad-states.jsx` "to build first" — it's already built as the above.)*
- **Scope is contextual and visible.** The panel knows what surface/object it's focused on (the focus envelope). The
  UI must show "what can Friday see and do **right now**" — the scope chip + an "aware of: …" line (the prototype's
  `afp-aware`).
- **Bilingual EN/FR**, **multi-tenant**, **role-scoped** from day one (locale matches the conversation).

## 5. Information architecture — the entry modes
Ask Friday is reached **four ways**, all the same assistant:
1. **Full-page** ("Ask Friday", aware of every module) — `FridayFullscreen` / `ScreenAskFull`. Opening state =
   a proactive brief ("This morning: 32 tasks, 3 reports to approve…") + grouped starter prompts (by module) +
   one compose bar. Reached from the sidebar, ⌘K, and the FAB.
2. **The context panel** — `FridayDrawer` / `AskPanel`, a thin right-rail panel that appears **inside every
   module**, scoped to the current surface and selected object, and **can act on the page** (e.g. on a Reservation:
   "3 open inquiries — Friday drafted replies & can convert to bookings on approval").
3. **Command palette / search bar / FAB** — the "Search or **Ask Friday**… ⌘K" omni-entry in the header, plus the
   floating FAB. Typing routes to full-page or panel by intent.
4. **Scoped per-module assistants** — Inbox Consult, Ops Assistant, Finance Assistant, etc. (§3). These are the same
   panel/full-page patterns bound to a narrower scope + a module-specific knowledge pack. Module briefs detail each.

Plus two cross-cutting surfaces Friday owns:
- **Notifications** (`ScreenNotifsMgr`) — Friday **filters** the firehose ("muted 3,847 low-signal alerts; surfaced
  the 6 that need a manager"). An AI surface in its own right: it must show *why* something surfaced and what was
  muted, reviewably.
- **History / sessions** — past conversations, durable + team-visible where authorized (the "History" action on the
  full-page).

And one **staff governance** surface (Master Plan Phase 5–6, the prototype's Training → *"Govern how Friday learns &
acts"*): the **learning console** — candidate queue, eval results, context-pack publish/retire, surface registry.
Likely homed in **Intelligence** (or Settings/Training). See §6 P2.

## 6. Surfaces to design (full vision) — P0 first
For the agent contracts behind each (surface_registry / action_request / context_pack / learning_event), see the
Master Plan "Contract Direction". **Reality tag:** LIVE = backend exists & wired · CORE = control-plane deployed,
UI maturing · SPEC = designed-toward, no backend yet.

| # | Surface | Primary user | Purpose & key content | Reality | Priority |
|---|---|---|---|---|---|
| A | **Full-page Ask Friday** | director / mgr | Proactive daily brief + module-grouped starters + compose; answers with provenance + confidence; suggests cross-module actions (Approve / Tweak). | LIVE (`/api/friday/ask`) | **P0** |
| B | **Context panel (in-module)** | director / mgr | Right-rail, scope-chipped, focus-aware, acts on the current object; draft cards, action cards, "done" confirmations. The pattern every module embeds. | LIVE (drawer + focus envelope) | **P0** |
| C | **Trust-state placements** | all | Where `AITrustStrip` / `SyncChip` / `Provenance` / `ConfBar` / `SourceTag` sit on a message, a draft, a panel header, a KPI. The reusable kit, in situ. | BUILT — place it | **P0** |
| D | **Command palette / search / FAB** | all | ⌘K omni-bar (search ⇄ ask), floating FAB, routing by intent; the always-available entry. | LIVE | **P0** |
| E | **Action / approval card** | director / mgr | The moment Friday proposes a mutation: what it'll do, on what, reversibility, Approve / Tweak / Reject; the draft-vs-applied + undo states. | LIVE (cards) | **P0** |
| F | **Notifications (AI-filtered)** | director / mgr | "Needs you / Today / Muted" segments; per-item reason + jump-to-action; the "muted N low-signal" reviewable drawer. | LIVE (rules demo) | **P1** |
| G | **History / sessions** | staff | Past conversations, durable + team-visible where authorized; resume; scope per conversation. | CORE | **P1** |
| H | **Scoped module assistants** | per role | Inbox / Ops (live), Finance / Legal / HR-Training / Owners / Analytics (spec) — the same patterns at narrower scope + module pack. Detailed in module briefs. | LIVE (Inbox, Ops) / SPEC (rest) | **P1** |
| I | **Teaching flow** | staff | "Teach Friday" → candidate captured → shows it's pending review, not instant truth. | LIVE (inbox teachings) | **P1** |
| J | **Learning / governance console** | director / Ishant | Candidate queue (KB / behavior / eval), eval results, context-pack draft→publish→retire, surface registry view. Risk/trust tiers visible. | CORE (`/api/ask-friday/core`; publish UI has known contract gaps to fix) | **P2** |
| K | **Handoff / takeover** | staff | AI ↔ human handoff: reason for escalation; "Take over AI" (real mutation); after takeover, AI stops replying. Strongest on Inbox/website. | LIVE (inbox/website) | **P2** |
| L | **Owner / guest / public variants** | owner / guest / public | Same brain at owner-portal / stay-portal / website scope. Note consistency; **screens live in portal/website**, design there. | SPEC / elsewhere | **P2** |

## 7. Critical states the UI must make legible
The redesign earns its keep by making the agent's real state obvious, never "magic". Bind to **real backend
signals** — don't invent.

**The five trust-states** (`deriveAIHealth`, precedence failed > fallback > partial > stale > healthy):
- **Healthy** → grounded answer, confidence in the high band, sources loaded → green `SyncChip` + `Provenance`
  ("Grounded in: reservation {code}, {property}, N teachings") + `ConfBar`.
- **Stale** → context cache aged / SSE dropped / `synced_at` past threshold (>30m lagging, >2h stale, >24h expired)
  → amber + "Re-sync".
- **Partial** → answer returned but a source is missing (reservation null / availability absent / consult ran with
  `missingKnowledge`) → amber; `Provenance` *names which source is missing*.
- **Fallback** → `metadata.fallbackUsed` / compact-fallback / no-KB (confidence ~ mid band) → indigo "general
  guidance — verify"; anything sent from a fallback draft is flagged for review.
- **Failed** → generation/send failed, `metadata.degraded` / `modelTimeout`, 5xx, or model-unavailable
  **deterministic fallback** ("model unavailable — ran the safe local planner") → red banner *naming which service*;
  **mutating actions DISABLE**, only Retry / navigate stay live.

**Other first-class states:**
- **Draft-vs-applied** — Friday *proposes*; nothing mutates until **Approve**. Show pending → applied → **undo**
  (5s on sends). This is the core trust gesture; it appears on every action card, the schedule "drafted the day",
  approvals triage, owner-statement send.
- **Confidence is a BAND, not a number.** The backend emits a heuristic band (e.g. 0.2 / 0.55 / 0.62 / 0.78 / 0.82),
  **not a calibrated percentage.** Show high / medium / low (or a qualitative label) — **not "92%"** (the prototype's
  `conf. 92%` is false precision → see clash in §12).
- **Scope / permission** — what's in scope now (the scope chip + "aware of…"), and what's gated (finance amounts to a
  manager, sensitive codes, restricted KBs) → render the `permission` state, don't silently omit.
- **Memory / session** — durable team-visible vs session-only; "Friday remembers this thread" vs not; whose history.
- **Pending review** (teaching / candidate) — "captured — pending review", never "learned ✓" instantly.
- **Handoff / takeover** — escalation reason; after a human takes over, the AI visibly stands down.

## 8. Key flows to storyboard
1. **Ask across FAD:** open full-page → proactive brief → ask or pick a starter → grounded answer **with provenance +
   confidence band** → suggested cross-module action → **Approve / Tweak** → applied + undo. (Failed-model path: red
   banner, Retry, actions disabled.)
2. **Act on the page (panel):** in a module, open the context panel → it's scope-chipped + focus-aware → it proposes
   an action on the focused object (draft replies, convert inquiry, rebalance roster) → Approve / Tweak → done card.
3. **Handoff / takeover:** AI flags low confidence / escalation reason → staff "Take over AI" → AI stops replying →
   staff continues.
4. **Teach Friday:** staff corrects / "learn this" → candidate captured (pending review) → later approved in the
   console → published context pack → surfaces consume it.
5. **Govern (console):** candidate queue → eval run (pass/fail) → approve → context-pack draft → **publish** → live;
   failed eval returns to the queue. Risk/trust tiers and the draft/published/retired lifecycle are visible.
6. **Triage notifications:** Friday filtered the firehose → "Needs you (N)" surfaced with per-item reason + jump →
   "Muted (3,847)" reviewable on demand.

## 9. Reference artifacts (design against real shapes)
- **Prototype:** `ScreenAskFull` (full-page), `AskPanel` (right-rail), `ScreenNotifsMgr` (notifications), the ⌘K bar
  + sidebar/FAB entries, mobile Ask Friday — all in `docs/design/fad-v2/prototype/`.
- **Built components:** the `ai/` trust kit, `FridayDrawer` / `FridayFullscreen` / `FridayConsult` / `FridayCards`,
  `v2/States.tsx`, `GmShell`, `fridayClient.ts` + `askFridayContracts.ts` (the focus envelope).
- **Live backends:** `/api/friday/ask` (global), `/api/inbox/consult`, `/api/operations/consult`; **Ask Friday
  Core** at `/api/ask-friday/core` (migration 074, scheduler, review module). *(Legacy `/api/ai/consult` is GMS-era
  history — not a current FAD surface.)*
- **Contracts** (Master Plan): `surface_registry`, `learning_event`, `kb_candidate`, `context_pack`, `action_request`
  — the JSON shapes the console and action cards render.

## 10. Recommended design priority
1. **The spine first (A–E):** full-page, the context panel, the trust-state placements, the palette/FAB, and the
   action/approval card. Everything else reuses these. Get the scope chip, provenance, confidence band, and the
   draft→approve→undo gesture exactly right.
2. **Then F–I:** AI-filtered notifications, history/sessions, the scoped module-assistant variants, the teaching flow.
3. **Then J–L:** the learning/governance console, handoff/takeover polish, and the owner/guest/public variants
   (consistency only — those screens are built in the portal/website, not here).

## 11. Out of scope (v1)
- **Owner / guest / public / MCP screens** — share the brain + vocabulary but are built in the portal/website
  codebases; design here only the *consistency contract*, not the screens.
- **Direct irreversible mutation without approval** — every write is a draft/request behind Approve; no "auto-send".
- **Finance / legal / owner-sensitive assistant bodies** — design the shell + states, but their knowledge ingestion
  and need-to-know redaction are locked behind access rules (Master Plan "Blocked by decisions").
- **Durable cross-surface guest memory**, **internal-agent-bridge UI**, and the **hosted public MCP** — design-only /
  later.
- **Calibrated confidence %** — we surface bands, not a trustworthy percentage; don't design a precise meter.

## 12. Open decisions (propose options, don't guess)
1. **Confidence display** — band (high/med/low) vs qualitative label vs a coarse meter. **Clash:** the prototype shows
   `conf. 92%`; our backend emits a heuristic band. Recommend dropping the number → flag to Ishant (design / current /
   hybrid). *(Logged in `clashes.md`.)*
2. **Panel home** — right-rail drawer (current `FridayDrawer`) vs slide-over vs both per surface? Does the panel
   persist across navigation or open per-object?
3. **Scope chip model** — how granular ("All of FAD" → module → object), and can the user widen/narrow scope inline?
4. **Governance console home** — ~~Intelligence vs Settings vs Training?~~ **RESOLVED** (`training.md` §4): **Training**
   = manager teach-and-approve cockpit; **`ask-friday-review`** (director-only) = the deep Core console (surface
   registry / context-pack publish / evals); **Intelligence** = read-only commentary.
5. **Notifications** — its own module/route vs a header tray vs both? How much of "muted" to expose by default?
6. **History/memory exposure** — how much session memory to show the user; per-conversation scope controls.
7. **The `ops-consult` ↔ `fad_ops_assistant` alias** — purely backend, but if surface ids ever show in the console UI,
   present one name. Don't rename live keys.
8. **Proactivity dial** — how forward should the daily brief / "Friday suggests…" be before it's noise? (ties to
   notifications filtering.)

## 13. What we want back
The Ask Friday **spine**: the full-page surface, the in-module context panel, the command-palette/FAB, the
action/approval card, and the trust-state placements — desktop + manager-mobile — **built on the existing `ai/` kit
and `Friday*` components**, with the five trust-states and the draft→approve→undo gesture visibly represented, in a
form buildable directly in Next.js + Tailwind. Then notifications, history, the scoped module variants, and the
governance console. Propose options on §12 rather than guessing; flag every clash with our current build to Ishant
per `00-README` §7.
