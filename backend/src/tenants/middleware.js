'use strict';

// Module subscription gate middleware.
//
// Mounted in server.js in front of tenant-scoped routers like:
//   app.use('/api/design', requireModule('design'), designRoutes);
//
// Looks up tenant_modules for req.tenantId. If the module isn't
// enabled for that tenant, returns 403. Falls back to deny-by-
// default if the row's missing — explicit, not silent.
//
// Cached per-tenant for 60s to avoid one DB roundtrip per request.
// The cache invalidates implicitly when an admin flips a module
// enabled/disabled via the tenant-settings UI (the cache TTL is
// short enough that the team won't notice).
//
// Escape hatch: env DISABLE_MODULE_GATE=1 bypasses the check entirely.
// Used during dev / debugging; should NEVER be set in production.
// Logged at boot so it's visible if mis-set.

const { query } = require('../database/client');
const { isKnownModule } = require('./modules');

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map(); // key: `${tenantId}:${moduleKey}` → { enabled, expires }

function _cacheKey(tenantId, moduleKey) {
  return `${tenantId}:${moduleKey}`;
}

async function isModuleEnabled(tenantId, moduleKey) {
  if (!tenantId || !moduleKey) return false;
  const key = _cacheKey(tenantId, moduleKey);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.enabled;
  try {
    const { rows } = await query(
      `SELECT enabled FROM tenant_modules WHERE tenant_id = $1 AND module_key = $2 LIMIT 1`,
      [tenantId, moduleKey],
    );
    const enabled = rows.length > 0 && rows[0].enabled === true;
    cache.set(key, { enabled, expires: Date.now() + CACHE_TTL_MS });
    return enabled;
  } catch (e) {
    // DB blip → fail closed. Surfacing as 403 is correct: we'd rather
    // wrongly block a request than wrongly grant access to a module
    // the tenant didn't pay for.
    console.error(`[tenants/middleware] isModuleEnabled query failed for ${tenantId}/${moduleKey}:`, e.message);
    return false;
  }
}

// Flush a specific cache entry. Call this when an admin flips a
// module's enabled state — otherwise the change takes up to 60s.
function invalidateModuleCache(tenantId, moduleKey) {
  if (moduleKey) cache.delete(_cacheKey(tenantId, moduleKey));
  else {
    // Tenant-wide flush.
    for (const key of cache.keys()) {
      if (key.startsWith(`${tenantId}:`)) cache.delete(key);
    }
  }
}

function requireModule(moduleKey) {
  if (!isKnownModule(moduleKey)) {
    // Catches typos at boot time — server.js wires this synchronously,
    // so a bad key throws before any request lands.
    throw new Error(`[tenants/middleware] Unknown module key: "${moduleKey}". Add it to backend/src/tenants/modules.js first.`);
  }
  return async (req, res, next) => {
    if (process.env.DISABLE_MODULE_GATE === '1') return next();
    const tenantId = req.tenantId || req.identity?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized — no tenant context' });
    }
    const enabled = await isModuleEnabled(tenantId, moduleKey);
    if (!enabled) {
      return res.status(403).json({
        error: `Forbidden — your subscription doesn't include the "${moduleKey}" module.`,
        module: moduleKey,
      });
    }
    next();
  };
}

if (process.env.DISABLE_MODULE_GATE === '1') {
  console.warn('[tenants/middleware] DISABLE_MODULE_GATE=1 — module gate is BYPASSED. Do not run this in production.');
}

module.exports = {
  isModuleEnabled,
  invalidateModuleCache,
  requireModule,
};
