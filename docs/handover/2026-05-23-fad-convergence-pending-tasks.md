# FAD Convergence Pending Tasks - 2026-05-23

Baseline for this note:

- Repo: `/Users/judith/repos/friday-admin-dashboard`
- Canonical branch: `origin/fad-rebuild`
- Current baseline when this slice started: `62c154205168ea5df3ca0f82f7dcb52335813b41`
- Active worktree for the Ask Friday FAB polish: `/Users/judith/.codex/worktrees/fad-ask-friday-fab-polish-20260523`
- Active branch: `codex/fad-ask-friday-fab-polish-20260523`

## Naming

The main global AI surface is **Ask Friday**.

Avoid alternate public product names in product UI or handovers. Future module-specific assistants can be scoped internally as simple agent modes such as `Design Agent`, `Finance Agent`, `Syndic Agent`, or similar, but the global FAB/fullscreen product surface remains Ask Friday for now.

## Current Ask Friday FAB Slice

Implemented in the active branch:

- Reworked the global Ask Friday composer.
- Added server-side dictation support by reusing the existing `useDictation` hook.
- Added Stop while generating.
- Added request-id stale-response protection through an `AbortController`.
- Preserved stopped turns in the visible transcript.
- Added one-message queueing while Ask Friday is thinking.
- Changed send behavior: Return inserts a newline, Command/Ctrl+Enter sends, explicit Send button sends.
- Added explicit tool-step loading states.
- Improved action card styling and mobile stacking.
- Added direct execution when the operator sends a clear confirmation like "ok", "do it", or "approved" and there is exactly one pending executable action.
- Direct confirmation only applies to non-navigation actions that are already marked `safe` or `approval`; high-risk underlying changes remain routed through approval-request actions.

Important limitation:

- This is not streaming/realtime yet. If Stop aborts a request before a response returns, hidden partial model work cannot be recovered. The user turn and stopped state stay in the transcript, and no action is executed.

## Parked Or Pending Work

1. Ask Friday next polish
   - Better true tool-call telemetry instead of simulated tool-step progress.
   - Optional streaming responses.
   - Better "continue from stopped turn" behavior if backend streaming/partial state is added.
   - Module-scoped internal agent modes under the Ask Friday surface.
   - Full live desktop/mobile smoke after deploy.

2. Calendar UX and data audit
   - Duplicate reservations.
   - Bad/clipped date-line UI.
   - Confirm real reservations and real tasks are wired.
   - Confirm cross-linking into Operations, Reservations, Properties, and Inbox where relevant.
   - Recover the most recent prior Calendar work if current code regressed.

3. Push notifications and stale-client behavior
   - Browser permission flow.
   - Service worker / PWA notification registration.
   - In-app notification feed wiring.
   - Backend realtime notification creation and SSE delivery.
   - Email fallback/backoff behavior.
   - Update banner and stale frontend asset detection; users should see when a new FAD version is available.

4. Inbox and Friday Consult repair follow-up
   - Awaiting reply behavior and placement.
   - Reservation side panel missing guest count, financial details, payment/status, reservation status, and stay context.
   - Missed auto-drafts.
   - Draft quality, stale-draft safety, and full-message-history grounding.
   - Verify reservation/property/availability/KB/teachings/action-feedback context wiring.
   - Preserve backend send truth and human approval.

5. Website AI handoff into FAD
   - Verify live FAD contract after website changes.
   - Handoff state should include messages and visitor follow-up URL where expected.
   - Human takeover must prevent double replies.
   - Team-safe public presence endpoint needs product and permission audit.
   - Website conversations should become live team chat in FAD when taken over, then optionally move to email until WhatsApp is configured.

6. Ops backlog from the Ops convergence handover
   - Screen-by-screen real-data audit: Overview, My Tasks, All Tasks, Schedule Planner, Reported Issues, History, Roster, Insights, Settings.
   - Continue desktop UI simplification inside Ops-owned files.
   - Mobile Ops pass.
   - Natural-language task creation assistant on top of real `/api/tasks`.
   - Schedule Planner functional audit.
   - Roster/Insights recovery with real data only.
   - Booking-triggered task automation audit.
   - Field access and HR permissions regression pass.
   - Comment mention UI cleanup.

7. Real-data module audits
   - Reviews: confirm live API data, no fake persisted/demo data.
   - HR: confirm latest editable backend-wired version is present.
   - Design: confirm recovered Design module and projects are present.
   - Training: confirm teachings are real and editable where expected.
   - Notifications: confirm no demo-backed notification data.

8. Manage / multi-tenant recovery and tenant safety
   - Recover or identify the previous Manage section.
   - Audit whether recent Ask Friday, Inbox, Ops, Website handoff, Notifications, and module clients are tenant-safe.
   - Do not expose cross-tenant data in global context loaders.

9. Friday Stay Portal coordination
   - Read `/Users/judith/Friday Website/docs/FAD-STAY-TOKEN-API-CONTRACT-2026-05-21.md`.
   - Confirm FAD backend contract and Inbox/Ops handoff paths.
   - Inbox should receive guest communications/support context only.
   - Operations owns real tasks, support cases, access readiness, and issue closure.

10. Mary QA staff task/message path
    - Use a FAD-native staff task/message surface if it exists.
    - Do not fake a guest conversation.
    - If no staff task/message surface exists, implement the smallest safe path before sending the QA brief.

11. WhatsApp burner bridge
    - Prototype branch exists but is parked.
    - Do not merge or deploy until explicitly reactivated.
    - Still blocked on burner QR/pairing and delivered-message verification.

## Coordination Rules

- Start every FAD implementation slice from fresh latest `origin/fad-rebuild`.
- Do not use `fad-design-os-v01-frontend` as product truth.
- Do not broad-merge old worktrees.
- Before pushing to `fad-rebuild`, prove ancestry against the current remote tip.
- Do not deploy unless explicitly coordinated.
- Keep Inbox, Ops, Finance, Website handoff, Calendar, and shared shell ownership boundaries explicit before editing shared files.
