'use strict';

// /api/calendar/grid?from&to — per-property × per-day price + availability
// over a window. Powers the Multi-calendar v0.2 per-cell €PRICE chips.
//
// Pricing source: guesty_calendar (synced by the standard Guesty calendar
// worker). Cells where the cache has no row return {price_minor: null,
// available: null} so the UI can show a neutral state.

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');

const router = express.Router();

router.get('/grid', attachIdentity, async (req, res) => {
  const isoRe = /^\d{4}-\d{2}-\d{2}$/;
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  if (!isoRe.test(from) || !isoRe.test(to)) {
    return res.status(400).json({ error: 'from + to required as YYYY-MM-DD' });
  }
  if (from > to) return res.status(400).json({ error: 'to must be >= from' });

  try {
    const { rows } = await query(
      `SELECT
         gc.listing_guesty_id,
         gc.date::text AS date,
         gc.price_minor,
         gc.is_available,
         gc.currency_code
       FROM guesty_calendar gc
       WHERE gc.tenant_id = $1
         AND gc.date >= $2::date
         AND gc.date <= $3::date
       ORDER BY gc.listing_guesty_id, gc.date`,
      [req.tenantId, from, to],
    );

    // Bucket by listing_guesty_id → {date: {price_minor, available, currency}}
    const byListing = new Map();
    for (const r of rows) {
      const map = byListing.get(r.listing_guesty_id) || {};
      map[r.date] = {
        price_minor: r.price_minor != null ? Number(r.price_minor) : null,
        available: r.is_available,
        currency: r.currency_code || null,
      };
      byListing.set(r.listing_guesty_id, map);
    }

    const properties = Array.from(byListing.entries()).map(([listing_guesty_id, prices_by_date]) => ({
      listing_guesty_id,
      prices_by_date,
    }));

    res.json({
      window: { from, to },
      properties,
      cell_count: rows.length,
    });
  } catch (e) {
    console.error('[calendar/grid] failed:', e.message);
    res.status(500).json({ error: 'Grid query failed' });
  }
});

module.exports = router;
