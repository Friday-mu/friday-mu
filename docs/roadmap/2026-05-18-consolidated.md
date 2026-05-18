# Consolidated FAD/GMS Roadmap — 2026-05-18

> Single source of truth merging the two parallel Claude workstreams (KB-side + Consumer-side), the bootstrap-optimization session, today's external-integrations decision, and Ishant's longer-horizon strategic intent. Supersedes the 2026-05-17 cross-session roadmap canonical (Notion `36343ca8849281b595f1fa2d455408a5`) and the FAD Code Session Handover 2026-05-18 (Notion `36443ca8849281eb834ddbcf1154e777`) **for forward-looking planning only** — those remain authoritative for state-as-of-today.

**Author.** Consolidation pass after 2026-05-18 evening session, branch `fad-rebuild`. Mirrored verbatim on Notion under Active Work.

**Update protocol.** Edit this file when a phase ships or a scope changes; preserve dated headers. The Notion page mirrors. When the two drift, the markdown is canonical (lives next to the code).

---

## 1. TL;DR

- FAD is now the locked single source of truth for shared external integrations (Guesty, Resend, Kimi, future overlapping vendors). The website calls FAD's `/api/public/*` over short-lived JWTs. Things genuinely browser-side or website-specific stay on the website.
- Sprint 9 (GMS knowledge architecture refactor) is mid-flight: Phase 3 deployed `9a091da`, Phases 4-5 (multi-surface validation + 7-day burn-in) outstanding. Sprint 10 (Consumer-side tool-calling features + the FAD-as-org-hub Phase 1 build-out) opens in parallel.
- friday-gms is heading for archival once (a) FAD inbox stable on its own data path 2 weeks zero rollback, (b) reviews migrated FAD-native, (c) translate migrated. Target archival window: Sprint 11 (June-July).
- Locked anti-goals: no PRs, no Vercel for FAD, no separate auth server (FAD `/api/auth/token` IS it), no scraping for pricing (API + calendar webhook is the path), no Sentry yet.
- Hard deadline: Mary leaves 2026-05-25 — knowledge capture (vendor table, owner CRM dump, contract repository, process docs) is the binding constraint this week. Software ships fall behind unless they're already in flight.
- Channex channel-manager swap is on track for Q3-Q4 2026 (Airbnb big-bang + BDC per-property). Experiences v2, Ratehawk, Car rentals, Airport transfers all sit Q4 2026 - Q1 2027 behind that.

---

## 2. Current state (2026-05-18 end-of-day)

### 2.1 What's live in prod

- **FAD frontend** `admin.friday.mu/fad` (and `gms.friday.mu/fad` as alias) → both nginx vhosts root at `/var/www/fad/`, single Next.js bundle. Latest deployed frontend commit: `4ee61c6` (will move when push-notifications backend ships).
- **fad-backend** at `/var/www/fad-backend/` running as pm2 process `fad-backend`. Latest deployed commit: `4e88d00` (Tier 1+2 cleanup + dictation diagnostics + Resend wired).
- **friday-gms backend** at `/var/www/friday-gms/` running as pm2 process `friday-gms`. Latest deployed commit: `e26ad0c` (key-casing hotfix for shared Guesty token cache). Phase 3 of Sprint 9 (composer shadow logger) at `9a091da` plus ecosystem config + shadow-logger test on top.
- **Guesty Svix webhook** id `6a0aa28e987bab0015da2956` → `https://admin.friday.mu/api/integrations/guesty/webhook`. Events: `reservation.{messageReceived,messageSent,new,updated}`, `listing.{new,updated,calendar.updated}`. Live and verified.
- **fad-backend pollers** every 15min: 60 listings, 199 reservations, 200s steady-state.
- **friday-gms Guesty token cache** reading from disk correctly post-fix. `refreshCount: 1` for today. Token expires ~19h.

### 2.2 What's verified

- FAD-side audit committed (`EXTERNAL-CONNECTIONS-AUDIT-FAD-2026-05-18.md` on `fad-rebuild` `22a2dfd`). 16 services, route×service matrix, overlap matrix vs the website's 18, 11-item weirdness list, Guesty caching deep-dive.
- Website-side audit committed (their `9c62f1b`). 18 services.
- friday-gms key-casing bug fixed (`e26ad0c`). Both `expiresAt` (camelCase) and `expires_at` (snake_case) are now written/read on disk. Verified live via `[Guesty] Loaded cached token from disk (expires in 1158 min)` log line post-restart.
- fad-backend cleanup landed: dead `OPENAI_API_KEY` removed, dead `backend/src/server.ts` (501 lines) deleted, `.env.example` reconciled with prod, `tokenRefreshInflight` single-flight mutex added to fad-backend's Guesty client (`87e8b6e` / `2f67894` / `be6490c`).
- Resend wired in fad-backend prod env (was silently no-op-ing for weeks).
- Properties module hydrating from `/api/properties` (60 live Guesty listings) instead of 24 static fixtures (`8003c83`).
- Reservations + Calendar modules hydrating from `/api/reservations` (both `data.results` shape bug + hardcoded `TODAY_ISO='2026-04-27'` fixed — `858a37d`).
- Dictation feature on feedback FAB ships with visible-error pattern: `not-allowed`, `network`, etc. all surface inline.

### 2.3 What's NOT verified

- Push notifications backend (F3): half-built. Frontend hook + service worker + banner all exist and match a contract; backend has zero `/api/push/*` routes, no `web-push` package, no `push_subscriptions` table, no `VAPID_PUBLIC_KEY` in prod env. Proposal landed at `docs/handover/2026-05-18-push-notifications-proposal.md`. ~1h 25m to ship once Tier 3 keys handed off.
- Dictation network-error path in standalone PWAs. Web Speech API phones home to a vendor STT backend (Google for Chrome); iOS / some Android profiles block the network path in standalone-PWA mode and return `network` error. User-facing pattern shipped (clear inline message); root-cause confirmation needs Ishant tab vs PWA comparison.
- Sprint 9 Phase 4 (multi-surface validation + cutover): composer is plumbed but only the `inbox-drafts` surface has fired shadow logs so far. Consult / action / followup surfaces need wiring (Consumer-side task) before Phase 4 readback.
- friday-gms PM2 restart count was 3204 (high) as of 2026-05-17 — root cause not investigated (ecosystem config not yet activated; needs `pm2 delete + pm2 start ecosystem.config.js`).
- VPS disk 88% full as of 2026-05-17 — housekeeping needed.
- Channex API capability map ACP (`344e37f2`) and FAD frontend audit ACP (`9aa525dc`) from the 2026-05-07 Listing Creation SOP intake — status unknown.

### 2.4 Org-wide auth/key state (as of today's keys-paste)

| Key | Status in fad-backend `.env` | Status in website `.env` | Action |
|---|---|---|---|
| Guesty `OPEN_API_*` | Set, healthy | Set, used directly | Stay on website until `/api/public/listings` ships; then route via FAD |
| `GUESTY_SVIX_SECRET` | Set (today) | n/a | Live |
| `RESEND_API_KEY` | Set (today) | Set, in use across 7 routes | Both consume directly today; consolidate on FAD with `/api/public/email` in Sprint 10 |
| `RESEND_FROM_EMAIL` | Set (today, renamed FAD-side to match `from` semantics) | Set as `RESEND_FROM` | Renamed to match website's convention later |
| `ANTHROPIC_API_KEY` | **Set today (just wired)** | not present | Unblocks `email/classifier.js` for Anthropic-based inbox triage |
| `OPENROUTER_API_KEY` | **Not present** — no consumer code | Not present — no consumer code | No FAD or website route reads it; do not provision until a consumer ships |
| `KIMI_API_KEY` / `MOONSHOT_API_KEY` | Set in fad-backend (4 sites: feedback chat, design rough budget, ai ask, floor-plan catalog) | Set on website (two clients pointed at the same key) | Consolidate on FAD with `/api/public/ai/chat` in Sprint 10 |
| `GMS_AUTH_TOKEN` | Set on fad-backend `server.js:67` | n/a | **Deferred** — friday-gms never validates it. Flag for friday-gms team to wire if/when service-to-service auth matters |
| `JWT_SECRET` (FAD ↔ GMS) | Shared via env | n/a | Don't rotate without coordinating |
| `FRIDAY_WEBSITE_INBOX_SECRET` | Set | Set (paired) | Live, HMAC-SHA256 |
| `VAPID_PRIVATE_KEY` | Set (orphan today; needs public-key pair generated and re-wired before F3 ships) | n/a | Generate fresh pair, both keys, restart |
| Upstash `UPSTASH_REDIS_REST_URL` / `_TOKEN` | n/a (FAD lives on VPS, disk-shared) | **Not provisioned** — ev vars not in `.env.local` / `.env.example` despite being read at `lib/guesty.ts:23-57` | Either Ishant provisions Upstash, OR `/api/auth/token` ships on FAD first and renders the question moot |

### 2.5 Architecture topology

Three backends today, shared Postgres:

```
                       admin.friday.mu / gms.friday.mu
                                  │
                       nginx → /var/www/fad/
                                  │
                  ┌───────────────┴───────────────┐
                  │                               │
              fad-backend                   friday-gms
              (Express, JS)                 (Express, TS)
                  │                               │
                  ├── owns: Guesty client         ├── owns: knowledge composer
                  ├── owns: webhook receiver      ├── owns: draft/consult/action services
                  ├── owns: website-inbox flow    ├── owns: learning-analyzer
                  ├── owns: Stripe (stub)         ├── owns: inbox API (proxied by FAD)
                  ├── owns: design / FAB / push   └── owns: translate API (proxied by FAD)
                  └── proxies inbox/translate
                                  │
                  ┌───────────────┴───────────────┐
                  │           Shared              │
                  ├── Postgres 15 (DATABASE_URL)
                  ├── /var/www/friday-gms/.guesty-token{,.meta}.json
                  ├── JWT_SECRET (auth boundary)
                  └── shared messages/conversations tables
                                  │
                  ┌───────────────┴───────────────┐
                  │                               │
              friday.mu                     external vendors
              (Vercel, Next.js)             (Guesty, Resend, Kimi,
                                             Bokun, Sanity, ...)
```

After §5.7 lands (~3 weeks), the website's outbound vendor calls collapse to a single inbound arrow into FAD's `/api/public/*`. friday-gms eventually folds into fad-backend during Sprint 11 archival.

---

## 3. Strategic constraints (locked, not re-litigable)

These are the ADRs and §1 constraints from the FAD running decisions log. **Do not reopen without explicit Ishant approval.** Listed verbatim or near-verbatim.

### 3.1 FAD as single source of truth for shared external integrations (§5.7, locked 2026-05-18)
FAD is the only org-wide client for every shared external integration. The website stops holding API keys for those services and calls FAD's `/api/public/*` instead. Things inherently browser-side (Carto basemaps, Google Fonts, PostHog, Bokun widgets, payment processor) or website-specific (Sanity CMS) stay on the website. When Guesty is eventually displaced (mid-2027), only FAD changes. Single OAuth holder = predictable ~1 mint/day org-wide.

### 3.2 admin.friday.mu URL canonical (§5.8, re-confirmed 2026-05-18)
Both `admin.friday.mu` AND `gms.friday.mu` nginx vhosts now point at `/var/www/fad/` — same bundle, same `version.json`, same behavior. Old GMS frontend directories (`/var/www/friday-dashboard*`) are inert; nginx no longer routes there. `admin.friday.mu` is canonical. PWAs are installed against it. Default tests + ops references go to admin unless there's a specific reason for the gms alias.

### 3.3 FAD as control + AI layer on Guesty / Breezeway (§1.1)
Through Phase 1, FAD reads from Guesty and Breezeway. They remain system of record. FAD layers AI surfaces, cross-module linking, and unified UX over their data. Does not replace them.

### 3.4 Guesty-replacement curve, per module (§1.2)
Each module declares its phase:
- Phase 1 — read-from-Guesty
- Phase 2 — write-through
- Phase 3 — source-of-truth

Strategic Guesty replacement target: mid-2027. Channel-manager + WhatsApp-gateway pulled forward to Q3-Q4 2026 per Channex memo (§5.6 of running decisions log).

### 3.5 Multi-tenant from day one (§1.3)
Every module ships multi-tenant. Every integration's credentials per-tenant in pgcrypto-encrypted `key_vault`. Multi-tenancy foundation built (FridayOS Sprint 1, `fridayos-mt-v0.1.0..v0.4.0`). Non-negotiable for schema, API auth, credential storage, route guards, RLS, AI prompt isolation.

### 3.6 FridayOS as MCP server long-term (§1.4)
`mcp.fridayos.com` is the productisation of FAD's integration layer. Every API wrapper we build for Friday should be designed with this in mind — typed, multi-tenant, well-documented.

### 3.7 Typed wrapper architecture (§1.5)
For each integration (Guesty, Breezeway, Xodo Sign, Reva, etc.):
1. Build one typed TypeScript client wrapper.
2. Surface it twice — Express backend (no LLM tokens burned) + MCP server (thin adapter over the same wrapper).
API-level cost: zero per-call beyond existing subscriptions. Cost is at LLM context layer only.

### 3.8 ADRs in force
- **ADR-001** API-first, UI-on-top.
- **ADR-002** FridayOS 3-layer (integration / intelligence / interface).
- **ADR-003** Auth flow (locked 2026-05-18): OAuth 2.0 client_credentials + short-lived JWTs. Chosen over static API key + mTLS for standards-based audit-per-request.
- **ADR-004** Data freshness via SSE push (Postgres LISTEN/NOTIFY), NOT polling. ETag + Cache-Control for HTTP cold loads.
- **ADR-005** Webhook + API for calendar/pricing, NOT scraping. `scrape-pricing.mjs` scaffold is obsolete.
- **ADR-006** Reservations is the primary key everything cross-links to (§5.3).
- **ADR-007** Properties is the unification layer between Guesty (commercial) and Breezeway (operational) (§5.2).
- **ADR-008** Internal team comms live in FAD Inbox, not Slack (§3.1 of running decisions log).
- **ADR-009** Investigation before implementation. Always insert the investigation step (§3.2).
- **ADR-010** No parallelization across waves; sequencing where dependent (§3.3).

### 3.9 Friday code conventions (from CLAUDE.md global rules)
- Direct push to master / current sprint branch. No PRs, no feature branches unless Ishant explicitly asks.
- Always `git fetch origin` before assessing repo state.
- Commits authored `Judith Friday <judith@friday.mu>` on Mac-side commits. Watch the silent `user.email`-unset fallback to `$USER@$HOSTNAME` (caught 2026-05-18).
- Git tag formats: GMS = `gms-v[X.Y.Z]`. FridayOS sprints = `fridayos-s[N]-v0.[N].0`. Symbiosis sprints = `symbiosis-v[X.Y.Z]`. Mission Control = `mc-v[X.Y.Z]`.

---

## 4. Workstream merge map

Three parallel Claude workstreams converging into one canonical roadmap:

| Workstream | Owned during 2026-05-17/18 | Closing state | Where the work lives now |
|---|---|---|---|
| **KB-side (GMS knowledge)** | Sprint 9 architecture refactor (composer + Skills folders + shadow logger). Phase 3 deploy. Auto-summarizer kill. Learnings-loop stages 1-2. KB content + structure. | Folded into Sprint 10 (Consumer-side wiring of multi-surface shadow logging gates Phase 4) and Sprint 11 (stages 3-5 of learnings loop + KB content audit). Web Claude session for KB writes final-state handover Notion page then goes quiet. | This roadmap §5.1 (verify auto-summarizer kill, shadow data, Phase 4 prereqs), §5.3 (Sprint 10 — deferred stages of learnings loop, syndic-aware fallback KB, regression case, tenant_id field), §5.4 (Sprint 11 — anonymization rails, content audit). |
| **Consumer-side (FAD + integrations)** | This session. External-integrations centralization decision. Multi-root-cause Guesty fix. Webhook registration. Frontend wiring (Properties + Reservations + Calendar). Tier 1+2 cleanup. Resend wiring. F3 push-notifications proposal. | All consolidated into FAD-as-single-source-of-truth Phase 1 (the `/api/public/*` build-out over the next 3 weeks). Web Claude session for Consumer writes final-state handover Notion page then goes quiet. | This roadmap §5.1 (F3 push backend, dictation network investigation), §5.2 (Phase 1 of FAD-as-org-hub — /api/auth/token, /api/public/listings cutover, calendar sync infra), §5.3 (Sprint 10 — full /api/public/* surface + email centralization + friday-gms archival prep). |
| **Bootstrap-optimization** | Brief drafted today (`docs/handover/2026-05-18-bootstrap-optimization-brief.md`). Path A (inline) + Path B (memory triggers). | Independent, read-only, runs in parallel safely. Scoped as its own session. | This roadmap §5.1 (queued for execution this week — Path A primary + Path B for git-author finding). |

**Convergence risk note (from cross-session canonical 2026-05-17):** only one human (Ishant) bridges sessions. Both Claude sides agree too quickly without true negotiation. Mitigation: surface explicit disagreement when it exists. This roadmap inherits that risk: items that look "obviously right" because both sessions agreed should still be reviewed for hidden tradeoffs.

---

## 5. Roadmap by phase

### 5.1 This week (stabilization) — through 2026-05-25

Mary's last working day is 2026-05-25. The week's binding constraint is knowledge capture, not feature delivery. Code work this week is scoped to verification + the smallest set of unblocking ships.

#### 5.1.1 Mary knowledge-capture sprint (HARD DEADLINE 2026-05-25)
**Context.** Mary owns Legal/Admin module scoping. Her institutional knowledge spans vendor contacts, owner CRM stakeholder map, contract repository state, ops process docs not yet codified. Reframe (locked from past Finance planning): Mary's calendar isn't the binding constraint for software shipping — software handover happens piecemeal via existing GMS surfaces (refund log, bulk actions, auto-dismiss). The real Mary deliverable is **knowledge capture**.

**Deliverables (all by 2026-05-25):**
- Vendor table — every supplier (cleaning, maintenance, linen, syndic, utilities, ISP, legal, accounting) with contact, contract status, payment terms, escalation rules.
- Owner CRM dump — owner-by-owner notes that don't fit the Properties module's `owners` table yet. Communication preferences, sensitivities, open issues, last-touch dates.
- Contract repository state — Xodo Sign template inventory, signed-contract location map, contracts pending signature, contracts pending renewal.
- Process docs — anything not in a module yet. Owner statement review-and-send flow. Tourist tax payment cadence (when the registration resolves). Refund decision tree she uses in her head.

**Owner.** Ishant (with Mary present). Format: Notion pages under FAD Scoping > Mary Handover. Audit before 5:00 PM on 2026-05-25 to confirm nothing critical was missed.

**Dependencies.** None — this is human-on-human knowledge transfer.

#### 5.1.2 F3 push-notifications backend
**Context.** Frontend is fully wired (hook + SW + banner). Backend has zero `/api/push/*` routes, no `web-push` package, no `push_subscriptions` table, no `VAPID_PUBLIC_KEY` in prod. ~1h 25m of work per proposal (`docs/handover/2026-05-18-push-notifications-proposal.md`).

**Deliverables.**
- Migration `057_push_subscriptions.sql` per proposal schema (tenant_id, user_id, endpoint, endpoint_hash unique, p256dh, auth, ua, created_at, last_used_at).
- `backend/src/push/index.js` (router) + `backend/src/push/send.js` (helper).
- `web-push ^3.6.7` added to `backend/package.json`.
- Fresh VAPID pair generated, both keys pasted into `/var/www/fad-backend/.env`, `.env.example` updated.
- Server.js router mount + FR-tenant-lockdown skip-list entry.
- First fire-point: feedback POST → admin notification (smallest blast radius, mirrors existing Slack fan-out at `src/feedback.js:178-216`).
- Settings toggle in FAD UI (keep banner; add explicit per-user opt-in/out under Settings → Notifications).

**Deferred to next iteration after v1 verifies:** team_inbox @mention, Guesty webhook inbound message, website-inbox booking-proof upload (3 additional fire points scoped but not built v1).

**Open question:** does the 2s-delayed banner UX stay, or do we move to Settings-only opt-in? Ishant call before ship.

#### 5.1.3 Guesty webhook end-to-end verification
**Context.** Webhook id `6a0aa28e987bab0015da2956` registered today. Need a week of clean delivery before we dial the poller down from 15min to hourly (webhook delivery becomes primary; poller stays as safety net).

**Deliverables.**
- Confirm 7 consecutive days zero missed events vs poller.
- Dial poller to hourly cadence.
- Document the calendar-webhook gap: `listing.calendar.updated` does NOT fire for booking-driven changes per Guesty docs; `reservation.{new,updated}` fills it. Calendar sync function (Sprint 10 deliverable) must consume both.

#### 5.1.4 Sprint 9 Phase 4 prereq: multi-surface shadow logging wiring
**Context.** Phase 3 plumbed composer with shadow logger. Only `inbox-drafts` surface has fired so far; consult / pending-action / inquiry-followup surfaces aren't producing shadow data. Phase 4 readback requires diverse surface coverage.

**Deliverables.**
- Wire shadow logger into consult.ts (line 241 and surrounding loadJSON sites per refactor map in Sprint 9 brief).
- Wire shadow logger into action-detector.ts (line 71, 77).
- Wire shadow logger into followup-draft-generator.ts (line 22).
- Verify shadow logs at `/var/www/friday-gms/logs/composer-shadow.jsonl` for all four surfaces.
- Run divergence stats per Phase 3 readback cheatsheet at `~/judith/active-tasks/sprint9-phase3-readback.md`.

**Owner.** Consumer-side. Gate for Phase 4 dispatch.

#### 5.1.5 Auto-summarizer kill verification
**Context.** Auto-summarizer call killed on GMS side, gated behind `AUTO_SUMMARIZER_ENABLED` env flag (default false). Hot-fix dispatched via Judith.

**Deliverables.**
- Confirm flag is false in prod env.
- Verify no auto-summarizer calls in friday-gms logs for 48h.
- Document the env flag in `.env.example` with a comment about why it's gated.

#### 5.1.6 Dictation network-error PWA investigation
**Context.** Web Speech `recognition.start()` phones home to Google's STT backend (Chrome). In standalone-PWA mode on iOS / some Android profiles the network path is blocked → returns `network` error. The visible-failure UX shipped (`b1879d6` + `4ee61c6`). Need user-side test to confirm whether `network` is PWA-specific or VPN/network-side.

**Deliverables.**
- Ishant test on iOS PWA vs Safari tab at `admin.friday.mu/fad`.
- If PWA-specific: document in `docs/gotchas.md`, surface a one-line tip in the BugReport UI for installed-PWA users.
- If network-side: investigate IPv6 / WireGuard / DNS resolution paths.

**Owner.** Ishant for the test, Consumer-side for any code follow-ups.

#### 5.1.7 Website's dictation-test-result follow-up
**Context.** Website session committed an `AbortSignal.timeout` fix (`3b118de`) for the 10s Guesty 429 stall during /en SSR. Once Ishant confirms dictation network-error path, may parallel-affect the website's PWA flow.

**Deliverables.**
- Read website HANDOVER §0o.31 (`d933c5e`) for the follow-up scope.
- Mirror any dictation-related fixes between FAD and website FAB if there is one.
- Out of scope: any further refactoring of website code.

#### 5.1.8 Bootstrap-optimization session (parallel, read-only)
**Context.** Brief at `docs/handover/2026-05-18-bootstrap-optimization-brief.md`. Goal: wire Notion content (Operating Rules §3.2/§10/§11/§15, running decisions log §1+§3, FAD Code Session Handover) into auto-loaded bootstrap so future FAD code sessions are immediately strategy-aware.

**Deliverables.**
- Path A (inline) — additions to repo `CLAUDE.md` for Strategic constraints, Workflow rules, Procedural rules from Operating Rules, Module ownership snapshot.
- Path B (memory triggers) — `notion_routing.md` plus pointer in `MEMORY.md`.
- Validation: open fresh Claude Code session in worktree, prompt with hypothetical "design a new public-API endpoint for /api/public/X" — verify spontaneous references to multi-tenant, typed-wrapper, investigation-before-implementation without being asked to fetch Notion.

**Owner.** Separate session, read-only on FAD code. Runs in parallel safely.

---

### 5.2 Next 2 weeks — Phase 1 of FAD-as-single-source-of-truth (through 2026-06-01)

This is the heart of the §5.7 decision: build out the `/api/public/*` surface so the website can stop holding API keys for shared services. Each migration reversible — swap one website call site at a time, verify zero 429s before next.

**Strategic framing.** FAD shifts from "internal admin tool" to "org-wide vendor adapter". The same typed wrappers will become MCP-server-callable (§1.4, §1.5). Build everything assuming external tenants will eventually consume the same endpoints.

#### 5.2.1 `/api/auth/token` — OAuth 2.0 client_credentials issuer
**Why first.** Every `/api/public/*` endpoint authenticates via short-lived JWT. The website mints once via this endpoint, gets a 5min-15min JWT, reuses across calls until refresh. ADR-003.

**Deliverables.**
- Issuer route: `POST /api/auth/token` accepts `{client_id, client_secret, grant_type: 'client_credentials'}`, returns `{access_token, token_type: 'Bearer', expires_in}`.
- Client registry: `api_clients` table (`id`, `client_id`, `client_secret_hash`, `tenant_id`, `scopes JSONB`, `created_at`, `revoked_at`).
- Initial client: one for the website (`friday-website`, scopes: `listings:read availability:read guests:read reservations:write email:send ai:chat events:read`).
- Verify middleware: `attachApiClient` mounted on all `/api/public/*` routes, validates JWT signature + expiry + scopes per route.
- Rate-limit per client_id (separate from per-IP).
- Audit-log every issuance.

**Dependencies.** None. Can ship before any `/api/public/*` route.

**Cutover.** Website's `lib/guesty.ts` doesn't change yet — Guesty proxying lands in 5.2.2. Auth issuer ships standalone first.

#### 5.2.2 `/api/public/listings` + website cutover
**Why second.** Lowest-risk migration: read-only, cache-backed (`guesty_listings` Postgres table from the 15-min poller), no write semantics. Website's `getLiveListings` (10-min module cache) becomes a 200ms HTTP call to FAD's already-warm cache.

**Deliverables.**
- Route: `GET /api/public/listings` — reads from `guesty_listings`, returns the same field shape as website's `GuestyListingDTO`. ETag + Cache-Control per ADR-004.
- Route: `GET /api/public/listings/:nickname` — single-listing fetch by nickname.
- Schema sync: confirm FAD's `guesty_listings` columns cover everything the website projects today (basePrice, cleaningFee, accommodates, bedrooms, bathrooms, terms, photos). Add columns if needed.
- Website cutover: 10-line patch swaps `getLiveListings` to `fetch(FAD_BASE + '/api/public/listings', { headers: { Authorization: 'Bearer ' + jwt } })`. Website session has this patch ready per their HANDOVER ack.
- Verify: 24h with zero website 429s and zero FAD-side latency regression.

**Dependencies.** 5.2.1.

#### 5.2.3 Calendar sync infrastructure (NEW)
**Why this needs its own subsection.** Per audit row #3, FAD does NOT call Guesty's `/availability-pricing/api/calendar/listings/{id}` endpoint today. `/api/public/availability` cannot ship without a calendar cache table + sync function.

**Deliverables.**
- Migration: `058_guesty_calendar.sql` — `(tenant_id, listing_id, date, is_available, price, currency, min_nights, max_nights, status, source, fetched_at)`. PK `(tenant_id, listing_id, date)`. Index on `(listing_id, date)` for range queries.
- Sync function: `syncListingCalendar(tenantId, listingId, fromDate, toDate)` — calls Guesty calendar endpoint, upserts rows. Called from:
  - One-time backfill cron after the table is created (60 listings × ~90 days = 5400 rows initial).
  - Webhook handler on `listing.calendar.updated` event (already firing via id `6a0aa28e987bab0015da2956`).
  - Webhook handler on `reservation.{new,updated}` (since calendar-updated webhook does NOT fire for booking-driven changes per Guesty docs).
- Rate-limit awareness: respect the modern guestyRequest's `Retry-After` handler; don't burst on backfill.
- Backfill cron: nightly refresh of all listings for upcoming 90-day window. Soft-fail per listing.

**Dependencies.** Guesty webhook delivery verified for ≥1 week (5.1.3).

**Removal.** `scripts/guesty-scraper/scrape-pricing.mjs` scaffold marked obsolete once `guesty_calendar` is populated. Delete in a follow-up commit.

#### 5.2.4 Bootstrap-optimization execution
**Context.** Already scoped in 5.1.8. Listed here because the validation step lives ~7 days out from kickoff, which lands in this 2-week window.

**Deliverables.** Per 5.1.8.

#### 5.2.5 Atlas update session (parallel, read-only)
**Context.** Friday System Atlas (Notion `34c43ca8849281b9a10de9f264141c37`) has Section 4 (GMS architecture) and Section 3 (mermaid diagrams) drifting from the 2026-05-18 state. Specifically:
- Section 4: friday-gms is still listed as primary inbox owner; needs the FAD-as-single-source-of-truth update.
- Section 3 mermaid: doesn't reflect the new `/api/public/*` surface, no `/api/auth/token`, no `guesty_calendar` table.
- ADR-003 through ADR-005 (auth flow, data freshness, calendar API+webhook) need to be appended to the ADRs section.

**Deliverables.**
- Section 4 refresh: 3-backend topology diagram, FAD-as-org-hub flow.
- Section 3 mermaid regen.
- ADR appendix update.
- Cross-references: ensure FAD Code Index (Notion `35143ca88492810d9a73d46b0101c436`) reflects the new file paths (push routes, guesty_calendar migration, etc.).

**Owner.** Ishant + Claude. Separate session, read-only on FAD code.

---

### 5.3 Sprint 10 — June, ~3 weeks out (target close: mid-June)

Sprint 10 is the major build-out. Two parallel halves: Consumer-side (FAD-as-org-hub finish + friday-gms archival prep) and KB-side (deferred stages of learnings loop + KB content audit).

#### 5.3.1 `/api/public/availability` (depends on 5.2.3)
**Deliverables.**
- Route: `GET /api/public/availability?listing=X&from=Y&to=Z` — reads from `guesty_calendar`, returns the same shape as website's `getListingCalendar`.
- Fallback path: if `guesty_calendar` row is missing for any date in the range, fall through to a live Guesty call and upsert. (Backfill should have populated; this is paranoia.)
- Website cutover: BookingCalendar mount switches from direct Guesty to FAD `/api/public/availability`.
- Verify: 7 days zero 429s, zero latency regression on calendar mount.

#### 5.3.2 `/api/public/returning-guest`
**Deliverables.**
- Route: `GET /api/public/returning-guest?email=X` — wraps Guesty `/v1/reservations?filter=guest.email`. Returns booking history.
- Website cutover: `findReturningGuest` swaps to FAD endpoint.

#### 5.3.3 `/api/public/reservations` (write)
**Deliverables.**
- Route: `POST /api/public/reservations` — wraps Guesty `createReservation` (48h-hold reserved status pattern from website-inbox flow).
- Idempotency: `Idempotency-Key` header required; FAD dedups on the key.
- Website cutover: future direct-booking flow (not currently called by website; lands when website-inbox sprint phase 3 inline CTA ships).

#### 5.3.4 `/api/public/email` (Resend wrapper)
**Deliverables.**
- Route: `POST /api/public/email` — wraps Resend `POST /emails`. Takes `{to, from?, subject, html, text?, reply_to?}`.
- Scope-gated: `email:send` scope required on JWT.
- Sender allowlist per tenant (FR tenant: `hello@friday.mu`, `bookings@friday.mu`, `support@friday.mu`).
- Website cutover: all 7 Resend call sites swap from direct REST to FAD endpoint. **Email-service centralization complete.**

#### 5.3.5 `/api/public/ai/chat` (Kimi wrapper)
**Deliverables.**
- Route: `POST /api/public/ai/chat` — wraps Kimi `chat/completions`. Streams via SSE.
- Tool-calling pass-through (preserved for ask-friday).
- Scope-gated: `ai:chat` scope.
- Website cutover: ask-friday + owner-chat + feedback-chat all swap to FAD endpoint. Website's two Kimi clients fold into one consumer.

#### 5.3.6 `SSE /api/public/events`
**Deliverables.**
- Route: SSE stream backed by Postgres LISTEN/NOTIFY.
- Notify channels: `guesty.reservation`, `guesty.listing`, `guesty.message`, `website_inbox.event`.
- Scope-gated: `events:read` scope.
- Website's `BookingCalendar` and `/residences` pages subscribe to invalidate caches on relevant events (replaces polling).

#### 5.3.7 Email-service centralization complete (consumer of 5.3.4)
**Context.** Today Resend is wired in both FAD (just turned on) and website (long-running). After 5.3.4 lands, website calls go through FAD. This consolidates audit + rate-limit + sender allowlist on FAD. Then FAD becomes the only Resend account holder org-wide.

**Deliverables.** Encapsulated in 5.3.4.

#### 5.3.8 friday-gms archival prep (move inbox + reviews + translate to FAD-native)
**Context.** friday-gms currently owns: inbox API, translate API, reviews proxy, knowledge composer + draft/consult/action/followup services. FAD proxies through to it for inbox/translate/reviews. To archive friday-gms, those services must migrate to fad-backend natively.

**Deliverables.**
- **Inbox migration.** Move conversation/message endpoints from friday-gms to fad-backend. Shared Postgres tables (`conversations`, `messages`) stay; only the API moves. FAD inbox UI swaps from proxy to direct.
  - Stability gate: 2 weeks zero rollback on FAD inbox before friday-gms inbox archived.
- **Reviews migration.** Reviews are read-only today via `/api/reviews/list` (already fad-backend, no friday-gms dependency). Confirm no friday-gms code paths remain; remove the unused proxy route.
- **Translate migration.** Move translate API from friday-gms to fad-backend. Shares the same Kimi client (or Anthropic, if classifier route gets ported here too).
- **KB + draft-generator + consult + action-detector + followup-draft-generator + learning-analyzer**: these stay in friday-gms through Sprint 10 (they're Sprint 9's locus). Sprint 11 may move them; depends on Sprint 9 Phase 5 burn-in result.

**Stability gate.** 2 weeks zero rollback on the migrated services. Then Sprint 11 executes archival.

#### 5.3.9 Sprint 9 deferred stages 3-5 of learnings loop
**Context.** Sprint 9 ships stages 1-2 (capture + analyze). Stages 3-5 (Promote, Distribute, Apply) deferred to Sprint 10/11 split.

**Deliverables.**
- Stage 3 (Promote): analyzer scheduler design + impl. Daily cron over `action_feedback` table. Surfaces candidate KB updates to a review queue.
- Stage 4 (Distribute): KB-update review UI in FAD Settings → Knowledge. Manual approve/reject before changes land in the Skills folders.
- Stage 5 (Apply): approved updates auto-commit to `knowledge/` files; composer hot-reloads index.
- **tenant_id field on learning tables.** Substrate for June multi-tenancy workstream. `action_feedback` + analyzer-output tables get `tenant_id` column.

#### 5.3.10 GBH-C6 syndic-aware fallback KB
**Context.** Identified as a Sprint 10 candidate in cross-session canonical. Gap in current KB: syndic-related guest questions fall through to a generic fallback. Needs a syndic-specific Skill (likely `surfaces/inbox-advisory/syndic-context.md`).

**Deliverables.**
- Author the syndic Skill (rules from Friday's syndic management contract — escalation paths, what syndic owns, what Friday owns).
- Add to `inbox-advisory` surface's `lazy_loadable` map with trigger regex on `syndic|building|common|elevator|trash|pool maintenance`.
- Smoke test with 5 historical syndic-related guest messages.

#### 5.3.11 Multi-stay summarizer regression case
**Context.** Multi-stay summarizer prompt iteration queued for Sprint 10. Specific bug class: when a guest has multiple past stays, summarizer either truncates or mis-attributes context.

**Deliverables.**
- Build regression test set: 5 historical multi-stay cases.
- Prompt iteration in `surfaces/inbox-drafts/SKILL.md`.
- A/B compare summarizer output before/after on the regression set.

#### 5.3.12 Mathias-additions ACP brief execution
**Context.** Drafted in §5.1 of running decisions log. Covers payout reconciliation engine, special-offer detector, approval routing rebuild for Finance module additions.

**Deliverables.**
- Execute per the brief (sibling page in FAD Scoping).
- These are quality-of-life additions, not Mary-handover-critical. Slot after Mary's deadline.

---

### 5.4 Sprint 11 — June-July (target close: early July)

Sprint 11 is the multi-tenancy + archival sprint. FridayOS multi-tenancy v0.2 gates external onboarding. friday-gms archival executes after 5.3.8's stability gate clears.

#### 5.4.1 FridayOS multi-tenancy v0.2
**Context.** v0.1 shipped FridayOS Sprint 1 (`fridayos-mt-v0.1.0..v0.4.0`). v0.2 expands per Sprint 11 cross-session canonical.

**Deliverables.**
- Per-tenant Guesty credential resolution (currently FR-tenant only).
- Per-tenant Resend sender allowlist.
- Per-tenant Kimi quota tracking.
- RLS policies on inbox / reviews / properties tables.
- Tenant-aware caching: Guesty disk cache becomes per-tenant (`/var/www/fad-backend/.cache/<tenant>/.guesty-token.json`).
- AI prompt isolation per tenant: composer's `tenant_id` parameter routes to per-tenant Skill overrides.

**Dependencies.** 5.3.9 (tenant_id field on learning tables already in).

#### 5.4.2 friday-gms archival executed
**Context.** Gate: 2 weeks zero rollback on FAD-native inbox per 5.3.8. Once cleared, archival mechanics execute.

**Deliverables.**
- friday-gms repo → read-only.
- `/var/www/friday-gms/` kept on VPS 90 days as rollback path.
- After 90 days: archive to object storage (rsync to off-site bucket), remove from VPS disk (recover ~3GB).
- nginx config: keep `gms.friday.mu` as alias to `/var/www/fad/` (already true since 2026-05-18). Drop any remaining `localhost:3001` proxies from fad-backend.
- pm2 ecosystem: remove `friday-gms` process. Drop the 3204-restart-count investigation as moot.
- DNS: leave `gms.friday.mu` pointing at the same IP (alias mode persists).

**Anti-goal.** Do not touch friday-gms `consult.ts`, `draft-generator.ts`, or KB-loading code on the GMS side after Sprint 10. Those calls become inbound-only from FAD; the file structure is frozen for archival.

#### 5.4.3 Properties v0.3 addendum (listing-creation flow, automation templates, etc.)
**Context.** Per 2026-05-07 Listing Creation SOP intake. ACPs `9aa525dc` (FAD frontend audit) and `344e37f2` (Channex API capability map) feed into this addendum. Their status needs checking before Sprint 11 opens.

**Deliverables.**
- Listing-creation flow: form + checklist + optional Guesty push (or Channex push, depending on cutover progress).
- Automation templates ownership in Properties module.
- Saved-replies-to-property-cards already locked; verify final mapping.
- Photo ordering UI v1 (AI-suggested is a later iteration).
- Tenant-level templating primitives: contact phone, brand, URL slug pattern.
- Auto-push rule after N reviews (trigger: property-state-based, not pricing-based; lives in Properties).

#### 5.4.4 Reservations module final stages
**Context.** v0.2 locked. Remaining: BDC extension flow template, resolution-center deep-link (phase 1 of the 3-phase plan in §5.3 of running decisions log), older-than-12-months archive query surface.

**Deliverables.**
- BDC extension create-flow template.
- Resolution-center deep-link from Reservation detail.
- Archive view: explicit query to surface reservations older than 12 months.

#### 5.4.5 Anonymization rails for KB / learnings
**Context.** Per Sprint 11 cross-session canonical. Substrate before tenant-specific signal flows upstream into the shared core KB.

**Deliverables.**
- Anonymize property codes, guest names, dates in any KB update promoted from a single tenant's learnings.
- PII-detection pass on `action_feedback.message_text` before analyzer reads it.
- Policy doc: what we will and won't share across tenants.

---

### 5.5 Sprint 12+ — Q3 2026 (July-September)

Q3 opens the channel-manager cutover (Channex), the Experiences module v1, and the CMS scoping question. This is also when Trevon arrives.

#### 5.5.1 Channex channel-manager swap (per running decisions §5.6)
**Context.** Vendor decision target end of May 2026 (after both wholesale quotes received). Channex leading; NextPax fallback. Migration model: Airbnb big-bang per-host-account, BDC per-property gradual. Production cutover target August.

**Pre-Sprint-12 prep (June-July).**
- Channex sandbox eval through June.
- Full SOP dry-run on Channex sandbox + Channex test Airbnb account.
- Written rollback plan.
- On-call team during cutover window.
- Channel manager abstraction layer (vendor-neutral) — built Phase A (per 2026-05-07 decision). Currency strategy resolved (EUR vs USD payout, FX spread investigation).

**Sprint 12 execution.**
- Airbnb cutover: low-season window (likely August). Single moment of truth.
- BDC per-property rollout: brief overlap window during switch, per `Booking.com`'s own partner help.
- Section 4/6 hybrid: Channex API first → Playwright fallback → manual checklist with deep links.
- Multi-tenant Channex model: omnibus (Friday/FridayOS holds one Channex master account, per-property API key scoping for tenant isolation).
- Cross-module impact addressed: Reservations (channel of record swap), Properties (listing CRUD shifts to Channex API), Finance (financial fields rebuild for Channex's payout/fee model).

**Anti-goal.** Don't try to migrate WhatsApp gateway in the same window. Channex covers OTA channels; WhatsApp moves to direct Meta WhatsApp Business in a separate cutover.

#### 5.5.2 Experiences module v1 (Bokun-proxy through FAD)
**Context.** Bokun is already wired on the website (Bokun REST + widgets + webhooks). v1 adds FAD-native surfaces for Friday's ops team to manage experiences without going through Bokun's admin.

**Deliverables.**
- FAD module: Experiences sidebar entry.
- Read-side: list / detail views fed from cached Bokun activity data.
- Write-side: cancel a booking, refund flow (Bokun's `POST /booking.json/{code}/cancel`).
- `/api/public/experiences/*` endpoints exposed for website's Bokun-replacement future (Bokun calls eventually route through FAD same as Guesty).

#### 5.5.3 CMS scoping (Sanity vs FAD-native)
**Context.** Website uses Sanity (`@sanity/client`) for CMS — but the dataset is currently empty (`documentCount: 0` per audit). FAD has no CMS today (hardcoded fixtures + DB). Open question: do we adopt Sanity (shared with website, per Ishant's mention), or build FAD-native CMS?

**Deliverables.**
- Decision memo. Sanity pros: hosted, structured content modeling, image CDN, paired with Next.js naturally. FAD-native pros: single-VPS deployment, no third-party CMS dependency, full control. Recommend Sanity if it's going to ship anyway on the website side; otherwise defer.
- If Sanity: shared Sanity project, FAD reads via the same client lib, Studio at `/studio` (already wired on website) extends to FAD-relevant content types.

#### 5.5.4 Marketing module Phase 1
**Context.** Mathias's module, August 2026 ship target per §4 of running decisions log. Marketing Phase 1 = pitch tier needs deepening per current state.

**Deliverables.** (Pending Mathias deepening) — pitch decks, lead-tracking pipeline integration, content calendar surface. Direct-booking review collection (per Reviews module decision: lives in Marketing module, not Reviews).

#### 5.5.5 Reviews module Phase 2 (write-through)
**Context.** Phase 1 (read-from-Reva) ships May 2026. Phase 2 (Jun-Sep 2026) = write-through. Depends on Reva auto-publish threshold function being resolved (Wave 1 Reva archive audit — Reviews scoping pack v0.2 Q1).

**Deliverables.**
- Reply-from-FAD: post review replies via channel APIs.
- Channel-side reply windows respected (Phase 2 blocker per Q3 in scoping).
- Reva auto-publish behavior replicated or replaced.

#### 5.5.6 Leads / CRM-lite
**Context.** Mathias's pitch tier module per §4 of running decisions log. Commit-by date Nitzana-driven. "Soon" timing.

**Deliverables.** (Pending Mathias deepening) — lead capture from website inquiry form, lead-to-reservation conversion flow, lifecycle pipeline.

#### 5.5.7 Full FridayOS marketplace stub at mcp.fridayos.com
**Context.** §1.4 of running decisions log. FridayOS as MCP server. Sprint 12+ ships the marketplace stub: lists what wrappers exist, what they do, OpenAPI specs, MCP manifest.

**Deliverables.**
- `mcp.fridayos.com` static site (or thin Next.js) listing the typed wrappers.
- MCP server endpoint for each wrapper (Guesty, Breezeway, Resend, Kimi, etc.).
- Per-tenant API key issuance flow.

#### 5.5.8 Trevon onboarding (August 2026)
**Context.** Stanford intern, 3-month internship. FridayOS focus, not Friday-internal Phase 1 work.

**Deliverables.**
- Pre-arrival: dev environment setup brief, FridayOS architecture orientation.
- First 2 weeks: shadowing on Sprint 12 work, FridayOS marketplace stub contributions.
- Remaining: scoped FridayOS module (likely MCP marketplace polish or a new external-tenant wrapper).

---

### 5.6 Q4 2026 — Q1 2027

Q4 opens the harder FridayOS expansions: Experiences v2 (partner platform), Ratehawk, Car rentals, Airport transfers, Reva displacement.

#### 5.6.1 Experiences v2 — partner platform (Q4 2026 / Q1 2027)
**Context.** v1 (5.5.2) proxies Bokun. v2 = partners sign up directly, Friday takes payment, pushes to partner. KYC + multi-tenant + payments scope.

**Deliverables.**
- Partner signup flow with KYC (likely Stripe Connect or Onfido).
- Friday-as-merchant-of-record: Friday's Stripe collects, partner gets payout.
- Multi-tenant payout splits.
- Partner admin portal (separate role view in FAD or standalone).
- Pricing/inventory sync to partner systems via push.

**Dependencies.** Stripe billing module live (Sprint 11 or later). KYC vendor evaluation. Multi-tenancy v0.2 (5.4.1).

#### 5.6.2 Ratehawk integration
**Context.** When it arrives — same integration-adapter pattern as Bokun. Inbound supply for Friday's experiences / transport / accommodation cross-sell.

**Deliverables.**
- Ratehawk typed wrapper.
- `/api/public/accommodations/*` (or scoped to whatever Ratehawk offers).
- MCP server adapter.

#### 5.6.3 Car rentals module
**Context.** Vertical addition. TBD scope. Likely combines local-vendor relationships + a booking surface.

**Deliverables.** (Pending scoping)

#### 5.6.4 Airport transfers module
**Context.** Vertical addition. Possibly bundled with car rentals or as standalone module.

**Deliverables.** (Pending scoping)

#### 5.6.5 Reva displacement via direct channel integrations
**Context.** Per Reviews module Phase 3 (FridayOS-era). Direct OTA channel integrations replace Reva entirely.

**Deliverables.**
- Direct Airbnb Reviews API integration.
- Direct Booking.com Reviews API integration.
- Direct Google Reviews API integration.
- Reva subscription cancellation after parity verified.

---

### 5.7 Permanent threads (off-sprint cadence)

Threads that span sprints and need ongoing ownership. Not phase-scoped.

#### 5.7.1 Mary handover (deadline 2026-05-25)
**Owner.** Ishant. Hard deadline this week per 5.1.1.

#### 5.7.2 Trevon onboarding (August 2026)
**Owner.** Ishant. Pre-arrival brief due July.

#### 5.7.3 Atlas drift checks
**Cadence.** Monthly review. After every sprint close.
**Why.** Atlas (Notion `34c43ca8849281b9a10de9f264141c37`) is the canonical infrastructure topology + agent topology + ADR home. It drifts from code reality unless actively maintained.
**Deliverables (per cadence).** Section 4 (architecture) refresh, Section 3 (mermaid) regen, ADR appendix update.

#### 5.7.4 Operating Rules drift checks
**Cadence.** After each sprint close + on demand when a new ADR locks.
**Why.** Operating Rules (Notion `34d43ca8-8492-810e-a8ae-c815655e0042`) encode procedural law. They drift as conventions evolve.
**Deliverables.** Verify §3.2, §10, §11, §12, §14, §15 still match observed practice.

#### 5.7.5 ADR maintenance
**Cadence.** New ADR per major architectural decision. Append to Operating Rules §14 + this roadmap §3.
**Why.** ADRs are locked unless re-opened. Tracking them prevents re-litigation.

#### 5.7.6 Non-engineering threads (off sprint cadence, need ownership) — from cross-session canonical
Five items flagged in cross-session roadmap canonical:
- Tourist tax registration with MRA (compliance risk, liability accruing since Oct 2025).
- GBH syndic management contract execution (no signed contract, fees uncollected, insurance gaps).
- Uri option strike repricing (before any referrals begin).
- JCI CYE 2026 submission (target was early May, status unverified).
- MCCI / Anthropic conference exploration (2026 AI wave framing).

These are Ishant-owned and not on any sprint board. Surface in monthly review.

---

## 6. Cross-cutting tracks

Track-level depth on the threads that span phases. Read alongside §5.

### 6.1 Knowledge Loop (KB) track

**Owner.** KB-side Claude (folded into bootstrap-optimization + this roadmap once Web Claude sessions go quiet).

**Status as of 2026-05-18.** Sprint 9 Phase 3 deployed. Composer plumbed. Only `inbox-drafts` surface firing shadow logs. Phase 4 (multi-surface validation + cutover) and Phase 5 (7-day burn-in) outstanding.

**Roadmap.**
- This week: Phase 4 prereq (multi-surface shadow wiring per 5.1.4). Auto-summarizer kill verification (5.1.5).
- Sprint 10: Phase 4 cutover. Phase 5 burn-in (7 days zero regression). Sprint 9 close + tag `gms-v6.33.0-sprint9-final`. Stages 3-5 of learnings loop (5.3.9). GBH-C6 syndic Skill (5.3.10). Multi-stay regression case (5.3.11). `tenant_id` on learning tables (5.3.9).
- Sprint 11: Anonymization rails (5.4.5). KB content audit pass across 74 `.json` files. Composer hot-reload mechanism (deferred from Sprint 9 per its Risks table).
- Sprint 12+: KB → MCP marketplace contribution (Composer surfaces become MCP-callable; Skills folders become MCP resources).

**Anti-goals.**
- Don't touch friday-gms `consult.ts`, `draft-generator.ts`, `action-detector.ts`, `followup-draft-generator.ts`, `learning-analyzer.ts` after Sprint 10 — these become inbound-only from FAD post-archival.
- Don't merge draft-generator + consult (the "merge marginal cost" question from cross-session canonical) until Sprint 11 — defer it.
- Don't auto-load all of Notion into bootstrap. Curate per the bootstrap-optimization brief.

### 6.2 External Integrations (the migration) track

**Owner.** Consumer-side (folded into this roadmap once Web Claude sessions go quiet).

**Status as of 2026-05-18.** §5.7 decision locked. Audits delivered both sides. Cleanup landed. ANTHROPIC + Resend wired. Single-flight mutex added. Webhook live. Properties + Reservations + Calendar frontend wired to live data.

**Roadmap.**
- Next 2 weeks: `/api/auth/token` + `/api/public/listings` + calendar sync infra (per 5.2).
- Sprint 10: full `/api/public/*` surface — availability, returning-guest, reservations write, email, ai/chat, events SSE (per 5.3). Email-service centralization complete. friday-gms inbox + reviews + translate migration to fad-backend native.
- Sprint 11: friday-gms archival executed (per 5.4.2).
- Sprint 12+: Channex cutover (per 5.5.1). Experiences v1 Bokun-proxy (per 5.5.2). MCP marketplace stub (per 5.5.7).
- Q4 2026 - Q1 2027: Experiences v2 partner platform (per 5.6.1). Ratehawk (per 5.6.2). Car rentals + Airport transfers verticals (per 5.6.3, 5.6.4).

**Anti-goals.**
- No scraping for pricing. ADR-005 locked. `scripts/guesty-scraper/scrape-pricing.mjs` scaffold marked for deletion.
- No separate auth server. FAD `/api/auth/token` IS the auth server (ADR-003).
- No new vendor integrations beyond Ishant's explicit list (Bokun for experiences, Channex for channel manager, Ratehawk for inbound supply, Sanity if shared with website).
- No Sentry / Datadog / Logflare yet. Observability layer comes later — premature for current scale.
- No Vercel for FAD. Single VPS deliberately.

### 6.3 Frontend wiring catch-up (remaining FAD module hydrations) track

**Owner.** Consumer-side.

**Status as of 2026-05-18.** Properties, Reservations, Calendar all live. Inbox is still proxied through friday-gms (will move per 6.2). Reviews is fad-backend already (`/api/reviews/list`).

**Remaining modules to hydrate (from current state vs scoped state):**
- **Operations** — fad-backend has `tasks` table + endpoints, but Operations module UI is not fully hydrated. Need to verify Tasks sub-tab on Property detail (Properties v0.2 lock), Operations queue/list, Projects kanban. Owner: Consumer-side, queued for Sprint 10.
- **Finance** — live with additions in flight per §5.1 of running decisions log. Mathias-additions ACP brief queued for Sprint 10 (5.3.12).
- **HR** — live, no immediate work.
- **Analytics** — June 2026 ship target. Cross-module dashboards. Scoping not yet locked.
- **Owners essentials** — May 2026 ship target. Mary + Mathias jointly → Ishant completes. Statement review + send flow.
- **Owners full portal** — September 2026 ship target. Same-app role-scoped views.
- **Reviews module Phase 1** — May 2026 ship per Reviews v0.2 lock. Confirm shipped before Sprint 10 opens.
- **Guests** — July 2026 ship target. Mathias (lifecycle) + Mary (admin slice). Mary's slice captured in 5.1.1 knowledge dump.
- **Marketing** — August 2026 ship. Per 5.5.4.
- **Intelligence** — August 2026 ship. AI agent layer. Pitch tier.
- **Training** — May 2026 ship. Cross-cutting per module, no standalone scope.
- **Syndic** — Q1 2027 ship. Tease tier.
- **Interior** — Q2 2027 ship. Tease tier.
- **Agency** — TBD. Tease tier.

### 6.4 Infrastructure track

**Owner.** Ishant + Consumer-side.

**Active items:**
- **Deploy-user bootstrap.** Fast-follow 3 from Sprint 9 Phase 3 close — SSH key on `deploy` user (Option A, recommended) vs webhook endpoint (Option B). Affects all future deploys. Pending Ishant decision per cross-session canonical. **Recommend Option A.** If/when SSH issues recur, Option B is the fallback.
- **VPS disk housekeeping.** 88% full as of 2026-05-17. Likely log accumulation + `/var/www/friday-dashboard-WRONG-FAD-OVERWRITE-20260514` forensic snapshot (delete after a week if nothing else points there) + `/var/www/friday-dashboard-apr10-snapshot` (Apr 10 GMS backup, keep). Schedule cleanup once Phase 4 is out the door.
- **friday-gms PM2 restart count = 3204** as of 2026-05-17. Root cause not investigated. Ecosystem config committed but not activated; needs `pm2 delete + pm2 start ecosystem.config.js`. Schedule with Phase 4 deploy. Moot once Sprint 11 archives friday-gms.
- **friday-gms archival mechanics.** Per 5.4.2. 90-day on-VPS retention + object-storage archive.
- **Notion-as-secrets-vault setup.** Strategic intent per Ishant. Prerequisites: restricted teamspace + rotation drill. Decision deferred until after Sprint 11 archival lands (less stuff to vault if friday-gms goes first). Park as a Q3 2026 thread.

---

## 7. Open questions / decisions pending

Listed with assignee + by-when. Inherited from cross-session canonical + this session's findings.

| # | Question | Assignee | By-when | Notes |
|---|---|---|---|---|
| 1 | Ishant's Upstash provisioning on website | Ishant | This week | Either Upstash.io login or Vercel Marketplace. Until done OR `/api/auth/token` ships, website continues bleeding cold-start mints. Now strictly optional given §5.7 plan supersedes Upstash. |
| 2 | ANTHROPIC_API_KEY mint | Ishant | **DONE 2026-05-18** | Just wired in fad-backend `.env`. Unblocks `email/classifier.js`. |
| 3 | GMS_AUTH_TOKEN disposition | friday-gms team | Defer | FAD reads it but friday-gms never validates. Flag for friday-gms team to wire if/when service-to-service auth matters. Moot post-archival. |
| 4 | Notion-vault page-restriction verification | Ishant | Before Q3 2026 | Restricted teamspace setup + rotation drill prerequisites for using Notion as secrets vault. |
| 5 | Push-notifications fire-point UX | Ishant | This week | 2s-delayed banner vs Settings-only opt-in. Decide before F3 ships. |
| 6 | Dictation PWA-vs-tab user test outstanding | Ishant | This week | Test iOS PWA vs Safari tab at `admin.friday.mu/fad`. Resolves whether `network` error is PWA-specific or VPN/network-side. |
| 7 | Merge marginal cost — fold draft-generator + consult into Sprint 10 tool-calling or defer | KB-side / Consumer-side | Sprint 10 open | Per cross-session canonical. Defer to Sprint 11 recommended. |
| 8 | stz-api kill execution in Guesty admin | Consumer-side | This week | Authorized per §6.5 of cross-session canonical. Pending action. Already authorized — just execute. |
| 9 | Deploy path for Judith (SSH key on `deploy` user vs webhook endpoint) | Ishant | This week | Open from Sprint 9 Phase 3 close. Option A recommended. |
| 10 | Currency strategy resolution (EUR vs USD payout) | Ishant + Consumer | Before Sprint 12 | Per 2026-05-07 Channex update. FX spread investigation needed across Airbnb + Booking.com. Cross-cuts Channex setup, FAD Finance, Properties currency field, FridayOS tenant config. |
| 11 | Reva auto-publish threshold function | Wave 1 Reva archive audit | Sprint 10 open | Resolves Reviews scoping pack v0.2 Q1. Drives Phase 2 decision (replace via Marketing widget pipeline / drop entirely / scope conditionally). |
| 12 | CMS adoption — Sanity vs FAD-native | Ishant | Q3 2026 | Per 5.5.3. Decision memo before Sprint 12+ opens. Recommend Sanity if it's going to ship anyway on website side. |
| 13 | Status of 2026-05-07 ACPs `9aa525dc` (FAD frontend audit) and `344e37f2` (Channex API capability map) | Ishant | This week | Both due 30-60min ETA from dispatch. Slack D0AERDED95J on completion. Status unknown. Feed into Properties v0.3 addendum. |

---

## 8. Anti-goals

Explicit list of what we're NOT doing in this horizon. Surfaced so they don't sneak back in.

1. **No touching friday-gms `consult.ts` / `draft-generator.ts` / `action-detector.ts` / `followup-draft-generator.ts` / `learning-analyzer.ts` / KB-loading code on the GMS side after Sprint 10.** Those calls become inbound from FAD only post-archival. File structure freezes for archival.
2. **No scraping for pricing.** API + calendar webhook is the path. `scripts/guesty-scraper/scrape-pricing.mjs` scaffold is obsolete; delete in a follow-up commit once `guesty_calendar` populated.
3. **No separate auth server.** FAD's `/api/auth/token` IS the auth server. Don't introduce a second JWT issuer or a third-party auth service.
4. **No Sentry / Datadog / Logflare yet.** Observability layer comes later — premature for current scale. Current logging is `console.warn` + pm2 logs + Slack feedback fan-out.
5. **No Vercel for FAD.** Single VPS deliberately. Website lives on Vercel; FAD does not.
6. **No new vendor integrations beyond Ishant's explicit list.** That list: Bokun (experiences v1+v2), Channex (channel manager swap), Ratehawk (Q4 inbound supply), Sanity (shared CMS, maybe). Everything else needs explicit Ishant approval.
7. **No PR-based workflow.** Direct push to master / sprint branch. Per §3.9.
8. **No feature branches unless explicitly asked.**
9. **No Web Claude sessions for KB-side or Consumer-side after their final-state handover Notion pages land.** They go quiet. All future work routes through Claude Code sessions on the repo.
10. **No further Guesty refactor on the website side.** Per ack reply confirmed today.
11. **No Kimi dedupe on website side.** Same.
12. **No Stripe wiring on website side.** Same.
13. **No new vendor integrations on website side.** Same.
14. **No `/api/availability` cache on website side.** Same (gets replaced by FAD's `/api/public/availability` per 5.3.1).
15. **No Optimizing Sprint 9 prompt iteration further before Phase 4 cutover.** Lock the prompts; observe shadow-data divergence; iterate after data shows where to focus.
16. **No multi-tenant routing beyond v0.2 in Sprint 11.** External onboarding (August) gates on v0.2. Don't pre-build v0.3 features.
17. **No silent fallbacks.** Errors raise explicitly. Catch-alls hide root causes (per global CLAUDE.md rules).
18. **No premature abstraction.** Smallest change that solves the problem. Don't abstract before the second use case lands.
19. **No GitHub Actions / CI gates.** Direct push to master, VPS auto-pulls + builds. Verify locally before push (per global CLAUDE.md rules).
20. **No public marketing of FridayOS before Sprint 12+ marketplace stub.** Private alpha tenants only until then.

---

## 9. References

### 9.1 Notion (canonical)
- Active Work zone: https://www.notion.so/35243ca8849281ce9781ccc214d6a595
- **This roadmap (Notion mirror):** to be created under Active Work with icon 🗺️ titled `Consolidated FAD/GMS Roadmap — 2026-05-18`
- Cross-session roadmap canonical 2026-05-17: https://www.notion.so/36343ca8849281b595f1fa2d455408a5
- Sprint 9 — GMS Knowledge Architecture Refactor: https://www.notion.so/36143ca88492813b9cd4ce5cf2c99f97
- Sprint 9 — Phase 3 Close + Handover (2026-05-17): https://www.notion.so/36343ca88492818498cce496b3fc5dcf
- FAD Running decisions log: https://www.notion.so/34f43ca88492819f8284ea6a89e8624e
- FAD Code Session Handover 2026-05-14: https://www.notion.so/36043ca88492817a99bbe24b003e3e13
- FAD Code Session Handover 2026-05-18: https://www.notion.so/36443ca8849281eb834ddbcf1154e777
- Friday System Atlas: https://www.notion.so/34c43ca8849281b9a10de9f264141c37
- FAD Code Index: https://www.notion.so/35143ca88492810d9a73d46b0101c436
- Claude Operating Rules: https://www.notion.so/34d43ca884928110a8aec815655e0042
- FAD Scoping index: https://www.notion.so/34f43ca88492812baca2def8dd92eb27
- FAD Module Build Tracker: https://www.notion.so/35143ca8849281a6ae13c23872e54507
- Properties module v0.2 (LOCKED): https://www.notion.so/34f43ca8849281f3a130f7def80a7c5d
- Reservations module v0.2 (LOCKED): https://www.notion.so/34f43ca884928188a83ad290b1a13b1b
- Reviews module v0.2: https://www.notion.so/34f43ca8849281ec9a08eb46c3779831
- Channel Manager Decision Memo: https://www.notion.so/35943ca88492818883d3fcefd8bb5e02
- V2 KB Locked Drafts: https://www.notion.so/35e43ca88492814daa2ceae92bf7c6b6
- Sprint 7 v3 plan: https://www.notion.so/34f43ca88492815380d0d0dce19cb53c

### 9.2 Audit docs (committed to repos)
- FAD external connections audit: `/Users/judith/repos/friday-admin-dashboard/EXTERNAL-CONNECTIONS-AUDIT-FAD-2026-05-18.md` (branch `fad-rebuild`, commit `22a2dfd`)
- Website external connections audit: `/Users/judith/Friday Website/EXTERNAL-CONNECTIONS-AUDIT-2026-05-18.md` (master commit `9c62f1b` on website repo)
- Push notifications proposal: `/Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os/docs/handover/2026-05-18-push-notifications-proposal.md`
- Bootstrap-optimization brief: `/Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os/docs/handover/2026-05-18-bootstrap-optimization-brief.md`
- FAD-rebuild branch mirror of handover briefs (cross-branch discoverability): commit `f1edae8`

### 9.3 Memory files (auto-loaded per FAD session)
- `~/.claude/projects/-Users-judith-repos-friday-admin-dashboard/memory/MEMORY.md` (index)
- `~/.claude/projects/.../memory/fad_greenfield.md`
- `~/.claude/projects/.../memory/fad_product_direction.md`
- `~/.claude/projects/.../memory/fad_finance_decisions.md`
- `~/.claude/projects/.../memory/fad_access_and_auth.md`
- `~/.claude/projects/.../memory/fad_deploy_paths.md`
- `~/.claude/projects/.../memory/fad_gms_dependency_map.md`
- `~/.claude/projects/.../memory/fridayos_design_saas.md`
- `~/.claude/projects/.../memory/matias_commercial_lead.md`
- `~/.claude/projects/.../memory/git_push_discipline.md`
- `~/.claude/projects/.../memory/git_author_convention.md` (added 2026-05-18)

### 9.4 Repo CLAUDE.md
- `/Users/judith/repos/friday-admin-dashboard/CLAUDE.md` — per-repo agent context (sprint 7 A3)
- `/Users/judith/repos/friday-admin-dashboard/.claude/worktrees/dreamy-shaw-6eba1b/CLAUDE.md` — worktree-local override (this session)

### 9.5 Operating Rules sections referenced
- §3.2 — Investigation before implementation
- §3.3 — No parallelization across waves
- §5 — 3-file Judith dispatch pattern
- §10 — Brief-writing gates must be executable
- §11 — Brief-writing failures + recovery
- §12 — Sprint close ritual
- §14 — ADRs locked (001 API-first, 002 FridayOS 3-layer, 003-010 added this roadmap)
- §15 — Ishant working preferences (terse, push back, web-search, surface tradeoffs)
- §16 — Artifact lifecycle (Active Work → Archive)

### 9.6 Active Sprint 9 + handover artifacts (Judith workspace)
- `~/judith/active-tasks/sprint9-brief.md`
- `~/judith/active-tasks/sprint9-fast-follows.md`
- `~/judith/active-tasks/sprint9-phase3-output.md`
- `~/judith/active-tasks/sprint9-phase3-readback.md`
- `~/judith/active-tasks/sprint9-phase4-brief.md`
- `~/judith/active-tasks/guesty-hotfix.md`
- `~/judith/session-context.md`
- `~/judith/handovers/2026-04-28-sprint7-investigation.md`
- `~/judith/handovers/2026-04-28-bug-vs-sprint-dedup.md`
- `~/judith/reference/listing-creation-sop-2026-05-07.md`

### 9.7 ACP briefs in flight
- `9aa525dc` — FAD frontend audit (2026-05-07, 30-60min ETA, Slack D0AERDED95J on completion)
- `344e37f2` — Channex API capability map (2026-05-07, 30-45min ETA, Slack D0AERDED95J on completion)
- Mathias-additions ACP brief (sibling page in FAD Scoping; covers payout reconciliation engine, special-offer detector, approval routing rebuild)

---

*End of consolidated roadmap. Update protocol: edit when phases ship, append dated entries for major scope changes, preserve all dated headers. Mirror to Notion on every material update.*
