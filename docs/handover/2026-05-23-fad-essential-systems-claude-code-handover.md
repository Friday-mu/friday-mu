# FAD Essential Systems - Claude Code Handover - 2026-05-23

## Purpose

This handover is for Claude Code to continue Friday Admin Dashboard essential systems work after PR #4 was merged and deployed.

The previous Codex sessions have completed the first integrated slice:

- FAD live-data truth gates
- Ask Friday frontend polish
- Ask Friday Core v1 backend/docs scaffold
- production merge and deploy to `admin.friday.mu`

This document records exactly what shipped, what was verified, what remains, and how to restart safely.

## Current Canonical State

- Repo: `/Users/judith/repos/friday-admin-dashboard`
- Canonical branch: `origin/fad-rebuild`
- Merged PR: `https://github.com/Friday-mu/friday-mu/pull/4`
- Merge commit on `fad-rebuild`: `1fec8633a36ea1c282441924e0c63c5da1fa0371`
- Integrated branch that fed PR #4: `codex/fad-essential-systems-20260523-62c1542`
- Integrated worktree used by Codex: `/Users/judith/.codex/worktrees/fad-essential-systems-20260523-62c1542`
- PR #4 merged at: `2026-05-23T07:00:50Z`
- Production deploy completed after merge.
- This handover itself was pushed after deploy as a docs-only follow-up. If `origin/fad-rebuild` is newer than `1fec8633a36ea1c282441924e0c63c5da1fa0371` only by handover/docs commits, live production is still expected to report `1fec863` until the next coordinated deploy. Do not deploy solely to update handover docs.

Live deployment evidence after deploy:

```json
{
  "frontend": {
    "url": "https://admin.friday.mu/version.json",
    "version": "1fec863",
    "branch": "fad-rebuild",
    "commit": "1fec8633a36ea1c282441924e0c63c5da1fa0371",
    "deployedAt": "2026-05-23T07:03:04Z"
  },
  "backend": {
    "url": "https://admin.friday.mu/api/version",
    "service": "fad-backend",
    "version": "1fec863",
    "commit": "1fec8633a36ea1c282441924e0c63c5da1fa0371",
    "built_at": "2026-05-23T07:04:06Z"
  }
}
```

Production roots:

- Frontend root: `/var/www/fad`
- Backend root: `/var/www/fad-backend`
- Backend PM2 process: `fad-backend`
- Working SSH identity used by Codex: `~/.ssh/do_friday_admin`

Backups taken before deploy:

- `/var/backups/fad-frontend-1fec863-20260523-070322`
- `/var/backups/fad-backend-1fec863-20260523-070322`

## Coordination Status

The Ask Friday Core branch is parked:

- Branch: `codex/ask-friday-core-v1-20260523`
- Worktree: `/Users/judith/.codex/worktrees/ask-friday-core-v1-20260523`

Its backend/docs commits were integrated into PR #4:

- Original `d5e9deb` became integrated commit `e9cad94`
- Original `a8d85ee` became integrated commit `81f5ce6`
- Original `a98f84c` became integrated commit `aaf3bd7`

The old Ask Friday FAB polish branch is superseded:

- Branch: `codex/fad-ask-friday-fab-polish-20260523`
- Commit `15a3560` has the same stable patch-id as integrated commit `88aa78f`
- Do not merge or PR that branch independently.

Other related branches:

- `codex/fad-no-demo-data-20260523`: partially superseded by the live-data truth gate work in PR #4. If continuing demo cleanup, inspect it as reference only and do not merge wholesale.
- `codex/fad-notification-email-backoff-20260523`: already part of the pre-PR #4 base lineage through `fad-rebuild`.

The other Ask Friday/Core session can continue, but it should start from latest `origin/fad-rebuild` and create a fresh branch/worktree for any new work. Do not continue by pushing parked branches.

## Naming Guardrails

- User-facing global AI surface: **Ask Friday**
- Do not introduce alternate public product names in UI, docs, handovers, public copy, or product wording.
- Internal specialist modes should use role names, for example `Design Agent`, `Finance Agent`, `Syndic Agent`.
- Owner Ask Friday remains owner-scoped.
- High-risk Ask Friday actions remain approval-routed.

## Website Handoff Contracts To Preserve

These are still active constraints for future work:

- `human_takeover` or `aiMayReply:false` stops website AI replies.
- Visitor follow-ups after takeover go to the FAD visitor-message proxy, not `/api/ask-friday`.
- Staff messages from FAD render as team replies.
- Public presence is public-safe only.
- Owner Ask Friday remains owner-scoped.
- High-risk Ask Friday actions remain approval-routed.

Do not touch the Friday Website repo until there is an explicit website-side task. If website changes are needed, use a separate fresh worktree in the Friday Website repo and coordinate the API contract first.

## What Shipped In PR #4

### 1. Ask Friday FAB/frontend polish

Integrated from the superseded FAB polish branch:

- Reworked the global Ask Friday composer.
- Added server-side dictation support by reusing the existing `useDictation` hook.
- Added Stop while generating.
- Added request-id stale-response protection through `AbortController`.
- Preserved stopped turns in the visible transcript.
- Added one-message queueing while Ask Friday is thinking.
- Changed send behavior: Return inserts newline, Command/Ctrl+Enter sends, explicit Send button sends.
- Added explicit tool-step loading states.
- Improved action card styling and mobile stacking.
- Added direct execution when the operator sends a clear confirmation and there is exactly one pending executable action.
- Direct confirmation applies only to safe or approval-routed non-navigation actions.
- High-risk changes still route through approval-request actions.

Touched files include:

- `frontend/src/app/fad/_components/FridayDrawer.tsx`
- `frontend/src/app/fad/_components/FridayFullscreen.tsx`
- `frontend/src/app/fad/_data/fridayClient.ts`
- `frontend/src/app/fad/fad.css`
- `frontend/src/app/fad/_components/icons.tsx`

### 2. Live-data truth gates

The goal was to stop FAD from presenting fixture/demo counts as live operational truth.

Changes shipped:

- Finance sidebar fake count removed.
- Notification module/sidebar count is real-only.
- Fixture-derived pending counts suppressed in live-only contexts.
- Ask Friday context excludes demo/fixture module data.
- Ask Friday context includes live source metadata so responses can distinguish live data from unavailable data.
- Calendar fetch now uses an overlap-window reservation query instead of a narrow same-day query.
- Calendar clears stale rows while refetching.
- Notifications panel has real-only empty state behavior.
- Notifications module exposes push opt-in without fake notification count inflation.
- Update banner now polls `/version.json` every 5 minutes while the app stays open.
- `frontend/DEMO_CRUFT.md` updated with the current cleanup status.

Key touched files:

- `backend/src/fad/friday.js`
- `backend/src/fad/friday.test.js`
- `frontend/src/app/fad/_components/UpdateBanner.tsx`
- `frontend/src/app/fad/_components/modules/CalendarModule.tsx`
- `frontend/src/app/fad/_components/modules/NotificationsModule.tsx`
- `frontend/src/app/fad/_data/pendingCounts.ts`
- `frontend/src/app/fad/_data/reservationsClient.ts`
- `frontend/DEMO_CRUFT.md`

### 3. Ask Friday model routing

Changes shipped:

- Gemini provider added to `backend/src/ai/chat_proxy.js`.
- Ask Friday model preference now uses Gemini 3.5 Flash as primary where applicable.
- Kimi remains fallback.
- Fallback behavior is tested, including Gemini quota/rate-limit fallback to Kimi.

Key touched files:

- `backend/src/ai/chat_proxy.js`
- `backend/src/ai/chat_proxy.test.js`

### 4. Ask Friday Core v1 backend/docs

Integrated Core backend/docs from the parked Core branch.

New migration:

- `backend/migrations/074_ask_friday_core.sql`

New backend modules:

- `backend/src/ask_friday/contracts.js`
- `backend/src/ask_friday/analyzer.js`
- `backend/src/ask_friday/publisher.js`
- `backend/src/ask_friday/eval_runner.js`
- `backend/src/ask_friday/index.js`
- matching focused tests for each module

Server mount:

- `backend/server.js` mounts Core routes at `/api/ask-friday/core`

New docs:

- `docs/architecture/ask-friday-core-v1-2026-05-23.md`
- `docs/handover/2026-05-23-ask-friday-core-v1.md`
- `docs/handover/2026-05-23-fad-convergence-pending-tasks.md`

Core concepts now present:

- surface registry
- context packs
- learning events
- evidence references
- KB candidates
- approval-routed action requests
- eval cases
- eval runs
- identity links and consent events

Production database evidence:

```json
{
  "migration": {
    "filename": "074_ask_friday_core.sql",
    "applied_at": "2026-05-23T07:04:10.403Z"
  },
  "surfaces": 10,
  "contextPacks": 0
}
```

Authenticated smoke against `http://127.0.0.1:3002/api/ask-friday/core/surfaces` returned:

```json
{
  "surfaces": 8,
  "first": "internal_agent_bridge",
  "hasFadConsult": true
}
```

The difference between `surfaces: 10` in DB and `surfaces: 8` in the authenticated route is expected because the route defaults to `status=active`; two seeded surfaces are planned.

Unauthenticated route behavior:

- `GET https://admin.friday.mu/api/ask-friday/core/surfaces` returns `401 Unauthorized`
- This is expected.

## Verification Already Run

Before PR #4:

```bash
cd backend
npm test -- ask_friday
npm run build
npm test -- --runTestsByPath src/fad/friday.test.js src/ai/chat_proxy.test.js src/reservations/scheduleOverlap.test.js src/realtime/index.test.js --runInBand

cd ../frontend
npx tsc --noEmit
npm run build
```

Results:

- Ask Friday Core tests: 5 suites, 23 tests passed.
- Focused backend tests: 4 suites, 34 tests passed.
- Backend `npm run build`: passed.
- Frontend `npx tsc --noEmit`: passed.
- Frontend production build: passed.
- Naming scan for prohibited alternate public AI names: passed after doc cleanup.

After deploy:

- `https://admin.friday.mu/version.json` reports merge commit `1fec863`.
- `https://admin.friday.mu/api/version` reports merge commit `1fec863`.
- PM2 `fad-backend` online.
- Migration `074_ask_friday_core.sql` applied.
- Guesty poller initial sync after restart completed:
  - 60 listings
  - 200 reservations
- Live static chunk list matched the local `frontend/out/_next/static/chunks` list.
- Desktop and mobile browser smoke opened live sign-in successfully.

Browser smoke notes:

- Desktop screenshot: `/Users/judith/.codex/worktrees/bd21/friday-admin-dashboard/fad-live-desktop-1fec863.png`
- Mobile screenshot: `/Users/judith/.codex/worktrees/bd21/friday-admin-dashboard/fad-live-mobile-1fec863.png`
- Pre-login console showed 401s for tenant/design probes:
  - `/api/tenants/me/modules`
  - `/api/design/annex_a`
  - `/api/tenants/me`
- Those 401s are expected before authentication.

## Deployment Details

Frontend deploy:

- Built static export from `frontend/out`.
- Wrote `frontend/out/version.json` with merge commit metadata.
- Rsynced to `/var/www/fad`.

Backend deploy:

- Rsynced `backend/` to `/var/www/fad-backend`.
- Preserved production `.env`, caches, uploads, `node_modules`, and generated output boundaries.
- Ran remote syntax checks:
  - `node --check server.js`
  - `node --check src/ask_friday/*.js`
  - `node --check src/ai/chat_proxy.js`
  - `node --check src/fad/friday.js`
- Restarted PM2:

```bash
GIT_COMMIT=1fec8633a36ea1c282441924e0c63c5da1fa0371 \
APP_VERSION=1fec863 \
BUILD_TIME=2026-05-23T07:04:06Z \
pm2 restart fad-backend --update-env
```

Important deploy rule:

- If backend changes, do not deploy frontend-only.
- Frontend and backend should be deployed from the same SHA.

## Known Live Issues Or Residual Risk

These are not blockers for the merged/deployed slice, but Claude Code should know them:

1. Full authenticated product smoke was not completed.
   - Live sign-in screen was verified on desktop and mobile.
   - A real staff login is needed to test the in-app Ask Friday drawer, Calendar, Notifications, Finance sidebar, and UpdateBanner behavior end to end.

2. Context packs are not seeded/published yet.
   - DB shows `ask_friday_context_packs` count is `0`.
   - Core schema and publisher exist, but the first production context pack still needs to be created/published.

3. Ask Friday Core is deployed but not fully operationalized.
   - The route surface exists.
   - The FAD frontend is not yet fully wired to consume Core context packs/action registry as the source of policy truth.
   - Website-side event ingestion and context consumption still require a separate coordinated website slice.

4. Existing backend logs still include older issues unrelated to PR #4:
   - Kimi timeouts and context length failures in older inbox/consult flows.
   - Some older realtime email 429 entries before the backoff work.
   - Older analytics batch upstream 401s.
   - These were present before this deploy and should be triaged separately unless they reproduce after `1fec863`.

5. Deploy docs contain stale references.
   - Some files still reference `/var/www/friday-dashboard` or Docker deploy scripts.
   - Recent operational truth is `/var/www/fad` and `/var/www/fad-backend`.
   - Clean up deploy docs in a docs-only slice.

6. Disk usage on VPS was 86 percent before deploy.
   - After backups there was still about 3.5G free.
   - Do not create repeated full backups without checking disk.

## What Claude Code Should Do Next

### Immediate next step: post-deploy stabilization

Run this first before new feature work:

```bash
curl -fsS https://admin.friday.mu/version.json
curl -fsS https://admin.friday.mu/api/version
ssh -i ~/.ssh/do_friday_admin -o BatchMode=yes -o IdentitiesOnly=yes root@admin.friday.mu \
  'pm2 describe fad-backend | sed -n "1,80p"; pm2 logs fad-backend --lines 100 --nostream'
```

Check:

- no new migration failures
- no crash loop
- Guesty poller still healthy
- no new 5xxs from touched routes
- `/api/ask-friday/core/surfaces` still works with an authenticated staff token

Then do authenticated browser smoke with a real staff login:

- sign in
- open Ask Friday drawer
- open Ask Friday fullscreen
- send a harmless Ask Friday question
- verify Stop and queued send behavior if safe
- open Calendar and confirm live reservations load
- open Notifications and confirm no fake count
- confirm Finance sidebar has no fake count
- leave tab open long enough to make sure UpdateBanner does not false-positive
- mobile viewport smoke for sign-in and Ask Friday entrypoint

### Next implementation slice: Ask Friday Core operationalization

Recommended first slice:

1. Seed and publish the first context pack.
2. Add a small admin/dev command to publish or inspect context packs.
3. Wire FAD Ask Friday to read the relevant Core context/action registry where appropriate.
4. Keep high-risk actions approval-routed.
5. Add tests around context-pack retrieval and frontend client behavior.

Expected useful files:

- `backend/src/ask_friday/publisher.js`
- `backend/src/ask_friday/index.js`
- `backend/src/ask_friday/contracts.js`
- `backend/migrations/074_ask_friday_core.sql`
- `frontend/src/app/fad/_data/fridayClient.ts`
- `frontend/src/app/fad/_components/FridayDrawer.tsx`
- `frontend/src/app/fad/_components/FridayFullscreen.tsx`

Before editing frontend Ask Friday files, verify no other active session owns them.

### Next implementation slice: data truth cleanup

Continue from `frontend/DEMO_CRUFT.md`.

Priorities:

- audit remaining sidebar counts
- audit fixture-backed module cards
- remove or label demo-only financial, legal, owner, marketing, and analytics data
- ensure Ask Friday context never ingests fixture/demo module data as truth
- add tests for any backend truth endpoint touched

Reference branch:

- `codex/fad-no-demo-data-20260523`

Use it as reference only; do not merge it wholesale.

### Next implementation slice: Notifications and realtime follow-up

After authenticated smoke:

- confirm Push opt-in flow works
- confirm VAPID public/private env state in prod if push is expected
- check email-notification backoff behavior in current logs
- do not add fake notification data

### Next implementation slice: deploy docs cleanup

Docs still conflict.

Clean targets:

- `docs/deploy.md`
- `CLAUDE.md`
- old script references if still misleading

Canonical live facts:

- frontend root `/var/www/fad`
- backend root `/var/www/fad-backend`
- PM2 process `fad-backend`
- `admin.friday.mu` is canonical

Do not run old Docker deploy scripts unless explicitly revalidated.

## Fresh Claude Code Start Prompt

Paste this into Claude Code:

```text
You are continuing Friday Admin Dashboard essential systems work.

Repo:
/Users/judith/repos/friday-admin-dashboard

Canonical branch:
origin/fad-rebuild

Latest deployed merge commit:
1fec8633a36ea1c282441924e0c63c5da1fa0371

First, do not implement until grounded:
1. Read CLAUDE.md and any AGENTS.md if present.
2. git fetch origin --prune
3. git ls-remote origin refs/heads/fad-rebuild
4. Create a fresh worktree from latest origin/fad-rebuild.
5. Verify the worktree descends from current remote tip.
6. Read docs/handover/2026-05-23-fad-essential-systems-claude-code-handover.md.
7. Check live frontend truth at https://admin.friday.mu/version.json.
8. Check backend truth at https://admin.friday.mu/api/version.
9. Do not deploy unless explicitly coordinating a deploy.

Current live evidence should be:
- Frontend version 1fec863, commit 1fec8633a36ea1c282441924e0c63c5da1fa0371
- Backend version 1fec863, commit 1fec8633a36ea1c282441924e0c63c5da1fa0371
- PM2 process fad-backend online
- Ask Friday Core migration 074_ask_friday_core.sql applied
- origin/fad-rebuild may be newer by docs-only handover commits. Treat that as expected branch/live skew unless code changed after 1fec863.

Coordination:
- PR #4 is merged and deployed.
- Ask Friday Core parked branch is codex/ask-friday-core-v1-20260523. Its work is already integrated. Do not merge or PR it independently.
- Old Ask Friday FAB polish branch is superseded. Do not merge or PR it independently.
- Use a fresh branch/worktree for new work.

Guardrails:
- User-facing global AI surface is Ask Friday.
- Do not introduce alternate public product names in UI/docs/public wording.
- Internal specialist modes should use role names.
- Website handoff contracts must be preserved:
  - human_takeover or aiMayReply:false stops website AI replies
  - visitor follow-ups after takeover go to FAD visitor-message proxy, not /api/ask-friday
  - staff messages from FAD render as team replies
  - public presence is public-safe only
  - owner Ask Friday remains owner-scoped
  - high-risk Ask Friday actions remain approval-routed

Recommended next order:
1. Post-deploy log watch and authenticated smoke on live FAD.
2. Ask Friday Core operationalization:
   - seed/publish first context pack
   - wire FAD Ask Friday to Core context/action registry where appropriate
   - add approval/admin surface for Core action requests and KB candidates
   - add eval runner command/admin path
3. Continue data truth cleanup from frontend/DEMO_CRUFT.md.
4. Clean stale deploy docs after product smoke.

Verification before saying fixed:
- focused backend tests for touched paths
- backend npm run build if backend changed
- frontend npx tsc --noEmit if frontend changed
- frontend npm run build if frontend changed
- desktop and mobile browser smoke
- live route checks if deployed
- no frontend-only deploy if backend changed
```

## Useful Commands

Create a fresh worktree:

```bash
cd /Users/judith/repos/friday-admin-dashboard
git fetch origin --prune
git ls-remote origin refs/heads/fad-rebuild
git worktree add -b codex/fad-next-slice-YYYYMMDD /Users/judith/.codex/worktrees/fad-next-slice-YYYYMMDD origin/fad-rebuild
cd /Users/judith/.codex/worktrees/fad-next-slice-YYYYMMDD
git merge-base --is-ancestor origin/fad-rebuild HEAD && echo ok
```

Post-deploy checks:

```bash
curl -fsS https://admin.friday.mu/version.json
curl -fsS https://admin.friday.mu/api/version
curl -i -sS https://admin.friday.mu/api/ask-friday/core/surfaces | sed -n '1,20p'
```

Expected unauthenticated Core route result:

- `401 Unauthorized`

Generate a short-lived staff smoke token on the VPS for local loopback testing only:

```bash
ssh -i ~/.ssh/do_friday_admin -o BatchMode=yes -o IdentitiesOnly=yes root@admin.friday.mu 'cd /var/www/fad-backend; node - <<'"'"'NODE'"'"'
require("dotenv").config();
const jwt = require("jsonwebtoken");
const token = jwt.sign({
  user_id: "deploy-smoke",
  role: "admin",
  username: "deploy-smoke",
  display_name: "Deploy Smoke",
  tenant_id: "00000000-0000-0000-0000-000000000001"
}, process.env.JWT_SECRET, { expiresIn: "5m" });
process.stdout.write(token);
NODE'
```

Backend verification:

```bash
cd backend
npm test -- ask_friday --runInBand
npm test -- --runTestsByPath src/fad/friday.test.js src/ai/chat_proxy.test.js src/reservations/scheduleOverlap.test.js src/realtime/index.test.js --runInBand
npm run build
```

Frontend verification:

```bash
cd frontend
npx tsc --noEmit
npm run build
```

Deploy reminder:

- Coordinate before deploy.
- Build frontend.
- Stamp `frontend/out/version.json` with the target deployed SHA.
- Backup `/var/www/fad` and `/var/www/fad-backend`.
- Rsync frontend to `/var/www/fad`.
- Rsync backend preserving `.env`, caches, uploads, `node_modules`, and generated output.
- Restart PM2 with `GIT_COMMIT`, `APP_VERSION`, and `BUILD_TIME`.
- Verify live frontend/backend versions and touched routes.

## Rollback Notes

Preferred rollback:

1. `git revert` the bad commit on `fad-rebuild`.
2. Redeploy frontend and backend from the reverted SHA.

Emergency artifact rollback:

- Restore frontend from `/var/backups/fad-frontend-1fec863-20260523-070322`.
- Restore backend from `/var/backups/fad-backend-1fec863-20260523-070322`.
- Restart PM2 `fad-backend`.
- Confirm `/version.json`, `/api/version`, and touched flows.

Only use artifact rollback if the live system is actively broken and a clean git revert/deploy is too slow.

## Final Current Assessment

The integrated slice is shipped and live. The platform is ready for parallel continuation if every session starts from latest `origin/fad-rebuild` and avoids the parked/superseded branches.

The best next move is not more broad merging. It is a focused post-deploy smoke, then a narrow Ask Friday Core operationalization slice, followed by data-truth cleanup.
