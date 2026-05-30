# Design clashes — running decision log

Where the Claude Design **full-vision** design clashes with the **current FAD build**. Each clash is flagged to
Ishant; the decision is recorded here so we don't re-litigate. (Per the loop in `00-README-design-coordination.md`
§7.) **As of 2026-05-30 all logged clashes are RESOLVED** — Ishant cleared them before the design handoff. New
clashes the design session finds get appended here with options, and Ishant decides.

## Resolved (2026-05-30, Ishant)
| # | Module | Clash | Decision |
|---|---|---|---|
| 1 | All AI surfaces | Prototype shows a precise `conf. 92%`; backend emits a heuristic **band**, not a calibrated %. | **Band/label, drop the number.** A % is false precision. Show high/med/low (or a qualitative label). |
| 2 | Reviews | Pack says Phase-1 read-from-Reva; code **skips Reva, reads Guesty `/v1/reviews`** directly. | **Pivot locked — design to Guesty.** Reva isn't wired; `SyncChip` source reads "Guesty". |
| 3 | Calendar | Prototype: blocks "sync to Guesty & close availability across channels"; code blocks are FAD-local. | **Honest copy:** "FAD-side block; channel write-through Phase 2." |
| 4 | Reservations | Prototype shows Payout/Owner-revenue/Commission cards to everyone; finance rule hides owner economics from managers. | **Role-gate** the cards (managers: no owner-revenue/commission). |
| 5 | Ask Friday / Training / Intelligence | Where does the AI governance console live? | **Training** = manager teach-and-approve; **`ask-friday-review`** = director deep Core (registry/evals/context-packs); **Intelligence** = read-only commentary. (`training.md` §4) |
| 6 | Ask Friday / Training | Trust-tier label mismatch: UI `verified/corroborated/safe/review` vs backend `low/medium/high/restricted/production_event_cluster`. | **Adopt the backend values**; map the UI words onto them. One vocabulary, backend is source. |
| 7 | Guests | Module renders demo fixtures (un-tagged `@demo`) while a live `/api/guests` exists. | **Bind to live** + draw stale/partial/failed/empty; tag/retire the fixtures. |
| 8 | Owners | `permissions.ts` has no `owner` portal role; the Sept portal needs one + RLS + owner-scoped Ask Friday. | **Defer to Sept** (when the portal ships). Design assumes it; flagged so it's not forgotten — not built now. |
| 9 | Reviews | The Friday-drafted reply flow (prototype + vision §9.7) was deleted from live code (broken stub). | **Redraw complete** with trust-states (full-vision rule). |
| 10 | Notifications | Scope fork: team/system-only vs also-guest/owner-comms templates. | **Team/system only.** In-app center + push + staff alert-emails + AI-filtering. Guest/owner conversational outbound stays in **Inbox**; statement send in **Owners**. |
| 11 | Finance | Two RBAC systems: `permissions.ts` (director-only) vs `financeRoles.ts` (admin/manager/contributor sub-tiers). | **Director-only, flat — for now.** Collapse the legacy sub-tiers (incl. capture). Deepen later (a capture-only accountant tier is a future variation, not now — "get the platform right first"). |
| 12 | Settings | Two "Settings" modules (System `settings` + Manage `tenant-settings`); unimplemented manager section-gating. | **Merge into one** role-gated Settings module: personal prefs (all) · team/integrations/branding (director) · tenant/billing/admin-analytics (FR-admin). |
| 13 | Settings | Three billing stories (per-unit € / per-subscription $ / freemium+commission). | **Freemium + layered per-unit subscription + add-ons** (direction, evolving — see `settings-tenant.md` §A "Billing direction"). |
| 14 | Settings | Two unbridged role models (FAD director/manager/field vs SaaS admin/agent/staff). | **Keep both, map at the guard layer:** FAD-role gates module visibility; tenant-role gates tenant-admin surfaces. They're orthogonal; don't merge the models. |
| 15 | HR / Operations | Roster home: HR-owned data but the rich editor lives in Operations. | **Both** — rich editor in Operations, summary in HR, cross-linked. Matches the HR-owned / Ops-operated split. |

## Resolved earlier this session (before the formal loop)
| Module | Clash | Decision |
|---|---|---|
| Properties | Design = lean 7-tab record; current = 11-tab richer. | **Superset** — design shell + keep our substance (2026-05-30). |
| Properties | Design shows codes to staff ("audit-logged"); we wanted hard-mask. | **Role × circumstance** masking matrix (2026-05-30). |
| Roles | Design implies flat staff; we run 5 roles. | **Manager tier** = ops_manager + commercial_marketing identical, all except finance/settings/team-admin (2026-05-30). |
| Inbox | Design tabs All/Guest/Needs-reply/Team vs current Guest/Owner/Vendor/Unclassified + filter sheet. | Keep owner/vendor + filter sheet; reconcile the "Needs reply" axis (a UX choice for the design session). |

## Open for the design session to propose on (UX, not strategy)
These aren't strategic clashes — they're presentation choices the design session should propose options on (per each
brief's §12): panel home (drawer vs slide-over), tab grouping in dense records, the credential-reveal affordance,
the quick-view side-panel as one shared component, sidebar pending-badges, notification-center home, the proactivity
dial. None block the handoff.
