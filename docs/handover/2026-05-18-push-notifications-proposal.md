# FAD — Web Push Notifications · Proposal · 2026-05-18

**Pairs with:** [`EXTERNAL-CONNECTIONS-AUDIT-FAD-2026-05-18.md`](../../EXTERNAL-CONNECTIONS-AUDIT-FAD-2026-05-18.md) (audit row F3).

**Status:** READ-ONLY investigation. Backend half-built; this document proposes the missing pieces so implementation can land in a single ~1–2h session.

**Methodology:** static analysis on branch `fad-design-os-v01-frontend`. Frontend hook + service worker + layout grep'd from `frontend/src/`. Backend routes grep'd from `backend/server.js` (zero `/api/push/*` handlers; `web-push` absent from `backend/package.json`). Prod env state pulled live from `/var/www/fad-backend/.env`: only `VAPID_PRIVATE_KEY` set, **no `VAPID_PUBLIC_KEY`**. Live test confirmed: `GET https://admin.friday.mu/api/push/vapid-key` → 404.

---

## 1. Current state

- **Frontend is fully wired.** `frontend/src/components/usePushNotifications.ts` fetches the VAPID public key, calls `pushManager.subscribe`, and POSTs the subscription JSON with a `gms_token` bearer. Consumed by `frontend/src/app/page.tsx:120` (silent acquisition) and `frontend/src/components/NotificationPrompt.tsx` (2s-delayed top-banner CTA).
- **Service worker handler exists.** `frontend/public/sw.js:72-96` registers `push` + `notificationclick` handlers. Reads `{ title, body, tag, url }` from `event.data.json()` and falls back to "Friday Admin" / "You have a new notification". Click opens or focuses a tab at the `url` field. SW is registered globally via `frontend/src/app/layout.tsx:50-54`.
- **Backend has zero `/api/push/*` routes.** No handler files, no router mount in `backend/server.js`. Hitting either endpoint in prod returns 404 from the Express default.
- **VAPID keys are half-configured.** Prod env has `VAPID_PRIVATE_KEY=6AIWpJ...iw` (~32 raw bytes, base64url) but no public counterpart. `.env.example:76-77` only declares the private one and flags this work as "half-built — see F3 work in flight". Conclusion: keys were partially set up but never finished — we still need a public key (derivable or freshly generated, see §3).
- **No `push_subscriptions` table.** Latest migration is `056_team_attachments.sql`. No web-push migration anywhere in `backend/migrations/`. `web-push` is not in `backend/package.json` deps.

Net: every user who clicks "Enable" in the banner today gets a browser permission prompt, the SW subscribes against an empty VAPID key, the POST 404s silently, and nothing is ever stored. The frontend swallows the error (`fetch(...)` without `.catch`-with-check; observed flow returns `true` to the caller regardless). Browser-side `pushManager.subscribe` would actually fail before then — `applicationServerKey` would be empty — and the call returns early.

## 2. Frontend contract (the source of truth)

Both endpoints live under `${API_BASE}` (resolves to `https://admin.friday.mu` in prod).

**`GET /api/push/vapid-key`** — public, no auth.

```
Response 200: { "publicKey": "<base64url-encoded VAPID public key>" }
```

The frontend feeds `publicKey` directly into `urlBase64ToUint8Array()` and passes the result as `applicationServerKey`. Must be the uncompressed P-256 public key in base64url form (no padding), per Web Push spec.

**`POST /api/push/subscribe`** — bearer-auth via `localStorage.gms_token` (same JWT that gates `/api/feedback`).

Request body is the JSON serialization of the browser's `PushSubscription` object (`JSON.stringify(sub)` in the hook). Shape:

```
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "expirationTime": null,
  "keys": {
    "p256dh": "<base64url>",
    "auth":   "<base64url>"
  }
}
```

Response shape is unused by the frontend — anything 2xx is fine. Recommend `{ "ok": true, "id": "<uuid>" }` for symmetry with feedback. Error responses ignored by hook today; not a blocker for v1.

## 3. Proposed backend implementation

### File layout

```
backend/
├── migrations/
│   └── 057_push_subscriptions.sql     [NEW]
├── package.json                        [MODIFIED — add web-push ^3.6.7]
├── server.js                           [MODIFIED — mount /api/push router + lockdown skip-list]
└── src/
    └── push/
        ├── index.js                    [NEW — router (vapid-key + subscribe)]
        └── send.js                     [NEW — sendNotification helper]
```

Mirrors `src/feedback.js` (single-feature, ~300 lines) plus a thin sibling helper. Could collapse to one file if it stays small — kept split so callers `require('./push/send')` without pulling the router.

### Migration `057_push_subscriptions.sql`

Column-by-column (pseudo-SQL, real DDL to be written at implementation time):

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Standard. |
| `tenant_id` | `UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` | Non-negotiable per running-decisions §1.3. Drops all subs if a tenant is deleted. |
| `user_id` | `UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE` | Subscriptions are per-user, not per-tenant. If the user is deleted their subs go too. |
| `endpoint` | `TEXT NOT NULL` | The unique URL the push service issues. Stored verbatim. |
| `endpoint_hash` | `TEXT NOT NULL` | `sha256(endpoint)` hex. Used for the unique index — `endpoint` can be 500+ chars, and Postgres B-tree key size is bounded. |
| `p256dh` | `TEXT NOT NULL` | From `keys.p256dh`. Needed by `webpush.sendNotification`. |
| `auth` | `TEXT NOT NULL` | From `keys.auth`. Same. |
| `user_agent` | `TEXT` | Captured from request headers for debugging multi-device cases. |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |
| `last_used_at` | `TIMESTAMPTZ` | Updated on successful send; drives cleanup of stale subs. |

Indices:
- `UNIQUE (user_id, endpoint_hash)` — re-subscribe from same device is an upsert, not a duplicate row.
- `INDEX (tenant_id, user_id)` — for the broadcast / per-user lookups.

Follows the `037_feedback_tenant.sql` + `050_tasks.sql` pattern: explicit `tenant_id` first, `CASCADE` on hard deps, lowercase singular table name, `idx_<table>_<cols>` index names.

### Route handler shapes (pseudo-code)

`backend/src/push/index.js`:

```
const router = express.Router()
const webpush = require('web-push')

// VAPID config — set once at module load. Throws at startup if env missing,
// which is the right failure mode (no silent fallback).
webpush.setVapidDetails(
  'mailto:judith@friday.mu',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
)

// GET /api/push/vapid-key — public (no auth). Returns the public key
// so the browser can subscribe.
router.get('/vapid-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY })
})

// POST /api/push/subscribe — auth via attachIdentity (same as /api/feedback).
// Upserts on (user_id, endpoint_hash). Tenant_id comes from req.tenantId.
router.post('/subscribe', attachIdentity, async (req, res) => {
  const { endpoint, keys } = req.body
  // validate shape; 400 on missing/short fields
  const endpointHash = sha256(endpoint)
  await query(
    `INSERT INTO push_subscriptions (tenant_id, user_id, endpoint, endpoint_hash, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, endpoint_hash) DO UPDATE
       SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, last_used_at = NOW()`,
    [req.tenantId, req.identity.userId, endpoint, endpointHash, keys.p256dh, keys.auth, req.headers['user-agent']]
  )
  res.json({ ok: true })
})

module.exports = router
```

`backend/src/push/send.js`:

```
// sendNotification(userIds, payload) — fire to every active sub for every
// user in the array. Fire-and-forget (caller doesn't await). Auto-prunes
// subs that come back 410 Gone (the user revoked / cleared site data).
//
// payload shape matches what sw.js expects:
//   { title, body, tag?, url? }
async function sendNotification(userIds, payload) {
  const rows = await query(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions
     WHERE user_id = ANY($1::uuid[])`,
    [userIds]
  )
  for (const row of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        JSON.stringify(payload)
      )
      // bump last_used_at (UPDATE, async, ignore result)
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await query(`DELETE FROM push_subscriptions WHERE id = $1`, [row.id])
      } else {
        console.warn('[push] send failed:', err.statusCode, err.message)
      }
    }
  }
}

module.exports = { sendNotification }
```

### `server.js` changes

Mount the router under `/api/push` and add it to the FR-tenant-lockdown skip-list (around line 924) since it's already tenant-scoped via `attachIdentity` → `req.tenantId`:

```
// near line 925 in the skip-list
p.startsWith('/api/push') ||
```

```
// near line 973 (mounted next to feedback)
const pushRoutes = require('./src/push')
app.use('/api/push', pushRoutes)
```

### VAPID key strategy — RECOMMEND: generate a fresh pair

Two options:

**A. Derive public from existing private (mathematically possible).** P-256 ECDSA: the public key is `private * G` where G is the curve generator. `web-push` doesn't expose a derive helper directly; you'd drop down to `crypto.createPublicKey({ key: privateKey, format: 'jwk' })` or use `eccrypto` / `ec-pem`. Works, preserves the env value already set.

**B. Generate a fresh pair via `webpush.generateVAPIDKeys()` and overwrite.** Loses the existing `VAPID_PRIVATE_KEY`. But: there are **zero existing client subscriptions** (because there's no backend to receive them — every browser that tried to subscribe got an early-return when `vapidKey` came back empty). So no clients to invalidate. Cleaner — both keys are then sourced from the same call.

**Recommend B.** Simpler, no manual JWK gymnastics, no risk of mis-deriving. Run once locally: `node -e "console.log(require('web-push').generateVAPIDKeys())"`, paste both into `/var/www/fad-backend/.env`, restart `fad-backend` pm2 process. Update `.env.example` to declare `VAPID_PUBLIC_KEY=` alongside the existing `VAPID_PRIVATE_KEY=`.

### npm dependency

Add to `backend/package.json` deps:

```
"web-push": "^3.6.7"
```

Latest stable. Single dep, ~100KB installed, pure JS, no native bindings. Used for both `generateVAPIDKeys()` and `setVapidDetails()` + `sendNotification()`. No alternative worth considering.

## 4. Open questions for Ishant

1. **Which use case fires the first notification?** Candidates discovered in code:
   - New `/api/feedback` POST → notify admins (mirrors existing Slack fan-out at `src/feedback.js:178-216`). Lowest-risk, smallest blast radius — admin/director only, ~1/day volume.
   - New `team_inbox` `@mention` (mentions array already validated against channel membership at `src/team_inbox/index.js:666-673`). Highest user-visible value but multiple fire sites (channel + DM messages).
   - New website-inbox booking-proof upload (the `bw-7` website-inbox sprint hooks into `/api/inbox/website/*`). Currently fans out via Slack-style routes.
   - New guest inbox message via Guesty webhook (`src/reservations/webhook.js`).
   - Recommend **feedback** for v1 (smallest scope, mirrors known-good Slack pattern). Pick one.

2. **Per-user or per-tenant subscriptions?** Schema above assumes per-user (a user with 2 devices = 2 rows), which lines up with the frontend hook subscribing in the user's session. Sending to "every admin in tenant FR" then becomes `sendNotification(adminUserIds, payload)`. Confirm this matches the intended mental model — alternative is a tenant-broadcast endpoint that fans out internally.

3. **Notification permission UX — when does the browser prompt fire?** `NotificationPrompt.tsx` shows the in-app banner 2s after page load (and only if `Notification.permission === 'default'` and not dismissed). Clicking "Enable" triggers the native browser prompt. Mobile Safari requires the prompt to come from a direct user gesture inside an installed PWA — opening from the home screen — so this flow already works there. Worth confirming the 2s delay is still wanted vs. moving the trigger to Settings (less interruptive).

4. **Multi-device retention policy.** If a user signs in on their phone, then again on their laptop, we end up with 2 subscriptions both firing. Fine for v1, but worth confirming we don't want a per-user cap or a "this device only" toggle.

5. **VAPID rotation strategy.** Generated once, never rotated, is fine for years. If/when we ever rotate, every existing subscription becomes unusable and clients must re-subscribe. Not a v1 concern, but worth a one-line comment in the env file so the next person doesn't accidentally regenerate.

## 5. Effort estimate

| Phase | Estimate |
|---|---|
| Generate VAPID pair, paste into prod env, restart pm2 | 5 min |
| Write `migrations/057_push_subscriptions.sql`, run on prod | 15 min |
| Write `src/push/index.js` + `src/push/send.js` + add `web-push` dep + npm install | 30 min |
| Wire router mount + lockdown skip-list in `server.js` | 5 min |
| Wire ONE use case (e.g., add `sendNotification(adminIds, ...)` to `src/feedback.js` POST handler alongside the existing Slack fan-out) | 15 min |
| Smoke test: open FAD on phone, click "Enable", file a feedback report from desktop, watch the notification land | 15 min |
| Frontend touch-up | **0** — hook + SW + banner all exist and match this contract exactly |
| **Total** | **~1h 25m** |

Adds zero new external services. `web-push` does HTTP POSTs directly to push endpoints (FCM, Mozilla, Apple) — no third-party SaaS, no API key beyond VAPID.

## 6. Anti-goals for v1

Explicitly **not** building yet:

- **Notification templates / i18n.** Hardcoded English strings inline per fire site.
- **Notification preferences UI.** No per-user "mute these notifications" page. Browser-level Block is the only opt-out.
- **Multi-channel routing.** No "email if push fails" or "Slack DM mirror". Just push.
- **Scheduling / quiet hours.** Fires immediately on the trigger event, regardless of recipient's local time.
- **Rich notifications.** No image attachments, no action buttons. Just title + body + tag + click-through URL (matches what `sw.js` already handles).
- **Delivery receipts / analytics.** No tracking pixel, no "was this clicked?" feedback loop.
- **Subscription management endpoint.** No `DELETE /api/push/subscribe` or `GET /api/push/subscriptions`. Stale subs auto-prune on 410 from the push service.
- **Per-tenant VAPID keys.** VAPID identifies the app, not the tenant — one pair shared across all FAD tenants is correct.

All of the above are obvious follow-ups once the v1 wire is proven in prod.
