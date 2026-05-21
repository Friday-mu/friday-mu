# Breezeway Task Import Preview — 2026-05-21

Source directory:

`/Users/judith/Desktop/Friday/Friday OS/Ops Module`

Generated report:

`bundle-preview.json`

This is preview-only. No production task rows were inserted or updated.

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

## Current Apply Readiness

Not ready to apply.

Blockers:

- Review/approve property mapping for `Office / Store / Admin` and the aggregate `GBH` rows.
- Review/approve user mapping for Breezeway assignee names to FAD users, or keep imported historical tasks unassigned.
- Decide how to map priority `Watch`.
- Implement child-row apply for cost/payroll/supply exports if those should become `task_costs` / `task_supplies` / inventory rows.

Recommended next apply path:

1. Import summary export as base historical `source = breezeway` task records after mappings are accepted, preserving `external_ref = breezeway:<Task ID>`.
2. Enrich those base rows from the custom export by validated row order, especially property display labels, issue/comment counts, guest-arrival rating, report link, and custom status labels.
3. Keep historical open rows unassigned unless the user map is explicitly approved.
4. Import cost/payroll/supply child rows in a second pass joined by `Task ID`.
