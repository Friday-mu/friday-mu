# CLAUDE.md — Friday Admin Dashboard (FAD)

> Repo-local context for agents working in `friday-admin-dashboard`. For workspace-wide rules, see `~/.openclaw/workspace/AGENTS.md`.

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
│   ├── public/         # Static assets
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
- **Export:** `output: 'export'` — static HTML, no SSR. Deployed to `/var/www/friday-dashboard/`
- **Backend:** Node.js + Express (lightweight, API proxy + static file server)
- **DB:** PostgreSQL 15 (shared with GMS backend)
- **External:** Guesty API, Slack webhooks, Breezeway API
- **Auth:** JWT (custom)

## Conventions

- **Commit messages:** Sprint 7 pattern — `feat: ...`, `fix: ...`, `docs: ...`, `s7-c1: ...`, etc.
- **File org:** App Router — each route is a folder with `page.tsx`. Shared components in `src/components/`. FAD-specific components in `src/app/fad/_components/`.
- **Tailwind:** Utility-first. No custom CSS files per component unless absolutely necessary (prefer `fad.css` for global overrides).
- **Data fixtures:** `src/app/fad/_data/*.ts` — module data, fixtures, and config objects.
- **TypeScript:** `ignoreBuildErrors: true` in next.config.js — don't rely on this; fix types properly.

## Reusable features (cross-product catalog)

Before implementing a feature that may already exist in another product (GMS, the website, Zunko, etc.), **check the feature catalog first**: `Friday-mu/feature-catalog` on GitHub.

Catalogued features relevant to FAD:

- **[Friday Consult pattern](https://github.com/Friday-mu/feature-catalog/blob/main/ui/friday-consult-pattern.md)** — embedded AI consult chat (revision/compose/draft-review/teaching); canonical impl is `frontend/src/components/ConsultChat.tsx`.
- **[FAD dashboard shell](https://github.com/Friday-mu/feature-catalog/blob/main/ui/fad-dashboard-shell.md)** — the shell pattern itself (sidebar + module routing + static export).
- **[Chat history + summarization](https://github.com/Friday-mu/feature-catalog/blob/main/architecture/chat-history-summarization.md)** — multi-session GMS-side pattern; FAD consumes it via `ConsultChat`.

**Fetch a catalog entry from any session:**

```bash
gh api repos/Friday-mu/feature-catalog/contents/README.md --jq .content | base64 -d   # master index
gh api repos/Friday-mu/feature-catalog/contents/ui/friday-consult-pattern.md --jq .content | base64 -d   # any entry
```

Or clone once for fast local read: `git clone git@github.com:Friday-mu/feature-catalog.git ~/repos/feature-catalog`.

**Discipline:** if you change a catalogued feature in this repo (e.g. `ConsultChat.tsx`), **update its catalog entry in the same commit**. Drift kills the catalog.

## Common patterns

**Adding a page:** Create folder under `src/app/fad/` or root `src/app/`, add `page.tsx`. Use `layout.tsx` for shared shells.

**Adding a module:** Create component in `src/app/fad/_components/modules/`, register in the module router/data file. Modules: Inbox, Calendar, Operations, Finance, HR, Reservations, Analytics, Training, Settings.

**Adding a component:** If FAD-specific, put in `src/app/fad/_components/`. If shared across apps, put in `src/components/`.

**API calls:** Frontend calls backend API or GMS backend directly via `NEXT_PUBLIC_API_URL`. Backend proxy pattern in `backend/server.js`.

**Static export:** `npm run build` in frontend generates `out/` folder. This is copied to `/var/www/friday-dashboard/` on deploy. No server-side rendering — everything must work as static HTML.

## Gotchas

- **Always `git fetch origin` before assessing repo state.** 3-layer reconciliation per AGENTS.md.
- **`fad-rebuild` is the active branch** for FAD-related work. `main` exists but `fad-rebuild` has the current development. Commit FAD work to `fad-rebuild`. If also committing to `main`, ensure it makes sense there.
- **Static export limitation:** `output: 'export'` means no API routes in `frontend/`, no `next/image` optimization without config, no dynamic routes with params unless using `generateStaticParams`.
- **Finance schema:** FAD finance schema lives at `/mnt/user-data/outputs/fad_finance_schema_v1.sql` (14 tables, `entity_id` for FR/FI/S divisions; FR is the only legal entity currently).
- **Cleaning Fee = net pass-through** (VAT optimisation). Don't model it as revenue.
- **WhatsApp template owner-approvals** use the `approve/` route — primary channel for owner consent.
- **Phase 1+2 complete.** Phase 3 (GL + QuickBooks integration) scheduled May–Jun.

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

## Deploy flow

Canonical deploy lives in `~/.openclaw/workspace/AGENTS.md` Deploy Rules section. TL;DR:

```bash
# Frontend
cd frontend && npm run build
# Copy frontend/out/ to VPS /var/www/friday-dashboard/
# Verify chunk hashes changed (stale JS from browser cache is a real failure mode)

# Backend (if changed)
cd backend && npm run build
# Deploy backend artifacts per AGENTS.md
```

No auto-deploy on push. Sprint close handles full deploy.

## References

- **Atlas (Section 4 — GMS architecture):** https://www.notion.so/34c43ca8849281b9a10de9f264141c37
- **AGENTS.md:** `~/.openclaw/workspace/AGENTS.md`
- **Sprint 7 v3 plan:** https://www.notion.so/34f43ca88492815380d0d0dce19cb53c
- **Phase 1 investigation:** `~/judith/handovers/2026-04-28-sprint7-investigation.md`
- **Bug-vs-sprint dedup:** `~/judith/handovers/2026-04-28-bug-vs-sprint-dedup.md`
- **FAD finance schema:** `/mnt/user-data/outputs/fad_finance_schema_v1.sql`
