# Ask Friday Coordination Boundaries - 2026-05-23

## Naming Lock

- User-facing product/surface name: **Ask Friday**
- Do not use "OS Friday" in UI, handovers, docs, or public/product wording.
- Internal specialist modes should use role names, not separate public personas:
  - `Design Agent`
  - `Finance Agent`
  - `Syndic Agent`
  - similar role-scoped names

## Current FAD-Owned Ask Friday Frontend Work

Branch:

- `origin/codex/fad-ask-friday-fab-polish-20260523 @ 15a35603b0255b5b07fe58c2214f5e33bde1a2ba`

Committed scope:

- Reworked global Ask Friday composer.
- Added dictation by reusing the existing `useDictation` hook.
- Added Stop while generating.
- Added request-id stale-response protection with `AbortController`.
- Preserved stopped turns in the visible transcript.
- Added one-message queueing while Ask Friday is thinking.
- Changed send behavior: Return inserts newline; Cmd/Ctrl+Enter sends; Send button sends.
- Added explicit tool-step loading states.
- Improved action card styling and mobile stacking.
- Added direct execution when the operator clearly confirms exactly one pending executable action.
- Direct confirmation applies only to non-navigation actions already marked `safe` or `approval`; high-risk changes remain approval-routed.

Important limitation:

- No streaming/realtime yet. If Stop aborts a request before a response returns, hidden partial model work cannot be recovered. The user turn and stopped state stay in the transcript, and no action is executed.

## Avoid Touching Until Merged Or Parked

FAD session owns these files until `15a3560` is merged/cherry-picked or explicitly parked:

- `frontend/src/app/fad/_components/FridayDrawer.tsx`
- `frontend/src/app/fad/_components/FridayFullscreen.tsx`
- `frontend/src/app/fad/_data/fridayClient.ts`
- `frontend/src/app/fad/fad.css`

Medium-risk; avoid unless necessary:

- `frontend/src/app/fad/_components/icons.tsx`

If Ask Friday Core must edit these files, first start from latest `origin/fad-rebuild`, cherry-pick or merge `15a3560`, then continue.

## Website Session-Owned Files To Avoid

Do not touch these from FAD unless explicitly coordinated with the Website session:

- `docs/ASK-FRIDAY-UNIFIED-AI-LEARNING-LOOP-2026-05-23.md`
- `audits/`
- `lib/ask-friday/handoff.ts`
- `app/api/ask-friday/handoff/state/route.ts`
- `app/api/ask-friday/handoff/visitor-message/route.ts`
- `app/api/ask-friday/route.ts`
- `components/AskFridayHero.tsx`
- `components/AskFridayLauncher.tsx`
- `app/api/owner-enquiry/chat/route.ts`
- `app/api/feedback/chat/route.ts`
- `lib/ask-friday/transcript.ts`
- `lib/ask-friday/model-client.ts`
- `lib/ai/chat-client.ts`

## Contracts To Preserve

Website handoff:

- `human_takeover` or `aiMayReply:false` stops website AI replies.
- Visitor follow-ups after takeover go to FAD visitor-message proxy, not `/api/ask-friday`.
- Staff messages from FAD render as team replies on the website.
- FAD public presence must be public-safe only: no staff names, schedules, workload, or internal status.

Ask Friday product boundaries:

- Owner Ask Friday stays owner-scoped.
- Owner Ask Friday must not use public web search unless separately approved.
- High-risk Ask Friday actions remain approval-routed.
- Human send/approval remains source of truth for guest-facing sends.
- Backend send truth and stale-draft safety must not be weakened.

Ownership:

- Inbox owns guest communication, proposal/detection, and conversation context.
- Operations owns real tasks, support cases, access readiness, issue execution, and closure.
- Finance owns real financial records.
- Notifications are event inbox/archive, not TeamInbox conversation.

## Safe For Ask Friday Core Architecture Session

The Ask Friday Core session can safely continue architecture/scoping only for:

- Contracts.
- Data flow.
- Memory model.
- Context object design.
- Confidence gates.
- Eval plan.
- Risk register.
- Implementation split.
- Future prompts.

Backend/core planning is safe if it does not alter frontend client expectations without coordination.

Potential safe future implementation areas, after coordination:

- Provider routing and fallback model policy.
- Structured context assembly.
- Action registry and action risk classification.
- Eval fixtures.
- Logging/telemetry schema.
- Internal memory/teaching read model.

## Report Before Merge Or Push

Report before merge/push if changing any of:

- Ask Friday contract.
- Endpoint payload.
- Learning/teaching behavior.
- Handoff behavior.
- Public naming.
- Action execution semantics.
- Provider/model default.
- Public presence response shape.

## Collision Risks

High risk:

- Frontend Ask Friday drawer/fullscreen/composer work.
- `fridayClient.ts` request/response expectations.
- Global FAD CSS used by the Ask Friday drawer/fullscreen.

Medium risk:

- Shared icons.
- Shared shell/FAB behavior.
- Notification/action card styling if implemented globally.

Low risk:

- Docs-only architecture.
- Backend-only eval scaffolding with no endpoint changes.
- Research notes and future prompts.
