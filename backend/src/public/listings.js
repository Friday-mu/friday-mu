'use strict';

// GET /api/public/listings + /:nickname
//
// First public endpoint per roadmap §5.2.2. Reads from the
// guesty_listings cache (populated by the 15-min poller in
// properties/sync.js) and returns the data shape the website
// consumes. ETag + Cache-Control per ADR-004 so the website's edge
// can cache and the round-trip stays cheap.
//
// Auth: short-lived JWT issued by /api/auth/token, scope listings:read.
// Tenant-scoped to the JWT's tenant_id so a per-tenant cred only sees
// its own properties.

const express = require('express');
const crypto = require('crypto');
const { query } = require('../database/client');
const { attachApiClient, requireScope } = require('../auth/api_clients');

// Per the website-side fadFetch contract (their lib/fad-client/auth.ts):
// every public-API error response includes { error, message, request_id }.
// The request_id is generated per response and surfaces in their thrown
// errors so cross-side debugging joins. Helper keeps the shape consistent.
function publicError(res, status, code, message) {
  return res.status(status).json({
    error: code,
    message: message || code,
    request_id: crypto.randomUUID(),
  });
}

const router = express.Router();

// Shape the website uses. Mirrors the internal /api/properties shape
// almost exactly — minor renames where the website's GuestyListingDTO
// uses different keys. If the website session confirms a different
// envelope spec, this map gets tweaked.
function shapeListingPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    guestyId: row.guesty_id,
    nickname: row.nickname,
    title: row.title,
    address: {
      full: row.address_full,
      city: row.address_city,
      country: row.address_country,
    },
    cohort: row.cohort,
    pictureUrl: row.picture_url,
    propertyType: row.property_type,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms != null ? Number(row.bathrooms) : null,
    accommodates: row.accommodates,
    basePriceMinor: row.base_price_minor != null ? Number(row.base_price_minor) : null,
    currencyCode: row.currency_code,
    isActive: row.is_active,
    syncedAt: row.synced_at,
  };
}

// Cache control: listings change rarely (poller runs every 15min), so
// we set ETag from a hash of the response payload and let the website
// edge cache 5min. ADR-004 says SSE push for invalidation; until SSE
// ships, 5min TTL is the closest balance between freshness and load.
function sendWithEtag(req, res, payload) {
  const json = JSON.stringify(payload);
  const etag = `"${crypto.createHash('sha256').update(json).digest('base64').slice(0, 24)}"`;
  res.set('ETag', etag);
  res.set('Cache-Control', 'public, max-age=300');
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }
  res.type('application/json').send(json);
}

router.get('/', attachApiClient, requireScope('listings:read'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM guesty_listings
         WHERE tenant_id = $1 AND is_active = TRUE
         ORDER BY nickname`,
      [req.apiClient.tenantId],
    );
    // Single named-key envelope per the website-side contract — no
    // generic { data, error, meta } wrapper, no bonus keys like `total`.
    // Forward-compat: extra keys can be bolted in later (pagination
    // cursor, rate-limit meta) without breaking their types.
    sendWithEtag(req, res, {
      listings: rows.map(shapeListingPublic),
    });
  } catch (e) {
    console.error('[public/listings] list error:', e.message);
    publicError(res, 500, 'server_error', e.message);
  }
});

router.get('/:nickname', attachApiClient, requireScope('listings:read'), async (req, res) => {
  try {
    // Look up by nickname OR guesty_id (both unique). Lets callers use
    // whichever they have without a second lookup.
    const key = String(req.params.nickname || '').trim();
    if (!key) return publicError(res, 400, 'invalid_request', 'nickname required');
    const { rows } = await query(
      `SELECT * FROM guesty_listings
         WHERE tenant_id = $1
           AND (nickname = $2 OR guesty_id = $2)
         LIMIT 1`,
      [req.apiClient.tenantId, key],
    );
    if (rows.length === 0) {
      return publicError(res, 404, 'not_found', 'no listing with that nickname or id');
    }
    sendWithEtag(req, res, { listing: shapeListingPublic(rows[0]) });
  } catch (e) {
    console.error('[public/listings] detail error:', e.message);
    publicError(res, 500, 'server_error', e.message);
  }
});

module.exports = router;
