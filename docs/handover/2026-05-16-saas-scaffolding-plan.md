# SaaS scaffolding plan — 2026-05-16

> Continuation from `2026-05-16-batch-attack-result.md`. Same branch
> (`fad-design-os-v01-frontend`), same worktree, working on top of
> commit `65e858e`.

## Goal

Make the FAD design module sellable to a second tenant. v0 ships
**design module only** — multi-module schema is built but only
`design` is enabled. Payments via **manual bank transfer**; Stripe
deferred (schema supports both via `payment_method` enum).

## Decisions locked

| Decision | Choice |
|---|---|
| Sequence | All 5 phases this session, deploy at end |
| Module model | Multi-module capable schema, design-only enabled in v0 |
| Payment | Bank transfer for v0, Stripe schema-ready |
| Tenant onboarding | Self-serve signup, admin-confirmed billing |
| Email sending | Defer (no Resend wiring in v0; show bank details inline) |

## Phase plan

### Phase A — Schema (mig 036)

Three new tables + backfill:

```
tenants
  id UUID PK, name TEXT, slug TEXT UNIQUE, country TEXT, locale TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'trial'
    CHECK IN ('trial','active','past_due','cancelled','suspended'),
  subscription_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer'
    CHECK IN ('bank_transfer','stripe'),
  notes TEXT, created_at, updated_at

tenant_modules
  PK (tenant_id, module_key), enabled BOOLEAN, enabled_at, disabled_at, notes

invoices
  id UUID PK, tenant_id FK, invoice_number TEXT UNIQUE,
  amount_minor BIGINT, currency_code TEXT DEFAULT 'USD',
  period_start DATE, period_end DATE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK IN ('pending','paid_pending_confirmation','paid','overdue','cancelled','refunded'),
  due_date DATE, issued_at, paid_at, paid_by TEXT,
  bank_transfer_ref TEXT, pdf_url TEXT, notes TEXT
```

Backfill:
- `tenants` row for FR with `id = '00000000-0000-0000-0000-000000000001'`,
  `name = 'Friday Retreats'`, `slug = 'friday-retreats'`, `country = 'MU'`,
  `subscription_status = 'active'`, `payment_method = 'bank_transfer'`.
- `tenant_modules` rows for FR: all 12 modules enabled.

### Phase B — Module gate

- `MODULES` const registry (`backend/src/tenants/modules.js`) — list of all
  module keys with display names.
- `requireModule(moduleKey)` middleware. Queries `tenant_modules` (with
  60s per-tenant cache). 403 if not enabled.
- Apply to every router mount in `backend/server.js` for tenant-scoped
  routes.
- Frontend: `useEnabledModules()` hook reads `/api/tenants/me/modules`.
  Sidebar filters by enabled set. Default landing module = first
  enabled.

### Phase C — Sign-up flow

- Public route `/signup` — form with company name, slug, admin email,
  password, country.
- `POST /api/tenants/signup`:
  - Create `tenants` row, hash password, create admin `users` row
    (reuses existing users table from GMS shared DB).
  - Enable `design` in `tenant_modules`.
  - Insert default `design_annex_a` row with company-name backfilled.
  - Create first trial invoice (USD 0, period = 14 days, status =
    `paid` so it's not blocking).
  - Issue a JWT with the new tenant_id, auto-login.
- Trial = 14 days. After trial, next invoice issued for the monthly
  fee. Status = `pending`. Tenant sees a banner; subscription_status
  flips to `past_due` if not paid in 7 days.

### Phase D — Tenant settings UI

- New FAD module key: `tenant-settings` (admin-only within tenant).
- Tabs: General · Brand · Vendor defaults.
- General: tenant name (editable), country, subscription status (read-
  only), trial end date.
- Brand: pulls/saves to `design_annex_a` (company_name, pdf_footer_text,
  legal_jurisdiction_text, currency_code, date_format).
- Vendor defaults: JSON editor on `design_annex_a.vendor_defaults`.

### Phase E — Billing UI (bank transfer)

- New FAD module key: `billing`.
- Tenant view: list of invoices, status chips. For `pending` invoices:
  shows bank details (hardcoded FR bank for v0) + reference + an
  "I've paid" button → flips status to `paid_pending_confirmation`.
- FR admin view (gated on `tenant_id = FR`): list of all tenants'
  invoices. "Confirm payment" button → flips `paid_pending_confirmation`
  → `paid`, sets `paid_at` + `paid_by`. "Issue invoice" form.
- No cron yet — invoices issued manually by FR admin in v0.

### Phase F — Deploy + verify

- Migration 036 to prod
- Backend rsync + pm2 restart
- Frontend deploy
- Smoke test: signup as a test tenant; confirm sidebar shows ONLY
  design; confirm `/api/inbox` 403s; confirm tenant settings save.

## Out of scope (deferred)

- Stripe / automated billing
- Email sending (Resend wire-up)
- Cron-based monthly invoice generation
- Per-tenant logo upload
- Trial expiry enforcement (just a status flag for now)
- Password reset flow
- Multi-user-per-tenant invitations
- Tenant deletion

## Verification approach

- Headless session → click-through deferred to Ishant.
- I'll run `node --check` + `npm run build` per phase.
- Smoke test via curl after deploy: signup → JWT → list modules.

## Rollback

- Schema is additive (new tables; existing tables unchanged).
- Module gate middleware can be disabled by env flag
  (`DISABLE_MODULE_GATE=1`) — should bake this in for safety.
- All phases independent; revert individual commits if needed.
