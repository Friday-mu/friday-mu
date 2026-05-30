# FAD V2 — Master Build & Finalization Plan

**Date:** 2026-05-30 · **Branch:** `claude/fad-v2-ai-trust-states-20260530` (off `origin/fad-rebuild`)
**Supersedes** `2026-05-30-fad-v2-overnight-build-plan.md` (keeps its findings; adds the Ask Friday
completion track, the finalization track, and an autonomy model that removes the visual-QA blocker).
**Specs (persisted, reboot-safe):** `docs/design/fad-v2/{SPEC-Design-Module.md,SPEC-Remaining-Modules.md,README.md,fad-agency.jsx}`.

---

## 0. Mandate
Bring **all** of FAD to V2 design fidelity, finish the **Ask Friday** system end-to-end, and **finalize**
(QA → merge → deploy) — executed autonomously, step by step. Quality + verifiability beat volume: a
shipped, building, self-QA'd, committed slice beats three half-finished ones.

---

## 1. The autonomy model — how "autonomous" is actually possible

The overnight run stopped at module migrations because *"visual QA can't be done headless."* This plan
removes that blocker with a **self-QA harness**, validated as the very first step.

### Self-QA harness (P0.2 — validate before trusting it)
1. `npm run dev` in the worktree `frontend/` (real `node_modules`; Turbopack OK).
2. **Auth without passwords.** Mint a `director`-role JWT locally via backend `signUserToken`
   (`JWT_SECRET` from `backend/.env`) → inject into `localStorage['gms_token']` with the browser tool.
   - Layout-only QA: a hand-built **decode-only** JWT is enough (frontend gates on a client-side decode
     of the token — `usePermissions`/`decodeJwtFadRole`). No secret needed.
   - Live-data/AI QA: the **signed** token authorizes **read-only** calls against the live backend.
3. Screenshot every migrated surface at **desktop 1440** and **mobile 375×812**, in each state, via
   Playwright (`browser_navigate`/`resize`/`take_screenshot`) or `Claude_Preview`. Compare to the design
   bundle screen + the **Agency** reference (`AgencyModule.tsx`). Iterate until it matches.

### What this buys, and the honest caveat
- Layout / token / state-matrix migration becomes **autonomously verifiable** (pixel + obvious-interaction).
- A screenshot does **not** catch every subtle data-wiring regression. So the risk posture is:
  **auto-commit each slice on the branch after self-QA + `tsc` + `build`; one consolidated human eyeball
  on the preview before MERGE / DEPLOY.** (Gate tightness = the one decision for Ishant — see §9.)
- **Harness fail-safe:** if the harness can't render an authed module screenshot (dev-server or data
  blocker), the autonomy bet is off for *visual* slices → park those for Ishant's eyeball, but still
  complete all non-visual work (foundations, Ask Friday logic, backend). Flag immediately.

---

## 2. Current state (grounded — from this session's audits)

**Done + on this branch** (tsc+build green, committed, **not merged/deployed**):
- S1 AI trust-state vocabulary (`ai/aiHealth.ts` `deriveAIHealth` + `ai/TrustStates.tsx`
  SyncChip/Provenance/ConfBar/StateBanner/AITrustStrip), wired into the global Ask Friday panel.
- S2 `ai/SourceTag.tsx` (`SourceTag` 6 kinds + `Field`).
- Agency module (`AgencyModule.tsx`) — full V2 via `GmShell`; the **reference implementation**.
- (Live + on fad-rebuild already: auth `fad_role` login fix, draft-ready push suppression, Breezeway pull.)

**Module token reality** (only Agency is V2; Operations is Mixed; rest legacy `--color-*`):
| Tier | Modules |
|---|---|
| **V2 (done)** | Agency |
| **Mixed** | Operations (mgr sub-pages V2 via `gm/screens/*`; overview+field legacy) — *Ops-fleet-owned, coordinate* |
| **Legacy, XL** | Inbox (+DraftPanel/TeamInbox), Finance, Design (+40 sub-files), Properties (PropertyDetail 1.9k), Reservations (ReservationDetail 1.9k) |
| **Legacy, L** | Calendar, Analytics, Reviews, HR, Tenant Settings, Billing |
| **Legacy, M** | Legal, Owners, Guests, Marketing, Leads, Intelligence, Admin Analytics, Ask-Friday-Review, Notifications, Training, Settings |
| **Stub/tease** | Syndic (Q1'27 tease, no spec → skip); dead `MODULE_TEASE.agency/.interior` blocks (delete) |

**Two AI-primitive sets** (a migration must *map*, not swap): legacy `ai/AIComponents.tsx`
(`AIBadge`/`AIConfidenceChip`/`AISuggestionCard`) → V2 `ConfBar`/`SourceTag`/`StateBanner`/`Provenance`.

**Ask Friday — 4 backends, 1 brand:**
| Surface | Frontend | Backend | V2 trust strip? |
|---|---|---|---|
| Global Ask Friday | `FridayDrawer.tsx`/`FridayFullscreen.tsx` | `POST /api/friday/ask` (`chat_proxy.js`) | **YES** (only one) |
| Inbox consult | `FridayConsult.tsx` | `POST /api/inbox/consult` | no |
| Ops consult | `OperationsModule.tsx` panel | `POST /api/operations/consult` | no |
| Legacy GMS consult | `ConsultChat.tsx` | `POST /api/ai/consult` (verify mount) | no |
| Draft generation | `DraftPanel.tsx` | `draft_generator.js` (`inbox.draft_ready`) | no |

Real signals: `fallbackUsed`, `contextSummary.sourceStatus[]`, model-band `confidence`. **Dead/faked:**
`source.freshness` hardcoded `'live'` (→ `stale` state never fires); drawer tool-step animation is cosmetic.
**Gaps:** trust strip on 1/5 surfaces; send not gated on `failed`; no enforced per-module context
contracts (one global system prompt); `focus` payload only `{module,threadId,team,url}`; confidence
fidelity mismatch (band vs numeric).

---

## 3. Work breakdown — phases → slices

Dependency-ordered. Each slice is independently shippable (self-QA + tsc + build → commit).

| Phase | Slice | Title | Auto? | Notes |
|---|---|---|---|---|
| **P0 Foundations** | P0.1 | Persist specs into repo | ✅ done | reboot-safe |
| | P0.2 | **Validate self-QA harness** | ✅ | gate for everything visual |
| | P0.3 | Cross-cutting primitives | ✅ | state-matrix components (Empty/Loading/Partial/Error/Permission/Stale) as V2; **trust-envelope adapter** (maps any of the 4 backends' signals → V2 vocab); **per-module Ask Friday contract registry** (§1.3 shape) |
| | P0.4 | **UI-version switch (Legacy ↔ V2)** | ✅ | `ui_version` (`v1`/`v2`) at the FAD shell; V2 modules render as a **parallel** set (new files), legacy frozen+runnable; persisted like `preferred_language` (localStorage now → user/tenant col later). The template-marketplace **seam**, not the engine |
| **AF Ask Friday** | AF1 | Real staleness signal **(DO FIRST)** | ⚙️ backend | `sectionSource` (friday.js:807) hardcodes `freshness:'live'` → the S1 strip is **stuck on healthy**. Emit freshness from real sync-age. *Deploy batched at F5.* |
| | AF2 | Gate send/act on `failed`/`fallback` + recovery | 🖼️ | wire `onRetry`/`onResync` in `FridayDrawer`; disable composer+actions on failed |
| | AF3 | Emit `focus` from modules | 🖼️ FE-only | backend `sanitizeFocus` (friday.js:115-153) **already parses the full envelope**; modules just emit it (focus-contract per-module shapes) |
| | AF4 | Per-module contracts (FE registry + consume allowlists) | 🖼️/⚙️ | server-side enforcement **already exists**; build FE registry + consume allowlists. Staff packs mostly **draft** → real grounding = Inbox/Ops/global today |
| | AF5 | Roll V2 trust strip onto other 3 surfaces | 🖼️ | Inbox `FridayConsult`, Ops consult (*coordinate*), legacy `ConsultChat` (*catalog update same commit*) via the adapter |
| | AF6 | Unify confidence numerics | ⚙️ | real numeric confidence across surfaces (band→% consistent) |
| **P2 Spine** | M1 | **Properties = SPINE** | 🖼️ | 8 tabs (Overview·Commercial[Guesty]·Condition/Ops[Breezeway]·Finance·Reviews·Guests·Documents·Ask Friday); `Field`+`SourceTag` per field; canonical detail others link into. ⚠️ per-field provenance must honor the **property field-classification** (DRAFT policy — Ishant approval gate before ANY public field exposure; codes/wifi never public) |
| | M2 | **Settings = integration control plane** | 🖼️ | per-connector last-sync·direction·owner·failure(`SyncChip`)·domains·link. *Additive — avoid Ishant's ops-settings work* |
| **P3 Records** | M3 | Reservations | 🖼️ | list + 8-tab detail; `SourceTag` on commercial fields; **don't rewrite folio/payments** |
| | M4 | **Design 17-stage** | 🖼️ | reconcile to `SPEC-Design-Module.md` against existing `modules/design/*`; stage rail, per-stage workbench (gated 5/8/15), Budget/Procurement/Owner-review/Reconciliation, owner-portal states |
| **P4 Business** | M5 | Legal & Admin | 🖼️ | Documents·Signatures·Compliance·Entities; Xodo states |
| | M6 | Marketing | 🖼️ | Listings-content·Channels·Promotions·Performance |
| | M7 | Leads / CRM-lite | 🖼️ | pipeline·qualify·convert-to |
| **P5 Deepen** | M8 | Finance deepening | 🖼️ | per-amount `SourceTag` + reconciliation workspace; **keep close-wizard logic** |
| | M9 | Owners | 🖼️ | statement state badges (draft→review→sent→viewed) + send gate; cross-link Finance |
| | M10 | Reviews + HR | 🖼️ | "no synced data yet" vs real; HR leave-request queue first-class |
| **P6 Surfaces** | M11 | Inbox (XL) | 🖼️ | DraftPanel + TeamInbox → V2; map legacy AI primitives |
| | M12 | Calendar | 🖼️ | V2 restyle |
| | M13 | Analytics | 🖼️ | V2 restyle (chart-heavy) |
| | M14 | Tenant trio | 🖼️ | Tenant Settings/Billing/Admin Analytics per §6.5 — **demo placeholders per Ishant, light touch** |
| | M15 | Operations (Mixed→V2) | ⚠️ | **Ops-fleet-owned on fad-rebuild — coordinate; additive only or defer** |
| | M16 | Training/Notifications/Ask-Friday-Review | 🖼️ | restyle + roll AI states into Training Sources |
| **P7 Responsive** | M17 | Tablet pass | 🖼️ | breakpoints for migrated modules (mobile folded per-slice) |
| **F Finalize** | F1 | Visual-QA sweep | 🖼️ | harness, desktop+mobile, all states |
| | F2 | DEMO_CRUFT reconcile | ✅ | every new fixture tagged + rowed |
| | F3 | Restamp + version bump | ⚙️ | clears the `88c0681f` stamp drift |
| | F4 | **Merge → fad-rebuild** | 🚦 go | coordinate with Ops fleet on shared branch |
| | F5 | **Deploy** | 🚦 go | Vercel preview auto on push; VPS prod manual |
| | F6 | Docs + catalog + git tag | ✅ | architecture/DEMO_CRUFT/ConsultChat catalog; tag clean ship |

Legend: ✅ fully auto · 🖼️ auto + self-QA · ⚙️ logic/backend (build+unit verified) · 🚦 needs Ishant go · ⚠️ coordinate.

---

## 4. Ask Friday completion detail (AF1–AF6)

**Reconciled (2026-05-30) against `ask-friday-master-plan-v02` + the AF contracts.** Key finding: the Ask
Friday **Core / harness backend is already built and deployed** (surface registry, server-side policy +
tool/action allowlists, context-pack publisher, eval/learning loop — `backend/src/ask_friday/*`,
`fad/friday.js`). What never existed is the **UI agent layer** — exactly what this AF track + the per-module
Ask Friday tabs build. AF *surfaces* the harness, it does not reinvent it. Contracts to honor verbatim:
`ask-friday-right-panel-focus-contract-2026-05-29` (focus envelope, IDs+summaries only, no raw DOM/secrets),
`…reservation-property-tool-contracts-2026-05-28` (mutations route through `action_request`,
`executionAllowed:false` — no direct booking/payment/channel writes), `…property-field-classification-2026-05-29`
(**DRAFT policy — Ishant approval gate** before any public field exposure).

Goal: one coherent, grounded, trustworthy assistant across every surface — real states, real provenance,
per-module grounding, no ungated commits.

- **AF1 staleness — DO FIRST.** `sectionSource` (`friday.js:807`) hardcodes `freshness:'live'`, so the S1
  strip already shipped is **permanently green** — the precise "fake success" the design exists to kill.
  Compute freshness per source family from real `synced_at`/`last_event_at` vs threshold → emit
  `stale|cached|expired|lagging`. Until this lands, no module should display the strip. *(backend; deploy at F5.)*
- **AF2 gating.** Disable composer Send + action buttons on `aiHealth==='failed'`; wire the dead
  `onRetry`/`onResync` recovery handlers. Mandated by the design README "Failed" state. *(coordinate: composer is shared.)*
- **AF3 focus — FRONTEND ONLY.** Backend `sanitizeFocus` (`friday.js:115-153`) already parses the entire
  envelope and the page-focus prompt rule is live. Modules only need to **emit** `{view, focusedObject,
  selection, visibleState, allowedActions, privacyClass, route, surfaceId}` — IDs + compact summaries only.
  Per-module shapes from the focus contract: Inbox `threadId`+`focusMessageId`; Ops task IDs + date/staff
  filters; Reservations reservation IDs + date window; Properties property/listing codes.
- **AF4 contracts — consume, don't reinvent.** Server-side enforcement already exists (surface registry
  `allowed_tools`/`allowed_actions`/`allowed_knowledge_scopes` + merged validation PR). Build the **frontend**
  registry `{groundsIn, canDraft, gatedActions, citations}` and consume the existing allowlists. Most staff
  shells have **draft, not published** packs → real per-surface compiling applies to Inbox/Ops/global today;
  others render draft/ungrounded.
- **AF5 unify strip.** Drop the V2 trust strip on Inbox/Ops/legacy consult via the P0.3 envelope adapter.
  `ConsultChat` is catalogued → update its catalog entry same commit. *(coordinate: inbox/ops consult shared.)*
- **AF6 confidence.** Surface a real numeric confidence consistently (consult/draft already compute one;
  feed `/api/friday/ask` a computed value rather than model self-report where possible).

**Acknowledged out-of-AF-scope** (already deployed, Ishant-review-gated, or another repo — AF ≠ "all of Ask
Friday done"): eval-mining/analyzer operating cadence (Plan 2/6), KB harness factory + per-surface subplans
(Plan 3), feedback retention/redaction (drafted, unapproved), owner-positioning rules, Website public wiring
(separate repo). The Properties spine (M1) will hit the **field-classification approval wall** — a Ishant gate.

---

## 5. Per-module migration protocol (every M-slice)
1. Read the design screen (`docs/design/fad-v2/` spec + bundle JSX) **and** the existing repo module.
2. **Build V2 as a PARALLEL component — never mutate the legacy file.** Create `modules/v2/<X>Module.tsx`
   reusing the legacy module's `_data`/hooks/clients (shared logic, V2 view only); register it in the v2
   template map (P0.4). Legacy `modules/<X>Module.tsx` stays frozen + runnable under `ui_version='v1'`.
   In the V2 view: `GmShell`/`.dwrap`/`gm-desktop.css` tokens, **map** legacy AI primitives → V2 trust
   primitives, add the spec's content (provenance per field, the 5 AI states, missing features), wire the
   module's Ask Friday contract (P0.3) + real `focus` (AF3). Where there's no real legacy UI (e.g. Agency),
   v1 and v2 point at the same component.
3. Missing backend → typed client boundary + `@demo:*` tag + `DEMO_CRUFT.md` row (same commit) + park backend.
4. Build the full **state matrix** (empty/loading/partial/error/stale/permission) + the **mobile** breakpoint.
5. `npx tsc --noEmit` (0 errors, filter to `fad/`) + `npm run build` (exit 0).
6. **Self-QA** (desktop 1440 + mobile 375×812, all states) via the harness; compare to spec + Agency + the
   legacy `v1` view side-by-side (toggle `ui_version`).
7. Commit (conventional + `Co-Authored-By: Judith Friday`), push branch, tick the progress log.

---

## 6. Finalization track (F1–F6)
- **F1** full visual-QA sweep across migrated modules (harness).
- **F2** `grep -r "@demo:"` the diff vs `DEMO_CRUFT.md` — every tag has a row; nothing untagged.
- **F3** restamp/version-bump so the live stamp reflects running code (clears `88c0681f` drift).
- **F4** merge → `fad-rebuild` — **Ishant go** (Ops fleet shares the branch; reconcile 3-layer first).
- **F5** deploy — Vercel preview auto on push; VPS prod (`rsync` + `pm2 restart fad-backend`) manual — **go**.
- **F6** update `docs/architecture.md` + `DEMO_CRUFT.md` + ConsultChat catalog entry; tag the clean ship
  (`fridayos-s[N]-v0.[N].0`); generate the next-session status prompt.

---

## 7. Iron rules (autonomous safety)
1. Per slice: implement → self-QA → `tsc` → `build` → **commit only if green**. Never leave broken.
2. Blocked → park in the progress log + move on. Never loop waiting.
3. **No merge to `fad-rebuild`, no prod deploy** without Ishant's go. Backend live-deploys (AF1/AF4) need go.
4. **Don't edit Ops-redesign-owned files except additively:** `OperationsModule.tsx` SettingsPage,
   `operations/TaskDetail.tsx` EvidencePanel, `gm/screens/*`, migrations 113/114. Coordinate on M15 / Ops consult.
5. **Access-control changes are never mine** (none required by this plan).
6. Catalogued features (`ConsultChat`) → update the catalog entry in the same commit.
7. Naming: Ask Friday / Ask Friday Core / FridayOS. Git author `Judith Friday <judith@friday.mu>`.
8. New demo fixtures → `@demo:*` tag + `DEMO_CRUFT.md` row, same commit.

---

## 8. Progress log
- [DONE] S1 trust states `c198d66e` · S2 SourceTag/Field `5df91dc4` · Agency `d4f76dfe` · auth/notif fixes (live).
- [DONE] P0.1 persist specs → `docs/design/fad-v2/` (`501a6b66`).
- [DONE] P0.2 self-QA harness validated (dev server + decode-only director JWT + Playwright screenshots desktop+mobile).
- [DONE] P0.4 UI-version switch (Legacy↔V2, live-selectable) — `be017169`; tsc+build green, toggle persists, legacy fallback verified.
- [DONE] P0.3 cross-cutting V2 primitives — `75ac0c8c` (trust-envelope adapter, state-matrix views, AF contract registry).
- [DONE] AF1 staleness signal (backend) `08770cac` · AF2 gate-on-failed + recovery `7a65199f` · AF3 focus envelope `9bfd50ff`.
- [FOUNDATION DONE] AF4 (FE registry = P0.3) + AF5 (trust adapter = P0.3): per-surface consumption folds into each
  M-slice (live-selectable → V2 surfaces, never legacy). AF6 satisfied-by-design (real numeric for consult/draft,
  honest band for global; no fabricated precision).
- [DONE] M1 Properties spine (V2, parallel) — `PropertiesModuleV2` + FadApp registry; tsc+build green; harness QA desktop+mobile+error. OPEN: wifi_tech masking decision (Ishant). **PAUSED for review.**
- [ ] M2–M17 (pause after each) · F1–F6.

---

## 9. Decisions (resolved 2026-05-30)
1. **Gate:** *Pause after each module.* Foundations (P0) + all Ask Friday (AF1–6) run fully autonomous,
   no per-step pause. Each module migration (M1+) stops for Ishant's eyeball before the next starts.
2. **M15 Operations:** *In scope — I do it.* The Ops-redesign session is merged into this one, so there is
   no concurrent fleet to collide with. Migrate Ops sub-pages additively + logic-preserving anyway.
3. **Backend deploys (AF1/AF4):** build on branch now, **batch the deploy at F5**.
4. **Tenant trio (M14):** light-touch restyle only, **no real wiring** (demo placeholders).
5. **Preserve old UI = live-selectable** (Ishant, 2026-05-30). V2 ships as a **parallel** component set behind a
   `ui_version` switch (P0.4); legacy frozen + runnable + user-selectable. Default `v1` during the build, flip
   default to `v2` after QA. This is the **seam** for a future per-tenant template marketplace — which we do
   **not** build now (premature; maintenance multiplier). Widen the enum→registry only when real demand appears.

### UI-version architecture (P0.4)
- `ui_version: 'v1' | 'v2'`. Persisted `localStorage['fad:ui_version']` now (`@demo:state`), user/tenant column
  later mirroring `preferred_language` (session.js precedent).
- FAD shell (`FadApp` `renderModuleInner`) consults a **template registry** `{ v1: legacyMap, v2: v2Map }`;
  per module render `v2Map[key]` if present + `ui_version==='v2'`, else fall back to legacy → modules migrate
  incrementally; un-migrated modules auto-fall-back to legacy with zero breakage.
- V2 components live in `_components/modules/v2/` (one "template" dir = the marketplace seam).
- A user toggle (Settings → Appearance) flips `ui_version`. `@demo:state` until the backend column lands.

---

## 10. Post-reconcile findings (2026-05-30)
- **Trunk confirmed = `fad-rebuild`** (Ishant + `docs/deploy.md:146`). Live admin.friday.mu = fad-rebuild @ `88c0681f`
  (VPS rsync, FE+BE paired; NOT Vercel). `fad-design-os-v01-frontend` = stale divergent line (last commit 2026-05-21)
  → archive/reference only; repoint or decommission the Vercel project. V2 branch reconciled forward onto trunk
  (`32faff85`), clean (the 2 trunk fixes auto-merged — equivalents already present).
- **Guest portal #9 (FAD side) = DONE + LIVE:** `/api/public/stays/resolve` (Portal v2 — claim + resolver +
  reservation-mode envelope + booking-proof) in `backend/src/public/portal.js`, mounted, present at live `88c0681f`.
  The `/stay/[token]` page + un-gating ("on its way") is the website (friday.mu) repo's job — separate codebase.
- **Ops boundaries (from `2026-05-30-fad-redesign-ops-handover.md`):** Ops owns migrations 113/114,
  `/api/tasks/:id/attachments`, `/api/operations/settings`, `OperationsModule` SettingsPage, `gm/screens/*`,
  `gm/kit.tsx`, `operations/TaskDetail.tsx`. **M2 (Settings integration control plane) = the FAD `SettingsModule`
  Integrations tab — a different surface, no collision.** Reservations/Calendar are clear to start.
- **New Ask-Friday-lane TODOs discovered (mine, sessions merged) — queue as AF7/AF8:** (a) GM Ask-panel / FridayBar
  action buttons (`gm/kit.tsx` AskPanel — `@demo:ui` PROD-GM-ASKPANEL-1) → wire to real Core actions + failed-state UI;
  (b) Operations TaskDetail `AISuggestionRow` "Accept" applies nothing — needs the suggestion action payload (Core contract addition).
- **Inbox split (ops handover §5):** resolved by consolidation — this lane now owns both the guest Inbox shell AND
  Inbox-Consult / Ask-Friday panel / TeamInbox (M11).
- **`missingStaffContextPackDrafts: 1` — PARKED.** One active Ask-Friday surface lacks a staff context-pack DRAFT
  (flag `missing_staff_context_pack_draft`, `ask_friday/index.js`). Resolving = author + save a draft pack for that
  surface (governance decision via the Core publisher; needs the surface id from live `/readiness` + content/approval)
  — not a code fix, not a V2 deploy blocker (pre-existing Core state; V2 ships behind the legacy default).
- **Hygiene:** `git diff --check` clean (stripped trailing whitespace in the persisted design spec); retired-name
  scan ("OS Friday") clean across the V2 diff.
