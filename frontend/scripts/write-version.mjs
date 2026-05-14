// Writes frontend/public/version.json with the current build identity
// before each build:prod run. The UpdateBanner component polls this
// file at runtime to detect deploys and prompt force-refresh.
//
// Why a static file vs a backend endpoint:
//  - No auth required (banner works for anyone, including signed-out
//    users on the login page if we ever mount it there).
//  - Tied to the actual deployed frontend, not the backend's process
//    lifecycle — survives backend restarts.
//  - Nginx serves it from /var/www/fad/version.json with no extra
//    routing work; the FAD static-export deploy includes everything
//    in public/ at the root.
//
// Format: { "version": "<git-short-hash>", "builtAt": "<iso>" }

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '..', 'public', 'version.json');

let version = 'dev';
try {
  // -C the frontend dir so we resolve the same .git regardless of CWD.
  version = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch {
  // No git available (CI without checkout, container build, etc.).
  // Fall back to a timestamp-based version — still differentiates
  // builds, just less informative.
  version = `build-${Date.now()}`;
}

const payload = {
  version,
  builtAt: new Date().toISOString(),
};

mkdirSync(dirname(outPath), { recursive: true });
if (!existsSync(dirname(outPath))) {
  throw new Error(`public dir does not exist at ${dirname(outPath)}`);
}
writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
console.log(`[write-version] ${outPath} → ${version} (${payload.builtAt})`);
