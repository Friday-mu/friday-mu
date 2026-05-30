# Operations/Breezeway Cutover - Wave 4 Handover

Date: 2026-05-21  
Worktree: `/Users/judith/.codex/worktrees/7fa0/friday-admin-dashboard`  
Target branch: `fad-rebuild`  
Scope: Task comments, TeamInbox bridge, Notifications inbox/archive

## Shipped

- Operations task comments now parse `@staff` mentions, send mention ids to `POST /api/tasks/:id/comments`, and show a mention picker plus "notifies" preview before posting.
- Added `taskCommentBridge.ts` as the strict event adapter from canonical task comments into local TeamInbox/Notifications event surfaces.
- TeamInbox now merges seeded messages with task-comment bridge messages, sorts newest first, and renders task-comment cards with property, task title, preview, mention highlighting, and an Operations backlink.
- Notifications now supports Inbox/Archived tabs, All/Mentions/Comments/Watching/Department filters, expandable long previews, Archive/Restore, targeted mention notifications, and task/comment backlinks.
- Operations opens task detail from `?task=<id>` so TeamInbox and Notifications can deep-link back to the source task.
- Notification list rows are keyboard-accessible containers, avoiding invalid nested buttons while preserving row-select, Archive/Restore, and read/unread controls.

## Contract Notes

- Task comments remain the source of truth; TeamInbox and Notifications are derived event surfaces.
- Bridge ids are idempotent:
  - TeamInbox: `tm-task-comment-<taskId>-<commentId>`
  - Notification: `task-comment-<taskId>-<commentId>-<mentionUserId>`
- Dynamic bridge storage is localStorage-only in this wave. Backend event persistence/push can replace the adapter later without changing task comment authorship.
- No Inbox-owned AI detection/proposal files were touched.

## Verification

- `cd frontend && npx tsc --noEmit --pretty false --incremental false` passed.
- `cd frontend && npm run build` passed.
- `node --check backend/src/tasks/index.js` passed.
- Browser/plugin smoke: Browser plugin was available for page identity/blank checks; route/data-controlled responsive QA used Playwright against a temporary local task API mock.
- Fresh notification rerun after the nested-button fix produced no app console errors; only the standard dev font-preload warning appeared earlier.

## Screenshots

Directory: `docs/handover/qa-screenshots-2026-05-21-wave4/`

- `operations-320-mention-composer.png`
- `operations-320-comment-posted.png`
- `teaminbox-375-task-comment-card.png`
- `teaminbox-1440-task-comment-card.png`
- `notifications-430-mention-filter.png`
- `notifications-430-expanded-preview.png`
- `notifications-430-archived-active-v2.png`
- `notifications-768-comments-archived-filter-v2.png`

## QA Notes

- Viewports checked: 320, 375, 430, 768, and 1440.
- Tested flow: Operations task detail -> post `@Bryan Henri` task comment -> TeamInbox `#ops` task-comment card -> Bryan field Notifications mention -> expand preview -> archive -> archived/comments filter.
- Overflow checks on the tested Wave 4 surfaces showed no horizontal overflow.
- Touch-target check: notification header/category/archive controls are at least 36-44px high. The remaining tiny native checkbox is inside a larger clickable label.
- QA used a temporary local task API mock with task `task-mention-1`; no production data was created.

## Blockers / Follow-Up

- Backend event persistence, system push, and cross-device notification/archive state are still future waves.
- The local bridge intentionally does not notify unmentioned watchers yet; the filter exists for the future watcher model.
- The mock API used fixture user ids; production comment mention notifications should use real auth/user ids once the Wave 1 UUID adapter gap is resolved.
