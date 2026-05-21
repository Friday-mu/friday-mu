# Operations Breezeway Historical Import Handover

Date: 2026-05-21
Worktree: `/Users/judith/.codex/worktrees/7fa0/friday-admin-dashboard`
Branch target: `fad-rebuild`

## Shipped

- One-time Breezeway CSV import preview/apply service under Operations tasks.
- Additive migration `054_breezeway_task_import.sql` for import batch ID, redacted source payload, and original Breezeway source timestamps.
- Guarded routes:
  - `POST /api/tasks/imports/breezeway/preview`
  - `POST /api/tasks/imports/breezeway/apply` with `confirmApply=true`
- CLI preview/apply tool:
  - `node backend/scripts/breezeway-task-import.js --csv <file> --mode preview --no-db`
  - apply mode requires `--confirm` and `DATABASE_URL`.
- Optional temporary API validator:
  - `node backend/scripts/breezeway-api-validate-csv.js --csv <file> --use-keychain`
  - reads Keychain only when explicitly invoked; does not print secrets.

## Import Contract

- `source = breezeway`
- `external_ref = breezeway:<Task ID>`
- `bz_id = <Task ID>`
- `Finished -> completed`, `Closed -> closed`, `Not Started -> scheduled`
- Historical open rows stay unassigned unless an explicit user map resolves employees to UUIDs.
- Property/user guesses are reported, not silently invented.
- Sensitive access/Wi-Fi/lockbox-style text is redacted before entering task description/source payload.
- Total cost/rate/bill-to are preserved in `source_payload`; the import does not create Finance cost rows yet.

## Sample Preview Results

- `/Users/judith/Desktop/breezeway-task-summary-export.csv`: 8 rows, 8 valid, 8 insertable, 0 skipped.
- `/Users/judith/Desktop/breezeway-task-summary-export (1).csv`: 40 rows, 40 valid, 40 insertable, 0 skipped.
- Both samples report one unresolved property bucket for `GBH / Grand Baie Heights / 1268645`.
- Assignees are unresolved without a user map; this is intentional to avoid field-staff-visible historical assignments.

## Production State

- Before this import slice, Ops frontend/backend commit `87b26bc` was deployed to `admin.friday.mu`.
- Backend task module and migrations `052`/`053` are live; PM2 migration log shows both applied.
- During this slice, another session deployed frontend version `35d86ef` from `origin/fad-design-os-v01-frontend`.
- I did not overwrite that concurrent Inbox/frontend deploy. Backend task module hash still matches the Ops task module.
- Import slice code has not been live-deployed; deploy it only after coordinating the frontend/backend branch divergence.

## Verification

- `node --check backend/src/tasks/breezewayImport.js`
- `node --check backend/src/tasks/index.js`
- `node --check backend/scripts/breezeway-task-import.js`
- `node --check backend/scripts/breezeway-api-validate-csv.js`
- `node backend/scripts/breezeway-task-import.js --csv /Users/judith/Desktop/breezeway-task-summary-export.csv --mode preview --no-db`
- `node backend/scripts/breezeway-task-import.js --csv "/Users/judith/Desktop/breezeway-task-summary-export (1).csv" --mode preview --no-db`
- `cd backend && npm test -- --runInBand --passWithNoTests`
- `cd backend && npm run build`
- `cd frontend && npx tsc --noEmit --pretty false --incremental false`
- `cd frontend && npm run build`
- `git diff --check`

## Blockers / Next

- Need the latest full CSV export from Ishant/Judith before production preview.
- Need explicit property/user mapping confirmation before apply mode against production data.
- If API validation is desired, run the validator with Keychain access; do not add ongoing Breezeway sync.
- Coordinate with the Inbox session before any further static frontend deploy, because live currently points at `origin/fad-design-os-v01-frontend` commit `35d86ef`, not `fad-rebuild`.
