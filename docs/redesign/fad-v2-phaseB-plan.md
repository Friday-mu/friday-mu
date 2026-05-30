# FAD V2 redesign — Phase B execution plan + coordination

Date: 2026-05-29 · Owner: Ishant (FAD) · Author: Claude Code (FAD redesign session)
Companion: `fad-v2-implementation-spec.md` (the design-system + per-module spec, digested from the Claude Design bundle `/tmp/fad-design-3/fad-v2`).

## Status going in

- **Phase A (experiences API) DONE + live** (`9097f9bc`): `/api/public/experiences` + Bokun ingestion (80 exp, channel-routed), verified.
- **V2 foundation already partly in the repo** (from earlier this session, on `fad-rebuild`):
  - `frontend/src/app/fad/field.css` — field-staff PWA V2 (scope `.ff-app`; Newsreader/Hanken Grotesk/JetBrains Mono; dark-first). Rendered by `field/FieldApp.tsx` for `role==='field'`.
  - `frontend/src/app/fad/gm-desktop.css` — manager/GM desktop V2 (scope `.dwrap`, muted indigo). Used by `gm/screens/*` mounted in `OperationsModule` for manager/director.
  - `frontend/src/app/fad/_components/gm/kit.tsx` — GM kit (`GmShell`, `FridayBar`/`.fbar`, `AskPanel`/`.daside` **presentational**, `PriD`). Extend this for new modules.
  - All imported in `fad/layout.tsx`. The big global `fad.css` (light navy/cream) still drives the legacy/un-migrated modules.
- So Phase B = roll the `.dwrap` V2 language across the remaining cockpit modules + add the cross-cutting provenance + detail-drawer patterns, **reusing `gm/kit.tsx` + `gm-desktop.css`** (NOT a global `fad.css` rewrite — that would restyle the parallel session's Inbox Consult UI).

## Coordination boundaries (HARD — parallel Ask Friday Core session is active)

The V2 design's central pattern is the **universal Ask Friday side panel** (`.daside` / `AskPanel`, opened by a `Review` button on each module's `.fbar`). That **replaces `FridayDrawer` + `FridayFullscreen`** — which the Ask Friday Core session OWNS and is actively evolving (their PR#42 = shared right-panel page-focus). Also theirs: `consult.js`, `friday.js`, Inbox Consult UI rendering, TeamInbox.

**Rules for this redesign work:**
- Build the `.daside` panel **presentationally only** (local open/close, like the existing GM `AskPanel` demo). Do **NOT** rip out `FridayDrawer`/`FridayFullscreen` or wire the panel to Ask Friday Core — that swap is a coordinated change with the parallel session.
- Do **NOT** globally rewrite `fad.css` (it skins their Inbox Consult UI). Keep V2 scoped (`.dwrap` / per-module) and migrate module-by-module.
- **Inbox** module body contains their Consult UI → coordinate before restyling; do Inbox LAST / jointly.
- Preserve "Ask Friday" / "Ask Friday Core" / "FridayOS" naming. Never use the retired assistant label.
- Build from latest `origin/fad-rebuild`; fetch+merge before every push; deploy FE+BE from same SHA; ping before deploying.

## Build order (safe-first, high-value, mine)

1. **Provenance `<SourceChip>` component** (the V2 "defining concept") — new shared component: Guesty (green `.srcgy`), Breezeway (blue `.srcbz`), Friday-owned, modelled/gate (dashed indigo `.gate`), stale, failed-sync. Best-effort source/lastSyncedAt from existing record fields. Additive, zero collision.
2. **Reservations** — V2 list + **detail drawer** (audit's #1 gap: "list did not open a useful record"). Mounts `.dwrap`. Merge existing reservation features (folio/payments/accounting wiring already in `ReservationDetail`).
3. **Properties** — **property-detail-as-spine** (commercial/owner/reservations/tasks/finance/reviews/guest-history/docs converge). Audit's "spine". Reuse existing PropertyDetail wiring.
4. **Guests** — V2 guest list + profile. Merge Mary's admin slice.
5. **Operations** — already V2 (`gm/screens`); align/extend with the shared kit + provenance.
6. **Inbox** — COORDINATE with Ask Friday Core (their Consult UI). Likely joint / last.
7. Remaining (Calendar/Schedule/Roster/Approvals/Notifications/Settings/Supplies/Live Map) per bundle; **Settings → integration control plane** (last sync/direction/owner/failures). Design module 17-stage = deferred (separate run, per Ishant).

## Approach per module

- Extend `gm/kit.tsx` (`GmShell`, `FridayBar`, `<SourceChip>`, a new `<DetailDrawer>`); styles in `gm-desktop.css` under `.dwrap`. Mobile variants per the bundle's `FAD Manager Mobile - *.html`.
- **Wire to real backend** (the modules already have data clients: reservationsClient, properties, tasks, etc.). **Merge existing features into the new design — never drop functionality** (Ishant: "we adapt them to the new design and merge them in").
- Tag any demo-only bits `@demo:*` + DEMO_CRUFT.md row.
- Deploy each coherent module slice incrementally (coordinated, build-from-latest, FE+BE same SHA, verify chunk hashes + version.json).
- QA desktop + mobile (375×812) per module before calling it done.

## Provenance backend note

Full provenance (Guesty/Breezeway/Friday/modeled/stale/failed) needs `source` + `last_synced_at` + sync-status on records. Phase B ships the **UI pattern** + best-effort source from existing fields (e.g. tasks.source='breezeway', guesty_listings vs fad_properties). A backend pass to add explicit provenance columns + a sync-status surface is a follow-up (document the contract before coding, per handover).
