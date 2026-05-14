# CLAUDE.md — Friday Admin Dashboard (FAD)

> Repo-local context for agents working in `friday-admin-dashboard`. For workspace-wide rules, see `~/.openclaw/workspace/AGENTS.md`.

## Active branch

**Working branch is `fad-rebuild`, not `main`.** Commit FAD work to `fad-rebuild`. `main` exists but lags. Vercel auto-deploys `fad-rebuild` to a public preview URL — Deployment Protection is currently disabled so the team can review without auth.

## Project overview

Friday Admin Dashboard (FAD) is the operations cockpit for Friday Retreats — a short-term rental hospitality company with 24+ properties in Mauritius. It provides a unified interface for guest messaging (GMS), reservations, operations, finance, HR, and analytics. Built as a Next.js static-export frontend + lightweight Express backend. Part of the FridayOS platform.

## Repo layout

```
.
├── frontend/           # Next.js 14 App Router (primary codebase)
│   ├── src/app/        # App routes — page.tsx files
│   │   ├── fad/        # Main dashboard shell (Sidebar, modules, layout)
│   │   ├── approve/    # WhatsApp template approval flow
│   │   └── reset-password/
│   ├── src/components/ # Shared UI components
│   ├── src/lib/        # Utilities, hooks, helpers
│   ├── public/         # Static assets (incl. manifest.json)
│   ├── out/            # Static export output (gitignored)
│   └── .next/          # Build cache (gitignored)
├── backend/            # Express server (minimal — serves API + static)
│   ├── server.js       # Entry point
│   └── src/database/   # DB connection layer
├── docs/               # Architecture, API ref, DB schema
├── qa-screenshots/     # Verification screenshots
└── out/                # Root-level static export (legacy)
```

## Tech stack

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Export:** `output: 'export'` — static HTML, no SSR. **Deployed to `/var/www/fad/`** (served as `gms.friday.mu`). DO NOT deploy to `/var/www/friday-dashboard/` — that path serves the legacy GMS at `admin.friday.mu`; rsyncing the FAD build there takes down the team's inbox. Incident on 2026-05-14 confirmed it (~4 hours of broken GMS).
- **Backend:** Node.js + Express (lightweight, API proxy + static file server)
- **DB:** PostgreSQL 15 (shared with GMS backend)
- **External:** Guesty API, Slack webhooks, Breezeway API
- **Auth:** JWT (custom)

## Conventions

- **Commit messages:** `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...` — sprint-prefixed when relevant (`s7-c1: ...`).
- **File org:** App Router — each route is a folder with `page.tsx`. Shared components in `src/components/`. FAD-specific components in `src/app/fad/_components/`.
- **Tailwind:** Utility-first. No per-component CSS files; use `fad.css` for global overrides.
- **Data fixtures:** `src/app/fad/_data/*.ts` — module data, fixtures, and config objects.
- **TypeScript:** `ignoreBuildErrors: true` in next.config.js — don't rely on this; fix types properly.

## Common patterns

**Adding a page:** Create folder under `src/app/fad/` or root `src/app/`, add `page.tsx`. Use `layout.tsx` for shared shells.

**Adding a module:** Create component in `src/app/fad/_components/modules/`, register in `_data/modules.ts` + add a case in `FadApp.tsx`. Existing modules: Inbox, Operations, Calendar, Reservations, Properties, Reviews, HR, Finance, Legal & Admin, Owners, Guests, Marketing, Leads, Analytics, Intelligence, Notifications, Training, Settings.

**Adding a component:** If FAD-specific, put in `src/app/fad/_components/`. If shared across apps, put in `src/components/`.

**API calls:** Frontend calls backend API or GMS backend directly via `NEXT_PUBLIC_API_URL`. Backend proxy pattern in `backend/server.js`.

**Static export:** `npm run build` in frontend generates `out/` folder. This is rsync'd to **`/var/www/fad/`** on the VPS (served at `gms.friday.mu`). `npm run deploy` from `frontend/` handles build + rsync correctly. No server-side rendering — everything must work as static HTML. **DO NOT rsync to `/var/www/friday-dashboard/`** — that's the legacy GMS at `admin.friday.mu`; overwriting it breaks the team's inbox.

## Key facts (always relevant)

- **Cleaning Fee = net pass-through** (VAT optimization). Never model as revenue.
- **`entity_id` = FR/FI/S divisions.** FR is the only legal entity currently.
- **WhatsApp owner-approvals route via `approve/`** — primary channel for owner consent.
- **Static export limits:** no API routes in `frontend/`, no `next/image` optimization without config, no dynamic routes with params unless `generateStaticParams`.

## Demo cruft tagging (FAD is currently a frontend-only showcase)

The FAD has no real backend yet. Login is fake, fixtures are local, "logout" just clears localStorage. Everything that exists purely to make the UI demonstrable needs a tag so Judith can rip it out cleanly when the backend lands.

**The six tags** (use as code comments above the relevant constant / function / JSX block):

| Tag | Means | Backend action when wired |
|---|---|---|
| `// @demo:data` | Hardcoded fixtures the UI reads from | Replace with API fetch |
| `// @demo:logic` | Client-side logic that should be authoritative on the backend | Move logic to backend, replace with API call |
| `// @demo:state` | Frontend-only persisted state (localStorage) that needs server sync | Add backend mirror + sync layer |
| `// @demo:auth` | Anything that bypasses real authentication / authorization | Wire real auth + replace with backend-enforced gating |
| `// @demo:ui` | UI surfaces that exist only because we're showcasing | Remove or hide behind feature flag |
| `// @demo:config` | Hardcoded business constants / policy values that will become tenant-configurable | Replace with appropriate policy/config API endpoint |

**Comment shape** — always include a tag ID that maps back to `DEMO_CRUFT.md`:

```typescript
// @demo:data — Replace with GET /api/users/team. Backend returns
// [{first_name, email, role}]. Tag: PROD-AUTH-1.
const TEAM = [ ... ]
```

**When you write new code** that's demo-only or fakes a backend behavior, **always tag it**. Add a row to `frontend/DEMO_CRUFT.md` with the tag ID, type, path, current behavior, and the backend action needed. One source of truth.

**No untagged demo data, ever.** The contract: any new fixture, hardcoded value masquerading as data, or inline JSX that fakes a backend response gets its `@demo:*` tag IN THE SAME COMMIT as the code, plus a row in `DEMO_CRUFT.md`. If you find yourself writing `const FOO = [ {...}, {...} ]` for the UI to render, it needs a tag before it ships.

**Before merging any backend wiring** — grep for `// @demo:` in the diff, cross-reference against `DEMO_CRUFT.md`, and confirm each tagged line either gets replaced or has its tag removed deliberately.

## Gotchas

- **Always `git fetch origin` before assessing repo state.** 3-layer reconciliation per AGENTS.md.
- **`fad-rebuild` is the active branch** for FAD-related work. `main` exists but `fad-rebuild` has the current development. If also committing to `main`, ensure it makes sense there.
- **Static export limitation:** `output: 'export'` means no API routes in `frontend/`, no `next/image` optimization without config, no dynamic routes with params unless using `generateStaticParams`.
- **Finance schema:** FAD finance schema lives at `/mnt/user-data/outputs/fad_finance_schema_v1.sql` (14 tables, `entity_id` for FR/FI/S divisions; FR is the only legal entity currently).

## Reference docs (progressive disclosure)

In-repo, fetch on demand:

- `@docs/architecture.md` — **Read when:** adding modules, pages, components, or API integrations
- `@docs/gotchas.md` — **Read when:** debugging unexpected behavior or hitting framework edges
- `@docs/finance-schema.md` — **Read when:** working on Finance module
- `@docs/deploy.md` — **Read when:** deploying or troubleshooting deploy

Notion (via connector):

- **Atlas §4 (GMS architecture)** — `34c43ca8849281b9a10de9f264141c37` — for FAD-GMS integration
- **Friday Code Index** — `35143ca88492810d9a73d46b0101c436` — for module-specific deep dives
- **Sprint 7 v3 plan** — `34f43ca88492815380d0d0dce19cb53c`

## Test / build / lint

Frontend:
```bash
cd frontend
npm run dev       # next dev — port 3000
npm run build     # next build → generates out/
npm run start     # next start -p ${PORT:-3000}
```

Backend:
```bash
cd backend
npm run dev       # nodemon server.js
npm run build     # tsc
npm run start     # node server.js
npm test          # jest
```

No root-level test script. Run separately in each subdir.

## Verification

Before declaring any change complete:

1. `npm run build` in `frontend/` — verify chunk hashes change vs. last deploy (stale cached JS is a real failure mode)
2. `npx tsc --noEmit` from `frontend/` — filter to `fad/` paths to skip pre-existing legacy errors
3. Visual sweep on dev server, **desktop + mobile** (375×812), all states — full UI checks per `~/.claude/CLAUDE.md` "UI verification"
4. Update relevant `@docs/*.md` if architecture, schema, or contract changed

## Deploy flow

Canonical deploy lives in `~/.openclaw/workspace/AGENTS.md` Deploy Rules section. TL;DR:

```bash
# Frontend (Vercel auto-deploys on push to fad-rebuild)
cd frontend && npm run build
# OR push to fad-rebuild → Vercel preview deploy fires automatically

# VPS deploy (manual, for production) — use the npm script:
cd frontend && npm run deploy
# That runs `build:prod` (overrides .env.local to clear dev API URLs)
# then rsyncs to /var/www/fad/ — the CORRECT path. NEVER manually rsync
# to /var/www/friday-dashboard/; that path serves the legacy GMS at
# admin.friday.mu and overwriting it breaks the team's inbox.
# (See memory/fad_deploy_paths.md for the full /var/www path map.)
# Verify chunk hashes changed after deploy (stale JS from browser cache is real).

# Backend (if changed)
cd backend && npm run build
# Deploy backend artifacts per AGENTS.md
```

Vercel handles preview deploys automatically on push to `fad-rebuild`. VPS production deploy is manual at sprint close.

## References

- **Atlas (Section 4 — GMS architecture):** https://www.notion.so/34c43ca8849281b9a10de9f264141c37
- **AGENTS.md:** `~/.openclaw/workspace/AGENTS.md`
- **Sprint 7 v3 plan:** https://www.notion.so/34f43ca88492815380d0d0dce19cb53c
- **Phase 1 investigation:** `~/judith/handovers/2026-04-28-sprint7-investigation.md`
- **Bug-vs-sprint dedup:** `~/judith/handovers/2026-04-28-bug-vs-sprint-dedup.md`
- **FAD finance schema:** `/mnt/user-data/outputs/fad_finance_schema_v1.sql`
- **Latest session handover:** `~/Downloads/fad-handover-v9.md`
- **Code bundle:** `~/Downloads/fad-bundle-v10.md`
