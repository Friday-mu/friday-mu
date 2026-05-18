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

// Numeric coercion for jsonb-extracted values (jsonb scalars come out
// as strings via `->>`). Returns null for null / undefined / NaN.
function num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Shape the photos[] payload Guesty stores. Each entry has
// `original` (full-res), `thumbnail` (~240h), and optional `caption`.
// We expose: { url, thumbnailUrl?, alt? } to match the website's
// gallery contract per FAD-HANDOFF 2026-05-18.
function shapeGallery(rawPictures) {
  if (!Array.isArray(rawPictures)) return [];
  return rawPictures
    .map((p) => {
      if (!p || typeof p !== 'object') return null;
      const url = p.original || p.url || p.thumbnail;
      if (!url) return null;
      const out = { url };
      if (p.thumbnail && p.thumbnail !== url) out.thumbnailUrl = p.thumbnail;
      if (p.caption && String(p.caption).trim()) out.alt = String(p.caption).trim();
      return out;
    })
    .filter(Boolean);
}

// Guesty stores houseRules as a single multi-line string. Website
// expects string[] of individual rules. Split on newline, trim,
// drop empties. Preserves order.
function splitHouseRules(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

// Shape the website's GuestyListingDTO maps to. Per their 2026-05-18
// reply (FAD-REPLY-STAGE1.md): renames + unit conversions stay on
// their side, FAD keeps the cleaner names. The bottom block reads from
// the `raw` JSONB — these fields aren't projected into dedicated
// columns yet, but the poller stores the full Guesty payload so we
// have them. A later migration can promote them out of `raw` for
// indexability if it becomes load-bearing.
//
// Money field convention:
// - basePriceMinor: minor units (cents) — preserved from the
//   `base_price_minor` column populated by the poller.
// - cleaningFee / extraPersonFee: whatever Guesty stores in prices.*
//   (typically major units in the listing's currency_code). Website
//   normalises on their side.
//
// Factor fields (weeklyPriceFactor, monthlyPriceFactor) are decimals,
// e.g. 0.85 = 15% discount applied to the long-stay total.
function shapeListingPublic(row) {
  if (!row) return null;
  const raw = row.raw || {};
  const prices = raw.prices || {};
  const terms = raw.terms || {};
  const address = raw.address || {};
  const pubDesc = raw.publicDescription || {};
  return {
    id: row.id,
    guestyId: row.guesty_id,
    nickname: row.nickname,
    title: row.title,

    // Address: keep the existing { full, city, country } structure
    // and add street / zipcode / state for the website's map + form
    // rendering. Coordinates from raw.address.lat/lng so the website
    // can place pins without geocoding.
    address: {
      full: row.address_full,
      city: row.address_city,
      country: row.address_country,
      street: address.street || null,
      zipcode: address.zipcode || null,
      state: address.state || null,
    },
    lat: num(address.lat),
    lng: num(address.lng),

    cohort: row.cohort,
    pictureUrl: row.picture_url,
    // gallery is the full photo set — website renders the carousel
    // from this; pictureUrl stays as the lead-thumbnail shortcut.
    gallery: shapeGallery(raw.pictures),

    propertyType: row.property_type,
    roomType: raw.roomType || null,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms != null ? Number(row.bathrooms) : null,
    beds: num(raw.beds),
    accommodates: row.accommodates,

    // Money + terms (Stage 1 field-gap close)
    basePriceMinor: row.base_price_minor != null ? Number(row.base_price_minor) : null,
    cleaningFee: num(prices.cleaningFee),
    extraPersonFee: num(prices.extraPersonFee),
    guestsIncludedInRegularFee: num(prices.guestsIncludedInRegularFee),
    weeklyPriceFactor: num(prices.weeklyPriceFactor),
    monthlyPriceFactor: num(prices.monthlyPriceFactor),
    minNights: num(terms.minNights),
    maxNights: num(terms.maxNights),
    currencyCode: row.currency_code,

    // Editorial fields for the public-site copy. description / summary
    // alias the same Guesty field for now; if you need them to diverge
    // later (e.g. description = summary + space concatenated) tweak
    // here. space stays as Guesty's standalone field.
    description: pubDesc.summary || null,
    summary: pubDesc.summary || null,
    space: pubDesc.space || null,

    // amenities[] is already a clean string[] in Guesty. Pass through.
    amenities: Array.isArray(raw.amenities) ? raw.amenities : [],

    // houseRules: Guesty stores newline-separated string. Split for
    // the website's list rendering.
    houseRules: splitHouseRules(pubDesc.houseRules),

    // Check-in/out times — strings like "14:00" / "10:00".
    checkInTime: raw.defaultCheckInTime || null,
    checkOutTime: raw.defaultCheckOutTime || null,

    // Reviews — Guesty doesn't populate these for all listings yet,
    // so they often come through null. Website should treat null/0
    // as "no rating yet" rather than "0 stars."
    reviewsCount: num(raw.reviewsCount),
    reviewsAvg: num(raw.reviewsAvgRating),

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
