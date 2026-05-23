# FAD Next Session Launch Prompt - 2026-05-23

Paste this into the next Codex FAD session.

---

Continue FAD essential systems work from a clean baseline.

Repo:

`/Users/judith/repos/friday-admin-dashboard`

Canonical branch:

`origin/fad-rebuild`

First, do not implement. Ground yourself:

1. `git fetch origin --prune`
2. `git ls-remote origin refs/heads/fad-rebuild`
3. Create a fresh separate worktree from latest `origin/fad-rebuild`.
4. Verify the worktree branch descends from the current remote tip.
5. Check live frontend truth at `https://admin.friday.mu/version.json`.
6. Check backend health/version if backend work is in scope.
7. Do not deploy until explicitly coordinated.

Read these handover docs first. If they are not on `origin/fad-rebuild` yet, fetch/read them from `origin/codex/fad-next-session-handover-20260523`:

- `docs/handover/2026-05-23-fad-essential-systems-next-session.md`
- `docs/handover/2026-05-23-fad-demo-data-truth-audit.md`
- `docs/handover/2026-05-23-ask-friday-coordination-boundaries.md`
- `docs/handover/2026-05-23-fad-next-session-launch-prompt.md`
- `docs/handover/2026-05-22-fad-auth-inbox-consult-handover.md`
- `docs/handover/2026-05-22-ops-desktop-audit-handover.md`

Also read from branch if needed:

- `origin/codex/fad-ask-friday-fab-polish-20260523:docs/handover/2026-05-23-fad-convergence-pending-tasks.md`

Important branch facts:

- Current remote baseline observed by prior session: `origin/fad-rebuild @ 62c154205168ea5df3ca0f82f7dcb52335813b41`
- Ask Friday FAB polish branch: `origin/codex/fad-ask-friday-fab-polish-20260523 @ 15a35603b0255b5b07fe58c2214f5e33bde1a2ba`
- No-demo-data partial branch: `origin/codex/fad-no-demo-data-20260523 @ 169ea9b36c6c8766df4e95a14342531c6abdbb20`
- Notification email backoff branch: `origin/codex/fad-notification-email-backoff-20260523 @ dc151ff76e736dc2f73126f56ff5961ace6d5c98`

Locked naming:

- User-facing global AI surface is **Ask Friday**.
- Do not use "OS Friday" in UI, handovers, docs, or public/product wording.
- Internal specialist modes should use role names, not separate public personas.

Current coordination boundaries:

- FAD Ask Friday frontend polish owns these until merged/cherry-picked/parked:
  - `frontend/src/app/fad/_components/FridayDrawer.tsx`
  - `frontend/src/app/fad/_components/FridayFullscreen.tsx`
  - `frontend/src/app/fad/_data/fridayClient.ts`
  - `frontend/src/app/fad/fad.css`
  - `frontend/src/app/fad/_components/icons.tsx` unless necessary
- Website session owns website Ask Friday/handoff files. Do not edit website repo from this FAD session.
- Preserve website handoff contracts:
  - `human_takeover` or `aiMayReply:false` stops website AI replies.
  - Visitor follow-ups after takeover go to FAD visitor-message proxy, not `/api/ask-friday`.
  - Staff messages from FAD render as team replies.
  - Public presence is public-safe only.
  - Owner Ask Friday remains owner-scoped.
  - High-risk Ask Friday actions remain approval-routed.

Recommended implementation order after read-only grounding:

1. Data truth gate:
   - Remove fake Finance sidebar count.
   - Notifications panel/sidebar real-only.
   - Review and merge/supersede `codex/fad-no-demo-data-20260523`.
   - Exclude demo/fixture module data from Ask Friday context.

2. Ask Friday Core:
   - If editing frontend Ask Friday files, first merge/cherry-pick `15a3560` or explicitly park it.
   - Verify model paths and make Gemini 3.5 Flash primary where applicable, Kimi fallback.
   - Preserve polished UI behaviors already in the Ask Friday polish branch.
   - Design structured context, action registry, memory model, confidence gates, evals, and risk controls.

3. Website AI handoff:
   - Coordinate with Website session.
   - Re-smoke takeover, staff replies, visitor follow-ups, and public presence after FAD endpoints are live.

4. Inbox / Friday Consult:
   - Fix missed website inquiry drafts.
   - Rework awaiting-reply behavior.
   - Add reservation/financial/property/guest/availability context.
   - Preserve backend send truth, stale-draft safety, and human approval.

5. Calendar / Ops / Notifications:
   - Duplicate reservations.
   - Date-line UI breakage.
   - Real reservations/tasks and cross-links.
   - Push notifications, update banner, and stale-client behavior.

6. First usable module loop:
   - Inbox, Ops, Reviews, HR, Calendar, Properties, Reservations, Guests, Owners lite, Finance capture, Design, Training, Settings.
   - Use real data only or truthful empty states.

Parked but preserved:

- Manage/multi-tenant recovery.
- Full multi-tenant correctness audit.
- Friday Stay Portal contract and Inbox/Ops handoff.
- Mary QA FAD-native staff task/message path.
- WhatsApp burner bridge prototype.
- Legal/Admin full module.
- Finance full backend and Mathias additions.

Verification requirements before saying fixed:

- Backend focused tests for touched paths.
- Frontend typecheck.
- Frontend production build.
- Desktop and mobile browser smoke.
- Live version/backend route checks if deployed.
- No frontend-only deploy if backend changed.

---
