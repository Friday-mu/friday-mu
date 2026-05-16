# Priority 0 verification — 2026-05-16 (overnight)

> Picked up the ACP brief immediately after the 2026-05-16 mega-session.
> Goal: walk every Priority 0 surface from
> `docs/handover/2026-05-17-NEXT-SESSION-PROMPT.md`, fix what's broken
> before Mathias clicks through in the morning.

## TL;DR

**Backend is healthy. Two server-side bugs found and fixed and deployed.
Two frontend bugs found and fixed and deployed. Four polish issues
flagged for Mathias triage.** The conversational floor-plan editor —
the marquee shipment — works end-to-end through the browser UI now.

| Surface | Verified | Status |
|---|---|---|
| Signup → onboarding wizard → Design module | ✅ browser | green |
| Module gate (`design=200`, `inbox=403`, `hr=403`) | ✅ curl | green |
| Sidebar shows only Design / Settings / Billing | ✅ browser | green |
| Settings module (all 5 tabs render) | ✅ browser | green |
| Billing module (invoice + PDF download) | ✅ browser | **fixed** |
| Tenant identity, invoices, AI quota, modules API | ✅ curl | green |
| Password reset request + confirm token roundtrip | ✅ curl + DB | green |
| Multi-user invitation create + accept token roundtrip | ✅ curl + DB | green |
| Floor-plan v1 create | ✅ curl | green |
| Floor-plan v2 chip render (Gemini PNG, validates `ae852cd`) | ✅ browser | green |
| Floor-plan chat → Gemini → ops apply | ✅ browser | **fixed** |
| Multi-floor tabs | ⚠️ not exercised | unverified |
| Mobile/touch | ⚠️ not exercised | unverified |
| Surface assignment tool | ⚠️ not exercised | unverified |
| FR admin Analytics dashboard | ⚠️ needs FR token | unverified |
| Tenant deletion + CSV export | ⚠️ not exercised | unverified |
| Stripe checkout / portal | n/a — keys not set | deferred |
| Landing page `/welcome` | ⚠️ not exercised | unverified |

Mathias should still walk every surface — these tests caught the
ones that crash; subtler issues need a human.

## Bugs fixed + deployed

### Backend — `e639e3b`

`fix(floor-plan): rasterise SVG → PNG in chat path too + rate-table alias`

- **`floor_plan_ai.js`** had the same `image/svg+xml`-rejection bug
  as the renderer that `ae852cd` fixed yesterday. Every chat turn
  returned `"Friday couldn't reach the model. Try again in a moment."`
  with `status='rejected'`. The conversational editor was unusable.
  Prod log line was the smoking gun:
  ```
  2026-05-16T01:34:30: [floor_plan_ai] Gemini call failed:
    Unsupported MIME type: image/svg+xml
  ```
  Applied the same `@resvg/resvg-js` raster step before sending the
  inline image part. Verified after deploy: chat returned
  `status='applied'` with `add_furniture` op + new v2 row.

- **`ai_usage.js` RATE_TABLE** was missing an entry for
  `gemini-2.5-flash-image` (no `-preview` suffix). Prod env has
  `NANOBANANA_MODEL=gemini-2.5-flash-image` so every render call
  logged `"unknown model"` and defaulted to the text rate, which
  zeroed-out the per-render cost capture. Added an alias keying the
  same flat 5¢/image rate. No env-var change required.

### Frontend — `0a98f32`

`fix(saas): BillingModule invoice-shape mismatch + CommandPalette tenant gate`

- **`BillingModule.tsx`** read `invRes.results` but the API returns
  `{ invoices: [...] }`. Always empty → `"No invoices yet"` even
  though signup auto-creates a $0 trial-anchor invoice. One-line
  fix: `invRes.results || []` → `invRes.invoices || []`. Confirmed
  after redeploy: invoice list now shows
  `INV-T-browser-smoke-2026-05-17-001` `$0.00` `Paid` + working
  Download PDF.

- **`CommandPalette.tsx`** (Cmd-K) leaked **all** modules to non-FR
  tenants — fresh signup could see Inbox / HR / Finance / Reservations
  / etc. in the palette. The filter only ran `canSeeModule()` (role
  check) and never `useEnabledModules()` (tenant subscription).
  Click → 403 from the FR lockdown, but the surface itself is the
  leak. Layered `useEnabledModules()` in the same pattern Sidebar
  already uses. Confirmed: palette now shows only Design / Settings
  / Billing for a smoke tenant.

## Polish bugs (fixed second pass) — `2f9dec9`

`fix(saas): scrub FR-internal labels visible to tenant signups`

1. ✅ **DesignModule subtitle** "Friday Design OS — interior design
   projects (FD entity)" → generic "Interior design projects — site
   visits, moodboards, floor plans, vendor quotes, owner approvals."
2. ✅ **ProjectContextBar "entity_id=FD"** label gated to FR tenant
   only via `useCurrentTenantId` + `FR_TENANT_ID`. FR staff keep it
   for cost-center reconciliation; tenants don't see it.
3. ✅ **"View as · Director"** dev role-switcher gated to FR tenant.
   Was leaking to every signup because FAD's `DEFAULT_ROLE='director'`
   makes `realRole === 'director'` true for fresh signups too.
4. ✅ **VAT-note copy** — three callsites (ProjectEditDrawer,
   AgreementStage, RoughBudgetStage) said "...per Mauritius
   regulations." Stripped — `vatPct` was already templated from
   `tenants.design_annex_a.vat_rate` (mig 015).

## Currency refactor (third pass) — `22b0496`

`feat(saas): tenant-currency formatter — zero-touch refactor + backend persistence fix`

✅ **"Rs" currency hardcoding** — now resolves from tenant context.
Approach was zero-touch: shimmed the legacy `formatMUR` to read from
a module-level cache (`_data/currencyCache.ts`), with a top-level
React subscriber in FadApp (`useTenantCurrency()`) that fills the
cache on mount and triggers a re-render so all ~140 existing
`formatMUR(x)` callsites flip to the tenant's currency without
edits. `formatMUR` is misnamed now — rename to `formatMoney` is a
follow-up sweep (JSDoc flags it transitional). MUR / USD / EUR / GBP
have hand-formatted symbols; anything else falls through to
`Intl.NumberFormat`.

✅ **Backend: PUT /api/design/annex_a was silently dropping every
top-level column** — TenantSettingsModule nests
`{company_name, currency_code, date_format, ...}` inside `body.annex_a`
(the JSONB), but the reader (`shapeAnnexA`) pulls each from the
dedicated columns added by mig 035. Save looked green; nothing
persisted. Extract + UPDATE now wired so the columns track what
the UI sends.

Verified end-to-end on a fresh US smoke tenant (cleaned up):
- PUT currency_code='USD' returns 200 + persists
- Re-read returns USD ✓
- Design overview Margin exposure: "$0" not "Rs 0" ✓
- Project Summary block EPC / Design fee / Total fee: "$..." ✓
- Page-wide /Rs\s+\d/ scan: zero matches ✓
- FR cache stays MUR; FR output unchanged ✓

## Polish bugs still deferred

1. **Signup defaults `annex_a.currency_code='MUR'`** for every new
   tenant. US tenants see "Rs" until they Save in Settings. Should
   pick currency from `tenant.country` at seed time (US→USD, EU→EUR,
   MU→MUR, etc.). Backend tweak; not in scope here.

2. **"JF" avatar in topbar** for every logged-in user.
   `Header.tsx:155` reads `currentUser` from `TASK_USERS` (FR-staff
   fixture in `_data/tasks.ts`) keyed by `currentUserId` which
   defaults to `'u-ishant'` in `usePermissions.ts:50`. The first
   matching director in the fixture is Judith Friday → "JF" initials
   show for everyone. Proper fix wires the JWT's `user_id` /
   `display_name` from `/api/tenants/me` through to the topbar
   instead of reading a hardcoded fixture. Next session per Ishant.

3. **`formatMUR` rename sweep** — the shim works but the variable
   name lies. Follow-up: rename to `formatMoney` everywhere, drop
   the shim, and any non-React caller passes currency explicitly.

4. **Stage URL routing**: `?stage=floor_plan` (underscore) silently
   falls through to the default; the actual case is `'floor-plan'`
   (hyphen). Affects only hand-typed / external deep links, not the
   stepper buttons. Accept both, or canonicalise.

## Stage-routing oddity worth noting

URL `?stage=floor_plan` (underscore) does NOT route to the floor-plan
stage. The `DesignModule.tsx` switch uses `'floor-plan'` (hyphen).
The visual stage stepper buttons do work (they emit hyphen) — only
hand-typed or programmatic URLs are affected. Probably worth either
accepting both forms in the resolver or 308-redirecting one to the
other so onboarding tutorials / deep links don't quietly fail. (Not
fixed.)

## What's untested

From the brief's Priority 0 list, these surfaces still need a human:

- Multi-floor tabs (add "+" floor, switch between)
- Mobile/touch — pinch-zoom, single-touch drag in the studio
- Surface assignment tool (5th tool button between Window + Select)
- FR admin Analytics dashboard — needs an FR-tenant JWT, only
  Mathias has one. The route returns 403 to non-FR (verified).
- Tenant soft-delete + data CSV export
- Landing page at `/welcome`
- Stripe checkout / portal (keys not configured — deferred per brief)
- Trial-expiry cron firing (would need to manipulate `trial_ends_at`
  in DB and wait for the worker; not exercised)

## Prod state at handover

```
Backend commit: e639e3b (HEAD of fad-design-os-v01-frontend, deployed)
Frontend commit: 0a98f32 (HEAD, deployed)
Migrations: 48/48 applied (00x → 048)
pm2 fad-backend: online, no chronic crash loop
RESEND_API_KEY: still not set (emails stub gracefully per brief)
Last fresh signup smoke: cleaned up (no smoke-* / browser-smoke-* tenants left in DB)
```

## Verification artefacts (for sanity check)

End-to-end smoke run from a freshly-signed-up `browser-smoke-2026-05-17`
tenant on prod:

```
Signup           → 200, tenant + JWT minted, trial_ends_at=2026-05-30
Module gate      → design=200, inbox=403, hr=403  ✅
Invoice (PDF)    → 200, 2543 bytes, valid PDF v1.3  ✅
Floor-plan v1    → 200, persisted with canvas + walls + room  ✅
Floor-plan chat  → 200, status='applied', sofa added by Gemini  ✅ (post-fix)
v2 chip render   → 1024×1024 PNG with C2PA Google signature  ✅
Password reset   → 200 ok (token stored in users.reset_token; email stubbed)
Reset confirm    → 200 ok (new password hashed + stored)
Invite create    → 200, token in tenant_invitations, expires in 7d
Invite accept    → 200, new user row + JWT, tenant_users count = 2
AI usage tracking → recorded: floor_plan_render 5¢ + floor_plan_ai 1¢  ✅
```

## Recommended next actions (Ishant)

1. **Have Mathias click through the surfaces marked "unverified"** above.
   The fixed pipeline works; the unverified ones are the next layer of
   risk.
2. **Triage the 5 polish bugs.** They're all small fixes (1–10 lines).
   I deferred them to keep blast radius low overnight. The lockdown
   makes them not security-critical, but they're visible to any signup.
3. **Move on to Priority 1 (Guesty integration)** per the brief if
   Mathias's walkthrough surfaces nothing else broken. Reservations +
   Properties module backends are the work.
4. **Stage URL routing**: decide whether to accept both `floor_plan`
   and `floor-plan` or canonicalise one. Worth fixing for deep links.

## Commits this session

```
22b0496 feat(saas): tenant-currency formatter — zero-touch refactor + backend persistence fix
2f9dec9 fix(saas): scrub FR-internal labels visible to tenant signups
0a98f32 fix(saas): BillingModule invoice-shape mismatch + CommandPalette tenant gate
e639e3b fix(floor-plan): rasterise SVG → PNG in chat path too + rate-table alias
```

All four pushed to `origin/fad-design-os-v01-frontend`. All deployed.
