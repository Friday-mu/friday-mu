# Design clashes — running decision log

Where the Claude Design **full-vision** design clashes with the **current FAD build**. The design session flags
each clash to Ishant with options; the decision is recorded here so we don't re-litigate. (Per the coordination
loop in `00-README-design-coordination.md` §7.)

| # | Module | Clash — design vision vs current build | Options (design / current / hybrid / discuss) | Decision | Date |
|---|---|---|---|---|---|
| 1 | Ask Friday (all AI surfaces) | Prototype shows a precise confidence number (`conf. 92%`); our backend emits a **heuristic band** (~0.2/0.55/0.62/0.78/0.82), not a calibrated %. A precise meter is false precision. | **design** = keep a %; **current** = drop to high/med/low band; **hybrid** = qualitative label + subtle bar, no number | _open — flag to Ishant_ (recommend band/label) | 2026-05-30 |

## Resolved so far (from this session, before the formal loop)
| Module | Clash | Decision |
|---|---|---|
| Properties | Design = lean 7-tab left-rail record; current = 11-tab richer (Cards/onboarding/Pricing/Res/Tasks/Activity) | **Superset** — design shell + keep our substance; design as guidance, not shrink-to (2026-05-30) |
| Properties | Design shows access/wifi codes to staff ("audit-logged"); we wanted hard-mask | **Role × circumstance** masking (director/manager all; field assigned w/ task-window for lockbox/gate; guest gets lockbox/gate/wifi; owner request-gated). (2026-05-30) |
| Roles | Design implies flat staff; we run 5 roles | **Manager tier** = ops_manager + commercial_marketing identical, all except finance/settings/team-admin (director-only). (2026-05-30) |
| Inbox | Design tabs = All/Guest/Needs-reply/Team; current = Guest/Owner/Vendor/Unclassified + filter sheet | **Open** — keep owner/vendor + filter sheet; reconcile "Needs reply" axis (to design session) |
