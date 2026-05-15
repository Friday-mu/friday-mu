# Tier-2 backlog — multitenant follow-ups — 2026-05-16

> Investigation-only — no code changes. Pointers + effort estimates
> for the next session(s). Each item is scoped to be self-contained.

## Priority order (recommended)

If you sell to a second tenant tomorrow, fix in this order. If FR is
the only tenant for the next few weeks, defer all of these.

### 1. VAT rate from `design_annex_a` — 1 hr

**Why now:** Schema + backend ready (mig 035 already shipped
`design_annex_a.vat_rate`). Only the frontend constant remains.
Tenant Settings UI already EDITS the annex_a row but `_data/design.ts`
ignores it.

**Files:**
- `frontend/src/app/fad/_data/design.ts:795` — `ANNEX_A_DEFAULT.vatRate: 0.15` hardcoded
- `frontend/src/app/fad/_data/design.ts:838` — `mergeAnnexAOverrides` exists but only reads from localStorage; needs to read from a fetched annex_a row instead
- Backend route `GET /api/design/annex_a` already returns the row (used by TenantSettingsModule Brand tab)

**Approach:**
1. Add a `useAnnexA()` hook that fetches `/api/design/annex_a` once per session
2. Replace `vatRate: 0.15` reads with `useAnnexA().data?.vat_rate ?? 0.15`
3. Same for any other annex_a values still hardcoded
4. The Rough Budget stage + Agreement evidence rendering are the two places that compute VAT — verify they use the hook

**Effort:** 1 hr. Mostly mechanical — pattern is established.

### 2. `feedback.tenant_id` column — 1 hr

**Why now:** bug reports from a second tenant mix into FR's inbox today.
A second tenant's Mathias-equivalent files a bug → FR sees it. Privacy
+ confusion problem.

**Files:**
- `backend/migrations/029_feedback.sql` — `feedback` table; no tenant_id
- `backend/src/feedback.js` (or similar) — insert + list endpoints
- `frontend/src/app/fad/_components/modules/InboxModule.tsx` or wherever feedback list renders

**Approach:**
1. New migration: `ALTER TABLE feedback ADD COLUMN tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id);`
   - The default backfills existing rows to FR.
2. Backend feedback route: insert with `req.tenantId`, list with `WHERE tenant_id = req.tenantId`.
3. Remove the path from the FR lockdown filter (since feedback is now tenant-scoped) and add `requireModule('design')` if feedback should be design-tenant-specific (or leave un-gated since every tenant can file bug reports).
4. Test: file a bug as Acme tenant → confirm it doesn't appear in FR's inbox.

**Effort:** 1 hr.

### 3. DD/MM/YYYY date parsing → per-tenant `date_format` — 45 min

**Why now:** Banque des Mascareignes uses DD/MM/YYYY. A second tenant
in (say) the US would upload bank statements in MM/DD/YYYY and silently
get parsed wrong (May 6 vs June 5 ambiguity).

**Files:**
- `frontend/src/app/fad/_components/modules/design/BankStatementUpload.tsx:169` — `parseMauritiusDate()`
- The shared `useAnnexA()` hook from item #1 above

**Approach:**
1. Rename `parseMauritiusDate` → `parseDateByFormat(raw, format)`.
2. Switch on `format` ('DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD').
3. Call sites pass `useAnnexA().data?.date_format ?? 'DD/MM/YYYY'`.

**Effort:** 45 min. Independent of #1 except for the shared hook.

### 4. Project intake enums — "Friday outreach" / "Managed by Friday" — 2 hr

**Why now:** These enum IDs (`friday_outreach`, `existing_friday_owner`,
`managed_by_friday`, etc.) AND their display labels are saved into
`design_projects.lead_source` and other columns. A second tenant
intaking a project sees "Friday outreach" / "Existing Friday owner" /
"Will be managed by Friday" in their dropdowns. Confusing and unsellable.

**Files:**
- `frontend/src/app/fad/_components/modules/design/ProjectIntake.tsx:21-69`
- `frontend/src/app/fad/_components/modules/design/ProjectEditDrawer.tsx:49-69`

**Approach (cheaper option):**
1. Rename IDs to neutral keys: `friday_outreach` → `outreach`,
   `existing_friday_owner` → `existing_owner`,
   `managed_by_friday` → `managed_by_company`, etc.
2. Migrate existing FR rows: `UPDATE design_projects SET lead_source =
   'outreach' WHERE lead_source = 'friday_outreach';` etc.
3. Labels stay readable — change "Friday outreach" → "Cold outreach",
   "Existing Friday owner" → "Existing owner", etc. (No per-tenant
   override for v1 — they're now neutral.)

**Approach (richer option, 2 hr more):**
- Drive labels from `design_annex_a.intake_enum_labels` JSONB. Each
  tenant can phrase them how they want.

**Effort:** 2 hr for the cheaper option (rename + migrate + sweep).
4 hr for the richer option.

### 5. CIA Mauritius compliance → optional JSONB — 3 hr

**Why now:** Lowest priority. `design_projects.cia_registration_status`
defaults to `'unknown'` for non-MU tenants — harmless but ugly.

**Files:**
- `backend/migrations/027_cia_compliance.sql` — adds the columns
- `frontend/src/app/fad/_components/modules/design/stages/AgreementStage.tsx` — UI that surfaces CIA fields

**Approach:**
1. New migration: add `regional_compliance JSONB NOT NULL DEFAULT '{}'::jsonb` to `design_projects`.
2. Backfill MU tenants: `UPDATE design_projects SET regional_compliance = jsonb_build_object('cia_registration_status', cia_registration_status, 'cia_registration_ref', cia_registration_ref, 'cia_notes', cia_notes) WHERE cia_registration_status IS NOT NULL;`
3. Update UI to render CIA fields only when tenant.country = 'MU' (or when regional_compliance has CIA keys).
4. Drop the dedicated columns in a follow-up (not in this migration — keeps rollback clean).

**Effort:** 3 hr. Cross-cutting. Defer until a non-MU tenant onboards.

## Other deferred items (not Tier-2, included for reference)

| Item | Why deferred | Source |
|---|---|---|
| Stripe billing | Bank transfer is fine for first ~5 customers | SaaS handover §gaps |
| Invoice PDF gen | Manual coordination works for v0 | SaaS handover §gaps |
| Email notifications (Resend) | Manual coordination works | SaaS handover §gaps |
| Cron-based auto-invoice | FR admin issues manually | SaaS handover §gaps |
| Auto-archive trial-expired tenants | Tracked via `trial_ends_at`, no enforcement | SaaS handover §gaps |
| Multi-user-per-tenant invitations | One admin per tenant is fine for v0 | new |
| Tenant deletion | None needed for v0 — disable via `tenants.active=false` | new |
| Stripe webhook handler | Schema-ready, no implementation | new |
| Floor-plan zoom / pan | Mathias hasn't asked yet | Floor-plan handover §rough |
| Real furniture silhouettes (SVG renderer) | Rect-with-label is enough for v1 texture pass | Floor-plan handover §rough |
| Floor-plan PNG rasterisation via sharp | Only if Gemini rejects SVG inline in practice | Floor-plan handover §rough |
| Audit + tenant-scope inbox/HR/reviews/etc. | FR lockdown is fine v0 | SaaS handover §non-design |

## Total Tier-2 if shipped together

~7–8 hours, distributed across 5 items. Each is independent. Pick the
top one or two when a real customer hits the relevant gap.
