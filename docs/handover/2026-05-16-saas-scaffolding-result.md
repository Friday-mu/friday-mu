# SaaS scaffolding — result handover — 2026-05-16

> Companion to `2026-05-16-saas-scaffolding-plan.md`. Everything in the
> plan shipped + a defensive lockdown found during prod smoke testing.
> Production is at `7afcf01` (backend) / latest frontend deploy.

## Final state

- **Branch:** `fad-design-os-v01-frontend`
- **Last commits (newest first):**
  - `7afcf01` defensive FR-tenant lockdown for non-design routes
  - `ddc9445` frontend — signup + sidebar gate + tenant settings + billing
  - `8eb4571` schema + module gate + tenants/invoices routes
- **Migration applied to prod:** 036
- **Frontend deployed:** signup page live at `/signup`, new modules in shell
- **Backend deployed + restarted clean**

## What's now true on prod

| Capability | State |
|---|---|
| Self-serve signup at `https://gms.friday.mu/signup` | ✅ Live. 14-day trial, auto-login, redirects to `/fad?m=design` |
| Module subscription model | ✅ `tenant_modules` table; 14 module keys; only `design` is `saleable` in v0 |
| Design module gated by subscription | ✅ `requireModule('design')` on `/api/design/*` |
| Non-design modules locked for non-FR tenants | ✅ `requireFrTenant` middleware blocks inbox/hr/feedback/reviews/etc. for any non-FR tenant_id |
| FR-side behavior unchanged | ✅ FR is `subscription_status='active'`, all 14 modules enabled, lockdown passes through |
| Tenant settings UI | ✅ `/fad?m=tenant-settings` — General / Brand / Vendor defaults |
| Billing UI (bank transfer) | ✅ `/fad?m=billing` — tenant view + FR-admin view; "I've paid" + "Confirm payment" + "Issue invoice" |
| Bank details for transfer | ⚠️ **Hardcoded** in `BillingModule.tsx` (Banque des Mascareignes — Friday Retreats Ltd). Move to per-tenant config when we onboard a non-MU tenant. |
| Stripe billing | 🔲 Schema-ready (`tenants.payment_method = 'stripe'`, `stripe_customer_id` already on row). Implementation deferred. |
| Email sending on signup / payment | 🔲 Deferred. Resend not wired yet. |

## Smoke-tested in prod

| Test | Result |
|---|---|
| `POST /api/tenants/signup` creates tenant + user + design_annex_a + tenant_modules + trial invoice | ✅ |
| Signed-up tenant token can call `/api/design/projects` | ✅ 200 |
| Same token gets 403 on `/api/inbox/conversations` | ✅ 403 |
| Same token gets 403 on `/api/hr/staff` | ✅ 403 |
| Same token gets 403 on `/api/feedback` | ✅ 403 |
| Same token gets 200 on `/api/tenants/me/modules` | ✅ 200 |
| `/signup` page renders | ✅ HTTP 200 |
| FR-admin smoke tests (using existing JWT) | 🟡 Not run — Ishant verifies via UI |

## What needs human click-through

This was a headless session. The team's existing tokens still work; the
UpdateBanner should prompt force-refresh within ~60s of focus on
`gms.friday.mu/fad`. Once it does, verify:

- [ ] Sidebar still shows all 14 modules for FR (lockdown shouldn't hide anything)
- [ ] Click "Settings" (new — top of Manage group) → tenant-settings module renders with General / Brand / Vendor defaults tabs
- [ ] Click "Billing" (new) → FR-admin view shows; "Issue invoice" form works
- [ ] `/signup` from incognito: complete form → lands at `/fad?m=design` with only Design / Settings / Billing in sidebar
- [ ] As the test tenant, try to URL-hack to `/fad?m=inbox` → ModuleNotEnabled placeholder renders (frontend defense-in-depth)
- [ ] Existing design module flows (moodboard ✕, field hints, etc. from prior session) still work for FR
- [ ] Cleanup any test tenants from the `tenants` table after testing

## Module subscription model — how to use

To enable a module for a tenant (FR admin only):

```bash
curl -X PATCH https://gms.friday.mu/api/tenants/<tenant_id>/modules/<module_key> \
  -H "Authorization: Bearer <FR_admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "notes": "enabled per support ticket #123"}'
```

Valid `module_key` values are in `backend/src/tenants/modules.js`. Only
`design` is marked `saleable: true` in v0; the others are FR-internal.

## Billing flow — bank transfer

**Tenant view** (their `/fad?m=billing`):
1. They see a list of their invoices.
2. Pending invoice → shows bank details + "I've paid" button.
3. They wire the money, enter the bank reference, click the button.
4. Status flips to `paid_pending_confirmation`. Their UI shows "Awaiting FR confirmation."

**FR admin view** (FR tenant's `/fad?m=billing`):
1. Top of page: "Issue invoice" form (tenant dropdown, amount in cents, period, due date).
2. List of all tenants' invoices.
3. Rows with `paid_pending_confirmation` get a "Confirm payment" button.
4. Click → status flips to `paid`, `paid_at = NOW()`, `paid_by = bank_transfer:<ref>`.

**For first real customer:** issue them an invoice manually via the
admin form. They sign up via `/signup`, see the invoice in their
billing tab, wire the money, mark paid. FR admin confirms.

## Known gaps / next sweep

1. **Hardcoded bank details** in `BillingModule.tsx` — move to per-tenant
   config (a `payment_instructions` JSONB column on `tenants`) when a
   non-MU tenant onboards.
2. **No invoice PDF generation** — `invoices.pdf_url` column exists but
   nothing writes to it yet. Add `pdfkit`-based generation in a follow-up.
3. **No email notifications** — Resend not wired. Tenant doesn't get
   an email when an invoice is issued. v0 assumes manual coordination.
4. **No cron / scheduled monthly invoice generation** — FR admin issues
   each invoice manually. Fine for first ~5 tenants; automate when scale
   demands.
5. **Other modules (inbox / hr / finance / etc.) not multitenant** — they
   sit behind the FR lockdown. To sell ANY of them standalone or in a
   bundle: sweep their queries (req.tenantId everywhere) + add
   requireModule gate + remove from lockdown filter.
6. **Module disable doesn't immediately log out cached sessions** —
   the requireModule cache is 60s. A tenant losing a module sees ≤60s
   of continued access. Acceptable for v0; consider WebSocket push if
   we ever need instant revoke.
7. **No trial-expiry enforcement** — `subscription_status='trial'` and
   `trial_ends_at` are tracked but nothing flips a tenant to `past_due`
   when the trial ends. Needs a cron or boot-check.
8. **No password reset on tenants who forgot their password** — relies
   on the existing GMS reset flow which may or may not work for
   non-FR tenants. Test before relying on it.
9. **Slug is case-sensitive at the DB level** — API enforces lowercase
   via regex, but no `LOWER(slug)` unique constraint. Defense-in-depth.

## How to roll back

- **Migration 036** — additive only (new columns/tables). Safe to leave
  even if code rolls back.
- **Backend lockdown** — to disable: rsync the previous server.js
  (commit `c68942c` server.js) + restart. The module gate on
  `/api/design` stays.
- **`requireModule` escape hatch** — set `DISABLE_MODULE_GATE=1` in
  `/var/www/fad-backend/.env`, restart. Bypasses the design module gate
  too. **Don't ship to prod with this set** — logs at boot if true.
- **Frontend** — `git revert ddc9445 && npm run deploy`. Sidebar goes
  back to showing all modules unconditionally.

## Files added / modified

### Backend
- New: `backend/migrations/036_saas_scaffolding.sql`
- New: `backend/src/tenants/{modules,middleware,adapters,index,invoices}.js`
- Modified: `backend/src/design/auth.js` (added `attachIdentitySoft`)
- Modified: `backend/server.js` (tenants + design module gate + FR lockdown)
- Added dep: `bcryptjs`

### Frontend
- New: `frontend/src/app/signup/page.tsx`
- New: `frontend/src/app/fad/_components/modules/TenantSettingsModule.tsx`
- New: `frontend/src/app/fad/_components/modules/BillingModule.tsx`
- New: `frontend/src/app/fad/_data/useEnabledModules.ts`
- New: `frontend/src/app/fad/_data/useTenantIdentity.ts`
- Modified: `frontend/src/app/fad/_data/modules.ts` (+ Manage group + tenant-settings + billing)
- Modified: `frontend/src/app/fad/_components/Sidebar.tsx` (filter by enabled set)
- Modified: `frontend/src/app/fad/_components/FadApp.tsx` (route new modules + defense-in-depth gate)
- Modified: `frontend/src/app/fad/_components/usePermissions.ts` (registered new modules)
