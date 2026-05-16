'use strict';

// /api/properties — read-only API over the local `guesty_listings`
// cache. The data is hydrated by the polling worker
// (`reservations/worker.js` calls both sync paths) — this router
// never touches Guesty directly so a request never pays the OAuth +
// Guesty-API round-trip cost.
//
// Two endpoints for v1:
//   GET  /api/properties          — list (tenant-scoped, optional ?cohort=)
//   GET  /api/properties/:id      — single by Guesty `_id`
//   POST /api/properties/sync     — kick a manual re-sync (admin-only)
//
// All routes require a valid JWT via attachIdentity (sets req.tenantId).
// Multitenant gate is intentional even though only FR has Guesty creds
// today — non-FR tenants will simply see an empty list until a per-
// tenant Guesty client lands.

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');
const { syncListingsForTenant } = require('./sync');

const router = express.Router();

function shapeListing(row) {
  if (!row) return null;
  return {
    id: row.id,
    guesty_id: row.guesty_id,
    nickname: row.nickname,
    title: row.title,
    address: {
      full: row.address_full,
      city: row.address_city,
      country: row.address_country,
    },
    cohort: row.cohort,
    picture_url: row.picture_url,
    property_type: row.property_type,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms != null ? Number(row.bathrooms) : null,
    accommodates: row.accommodates,
    base_price_minor: row.base_price_minor != null ? Number(row.base_price_minor) : null,
    currency_code: row.currency_code,
    is_active: row.is_active,
    synced_at: row.synced_at,
  };
}

// GET / — list tenant's listings.
//   ?cohort=flic_en_flac    filter to one cohort
//   ?active=true|false      filter (default: any)
router.get('/', attachIdentity, async (req, res) => {
  try {
    const filters = ['tenant_id = $1'];
    const params = [req.tenantId];
    let i = 2;
    if (typeof req.query.cohort === 'string' && req.query.cohort.length > 0) {
      filters.push(`cohort = $${i++}`);
      params.push(req.query.cohort);
    }
    if (req.query.active === 'true') {
      filters.push('is_active = TRUE');
    } else if (req.query.active === 'false') {
      filters.push('is_active = FALSE');
    }
    const { rows } = await query(
      `SELECT * FROM guesty_listings
       WHERE ${filters.join(' AND ')}
       ORDER BY COALESCE(nickname, title) ASC NULLS LAST`,
      params,
    );
    res.json({ listings: rows.map(shapeListing) });
  } catch (e) {
    console.error('[properties] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /:id — single listing by Guesty `_id` (NOT the row UUID, since
// every other surface — webhooks, reservations FK, property-map.json
// — keys on the Guesty id).
router.get('/:guestyId', attachIdentity, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM guesty_listings
       WHERE tenant_id = $1 AND guesty_id = $2`,
      [req.tenantId, req.params.guestyId],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Listing not found' });
    res.json(shapeListing(rows[0]));
  } catch (e) {
    console.error('[properties] get error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /sync — director-only manual re-sync. Returns the same summary
// shape the worker logs. Useful for forcing a refresh after editing a
// listing in the Guesty dashboard.
router.post('/sync', attachIdentity, async (req, res) => {
  // GMS-side admin role (set on the JWT by signup + login). Other
  // tenant roles (manager, staff) shouldn't be able to fan out
  // Guesty API calls.
  if (req.identity?.role !== 'admin') {
    return res.status(403).json({ error: 'admin role required' });
  }
  try {
    const summary = await syncListingsForTenant(req.tenantId);
    res.json({ ok: true, ...summary });
  } catch (e) {
    console.error('[properties] sync error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
