# FAD / FridayOS Design — mega-handover — 2026-05-16

> **Read this first.** Single session over ~14+ hours shipped a complete
> multitenant SaaS on top of the FAD design module, plus the
> conversational floor-plan editor (W2–W6 compressed), plus a real
> billing stack with PDF invoices + Resend email + Stripe scaffolding,
> plus an FR admin analytics dashboard, plus onboarding wizard, plus
> a landing page scaffold. **Nothing from this session has been
> human-tested in a browser.** That's the first thing the next
> session needs.

## Current state at handover

| | |
|---|---|
| **Branch** | `fad-design-os-v01-frontend` |
| **Worktree** | `/Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os/` |
| **Last commit** | `3e7b51d` (TS fix on RoughBudgetStage Tier prop) |
| **Recent commits (newest first)** | `3e7b51d` TS fix · `133b49f` Wave B5+B6+C cleanups · `d200bfe` Wave A+B1-B4 · `02a8d44` floor-plan v2 result handover · `e282a89` floor-plan editor polish · `bd50594` floor-plan P0 bugs + Gemini AI swap + KB + rename · `9d44388` floor-plan v2 result doc · `89299d5` floor-plan W2-W5 sprint · `6d6236f` SaaS scaffolding result doc · `7afcf01` FR-tenant lockdown · `ddc9445` SaaS frontend (signup, sidebar, settings, billing) · `8eb4571` SaaS schema + module gate + tenants/invoices · `c68942c` Phase 4 multitenant complete · `492734e` JWT tenant_id wired through |
| **Migrations applied to prod** | 034–037 confirmed via session deploys; **038–047 staged in repo but NOT yet applied to prod** (deploy step is queued at session end) |
| **Frontend version on prod** | `e282a89` (last deploy) — newer commits NOT YET deployed |
| **Backend deployed** | matches `e282a89`; newer commits NOT YET deployed |

**Status of in-flight subagents at session pause:**
- 4 still running when Ishant asked for the handover: D1 (mobile/touch + multi-floor), D3 (tenant deletion + CSV export), D5 (Stripe scaffolding), D6 (landing page scaffolding). Their outputs land in the worktree but may not yet be committed.

## How the whole thing fits together

```
   gms.friday.mu/signup
           │  (POST /api/tenants/signup)
           ▼
    [tenants table]   ←──  trial_jobs cron flips status as trial_ends_at passes
           │
           │  JWT { user_id, role, tenant_id }
           ▼
   gms.friday.mu/fad
   ┌──────────────────────┬─────────────────────────────────────────┐
   │  Sidebar             │  Module router                          │
   │  useEnabledModules() │  - design          (gated, sweepable)   │
   │  filters by          │  - billing         (always-on)          │
   │  tenant_modules      │  - tenant-settings (always-on)          │
   │                      │  - admin-analytics (FR-only)            │
   │                      │  - inbox/hr/etc.   (FR lockdown)        │
   └──────────────────────┴─────────────────────────────────────────┘
            │                            │
            │ requireModule('design')   │ requireFrTenant (defensive)
            ▼                            ▼
   /api/design/*  (multi-tenant)   /api/inbox /api/hr /api/feedback*
                                     (still FR-only — sweepable later)

   /api/tenants/me/*  (tenant CRUD, billing, invitations, users)
   /api/tenants/admin/*  (FR admin only — dashboard, invoices,
                          tenant management)
   /api/auth/password-reset/*  (public)
   /api/tenants/invitations/:token/*  (public, accept invitation)
   /api/tenants/stripe/webhook  (public, HMAC-verified — scaffolding)
```

## Architecture pillars

### Tenancy

- `tenants` table holds the whole catalog; FR is `00000000-0000-0000-0000-000000000001`.
- Every multi-tenant query scopes by `req.tenantId`. `requireDesignPerm` + `requireModule(key)` middleware enforce.
- `DEFAULT_TENANT_ID` constant is the legacy fallback when a JWT predates the multi-tenant claim — kept in `adapters.js`.
- `tenant_modules` is the subscription matrix. 15 module keys defined in `backend/src/tenants/modules.js`. Only `design` is `saleable: true`. `tenant-settings`, `billing`, `admin-analytics` are FR-internal / always-on.
- `requireFrTenant` is a defensive lockdown — blocks non-FR tenants from hitting any route whose queries still hardcode FR's tenant_id. Removed per-path as each module gets swept.
- Subscription-status gate inside `requireModule`: cancelled/suspended → 402, past_due → allow with `X-Subscription-Past-Due: 1` header. FR is exempt.

### Authentication

- Login proxies to GMS at `admin.friday.mu/api/auth/*`. JWTs are GMS-issued.
- `JWT_SECRET` shared between FAD + GMS — both verify with the same secret.
- Signup mints its own JWT (algorithm: HS256, 7d expiry) with `tenant_id` claim. Password hashed with `bcryptjs` cost 10 to match GMS format (`$2a$10$`).
- Password reset uses 32-byte hex token, 1h expiry, single-use, `users.reset_token` columns (already on schema).
- Magic-link auth for the owner portal lives in `portal.js` — separate from staff JWT.
- Multi-user invitations: 32-byte hex token, 7d expiry, single-use, `tenant_invitations` table. Last-admin protection via SELECT FOR UPDATE + count.

### Billing

- Bank transfer is v1. Schema is Stripe-ready (`payment_method`, `stripe_customer_id`, `stripe_subscription_id`, `stripe_invoice_id`).
- Flow: FR admin issues invoice via UI → tenant sees it in Billing module → tenant clicks "I've paid" + enters bank reference → status `pending → paid_pending_confirmation` → FR admin confirms → status `paid`.
- `invoices.pdf_url` lazy-generated via `renderInvoicePdf` (pdfkit). Endpoint `GET /api/tenants/me/invoices/:id/pdf`.
- Per-tenant bank details in `tenants.payment_instructions` JSONB. Backfilled FR row with BdM.
- Resend email via `backend/src/tenants/email.js`. Five templates: welcome, invoice issued, payment confirmed, trial ending, password reset, invitation. **`RESEND_API_KEY` not yet set on prod — emails currently stub-out.**
- Stripe scaffolding exists (route shell, webhook signature verify, fetch-based client) but no live integration. **Needs Stripe account + `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + `STRIPE_DESIGN_PRICE_ID` to go live.**

### AI

- Op translator: Gemini 2.5 Flash via `NANOBANANA_API_KEY` (text mode). Replaced Kimi/Moonshot because Gemini leads ARC-AGI-2 spatial reasoning (77.1% vs Claude 68.8% vs GPT-5.2 52.9%).
- Other AI features (Ask Friday, Annex B edit, Rough Budget) still use Kimi/Moonshot via `KIMI_API_KEY`.
- Image gen via Nanobanana / Gemini 2.5 Flash Image Preview.
- `floor_plan_design_kb.js` is the interior-design KB — clearances (walkway 0.9m, coffee-to-sofa 0.40-0.45m, bed-to-wall 0.6-0.9m, dining pull-out 0.9m, wheelchair 1.5m), arrangement principles, anti-patterns. Injected into Gemini prompt. `kbForRoom(roomKind)` slices to relevant section.
- Op validation against the KB in `floor_plan_ops.validateOpsAgainstKB` — hard rejects (door swing buffer, walkway, wall overlap, bed blocking door) + soft warnings (walkway 60–90cm, coffee table >45cm from sofa, wardrobe blocking window).
- Conversation history — last 5 chat turns passed to Gemini as context, oldest-first, rejection turns retained with reasons.
- Per-tenant AI cost tracking via `ai_usage` table. `enforceQuota` throws `QuotaExceededError → 402` if monthly cap hit. Default cap: $10/mo per tenant.

### Floor-plan studio

- Vector model (`FloorPlanModel`) in `floorPlanTypes.ts` — walls / doors / windows / furniture / rooms / surfaces, all in metres.
- 38-category furniture catalog with default dimensions.
- Tracing editor: SVG drawing surface, click+drag walls (with endpoint snap), click-on-wall to add doors/windows, drag-from-catalog for furniture, drag-to-move walls / doors / windows / furniture, room polygon tool with vertex editing, surface assignment tool, pan + zoom (Ctrl+wheel, Space+drag), dimension display, undo (20 steps).
- Mobile touch support: single-touch = mousedown analog; pinch = zoom. Wave D1 may have just added this.
- Multi-floor support: `design_floor_plans.floor_index` column (mig 045). Floor tabs in studio UI. Wave D1 may have just added this.
- Chat panel: natural-language ops via `POST /api/design/floor-plan-chats`. Gemini returns ops + reply. Op validation rejects bad ops. Style notes auto-persist. Style notes UI strip exposes + edits them.
- Renderer: deterministic SVG (`renderModelToSvg`) + Gemini texture pass for stylised raster (`renderModelToStylizedRaster`). Cached in `design_assets` by sha256(svg+styleNotes). Stub fallback when Nanobanana key unset.

## Migrations (in order)

| # | What |
|---|---|
| 034 | `design_moodboards` archive columns |
| 035 | `design_annex_a` tenant config (company name, PDF footer, legal jurisdiction, currency, date format, vendor defaults) |
| 036 | SaaS scaffolding: tenants extensions + tenant_modules + invoices |
| 037 | `feedback.tenant_id` |
| 038 | `ai_usage` + `tenants.monthly_ai_cost_cap_minor_usd` + `ai_quota_period_start` |
| 039 | trial jobs: `tenants.subscription_status_changed_at` + `trial_reminders_sent` |
| 040 | `tenants.payment_instructions` JSONB |
| 041 | `tenant_invitations` |
| 042 | Project intake enum rename (`friday_outreach` → `outreach` etc.) |
| 043 | `design_projects.regional_compliance` JSONB (CIA columns) |
| 044 | `design_assets` composite PK `(tenant_id, sha256)` |
| 045 | `design_floor_plans.floor_index` + `floor_label` |
| 046 | `tenant_deletion_requests` (Wave D3 — confirm filename if subagent landed) |
| 047 | FR `admin-analytics` module backfill |
| 048 | Stripe scaffolding (Wave D5 — confirm if subagent landed) |

**Migrations 038–047 (plus any 048) are in the repo but NOT yet applied to prod.** Apply order matters — see deploy sequence below.

## Endpoints (cheat sheet)

### Public
- `POST /api/tenants/signup`
- `POST /api/auth/password-reset/request`
- `POST /api/auth/password-reset/confirm`
- `GET /api/tenants/invitations/:token`
- `POST /api/tenants/invitations/:token/accept`
- `POST /api/tenants/stripe/webhook`
- `POST /api/inbox/website/friday-website` (HMAC, existing)

### Tenant-scoped (auth + requireModule where appropriate)
- `GET /api/tenants/me` + `PATCH /api/tenants/me`
- `GET /api/tenants/me/modules`
- `GET /api/tenants/me/invoices` + `POST /me/invoices/:id/mark-paid` + `GET /me/invoices/:id/pdf`
- `GET /api/tenants/me/users` + `POST /me/invitations` + `DELETE /me/invitations/:id` + `POST /me/users/:id/role` + `POST /me/users/:id/deactivate`
- `GET /api/tenants/me/invitations`
- `GET /api/tenants/me/ai-usage`
- `POST /api/tenants/me/delete-request`
- `GET /api/tenants/me/data-export` (zip)
- `POST /api/tenants/me/stripe/checkout-session` + `POST /me/stripe/portal-session`
- All `/api/design/*` endpoints (CRUD on projects, vendors, photos, moodboards, selections, change_orders, agreements, floor-plans, floor-plan-chats, AI flows)

### FR admin (gated on tenant_id === FR)
- `GET /api/tenants/admin/list`
- `POST /api/tenants/admin/invoices` + `POST /admin/invoices/:id/confirm-payment` + `GET /admin/invoices`
- `GET /api/tenants/admin/invoices/:id/pdf`
- `PATCH /api/tenants/:id` (cross-tenant edit) + `PATCH /api/tenants/:id/modules/:key`
- `GET /api/tenants/admin/dashboard` (analytics)
- `GET /api/tenants/admin/ai-usage`
- `POST /api/tenants/admin/:id/restore` + `POST /admin/:id/hard-delete`

## What's untested

**Everything from 2026-05-16.** Specifically the following surfaces have ZERO human click-through:

- Signup flow
- Sidebar gate (Acme tenant sees only Design/Billing/Settings)
- Tenant Settings module (General, Brand, Vendor defaults, Payment instructions, Users tabs)
- Billing module — tenant view (invoice list, "I've paid", download PDF) AND admin view (issue, confirm, list-all)
- Floor-plan studio — trace, chat with Gemini, op validation, version chips, save-as-final, revert
- Surface assignment tool
- Style notes UI
- Mobile touch / pinch-zoom
- Multi-floor tabs
- Onboarding wizard (3-step after signup)
- Admin Analytics dashboard
- Password reset flow
- Multi-user invitations
- Trial-expiry cron
- Email notifications (Resend) — but RESEND_API_KEY isn't set on prod yet anyway
- Soft tenant deletion + CSV export
- Stripe checkout / portal session endpoints (won't work — no keys)
- Landing page at /welcome

**Smoke-tested via curl during the session:**
- Signup creates a tenant ✓
- Design module accessible by signed-up tenant ✓
- Inbox/HR/feedback gated for non-FR tenants ✓
- AI swap deployed (file lives) ✓

## Deploy sequence (for next session)

1. **Pull the branch:** `git fetch && git status` to confirm `3e7b51d` is HEAD (or whatever's newer after subagent commits land).
2. **Commit any uncommitted Wave D outputs** (D1 multi-floor, D3 deletion, D5 Stripe, D6 landing if they landed).
3. **Apply migrations 038–047 (or –048) in order** via:
   ```bash
   ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
     "set -a && . /var/www/fad-backend/.env && set +a && psql \"\$DATABASE_URL\" -f -" \
     < backend/migrations/NNN.sql
   ```
   For each, also register in `fad_schema_migrations`:
   ```sql
   INSERT INTO fad_schema_migrations (filename) VALUES ('NNN.sql') ON CONFLICT (filename) DO NOTHING;
   ```
4. **`npm install` on prod** for any new deps (`bcryptjs` already installed, `archiver` may need install for Wave D3, `pdfkit` already installed).
5. **Rsync backend:**
   ```bash
   rsync -avz --delete -e "ssh -i $HOME/.ssh/do_friday_admin" \
     backend/src/ root@gms.friday.mu:/var/www/fad-backend/src/
   rsync -avz -e "ssh -i $HOME/.ssh/do_friday_admin" \
     backend/server.js backend/package.json backend/package-lock.json \
     root@gms.friday.mu:/var/www/fad-backend/
   rsync -avz -e "ssh -i $HOME/.ssh/do_friday_admin" \
     backend/migrations/ root@gms.friday.mu:/var/www/fad-backend/migrations/
   ```
6. **pm2 restart fad-backend** — check `tail /root/.pm2/logs/fad-backend-out.log` for `[migrate] complete: 0 applied, N already-applied, N total`. N should match what's in the registry.
7. **Deploy frontend:**
   ```bash
   cd frontend && npm run deploy
   ```
8. **Verify** with curl smoke tests — see "Smoke tests" section below.

## Smoke tests (run after deploy)

```bash
# 1. Signup
TOKEN=$(curl -sS -X POST https://gms.friday.mu/api/tenants/signup \
  -H "Content-Type: application/json" \
  -d '{"company_name":"Smoke Test","slug":"smoke-001","admin_email":"smoke@example.com","admin_password":"password12345","country":"US"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')

# 2. Module gate works
curl -sS -o /dev/null -w "design: %{http_code}\n" \
  https://gms.friday.mu/api/design/projects -H "Authorization: Bearer $TOKEN"
curl -sS -o /dev/null -w "inbox: %{http_code}\n" \
  https://gms.friday.mu/api/inbox/conversations -H "Authorization: Bearer $TOKEN"
# Expect: design=200, inbox=403

# 3. AI quota visible
curl -sS https://gms.friday.mu/api/tenants/me/ai-usage \
  -H "Authorization: Bearer $TOKEN" | head -c 200

# 4. Cleanup
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  "set -a && . /var/www/fad-backend/.env && set +a && \
   psql \"\$DATABASE_URL\" -c \"DELETE FROM tenants WHERE slug = 'smoke-001';\""
```

## What still needs to be built (in priority order)

### Priority 1 — operationally important

1. **Mathias clicks through everything.** Until this happens, treat every shipment as suspect.
2. **Set `RESEND_API_KEY` on prod** so welcome / invoice / reset / invitation emails actually send. Currently they stub out with a warning log.
3. **Apply pending migrations 038–047 (+048).** They're additive but the backend code references columns/tables that don't yet exist.

### Priority 2 — sales motion

4. **Stripe live integration.** Schema + route shell ready. Needs:
   - Stripe account
   - `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + `STRIPE_DESIGN_PRICE_ID` env vars
   - Stripe Dashboard config: a product + price for the design module ($99/mo)
   - Webhook endpoint URL configured in Stripe Dashboard: `https://gms.friday.mu/api/tenants/stripe/webhook`
   - Tested with Stripe CLI for webhook signature verification
5. **Real landing page content.** Scaffold at `/welcome` is placeholder. Needs marketing copy + screenshots.
6. **Onboarding wizard polish.** Built but untested. May need iteration after Mathias runs through it.

### Priority 3 — Ishant's stated next session

**Wire reservations + properties modules to Guesty.**
- `reservations` module backend → Guesty Reservations API
- `properties` module backend → Guesty Listings API
- Per `memory/fridayos_design_saas.md` + FR conventions: each is a ~1 week sprint of careful query rewriting. Aggressive subagent use can compress.
- See `friday.mu/.../guesty.js` patterns + `backend/src/design/properties.js` (different table, but useful precedent for `guesty_listing_id` linkage).

**Wire tasks module backend** so the team can actually use it.
- Find the tasks module's frontend (`frontend/src/app/fad/_components/modules/...`) — `design_tasks` table exists but check whether there's a broader operations-side tasks module.
- Probably needs a `tasks` table or extension to `breezeway_tasks` schema.
- Build CRUD + status state machine + assignee + due dates.

### Priority 4 — multitenant breadth

7. **Tenant-scope inbox / HR / reviews / finance / calendar.** Each is ~1 week of careful query rewriting (`DEFAULT_TENANT_ID` → `req.tenantId` across 30+ routes), then `requireModule(key)` gate, then `saleable: true` in registry.
8. **Auto-invoice generation cron.** FR admin issues each manually today; should auto-fire on the 1st of each month for active subscriptions.
9. **Per-tenant logo upload** for white-label branding (adds to `tenants` JSONB or new column).

### Priority 5 — quality

10. **`design_assets` lazy migration on read.** Old rows have single-PK; new ones have composite. Code should tolerate both during the transition window. Already partially handled but worth auditing.
11. **Op validation tuning.** The KB-based clearance check may be too strict (rejects placements Mathias actually wants). Should observe real usage and tune thresholds.
12. **Furniture SVG icons.** 38 categories have basic icons. Could be richer.

## Outstanding coordination items

1. **friday.mu Guesty DLQ job `7fa99bac`** from 2026-05-14 — `dead` after 8 attempts at 429. Test booking; not a real reservation. Manual delete or retry when Guesty rate-limit settles.
2. **friday.mu emitter side: 5 contracts wired and tested** but only 4 happy events landed cleanly. Production traffic hasn't hit it yet — confirm with that team after first real booking.

## Rollback recipes

- **Specific commit:** `git revert <commit> && cd frontend && npm run deploy && rsync backend && pm2 restart fad-backend`. All commits in this session are reversible — schema changes are additive (new tables/columns; nothing dropped).
- **Module gate broken:** set `DISABLE_MODULE_GATE=1` on prod env, restart. Bypasses the gate. **Logs a warning at boot.**
- **Specific AI feature broken:** unset `NANOBANANA_API_KEY` or `KIMI_API_KEY` to force stub-fallback paths.
- **Migration mistake:** `BEGIN; <fix>; COMMIT;` via psql. The migration files are idempotent (mostly `IF NOT EXISTS` / `IF NOT IN`) so re-running is safe.
- **Whole-session rollback:** `git reset --hard 02a8d44` (last commit before the SaaS scaffolding push) — but you'd lose everything including the multitenant baseline. Don't do this without thinking.

## Files added / modified in this session (high-level)

### New backend files
- `backend/migrations/034..047_*.sql` (14 new migrations)
- `backend/src/tenants/` — entire new module (modules.js, middleware.js, adapters.js, index.js, invoices.js, ai_usage.js, email.js, invoice_pdf.js, trial_jobs.js, users.js, stripe_client.js, stripe_routes.js, stripe? — D5 may have just landed)
- `backend/src/auth/password_reset.js`
- `backend/src/design/floor_plans.js`, `floor_plan_chats.js`, `floor_plan_ai.js`, `floor_plan_design_kb.js`, `floor_plan_ops.js`, `floor_plan_catalog.js`, `floor_plan_renderer.js`

### Modified backend files
- `backend/server.js` (multiple times)
- `backend/src/design/auth.js`, `adapters.js`, `ai_images.js`, `ai_ask.js`, `ai_annex_b_edit.js`, `ai_rough_budget.js`, `index.js`, `agreement_evidence.js`
- `backend/src/feedback.js`
- 30+ design/*.js files swept for `DEFAULT_TENANT_ID` → `req.tenantId`
- `backend/package.json` (+bcryptjs, +archiver from D3)

### New frontend files
- `frontend/src/app/signup/page.tsx`
- `frontend/src/app/onboarding/page.tsx`
- `frontend/src/app/invitations/page.tsx`
- `frontend/src/app/welcome/page.tsx` (D6 — if landed)
- `frontend/src/app/fad/_components/modules/BillingModule.tsx`
- `frontend/src/app/fad/_components/modules/TenantSettingsModule.tsx`
- `frontend/src/app/fad/_components/modules/AdminAnalyticsModule.tsx`
- `frontend/src/app/fad/_components/modules/design/FloorPlanStudio.tsx`
- `frontend/src/app/fad/_components/modules/design/FloorPlanTracingEditor.tsx` (~3000+ lines now)
- `frontend/src/app/fad/_components/modules/design/FloorPlanChatPanel.tsx`
- `frontend/src/app/fad/_components/modules/design/Hint.tsx`
- `frontend/src/app/fad/_data/useEnabledModules.ts`
- `frontend/src/app/fad/_data/useTenantIdentity.ts`
- `frontend/src/app/fad/_data/useAnnexA.ts`
- `frontend/src/app/fad/_data/useTenantCountry.ts`

### Renamed
- `docs/marketing/friday-studios-pitch-v0.md` → `docs/marketing/fridayos-design-pitch-v0.md`
- `memory/friday_studios_saas.md` → `memory/fridayos_design_saas.md`

## How Ishant works (carry over to next session)

- Terse. Infer context.
- Push back with reasoning when he's wrong.
- Direct push to working branch. No PRs.
- Visual thinker — diagrams + tables for architecture.
- Surface tradeoffs explicitly.
- Don't guess; say "I don't know" when applicable.
- Web-search before product-specific advice.

## FAD code conventions (carry over)

- Commits authored "Judith Friday".
- Tag format for FridayOS Design sprints: TBD.
- Direct rsync + pm2 restart deploy flow; no CI.
- 3-layer reconciliation (working tree, index, remote) before any non-trivial action.
- Architecture decisions are locked unless re-opened.

## The single most important thing

**Mathias and Ishant haven't seen any of this work in a browser.** The session optimised for shipping breadth; verification is now a hard prerequisite. Anything that doesn't survive their click-through gets fixed before more is layered on.
