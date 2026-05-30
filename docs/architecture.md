# FAD Architecture

Deep how-to for working in the FAD codebase. Read when adding modules, pages, components, or wiring API integrations.

## Adding a page

App Router conventions: each route is a folder containing `page.tsx`.

- Top-level marketing/auth-style routes → `frontend/src/app/<route>/page.tsx` (e.g. `approve/`, `reset-password/`).
- Dashboard-internal routes → `frontend/src/app/fad/<route>/page.tsx`.
- Shared layout shells → `layout.tsx` at the appropriate folder level. The dashboard chrome (Sidebar, header) lives in `frontend/src/app/fad/layout.tsx`.

Static export means no `getServerSideProps`, no API routes inside `frontend/`, no dynamic segments without `generateStaticParams`. See `@docs/gotchas.md` for the full list of static-export pitfalls.

## Adding a module

FAD modules are dashboard sub-apps (Inbox, Calendar, Operations, Finance, HR, Reservations, Analytics, Training, Settings).

- Module component → `frontend/src/app/fad/_components/modules/<Module>.tsx`
- Module data / fixtures / config → `frontend/src/app/fad/_data/*.ts`
- Register the module in the FAD module router / Sidebar config so it's reachable from the shell.

## Adding a component

- **FAD-specific** (only used inside the dashboard) → `frontend/src/app/fad/_components/`
- **Shared** (could be reused by other Friday frontends) → `frontend/src/components/`

Default to FAD-specific until a second consumer actually exists. Don't pre-promote.

## API call patterns

Three patterns coexist:

1. **Frontend → FAD backend** (`backend/server.js`) for FAD-owned endpoints and proxy concerns.
2. **Frontend → GMS backend direct** via `NEXT_PUBLIC_API_URL` for guest-messaging endpoints. GMS owns its own data; don't shadow it in FAD.
3. **Backend proxy** in `backend/server.js` when CORS, auth-injection, or request-shaping is needed before the frontend can call an upstream.

Auth: JWT custom-issued by FAD backend. Tokens go in the `Authorization: Bearer …` header.

## Static export deep dive

`next.config.js` sets `output: 'export'`. Build emits a static `out/` folder copied to the VPS. What this rules out:

- API routes under `frontend/src/app/api/**` — won't be served. Put server logic in `backend/`.
- `next/image` optimization — works only with `unoptimized: true` or a configured loader.
- Route handlers, server actions, middleware — all unsupported in export mode.
- Dynamic routes (`[id]/page.tsx`) require `generateStaticParams` returning the full param set at build time.

If you need any of the above, the answer is "put it in `backend/`" or rethink the feature.

## Ports

- Frontend dev: `3000`
- Backend dev: see `backend/server.js` (uses `PORT` env, defaults vary)

## External services

- Guesty API (reservations / properties)
- Slack webhooks (notifications)
- Breezeway API (operations)
- WhatsApp Business (owner approvals via `approve/` route)
