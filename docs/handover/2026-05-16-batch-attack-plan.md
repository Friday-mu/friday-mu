# Batch attack plan — 2026-05-16

> If this session compacts or is interrupted, resume from this file.
> Branch: `fad-design-os-v01-frontend`. Last commit before starting:
> `8829fce` (docs/website-inbox feedback). Worktree:
> `.claude/worktrees/fad-design-os/`.

## Goal

Ship every batch-shippable parked design-module item in one session,
plus foundational multitenancy v0 wiring. Ishant approved the full
4-phase plan. f82e1dea = **soft delete** (decided).

## Sequence

### Phase 1 — fast wins (~3 hr)

- [ ] **f82e1dea**: moodboard variant edit/delete (SOFT delete)
  - Schema: add `is_archived BOOLEAN NOT NULL DEFAULT false` to
    `design_moodboards` (migration 034)
  - Backend: DELETE flips `is_archived = true`. List endpoint filters
    `is_archived = false` by default; admin-only `?include_archived=1`
    to view trashed.
  - Frontend: ✕ button on variant card in `MoodboardImageGenerator`.
    Confirm dialog. Archived items disappear from UI.
  - Edit affordance: skip in v0 if regenerate-from-prompt is the
    natural path. (If "edit" means tweak the prompt and regenerate
    keeping link, that's already the variant_group_id design.)

- [ ] **Widen upload allowlist + per-family size caps**
  - File: `backend/src/design/uploads.js` and possibly `photos.js`
  - Add MIME families: image (jpg/png/webp/heic ↑10MB), pdf (↑25MB),
    docx (↑10MB), xlsx (↑10MB). Source-of-truth list goes into
    `backend/src/design/upload-policy.js` (new) so frontend + backend
    can share.

- [ ] **Verify Nanobanana stub state on prod**
  - SSH and check `NANOBANANA_API_KEY` env on `/var/www/fad-backend/.env`
  - If set: confirm the 3 stub warnings are dead code paths and remove
    the warnings.
  - If unset: leave warnings, surface as a follow-up task for Ishant.

### Phase 2 — draft-only DELETE (~2 hr)

- [ ] Backend DELETE handlers (idempotent, status=draft only):
  - `/api/design/selections/:id`
  - `/api/design/change_orders/:id`
  - `/api/design/vendors/:id`
  - `/api/design/site_visits/:id`
- [ ] Frontend ✕ buttons (only render when row status === 'draft')
- [ ] Confirm modals for each

### Phase 3 — field-hint batch (~5 hr)

- [ ] **Promote `Hint` to shared component**
  - New file: `frontend/src/app/fad/_components/design/Hint.tsx`
  - Replace 2 existing local copies in PreferencesStage + SiteVisitStage

- [ ] **8 high-value field hints** — hand-written content (NO LLM):

  Preferences (×4):
  - Functional priorities
  - Target guest profile
  - Revision expectations
  - Scent / acoustic / allergens

  Site Visit (×3):
  - Design opportunity
  - Access / logistics
  - Electrical / plumbing

  Rough Budget (×1):
  - Assumptions / Exclusions / Risk items / Next steps (4 sub-fields)

### Phase 4 — Multitenant v0 prep (~1 day)

- [ ] Wire `decoded.tenant_id` from JWT into design queries
  - Replace `DEFAULT_TENANT_ID` reads in `backend/src/design/adapters.js`
    with `req.user.tenant_id` (fall back to default if absent for
    backward compatibility)
  - Add explicit `requireTenant(req)` helper in `auth.js`
- [ ] Tenant-prefix file storage
  - `/var/www/fad-uploads/<tenant_id>/photos/<project_id>/...`
  - Backfill existing files into `00000000-...-001/` prefix
  - Update nginx alias accordingly
- [ ] Move FR-specific strings to per-tenant config
  - Extend `design_annex_a` with: `company_name`, `pdf_footer_text`,
    `legal_jurisdiction_text`, `vendor_defaults` (JSONB),
    `currency_code`, `date_format`, `vat_rate` (already exists)
  - Update `agreement_evidence.js`, `ai_rough_budget.js`, `ai_ask.js`,
    `ai_annex_b_edit.js` to read from per-tenant config
  - Frontend: `_data/design.ts` reads `ANNEX_A_DEFAULT` from API

## Verification approach

- **No browser** — this is a headless session. Verification = `npm
  run build` clean, `pm2 logs fad-backend` no errors post-deploy, and
  prod smoke via curl.
- Click-through testing falls to Ishant after deploy. Flag this in
  every commit.

## Deploy policy

- Frontend: `npm run deploy` from `frontend/` (build:prod + rsync to
  `/var/www/fad/`)
- Backend: rsync changed files + `pm2 restart fad-backend`
- Migrations: `psql < migration.sql` via SSH before backend restart
- Commit + push after each phase, not per-file. Keep history readable.

## Rollback

- All phases additive. Worst case: revert the commit, redeploy.
- Migration 034 (soft delete) is reversible — add column, set false.
- Phase 4 falls back to `DEFAULT_TENANT_ID` if JWT lacks the claim,
  so existing single-tenant users see no change.
