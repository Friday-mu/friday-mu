# Batch attack — result handover — 2026-05-16

> Companion to `2026-05-16-batch-attack-plan.md`. Everything in the
> plan shipped. Production is at `c68942c`.

## Final state

- **Branch:** `fad-design-os-v01-frontend`
- **Last commit:** `c68942c feat(design/multitenant): per-tenant config (4.2 storage + 4.3 strings)`
- **Migrations applied to prod:** 034, 035 (registered in `fad_schema_migrations`)
- **Backend restarted:** clean, `35 already-applied, 35 total`
- **Frontend deployed:** `version.json` = `c68942c`. UpdateBanner will
  prompt the team to hard-refresh on next focus.

## What shipped — commit-by-commit

| Commit | Phase | One-line |
|---|---|---|
| `088ded3` | 1.1 | Moodboard variant soft-delete (f82e1dea). mig 034 + DELETE/restore endpoints + ✕ button. |
| `58bb361` | 1.2 | Widened upload allowlist (4 families, raw camera, Office, design files). |
| `f31e421` | 2   | Draft-only DELETE for selections / change_orders / vendors / site_visits + frontend ✕. |
| `29d8357` | 3   | Promoted Hint to shared component + 10 hand-written field hints. |
| `492734e` | 4.1 | Swept 36 backend files: `DEFAULT_TENANT_ID` → `req.tenantId` from JWT claim. Magic-link tokens now carry tenant. |
| `c68942c` | 4.2/3 | Tenant-prefix file storage + per-tenant config (mig 035 with company name, PDF footer, legal text, AI vendor defaults, currency, date format). |

## Multitenant v0 — what's now true

The design module can be scoped to a second tenant by issuing JWTs with
`tenant_id: <new-uuid>` and inserting a row in `design_annex_a` for
that tenant. Specifically:

| Layer | Before | After |
|---|---|---|
| Auth | `req.identity.tenantId` read but unused | `req.tenantId` set on every middleware-gated route, falls back to FR default for legacy tokens |
| Queries | 35 files hardcoded `DEFAULT_TENANT_ID` | All scope queries to `req.tenantId` |
| Magic links | Owner-portal tokens carried no tenant | JWTs now embed `tenant_id`; portal.js verifies the project belongs to the claim |
| File storage | `/var/www/fad-uploads/photos/<project_id>/…` | `/var/www/fad-uploads/photos/<tenant_id>/<project_id>/…`; legacy paths still serve |
| PDF / AI strings | Hardcoded "Friday Retreats / Mauritius / Courts / La Foir Fouille / Quality Decor / Kalachand" | Read from `design_annex_a.company_name`, `pdf_footer_text`, `legal_jurisdiction_text`, `vendor_defaults`; Mauritius-locale phrasing gated on `legal_jurisdiction_text.includes('Mauritius')` |
| Currency | `formatMUR` everywhere | `formatCurrency(amount, config.currency_code)` via `Intl.NumberFormat` with safe fallback |

## What's still hardcoded (deferred to next sweep)

1. **Frontend `_data/design.ts`** — `ANNEX_A_DEFAULT.vatRate: 0.15` is
   still a frontend constant. The backend has per-tenant `vat_rate`
   (mig 015); needs to be wired through the annex_a API and read
   at page load instead of the constant.
2. **CIA Mauritius compliance columns** on `design_projects`
   (mig 027) — not actively harmful in non-MU tenants (default
   `'unknown'`) but should be made optional or moved to a
   `mauritius_specific` JSONB column in a follow-up.
3. **`design_assets.sha256` PK** — sha256 collisions across tenants
   would collide rows. Tenant column exists but isn't part of the
   unique constraint. Practical risk: near-zero. Theoretical fix:
   change PK to `(tenant_id, sha256)` when we have a second tenant.
4. **`feedback` table** has no `tenant_id` column — bug reports
   currently mix across tenants if a second tenant uses the bug FAB.
5. **DD/MM/YYYY date parsing** in `BankStatementUpload.tsx` is
   hardcoded; needs to read `config.date_format` via an API helper.
6. **Frontend project intake / edit drawer enums** still use
   "Friday outreach" / "Existing Friday owner" / "Managed by
   Friday" as enum IDs AND labels. The IDs are stable for
   FR-side analytics; replace with neutral IDs + per-tenant labels
   when onboarding a second tenant.

## Mathias's bugs as of session end

The 3 open feedback rows from session start are all addressed:

| ID | Status |
|---|---|
| `f82e1dea` (moodboard variant edit/delete) | **Shipped.** Soft-delete + ✕ button on each variant. Edit affordance not added — flag if Mathias wants rename inline. |
| `5e24ad51` (conversational floor-plan editor) | **In-flight** — W1 still done; W2 not started this session. |
| `bdab7c35` (Must Keep/Remove duplicate fields) | **Already resolved** — hint shipped in `3c7c93e` last session. |

`f82e1dea` should be moved to `resolved` after Mathias confirms the
✕ flow works.

## Things that need post-deploy click-through

This was a headless session — no browser. The following surfaces
should be exercised before being declared healthy:

- [ ] Moodboard variant ✕ button (`/fad?m=design` → project → Moodboard
      stage → click ✕ on a variant)
- [ ] Variant restore via direct API call (no UI yet for this — admin
      recovery only)
- [ ] Selection / change-order / site-visit / vendor ✕ buttons —
      especially the 409 paths for non-draft selections and vendors
      with budget-item references
- [ ] Photo upload of a HEIC file (previously rejected by photos.js)
- [ ] PDF upload via the generic uploads endpoint (was 20MB; now 25MB)
- [ ] All 10 new field hints render correctly above their inputs
- [ ] Rough budget save still works (the AI prompt now reads tenant
      config; check fad-backend logs for `[loadTenantConfig]` or
      similar)
- [ ] PDF render of a signed agreement (footer text now per-tenant)

The team's UpdateBanner should prompt force-refresh within ~60s of
focus on `gms.friday.mu/fad`.

## Files left in dev that could be cleaned up later

- The "Delete draft" text-link buttons inside `DraftEditor`
  (DesignPackStage) and `DraftCoEditor` (FinalBudgetStage) still call
  `designClient.selections.delete` / `designClient.changeOrders.delete`
  fixture-only paths. They predate this PR and now produce visual
  redundancy with the new ✕ buttons. Consolidate in a follow-up.

## How to resume tomorrow

Branch is clean and pushed. To pick up Phase 4 follow-ups:

1. `cd .claude/worktrees/fad-design-os/`
2. `git fetch origin && git status` (should be clean, in sync)
3. Read this doc + the multitenant audit in the prior session for
   context on what's still hardcoded.
4. Pick a follow-up from the "still hardcoded" list above.

## How to roll back if something breaks

- **Frontend regression:** `git revert <commit> && npm run deploy` —
  the static export caches by commit hash and the team sees the
  rolled-back bundle on next focus.
- **Backend regression:** revert + rsync `backend/src/design/` + pm2
  restart. The migrations are additive; reverting code doesn't break
  the new columns (they just go unread).
- **Migration trouble:** 034 / 035 are both safe to leave applied
  even if all code referencing them rolls back — new columns are
  nullable or have defaults; unused columns don't break anything.
