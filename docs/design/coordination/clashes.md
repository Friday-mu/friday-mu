# Design clashes — running decision log

Where the Claude Design **full-vision** design clashes with the **current FAD build**. The design session flags
each clash to Ishant with options; the decision is recorded here so we don't re-litigate. (Per the coordination
loop in `00-README-design-coordination.md` §7.)

| # | Module | Clash — design vision vs current build | Options (design / current / hybrid / discuss) | Decision | Date |
|---|---|---|---|---|---|
| 1 | Ask Friday (all AI surfaces) | Prototype shows a precise confidence number (`conf. 92%`); our backend emits a **heuristic band** (~0.2/0.55/0.62/0.78/0.82), not a calibrated %. A precise meter is false precision. | **design** = keep a %; **current** = drop to high/med/low band; **hybrid** = qualitative label + subtle bar, no number | _open — flag to Ishant_ (recommend band/label) | 2026-05-30 |
| 2 | Reviews | Notion pack says **Phase-1 read-from-Reva**; shipped code **skips Reva, reads Guesty `/v1/reviews`** directly (explicit pivot note in `reviews.ts`). | design-to-Guesty / restore-Reva / hybrid | _open — flag to Ishant_ (recommend design-to-Guesty; code already pivoted) | 2026-05-30 |
| 3 | Calendar | Prototype block panel: "Blocks **sync to Guesty & close availability across channels**"; code blocks are **Phase-1 FAD-local only** (no channel write-through). | honest-copy / build-sync-now / hybrid | **resolved** — honest copy: "FAD-side block; channel write-through Phase 2" | 2026-05-30 |
| 4 | Reservations | Prototype shows **Payout / Owner-revenue / Commission** stat cards on the Overview to everyone; finance rule hides owner economics from managers. | role-gate / show-all / hybrid | **resolved** — role-gate (managers: no owner-revenue/commission) | 2026-05-30 |
| 5 | Ask Friday / Training / Intelligence | Where does the AI **governance console** live? Prototype Training = "Ask Friday Governance"; a separate director-only `ask-friday-review` exists; Intelligence is read-only. | — | **resolved** — Training = manager teach-and-approve; `ask-friday-review` = director deep Core; Intelligence = read-only commentary (`training.md` §4) | 2026-05-30 |
| 6 | Ask Friday / Training | Trust-tier **label mismatch**: UI uses `verified/corroborated/safe/review`; backend emits `low/medium/high/restricted/production_event_cluster`. | adopt-backend / adopt-UI / new-map | _open — flag to Ishant_ (recommend one mapped set) | 2026-05-30 |
| 7 | Guests | Module renders **demo fixtures** (un-tagged `@demo` violation) while a **live `/api/guests`** client exists and is used elsewhere. | bind-live / keep-demo / hybrid | **resolved** — bind to live + draw stale/partial/failed/empty; tag/retire fixtures | 2026-05-30 |
| 8 | Owners | `permissions.ts` has **no `owner` portal role**; the Sept owner portal needs one + RLS + owner-scoped Ask Friday isolation. | add-role-now / defer / discuss | _open — flag to Ishant_ (portal blocks on it) | 2026-05-30 |
| 9 | Reviews | The **Friday-drafted reply** flow (prototype + vision §9.7) was **deleted from live code** (broken stub, 2026-05-17). | redraw-complete / drop / hybrid | **resolved** — full-vision rule: redraw complete with trust-states | 2026-05-30 |

## Resolved so far (from this session, before the formal loop)
| Module | Clash | Decision |
|---|---|---|
| Properties | Design = lean 7-tab left-rail record; current = 11-tab richer (Cards/onboarding/Pricing/Res/Tasks/Activity) | **Superset** — design shell + keep our substance; design as guidance, not shrink-to (2026-05-30) |
| Properties | Design shows access/wifi codes to staff ("audit-logged"); we wanted hard-mask | **Role × circumstance** masking (director/manager all; field assigned w/ task-window for lockbox/gate; guest gets lockbox/gate/wifi; owner request-gated). (2026-05-30) |
| Roles | Design implies flat staff; we run 5 roles | **Manager tier** = ops_manager + commercial_marketing identical, all except finance/settings/team-admin (director-only). (2026-05-30) |
| Inbox | Design tabs = All/Guest/Needs-reply/Team; current = Guest/Owner/Vendor/Unclassified + filter sheet | **Open** — keep owner/vendor + filter sheet; reconcile "Needs reply" axis (to design session) |
