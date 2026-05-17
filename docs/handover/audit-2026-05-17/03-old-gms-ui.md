# Legacy OLD GMS / admin.friday.mu — UX Inventory

> Audit input for the 2026-05-17 inbox-parity gap analysis. Source: subagent
> read pass over `frontend/src/app/page.tsx`, `src/components/Conversation*.tsx`,
> `DraftPanel.tsx`, `ConsultChat.tsx`, `GuestInfo.tsx`, related side panels.

The legacy admin UI is the message-ops cockpit currently live at admin.friday.mu / gms.friday.mu. Single-page Next.js app, all state in `src/app/page.tsx`, three-pane layout (Conversation list / Detail / Guest info), heavy emphasis on **AI draft review + send** as the marquee workflow. Static-export, SSE-driven, PWA-capable.

## Feature inventory

| Feature | Location | Notes |
|---|---|---|
| 3-pane shell (List · Detail · Info) | `app/page.tsx:1138–1278` | `leftCollapsed` / `rightCollapsed` toggles; mobile uses `mobileView` state (`list` / `detail` / `info`) |
| Top tabs: Inbox / Review / Actions | `ConversationList.tsx:302–326` | Badge counts for unread, review-ready, pending actions |
| Inbox sub-filter chips: All / Unread / Open / Done | `ConversationList.tsx:329–340` | Uses shared `FilterChips` component |
| Search (debounced, full-text) | `app/page.tsx:276–326`, `ConversationList.tsx:170–292` | Server-side `/api/conversations/search`, 300ms debounce |
| Filters: property, channel, date range | `ConversationList.tsx:222–291` | Selects + date inputs, removable chip indicators, count badge on funnel icon |
| Sort: recent / oldest / urgency | `ConversationList.tsx:195–211, 374–383` | Urgency uses sentiment rank (upset > frustrated > neutral > positive) |
| Pull-to-refresh (mobile) | `ConversationList.tsx:100–139, 345–364` | Touch-gesture, 70px threshold, dampened |
| Long-press / right-click context menu | `ConversationList.tsx:385–397, 451–462` | "Mark as Unread" only |
| Conversation list item | `ConversationList.tsx:385–445` | Guest name, unread dot, sentiment dot, channel badge + emoji, property (clickable → property card), status, draft-confidence %, relative timestamp, 2-line preview |
| Conversation header | `ConversationDetail.tsx:218–301` | Guest, sentiment, property (dotted underline → property card), channel, intent badge, dates, party size, avg response time, "seen by" list, collapsible AI summary |
| Message thread | `ConversationDetail.tsx:303–574` | Interleaved messages + sent drafts on one timeline, date separators, inbound/outbound/system bubbles, translation toggle per-bubble, WhatsApp 24h timer, queued-draft cards (Retry / Mark Failed), scroll-to-bottom FAB |
| **AI Draft panel** | `DraftPanel.tsx` | The marquee surface — see §4 below |
| Compose panel | `ComposePanel.tsx` | Collapsed bar → textarea with Fix (AI polish), Ask Friday, Send (Cmd+Enter) |
| Ask Friday (chat consultation) | `ConsultChat.tsx` | Persistent sessions, history sessions, draft-update events, teaching cards, conflict banner, SSE multi-user sync |
| Guest Info side panel | `GuestInfo.tsx` | Email, dates, party, sentiment, returning-guest badge, linked conversations across channels, financials, Mark Done / Reopen, staff notes (AI observations split out), pending actions, suggested next steps (with Ask Friday), Action Trail, auto-send toggle |
| Send confirmation modal + 5s undo | `SendConfirmModal.tsx`, `app/page.tsx:602–691` | Channel selector, teaching summary, learn-mode (`learn`/`no_learn`/`normal`), 5s countdown with Cancel |
| Notifications | `app/page.tsx:154–224`, `NotificationPanel.tsx`, `NotificationBell` | Bell in header, SSE-driven + DB-backed, browser/SW push, sound chime, merge logic for `new_message` → `draft_ready` |
| Keyboard shortcuts | `app/page.tsx:921–985` | ↑/↓ navigate, Enter open, Esc deselect, `/` focus revise input, Cmd+Enter approve & send |
| Property card modal | `PropertyCard.tsx` + `app/page.tsx:741–777` | JSON editor with edit history |
| Side panels (header-launched) | `DashboardStats.tsx` triggers | Teachings, Bug reports, Analytics, Send queue, User mgmt, Refund log, Auto-dismiss rules |
| Pending Actions tab + per-conversation | `PendingActions.tsx` (referenced) | Tier `suggested` vs `pending`, navigates back to conversation |
| Version-bump banner | `app/page.tsx:488–517, 1122–1128` | Polls `/api/version` on focus, prompts reload |
| PWA install + push prompts | `InstallPrompt`, `NotificationPrompt` | Bottom-of-page |

## 1. Overall layout (`app/page.tsx`)

Three columns, dark theme (`#0d1117` background):

- **Left (240–380px)**: `ConversationList` — search + filters + 3 tabs + inbox chips + list
- **Center (flex-1)**: `ConversationDetailView` — header + messages + DraftPanel/ComposePanel pinned bottom
- **Right (288px / `w-72`)**: `GuestInfo` — collapsible sections

Mobile collapses to one column with `mobileView: 'list' | 'detail' | 'info'`. Each pane can be collapsed on desktop via `leftCollapsed` / `rightCollapsed` chevrons (`app/page.tsx:1140–1145`).

**Top-level state** lives entirely in `MessageDashboard()` — ~50+ `useState` hooks for conversations, selected ID, detail, edit/revise modes, undo countdown, search, filters, modals. No URL params (single static page). SSE connection at `app/page.tsx:351–468` drives near-realtime refresh for `new_message`, `draft_ready`, `draft_updated`, `message_sent`, `pending_action_new`, plus `consult_message` and `teaching_action` for the Ask Friday surface.

## 2. ConversationList

Each item (`ConversationList.tsx:385–445`) shows: unread blue dot, guest name, sentiment dot (upset = red, frustrated = amber, positive = green), channel pill + emoji, relative timestamp; line 2: property name (clickable → property card modal), status pill (Open / Review / Sent / Done), draft confidence % (color-coded 80/60); line 3: 2-line message preview with `> ` outbound prefix or `[sys]` system prefix. Selected row gets a 2px blue left-border + gradient.

Tab structure (lines 302–326): Inbox / Review / Actions with badge counts. Inbox shows sub-chips (All/Unread/Open/Done) with counts derived from full list (lines 86–98). Review filters to `latest_draft_state === 'draft_ready' && last_message_direction !== 'outbound'`. Actions swaps the list for `<PendingActionsTab>`.

Search + filter UI (lines 170–291): search debounced 300ms, server-side; filter funnel reveals property/channel selects + date pickers; active filter chips with × removal.

Hover affordance: "Mark as unread" eye-slash button appears on row hover for already-read items (lines 400–406). Long-press (500ms) on mobile / right-click on desktop opens context menu.

## 3. ConversationDetail

**Header** (`ConversationDetail.tsx:218–301`): mobile compact bar (back / guest / info), desktop richer header with intent badge (new_booking, extension, question, complaint, followup), avg/first response time color-coded by minutes (≤15 green, ≤60 amber, else red), `seen_by` ribbon ("Seen by Mathias, Sophie"), collapsible AI summary (one-line truncated → expanded).

**Timeline** (lines 305–537) is the clever bit — it merges `messages` and `sent_drafts` chronologically into a unified timeline, dedupes outbound messages that already show as sent-draft cards (lines 309–321), inserts date separators (Today / Yesterday / "May 14"), renders system notifications centered with gear icon, renders reaction placeholders as italic centered text. **Sent drafts** render as outbound bubbles with green "Sent" badge + reviewer attribution `"Mathias via Friday on WhatsApp"` (lines 365–406).

**Translation UI** (lines 482–520) is per-bubble: for inbound non-English messages, default = English translation with "Original" toggle button + language flag/name. For outbound translated drafts, default = English with toggle to show what was actually sent in guest's language. Sent-draft cards also have a "Show Spanish / Show English" swap (lines 386–395).

**WhatsApp 24h timer** (lines 64–85, 577–582): green "X h Y m remaining" or red "window closed — use template" pinned above compose.

**Queued drafts** (lines 540–559): amber-bordered cards with `⏳ Queued — Guesty API unavailable` + Retry Now / Mark Failed buttons.

Bottom of detail = `<CollapsibleMobilePanel>` wrapping either `<DraftPanel>` (when there's a `draft_ready`/`under_review` draft) or `<ComposePanel>`. Switching is automatic via `revisionPending || detail.drafts.some(...)` check at line 586.

## 4. DraftPanel — the marquee

**Layout** (`DraftPanel.tsx:78–235`): blue-tinted card pinned above compose. Header shows confidence pill (80+ green / 60+ amber / else red) and draft state badge. Clickable to collapse.

**Draft display** (lines 119–128): The draft body renders as a read-only preview block (`p-3 rounded text-sm whitespace-pre-wrap`) inside a scrollable 20vh region. If `draft_translated` differs, it shows underneath in a separate translated card with `LanguageIcon` label.

**Action row** (lines 129–152) — left-to-right:
- **Approve & Send** (green, primary) → `requestApproval(draft.id)` → opens `SendConfirmModal` → 5s undo countdown → `POST /api/drafts/:id/approve`
- **Revise** (toggles inline revision input)
- **Ask Friday** (toggles `<ConsultChat>` inline below — surface B)
- **Edit** (ghost) → switches to inline textarea mode
- **Reject** (ghost) → opens optional reason input

**Edit mode** (lines 100–116): inline textarea with original body, 10em min-height, 50vh max-height, resizable vertical. Buttons: `Send` (commits edit + opens send confirm via `handleDraftAction(..., 'approve', editBody)`), `Cancel`, `Ask Friday`. The edit body is held in `editBody` state in `page.tsx` and passed through `pendingEditBodyRef` into the approve POST.

**Revise** (lines 155–184): single-line text input "Revision instruction (e.g. make it shorter, add check-in time)". Enter or Revise button → `handleRevision(id, 'standard')` → POST `/api/drafts/:id/revise`. Sets `revisionPending=true`; panel shows spinner "Friday is revising..."; cleared when SSE `draft_ready`/`draft_updated` arrives (with 30s timeout fallback at `page.tsx:471–479`). Modes also include `teach` (saves teaching globally or per-property) and `one_time`.

**Reject** (lines 187–199): optional reason input. With text = "Reject with feedback" (Friday learns); empty = "Dismiss" (no learning). POST `/api/drafts/:id/reject`.

**Ask Friday on draft review** (Surface B — lines 204–232): renders `<ConsultChat context="draft_review">` inline, with `initialInstruction=draft.draft_body` and `draftBody=draft.draft_body`. The consult chat hosts chips: `Reply to guest` (calls `requestApproval`), `Polish`, `Shorter`, `More formal`, `More casual`, `STR KB`, plus conditional `Sales KB` if intent is sales-related. `onDraftUpdate` callback wires updates from Friday directly back into edit mode — switching `editingDraft` on, setting `editBody`. This is the key collaboration loop.

**Send flow** (`page.tsx:572–691`):
1. `requestApproval` resolves channel (`whatsapp` / `airbnb` / `booking` / `email` based on `communication_channel` map) and opens `SendConfirmModal` with guest/property/channel/preview/teaching summary.
2. `executeSend` starts a 5s countdown (`undoCountdown` 5→0), blocks SSE refresh via `isEditingRef`, shows undo banner with Cancel.
3. After 5s elapses without cancel: POST `/api/drafts/:id/approve` (or `/api/conversations/:id/compose` for direct-send) with `reviewed_by`, `sent_via`, optional `draft_body` (if edited), optional `learnMode`/`scope`.
4. Toast success, refresh detail/list/stats.
5. Special error: WhatsApp window expired surfaces a 6s toast.

## 5. Ask Friday (`ConsultChat.tsx`) — also worth porting

Chat-style panel, blue-tinted, multiple "contexts" (`revision`, `compose`, `draft_review`, `pending_action`, `next_step`, `teaching`, `learning_candidate`). Features:
- **Persistent sessions**: tries `/api/ai/consult/session/active` first; restores history if same draft. New draft → starts fresh, shows refresh notice.
- **History sessions** (lines 423–461): prior ended sessions render as collapsed dividers with date + user name + summary, expandable to full transcript.
- **Quick-reply chips**: caller-provided (e.g. Polish/Shorter/More formal) + auto-detected from assistant questions (`detectQuestionChips`, lines 83–98).
- **Teaching action cards** (lines 531–591): when AI proposes a teaching, renders `<TeachingCard>` (Create/Update) or `<ConflictBanner>` (flag_conflict — option to revoke old + create new).
- **Multi-user SSE sync** (lines 220–265): listens to `sse:consult_message` and `sse:teaching_action`, merges messages from other team members in real time. Skips own messages via `gms_user_id`.
- **Draft updates**: assistant response can include `draft_update` field which fires `onDraftUpdate(content)` — wires directly back into `editingDraft` + `editBody` in parent.
- **Compaction**: long sessions auto-condense ("Session condensed for efficiency").
- **Missing-knowledge banner**: warns when no property KB file is loaded.
- **Start fresh session** button (lines 652–680): ends current session, summarizes async, adds to history.

Tracked events on every action: `ask_judith_opened`, `ask_judith_message_sent`, `button_click` (approve_send / revise / edit_draft / reject_draft / ask_judith).

## 6. Worth porting (quick hits)

- **Keyboard shortcuts** (`page.tsx:921–985`): ↑/↓ navigation, Enter open, Esc deselect, `/` focus revise input, Cmd+Enter approve. Documented in `HelpPanel.tsx:450–476`.
- **5-second undo on send** — critical UX safety net, blocks SSE refresh during countdown to avoid races.
- **WhatsApp 24h timer** and queued-draft retry cards — channel-aware compose constraints.
- **Returning-guest + linked-conversations** block (`GuestInfo.tsx:222–256`) — surfaces same guest across Airbnb/Booking/WhatsApp/Email.
- **AI observations in staff notes** (`GuestInfo.tsx:83–98, 340–364`) — `[Friday's observation]` lines auto-split out from manual notes with amber accent.
- **Pending-actions guard on Mark Done** (`page.tsx:851–872`) — 409 response shows modal forcing user to view actions first.
- **Sent-message attribution string** (`ConversationDetail.tsx:22–42`) — `"Mathias via Friday on WhatsApp"` parsing handles both new `sent_via_system` field and legacy `via Compose` suffix.
- **Notification merge** (`page.tsx:411–436`) — `new_message` for a conv gets upgraded in place when its `draft_ready` arrives, instead of double-notifying.
- **Action Trail** (`ActionTrail.tsx`, rendered in GuestInfo) — replaces what used to be in-thread draft history.
- **Channel-aware channel resolution for outbound send** — falls back from `communication_channel` to `channel`, with `direct`/`manual`/`unknown` → WhatsApp.

`DraftBanner.tsx` under `app/welcome/` is unrelated — it's a yellow banner on the marketing page flagging draft copy. Not relevant to the inbox audit.
