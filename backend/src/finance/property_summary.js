'use strict';

// /api/finance/property/:code/summary — per-property finance aggregation.
//
// Phase 3 (T1.11 + Financial tab wiring). Aggregates revenue from
// guesty_reservations (joined via listing_guesty_id → fad_properties.code)
// and expenses from the expenses table (joined via property_code).
//
// Window default: 90 days back from today, by check_in_date.
//
// Heuristics (v1 — pragmatic estimates, replaceable when Finance Phase 2
// lands real channel fee + commission data):
//   channel_fees_minor   = 0  (not tracked in guesty_reservations cache)
//   net_to_owner_minor   = revenue - expenses_minor (approximate; subtracts
//                          captured expenses but ignores PMC commission +
//                          channel fees because the cache doesn't carry them)
//   friday_margin_minor  = 0  (same — needs Finance Phase 2)
//   occupancy_pct        = booked_nights / window_nights × 100, capped 100
//   adr_minor            = revenue_minor / booked_nights (NULL if 0 nights)
//
// Currency: derived from the reservations' currency_code (mode); falls
// back to EUR. Mixed-currency portfolios beyond v1.

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');

const router = express.Router();

router.get('/property/:code/summary', attachIdentity, async (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) return res.status(400).json({ error: 'code required' });

  const windowDays = Math.min(Math.max(Number(req.query.windowDays) || 90, 7), 365);
  const windowFromIso = new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10);
  const windowToIso = new Date().toISOString().slice(0, 10);

  try {
    // Resolve property by code (FAD-native) → guesty_id (for the
    // reservations join via listing_guesty_id).
    const propRes = await query(
      `SELECT id, guesty_id FROM fad_properties
        WHERE tenant_id = $1 AND code = $2 LIMIT 1`,
      [req.tenantId, code],
    );
    const guestyId = propRes.rows[0]?.guesty_id || null;

    // Revenue aggregation. Only reservations with a non-null check_in
    // date in the window contribute.
    let revenue = { revenue_minor: 0, reservation_count: 0, booked_nights: 0, currency: 'EUR' };
    if (guestyId) {
      const revRes = await query(
        `SELECT
           COALESCE(SUM(r.total_amount_minor), 0)::bigint AS revenue_minor,
           COUNT(*)::int AS reservation_count,
           COALESCE(SUM(GREATEST(r.check_out_date - r.check_in_date, 0)), 0)::int AS booked_nights,
           (
             SELECT r2.currency_code FROM guesty_reservations r2
              WHERE r2.tenant_id = $1
                AND r2.listing_guesty_id = $2
                AND r2.check_in_date >= $3::date
                AND r2.check_in_date <= $4::date
                AND r2.currency_code IS NOT NULL
              GROUP BY r2.currency_code
              ORDER BY COUNT(*) DESC LIMIT 1
           ) AS currency
         FROM guesty_reservations r
         WHERE r.tenant_id = $1
           AND r.listing_guesty_id = $2
           AND r.check_in_date >= $3::date
           AND r.check_in_date <= $4::date
           AND COALESCE(r.status, 'confirmed') NOT IN ('canceled', 'cancelled')`,
        [req.tenantId, guestyId, windowFromIso, windowToIso],
      );
      const row = revRes.rows[0] || {};
      revenue = {
        revenue_minor: Number(row.revenue_minor || 0),
        reservation_count: Number(row.reservation_count || 0),
        booked_nights: Number(row.booked_nights || 0),
        currency: row.currency || 'EUR',
      };
    }

    // Expense aggregation. Always available (no guesty_id required).
    const expRes = await query(
      `SELECT
         COALESCE(SUM(amount_minor) FILTER (WHERE currency = 'MUR'), 0)::bigint AS expenses_minor_mur,
         COALESCE(SUM(amount_minor) FILTER (WHERE currency = 'EUR'), 0)::bigint AS expenses_minor_eur,
         COUNT(*)::int AS expense_count
       FROM expenses
       WHERE tenant_id = $1
         AND property_code = $2
         AND created_at >= $3::date
         AND created_at <= ($4::date + INTERVAL '1 day')`,
      [req.tenantId, code, windowFromIso, windowToIso],
    );
    const exp = expRes.rows[0] || {};
    // Pragmatic: report expenses in the dominant revenue currency.
    // If revenue is EUR and expenses are MUR, convert at 44 MUR/EUR
    // (matches PROD-CONFIG-1 placeholder until Finance Phase 2 lands
    // a live FX rate).
    const expensesMinor = revenue.currency === 'MUR'
      ? Number(exp.expenses_minor_mur || 0) + Math.round(Number(exp.expenses_minor_eur || 0) * 44)
      : Number(exp.expenses_minor_eur || 0) + Math.round(Number(exp.expenses_minor_mur || 0) / 44);

    const windowNights = Math.max(windowDays, 1);
    const occupancyPct = revenue.booked_nights > 0
      ? Math.min(100, Math.round((revenue.booked_nights / windowNights) * 100))
      : 0;
    const adrMinor = revenue.booked_nights > 0
      ? Math.round(revenue.revenue_minor / revenue.booked_nights)
      : null;
    const revparMinor = windowNights > 0
      ? Math.round(revenue.revenue_minor / windowNights)
      : null;
    const netToOwnerMinor = Math.max(revenue.revenue_minor - expensesMinor, 0);

    res.json({
      property_code: code,
      revenue_minor: revenue.revenue_minor,
      channel_fees_minor: 0,
      expenses_minor: expensesMinor,
      expense_count: Number(exp.expense_count || 0),
      net_to_owner_minor: netToOwnerMinor,
      friday_margin_minor: 0,
      reservation_count: revenue.reservation_count,
      booked_nights: revenue.booked_nights,
      window_nights: windowNights,
      occupancy_pct: occupancyPct,
      adr_minor: adrMinor,
      revpar_minor: revparMinor,
      currency: revenue.currency,
      window_from: windowFromIso,
      window_to: windowToIso,
      // Provenance hint for the UI.
      data_quality: {
        revenue_source: guestyId ? 'guesty_reservations' : 'no_guesty_id',
        expenses_source: 'expenses',
        channel_fees_source: 'phase_2_pending',
      },
    });
  } catch (e) {
    console.error('[finance/property-summary] failed:', e.message);
    res.status(500).json({ error: 'Failed to compute summary' });
  }
});

module.exports = router;
