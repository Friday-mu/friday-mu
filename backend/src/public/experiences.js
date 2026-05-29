'use strict';

// GET /api/public/experiences?channel=friday.mu|friday.travel&country=MU
//
// FAD experiences supply hub. One normalized catalog (ingested from Bokun
// today; Viator/RateHawk later) fanned out to the right front-ends via the
// `channels` routing array — a site only ever sees experiences published to
// it (channels @> [channel]). Mirrors /api/public/listings: OAuth
// client-credentials JWT, scope listings:read (same token mint as residences,
// so existing website creds work — see experiences-supply-routing.md open-Q1),
// ETag + Cache-Control per ADR-004.
//
// GUEST-PURE: provider / provider_id / status / channels never enter the
// response. Guests see "Friday" inventory only.

const express = require('express');
const crypto = require('crypto');
const { query } = require('../database/client');
const { attachApiClient, requireScope } = require('../auth/api_clients');

// Per the website-side fadFetch contract: every public-API error response
// includes { error, message, request_id } for cross-side debug joins.
function publicError(res, status, code, message) {
  return res.status(status).json({
    error: code,
    message: message || code,
    request_id: crypto.randomUUID(),
  });
}

// Experiences change rarely (refreshed by the ingestion job, not per-request),
// so cache like listings: ETag from payload hash + 5-min edge TTL.
function sendWithEtag(req, res, payload) {
  const json = JSON.stringify(payload);
  const etag = `"${crypto.createHash('sha256').update(json).digest('base64').slice(0, 24)}"`;
  res.set('ETag', etag);
  res.set('Cache-Control', 'public, max-age=300');
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  return res.type('application/json').send(json);
}

const VALID_CHANNELS = new Set(['friday.mu', 'friday.travel']);

// Provider-agnostic, guest-safe row. provider/provider_id/status/channels are
// deliberately omitted — they are FAD-internal routing/provenance, never guest.
function shapeExperiencePublic(row) {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    area: row.area,
    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
    category: row.category,
    durationText: row.duration_text,
    priceFromEur: row.price_from_eur != null ? Number(row.price_from_eur) : null,
    instant: row.instant === true,
    rating: row.rating != null ? Number(row.rating) : null,
    reviewCount: row.review_count != null ? Number(row.review_count) : 0,
    blurb: row.blurb,
    description: row.description,
    photos: Array.isArray(row.photos) ? row.photos : [],
    bookMode: row.book_mode || 'api',
    redirectUrl: row.redirect_url || null,
  };
}

const router = express.Router();

router.get('/', attachApiClient, requireScope('listings:read'), async (req, res) => {
  try {
    const channel = String(req.query.channel || '').trim();
    if (!VALID_CHANNELS.has(channel)) {
      return publicError(res, 400, 'invalid_request', "channel is required and must be 'friday.mu' or 'friday.travel'");
    }
    const params = [req.apiClient.tenantId, channel];
    let sql = `SELECT * FROM experiences
                WHERE tenant_id = $1
                  AND status = 'active'
                  AND channels @> ARRAY[$2]::text[]`;
    if (req.query.country) {
      params.push(String(req.query.country).trim().toUpperCase());
      sql += ` AND country = $${params.length}`;
    }
    // Stable, sensible default order: rated experiences first (by rating), then name.
    sql += ` ORDER BY (rating IS NULL), rating DESC NULLS LAST, name ASC`;

    // Optional pagination (forward-compat for when Viator/RateHawk volume lands).
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 0, 0), 200);
    if (limit > 0) {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      params.push(limit, (page - 1) * limit);
      sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
    }

    const { rows } = await query(sql, params);
    // Single named-key envelope, matching the listings contract (no generic wrapper).
    sendWithEtag(req, res, { experiences: rows.map(shapeExperiencePublic) });
  } catch (e) {
    console.error('[public/experiences] list error:', e.message);
    publicError(res, 500, 'server_error', e.message);
  }
});

module.exports = router;
