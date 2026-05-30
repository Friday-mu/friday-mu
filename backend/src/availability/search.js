'use strict';

// /api/availability/search — find properties available across a date
// window for N guests.
//
// Phase 6 (T4.39) of the overnight autonomous run. Used by the Calendar
// toolbar's "Find availability" button + by the future quote builder.
//
// Logic:
//   * Window = check_in .. check_out (exclusive). nights = check_out - check_in.
//   * A property "fits" if guesty_listings.accommodates >= guests.
//   * Available nights = nights in window where guesty_calendar.is_available = TRUE.
//   * A property is "fully available" if available_nights == total_nights.
//   * "Partially available" properties are reported separately for context.
//
// Returns:
//   { matches: [...fully available], partial: [...partial], unavailable: [...zero] }

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');

const router = express.Router();

router.get('/search', attachIdentity, async (req, res) => {
  const from = String(req.query.from || '').slice(0, 10);
  const to = String(req.query.to || '').slice(0, 10);
  const guests = Math.max(1, Math.min(Number(req.query.guests) || 1, 30));
  const isoRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoRe.test(from) || !isoRe.test(to)) {
    return res.status(400).json({ error: 'from + to required as YYYY-MM-DD' });
  }
  if (from >= to) {
    return res.status(400).json({ error: 'to must be after from' });
  }

  try {
    // Resolve total nights inline for clarity.
    const nightsRes = await query(`SELECT ($1::date - $2::date) AS n`, [to, from]);
    const totalNights = Number(nightsRes.rows[0].n);

    // Per-property aggregate over the calendar window. Avoids returning
    // properties that have zero matching calendar rows by using
    // guesty_listings as the driving table.
    const { rows } = await query(
      `SELECT
         gl.guesty_id,
         gl.nickname,
         gl.title,
         gl.picture_url,
         gl.accommodates,
         gl.bedrooms,
         gl.cohort,
         gl.address_full,
         COALESCE(p.code, gl.nickname) AS code,
         COALESCE(SUM(CASE WHEN gc.is_available = TRUE THEN 1 ELSE 0 END), 0)::int AS available_nights,
         COALESCE(SUM(CASE WHEN gc.is_available = FALSE THEN 1 ELSE 0 END), 0)::int AS blocked_nights,
         COUNT(gc.date)::int AS cached_nights,
         COALESCE(AVG(gc.price_minor) FILTER (WHERE gc.price_minor IS NOT NULL), 0)::bigint AS nightly_avg_minor,
         COALESCE(SUM(gc.price_minor) FILTER (WHERE gc.is_available = TRUE), 0)::bigint AS total_minor,
         MAX(gc.currency_code) AS currency_code
       FROM guesty_listings gl
       LEFT JOIN fad_properties p
         ON p.tenant_id = gl.tenant_id AND p.guesty_id = gl.guesty_id
       LEFT JOIN guesty_calendar gc
         ON gc.tenant_id = gl.tenant_id
        AND gc.listing_guesty_id = gl.guesty_id
        AND gc.date >= $2::date
        AND gc.date < $3::date
       WHERE gl.tenant_id = $1
         AND gl.is_active = TRUE
         AND COALESCE(gl.accommodates, 0) >= $4
       GROUP BY gl.guesty_id, gl.nickname, gl.title, gl.picture_url,
                gl.accommodates, gl.bedrooms, gl.cohort, gl.address_full, p.code
       ORDER BY available_nights DESC, COALESCE(p.code, gl.nickname) ASC`,
      [req.tenantId, from, to, guests],
    );

    const matches = [];
    const partial = [];
    const unavailable = [];

    for (const r of rows) {
      const out = {
        property_code: r.code,
        guesty_id: r.guesty_id,
        nickname: r.nickname,
        title: r.title,
        picture_url: r.picture_url,
        accommodates: r.accommodates != null ? Number(r.accommodates) : null,
        bedrooms: r.bedrooms != null ? Number(r.bedrooms) : null,
        region: r.cohort,
        address_full: r.address_full,
        available_nights: Number(r.available_nights),
        total_nights: totalNights,
        nightly_avg_minor: Number(r.nightly_avg_minor || 0),
        total_minor: Number(r.total_minor || 0),
        currency_code: r.currency_code || 'EUR',
        cached_nights: Number(r.cached_nights || 0),
      };
      if (out.cached_nights === 0) {
        // Calendar hasn't been synced for this property — can't make a
        // confident statement either way. Flag as 'cache_missing'.
        unavailable.push({ ...out, reason: 'cache_missing' });
      } else if (out.available_nights === totalNights) {
        matches.push(out);
      } else if (out.available_nights > 0) {
        partial.push(out);
      } else {
        unavailable.push({ ...out, reason: 'fully_blocked' });
      }
    }

    res.json({
      from,
      to,
      guests,
      total_nights: totalNights,
      matches,
      partial,
      unavailable,
      summary: {
        match_count: matches.length,
        partial_count: partial.length,
        unavailable_count: unavailable.length,
      },
    });
  } catch (e) {
    console.error('[availability] search failed:', e.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
