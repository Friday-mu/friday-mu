# FAD Inbox + Website Inbox — Current State Audit

> Audit input for the 2026-05-17 inbox-parity gap analysis. Source: subagent
> read pass over `frontend/src/app/fad/_components/modules/Inbox*.tsx`,
> `inbox/TeamInbox.tsx`, `_data/inboxClient.ts`, `backend/server.js`,
> `backend/src/website_inbox/`, `backend/migrations/033_website_inbox.sql`.

## TL;DR — data flow today

```
┌──────────────────────────────────────────────────────────────────────────┐
│  FAD FRONTEND  (Next.js, gms.friday.mu / port 3002)                      │
│                                                                          │
│   ┌─ InboxModule.tsx ─────────────┐   ┌─ WebsiteInboxModule.tsx ──────┐  │
│   │ "Inbox" — guest/owner/vendor  │   │ "Website" — booking forms +  │  │
│   │ threads + Team tab            │   │ payment proofs from friday.mu│  │
│   │  ↓ useLiveConversations()     │   │  ↓ apiFetch('/api/inbox/     │  │
│   │  ↓ useThreadDetail()          │   │     website/...')            │  │
│   └────────┬──────────────────────┘   └────────┬─────────────────────┘  │
└────────────┼─────────────────────────────────── ┼───────────────────────┘
             │ /api/inbox/conversations*          │ /api/inbox/website/*
             ▼                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  FAD BACKEND  (Express, server.js)                                       │
│                                                                          │
│  gmsAPI = axios(baseURL=GMS_BASE_URL, Bearer GMS_AUTH_TOKEN)             │
│  userScopedGms(req) = axios(... Authorization: req.headers.authorization)│
│                                                                          │
│  /api/inbox/conversations*  ──── gmsProxy ────►  pass-through to GMS     │
│  /api/messages/*            ──── gmsAPI.post ─►  GMS legacy /pending,    │
│                                                  /approve, /edit, /reject│
│  /api/ai/translate          ──── translateText() (Kimi + Anthropic Opus) │
│  /api/inbox/website/*       ──── src/website_inbox/ router               │
│                                  (HMAC webhook + threads CRUD + DLQ jobs)│
└────────────┬─────────────────────────────────── ┬───────────────────────┘
             │ user-JWT proxy                     │ direct DB
             ▼                                    ▼
┌─────────────────────────────────┐    ┌──────────────────────────────────┐
│  GMS BACKEND (admin.friday.mu)  │    │  POSTGRES (shared)               │
│  - GET /api/conversations       │    │   inbox_threads                  │
│  - GET /api/conversations/:id   │    │   inbox_events                   │
│  - POST /command (send)         │    │   inbox_guesty_jobs (DLQ)        │
│  - /pending, /approve, /edit,   │    │   guesty_listings/_reservations  │
│    /reject, /regenerate (404 in │    └──────────────────────────────────┘
│    prod — old surface gone)     │
└─────────────────────────────────┘                ▲
                                                   │
              friday.mu (public site) ── HMAC ─────┘
              POST /api/inbox/website/friday-website
```

Two inboxes are completely separate today: **InboxModule = proxy to GMS** (GMS owns the data). **WebsiteInboxModule = FAD-native** (own tables, own webhook receiver, own worker).

---

## 1. `InboxModule.tsx` — current features

`frontend/src/app/fad/_components/modules/InboxModule.tsx:69-686`

**Layout** — 3-pane split (`inbox-split`, line 285):
- Left: thread list (collapsible, `inbox-list`, lines 288-399)
- Middle: thread detail with subject header, AI toolbar, message bubbles, compose box (lines 409-661)
- Right: reservation right-rail (`ReservationRightPanel`, lines 724-851)
- Mobile: panes collapse into a slide-over (`mobileThreadOpen`, lines 98-128)
- Chip row above the split for entity filter: All / Guest / Owner / Vendor / Team (lines 219-249)
- Filter popover (`FilterButton`, lines 977-1091) replaces old tabs with Triage status + Stay status + "@-mentions me" toggle (lines 82-88, 153-162)

**Data source** — live API with fixture fallback (`InboxModule.tsx:140-143`):
```ts
const { threads: liveThreads, loading: inboxLoading, error: inboxError } = useLiveConversations();
const sourceThreads = liveThreads ?? INBOX_THREADS;
```
- List: `useLiveConversations()` → `GET /api/inbox/conversations` → GMS `/api/conversations` (`inboxClient.ts:228-232`).
- Detail: `useThreadDetail(id)` → `GET /api/inbox/conversations/:id` (bundles conversation + messages + drafts + reservation + WA window; `inboxClient.ts:234-245`).
- Falls back to `INBOX_THREADS` fixture until live list resolves.

**API endpoints called (frontend → FAD backend → GMS):**
| FAD frontend call | FAD backend route | GMS upstream path |
|---|---|---|
| `apiFetch('/api/inbox/conversations')` | `server.js:1211` | `GET /api/conversations` |
| `apiFetch('/api/inbox/conversations/:id')` | `server.js:1215` | `GET /api/conversations/:id` |
| (unused today) | `server.js:1219, 1223` | `/api/conversations/:id/messages`, `/api/conversations/:id/reservation` |

**Compose box** — `composeMode: 'reply' | 'note'` (lines 92, 585-659). Reply UI exists but `textarea defaultValue` is empty (line 605); `<IconSend /> Send` + "Polish with Friday" buttons — **neither is wired**. `SendByMenu` (lines 1386-1430) renders menu items that `onClose` without doing anything. Stale draft-bubble was purged 2026-05-13 because nothing was driving it (comment at 547-551).

**What's wired vs. mocked:**
| Feature | State |
|---|---|
| Thread list (live) | Live — GMS proxy |
| Thread detail (live messages, WA window, reservation) | Live — GMS proxy |
| Per-message Show-original toggle | Live — uses `bodyOriginal` from GMS `translated_body` (`MessageBubble`, 695-722) |
| Compose reply / Send | UI-only — no POST handler wired |
| Polish with Friday | UI-only |
| Schedule send / "Send when awake" | UI-only (`SendByMenu` does nothing) |
| Summary / Translate toolbar chips | UI-only toggles (data already present from GMS) |
| Internal notes (`InternalNoteCompose`, 1177-1354) | Local-only optimistic write to `INBOX_INTERNAL_NOTES`; comment at 1222-1225 says `POST /api/inbox/threads/:id/notes` is "Tier E" — not built |
| Mark read/unread, snooze, label | Not present |
| Ask Friday button (right rail) | Opens FridayDrawer (separate component) |

**Friday Consult surface** — `FridayConsult.tsx` (1-91). Stub. Comment at 17-26: "There is no real LLM behind this yet … Once the live wiring lands (Tier E bw-9 — Friday LLM), this stays as the UI shell with a real backend behind submit()." `submit()` runs scripted `FRIDAY_SCRIPTS` strings, not a real LLM.

So the handover assessment is correct: **list + detail proxy live; drafts/send/notes have no backend pipeline**.

---

## 2. `WebsiteInboxModule.tsx` — the sibling

`frontend/src/app/fad/_components/modules/WebsiteInboxModule.tsx:96-394`

**Layout** — 2-pane: 360px left aside (status pills + search + thread list, lines 177-258) + right `main` (detail, lines 261-391). No Team / AI / WA / Friday Consult surfaces. Plain `chip` style, no `inbox-split`.

**What it shows per thread** (`detail`):
- Status badge (`open` / `in_progress` / `paid` / `closed`) + status `<select>` (lines 285-298)
- "Mark paid & confirm" button (lines 300-313) → `POST /api/inbox/website/threads/:id/mark-paid`
- MetaCards: email, phone, Guesty listing id, Guesty reservation id+status, auto-expires timestamp (lines 320-335)
- `NotesEditor` ops-notes textarea → `PATCH /api/inbox/website/threads/:id` (lines 338-342, 405-460)
- `Guesty jobs` list — DLQ visibility, status chip + `last_error` (lines 345-378)
- Events timeline — collapsible JSON dumps of each webhook payload (lines 381-388, 462-500)

**Routes called** (all under `/api/inbox/website/*`):
| Call | Method | Purpose |
|---|---|---|
| `/api/inbox/website/threads?status=...&q=...` | GET | List (`threads.js:22-60`) |
| `/api/inbox/website/threads/:id` | GET | Detail bundle: `{ thread, events, guesty_jobs }` (`threads.js:63-100`) |
| `/api/inbox/website/threads/:id` | PATCH | Update `status` / `notes` (`threads.js:103-132`) |
| `/api/inbox/website/threads/:id/mark-paid` | POST | Queue `confirm_reservation` job + stamp `paid_at` (`threads.js:138-191`) |

30s auto-refresh (line 126).

**Operator workflow:**
1. Webhook lands from friday.mu → row appears in list.
2. Ops opens thread → reviews payload + Guesty job state.
3. If proof looks legit → "Mark paid & confirm" → backend queues `confirm_reservation` → worker flips Guesty `reserved` → `confirmed` + sends Resend email.
4. Notes / status (`in_progress` / `closed`) for free-form state.

**Sidebar registration** — yes, mounted today. `_data/modules.ts:32`:
```ts
{ id: 'website-inbox', label: 'Website', group: 'Today', tier: 'live', ship: 'live', icon: 'IconInbox', path: '/fad/website-inbox' },
```
Routed in `FadApp.tsx:376-377` (`case 'website-inbox': return <WebsiteInboxModule />;`). Sits next to GMS "Inbox" entry at line 28 — **two parallel surfaces in the Today group**.

---

## 3. FAD backend — proxy layer (`server.js`)

**`gmsAPI` axios instance** (`server.js:54-90`):
- `baseURL`: `process.env.GMS_BASE_URL || 'https://admin.friday.mu'`
- Service token `GMS_AUTH_TOKEN` as `Authorization: Bearer ...` on construction (line 67). Used for legacy `/pending`-style routes.
- Request interceptor logs `[GMS API] METHOD url`; response interceptor logs status + error data and re-rejects.
- **`userScopedGms(req)`** (lines 1183-1192) builds a per-request axios with the caller's JWT in the Authorization header. Used by `/api/inbox/conversations*` — GMS validates the JWT and applies RLS.

**`gmsProxy` helper** (lines 1194-1209): generic `(req, res, gmsPath, method)` pass-through using `userScopedGms`; `req.query` forwarded on GET, `req.body` on others. Errors normalised: `e.response?.status || 502`.

**Routes touching GMS** (chronological in file):
| FAD path | Method | GMS upstream | Client | Purpose |
|---|---|---|---|---|
| `/api/conversations` | GET | `/pending` (service) | `gmsAPI` (line 159) | Legacy aggregator. **404s in prod, GMS removed `/pending` 2026-05-13** (note at 800-816). |
| `/api/conversations/:id` | GET | `/pending` then filter | `gmsAPI` (227) | Same path, broken too. |
| `/api/stats` | GET | `/pending` | `gmsAPI` (287) | Same 404. |
| `/api/messages/:id/generate-reply` | POST | `/regenerate/:id` | `gmsAPI` (325) | Legacy AI regenerate. |
| `/api/messages/:id/workflow` | POST | `/approve\|/edit\|/reject` | `gmsAPI` (353) | Legacy approve/edit/reject. |
| `/api/messages/pending` | GET | `/pending` | `gmsAPI` (422) | |
| `/api/messages/conversation/:id` | GET | `/conversation/:id` | `gmsAPI` (449) | |
| `/api/messages/approve/:id` | POST | `/approve/:id` | `gmsAPI` (469) | |
| `/api/messages/edit/:id` | POST | `/edit/:id` | `gmsAPI` (500) | |
| `/api/messages/reject/:id` | POST | `/reject/:id` | `gmsAPI` (540) | |
| `/api/messages/send` | POST | `/command {action:'SEND'}` | `gmsAPI` (571) | Custom-message send via GMS workflow. |
| `/api/translation/languages` | GET | `/translation/languages` | `gmsAPI` (618) | |
| `/api/translation/translate` | POST | `/translation/translate` | `gmsAPI` (650) | |
| `/api/analytics/dashboard` | GET | `/analytics/dashboard` | `gmsAPI` (686) | |
| `/api/auth/login` | POST | `/api/auth/login` | `userGmsCall` (1143) | User auth. |
| `/api/auth/me` | GET | `/api/auth/me` | `userGmsCall` (1156) | JWT forwarded. |
| **`/api/inbox/conversations`** | GET | `/api/conversations` | `userScopedGms`+`gmsProxy` (1211) | **Active live-data path used by InboxModule.** |
| **`/api/inbox/conversations/:id`** | GET | `/api/conversations/:id` | `gmsProxy` (1215) | Bundle (msgs+drafts+reservation+wa window). |
| `/api/inbox/conversations/:id/messages` | GET | `/api/conversations/:id/messages` | `gmsProxy` (1219) | Defined but unused. |
| `/api/inbox/conversations/:id/reservation` | GET | `/api/conversations/:id/reservation` | `gmsProxy` (1223) | Defined but unused. |

**Direct Guesty** (not GMS): `/api/reviews/list` (1234), `/api/properties/list` (1290) use `guestyAPI` (service OAuth2 client, lines 859-864).

**Other backend-native** (not GMS): `/api/system/status` (1317), `/api/system/test/:integration` (1385), `/api/ai/translate` (1369 — `translateText` from `./src/ai/translate`, Kimi + Anthropic Opus per comment at 866-869).

**WebSocket** (lines 92-129): Socket.IO server broadcasts `new_messages`, `message_approved`, etc. Polling loop `pollGMSForUpdates` (758-797) **gated off by default** since `/pending` 404s — `ENABLE_GMS_INBOX_POLLING=1` required (805-816).

**Native draft generation in fad-backend?** No — searched `draft|regenerate|claude|anthropic|polish` excluding `src/design/`. Only matches:
- Line 330: `gmsAPI.post('/regenerate/:id')` — proxies to GMS.
- Line 866-869: Anthropic Opus wired but only for `translateText()` (reviews translation).
- Line 1356-1357: Settings status reports `ANTHROPIC_API_KEY` configured.
- Frontend "Polish with Friday" / "Friday Consult" / "Ask Friday to draft reply" buttons have **no backend**.

---

## 4. FAD backend — `src/website_inbox/` module

`backend/src/website_inbox/` — 8 files. **Mounted at** `app.use('/api/inbox/website', websiteInbox.router)` (`server.js:992-993`); `websiteInbox.startWorker()` after (line 996). Lockdown exemption at `server.js:933` (`p.startsWith('/api/inbox/website')`) — pre-tenant-scoping, shared across tenants today (TODO at 980-981).

**`index.js` (1-36)** — two sub-routers: raw-body webhook router (`express.raw({type:'*/*', limit:'1mb'})`) + JSON router for auth-gated CRUD. Server-level body-parser skip at `server.js:42` ensures `/api/inbox/website/friday-website` reaches its own raw parser.

**`webhook.js`** — `POST /friday-website`:
- HMAC-SHA256 over `${timestamp}.${rawBody}` with `FRIDAY_WEBSITE_INBOX_SECRET` (line 63-66). Headers: `X-Friday-Inbox-Signature` + `X-Friday-Inbox-Timestamp`. 5-minute replay window (line 31). Constant-time compare via `crypto.timingSafeEqual` (42-46).
- Allowed event types (33-39): `booking.request_submitted`, `booking.proof_uploaded`, `experience.enquiry_submitted`, `contact.form_submitted`, `owner.enquiry_submitted`.
- `recordEvent()` (94-166): upsert `inbox_threads` by `LOWER(guest_email)`, INSERT `inbox_events`. Idempotency via `(reference, event_type)` unique-violation catch → `{ status: 'duplicate' }` (158-165).
- Side effect on `booking.proof_uploaded` (268-273): `queueCreateReservationJob()` resolves slug → listing ID via `property-map.json`, INSERT `inbox_guesty_jobs` `pending` (or `dead` if unmapped, line 197).

**`threads.js`** — auth-gated CRUD; see §2.

**`jobs.js`** — DLQ worker, polls every 15s via `setInterval` (lines 30, 197):
- `create_reservation` (70-112): Guesty Open API `createReservation()`, persists `guesty_reservation_id`/`status`/`expiration_at`.
- `confirm_reservation` (114-162): Guesty `PUT /reservations/:id status:confirmed`, syncs thread, fires `sendBookingConfirmation()` Resend email (failure logged but doesn't roll back).
- Exponential backoff (37-39), max 6 attempts → `dead` (31).

**`guesty.js`** — own axios + OAuth2 token cache (separate from `server.js`'s `guestyAPI` — comment at 4-9 notes duplication intent to consolidate).

**`property-map.js` / `property-map.json`** — slug → Guesty listing ID, loaded at boot. Missing slug → DLQ job `dead` immediately with explanatory `last_error`.

**`resend.js`** — `sendBookingConfirmation({toEmail,toName,residenceName,checkInDate,checkOutDate,reference})`. Skips silently if `RESEND_API_KEY` not set.

**End-to-end flow:**
```
friday.mu POSTs HMAC-signed payload
  → POST /api/inbox/website/friday-website
  → verifySignature (HMAC + 5min anti-replay)
  → recordEvent: upsert inbox_threads (by LOWER(email)) + INSERT inbox_events
  → if booking.proof_uploaded: INSERT inbox_guesty_jobs (create_reservation, pending)
  → 200 {status: 'accepted'}

(worker tick, 15s)
  → SELECT pending/failed jobs WHERE next_attempt_at <= NOW()
  → create_reservation: Guesty POST /reservations (status='reserved', 48h expiry)
  → UPDATE inbox_threads SET guesty_reservation_id/_status/_expiration_at
  → job → 'succeeded'

(ops clicks "Mark paid & confirm")
  → POST /api/inbox/website/threads/:id/mark-paid
  → INSERT inbox_guesty_jobs (confirm_reservation, pending)
  → UPDATE inbox_threads SET status='paid', paid_at, paid_by_*

(worker picks up confirm)
  → Guesty PUT /reservations/:id (status='confirmed', expirationDate=null)
  → sendBookingConfirmation via Resend (best-effort)
  → job → 'succeeded'
```

**Re: "fold into the main inbox":** from THIS side, "main inbox" is just a proxy to GMS — there is no FAD-owned conversation/event store that GMS would also read. To unify, either (a) GMS starts reading `inbox_threads/_events` (cross-system read), or (b) FAD-side inbox gains its own list/detail endpoints alongside/replacing the GMS proxy. **Today the two surfaces share zero schema.**

---

## 5. Schema — `033_website_inbox.sql`

Only one migration creates these tables. No prior or later migration touches them.

**`inbox_threads`** (lines 20-62):
- `id UUID PK DEFAULT gen_random_uuid()`
- `guest_email TEXT NOT NULL` — collapse key (lower-cased, see unique index)
- `guest_email_raw TEXT` — preserve casing
- `guest_name TEXT`, `guest_phone TEXT`
- `status TEXT NOT NULL DEFAULT 'open'` — CHECK: `'open' | 'in_progress' | 'paid' | 'closed'` (60-61)
- `last_event_type TEXT`, `last_event_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- Guesty linkage: `guesty_reservation_id TEXT`, `guesty_listing_id TEXT`, `guesty_reservation_status TEXT`, `guesty_expiration_at TIMESTAMPTZ`
- Paid: `paid_at TIMESTAMPTZ`, `paid_by_user_id UUID`, `paid_by_display_name TEXT`
- `notes TEXT`
- `created_at`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Unique index:** `idx_inbox_threads_email_unique ON inbox_threads(LOWER(guest_email))` (66-67)
- Partial index: `idx_inbox_threads_active_recent ON (last_event_at DESC) WHERE status IN ('open','in_progress')` (72-74)
- **No `tenant_id` column** — not multitenant yet.

**`inbox_events`** (lines 81-118):
- `id UUID PK`, `thread_id UUID REFERENCES inbox_threads(id) ON DELETE CASCADE`
- `reference TEXT`, `event_type TEXT NOT NULL`, `source TEXT NOT NULL DEFAULT 'website'`
- `payload JSONB NOT NULL`, `signature TEXT`, `signed_at TIMESTAMPTZ`, `created_at`
- Index: `idx_inbox_events_thread_recent ON (thread_id, created_at DESC)`
- **Unique partial:** `idx_inbox_events_dedup ON (reference, event_type) WHERE reference IS NOT NULL`

**`inbox_guesty_jobs`** (lines 126-159):
- `id UUID PK`, `thread_id UUID REFERENCES inbox_threads(id) ON DELETE CASCADE`
- `event_id UUID REFERENCES inbox_events(id) ON DELETE SET NULL`
- `job_type TEXT` — CHECK: `'create_reservation' | 'confirm_reservation'`
- `status TEXT DEFAULT 'pending'` — CHECK: `'pending' | 'running' | 'succeeded' | 'failed' | 'dead'`
- `attempts INTEGER DEFAULT 0`, `next_attempt_at TIMESTAMPTZ DEFAULT NOW()`, `last_error TEXT`
- `payload JSONB NOT NULL`, `result JSONB`, `created_at`, `updated_at`
- Partial: `idx_inbox_guesty_jobs_due ON (next_attempt_at) WHERE status IN ('pending','failed')`

**FK graph:** `inbox_events.thread_id → inbox_threads.id` (CASCADE) · `inbox_guesty_jobs.thread_id → inbox_threads.id` (CASCADE) · `inbox_guesty_jobs.event_id → inbox_events.id` (SET NULL).

Migration header explicitly says: **independent of GMS-owned `conversations/messages`**. So unification needs either a join layer or schema convergence.
