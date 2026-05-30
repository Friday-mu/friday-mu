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

const FR_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map(); // key: `${tenantId}:${moduleKey}` → { enabled, expires }

// Separate per-tenant subscription-status cache. Same 60s TTL as the
// module cache — short enough that a worker flip (trial → past_due,
// past_due → cancelled) is visible within a minute without forcing a
// DB roundtrip on every request.
const subscriptionCache = new Map(); // key: tenantId → { status, expires }

async function _getSubscriptionStatus(tenantId) {
  if (!tenantId) return null;
  const cached = subscriptionCache.get(tenantId);
  if (cached && cached.expires > Date.now()) return cached.status;
  try {
    const { rows } = await query(
      `SELECT subscription_status FROM tenants WHERE id = $1 LIMIT 1`,
      [tenantId],
    );
    const status = rows.length > 0 ? rows[0].subscription_status : null;
    subscriptionCache.set(tenantId, { status, expires: Date.now() + CACHE_TTL_MS });
    return status;
  } catch (e) {
    // Fail closed-ish: treat unknown as null and let the caller decide.
    // We don't want a DB blip to lock every tenant out, but we also
    // don't want to silently grant access — log loudly so it's visible.
    console.error(`[tenants/middleware] subscription status query failed for ${tenantId}:`, e.message);
    return null;
  }
}

function invalidateSubscriptionCache(tenantId) {
  if (tenantId) subscriptionCache.delete(tenantId);
}

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

    // Subscription lifecycle gate. The module-enabled check above answers
    // "did this tenant pay for this feature"; the status check below
    // answers "is this tenant's billing in good standing today". Order
    // matters — we still leak "module exists for you" to past_due tenants
    // because they get to keep working, just with a banner.
    //
    //   cancelled / suspended → 402 Payment Required, hard-block
    //   past_due              → allow, but flag via X-Subscription-Past-Due
    //                           header so the frontend can render a banner
    //   trial / active / null → allow silently
    //
    // FR is the platform-admin tenant — never gate it. Avoids the chicken-
    // and-egg case where FR's own row gets flipped to past_due and locks
    // the support team out of the dashboard they'd use to fix it.
    if (tenantId !== FR_TENANT_ID) {
      const status = await _getSubscriptionStatus(tenantId);
      if (status === 'cancelled' || status === 'suspended') {
        return res.status(402).json({
          error: 'subscription_inactive',
          reason: status,
        });
      }
      if (status === 'past_due') {
        // TODO(frontend): read X-Subscription-Past-Due response header and
        // render a banner prompting the admin to pay the outstanding
        // invoice. Out of scope for this subagent.
        res.setHeader('X-Subscription-Past-Due', '1');
      }
    }

    next();
  };
}

if (process.env.DISABLE_MODULE_GATE === '1') {
  console.warn('[tenants/middleware] DISABLE_MODULE_GATE=1 — module gate is BYPASSED. Do not run this in production.');
}

// Defensive lockdown for non-design routes that haven't been tenant-
// scoped yet (HR / feedback / website-inbox / GMS-proxy /api/inbox /
// /api/reviews / etc.). These routes still hardcode FR-tenant assumptions
// in their queries; until they're swept the way design/* was, we block
// non-FR tenants from hitting them at all.
//
// Behaviour:
//   - req.tenantId === FR_TENANT_ID → next() (FR continues unchanged)
//   - req.tenantId set and != FR    → 403
//   - req.tenantId undefined        → next() (let downstream auth 401)
//
// Pair with attachIdentitySoft mounted earlier in the chain so
// req.tenantId is populated for already-authenticated requests.
//
// Remove the wrapper from a route once its queries honour req.tenantId
// AND a corresponding `requireModule` gate is in place.
function requireFrTenant(req, res, next) {
  if (req.tenantId && req.tenantId !== FR_TENANT_ID) {
    return res.status(403).json({
      error: 'Forbidden — this feature isn\'t part of your subscription.',
    });
  }
  next();
}

module.exports = {
  FR_TENANT_ID,
  isModuleEnabled,
  invalidateModuleCache,
  invalidateSubscriptionCache,
  requireModule,
  requireFrTenant,
};
