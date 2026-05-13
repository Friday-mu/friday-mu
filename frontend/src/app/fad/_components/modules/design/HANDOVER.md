# Friday Design OS — handover (post cont-32 + cont-33 polish)

> **Read first:** [`README.md`](README.md) — full per-commit narrative
> through cont-32. This file is the short pickup-where-you-left-off note
> for the next session.

## TL;DR ship state

**Module is feature-complete as a frontend-only deliverable.** Next
mandatory step is **backend wiring**. Every accessor on `designClient`
(`_data/design.ts`) has the shape that the v0.2 fetch client must
return — preserve those shapes when you swap.

- 18-stage state machine intact in `design.ts` (UI collapses to 5
  phases via `PHASES`).
- Owner portal lives at `/portal/projects/[slug]` (real Next.js route)
  AND inline in `OwnerPortalPreview` modal; both share
  `portal/PortalContent.tsx`.
- Magic-link auth is mocked HS256 (`/portal/auth?token=...`),
  permanent (10y TTL), delivered via WhatsApp + email per the locked
  decision.
- 82 vitest specs (mutators + lastSeen). `npx tsc --noEmit` clean,
  `npm run build` clean.
- Demo cruft tagged with `// @demo:*` against `frontend/DEMO_CRUFT.md`
  (`PROD-DESIGN-1..5` + `PROD-DESIGN-AI` + `PROD-DESIGN-ANALYTICS`).
  Run `grep -rn "// @demo:" frontend/src/app/fad/` before backend swap.

## What this session changed (cont-33 polish — not numbered as a
sprint commit, just inline tweaks)

1. **Header rebrand.** Replaced the `friday-logo.jpg` favicon + the
   "friday.mu / Admin" two-line label with a single italic-bold
   "fridayOS" wordmark. Files:
   - [Header.tsx:85](frontend/src/app/fad/_components/Header.tsx:85) — JSX
     simplified to one `<span class="fad-brand-wordmark">`.
   - [fad.css:175](frontend/src/app/fad/fad.css:175) — new
     `.fad-brand-wordmark` rule (Inter, italic, 900, -0.045em
     tracking, 22px desktop / 18px mobile, navy / off-white).

2. **Revenue curve in design analytics.** Fourth chart on the
   Design → Analytics sub-tab, modelled on `SpendCurveChart`.
   - [design.ts:3675](frontend/src/app/fad/_data/design.ts:3675) — new
     `RevenueCurvePoint` type + `getRevenueCurve()` accessor.
     Buckets received `PaymentGate` amounts by `receivedAt` month
     (`design_fee_60/40` + `execution_fee_t1/t2` + `final_balance`).
     Excludes `agreement_signed` and `project_funds` (working capital
     pass-through, not Friday revenue).
   - [design.ts:3859](frontend/src/app/fad/_data/design.ts:3859) — wired
     into `designClient.analytics.revenueCurve`.
   - [DesignModule.tsx:2036](frontend/src/app/fad/_components/modules/DesignModule.tsx:2036)
     — new `RevenueCurveChart` component (SVG, total line + filled
     area in `--color-text-success`, dashed design-fee line in
     `--color-brand-accent`, legend with all four totals).

   Verified in browser, both light + dark, desktop + mobile. Numbers
   reconcile: total = design + execution + final balance.

## v0.2 punch list — backend (mandatory next)

These are the hard-required gates between v0.1 demo and v0.2 production.
Each is its own contract:

1. **`designClient` swap** — replace every accessor in `_data/design.ts`
   (lines ~3756–3870) with a fetch client. Same shapes. Endpoints
   suggested in `// @demo:logic` comments throughout the file.
2. **Real auth** — magic-link signing (HS256 → real key + revocation
   list), `portal:session:<slug>` → backend session, "Re-issue link"
   admin CTA.
3. **Annex A persistence** — currently localStorage (director-only
   gate). Move to per-tenant config endpoint (multi-tenant
   prerequisite).
4. **Eversign integration** — replaces the mocked agreement send in
   `AgreementStage.tsx`.
5. **WhatsApp approval capture** — owner-approval inbound webhook
   matches the existing `wa_*` token approval route.
6. **Activity feed** — owner-visible activity events
   (`portal/ActivityTab.tsx`) currently sourced from a hand-curated
   demo list; real version subscribes to a server-side activity log
   filtered through the heuristic content rules already in place.
7. **Analytics endpoints** — `GET /api/design/analytics/{time-in-stage,
   funnel, spend-curve, revenue-curve}` returning the four typed
   shapes already exported from `design.ts`.

After backend wires up, do a final `grep -n "// @demo:"` sweep across
`frontend/src/app/fad/` — every tagged line should either get its
implementation replaced or have its tag removed deliberately.

## Non-mandatory polish (pick up when time allows)

Things we intentionally did not do because they're not blocking ship
or backend wiring:

- **Funnel chart "Won" semantics.** The Won bucket currently counts
  active projects in the won stage, not actual cohort conversion
  ratios — flagged in the cont-29 commit. Real cohort math needs
  stage-entry timestamps that v0.1 doesn't have.
- **Stage-entry timestamps.** Time-in-stage uses `updatedAt` as a
  proxy. Once the backend writes a `stageEnteredAt` per project,
  swap `getTimeInStageDistribution` to use it.
- **Revenue chart filtering.** The new revenue curve aggregates ALL
  projects. Could add filters: by entity, by tier, by lead source.
  Defer until ops actually asks.
- **Quote comparison UI.** Locked decision says "design before
  backend" — the side-by-side quote table + "approve cheapest
  reasonable" affordance is not built yet. Sketch and validate IA
  with Ishant before coding.
- **Standards Book.** Module is referenced in v0.2 punch list, no
  code yet.
- **Native design-pack assembly.** Currently upload-only;
  v0.2 builds the pack inline.
- **AI integration points.** 11 placeholders flagged via
  `data-ai-feature` attribute. Each has a stub button. Wire
  individually when the AI service is ready.
- **Bulk legacy closeout import.** Locked decision exists for the
  ReconciliationStage wizard reuse for LB-1 / LB-4 in 2027.

## Where to look first when you reopen this module

1. `git log --oneline fad-design-os-v01-frontend ^main` — full
   commit narrative of the design rebuild.
2. [README.md](README.md) — exhaustive sub-tab + stage breakdown,
   locked decisions, file tree.
3. `frontend/DEMO_CRUFT.md` — all `@demo:*` rows tied to backend
   actions.
4. `_data/design.ts` — fixtures + `designClient` mock + analytics
   accessors. The single source of truth for what backend has to
   return.

## Smoke-test checklist before any future commit

```bash
cd frontend
npx tsc --noEmit                  # filter to fad/ paths if noisy
npm run build                     # static export, chunk hashes change
npm test --workspace=frontend 2>/dev/null || (cd frontend && npx vitest run)
```

Visual sweep:

- `/fad?m=design` — Overview, Projects, Leads, Vendors, Analytics,
  Settings sub-tabs.
- `/fad?m=design&pid=p-ohana` — drill into a project, click through
  all 6 phase tabs.
- `/portal/projects/ohana-house` — owner view, all 7 tabs.
- Light + dark, desktop (1280) + mobile (375).

That's it. Backend swap is the next chapter.
