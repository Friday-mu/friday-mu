# FAD V2 — Overnight Autonomous Build Plan (MASTER)

Date: 2026-05-30 (overnight; Ishant unreachable — ACP rules)
Branch: `claude/fad-v2-ai-trust-states-20260530` (the V2 build branch) off `origin/fad-rebuild` @ `69e048d2`
Worktree: `/Users/judith/.codex/worktrees/fad-v2-ai-trust-states-20260530`
Design source (UPDATED bundle): `api.anthropic.com/v1/design/h/OZDMqf6tKRN24-5U1rSfkQ` → `/tmp/fad-design-v2/extracted/`
Key specs: `…/design_handoff_fad_v2/SPEC-Design-Module.md`, `…/SPEC-Remaining-Modules.md`, `README.md`, `chats/`.

## Mandate
Implement the V2 design across FAD autonomously. Quality + verifiability beat volume — a shipped,
building, committed slice beats three half-finished ones. Wake up to maximal *verified* progress.

## Iron rules (unsupervised safety)
1. Per slice: implement → `npx tsc --noEmit` → `npm run build` → **commit only if both green**. Never leave broken.
2. Blocked → park in this log + move on. Never loop waiting.
3. **Visual QA is parked by definition** (no headless logged-in sweep possible) — Ishant's gate before merge/deploy.
4. **No deploy. No merge to `fad-rebuild`.** Ops fleet active on the shared branch.
5. **Don't edit Ops-redesign-owned files except additively**: `OperationsModule.tsx` SettingsPage,
   `operations/TaskDetail.tsx` EvidencePanel, migrations 113/114, `gm/screens/*` Ops surfaces.
6. **Reconcile, don't rewrite.** Every module already exists in the repo (see matrix). Restyle to V2 +
   add the spec's provenance / AI-state / missing-feature aspects. Keep business logic. Wire real
   clients; missing backend → typed client boundary + `@demo:*` tag + `DEMO_CRUFT.md` row + park backend.
7. Naming: Ask Friday / Ask Friday Core / FridayOS. Git author: Judith Friday.

## Reality vs. the prototype (IMPORTANT)
The repo is **not** the prototype. Every module is already a built React component (see matrix). The
design bundle's HTML/JSX uses prototype classes (`.wiz-steps/.synalert/.synbar/.doc-a4/.portal/
.tdtimeline/.tdcheck/.tdphotos/.tddrawer` — NONE of these exist in repo `gm-desktop.css`; only
`.statc/.vseg/.pcodeD/.dtabs/.tbl/.bdg/.fai/.src*` do). So do NOT port prototype classes wholesale —
bring existing modules to the V2 look using the repo's token system + the new primitives below, and add
the spec's *content* (provenance, AI states, 17-stage workbench, etc.). The dark tokens already match
the design exactly (`gm-desktop.css :root`).

## ⚠️ Token-system gotcha (read before any module slice)
The repo has **two token systems**: (a) **V2** `--indigo/--green/--card/...` in `gm-desktop.css`
(used by the GM/Ops screens + my S1/S2 primitives), and (b) **legacy** `--color-*` / `--radius-*`
in `fad.css` (used by `InboxModule`, `inbox/DraftPanel.tsx`, `ai/AIComponents.tsx`, and most
business modules). My trust/provenance primitives are V2-tokened. **Do not naively drop V2
components into a legacy-tokened module** — it mixes two design languages. Each module slice =
migrate that module's surface to V2 tokens **and** wire the primitives, together. This is why
S3+ are real slices, not drop-ins. (Verified on `DraftPanel.tsx`, which is fully `--color-*`.)

## DONE (verified, committed, pushed)
- **S1 — AI trust-state vocabulary** (`c198d66e`). `ai/aiHealth.ts` (`deriveAIHealth` from real
  signals) + `ai/TrustStates.tsx` (SyncChip/Provenance/ConfBar/StateBanner/AITrustStrip) + CSS, wired
  into the global Ask Friday panel (`FridayDrawer`). tsc+build green.
- **S2 — Source/provenance primitive** (`5df91dc4`). `ai/SourceTag.tsx` (`SourceTag` 6 kinds + `Field`)
  + `.srctag`/`.field` CSS. The spec's §1.1 "build first" primitive. tsc+build green. (No consumer yet —
  wiring is per-module work below.)

## Cross-cutting primitives now available for every module slice
- `ai/TrustStates.tsx`: `SyncChip`, `Provenance`, `ConfBar`, `StateBanner`, `AITrustStrip`.
- `ai/aiHealth.ts`: `deriveAIHealth(signals)`, `confidencePct`, `provenanceItems`.
- `ai/SourceTag.tsx`: `SourceTag({kind})` (guesty/breezeway/friday/modeled/stale/failed), `Field`.
These are THE building blocks the specs say everything depends on. Every module slice = wire these in.

## BUILD ORDER (from SPEC-Remaining-Modules §"BUILD ORDER", adapted to repo reality)
1. ✅ Cross-cutting primitives (S1 trust states, S2 provenance). **DONE.**
2. **S3 — AI states onto remaining AI surfaces** (reuse S1, my lane, low collision):
   - `modules/TrainingModule.tsx` (Learnings/Sources tabs already show confidence — add Provenance +
     stale/failed/fallback on Sources).
   - `modules/inbox/DraftPanel.tsx` + TeamInbox path in `InboxModule.tsx` (draft confidence → ConfBar +
     Provenance + StateBanner; disable send on `failed`).
   - PARK Operations Daily Brief (`gm/screens/ops.tsx` — Ishant-owned; coordinate).
3. **S4 — Properties = the SPINE** (`PropertiesModule.tsx` + property record): add `Field`+`SourceTag`
   per field; tabs Overview · Commercial(Guesty) · Condition/Ops(Breezeway) · Finance · Reviews · Guests ·
   Documents · Ask Friday. Canonical detail other modules link into. (Big; restyle, don't rewrite.)
4. **S5 — Settings = integration control plane** (`SettingsModule.tsx` Integrations tab — additive, avoid
   Ishant's ops-settings work): per connector last sync · direction · owner · failure (`SyncChip`) · domains · link.
5. **S6 — Reservations** (`ReservationsModule.tsx` + `reservations/ReservationDetail.tsx`): V2 restyle of
   list + the 8-tab detail (do NOT rewrite folio/payments); `SourceTag` on commercial fields (the
   "Source: …guesty_reservations_current" field is the obvious first `SourceTag`).
6. **S7 — Agency** (`Tier3Modules.tsx` / new `modules/agency/`): biggest net-new. Prototype provided
   (`/tmp/fad-design-v2/extracted/fad-v2/project/fad-agency.jsx`). Tabs: Overview·Listings·Buyers·Sellers·
   Matches·Valuations·Opportunities·Deals. Portal-push toggles, AVM with `ConfBar`, AI matches. Typed
   client boundary; park backend (`/api/agency/*`).
7. **S8 — Design module 17-stage** (`DesignModule.tsx` + `modules/design/*` — already heavily built!):
   reconcile to SPEC-Design-Module.md. Pipeline = `1 Lead→…→17 Handover` state machine; stage rail;
   per-stage workbench (inputs/decisions/evidence/owner-output + Complete/Hold/Escalate, gated stages
   5/8/15); Budget/Procurement/Owner-review/Reconciliation tabs; owner-portal states (not-generated→
   draft→shared→viewed→approved→expired). Verify against the existing `modules/design/*` first.
8. **S9 — Leads/CRM-lite, Marketing, Legal & Admin** (`Tier3Modules.tsx`/`StubModules.tsx`): per
   SPEC parts 3–5. Pipelines, channel sync states, e-sign status, compliance checklist. Typed clients;
   park backends.
9. **S10 — Finance / Owners / Reviews / HR deepening**: Finance per-amount `SourceTag` + reconciliation
   workspace; Owners statement state badges + send gate; Reviews/HR "no synced data yet" vs real;
   HR leave-request queue.
10. **S11 — Tenant Settings / Billing / Admin Analytics** (`TenantSettingsModule.tsx`/`BillingModule.tsx`/
    `AdminAnalyticsModule.tsx`): per SPEC §6.5 (org config + module toggles; subscription/invoices;
    cross-tenant health). Payment-failed/usage-over-limit states.
11. **S12 — Mobile** (`.mphone` equivalents) for the restyled modules; **S13 — tablet** breakpoints.

## Per-slice protocol
1. Read the design screen (HTML/JSX in `/tmp/fad-design-v2/…`) + the existing repo module.
2. Reconcile to V2; reuse tokens + the S1/S2 primitives; keep logic; wire real client.
3. `npx tsc --noEmit` (0 errors) + `npm run build` (exit 0).
4. Commit (conventional + `Co-Authored-By`), push branch, update this log.

## Parking rules
- Visual QA → parked (Ishant). Missing backend → client boundary + `@demo:*` + park. Big-risk/needs-decision → park + continue.
- `node_modules` in the worktree is a real install (Turbopack rejects a symlink). Reuse it.

## Progress log
- [DONE] S1 AI trust states — `c198d66e`, green (wired into FridayDrawer / global Ask Friday panel).
- [DONE] S2 provenance primitive (`SourceTag`/`Field`) — `5df91dc4`, green.
- [DONE] **S4 Agency module** — `d4f76dfe`, green. Full V2 module via GmShell (Overview/Listings/
  Buyers/Sellers/Matches/Valuations/Opportunities), AVM uses `ConfBar`+`SourceTag`. Replaced the
  `agency` tease stub. DEMO_CRUFT PROD-AGENCY-1.

## ⚠️ KEY FINDING (changes the strategy for the next run)
Investigated every module: **they already exist** as built React components (Leads, Marketing,
Legal, Guests, Owners, Reviews, Finance, Properties, Reservations, Design, etc.) — almost all on
the **legacy `--color-*` token system** (ModuleHeader + `.card/.row/.chip`), NOT V2. The only
genuine greenfield stub was **Agency** (now built) and **Syndic** (a Q1'27 tease with no spec/
prototype in the bundle — skip). So:
- **Net-new greenfield is essentially exhausted.** Don't expect more "easy" modules.
- **Remaining V2 work = per-module token migration** (legacy `--color-*` → V2 `.dwrap` skin via
  GmShell) **+ wire the S1/S2 primitives**. Each is a real rewrite of a working module's view
  layer. **This needs visual QA** (desktop+mobile) which is NOT possible headless → it is NOT
  safe to do fully unsupervised. Do these WITH Ishant / with a deploy preview to eyeball each.
- Recommended next (supervised): Properties spine (S4 in build order), then Settings control
  plane, then Reservations detail — highest-value migrations. Use Agency (`AgencyModule.tsx`) as
  the reference for "a module rebuilt in V2 via GmShell".

## What a fresh autonomous run CAN still do safely (no visual-QA dependency)
- Extend the cross-cutting primitives (e.g., per-module Ask Friday contract config §1.3; reusable
  empty/loading/error/permission state components as V2 primitives).
- Backend client boundaries for net-new modules (typed `_data/agencyClient.ts` etc. + `@demo`),
  so the migrations later swap fixtures → API cleanly.
Everything that touches an existing module's visual layer should be supervised (visual QA gate).

## Notes / blockers carried
- Live visual QA blocked headless (needs deploy or authed dev server). Gate before any merge/deploy.
- Earlier evidence-upload POST still unverified (UI file sandbox); a logged-in tab remains in Ishant's Chrome.
- Claude Design gaps prompt saved: `docs/handover/2026-05-30-claude-design-gaps-prompt.md`. The updated
  bundle already answered it (Design + remaining-modules specs added) — gaps now largely closed in design.
