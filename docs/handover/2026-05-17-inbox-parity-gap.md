# Inbox parity — gap analysis + P0 implementation plan (2026-05-17)

> Synthesis of three concurrent audits:
> - `audit-2026-05-17/02-gms-backend.md` — friday-gms inbox/drafts/Ask Friday surface
> - `audit-2026-05-17/03-old-gms-ui.md` — legacy admin.friday.mu UI (3-pane shell, DraftPanel, ConsultChat)
> - `audit-2026-05-17/04-fad-inbox.md` — FAD InboxModule + WebsiteInboxModule + proxy layer + schema
>
> Context: Ishant's handover (`2026-05-17-NEXT-SESSION-PROMPT.md`) names Priority 0
> as "Inbox parity with GMS + fold website-submodule … should do everything the
> gms does, friday consult should work like ask friday worked for drafts etc, ai
> drafts must work etc."

## TL;DR

The gap is bigger than the handover implies, but the path is clearer:

- **FAD's InboxModule is ~30% of the way there.** The list + detail are already live (proxying to friday-gms's `/api/conversations`). What's missing is everything that actually makes the inbox useful: AI drafts, Approve/Edit/Reject/Revise workflow, Send, real Friday Consult, internal notes, snooze/label/done. None of these have a backend pipeline today.
- **The friday-gms backend has all of it already** — `POST /api/drafts/:id/{approve,reject,revise}`, `POST /api/ai/consult`, `POST /api/conversations/:id/compose`, plus 18-section prompt assembly, prompt caching, multi-user sessions, learning loop, action detection, send-time translation, Guesty browser fallback. **It is the gold standard surface; FAD just hasn't been pointed at it.**
- **FAD's legacy proxy is half-rotten.** Six of FAD's eight inbox proxy routes (server.js:159–571) target old bare paths (`/pending`, `/regenerate/:id`, `/approve/:id`, etc.) that friday-gms removed on 2026-05-13. They 404 in prod. Only the newer `/api/inbox/conversations*` (server.js:1211+) hits live endpoints.
- **The handover's restart-loop story is stale.** friday-gms is NOT crash-looping. Process uptime is 2 days, 102 MB RSS, 0 restarts in the recent log window. The 3,197 number is lifetime. The actual 429 driver is the 12h availability sync + poller hammering OAuth, not crashes.
- **There IS a latent crash in friday-gms** at `draft-generator.ts:243` reading `bv.brandIdentity.voiceDescription` against a schema that no longer has `brandIdentity`. It hasn't fired only because 429s have stopped polling. Fixing 429s will re-expose it. **Must fix before pointing FAD at the draft pipeline.**

**Recommendation — phase it:**

| Phase | Scope | Effort | Outcome |
|---|---|---|---|
| **0a** | Fix latent `voiceDescription` crash in friday-gms | ~10 min | Pipeline stable |
| **0b** | Fix actual 429 driver (availability sync + Breezeway 404 spam) | ~30 min | Token mints drop; Guesty quota recovers within 24h |
| **1** | **Wire** FAD inbox to friday-gms's NEW `/api/drafts/*` + `/api/ai/consult` endpoints. Replace dead legacy proxy routes. Wire compose box, DraftPanel actions, FridayConsult chat to real backend. | ~4-5h | Mathias has working AI drafts + Friday Consult in the new FAD UI today |
| **2** | Fold website-inbox: render `inbox_threads` items as conversations in the unified list with `source=website` filter chip. Keep the HMAC webhook + DLQ untouched. | ~2-3h | One inbox surface, two data sources |
| **3** (deferred) | **Port** draft generator + consult pipeline into fad-backend. Kills the GMS dependency entirely. | ~1-2 weeks | GMS retirement unblocked |

This session targets Phase 0a + 0b + 1 + 2 (P0 of the handover). Phase 3 is the real "port-not-wire" Ishant flagged — it belongs to a future sprint.

**Why phase rather than port-now?** The handover says "probably lift the draft generation into fad-backend since GMS will be deprecated." Audited, the port is 18 sections of prompt assembly, three knowledge tables (`teachings`, `learning_events`, `action_feedback`), 57 property knowledge JSON files, multi-user consult sessions with compaction, action detection, send-time translation, and a Guesty browser fallback. That's not a session — that's a sprint. Meanwhile Mathias needs working AI drafts in the new UI now, and friday-gms already has them. Wire today, port when there's a budget.

---

## Gap inventory — feature × current state × proposed wiring

Drawn from the OLD admin UI (`03-old-gms-ui.md`) feature inventory.

| Feature | OLD GMS UI | FAD InboxModule today | Recommended wiring |
|---|---|---|---|
| 3-pane shell (list / detail / right rail) | ✅ Full | ✅ Already implemented (different visual style) | No change |
| Mobile collapse | ✅ `mobileView` state | ✅ `mobileThreadOpen` slide-over | No change |
| Top tabs: Inbox / Review / Actions | ✅ With badge counts | ❌ Replaced with entity chips (All / Guest / Owner / Vendor / Team) + filter popover | **Add** "Review" tab (filters to `latest_draft_state='draft_ready'`) — operators need quick triage of drafts awaiting approval |
| Inbox sub-filter chips: All / Unread / Open / Done | ✅ `FilterChips` | ❌ | **Add** — surface in filter popover or as chip row |
| Search (debounced, server-side full-text) | ✅ `/api/conversations/search` | ❌ | **Wire** to existing GMS `/api/conversations/search`; add new proxy `GET /api/inbox/conversations/search` |
| Filters: property, channel, date range | ✅ | ⚠️ Has entity chips + status filter; not property/channel/date | **Extend** filter popover; wire to GMS's filter endpoint |
| Sort: recent / oldest / urgency | ✅ Urgency uses sentiment rank | ⚠️ Recent only | Defer — not P0 |
| Pull-to-refresh (mobile) | ✅ Touch gesture | ❌ | Defer — not P0 |
| Conversation list item shape | Guest, unread, sentiment dot, channel pill, property (clickable), status, draft confidence %, preview, timestamp | Guest, channel, last msg, timestamp, status pill | **Extend** list-item — add draft-confidence indicator + sentiment dot. List API already returns the data. |
| Conversation header (intent badge, response-time pill, seen-by ribbon, AI summary toggle) | ✅ | ⚠️ Basic header | **Extend** — pull `conversation_intent`, `avg_response_minutes`, `seen_by`, `ai_summary` from already-bundled `/api/inbox/conversations/:id` response |
| Message thread merging inbound + sent drafts on one timeline | ✅ Dedupes outbound msgs already shown as sent-draft cards | ⚠️ Renders messages but no sent-draft cards | **Add** sent-draft rendering with reviewer attribution ("Mathias via Friday on WhatsApp"). Data shape already in `/api/conversations/:id` response. |
| Date separators in thread | ✅ Today / Yesterday / "May 14" | ❌ | **Add** — local formatting, no backend |
| Per-bubble translation toggle | ✅ Inbound: English default + Original toggle; Outbound: English default + show-sent-language toggle | ⚠️ Per-message Show-original toggle exists (line 695-722) for inbound | **Extend** to outbound. Already proxies to `/api/translation/translate`. |
| WhatsApp 24h timer banner | ✅ Green count / red "window closed" | ❌ | **Add** — `whatsapp_window_open` + `whatsapp_window_expires_at` already in detail bundle |
| Queued-draft retry cards | ✅ Amber-bordered, Retry Now / Mark Failed | ❌ | **Add** — `GET /api/drafts/queued/list` exists |
| **AI Draft panel** (Approve & Send, Revise, Ask Friday, Edit, Reject) | ✅ Marquee surface | ❌ All UI-only, no backend | **Wire to** `POST /api/drafts/:id/{approve,reject,revise}` |
| Draft confidence pill (80+ green / 60+ amber) | ✅ | ❌ | Local rendering from `confidence` field |
| Edit-and-send (inline textarea, commit edits on Approve) | ✅ `editBody` state, posted as `draft_body` in approve | ❌ | **Wire** — approve body accepts `draft_body` field |
| **5-second undo on send** | ✅ Critical safety net, blocks SSE refresh during countdown | ❌ | **Add** — pure frontend, must be ported, blocks `setMessages` refresh during countdown |
| Revise input ("make it shorter, add check-in time") | ✅ With `mode='standard'`/`'teach'`/`'one_time'` | ❌ | **Wire** to `POST /api/drafts/:id/revise` with `revision_instruction` |
| Reject with optional reason (learning signal) | ✅ Empty reason = dismiss; with reason = learning event | ❌ | **Wire** to `POST /api/drafts/:id/reject` |
| **Compose** — manual / AI-draft / direct-send modes | ✅ via `POST /api/conversations/:id/compose` | ⚠️ UI-only Send + "Polish with Friday" | **Wire** to GMS compose endpoint with `mode` param |
| Channel selector (whatsapp / airbnb / booking / email) | ✅ Send-confirm modal | ⚠️ `SendByMenu` does nothing | **Wire** — `available_channels` + `recommended_channel` already in detail bundle |
| Send confirmation modal with teaching summary | ✅ | ❌ | **Add** — uses already-available channel + draft body |
| **Ask Friday / Friday Consult** (persistent sessions, history, draft-update protocol, teaching cards, multi-user SSE sync) | ✅ `ConsultChat.tsx` | ❌ `FridayConsult.tsx` is a stub with scripted strings (confirmed line 17-26) | **Wire to** `POST /api/ai/consult` — see §3 below |
| `[DRAFT_UPDATE]` protocol — Friday rewrites draft → flows into edit mode | ✅ `onDraftUpdate` callback | ❌ | **Add** — parse `draft_update` field from `/api/ai/consult` response, set editBody |
| Quick-reply chips (Polish / Shorter / More formal / STR KB / Sales KB) | ✅ | ❌ | **Add** — frontend-only; send as text in instruction |
| Teaching action cards (Create/Update/Conflict) | ✅ `<TeachingCard>` + `<ConflictBanner>` | ❌ | **Add** — parse `teaching_action(s)` from response |
| Guest Info side panel (returning-guest, linked conversations, financials, AI observations, pending actions, action trail) | ✅ Rich | ⚠️ `ReservationRightPanel` (basic) | Defer — extend in P2 |
| Internal notes (per-thread) | ⚠️ OLD UI has staff notes including `[Friday's observation]` lines | ⚠️ `InternalNoteCompose` — local-only optimistic write; `POST /api/inbox/threads/:id/notes` not built (TODO at 1222-1225) | **Defer** to P2 unless trivial — needs a new fad-backend table |
| Notifications (SSE-driven, browser/SW push, sound chime, merge logic) | ✅ | ⚠️ Socket.IO server exists in fad-backend (server.js:92-129) but no consumers wired | **Defer** to P2 — not on critical path |
| Keyboard shortcuts (↑/↓ / Enter / Esc / `/` / Cmd+Enter) | ✅ Documented | ❌ | **Add** — pure frontend, ~30 lines |
| Property card modal | ✅ JSON editor with edit history | ❌ | Defer |
| Pending Actions tab + per-conversation pending actions | ✅ | ❌ | Defer to P2 |
| Version-bump banner | ✅ Polls `/api/version` on focus | ❌ | Defer |
| PWA install / push prompts | ✅ | ❌ | Defer |

**Stack-ranked P0 scope (within the 4-6h budget):**
1. Update FAD's `/api/messages/*` proxy routes to target NEW `/api/drafts/*` paths (replace dead `/approve/:id`, `/edit/:id`, `/reject/:id`, `/regenerate/:id` bare paths).
2. Wire `DraftPanel`-equivalent UI in FAD's InboxModule: Approve & Send, Revise, Edit, Reject, with 5-second undo countdown.
3. Wire `FridayConsult.tsx` to a new `/api/inbox/consult` proxy → friday-gms `/api/ai/consult`. Parse `draft_update` + `teaching_action` fields.
4. Add Review tab (filter to `draft_ready` drafts).
5. Add WhatsApp 24h timer banner.
6. Render sent drafts in the message thread (timeline merge).
7. Fold website-inbox into the unified list (filter chip `source: website`).

Anything past 6h budget moves to P2.

---

## §1 — AI drafts in FAD Inbox (Phase 1, part A)

### Backend wiring — replace dead legacy proxies

`backend/server.js:325-571` currently proxies to removed bare paths. Replace with `gmsProxy` calls against the live `/api/drafts/*` endpoints documented in `02-gms-backend.md` §4.

Concrete edits (target lines from current server.js):

- **Line 325** `/api/messages/:id/generate-reply` (POST) — repoint from `gmsAPI.post('/regenerate/${messageId}')` to `gmsProxy(req, res, '/api/drafts/' + req.params.id + '/revise', 'POST')`. Note: the OLD endpoint took a message-id; the NEW takes a draft-id. The FAD frontend may need to pass `draftId` instead of `messageId` — confirm during wiring.
- **Line 353** `/api/messages/:id/workflow` (POST) — switch on `req.body.action`: approve → `/api/drafts/:id/approve`, edit → `/api/drafts/:id/approve` with `draft_body`, reject → `/api/drafts/:id/reject`.
- **Lines 469, 500, 540** (the `/api/messages/{approve,edit,reject}/:id` triplet) — same pattern. Either keep the FAD endpoints stable and reroute upstream, or replace with thin proxies under `/api/inbox/drafts/:id/{approve,reject,revise}` for clarity.
- **Line 571** `/api/messages/send` — `/api/conversations/:id/compose` is the right NEW target. Body shape: `{ mode: 'manual'|'draft'|'direct_send', body, channel }`.
- **Lines 159, 227, 287, 422, 449** — the `/pending` and `/conversation/:id` routes — repoint to `/api/conversations` (with `has_pending_draft=true` query) and `/api/conversations/:id`. Already done at lines 1211-1223 under `/api/inbox/conversations*`; can delete the older duplicates.

The cleanup path: prefer **deleting** the dead legacy routes and standardising on a single `/api/inbox/*` prefix under `gmsProxy`. Smaller surface, easier reasoning.

### Frontend wiring — DraftPanel equivalent in InboxModule

`InboxModule.tsx` already shows drafts in the bundled detail (`useThreadDetail` returns drafts array). What's missing is the action surface. Port the patterns from OLD-UI's `DraftPanel.tsx` and `app/page.tsx:572-691` (send flow with 5-second undo):

1. **Detect a ready draft** — `detail.drafts.find(d => d.state === 'draft_ready' || d.state === 'under_review')`.
2. **Render `DraftPanel` component** above the compose box. Borrow the OLD UI structure: confidence pill, draft body preview, translated body if different, action row (Approve & Send / Revise / Edit / Reject / Ask Friday).
3. **State machine in InboxModule:** `editingDraft, editBody, revisionPending, undoCountdown, isEditingRef` — directly portable from OLD page.tsx.
4. **Send flow:**
   - Click Approve & Send → resolve channel (`detail.recommended_channel` or fallback) → open `SendConfirmModal` with channel selector + preview.
   - Start 5s countdown (`setInterval` decrementing `undoCountdown`). Set `isEditingRef.current = true` to block any SSE refresh that would clobber the draft.
   - On 0 (no cancel) → `POST /api/inbox/drafts/:id/approve` with `{ reviewed_by, sent_via, draft_body? (if edited), learnMode? }`.
   - On cancel → clear countdown, restore state.
   - On WhatsApp window expired error → 6s toast with "use template" guidance.
5. **Edit mode:** inline textarea with `editBody` state, "Send" commits via the approve POST with `draft_body` field.
6. **Revise:** small input → `POST /api/inbox/drafts/:id/revise` with `revision_instruction`. Set `revisionPending=true`; clear when next SSE `draft_updated` arrives (or 30s timeout).
7. **Reject:** optional reason → `POST /api/inbox/drafts/:id/reject`. Empty = dismiss, populated = learning event.

The DraftPanel itself is ~250 lines of OLD-UI code — port it, restyle to FAD tokens, but keep the state choreography unchanged.

### What to defer

- Teaching cards (Create/Update/Conflict) — render only when `teaching_action` returned. Stub the UI initially; full TeachingCard component is P2.
- Auto-learn pattern detection — handled by friday-gms server-side, no FAD work needed.
- Multi-user SSE sync (`seen_by` updates, real-time draft arrivals from teammates) — needs an SSE consumer in FAD; defer to P2.

---

## §2 — Friday Consult = "Ask Friday for drafts" (Phase 1, part B)

`FridayConsult.tsx` today is a UI shell with scripted strings (see `04-fad-inbox.md` §1, with the explicit comment at lines 17-26 confirming "no real LLM behind this yet"). The work is to make it call `POST /api/ai/consult` and render the response.

### Backend wiring

Add `POST /api/inbox/consult` to `server.js` that `gmsProxy`'s to `/api/ai/consult`. Pass through body: `{ text, conversationId, context, draftId, draftBody, history, sessionId, model_tier, contextData }`. Forward the JWT via `userScopedGms`.

Add `GET /api/inbox/consult/session/active` → `/api/ai/consult/session/active`.
Add `GET /api/inbox/consult/history/:conversationId` → same name.
Add `POST /api/inbox/consult/session/end` → same name.

### Frontend wiring

Port `ConsultChat.tsx` from OLD UI. Key features to keep:

- **Context-aware**: pass `context: 'draft_review'` when invoked from DraftPanel, `context: 'compose'` from compose box. Other contexts can come later.
- **`[DRAFT_UPDATE]` parsing**: when response contains `draft_update`, fire `onDraftUpdate(draft_update)` → in InboxModule, switch `editingDraft=draft`, `editBody=draft_update`. This is the collaboration loop.
- **Quick chips**: Polish / Shorter / More formal / More casual / STR KB / Sales KB. Map to text instructions ("polish this draft", "STR_KB: ...").
- **Session persistence**: load `/api/inbox/consult/session/active` on open. If returned session matches current `draftId`, restore history. Else start fresh.
- **Auto-detect question chips** (`detectQuestionChips`) — frontend regex on assistant message asking yes/no or A-or-B. Defer if tight on time.

### What to defer

- Multi-user SSE sync (`sse:consult_message`, `sse:teaching_action`) — needs SSE consumer; defer to P2.
- Teaching card rendering — stub for now.
- History sessions (collapsed prior sessions) — defer to P2.
- Compaction visibility ("Session condensed for efficiency") — friday-gms handles compaction; FAD just shows the message stream.

---

## §3 — Fold website-inbox into unified inbox (Phase 2)

Status today (`04-fad-inbox.md` §2 + §4 + §5):

- `WebsiteInboxModule.tsx` is a separate sidebar module (`_data/modules.ts:32`).
- Backend is FAD-native: HMAC webhook, three tables (`inbox_threads`, `inbox_events`, `inbox_guesty_jobs`), DLQ worker, slug→Guesty mapping, Resend email.
- Schema (mig 033) explicitly says: "**independent of GMS-owned `conversations/messages`**."

Two approaches to "fold":

### Option A — Backend stays separate, frontend unifies (recommended)

Render `inbox_threads` rows in the unified InboxModule list with `source: 'website'`. Operator sees one list; data has two origins.

Concrete:
1. **Add** `GET /api/inbox/conversations/unified` in fad-backend. Query GMS for `/api/conversations`, query local `inbox_threads`, merge in JS, return sorted by `last_event_at` / `last_message_at`. Schema needs a unified envelope:
   ```ts
   { id, source: 'gms'|'website', subject, guest_name, guest_email, status, last_event_at, channel?, draft_state?, ... }
   ```
2. **Add** `GET /api/inbox/conversations/:id?source=website` → loads from `inbox_events` instead of GMS.
3. **Frontend** — InboxModule's `useLiveConversations()` swaps to the unified endpoint. Add a `source` filter chip ("All / GMS / Website"). When a website-source thread is selected, render a different detail panel (the existing `WebsiteInboxModule` detail content, embedded).
4. **Remove** website-inbox from the sidebar; keep `WebsiteInboxModule.tsx`'s detail components but mount inside InboxModule's detail pane behind a `if (thread.source === 'website')` branch.

Estimated effort: 2-3h. Doesn't touch the HMAC webhook or DLQ — those keep running.

### Option B — Schema convergence

Add `tenant_id`, `source`, etc. to a generic `inbox_threads` table, migrate GMS `conversations` data into it, retire `conversations` over time. **Much bigger lift** — also requires GMS to either continue maintaining the table or be retired entirely.

**Skip Option B for P0.** It's the Phase 3 destination (when GMS gets retired) but doesn't fit this session.

---

## §4 — Priority 1A reframe: the actual Guesty 429 driver

The handover prescribes "Find the crash cause in friday-gms" as the lever to unblock Guesty. The audit says: **there is no crash loop today.** Process uptime is 2 days, 0 recent restarts. The "3,197 restarts" number is lifetime. The "25/day" figure is stale from 2026-05-14.

The actual driver, confirmed in prod logs:

```
[Guesty] WARNING: 96 token refreshes today. Guesty limit is 5/day.
```

96 refreshes/day from one service. Sources, from `02-gms-backend.md` §5:

1. **12h availability sync** (`src/index.ts:293-304`) iterates ~60 properties and re-asks Guesty for each. Token endpoint hammered hard.
2. **Poller** (`services/poller.ts:97`) → `guestyClient.listConversations(25)` every tick. With aggressive `POLL_INTERVAL_MS`, this alone is sustained pressure.
3. **Breezeway 404 spam** (`index.ts:313-323`) — not Guesty-related but pure log noise; hardcoded tenant id with no Breezeway integration.

**Latent crash in `draft-generator.ts:243`** (`bv.brandIdentity.voiceDescription`) — schema mismatch with `knowledge/brand-voice.json` v2.0.1 (flat, no `brandIdentity` object). Hasn't fired because 429s have stopped polling = no new inbound messages = no draft generation. **Will fire as soon as 429s clear.**

### Concrete Priority 1A action plan

In order (do BEFORE wiring FAD to the draft pipeline):

1. **Fix latent crash** at `friday-gms:src/services/draft-generator.ts:243`. Either:
   - Read the new flat shape (`bv.voice` / `bv.personality` — depending on the v2.0.1 schema; check `brand-voice.json`).
   - Or null-guard: `bv.brandIdentity?.voiceDescription ?? bv.voice_description ?? ''`.
   ETA: 10 min.

2. **Throttle availability sync** at `friday-gms:src/index.ts:293-304`. Either:
   - Increase interval from 12h to 24h.
   - Stagger property fetches with 5s gaps (60 properties × 5s = 5 min, still well within reasonable).
   - Skip properties whose data is fresh (< 24h).
   ETA: 20 min.

3. **Silence Breezeway 404 spam** at `friday-gms:src/index.ts:313-323`. Check tenant has Breezeway creds before calling; or skip silently on first 404.
   ETA: 10 min.

4. **Lower fad-backend retry-after** from 30s → 5 min, retries 1 → 0 (per handover P1(b) hint). Don't burn quota retrying.
   ETA: 10 min in `backend/src/website_inbox/guesty.js`.

This is friday-gms work — needs a separate worktree / branch in `/Users/judith/repos/friday-gms`. Mention to Ishant before starting; the file is not in this worktree.

---

## §5 — Anti-goals (per handover) — confirmed

- ❌ Don't refactor friday-gms's draft pipeline beyond the latent-crash fix. Phase 3 (port to fad-backend) is its own sprint.
- ❌ Don't touch `main` branch. Stay on `fad-design-os-v01-frontend`.
- ❌ Don't deploy migrations out of order. The website-inbox fold doesn't need new migrations (it queries existing tables).
- ❌ Don't burn fad-backend OAuth tokens. The shared-token-file fix from handover P1(b) still applies but is parallel work to this gap doc's recommendations.
- ❌ Don't wire to friday-gms's `/api/drafts/*` endpoints until Priority 1A fixes ship — pointing the new FAD UI at a backend that crashes on first draft generation is worse than not wiring at all.

---

## §6 — Order of operations for this session

| # | Task | Where | Effort |
|---|---|---|---|
| 1 | Latent crash fix in friday-gms `draft-generator.ts:243` | `~/repos/friday-gms` (separate worktree) | 10 min |
| 2 | Availability sync throttle + Breezeway spam silence | `~/repos/friday-gms` | 30 min |
| 3 | Deploy friday-gms, verify draft pipeline doesn't crash | gms.friday.mu | 15 min |
| 4 | Replace dead FAD legacy proxies (server.js:159-571) with `gmsProxy` → NEW endpoints | this worktree | 45 min |
| 5 | Wire DraftPanel surface in InboxModule (Approve/Revise/Edit/Reject + 5s undo) | this worktree | 90 min |
| 6 | Wire FridayConsult to `/api/inbox/consult` (+ `[DRAFT_UPDATE]` parser) | this worktree | 60 min |
| 7 | Add Review tab + WhatsApp 24h banner + sent-draft timeline merge | this worktree | 45 min |
| 8 | Fold website-inbox (unified list endpoint + frontend swap) | this worktree | 90 min |
| 9 | Browser smoke through all surfaces; cleanup smoke tenants | this worktree | 30 min |
| 10 | Commit + push + deploy | this worktree | 15 min |

**Total: ~7 hours.** Over budget by ~1h vs handover's 4-6h estimate. Honest assessment — could trim by deferring website-inbox fold (#8) to a separate session if time-pressured. The wire work (#4-7) is the core P0; #8 is the "fold" half of P0 sub-task 4 but can ship the day after without losing parity value.

---

## §7 — Decisions to confirm with Ishant before starting

1. **Wire vs port** — recommending **wire** for this session, **port** as Phase 3 (1-2 future sessions). Confirms or rejects the handover's "probably the latter" lean.
2. **friday-gms changes** — Phase 0a/0b are friday-gms repo edits in `/Users/judith/repos/friday-gms`. Need confirmation that's the right place and that direct push to its `master` branch is OK (per friday-gms CLAUDE.md). Worktree-add `fad-design-os-v01-frontend`-style branch there too?
3. **Deletion of FAD's dead legacy proxies** (server.js:159, 227, 287, 325, 353, 422, 449, 469, 500, 540, 571) — safe to delete, or keep for backward compat with anything still calling them? Recommend delete; nothing in the FAD frontend appears to call them (audit found only the newer `/api/inbox/conversations*` paths in active use).
4. **Website-inbox unification approach** — Option A (frontend unifies, schema stays split) or skip the fold this session.
5. **Review tab + 5s undo + WhatsApp banner** — confirm these three are in scope (they're not explicit in the handover, but the OLD UI has them and operators rely on them).

Once these answers land, work begins in the order above.
