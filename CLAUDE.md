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
- **Export:** `output: 'export'` — static HTML, no SSR. Deployed to `/var/www/friday-dashboard/`
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

**Static export:** `npm run build` in frontend generates `out/` folder. This is copied to `/var/www/friday-dashboard/` on deploy. No server-side rendering — everything must work as static HTML.

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

# VPS deploy (manual, for production)
# Copy frontend/out/ to VPS /var/www/friday-dashboard/
# Verify chunk hashes changed (stale JS from browser cache is a real failure mode)

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
- **Consolidated FAD/GMS roadmap (2026-05-18):** `docs/roadmap/2026-05-18-consolidated.md` (mirror: Notion `36443ca8849281e38052fb6d67343f74`)
- **FAD Running Decisions Log:** Notion `34f43ca88492819f8284ea6a89e8624e` — strategic constraints, module ownership, locked module decisions
- **Claude Operating Rules:** Notion `34d43ca88492810ea8aec815655e0042` — procedural rules + ADRs in force
- **FAD Code Session Handover (current):** Notion `36443ca8849281eb834ddbcf1154e777`
- **Active Work zone (parent):** Notion `35243ca8849281ce9781ccc214d6a595`

## Strategic constraints (locked, not re-litigable)

ADRs and §1 / §5.7 / §5.8 of the running decisions log (Notion `34f43ca88492819f8284ea6a89e8624e`). **Reopening requires explicit Ishant approval.** Do not re-litigate.

- **FAD = control + AI layer on Guesty / Breezeway.** Through Phase 1, FAD reads from them; they remain system of record. FAD layers AI surfaces, cross-module linking, unified UX.
- **Guesty-replacement curve per module.** Phase 1 (read-from) → Phase 2 (write-through) → Phase 3 (source-of-truth). Strategic target: mid-2027. Channel-manager + WhatsApp pulled forward to Q3-Q4 2026 via Channex (memo `35943ca88492818883d3fcefd8bb5e02`).
- **Multi-tenant from day one.** Every module + integration ships multi-tenant. Credentials per-tenant in pgcrypto-encrypted `key_vault`. Non-negotiable for schema, API auth, route guards, RLS, AI prompt isolation. v0.1 foundation already shipped (`fridayos-mt-v0.1.0..v0.4.0`).
- **FridayOS as MCP server long-term.** `mcp.fridayos.com` productises FAD's integration layer. Every wrapper designed typed + multi-tenant + well-documented for eventual external-tenant consumption.
- **Typed wrapper architecture.** For each integration: one typed TS client. Surface twice — Express backend (no LLM tokens) + MCP server (thin adapter, same wrapper). Cost is at the LLM context layer only.
- **FAD as single source of truth for shared external integrations (§5.7, locked 2026-05-18).** FAD is the only org-wide client for Guesty / Resend / Kimi / future overlapping vendors. Website calls FAD `/api/public/*` over short-lived JWTs. Browser-side / website-specific bits (Carto, Google Fonts, PostHog, Bokun widgets, payment processor, Sanity) stay on website.
- **admin.friday.mu URL canonical (§5.8, re-confirmed 2026-05-18).** Both `admin.friday.mu` and `gms.friday.mu` nginx vhosts root at `/var/www/fad/` — same bundle. Default test instructions + ops references go to `admin.friday.mu`. PWAs install against it.

### ADRs in force

- **001** API-first, UI-on-top.
- **002** FridayOS 3-layer: integration / intelligence / interface.
- **003** Auth: OAuth 2.0 client_credentials + short-lived JWTs. Standards-based audit-per-request beats static-key+mTLS.
- **004** Data freshness via SSE push (Postgres LISTEN/NOTIFY), NOT polling. ETag + Cache-Control for HTTP cold loads.
- **005** Webhook + API for calendar/pricing, NOT scraping. `scrape-pricing.mjs` scaffold is obsolete.
- **006** Reservations is the primary key everything cross-links to.
- **007** Properties is the unification layer between Guesty (commercial) and Breezeway (operational).
- **008** Internal team comms live in FAD Inbox, not Slack.
- **009** Investigation before implementation. Always insert the investigation step.
- **010** No parallelization across waves; sequencing where dependent.

Full ADR detail in consolidated roadmap §3.

## Workflow rules (Friday-specific layer)

Universal workflow rules (plan-first, verify-before-done, surface errors, minimal blast radius, escalation list) live in `~/.claude/CLAUDE.md` and the Universal Bootstrap Rules Notion page (`36443ca8849281fea06df5f83ae8e00a`). The below are Friday-specific only.

- **No parallelization across waves (§3.3, ADR-010).** Within a wave, independent tasks may parallelize. Across waves, never. Investigate → propose → approve → implement is strict.
- **Verification gates must be executable in the dev env (§11).** Pre-flight every gate: "what state does this need; does the env have it?" If infeasible, **block and flag** — never silently downgrade. 2026-04-28 team.json incident is the case study.
- **Direct push, no PRs.** Push to master / current sprint branch. No feature branches unless Ishant explicitly asks. 3-layer reconciliation (working tree, index, remote) — `git fetch origin` first (enforced by SessionStart hook, but verify if the hook didn't fire).
- **Git author = `Judith Friday <judith@friday.mu>`.** Enforced by PreToolUse hook. If the hook blocks a commit: fix via `git config --global user.email "judith@friday.mu"`. Background on the 2026-05-18 silent-fallback incident in memory `git_author_convention.md`.
- **Git tag formats (§12).** GMS `gms-v[X.Y.Z]` · FridayOS `fridayos-s[N]-v0.[N].0` · Symbiosis `symbiosis-v[X.Y.Z]` · Mission Control `mc-v[X.Y.Z]`. Tag after a clean ship.
- **Sprint close ritual (§12).** Update Notion (Sprint Timeline + Priority Queue + Atlas) → tag git → generate paste-able status update prompt for next Atlas session. Atlas won't auto-discover; the prompt is the handoff.

## Module ownership snapshot

§4 of FAD running decisions log. Ship-target dates are commitments, not aspirations. Module-specific decisions live in each module's scoping pack (FAD Scoping `34f43ca88492812baca2def8dd92eb27`).

| Module | Scoper | Ship target | Notes |
|---|---|---|---|
| Inbox / Operations / Calendar / HR | (live) | shipped | In flight per running decisions §5 |
| Finance | (built v1) | shipped + Mathias additions in flight | Phase 1+2 complete; Phase 3 (GL + QuickBooks) May-Jun |
| Properties | Mathias | May 2026 | v0.2 LOCKED (`34f43ca8849281f3a130f7def80a7c5d`). Unification layer Guesty↔Breezeway. |
| Reservations | Mathias | May 2026 | v0.2 LOCKED (`34f43ca884928188a83ad290b1a13b1b`). Primary key. |
| Legal / Admin | Mary | May 2026 | **HARD DEADLINE 2026-05-25 (Mary leaves).** Xodo Sign is the meat. |
| Owners (essentials) | Mary + Mathias → Ishant | May 2026 | Statement review + send. |
| Owners (full portal) | Ishant | Sep 2026 | Same FAD app, role-scoped. Not separate codebase. |
| Reviews | Ishant + Claude | May 2026 | v0.2 (`34f43ca8849281ec9a08eb46c3779831`). Phase 1 read-from-Reva. |
| Guests | Mathias (lifecycle) + Mary (admin slice) | Jul 2026 | Mary's admin slice captured before 2026-05-25. |
| Marketing | Mathias | Aug 2026 | Pitch tier. Direct-booking review collection lives here, not in Reviews. |
| Leads / CRM-lite | Mathias | "soon" | Pitch tier; Nitzana-driven commit-by. |
| Analytics | Ishant | Jun 2026 | Cross-module dashboards. |
| Intelligence | Ishant | Aug 2026 | Pitch tier; AI agent layer. |
| Training | (cross-cutting) | May 2026 | Per-module; no standalone scope. |
| Syndic / Interior / Agency | Ishant | Q1-Q2 2027 / TBD | Tease tier. |

External portals: **Owner portal** = same FAD app, role-scoped views (not separate codebase). **Vendor portal** = separate lightweight mobile-first PWA, Phase 3 deferred.
