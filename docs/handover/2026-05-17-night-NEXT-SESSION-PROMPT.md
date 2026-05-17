# ACP Brief: FAD next session — post 2026-05-17 night session

You're picking up after a long evening + night session. We rebuilt the
Guesty scraper for the new `/inbox-v2` UI, shipped it end-to-end for
**messages** and **reservations** (data now in prod), wrote a backend
receiver for scraped listings, added a `data_drift_log` reconciler
table, restored 4 accidentally-deleted Design projects, added a
`source` discriminator to the feedback table for FAD vs website
separation, and wrote a 700-line FAB+screenshot reference doc for the
website team to copy-paste.

**Direction + guest-name display bugs that operators flagged tonight
are fixed in prod.** The remaining work is mostly wiring + one
architectural change to Properties module.

---

## 1. Working directory + commits

- **Branch:** `fad-design-os-v01-frontend`
- **Worktree:** `/Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os`
- **HEAD at session end:** `f54813b` (verify with `git log -1`)
- **Backend deployed:** with all scraped-* receivers, `feedback.source`,
  defensive non-UUID mention filter, restart count ~130 (lots of
  iterating tonight).
- **Frontend deployed:** `12c51f7` per `curl -s https://admin.friday.mu/version.json`

## 2. Cold-open checklist — run these first

```bash
cd /Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os
git fetch origin && git status
git log --oneline -25

# Prod versions
curl -s https://admin.friday.mu/version.json
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu 'pm2 list'

# Scraper data in DB
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  'set -a && . /var/www/fad-backend/.env && set +a && psql "$DATABASE_URL" \
   -c "SELECT direction, COUNT(*) FROM messages WHERE guesty_message_id LIKE '"'"'g-scrape-%'"'"' GROUP BY direction;"'

ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  'set -a && . /var/www/fad-backend/.env && set +a && psql "$DATABASE_URL" \
   -c "SELECT COUNT(*) FILTER (WHERE guesty_id LIKE '"'"'scrape:%'"'"') AS scrape, COUNT(*) FILTER (WHERE guesty_id NOT LIKE '"'"'scrape:%'"'"') AS api FROM guesty_reservations;"'

ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  'set -a && . /var/www/fad-backend/.env && set +a && psql "$DATABASE_URL" \
   -c "SELECT COUNT(*) FILTER (WHERE guesty_id LIKE '"'"'scrape:%'"'"') AS scrape, COUNT(*) FILTER (WHERE guesty_id NOT LIKE '"'"'scrape:%'"'"') AS api FROM guesty_listings;"'

# Guesty OAuth quota — probe to see if it recovered overnight
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  'set -a && . /var/www/fad-backend/.env && set +a && curl -s -o /dev/null -w "HTTP %{http_code}\n" \
   -X POST https://open-api.guesty.com/oauth2/token \
   -H "Content-Type: application/x-www-form-urlencoded" \
   -d "grant_type=client_credentials&client_id=$GUESTY_CLIENT_ID&client_secret=$GUESTY_CLIENT_SECRET&scope=open-api"'

# Any new Mary bugs since 17:40 UTC?
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  'set -a && . /var/www/fad-backend/.env && set +a && psql "$DATABASE_URL" \
   -c "SELECT created_at, title, source FROM feedback WHERE user_username='"'"'mary@friday.mu'"'"' AND created_at > '"'"'2026-05-17 17:40'"'"' ORDER BY 1 DESC LIMIT 10;"'
```

## 3. State of the data (post-tonight)

### Messages

- **162 scraper-sourced messages in `messages` table** (`guesty_message_id LIKE 'g-scrape-%'`)
- Direction distribution: **74 inbound / 88 outbound** — correct after the regex fix
- Sender names: guests as their actual name (e.g., "Marcello", "Julia Maichle"); Friday's replies tagged as `sender_name = 'Friday'`
- Should render correctly in the FAD Inbox module — left/right alignment by `direction`, avatar by `sender_name`

### Reservations

- **50 scraper-sourced reservations** in `guesty_reservations` (synth id `scrape:CONFCODE`)
- **197 API-sourced** rows still present from the last successful poll
- Guest names: now correctly extracted (Fernando Kanarski, Gael Le Metayer, …) after the
  `:not([datakey]).person-cell` selector fix
- Listing column has nickname only (e.g., `RC-14`) — the join against
  `guesty_listings` uses Guesty `_id` not nickname, so `listing_nickname`
  in the API response is NULL for scrape rows. `transformReservation`
  on the frontend falls back to `listing_guesty_id` which is the
  nickname — so the UI shows "RC-14" correctly.

### Listings

- **0 scraper-sourced listings** — `scrape-listings.mjs` is a scaffold;
  the datakey mapping for `/properties` hasn't been probed.
- **60 API-sourced listings** are in `guesty_listings` from earlier
  syncs.
- `/api/properties` returns all 60 correctly (key is `listings`, not
  `properties` or `results`).
- The FAD **Properties module does NOT currently show these** — it
  shows the 3 Design SaaS projects via `/api/design/properties`. This
  is the main architectural fix needed; see §5 below.

## 4. The architecture (Ishant 2026-05-17 night spec)

```
                                ┌──────────────────────────────┐
                                │       guesty_listings        │
                                │      (single source table)   │
                                └──────────────┬───────────────┘
                                               ▲
                ┌──────────────────────────────┼──────────────────────────────┐
                │                              │                              │
   ┌────────────────────────┐    ┌─────────────────────────┐    ┌────────────────────────┐
   │ scrape-listings.mjs    │    │  API poller (worker.js) │    │ /api/properties (GET)  │
   │  → scrape:listing:CODE │    │  → real Guesty _id      │    │  reads everything      │
   │  Every 15 min          │    │  Every 15 min when API  │    │  Frontend hydrates     │
   │  Source-of-truth       │    │  is healthy             │    │  PROPERTIES from here  │
   └────────────────────────┘    └─────────────────────────┘    └────────────────────────┘

Same pattern for guesty_reservations and messages — scraper + API
poller both write, /api/{reservations,inbox/messages} reads, reconciler
audits drift.
```

### Reconciler rules (in precedence order)

| Situation | Outcome |
|---|---|
| **API row exists** | Authoritative. Stays. |
| **API row missing + scrape exists** | Scrape is authoritative. Stays. |
| **Both exist + fields agree** | API wins implicitly. `scrape:*` row gets dropped. |
| **Both exist + fields disagree** | Scrape wins on fresher fields. Diff logged to `data_drift_log`. |
| **Neither** | Nothing. |

Reconciler is NOT yet built (`data_drift_log` table IS — see §6).

### Schedule

- **launchd plist** at `scripts/guesty-scraper/launchd/com.friday.guesty-scrape-all.plist` runs `scrape:all` every 15 min on Ishant's Mac.
- **install.sh / uninstall.sh** scripts there make it idempotent.
- NOT yet installed by default — operator runs `./install.sh` to
  start the cadence. Once OAuth recovers, dial down to every 1-2h.

## 5. Properties module rewiring — TOP PRIORITY NEXT SESSION

**The problem.** Currently `frontend/src/app/fad/_components/modules/PropertiesModule.tsx`
calls `useHydrateDesignTopLevel()` (commit `12c51f7`) which replaces
the `PROPERTIES` fixture with 3 Design projects from
`/api/design/properties`. Ishant confirmed Design module already
shows those 3 — the Properties module should show the **60
operational Guesty listings** from `/api/properties`.

**The fix.** Swap the Properties module's hydration source from
`/api/design/properties` to `/api/properties`. Specifics:

1. **Create `useHydratePropertiesFromGuesty()` hook** in a new
   `frontend/src/app/fad/_data/propertiesClient.ts`. Pattern: mirror
   `useHydrateDesignTopLevel()` but call `loadGuestyListings()` and
   transform each row to the `Property` interface in `properties.ts:191`.

2. **Transform map** (`/api/properties` shape → `Property` interface):
   ```
   nickname            → code
   title               → name
   address.city        → city (look up region from city)
   cohort              → region ('flic_en_flac' → 'West', 'grand_baie' → 'North')
   bedrooms            → bedrooms
   bathrooms           → bathrooms
   accommodates        → maxOccupancy
   picture_url         → photos[0].url   (heroPhoto fallback)
   is_active           → lifecycleStatus  ('live' / 'paused' depending)
   base_price_minor    → basePriceMinor
   currency_code       → currency
   guesty_id           → guestyId  (new field — or reuse pmPropertyId)
   ```

3. **Update `PropertiesModule.tsx`:** replace
   `useHydrateDesignTopLevel()` call with `useHydratePropertiesFromGuesty()`.
   Keep `insightsCount` keyed off the rev returned by the new hook.

4. **Sanity-check derived fixtures** — `PROPERTY_BY_CODE`,
   `PROPERTY_BY_ID`, `PROPERTY_OWNERS`, `PROPERTY_PHOTOS` all derive
   from `PROPERTIES` at module load. Since `PROPERTIES` is being
   mutated in-place (`replaceArray()`), those maps stay stale.
   Either re-derive them after mutation (better) or have each consumer
   look up live via `getPropertyByCode()` (heavier refactor).

5. **Don't break existing Design module callers** — Design page
   already calls `useHydrateDesignTopLevel()` which mutates
   FIXTURE_PROPERTIES alongside FIXTURE_PROJECTS / FIXTURE_LEADS.
   Both surfaces shouldn't fight each other. Two paths:
   - **Option A (recommended):** carve PROPERTIES out of
     hydrateDesignTopLevel(). Design module stops touching PROPERTIES.
     Properties module owns it via the new hook. Each module hydrates
     its own slice.
   - **Option B:** keep both hydrations; second one wins. Whichever
     module mounts later overrides. Fragile.

**Estimate:** 30-45 min for option A, including the transform + map
re-derivation + smoke test (open Properties, see 60 listings; open
Design, see 3 projects; both correct).

**Don't:** simply add `useHydratePropertiesFromGuesty()` alongside the
existing Design hydration without carving PROPERTIES out of it. That's
the option B foot-gun.

## 6. Reconciler — spec for implementation

Table is live on prod (`scripts/add-data-drift-log.sql` applied).
Schema captures `surface`, `match_key`, `diff JSONB`, `api_snapshot`,
`scrape_snapshot`, `resolution`, `reviewed_at`/`_by`.

**What to implement:**

1. **Add a `reconcile()` function** in `backend/src/reservations/reconcile.js`
   (or wherever fits the codebase shape — probably an `integrations/`
   subdir alongside `scraped_webhook.js`).

2. **Call it from two places:**
   - At the end of `worker.js`'s API poller cycle (after the API rows are upserted)
   - As a separate hook called by `scraped_webhook.js` (POST end) and `scraped_listings_webhook.js`

3. **Logic, per-surface:**

   ```sql
   -- Reservations: match by confirmation_code in the same tenant.
   SELECT
     api.id    AS api_id,
     scrape.id AS scrape_id,
     api.confirmation_code,
     api.check_in_date AS api_in, scrape.check_in_date AS scrape_in,
     api.check_out_date AS api_out, scrape.check_out_date AS scrape_out,
     api.guest_first_name AS api_first, scrape.guest_first_name AS scrape_first
   FROM guesty_reservations api
   JOIN guesty_reservations scrape
     ON scrape.tenant_id = api.tenant_id
    AND scrape.confirmation_code = api.confirmation_code
    AND scrape.guesty_id LIKE 'scrape:%'
   WHERE api.guesty_id NOT LIKE 'scrape:%';
   ```

   For each pair:
   - All key fields agree → `DELETE FROM guesty_reservations WHERE id = scrape_id` (dedup)
   - Any key field disagrees → write diff to `data_drift_log` with
     `resolution = 'prefer-scrape'`, scrape row stays so its values
     are read first

4. **Listings:** same shape but match by `nickname`.

5. **Effective view (read path)** — frontend needs the merged "what
   the UI should show" data:

   ```sql
   CREATE OR REPLACE VIEW effective_reservations AS
   SELECT DISTINCT ON (tenant_id, confirmation_code)
     *
   FROM guesty_reservations
   ORDER BY tenant_id, confirmation_code,
            -- Prefer API row (guesty_id NOT starting with 'scrape:')
            (guesty_id LIKE 'scrape:%') ASC,
            -- Then prefer fresher
            synced_at DESC;
   ```

   Then update `/api/reservations` to query `effective_reservations`
   instead of `guesty_reservations`. Same for `effective_listings`.

   Alternative without a view: JS-side dedup in the route handler.
   Slightly slower but no DDL needed.

**Estimate:** ~150 lines (50 for the SQL job, 80 for the
backend integration, 20 for the view). 1.5-2h all in.

## 7. Webhook registration — DO FIRST IF OAUTH RECOVERED

If the cold-open OAuth probe returns **HTTP 200**:

```bash
scp -i ~/.ssh/do_friday_admin scripts/guesty-scraper/register-webhook.mjs root@gms.friday.mu:/tmp/
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  'set -a && . /var/www/fad-backend/.env && set +a && node /tmp/register-webhook.mjs && rm /tmp/register-webhook.mjs'
```

This single token-mint does:
1. List existing webhooks
2. `POST /webhooks` create new at `https://admin.friday.mu/api/integrations/guesty/webhook`
3. `DELETE` legacy `judiths-mac-mini` and Into (`weareinto.ai`) webhooks
4. Print the Svix secret

Then:

```bash
# Add the Svix secret to fad-backend's .env
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  'echo "GUESTY_SVIX_SECRET=whsec_…" >> /var/www/fad-backend/.env && pm2 restart fad-backend'
```

(Paste the actual whsec_… from the register-webhook output.)

**Verify:** within 5 min a real Guesty event should land. Check:
```bash
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  'pm2 logs fad-backend --lines 20 --nostream 2>&1 | grep -i guesty/webhook'
```

Once webhooks are live, **dial the scraper down to every 1-2h** instead of every 15 min — the scraper becomes a verification + fallback layer, not the primary path.

## 8. Per-night pricing scraper — separate task

**Why:** prices change daily (yield management). The `/properties`
table page shows BASE price only. Per-day rates live in each
listing's Calendar tab.

**Spec:**
- New file: `scripts/guesty-scraper/scrape-pricing.mjs`
- For each listing in `guesty_listings` (or scrape's `/properties`
  output), click into `/properties/{id}/calendar`
- Extract per-day price + availability cells (datakey TBD via probe)
- Post to new endpoint `POST /api/integrations/guesty/scraped-pricing`
- New table: `guesty_listing_prices_daily (tenant_id, listing_guesty_id,
  for_date, price_minor, currency_code, available BOOLEAN, source,
  scraped_at)` — wide-skinny.
- Cadence: every 6 hours, NOT every 15 min. Walking 24 listings × 365
  days × per-cell extraction is ~15-20 min wall-clock per run.

## 9. Scraper learnings (write these down so we don't lose them)

The new `/inbox-v2` and `/reservations` UIs use a React + ReactVirtualized
table with `gst-*` Tailwind-style classes. Key landmines I hit tonight:

| Surface | Wrong selector | Right selector | Why |
|---|---|---|---|
| Inbox conversation rows | `[role="row"]` or `[data-qa="side-bar-item"]` | `.conversation-section .row-wrapper` | role=row matches DayPicker calendar rows; data-qa="side-bar-item" matches filter chips |
| Inbox URL after click | navigation-based extraction | click + `waitForFunction` for URL change to `/inbox-v2/{convId}/...` | rows aren't anchors |
| Message direction | `messageBodyWrapperHost\|Owner\|Sent` | `messageBodyWrapperUs` | Guesty's outbound class is literally "Us" |
| Reservations row | `data-qa="reservation-row"` | `.cell-row` | data-qa doesn't include a row identifier; cell-row is the wrapper |
| Cells | `td, [role="cell"]` | `[data-qa="text-cell"][datakey="..."]` | datakey is self-describing (`confirmationCode`, `checkIn`, `checkOut`, `listing`) |
| Guest cell | `.person-cell` | `[data-qa="text-cell"]:not([datakey]).person-cell` | listing column also carries person-cell because it has an avatar |
| Auth survival | navigating any unknown URL like `/properties2/listings` | only navigate to known sidebar hrefs (`/properties`, `/inbox-v2`, `/reservations`) | Guesty silently invalidates sessions on suspicious paths |

**Auth flow that worked:** `submit-mfa.mjs` with email + password + MFA
code piped via `.mfa-code` file. Direct Google SSO via Playwright is
flaky (header-detection). Email+password+MFA is reliable but requires
fetching the MFA code from `judith@friday.mu`'s inbox (separate
mailbox from `ishant@friday.mu` which the Gmail MCP is wired to).

## 10. Stable commits from tonight (don't revert these)

| Commit | What |
|---|---|
| `0687880` | Restored 4 design projects (Duval / Camelia 15 / LB-2 / LB-3) — operators wanted them back, fixture had captured the last-known state |
| `6099a12` | `docs/feedback-fab.md` — full reference for the FAB + screenshot capture for website team |
| `9f2703b` | Feedback `source` column — FAD vs website discriminator |
| `c3bf0d8` | scrape-all.mjs orchestrator + scrape-listings scaffold + launchd plist + data_drift_log table + handover v1 |
| `f54813b` | Direction regex fix (messageBodyWrapperUs) + guest-cell selector fix (`:not([datakey]).person-cell`) — visible in inbox now |

One-shot SQL applied direct on prod (not migrations):

- `scripts/restore-design-projects.sql` — the 4-project restore
- `scripts/add-feedback-source.sql` — source column + index + CHECK
- `scripts/add-data-drift-log.sql` — reconciler audit table

## 11. Pending tasks — priority order

1. **`/api/properties` wiring to Properties module** — §5 above. ~30-45 min.
2. **Register Guesty webhook** (if quota recovered) + wire Svix
   secret + restart + verify. ~10 min if quota is OK.
3. **Reconciler implementation** — §6 above. ~1.5-2h.
4. **`effective_reservations` + `effective_listings` views** — same task as #3.
5. **`scrape-listings.mjs` selectors locked** — run `node scrape-listings.mjs --probe` after fresh auth, write the datakey-to-field mapping, ship.
6. **`scrape-pricing.mjs`** — §8 above. New territory; needs UI probe.
7. **R Phase 2b** — `POST /api/reservations` route, frontend swap of `RESERVATIONS.push` in `CreateReservationDrawer.tsx:141`.
8. **Inbox UI source filter** — small chip on Settings → Feedback inbox so admins can split website vs FAD bugs.
9. **Per-source Slack channels** — optional, env-gated. ~10 lines in `notifySlack()`.

## 12. Anti-goals — don't do these

- **Don't touch `friday-gms`** consult.ts / draft-generator.ts / KB
  loading until Sprint 10 lands (post 2026-05-27). Owned by the GMS
  thread.
- **Don't sustained-poll Guesty UI.** The scraper IS that automation;
  it's gated to every 15 min. Don't add per-second loops or click
  through every property's pricing calendar on the 15-min cadence —
  that's the 6-hour `scrape-pricing.mjs` job.
- **Don't navigate to unknown Guesty URLs** (like `/properties2/listings`)
  in scrape probes. Guesty invalidates the session silently. Only
  follow URLs that you found as `href="..."` in the sidebar.
- **Don't touch `main`.** Direct push to `fad-design-os-v01-frontend`.
- **Don't burn OAuth mints** speculatively. We're at the 24h ceiling;
  Angelo has refused a bump. Probe with the cold-open command above
  and only call `register-webhook.mjs` once.
- **Don't override an API-sourced row** in `guesty_reservations` /
  `guesty_listings` directly from the scraper. Always insert as
  `scrape:*` synth ID and let the reconciler decide.
- **Don't add a `useHydratePropertiesFromGuesty()` hook ALONGSIDE the
  existing `useHydrateDesignTopLevel()`** without carving PROPERTIES
  out of the latter — they'll race and the second one to mount wins.
  See §5 option A.

## 13. Style + workflow (unchanged)

- Terse. Push back with reasoning when Ishant is wrong.
- Direct push to `fad-design-os-v01-frontend`. No PRs.
- Commits authored "Judith Friday" with `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.
- `git fetch origin` before any non-trivial action.
- For UI changes, dev-server-test before declaring done.

## 14. Deploy flow (unchanged)

```bash
# Frontend
cd frontend && npm run deploy

# Backend
rsync -avz -e "ssh -i $HOME/.ssh/do_friday_admin" backend/src/ root@gms.friday.mu:/var/www/fad-backend/src/
rsync -avz -e "ssh -i $HOME/.ssh/do_friday_admin" backend/server.js root@gms.friday.mu:/var/www/fad-backend/
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu 'pm2 restart fad-backend'
```

**Backend gotcha:** rsync with multiple sources + one dest fails. Run
two separate rsyncs if you have both src/ and server.js changes.

## 15. References

- `docs/feedback-fab.md` — full FAB + screenshot port reference. Hand
  to the friday.mu website team unchanged.
- `scripts/guesty-scraper/README.md` — scraper philosophy (Layer-3 =
  backstop). Selector sections are outdated (pre-2026-05-17 rewrite);
  the architectural intent is current.
- `memory/fad_gms_dependency_map.md` — backend topology.
- Repo `CLAUDE.md` + global `~/.claude/CLAUDE.md` — invariants.
- `scripts/guesty-scraper/launchd/` — every-15-min scheduling.

Re-read on disk: `docs/handover/2026-05-17-night-NEXT-SESSION-PROMPT.md`
