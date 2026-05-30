# Ops scope + pagination sprint log — 2026-05-21

- User clarified final decision: GBH/Syndic tasks and Friday/internal tasks without property links still belong in Operations.
- Notion Running Decisions has stale Breezeway-as-system-of-record language, but newer Ops/Syndic decisions supersede it.
- Syndic scoping says AGM prep, insurance renewals, vendor coordination should surface as Operations tasks tagged `source: syndic`.
- GBH master docs list urgent common-area/vendor/insurance/compliance tasks, so the Breezeway skip policy needs an audit before any second import.
- Current live Ops task list is backend-backed but only loads the first default `/api/tasks` slice.
- Fix scope for this slice: add backend pagination/search/sort metadata and make All Tasks use server filters instead of local filtering over 200 rows.
- Keep broader schema changes (`task_type`, building scope/internal scope) out of this patch until skipped-row audit shows exact production impact.
- Verification target: backend task route behavior, frontend type/build, and rendered All Tasks controls on live/local.
