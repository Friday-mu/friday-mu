'use strict';

// GET /api/public/availability
//
// Website-facing Guesty availability + nightly price bridge.
// The website should not call Guesty directly. FAD owns the Guesty
// credentials, shared token cache, and tenant scoping; friday.mu calls
// this endpoint with a short-lived public API JWT.

const express = require('express');
const crypto = require('crypto');
const { query } = require('../database/client');
const { attachApiClient, requireScope } = require('../auth/api_clients');
const {
  isoDate,
  daysBetween,
  eachDateBetween,
  extractCalendarDays,
  normalizeCalendar,
  normalizeCalendarRows,
  getCachedAvailability,
  refreshCalendarForListing,
} = require('../guesty_calendar');

const MAX_RANGE_DAYS = 370;

function publicError(res, status, code, message) {
  return res.status(status).json({
    error: code,
    message: message || code,
    request_id: crypto.randomUUID(),
  });
}

function sendWithEtag(req, res, payload, cacheSeconds) {
  const json = JSON.stringify(payload);
  const etag = `"${crypto.createHash('sha256').update(json).digest('base64').slice(0, 24)}"`;
  res.set('ETag', etag);
  res.set('Cache-Control', `public, max-age=${cacheSeconds}`);
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  return res.type('application/json').send(json);
}

async function loadListing(tenantId, listingId) {
  const { rows } = await query(
    `SELECT guesty_id, base_price_minor, raw
       FROM guesty_listings
      WHERE tenant_id = $1 AND guesty_id = $2 AND is_active = TRUE
      LIMIT 1`,
    [tenantId, listingId],
  );
  return rows[0] || null;
}

async function fallbackFromReservationCache({ tenantId, listingId, fromIso, toIso, listing }) {
  const { rows } = await query(
    `SELECT check_in_date::text AS check_in_date,
            check_out_date::text AS check_out_date,
            status
       FROM guesty_reservations
      WHERE tenant_id = $1
        AND listing_guesty_id = $2
        AND check_in_date < $4::date
        AND check_out_date > $3::date
        AND COALESCE(LOWER(status), '') NOT IN ('canceled', 'cancelled', 'declined', 'rejected')
      ORDER BY check_in_date ASC`,
    [tenantId, listingId, fromIso, toIso],
  );

  const blocked = new Set();
  for (const r of rows) {
    const start = r.check_in_date > fromIso ? r.check_in_date : fromIso;
    const end = r.check_out_date < toIso ? r.check_out_date : toIso;
    for (const d of eachDateBetween(start, end)) blocked.add(d);
  }

  const basePriceMinor = Number(listing?.base_price_minor);
  const basePrice = Number.isFinite(basePriceMinor)
    ? basePriceMinor / 100
    : Number(listing?.raw?.prices?.basePrice);
  const pricesByDate = {};
  if (Number.isFinite(basePrice)) {
    for (const d of eachDateBetween(fromIso, toIso)) pricesByDate[d] = basePrice;
  }
  return {
    availability: {
      blockedDates: [...blocked].sort(),
      pricesByDate,
    },
    source: 'reservation_cache',
  };
}

const router = express.Router();

router.get('/', attachApiClient, requireScope('availability:read'), async (req, res) => {
  const listingId = String(req.query.listingId || '').trim();
  const fromIso = String(req.query.from || '').trim();
  const toIso = String(req.query.to || '').trim();
  if (!listingId) return publicError(res, 400, 'invalid_request', 'listingId is required');
  if (!isoDate(fromIso) || !isoDate(toIso)) {
    return publicError(res, 400, 'invalid_request', 'from and to must be YYYY-MM-DD');
  }
  const rangeDays = daysBetween(fromIso, toIso);
  if (!Number.isFinite(rangeDays) || rangeDays <= 0) {
    return publicError(res, 400, 'invalid_request', 'to must be after from');
  }
  if (rangeDays > MAX_RANGE_DAYS) {
    return publicError(res, 400, 'invalid_request', `date range cannot exceed ${MAX_RANGE_DAYS} days`);
  }

  try {
    const listing = await loadListing(req.apiClient.tenantId, listingId);
    if (!listing) return publicError(res, 404, 'not_found', 'no active listing with that id');

    try {
      const cached = await getCachedAvailability({
        tenantId: req.apiClient.tenantId,
        listing,
        fromIso,
        toIso,
      });
      if (cached) {
        return sendWithEtag(req, res, {
          availability: cached.availability,
          source: 'guesty_calendar_cache',
        }, 300);
      }

      const refreshedRows = await refreshCalendarForListing({
        tenantId: req.apiClient.tenantId,
        listingId,
        fromIso,
        toIso,
      });
      return sendWithEtag(req, res, {
        availability: normalizeCalendarRows(refreshedRows, listing, fromIso, toIso),
        source: 'guesty_calendar',
      }, 300);
    } catch (e) {
      console.warn('[public/availability] Guesty calendar failed; using reservation cache:', e.message);
      const fallback = await fallbackFromReservationCache({
        tenantId: req.apiClient.tenantId,
        listingId,
        fromIso,
        toIso,
        listing,
      });
      return sendWithEtag(req, res, fallback, 60);
    }
  } catch (e) {
    console.error('[public/availability] error:', e.message);
    return publicError(res, 500, 'server_error', e.message);
  }
});

module.exports = {
  router,
  _test: {
    eachDateBetween,
    extractCalendarDays,
    normalizeCalendar,
    normalizeCalendarRows,
  },
};
