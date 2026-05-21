# Guesty rate-limit — full investigation (2026-05-16)

## TL;DR

Our Guesty Open API is in a sustained 429 cooldown because
**friday-gms is minting 36 OAuth tokens per day** against a
published limit of **5 mints per clientId per 24h**. fad-backend
(the new one I built this session) is innocent — its tokens get
rejected because friday-gms already burned the daily quota.

The mints aren't from code that re-auths on every API call (the
caching logic is correct). They're from **process restarts** —
friday-gms has restarted ~25 times in the last 24h, and each cold
start refreshes the token even though the on-disk cache is loaded.
Total restart count over ~37h uptime: 3,197.

Fix path: stop the friday-gms restart loop (Priority 1A in the
next-session prompt) → token mints drop to ~1/day → quota recovers
within 24h → fad-backend's poller picks up the next sync.

## What Guesty's limits actually are

Researched against the published docs.

| | |
|---|---|
| **Token endpoint** `/oauth2/token` | **5 mints per clientId per 24h.** Hard ceiling. |
| Token TTL | 24h (`expires_in: 86400`). Guesty docs: "call it once a day and cache." |
| Data endpoints | 15 req/sec · 120 req/min · **5,000 req/hr** · 15 concurrent max. Shared pool. |
| Per-endpoint sublimits | None documented. `/reservations`, `/listings`, `/communication/*` share the pool. |
| Webhooks (inbound to us) | Not rate-limited. Officially Guesty's "escape valve from polling." |
| Retry-After | Standard header on 429. No published fixed cooldown. |

**Pricing for raised limits:** no public tier. Increases are a
sales/CSM conversation. Path to "uncapped" = **Guesty Partner
Program / Marketplace integration** (certification track, not a
price). No self-serve.

Sources:
- [Guesty Open API — Rate Limits](https://open-api-docs.guesty.com/docs/rate-limits)
- [Guesty Open API — Authentication](https://open-api-docs.guesty.com/docs/authentication)
- [Guesty Open API — Webhooks](https://open-api-docs.guesty.com/docs/webhooks)
- [Guesty Help — Maximum API Call Limits](https://support.guesty.com/kb/en/article/maximum-api-call-limits-975941)
- [Guesty Help — API Best Practices](https://support.guesty.com/kb/en/article/guesty-api-best-practices)

## Our actual consumption

Both backends on `gms.friday.mu` share **the same `clientId`**
(`0oat2o74l0fa…`). Each has its own in-memory + on-disk cache. They
do NOT share state.

| Service | Data calls / 24h | Token mints / 24h | Last successful mint |
|---|---|---|---|
| `friday-gms` | ~120 | **36** ← over the published 5/day ceiling | very recent |
| `fad-backend` (new) | 0 successful | **0 successful** (all 429) | `2026-05-14T06:01:30` |

**friday-gms succeeded with 36 mints in 24h despite the 5/day
published limit.** Possible explanations: Guesty has soft-limit
grace, our account has a higher real ceiling, or the 5/day applies
strictly only after some N consecutive abuse signal. Either way,
**we eventually hit a wall** and the wall is where fad-backend is
sitting.

Data-call usage is **3 orders of magnitude under** the 5,000/hr
ceiling. The data quota is fine — only the token-mint quota matters.

## Why friday-gms is over-minting

Code lives at `/var/www/friday-gms/src/services/guesty.ts`. Caching
is *almost* right:

- ✅ Singleton export (`export const guestyClient = new GuestyClient()`)
- ✅ On-disk persistence (`.guesty-token.json`)
- ✅ Loads from disk on startup
- ✅ Uses Guesty's `expires_in` correctly (`Date.now() + 86400_000`)

But in the last 24h:
- **25 process startups** (pm2 restarts averaging every ~57 min)
- **35 normal refreshes** (cache-miss path)
- **1 token-expired retry** (401 path)
- = **36 total mints**

Loaded-from-disk lines: 25. So every restart loads the cache. But
something forces a fresh mint shortly after on each startup.

Suspected race: between `loadCachedToken()` running in the
constructor and the first `getToken()` call, multiple awaits hit
`getToken()` while `this.token` is still null. No mutex → each
race-winner mints.

The PM2 restart loop itself is the bigger driver. Recent errors:
- `[Breezeway] Sync failed: Client error: 404` (repeating)
- `[Draft] Generation failed: Cannot read properties of undefined (reading 'voiceDescription')`
- `[Guesty] GET /v1/availability-pricing/... → 502`
- `[Consult] Missing property knowledge for MV-1`

None of these look fatal directly, but something is killing the
process ~25 times a day. Likely an uncaught promise rejection or an
OOM (process uses 114MB).

## fad-backend's situation

Innocent. Has minted 0 tokens today. Every poll attempt 429s on the
token endpoint because friday-gms already burned the daily
allowance. My retry logic (30s + retry) just doubles each failed
attempt's duration. The poller runs every 15 min; each attempt
takes ~62s before giving up.

## Recommended fixes (in order)

### Short-term (no code — let quota recover)

- **Stop friday-gms from restart-looping.** Find the crash cause
  (`pm2 logs friday-gms --err`) and patch. Drops restarts from
  ~25/day to ~0; token mints drop from 36 to ~1.
- Once mints stop, the 24h rolling window recovers and
  fad-backend's next poll succeeds.

### Short-term code (~30 min each)

1. **Shared token file across backends.** Have fad-backend read
   friday-gms's `/var/www/friday-gms/.guesty-token.json` instead of
   running its own OAuth. Same machine, no Redis needed. Single
   source of truth.
2. **Add a mutex** to friday-gms's `getToken()` so concurrent
   first-requests don't race-mint.
3. **Bump fad-backend retry-after delay** from 30s to 5 min and
   reduce retries to 0 — don't burn quota retrying; let the poll
   cycle handle it.

### Medium-term (~2-3 hours)

- **Migrate inbox polling → Guesty webhooks**
  (`conversation.message.created`, `reservation.created/updated/canceled`).
  Slashes 120 polls/day → ~0.
- **Subscribe fad-backend to the same webhooks** for reservation
  events instead of the 15-min poll.
- **Share the token cache via Redis** (already running on the box)
  for proper multi-process sharing without disk races.

## What to ask Guesty support

1. *"What's our actual token-mint ceiling on account `<id>`? Public
   docs say 5/clientId/24h but we've been hitting 36 successfully —
   is there a soft/hard split?"*
2. *"Please share `ratelimit-remaining` + `ratelimit-reset` for our
   `clientId` `0oat2o74l0fa…`."*
3. *"Can you lift the current 429 cooldown so we can resume after
   we ship the fix?"*
4. *"Provision a SECOND `clientId` for our admin-dashboard surface
   so it isolates from the inbox integration."* ← most important
5. *"Pathway to Marketplace partner status — would Friday Retreats'
   own internal PMS integration qualify? (We're a single-tenant
   operator, not a SaaS reselling Guesty.)"*
6. *"Confirm webhook subscription quota and any per-event delivery
   throttling we should design around."*

## What Ishant didn't already know but should

- **The 5/day token limit is not negotiable via env vars or higher
  tiers.** Multiple clientIds is the supported workaround for
  multi-service deployments.
- **Webhooks are basically free.** Every poll is something we
  should be receiving as a push.
- **Our restart count is the biggest single multiplier.** A stable
  friday-gms running for 24h mints 1 token. The 36/day is almost
  entirely restart-driven.
- **Marketplace partner status** bypasses the shared quota pool
  entirely. Worth raising on the next Guesty CSM call.
