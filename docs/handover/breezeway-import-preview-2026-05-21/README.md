# Breezeway Task Import Preview — 2026-05-21

Source directory:

`/Users/judith/Desktop/Friday/Friday OS/Ops Module`

Generated report:

`bundle-preview.json`

Apply-readiness report:

`bundle-apply-preview.json`

API validation report:

`api-validation.json`

`bundle-preview.json` was preview-only. `bundle-apply-preview.json` is the apply-readiness preview generated after import policy skips, `Watch` priority mapping, cost/supply child-row insertion, and payload redaction were implemented.

## Summary Export

- Total rows: 5,174
- Valid task rows: 5,174
- Insertable task rows by `external_ref = breezeway:<Task ID>`: 5,174
- Existing `external_ref` matches in the database: 0
- Unknown properties after code extraction: 2 groups
- Unknown assignee/user mappings: 24 groups
- Unknown priority values: `Watch` on 12 rows
- Sensitive text redactions detected in preview: 502
- Spreadsheet formula-leading values escaped in preview: 150

## Supplemental Export Join Preview

- Cost export: 5,186 rows, 5,171 unique task IDs, 208 cost/supply-like line rows, 0 task IDs missing from summary, 3 summary task IDs missing from cost export.
- Payroll export: 5,791 rows, 4,995 unique task IDs, 796 duplicate task rows, 0 task IDs missing from summary, 179 summary task IDs missing from payroll export.
- Supplies export: 1 row, 1 unique task ID, joins to summary.
- Custom export: 5,174 rows, no `Task ID` column, but row-order validation against the summary export passes on title, due date, created date, and updated date for all 5,174 rows.
- Custom export property labels include extractable property codes on 4,483 rows and task report links on all 5,174 rows.

## Breezeway API Validation

- Judith confirmed Keychain access for preview-only API validation. No secrets were written to this report.
- Breezeway API token use is cached locally because the auth endpoint is limited to 1 request/minute and tokens are valid for 24 hours.
- API property validation: all 29 CSV Breezeway home IDs matched API properties, with 0 `reference_property_id` mismatches.
- API task validation: 50/50 sampled importable tasks were retrieved directly by Breezeway Task ID, with 0 field diffs across title/status/priority/department/property/date/time/report-link checks.
- Custom export validation: 5,174/5,174 row-order checks align after ignoring 264 title comparisons already redacted by the CSV preview safety layer.
- API-only fields observed in the 50-task sample include report URLs on all 50, descriptions on 28, assignments on 26, photos on 9, tags on 8, created-by objects on 33, and one linked reservation.
- The API should remain validation/enrichment support only for this migration. CSV remains the primary backfill source.

## Current Apply Readiness

Ready to apply after one final production preview on the server.

Resolved policy decisions:

- Skip `Office / Store / Admin` rows as administrative/non-guest-facing.
- Skip aggregate `GBH / Grand Baie Heights` rows; import individual unit rows only.
- Map priority `Watch` to low/lowest plus source provenance, not urgent.
- Unknown historical assignees should not block import; historical rows remain unassigned unless a user map resolves them to current FAD user UUIDs.
- Payroll export rows are preserved in `tasks.source_payload` as historical provenance rather than inserted as thousands of labor-cost rows.
- Explicit cost export rows become `task_costs`; supply rows become `task_supplies` and matching `stock_movements`.

Production apply guardrails:

- Run the bundle importer on the VPS against the live `DATABASE_URL` in preview mode first.
- Confirm production preview still reports 4,483 importable task rows and no unexpected existing `external_ref` collisions.
- Apply once with `--confirm`; the task insert is idempotent on `tenant_id + external_ref`.
- Do not re-add old Desktop sample CSVs or screenshot-derived sensitive values.

Recommended next apply path:

1. Copy the five current CSV exports to a temporary folder on the VPS.
2. Run `node scripts/breezeway-task-bundle-import.js --dir <folder> --mode preview --out <report>`.
3. If the report matches `bundle-apply-preview.json`, run the same command with `--mode apply --confirm`.
4. Verify live counts for `source = breezeway`, `external_ref LIKE 'breezeway:%'`, `task_costs`, and `task_supplies`.
