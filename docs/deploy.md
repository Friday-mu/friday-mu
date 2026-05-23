# FAD Deploy

Deployment is **manual at sprint close**, not on every push. The global "git push → VPS auto-pulls + builds" Friday convention does **not** apply to FAD — frontend deploys are an explicit `out/` copy via `rsync`, and backend deploys are an `rsync` + `pm2 restart`.

> **Canonical roots on the VPS** (since 2026-05-18):
> - Frontend: `/var/www/fad/`
> - Backend: `/var/www/fad-backend/`
> - SSH identity: `~/.ssh/do_friday_admin`
> - PM2 process: `fad-backend` (port 3002)
> - Active branch: `fad-rebuild`
>
> Old `/var/www/friday-dashboard*` paths are **inert** — nginx no longer routes there. Don't deploy to them.

## Full sequence

```bash
# 1. Build frontend
cd frontend && npm run build  # → frontend/out/

# 2. Stamp version.json (so /version.json reports the live SHA)
SHA=$(git rev-parse HEAD)
SHORT=$(git rev-parse --short HEAD)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cat > frontend/out/version.json <<EOF
{"version":"$SHORT","branch":"fad-rebuild","commit":"$SHA","deployedAt":"$NOW"}
EOF

# 3. Backup live (skip if a recent backup exists; disk is tight)
STAMP=$(date -u +"%Y%m%d-%H%M%S")
ssh -i ~/.ssh/do_friday_admin root@admin.friday.mu \
  "cp -a /var/www/fad /var/backups/fad-frontend-pre-${SHORT}-${STAMP} && \
   cp -a /var/www/fad-backend /var/backups/fad-backend-pre-${SHORT}-${STAMP}"

# 4. (When applicable) Apply pending migrations via an SSH one-liner —
#    see e.g. how migrations 075 + 076 were applied 2026-05-23.

# 5. Rsync frontend
rsync -avz --delete -e "ssh -i ~/.ssh/do_friday_admin" \
  frontend/out/ root@admin.friday.mu:/var/www/fad/

# 6. Rsync backend (only when backend changed — preserve env, deps, uploads)
rsync -avz --delete \
  --exclude '.env' --exclude '.env.*' --exclude 'node_modules' \
  --exclude '.git' --exclude 'logs/' --exclude 'uploads/' \
  --exclude '.*-cache.json' --exclude 'coverage/' --exclude 'test-results/' \
  --exclude 'dist/' --exclude 'build/' \
  -e "ssh -i ~/.ssh/do_friday_admin" \
  backend/ root@admin.friday.mu:/var/www/fad-backend/

# 7. (Backend only) Syntax check + PM2 restart with new env
ssh -i ~/.ssh/do_friday_admin root@admin.friday.mu \
  "cd /var/www/fad-backend && \
   node --check src/<changed-files>.js && \
   GIT_COMMIT=${SHA} APP_VERSION=${SHORT} BUILD_TIME=${NOW} \
   pm2 restart fad-backend --update-env"

# 8. (Backend only, when new deps were added) npm install on the VPS
ssh -i ~/.ssh/do_friday_admin root@admin.friday.mu \
  "cd /var/www/fad-backend && npm install --production && \
   pm2 restart fad-backend"

# 9. Verify
curl -fsS "https://admin.friday.mu/version.json?_=$(date +%s)"
curl -fsS "https://admin.friday.mu/api/version?_=$(date +%s)"
```

## Frontend-only deploy shortcut

If only the frontend changed since the last deploy (no `backend/` diff), skip steps 6-8.

If the backend changed, **do not deploy frontend-only** — the SHAs will drift and `/version.json` vs `/api/version` will report different commits, which is a real debugging headache. Coordinate a paired deploy.

## Authenticated smoke (post-deploy)

```bash
ssh -i ~/.ssh/do_friday_admin root@admin.friday.mu 'bash -s' <<'REMOTE'
cd /var/www/fad-backend
TOKEN=$(node -e 'require("dotenv").config(); const jwt=require("jsonwebtoken"); process.stdout.write(jwt.sign({user_id:"868ea47f-b482-43a1-913a-fabe981ceb81",role:"admin",fad_role:"director",username:"ishant@friday.mu",display_name:"Ishant",tenant_id:"00000000-0000-0000-0000-000000000001"}, process.env.JWT_SECRET, {expiresIn:"5m"}))')
curl -fsS -H "Authorization: Bearer $TOKEN" https://admin.friday.mu/api/auth/me | python3 -m json.tool
REMOTE
```

## Cache-bust strategy

Next.js emits hashed chunk filenames in `_next/static/chunks/`. The hash is the freshness signal: if hashes haven't changed, browsers will serve old JS from cache and your "deploy" silently has no user-visible effect.

After rsync, sanity-check chunk hashes:

```bash
curl -sS "https://admin.friday.mu/fad/index.html?_=$(date +%s)" \
  | grep -oE '/_next/static/chunks/[a-zA-Z0-9_-]+\.js' | head -3
```

If those hashes don't match your local `frontend/out/_next/static/chunks/`, the rsync didn't apply (or nginx is caching aggressively).

The frontend ships a 5-min `/version.json` poll (`frontend/src/app/fad/_components/UpdateBanner.tsx`) that prompts open tabs to refresh when the SHA changes. Polling also runs on tab `focus` + `visibilitychange`, throttled to 60s. This catches operators who don't manually reload.

## Post-deploy verification (golden path)

- `https://admin.friday.mu/version.json` → expected SHA.
- `https://admin.friday.mu/api/version` → expected SHA (matches frontend if backend was redeployed too).
- `https://admin.friday.mu` loads, sign-in works.
- One golden-path flow per touched module (open Inbox → click conversation, open Operations → click task, etc.).
- Mobile (375×812) smoke if any UI changed — Apple HIG 44pt touch targets, dvh viewport, safe-area inset behavior.

## Rollback

Two options, in order of preference:

1. **`git revert` + redeploy** — clean history, easy to reason about. Re-run the full sequence with the reverted SHA.
2. **Artifact restore** — `/var/backups/fad-frontend-pre-<SHA>-<STAMP>` and `/var/backups/fad-backend-pre-<SHA>-<STAMP>` were taken in step 3. `cp -a` them back over `/var/www/fad` and `/var/www/fad-backend`, then `pm2 restart fad-backend`. Faster, doesn't help if backend deps changed.

Backend rollback (if applicable): redeploy the prior backend artifact and `pm2 restart fad-backend`.

## Migrations

When a backend deploy includes a new migration:

```bash
# Inspect pending migrations
ls backend/migrations/0*.sql

# Apply via SSH one-liner — example for migration 077:
ssh -i ~/.ssh/do_friday_admin root@admin.friday.mu \
  "cd /var/www/fad-backend && node -e \"
    require('dotenv').config();
    const { Pool } = require('pg');
    const fs = require('fs');
    const sql = fs.readFileSync('migrations/077_FOO.sql', 'utf8');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool.query(sql).then(() => { console.log('OK'); pool.end(); })
      .catch(e => { console.error(e); process.exit(1); });
  \""
```

Migrations are idempotent (`IF NOT EXISTS` everywhere). Re-running a no-op migration is safe but should still be deliberate.

## Strategic constraints

From `CLAUDE.md` + `docs/FAD_BACKLOG.md` + the FAD Running Decisions Log on Notion:

- **No deploy without explicit Ishant ack.** Push freely; deploy only on go.
- **No frontend-only deploy when backend changed.**
- **Git author = `Judith Friday <judith@friday.mu>`** (PreToolUse hook enforces).
- **Protected migrations** — `050_tasks.sql` through `054_*.sql`, `071_tasks_ops_lifecycle_reconcile.sql` — coordinate before touching.
- **`fad-rebuild` is canonical.** Don't use `fad-design-os-v01-*` branches as truth.
