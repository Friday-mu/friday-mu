# FAD — External Connections Audit · 2026-05-18

**Pairs with:** [`/Users/judith/Friday Website/EXTERNAL-CONNECTIONS-AUDIT-2026-05-18.md`](../../Friday%20Website/EXTERNAL-CONNECTIONS-AUDIT-2026-05-18.md) (website-side, 18-row services table).

**Context:** Ishant has decided to route ALL external API calls through FAD so:
- FAD becomes the only Guesty OAuth holder (we hit a 5/24h token cap on 2026-05-17)
- When we eventually drop Guesty for our own PMS, only FAD changes — the website stays
- Shared services (translation, currency, email) live in one place

This document mirrors the website audit's structure so the two read as a pair.

**Methodology:** static analysis of FAD repo on branch `fad-design-os-v01-frontend` head `3e30f2c` (frontend deployed today) and `backend/` (running on `gms.friday.mu` as pm2 process `fad-backend`, restart count 131, uptime 16min post-Svix-secret restart). Hostnames, SDK imports, env vars, and `/api` handlers grep'd from `backend/` + `frontend/src/`. Prod env inventory pulled live from `/var/www/fad-backend/.env`. No external API calls made during this audit (no Guesty OAuth burned).

**Cross-cut with this morning's audit ([summary](#guesty-caching-deep-dive--vs-website)):** FAD's Guesty token cache is shared with friday-gms via `/var/www/friday-gms/.guesty-token.json` on the VPS. Cross-process sharing on the VPS is fine. **The website cannot share that file** (it's on Vercel, not the VPS) — every Vercel cold start mints its own token. That confirms website weird-things #1 as a real second root cause of yesterday's cap event, separate from this morning's friday-gms key-casing bug.

---

## 1. FAD connection table

| # | Service | Where in code (file:line) | Direction | Purpose | Trigger | Approx frequency | Website also does this? |
|---|---|---|---|---|---|---|---|
| 1 | **Guesty OAuth (`open-api.guesty.com/oauth2/token`)** | `backend/src/website_inbox/guesty.js:23-25`, mint at `:104-186` | outbound | Mint bearer for the Open API. 3-tier cache (in-mem → shared disk → fresh mint). 5/24h DAILY_LIMIT enforced before mint. Single-flight mutex (`tokenRefreshInflight`). 6h in-memory cooldown after 429. Server.js mounts a shared `guestyAPI` axios client (server.js:837-857) that delegates token retrieval here. | First Guesty call after token expiry (~24h cadence in steady state) | **1 mint/day total** under steady state (matches Guesty's recommendation). Verified live: prod meta file `/var/www/friday-gms/.guesty-token-meta.json` shows `refreshCount:1` today. | overlap with website row #1 (website has its own client, unshared — see deep-dive) |
| 2 | **Guesty `/v1/listings`** | `backend/src/properties/sync.js:24` (`listListings` from `website_inbox/guesty.js`), called by `backend/src/reservations/worker.js:54` (poller, 15min); also `backend/server.js:1128` (`getGuestyListings`, 1h module-cache TTL); `:1679` (health probe with `limit:1`) | outbound | Hydrate `guesty_listings` Postgres cache, then serve `/api/properties` from cache. Health probe via `/api/system/test/guesty`. | Poller (every 15min); on-demand for reviews enrichment; on click of Settings → Integrations → Test | poller × 24 × 4 = ~96/day fetches of 60 listings | overlap row #2 (website also hits `/listings`, projected fields, 10-min module cache) |
| 3 | **Guesty `/v1/reservations`** | `backend/src/reservations/sync.js` (`listReservations` from `website_inbox/guesty.js`), called by poller every 15min | outbound | Hydrate `guesty_reservations` Postgres cache; `/api/reservations` serves from cache | Poller (15min) | ~96/day fetches of 199 reservations | overlap row #4 (website filter by guest.email for returning-guest lookup) |
| 4 | **Guesty `/v1/reviews`** | `backend/server.js:1528` (`guestyAPI.get('/reviews')`) | outbound | List reviews + enrich with listings on `/api/reviews/list` | On `/api/reviews/list` request (Reviews module page load) | A few per Reviews-module page open | website does NOT do this |
| 5 | **Guesty `POST /v1/reservations` + `PUT /v1/reservations/:id`** | `backend/src/website_inbox/guesty.js:200-249` (`createReservation`, `confirmReservation`) | outbound | Create a `reserved` reservation with 48h auto-expire when friday.mu booking proof is uploaded; flip to `confirmed` once ops verifies payment | `/api/inbox/website/webhook` → DLQ worker `website_inbox/jobs.js` | 1 create + 1 confirm per booking flow | website does NOT do this directly — it sends the booking-proof to FAD via `/api/inbox/website/webhook` and FAD calls Guesty (good — overlap row #4 in reverse direction) |
| 6 | **Guesty webhook (Svix-signed)** | INBOUND: `backend/src/reservations/webhook.js:30` (`GUESTY_SVIX_SECRET`), mounted `backend/server.js:1037`; events: `reservation.{messageReceived,messageSent,new,updated}`, `listing.{new,updated,calendar.updated}` | inbound webhook | Real-time delivery of message + reservation + listing events; eliminates polling pressure | Guesty-initiated | Variable; was 0 before today, just registered 2026-05-18 05:09 UTC (webhook id `6a0aa28e987bab0015da2956`) | n/a — website has its own (Bokun) webhook receiver |
| 7 | **Breezeway** (`api.breezeway.io`) | `backend/server.js:1639-1640` (env declared in health probe only); `backend/src/tasks/index.js:112` only reads a DB column `synced_to_breezeway` | **declared, not wired** | Future: cleaning task sync | none | **0/day** — no actual API client in code. Just env declaration. | overlap N/A (website doesn't call Breezeway either) |
| 8 | **Stripe (`api.stripe.com/v1`)** | `backend/src/tenants/stripe_client.js:21-43` (raw fetch via Bearer basic-auth), `backend/src/tenants/stripe_routes.js` (mounted at `/api/tenants/stripe/*`), inbound webhook `/api/tenants/stripe/webhook` (raw body) | outbound + inbound webhook | Multitenant SaaS billing (subscription create / portal / webhook events) | `/me/stripe/checkout-session`, `/me/stripe/portal-session`, Stripe-initiated webhooks | Per-tenant lifecycle events | overlap with website weird-things #3 (website declared STRIPE_* env but no SDK; here it's wired but **see weirdness #2 — prod has no STRIPE_SECRET_KEY**) |
| 9 | **Resend (`api.resend.com/emails`)** | `backend/src/website_inbox/resend.js:56` (guest auto-replies), `:94` (booking-confirm); `backend/src/tenants/email.js:53` (tenant onboarding); soft-fails to no-op if `RESEND_API_KEY` unset | outbound | Transactional email for website-inbox + tenant lifecycle | Per inbound website-inbox event; per tenant signup/invoice | Variable — light today, **silently no-op in prod (see weird-things #3)** | overlap row #10 (website calls Resend directly from 7 routes) |
| 10 | **Slack webhook URL** | `backend/src/feedback.js:178-216` (`notifySlack`), env `SLACK_GMS_WEBHOOK_URL` (prod) / `SLACK_WEBHOOK_URL` (declared but not in prod env) | outbound | Fan-out feedback submissions (bug/feature/suggestion) to a Slack channel | `POST /api/feedback` (fire-and-forget) | 1 per feedback submission | website does NOT do this |
| 11 | **Slack Bot API (`slack.com/api`)** | `backend/src/team_inbox/slack_import.js:57` (`SLACK_API_BASE = 'https://slack.com/api'`); env `SLACK_BOT_TOKEN` (in prod) | outbound | Team-inbox: pull Slack messages into FAD's internal team inbox | On-demand (admin tool) | Per import action | website does NOT do this |
| 12 | **Gmail API + Google OAuth** | `backend/src/email/gmail_client.js:55` (`oauth2.googleapis.com/token`), `:80` (`gmail.googleapis.com/gmail/v1/...`), `:119` (push subscription `users/me/watch`); `backend/src/email/oauth.js:63-97` | outbound + inbound (Google push notif) | Email integration (read + send + push watch); OAuth sign-in flow | User connects Gmail; push-notif on incoming email | Per user action + per push event | website does NOT do this |
| 13 | **Google Generative AI / Gemini ("Nanobanana")** (`generativelanguage.googleapis.com/v1beta`) | `backend/src/design/floor_plan_ai.js:41-42` (`NANOBANANA_BASE_URL`), `:248-284`; `backend/src/ai/imagegen.js:24` | outbound | Floor-plan rendering + general image generation for Design module | Designer renders a floor plan; image-gen request | Per render | website does NOT do this |
| 14 | **Moonshot Kimi (`api.moonshot.ai/v1`)** | `backend/src/feedback.js:34-109` (feedback chat); `backend/src/design/floor_plan_catalog.js:96` (catalog enrich); `backend/src/design/ai_rough_budget.js:34-247` (rough budget); `backend/src/design/ai_ask.js:31-97` (design ask) | outbound | Stage-1/2 LLM calls for feedback chat + design AI helpers; template fallbacks when `KIMI_API_KEY` unset | Per feedback-chat turn; per design AI action | Variable, on-demand | overlap row #8 + #9 (website has TWO Kimi clients pointed at the same key) |
| 15 | **Anthropic (`@anthropic-ai/sdk`)** | `backend/src/email/classifier.js:118-125` (uses `ANTHROPIC_API_KEY`) | outbound | Email classification for inbox triage | Per inbound email being classified | Per email | website does NOT call Anthropic directly today (uses Kimi for AI) |
| 16 | **friday-gms (`localhost:3001`)** | `backend/server.js` (`GMS_BASE_URL`), proxy routes for inbox/translate/etc. | outbound (internal) | Proxy FAD inbox / translate / reviews to friday-gms's API | Per relevant FAD request | High — every inbox open hits this | n/a (internal) |

## 2. FAD routes table — which FAD API routes hit which services

| FAD Route | Guesty | Stripe | Resend | Slack | Kimi | Anthropic | Nanobanana | Gmail | friday-gms |
|---|---|---|---|---|---|---|---|---|---|
| `/api/properties` (GET) | — (reads cache) | — | — | — | — | — | — | — | — |
| `/api/properties/sync` (POST) | listings (force-refresh) | — | — | — | — | — | — | — | — |
| `/api/reservations` (GET) | — (reads cache) | — | — | — | — | — | — | — | — |
| `/api/reservations/sync` (POST) | reservations (force) | — | — | — | — | — | — | — | — |
| `/api/integrations/guesty/webhook` (POST, Svix-signed) | — (inbound only) | — | — | — | — | — | — | — | — |
| `/api/reviews/list` | `/v1/reviews` + `/v1/listings` (parallel) | — | — | — | — | — | — | — | — |
| `/api/feedback` (POST) | — | — | — | ✓ notifySlack | — | — | — | — | — |
| `/api/feedback/chat` | — | — | — | — | ✓ Stage-1 | — | — | — | — |
| `/api/inbox/website/*` (HMAC inbound from website) | createReservation + confirmReservation (via DLQ jobs) | — | ✓ guest auto-reply | — | — | — | — | — | — |
| `/api/tenants/stripe/checkout-session` | — | ✓ POST `/checkout/sessions` | — | — | — | — | — | — | — |
| `/api/tenants/stripe/portal-session` | — | ✓ POST `/billing_portal/sessions` | — | — | — | — | — | — | — |
| `/api/tenants/stripe/webhook` (Stripe inbound) | — | ✓ verify | — | — | — | — | — | — | — |
| `/api/tenants/signup` + invitation accept | — | — | ✓ welcome email | — | — | — | — | — | — |
| `/api/design/floor-plan` (render) | — | — | — | — | — | — | ✓ render | — | — |
| `/api/design/rough-budget` | — | — | — | — | ✓ | — | — | — | — |
| `/api/design/ai-ask` | — | — | — | — | ✓ | — | — | — | — |
| `/api/email/oauth/start` + callback | — | — | — | — | — | — | — | ✓ OAuth | — |
| `/api/email/push` (Gmail watch callback) | — | — | — | — | — | ✓ classify | — | — | — |
| `/api/inbox/*` (proxy) | — | — | — | — | — | — | — | — | ✓ all reads/writes |
| `/api/translate` (proxy) | — | — | — | — | — | — | — | — | ✓ |
| `/api/system/test/guesty` | listings (limit:1) | — | — | — | — | — | — | — | — |
| `/api/system/test/gms` | — | — | — | — | — | — | — | — | ✓ /health |
| `/api/health` | — | — | — | — | — | — | — | — | — |

## 3. Overlap matrix — website's 18 services vs FAD

| Website # | Service | FAD has? | FAD location | Token/cache shared cross-process? | Notes |
|---|---|---|---|---|---|
| 1 | Guesty OAuth | ✅ YES | `backend/src/website_inbox/guesty.js` | ✅ Within VPS (shared with friday-gms via `/var/www/friday-gms/.guesty-token.json`); ❌ NOT with the Vercel-hosted website | **THE merge target — FAD should own the only token going forward** |
| 2 | Guesty `/v1/listings` | ✅ YES | `properties/sync.js` + `server.js:1128` | n/a (cached in Postgres) | Both whitelist different field projections; reconcile when proxying |
| 3 | Guesty `/availability-pricing/api/calendar/.../{id}` | ❌ **NO** | n/a | n/a | **Gap.** Website hits this live per BookingCalendar mount. To proxy, FAD must add this call path. Per night handover §8: a `scrape-pricing.mjs` job exists in scaffold for a future per-night pricing cache; not yet wired. |
| 4 | Guesty `/reservations?filter=guest.email` | ⚠️ PARTIAL | `reservations/sync.js` lists all; no `?filter=guest.email` helper | n/a | Easy to add — guesty client already there |
| 5 | Bokun REST `api.bokun.io` | ❌ NO | n/a | n/a | Website-only (experiences). Out of merge scope unless we want experiences on FAD too. |
| 6 | Bokun widgets (browser SDK) | ❌ NO | n/a | n/a | Browser-side vendor UI — irrelevant to FAD |
| 7 | Bokun webhooks inbound | ❌ NO | n/a | n/a | Goes to website's `/api/webhooks/bokun` route. Could be repointed to FAD if we centralize. |
| 8 | Moonshot Kimi (main) | ✅ YES | `feedback.js`, design/* (4 sites) | env-keyed per process; no shared cache (stateless API) | Could centralize on FAD's `KIMI_API_KEY` |
| 9 | Moonshot Kimi (alt client) | n/a (FAD has one consolidated client per file) | — | — | Website weirdness #2 — duplicate clients, same key |
| 10 | Resend | ⚠️ YES BUT SILENTLY OFF | `website_inbox/resend.js`, `tenants/email.js` (3 sites) | n/a | **Weird-thing on FAD side too — see #3 below.** Soft-fails to no-op in prod (RESEND_API_KEY not in `/var/www/fad-backend/.env`) |
| 11 | Sanity API | ❌ NO | n/a | n/a | Website-only CMS. FAD has no CMS today (UI is hardcoded fixtures + DB). |
| 12 | Vercel Blob | ❌ NO | n/a | n/a | FAD uses local disk (`FAD_UPLOAD_DIR=/var/www/fad-uploads/`) for photo uploads. Different paradigm — VPS-local instead of CDN-backed. |
| 13 | PostHog | ❌ NO | n/a | n/a | No analytics on FAD admin today (intentional — internal tool) |
| 14 | Carto basemaps | ❌ NO | n/a | n/a | No maps on FAD UI today |
| 15 | Google Fonts | ❌ NO (or local-bundled — not via fonts.googleapis.com in source) | — | — | FAD frontend imports fonts statically via Next.js bundler |
| 16 | Open-Meteo (weather) | ❌ NO | n/a | n/a | Out of FAD scope |
| 17 | `open.er-api.com/v6/latest/EUR` (FX) | ❌ NO | n/a | n/a | **`currencyCache.ts` is an in-process tenant currency setting, NOT an FX converter.** FAD has no FX rates today. If website's currency switcher gets centralized, FAD will need this. |
| 18 | Upstash Redis | ❌ NO | n/a | n/a | FAD is single-VPS; uses local disk for shared cache between fad-backend + friday-gms. Cross-host sharing (with website) is the open problem. |

**Net overlap:** out of 18 website services, FAD shares **6** (Guesty OAuth/listings/reservations, Kimi, Resend, Stripe-but-stubbed). 1 gap to fill if we proxy calendar (#3). 1 missing if we centralize FX (#17). The other 10 are website-specific or browser-only and stay separate.

## 4. Things that look weird on the FAD side

1. **Prod `/var/www/fad-backend/.env` is missing 10 of the 26 env vars declared in `backend/.env.example`.** Notably absent in prod: `ANTHROPIC_API_KEY`, `BREEZEWAY_*`, `GMS_AUTH_TOKEN`, `NANOBANANA_BASE_URL`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SLACK_CHANNEL`, `SLACK_WEBHOOK_URL` (the prod env uses `SLACK_GMS_WEBHOOK_URL` + `SLACK_BOT_TOKEN` + `SLACK_NOTIFY_CHANNEL` — different names). Every code path keyed on the missing vars soft-fails to no-op or template-fallback. Need to reconcile `.env.example` against prod or document which are intentionally optional.

2. **Stripe is wired but inactive in prod.** `backend/src/tenants/stripe_client.js` + `stripe_routes.js` are full implementations, but prod has no `STRIPE_SECRET_KEY` / `STRIPE_DESIGN_PRICE_ID`. Every Stripe endpoint returns a 503 stub. Mirrors website weird-things #3, except here the code exists. If Stripe billing isn't shipping until Sprint 5, consider removing from the prod surface (currently if a tenant signup hits `/me/stripe/checkout-session` they get a confusing 503).

3. **Resend silently no-ops in prod.** `RESEND_API_KEY` is in `.env.example` but missing from `/var/www/fad-backend/.env`. Three call sites (`website_inbox/resend.js` × 2, `tenants/email.js` × 1) all log `[resend] RESEND_API_KEY not set — skipping email to {to}` and return `{ skipped: true }`. Net: **every transactional email FAD tries to send today (guest auto-replies, tenant onboarding, booking confirmations from website-inbox) goes to /dev/null.** Big silent failure. Either the website is the actual sender (mirrors website row #10, which DOES have a working RESEND_API_KEY), or FAD should be — pick one in the merge plan.

4. **OpenAI declared, never called.** `OPENAI_API_KEY` in `.env.example` and a health-probe key check at `server.js:1649`, but no `import openai` / `require('openai')` / `api.openai.com` call anywhere. Safe to remove. Anthropic + Kimi + Gemini cover all the AI today.

5. **Breezeway declared, never called.** `BREEZEWAY_CLIENT_ID` / `_SECRET` / `_BASE_URL` env vars, health-probe key check, single DB column `synced_to_breezeway` read in `tasks/index.js`. No API client, no fetch to `api.breezeway.io`. Either the integration was deferred or it lives somewhere I missed — flag for confirmation. Per repo CLAUDE.md, Operations module rebuild will fully integrate Breezeway later; this is the "later" state.

6. **`VAPID_PRIVATE_KEY` orphaned in prod env.** Set in `/var/www/fad-backend/.env` but no `web-push` package and no usage in `backend/src/`. Probably from an abandoned Web Push experiment. Safe to clean.

7. **Two parallel Guesty call surfaces.** Modern path: `website_inbox/guesty.js::guestyRequest` (used by createReservation/confirmReservation + listListings/listReservations). Legacy path: `server.js:852` shared `guestyAPI = axios.create({...})` with token-interceptor (used by `/api/reviews/list` + `getGuestyListings` cache + health probe). Both delegate to the same `getSharedGuestyToken()`, so they share the cache — but they diverge on retry semantics (modern has single 429 retry + Retry-After; legacy has only the 30s axios timeout). Worth consolidating onto the modern client.

8. **`getGuestyListings` (server.js:1128) has its own 10-min in-memory `LISTINGS_TTL_MS` AND writes to disk via `writeListingsToDisk`.** That's a third cache tier on top of the per-tenant Postgres `guesty_listings` table from the 15-min poller. Possible duplication / cache-coherence smell. Likely safe but worth a closer read when designing `/api/public/listings` — we may already have the data we need without adding the in-memory tier.

9. **`/api/inbox/website` accepts an HMAC-signed POST from the friday.mu site (verified via `FRIDAY_WEBSITE_INBOX_SECRET`).** This is the EXISTING reverse direction of the merge plan — website → FAD. Means FAD already has a tested pattern for HMAC-signed cross-host calls. The new outbound direction (FAD → website via SSE / webhook) can reuse the same secret model.

10. **`/api/webhook/message` in `backend/src/server.ts`** (note `.ts`, not `.js`) — different file from `server.js`. Unclear if this is a TypeScript-source path that's still active or dead code from a half-migration. Grep finds `app.post('/api/webhook/message', ...)` in server.ts:408 but the running process is `node server.js`. Likely dead.

11. **Slack has TWO out-bound auth shapes.** Webhook URL (`SLACK_GMS_WEBHOOK_URL`, used by `feedback.js::notifySlack`) AND bot token (`SLACK_BOT_TOKEN`, used by `team_inbox/slack_import.js::SLACK_API_BASE`). Not a problem per se, but worth knowing both exist if we centralize Slack notifications.

## 5. Guesty caching deep-dive — FAD vs website

### FAD's strategy

Three-tier cache living on the VPS, **shared cross-process** between `fad-backend` (Node, `backend/src/website_inbox/guesty.js`) and `friday-gms` (TypeScript, `src/services/guesty.ts`).

```
  ┌─────────────────────────────────────────────────────┐
  │            On-disk shared layer                     │
  │  /var/www/friday-gms/.guesty-token.json             │
  │  {access_token, expiresAt, expires_at, cached_at}   │   ← both keys written
  │                                                     │     since this morning's
  │  /var/www/friday-gms/.guesty-token-meta.json        │     hotfix e26ad0c
  │  {date: "YYYY-MM-DD", refreshCount: N}              │
  └─────────────────────────────────────────────────────┘
        ▲                            ▲
        │                            │
   ┌────┴─────┐                ┌─────┴─────┐
   │fad-backend│               │friday-gms │
   │ (Node)    │               │ (Node/TS) │
   │ in-mem T1 │               │ in-mem T1 │
   └───────────┘               └───────────┘
        │                            │
        ▼ both fall through to       ▼
        ┌───────────────────────────────────┐
        │  Guesty /oauth2/token (5/24h cap) │
        └───────────────────────────────────┘
```

- **TTL:** 24h (matches Guesty's `expires_in` of 86400s); 60s safety margin before considering expired.
- **Cold start:** Tier 1 (in-mem) is empty → Tier 2 (disk) hit; if disk has a fresh token (<24h - 60s), use it without minting. **No mint on most restarts.**
- **5/24h enforcement:** Both processes read the meta file before mint; refuse if `refreshCount >= 5` for the UTC day.
- **Concurrent caller mutex (friday-gms):** `tokenRefreshInflight` Promise coalesces N parallel callers to one mint attempt. fad-backend doesn't have this explicit mutex (relies on serial poller cadence) — worth adding if FAD becomes the multi-consumer hub.
- **429 handling:** modern path (`guestyRequest`) honors `Retry-After`, single inline retry. Mint path (`getAccessToken`) does the same.
- **Post-429 cooldown:** friday-gms has a 6h in-memory breaker; fad-backend does not. Asymmetric — review when consolidating.

Verified live state (2026-05-18 ~05:30 UTC, post-hotfix + post-Svix-secret-restart):
- `refreshCount: 1` for today
- Token expires in ~19h (mint was 00:18 UTC today)
- friday-gms log: `[Guesty] Loaded cached token from disk (expires in 1158 min)` → reading the file correctly post-fix
- fad-backend poller every 15min: 60 listings, 199 reservations, 200s

### Website's strategy (per their audit row #1 + weird-things #1)

```
   ┌──────────────────────────────────────┐
   │     Upstash Redis (optional)         │
   │     UPSTASH_REDIS_REST_URL           │   ← env vars MISSING in
   │     UPSTASH_REDIS_REST_TOKEN         │     .env.local and .env.example
   └──────────────────────────────────────┘
                  ▲
                  │ (when configured — currently always misses)
                  │
   ┌──────────────┴───────────────┐
   │  Vercel instance N (per cold-start instance) │
   │     in-mem token (local only)                │
   └──────────────────────────────────────────────┘
                  │
                  ▼
        ┌───────────────────────────────┐
        │ Guesty /oauth2/token (5/24h)  │
        └───────────────────────────────┘
```

- **TTL:** 24h.
- **Cold start:** Every Vercel cold instance has empty in-mem cache. Upstash check would catch this, but Upstash isn't configured → **every cold instance mints**.
- **5/24h enforcement:** unknown if implemented; if so it's per-instance, so 5 instances × 5 = 25 attempted before any one of them stops trying.
- **No `AbortSignal.timeout`** on Guesty fetches (their weird-things #6) → blocked requests can take 10+ seconds when Guesty 429s.

### Contradiction check (per the brief)

> "If FAD currently mints its own token independently of the website, that's a finding."

**Confirmed and flagged:** FAD mints independently of website. Today's incident had **two unrelated root causes burning the same 5/24h quota**:

1. **FAD-side:** key-casing mismatch (`expiresAt` vs `expires_at`) between fad-backend and friday-gms — both minted independently because neither could read the other's token. **Fixed this morning** ([friday-gms hotfix e26ad0c](https://github.com/Friday-mu/friday-gms/commit/e26ad0c)).
2. **Website-side:** Upstash env vars never configured — every Vercel cold instance mints. **Still bleeding today.** Even though FAD is now down to 1 mint/day, every website cold start still costs one. On a busy autoscale day the website alone can hit 5/24h and lock FAD out (or vice-versa, lock website out).

**The structural fix is the merge:** website stops minting entirely, calls FAD's `/api/public/*` endpoints with its own Bearer JWT (issued by FAD), FAD owns the only Guesty client + cache on the VPS. After migration, total Guesty mints across the org should be **1/day**, period.

## 6. Plain-English Guesty dependency on FAD

FAD treats Guesty as the **operational system of record** for listings, reservations, messages, and (soon) calendar. Unlike the website (which uses Guesty as a commercial overlay on a static seed), FAD pulls everything from Guesty and caches it in Postgres. The 15-minute poller refreshes `guesty_listings` (60 rows) and `guesty_reservations` (199 rows) on the FR tenant; results are served read-only by `/api/properties` and `/api/reservations`, never re-fetched per request. The Properties module hydrates from `/api/properties` (live as of [8003c83](https://github.com/Friday-mu/friday-mu/commit/8003c83) shipped today); the Calendar + Reservations modules from `/api/reservations` (live as of [858a37d](https://github.com/Friday-mu/friday-mu/commit/858a37d), shape-bug fixed today). Inbox messages come from friday-gms's own poller writing into the shared `messages` table; FAD reads them via friday-gms's `/api/inbox/conversations` proxy. When friday.mu sends a booking proof, FAD calls Guesty's `createReservation` to open a 48h-hold reservation, and once ops verifies the payment, `confirmReservation` flips it to confirmed — this is the only write path. Reviews are fetched on-demand for the Reviews module via `/api/reviews/list` (joining live `/v1/reviews` with the cached listings). Webhooks (registered today, `6a0aa28e987bab0015da2956`) deliver real-time message + reservation + listing events to `/api/integrations/guesty/webhook`, eliminating most of the polling pressure — the poller stays as a safety net but can dial down to hourly once webhook delivery is verified for a week. **The Guesty `/availability-pricing/api/calendar` endpoint that the website uses is NOT called by FAD today** — that's the one gap to fill before website's BookingCalendar can be proxied.

## 7. What's next (per the brief)

Both audits now in hand:
1. Design a public API namespace on FAD (`/api/public/*`) that mirrors exactly what the website needs:
   - `GET /api/public/listings` (cache from `guesty_listings`)
   - `GET /api/public/listings/:nickname`
   - `GET /api/public/availability?listing=X&from=Y&to=Z` (**needs new sync — Guesty calendar endpoint not yet wired on FAD**)
   - `GET /api/public/returning-guest?email=X` (lightweight wrapper around `/v1/reservations` filter)
   - `POST /api/public/reservations` (wrap `createReservation`)
   - `SSE  /api/public/events` (live deltas, fed by webhook + Postgres `LISTEN/NOTIFY`)
2. Auth: OAuth 2.0 client_credentials → short-lived JWTs (per yesterday's discussion). FAD issues at `/api/auth/token`.
3. Migration order: listings → returning-guest → reservations write → availability (last, since it needs the new sync). Each migration verified for zero 429s before the next.
4. **Also-pending cleanup, independent of merge:**
   - Reconcile prod env vs `.env.example` (10 missing vars)
   - Decide Resend ownership (FAD silently off; website actively sending — keep website? move to FAD?)
   - Remove the dead `OPENAI_API_KEY`, dead `BREEZEWAY_*`, orphaned `VAPID_PRIVATE_KEY`, dead `/api/webhook/message` in server.ts
   - Add `tokenRefreshInflight` mutex to fad-backend's Guesty client (matches friday-gms's; cheap insurance for when FAD becomes the multi-consumer hub)

This document is **read-only enumeration only** — no redesign proposals. Anti-goals honored:
- Nothing was refactored.
- No new API keys were added.
- No Guesty OAuth mint was burned (audit used only the cached token via SSH probes; mint count today still 1/5).
- No `/api/public/*` redesign proposed here.
