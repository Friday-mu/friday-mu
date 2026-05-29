# Ask Friday Property Field Classification

Date: 2026-05-29
Status: draft policy matrix, requires Ishant review before public context-pack expansion
Anchor: `docs/architecture/ask-friday-plan2-research-wave1-2026-05-29.md`

## Purpose

This matrix defines which property facts Ask Friday may expose to each surface before the Properties agent, Guest Portal, Website public Ask Friday, and public MCP expand beyond today's narrow context packs.

Rule: a property fact is not public just because it exists in Guesty, FAD, a card, a screenshot, a task, or a conversation. The serving surface, identity, source freshness, and privacy class decide whether it can be used.

## Privacy Classes

| Class | Meaning | Example surfaces |
|---|---|---|
| `public` | Safe for anyone when source-reviewed or live-tool backed. | Website guest hero/FAB, public MCP, FAD staff. |
| `guest_scoped` | Safe only for a guest authenticated to the stay/property context. | Guest portal, stay-token Ask Friday, staff reply drafts for that stay. |
| `owner_scoped` | Safe only for that property owner or authorized staff. | Owner portal, FAD owners assistant. |
| `staff_private` | Internal operational facts for authorized staff only. | Ops Consult, Inbox Consult, Properties, Analytics. |
| `restricted` | Need-to-know secrets, finance/legal/HR/security data. | Restricted staff surfaces only. |

## Field Matrix

| Field/fact | Default class | Allowed surfaces | Source rule | Freshness rule | Notes |
|---|---|---|---|---|---|
| Public property name | public | Website, public MCP, Inbox, Ops, Properties | Guesty listing or reviewed Website copy | review on listing update | Use public name, not internal nickname if different. |
| Internal property code | staff_private | FAD staff surfaces | FAD property overlay | live/runtime | Can appear in staff workflows; not public marketing copy. |
| Area/neighborhood | public | Website, public MCP, staff | Guesty/Website reviewed copy | review on listing update | Keep public-safe. Avoid exact private location unless already public. |
| Exact address | guest_scoped/staff_private | guest portal after booking, staff | Guesty/FAD source | stay-scoped/live | Do not expose publicly unless explicitly public in listing policy. |
| Private coordinates | staff_private/restricted | Ops/dispatch only | FAD/Breezeway/location source | live/runtime | Public maps should use reviewed approximate/public location only. |
| Bedrooms, bathrooms, accommodates | public | Website, public MCP, staff | Guesty listing or reviewed overlay | review on listing update | If sources conflict, create candidate. |
| Public amenities | public | Website, public MCP, staff | Guesty/Website reviewed copy | review on listing update | Do not infer from photos/tasks. |
| Missing/broken amenity | staff_private; guest_scoped only when relevant to current stay | Inbox, Ops, guest portal if affecting stay | task/issue evidence | source-dated, review until resolved | Public copy should not be silently changed from one issue. |
| Public house rules | public | Website, public MCP, Inbox, Guest Portal | reviewed listing/policy | review on policy update | Legal/platform-specific claims need source. |
| Check-in/check-out windows | public/guest_scoped | Website, guest portal, Inbox, Ops | reviewed policy + reservation context | review on policy update; live per reservation | Reservation-specific exceptions are guest_scoped/staff_private. |
| Access codes, lockbox, key-safe, gate details | restricted/guest_scoped | guest portal only for authenticated stay; staff | access system/FAD source | current stay only | Never public. Never cross from another guest/thread. |
| Wi-Fi credentials | guest_scoped/staff_private | guest portal for authenticated stay; staff | reviewed property guide/source | review on credential change | Public can say Wi-Fi exists if listed; not credentials. |
| Parking instructions | public or guest_scoped depending detail | Website for generic availability; guest portal/staff for precise instructions | listing/guide | review on listing/guide update | Do not expose gate/security specifics publicly. |
| House manual / troubleshooting steps | guest_scoped/staff_private | guest portal, Inbox, Ops | property guide/approved KB | review on guide update | Public can answer only generic amenity questions. |
| Staff/vendor notes | staff_private | Ops, Properties, Analytics | FAD tasks/cards/vendor records | source-dated | Never public/owner unless explicitly reviewed for owner. |
| Owner terms/caps/approval thresholds | owner_scoped/staff_private/restricted | Owners, Ops approval workflows | owner contract/FAD owner rules | review on contract update | Not public; owner-specific isolation required. |
| Maintenance issue history | staff_private; owner_scoped if approved summary | Ops, Properties, Owners after review | tasks/Breezeway/FAD issue history | source-dated; expiry/resolution status | Do not turn one guest issue into public truth automatically. |
| Cleaning/inspection evidence | staff_private; guest_scoped only if relevant/current | Ops, Inbox, guest portal after staff review | task photos/checklists | source-dated | Avoid public "guaranteed spotless" claims. |
| Reservation occupancy status | staff_private/guest_scoped | Ops, Inbox, guest portal for own stay | Guesty/FAD reservation context | live/source-dated | Public surfaces can use availability tools, not raw guest occupancy. |
| Availability/pricing | public/staff split via tool | Website, staff, guest/owner if scoped | `load_calendar_context` or public availability API | live/source-dated | Not static KB. Missing rows mean unknown. |
| Owner financials/payouts | restricted/owner_scoped | Finance, Owners authorized scope | finance/owner records | source-dated; role-gated | Never public; no cross-owner examples unless approved/anonymized. |
| Guest complaints/messages | staff_private; guest_scoped only own thread | Inbox, Ops, Analytics | conversation/task evidence | source-dated | Evidence for candidates, not canonical property facts. |
| Photos | public/staff split | Website if public gallery; staff if inspection/issue | Website/Guesty/FAD task photo source | source-dated | Inspection/issue photos are staff-private unless reviewed. |
| Accessibility/safety claims | public only if reviewed | Website, guest portal, staff | reviewed property copy or official source | review on property/safety update | Avoid unsupported legal/safety guarantees. |

## Surface Defaults

| Surface | Default property visibility |
|---|---|
| Website guest hero / Ask Friday FAB | `public` only plus live public availability/search tools. |
| Guest portal Ask Friday | `guest_scoped` for authenticated stay plus public facts; no other guest/staff data. |
| Inbox / Friday Consult | `staff_private` plus guest/reservation-scoped context for the selected thread. |
| Ops / Friday Consult | `staff_private` operations, task, reservation, and property context. |
| FAD global Ask Friday | Starts with page-focus scope; can load staff property context only when role/surface permits. |
| Owner enquiry public | `public` and owner-submitted lead facts; no private owner records. |
| FAD owners assistant | `owner_scoped` and staff/private owner records by authorization. |
| Public MCP | `public` only, preferably source-dated and narrow. |

## Required Evals

1. Public property answer omits exact address, access codes, owner terms, staff notes, vendor notes, and issue history.
2. Guest-scoped answer can provide stay-specific access/troubleshooting only for the authenticated stay.
3. Staff Inbox answer can use selected reservation/property facts but does not leak another guest's PII.
4. Ops schedule answer can use occupancy and issue history but keeps it staff-private.
5. Property fact conflict creates a candidate/source-conflict; it does not rewrite public copy automatically.
6. Public availability/price question calls a live tool or states unknown; it does not use stale/static KB.
7. Owner assistant refuses another owner's financials/terms and offers approved anonymized examples only if available.

## Ishant Review Required

1. Should exact addresses ever be public for properties where the listing already exposes a map/location?
2. Which check-in/troubleshooting details are allowed in guest portal automatically versus staff-reviewed only?
3. Can owner-visible maintenance/issue history include raw task notes/photos, or only reviewed summaries?
4. Which accessibility/safety claims are approved public copy versus staff-only notes?
5. Who approves public property corrections when Guesty, Website, FAD overlay, and staff notes disagree?
