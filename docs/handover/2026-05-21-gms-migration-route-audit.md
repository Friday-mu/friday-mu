# GMS Migration Route Audit — 2026-05-21

Scope: cross-check the GMS migration list against the current FAD Inbox/Analytics/Translation implementation after the FAD-native Inbox restructuring.

## Decision Summary

| Surface | Current FAD usage | Decision | Change made |
|---|---|---|---|
| Inbox manual compose | Current FAD manual sends use `sendCompose()` → `/api/outbound/send` → FAD direct Guesty send. The old `/api/inbox/conversations/:id/compose` route is not used by the current UI for typed replies. | Do not port old compose wholesale. Keep only as legacy compatibility for dormant AI compose modes. | No functional compose route change. Updated comments only. |
| Draft revise | Current FAD DraftPanel still calls `POST /api/inbox/drafts/:id/revise`. | Needed. Must be FAD-native because this is still an active review workflow. | Added FAD-native revise handling in `backend/src/inbox/drafts_send.js`, with stale-draft guard, revision log, learning event, optional teaching, and FAD draft generation trigger. Removed GMS proxy from `backend/server.js`. |
| Conversation translate | Current FAD primarily uses background translation + `/api/ai/translate`; old conversation translate route was a legacy proxy. | Keep an improved FAD-native on-demand path so legacy/UI callers do not hit GMS. | Added `POST /api/inbox/conversations/:id/translate` in `backend/src/inbox/conversations_read.js`. Removed GMS proxy from `backend/server.js`. |
| Analytics events | Current FAD uses `trackEvent()` → `/api/analytics/events/batch`. Route still proxied to GMS even though `analytics_events` exists in shared DB. | Needed. FAD event ingestion should be local. | Added migration `068_analytics_events.sql` and `backend/src/analytics/events.js`; mounted before analytics GMS fallback. |
| GMS analytics v2/dashboard | Old `frontend/src/components/AnalyticsDashboard.tsx` uses `/api/analytics/v2/*`; current `/fad` Analytics module is separate and still demo-tagged. | Do not port old GMS analytics dashboard as-is. Rebuild FAD Analytics later from FAD-owned data contracts. | Left broad `/api/analytics/*` fallback proxy for legacy non-event reporting. |
| `/api/version` | Legacy update-banner/status endpoint. | Cheap to own in FAD; no reason to proxy. | Replaced GMS proxy with native FAD version response. |

## Remaining Intentional GMS Dependencies

- `/api/auth/login` and `/api/auth/me` still proxy to GMS auth because GMS remains current user/JWT source of truth.
- `/api/inbox/conversations/:id/compose` remains as a legacy compatibility route, but current FAD typed guest replies do not use it.
- `/api/analytics/v2/*`, `/api/analytics/dashboard`, and old dashboard reporting remain legacy/proxied until the FAD Analytics module is rebuilt against real FAD data.

## Verification

- `cd backend && npm test -- --runTestsByPath src/analytics/events.test.js src/inbox/drafts_send.test.js src/inbox/conversations_translate.test.js src/inbox/pending_actions.test.js`
- `cd backend && npm test`
- `cd backend && npm run build`
- `cd frontend && npm run test`
- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm run build`
- Applied migration: `068_analytics_events.sql`
