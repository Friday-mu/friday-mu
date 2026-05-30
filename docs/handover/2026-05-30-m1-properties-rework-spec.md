# M1 Properties record — rework spec (LOCKED 2026-05-30, Ishant)

Supersedes the first PropertiesModuleV2 (built from the SPEC markdown). This matches the
actual prototype `docs/design/fad-v2/prototype/fad-property.jsx` + Ishant's decisions.

## Decisions
- **Superset record** — design's left-rail shell + 7 tabs, PLUS keep our Pricing/Reservations/
  Tasks/Activity tabs + cross-module deep-links. The record aggregates everything (ADR-007 spine).
- **Keep Property Cards** (AI-knowledge base, feeds Ask Friday) + **promote credentials**
  (wifi/lockbox/gate/team) to typed, privacy-classed fields for role×window masking.
- **Manager role tier** (separate slice in permissions.ts — NOT this component): ops_manager +
  commercial_marketing become identical "Manager" = everything EXCEPT Finance (none),
  system/integration Settings (director-only), team/role management (director-only).

## Property RECORD (detail) — target
- **Layout:** the design's LEFT-RAIL record (`.rdgrid`/`.rdctx`/`.rdnav`/`.rdthumb`/`.rdflag`/`.drow`).
  **Port those `.rd*` classes from `docs/design/fad-v2/prototype/fad-desktop.css` into the repo
  `gm-desktop.css`, scoped under `.dwrap`.** Left rail = thumbnail, code, status badge, name,
  BR/bath/sleeps, channel color-dots, vertical tab nav. Right = per-tab header (eyebrow "PROPERTY"
  + tab name + contextual actions) + content.
- **Header actions:** **Ask Friday** (Overview) → `openFriday` with property focus via `mergeFocus`
  ({focusedObject:{type:'property',id:code}, surfaceId from contractFor('properties')}); **Edit**;
  Owner → "Open owner statements"; Listings → "Preview on channels ↗".
- **Tabs (11, superset):**
  1. **Overview** — design layout (KPI tiles occ/ADR/rating/base-rate + listing-quality recs panel +
     "Next stays") + keep our channels/tags/paused-reason.
  2. **Identity & layout** — KEEP ours (EN/FR translations, photo gallery, dual amenities Guesty vs FAD,
     multi-unit) re-skinned to V2.
  3. **Owner** — our live owner + contract + spend-cap (role-gated) + ADD design's owner-reporting
     toggles (email reports / tasks-scheduling / next-statement) + **"Send report now"**.
  4. **Operational** — KEEP Property Cards (AI knowledge) + typed credentials (masked per matrix below)
     + on-site guide (parking/waste/utilities/entry) + department defaults (cleaning/inspection/maintenance).
  5. **Financial** — our live 90-day summary (role-gated) + ADD design's per-channel markup/markdown +
     commission/tourist-tax formula strings.
  6. **Calendar** — KEEP ours (live grid + quick-block + reservation/task chips).
  7. **Listings** — our per-channel push flow + ADD design's integration IDs + "Preview on channels".
  8.–11. **Pricing · Reservations · Tasks · Activity** — KEEP ours, re-skinned to V2.
- **Reuse the current `PropertyDetail.tsx` tab logic/data** — re-skin + reorganize + apply the merges;
  do NOT rewrite working tabs.

## Credential masking (Operational tab)
Types: **wifi · team codes (store W/N) · lockbox · gate**. Gate by audience:

| Audience | wifi | team | lockbox | gate |
|---|---|---|---|---|
| Director / Manager | ✓ | ✓ | ✓ | ✓ |
| Field — assigned | ✓ | ✓ | **window** | **window** |
| Field — not assigned | – | – | – | – |
| Guest (during stay) | ✓ | – | ✓ | ✓ |
| Owner / external / public | – | – | – | – |

- **window** = from task **assigned** OR **24h before due**, until task **closed**.
- Every staff reveal **audit-logged**; nothing on owner/guest-portal/public except the guest's own.
- Implement over existing Property Card categories (`wifi_tech`→wifi; `access`→lockbox/gate/team) via
  `useCurrentRole` + property assignment + task-window signals. If window signals aren't readily
  available client-side, gate by role now + park the window logic with a clear TODO + DEMO_CRUFT row.

## LIST
KEEP our rich list (lifecycle KPIs · sortable table · bulk-edit · real create POST · Insights),
re-skinned to V2; BORROW the design's occupancy color-dot / open-tasks / supplies-low signals.

## Net-new backend (PARKED — render from existing data/Cards meanwhile)
Typed credential fields (migration, clean classification); on-site-guide structured fields;
department-default vendors (Breezeway); per-channel markup values; owner-reporting toggle state.

## Build order for the rebuild
P1 (must): `.rd*` CSS port + left-rail shell + the 7 design tabs (reworked, reusing current data) +
Ask Friday button + credential masking. P2: the 4 kept tabs (reuse current PropertyDetail components,
re-skin). P3: the V2 list. Replace `modules/v2/PropertiesModuleV2.tsx`. Do NOT touch `permissions.ts`
(role-model is a separate slice). tsc + build green. Don't commit.
