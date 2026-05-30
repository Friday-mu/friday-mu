# FAD Gotchas

Project-specific traps. The general "always git fetch first" reconciliation rule lives in the global `~/.claude/CLAUDE.md` — don't repeat it here.

## `fad-rebuild` branch sync with `main`

The active development branch is `fad-rebuild`, not `main`. `main` exists but lags.

- Default: commit FAD work to `fad-rebuild`. Don't touch `main` reflexively.
- If a change *also* belongs on `main` (rare — e.g. a hotfix that's not part of the rebuild), commit to `main` separately and reason about it explicitly.
- Don't merge `fad-rebuild` → `main` opportunistically. The rebuild lands as a deliberate cutover, not via drift.

## Static-export pitfalls

`output: 'export'` produces a static site — most "Next.js can do that" advice does not apply here. Specific edges:

- **API routes silently no-op.** A file at `frontend/src/app/api/foo/route.ts` will compile but won't be served. Put server logic in `backend/`.
- **`next/image` breaks builds** unless `images.unoptimized: true` or a static loader is configured.
- **Dynamic routes** (`[id]/page.tsx`) need `generateStaticParams` returning the complete param set at build time. There's no on-demand rendering at runtime.
- **Server actions, middleware, route handlers** — all unsupported. The build won't always reject them; behavior just disappears at runtime.
- **No `revalidate`, no ISR.** All data is baked at build time. Live data must come from client-side fetches.

## `tsconfig.json` `ignoreBuildErrors: true` trap

`next build` will succeed even when TypeScript errors exist. Things that slip through:

- Renamed props on components — callers stay broken.
- Wrong types on async return values — runtime crash, not build failure.
- Missing imports caught only at runtime.

Don't trust a green build for type correctness. Run `tsc --noEmit` from `frontend/` to actually verify types before shipping non-trivial changes.

## Tailwind / utility-first conventions

- Tailwind JIT compiles only classes it can statically see. Class names assembled from variables (`` `text-${color}-500` ``) won't be emitted. Use full class strings or a `safelist` entry.
- Global overrides go in `frontend/src/app/fad.css`, not per-component CSS files.

## Phase status (as of 2026-04-29)

- Phase 1+2: complete.
- Phase 3 (GL + QuickBooks integration, finance schema lands in-repo): scheduled May–Jun 2026.

This block ages — re-read the active sprint plan in Notion (Friday Code Index) before relying on it.
