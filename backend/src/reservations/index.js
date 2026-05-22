'use strict';

// /api/reservations — read-only API over `guesty_reservations`.
// Same shape as /api/properties: list + get-by-guesty-id + manual
// re-sync. Joins guesty_listings inline so the list view can show
// the listing nickname without a second round-trip.

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');
const { syncReservationsForTenant } = require('./sync');
const { inferReservationFinancials, majorToMinor } = require('./financials');

const router = express.Router();

const reservationDedupePartitionSql = `COALESCE(
  CASE
    WHEN NULLIF(LOWER(TRIM(r.listing_guesty_id)), '') IS NOT NULL
     AND r.check_in_date IS NOT NULL
     AND r.check_out_date IS NOT NULL
     AND COALESCE(
       NULLIF(LOWER(TRIM(r.guest_email)), ''),
       NULLIF(LOWER(TRIM(CONCAT_WS(' ', r.guest_first_name, r.guest_last_name))), ''),
       NULLIF(LOWER(TRIM(r.guest_phone)), '')
     ) IS NOT NULL
    THEN CONCAT_WS(
      '|',
      LOWER(TRIM(r.listing_guesty_id)),
      r.check_in_date::text,
      r.check_out_date::text,
      COALESCE(
        NULLIF(LOWER(TRIM(r.guest_email)), ''),
        NULLIF(LOWER(TRIM(CONCAT_WS(' ', r.guest_first_name, r.guest_last_name))), ''),
        NULLIF(LOWER(TRIM(r.guest_phone)), '')
      )
    )
    ELSE NULL
  END,
  NULLIF(LOWER(TRIM(r.confirmation_code)), ''),
  r.guesty_id
)`;

function shapeReservation(row) {
  if (!row) return null;
  const financials = inferReservationFinancials(row.raw);
  const inferredTotalMinor = majorToMinor(financials.total);
  return {
    id: row.id,
    guesty_id: row.guesty_id,
    listing_guesty_id: row.listing_guesty_id,
    listing_nickname: row.listing_nickname, // joined
    confirmation_code: row.confirmation_code,
    status: row.status,
    source: row.source,
    channel: row.channel,
    check_in_date: row.check_in_date,
    check_out_date: row.check_out_date,
    nights: row.nights,
    guests_count: row.guests_count,
    party: {
      adults: row.adults,
      children: row.children,
      infants: row.infants,
    },
    guest: {
      first_name: row.guest_first_name,
      last_name: row.guest_last_name,
      email: row.guest_email,
      phone: row.guest_phone,
    },
    total_amount_minor: inferredTotalMinor ?? (row.total_amount_minor != null ? Number(row.total_amount_minor) : null),
    amount_paid: financials.amountPaid,
    outstanding_balance: financials.balanceDue,
    payment_status: financials.paymentStatus ? String(financials.paymentStatus) : null,
    currency_code: financials.currency || row.currency_code,
    calendar_pricing: {
      nights_cached: row.calendar_nights_cached != null ? Number(row.calendar_nights_cached) : 0,
      blocked_nights: row.calendar_blocked_nights != null ? Number(row.calendar_blocked_nights) : 0,
      total_minor: row.calendar_total_minor != null ? Number(row.calendar_total_minor) : null,
      min_price_minor: row.calendar_min_price_minor != null ? Number(row.calendar_min_price_minor) : null,
      max_price_minor: row.calendar_max_price_minor != null ? Number(row.calendar_max_price_minor) : null,
      currency_code: row.calendar_currency_code || row.currency_code,
      synced_at: row.calendar_synced_at || null,
    },
    synced_at: row.synced_at,
  };
}

function appendReservationDateFilters(queryParams, filters, params, startIndex) {
  let i = startIndex;
  const overlapMode = queryParams?.date_mode === 'overlap';

  if (overlapMode) {
    if (typeof queryParams.from === 'string') {
      filters.push(`r.check_out_date >= $${i++}`);
      params.push(queryParams.from);
    }
    if (typeof queryParams.to === 'string') {
      filters.push(`r.check_in_date <= $${i++}`);
      params.push(queryParams.to);
    }
    return i;
  }

  if (typeof queryParams?.from === 'string') {
    filters.push(`r.check_in_date >= $${i++}`);
    params.push(queryParams.from);
  }
  if (typeof queryParams?.to === 'string') {
    filters.push(`r.check_in_date <= $${i++}`);
    params.push(queryParams.to);
  }
  return i;
}

// GET / — list reservations.
//   ?status=reserved|confirmed|canceled
//   ?listing=<guesty_id>
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD   filter by check_in_date range
//   ?date_mode=overlap               use cached stay overlap for schedule overlays
//   ?upcoming=true                   shortcut: check_in_date >= today
//   ?limit=N (default 200, max 500)
router.get('/', attachIdentity, async (req, res) => {
  try {
    const filters = ['r.tenant_id = $1'];
    const params = [req.tenantId];
    let i = 2;
    if (typeof req.query.status === 'string') {
      filters.push(`r.status = $${i++}`);
      params.push(req.query.status);
    }
    if (typeof req.query.listing === 'string') {
      filters.push(`r.listing_guesty_id = $${i++}`);
      params.push(req.query.listing);
    }
    i = appendReservationDateFilters(req.query, filters, params, i);
    if (req.query.upcoming === 'true') {
      filters.push('r.check_in_date >= CURRENT_DATE');
    }
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;
    const { rows } = await query(
      `WITH ranked AS (
         SELECT r.*,
                ROW_NUMBER() OVER (
                  PARTITION BY r.tenant_id, ${reservationDedupePartitionSql}
                  ORDER BY
                    CASE
                      WHEN r.source = 'scrape-l3' OR r.guesty_id LIKE 'scrape:%' THEN 1
                      ELSE 0
                    END,
                    CASE WHEN NULLIF(TRIM(r.confirmation_code), '') IS NULL THEN 1 ELSE 0 END,
                    CASE WHEN r.total_amount_minor IS NULL THEN 1 ELSE 0 END,
                    CASE WHEN r.guest_email IS NULL THEN 1 ELSE 0 END,
                    r.updated_at DESC NULLS LAST,
                    r.created_at DESC NULLS LAST
                ) AS reservation_rank
           FROM guesty_reservations r
          WHERE ${filters.join(' AND ')}
       )
       SELECT r.*, l.nickname AS listing_nickname,
              cal.nights_cached AS calendar_nights_cached,
              cal.blocked_nights AS calendar_blocked_nights,
              cal.total_minor AS calendar_total_minor,
              cal.min_price_minor AS calendar_min_price_minor,
              cal.max_price_minor AS calendar_max_price_minor,
              cal.currency_code AS calendar_currency_code,
              cal.synced_at AS calendar_synced_at
       FROM ranked r
       LEFT JOIN guesty_listings l
         ON l.tenant_id = r.tenant_id AND l.guesty_id = r.listing_guesty_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS nights_cached,
                COUNT(*) FILTER (WHERE gc.is_available = FALSE) AS blocked_nights,
                SUM(gc.price_minor) FILTER (WHERE gc.price_minor IS NOT NULL) AS total_minor,
                MIN(gc.price_minor) FILTER (WHERE gc.price_minor IS NOT NULL) AS min_price_minor,
                MAX(gc.price_minor) FILTER (WHERE gc.price_minor IS NOT NULL) AS max_price_minor,
                COALESCE(MIN(gc.currency_code) FILTER (WHERE gc.currency_code IS NOT NULL), r.currency_code) AS currency_code,
                MAX(gc.fetched_at) AS synced_at
           FROM guesty_calendar gc
          WHERE gc.tenant_id = r.tenant_id
            AND gc.listing_guesty_id = r.listing_guesty_id
            AND r.check_in_date IS NOT NULL
            AND r.check_out_date IS NOT NULL
            AND gc.date >= r.check_in_date
            AND gc.date < r.check_out_date
       ) cal ON TRUE
       WHERE r.reservation_rank = 1
       ORDER BY r.check_in_date ASC NULLS LAST, r.created_at ASC
       LIMIT ${limit}`,
      params,
    );
    res.json({ reservations: rows.map(shapeReservation) });
  } catch (e) {
    console.error('[reservations] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:guestyId', attachIdentity, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT r.*, l.nickname AS listing_nickname,
              cal.nights_cached AS calendar_nights_cached,
              cal.blocked_nights AS calendar_blocked_nights,
              cal.total_minor AS calendar_total_minor,
              cal.min_price_minor AS calendar_min_price_minor,
              cal.max_price_minor AS calendar_max_price_minor,
              cal.currency_code AS calendar_currency_code,
              cal.synced_at AS calendar_synced_at
       FROM guesty_reservations r
       LEFT JOIN guesty_listings l
         ON l.tenant_id = r.tenant_id AND l.guesty_id = r.listing_guesty_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS nights_cached,
                COUNT(*) FILTER (WHERE gc.is_available = FALSE) AS blocked_nights,
                SUM(gc.price_minor) FILTER (WHERE gc.price_minor IS NOT NULL) AS total_minor,
                MIN(gc.price_minor) FILTER (WHERE gc.price_minor IS NOT NULL) AS min_price_minor,
                MAX(gc.price_minor) FILTER (WHERE gc.price_minor IS NOT NULL) AS max_price_minor,
                COALESCE(MIN(gc.currency_code) FILTER (WHERE gc.currency_code IS NOT NULL), r.currency_code) AS currency_code,
                MAX(gc.fetched_at) AS synced_at
           FROM guesty_calendar gc
          WHERE gc.tenant_id = r.tenant_id
            AND gc.listing_guesty_id = r.listing_guesty_id
            AND r.check_in_date IS NOT NULL
            AND r.check_out_date IS NOT NULL
            AND gc.date >= r.check_in_date
            AND gc.date < r.check_out_date
       ) cal ON TRUE
       WHERE r.tenant_id = $1 AND r.guesty_id = $2`,
      [req.tenantId, req.params.guestyId],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Reservation not found' });
    res.json(shapeReservation(rows[0]));
  } catch (e) {
    console.error('[reservations] get error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/sync', attachIdentity, async (req, res) => {
  if (req.identity?.userRole !== 'admin') {
    return res.status(403).json({ error: 'admin role required' });
  }
  try {
    const opts = {};
    if (typeof req.body?.fromDate === 'string') opts.fromDate = req.body.fromDate;
    if (typeof req.body?.toDate === 'string') opts.toDate = req.body.toDate;
    if (Number.isFinite(req.body?.daysBack)) opts.daysBack = req.body.daysBack;
    if (Number.isFinite(req.body?.daysForward)) opts.daysForward = req.body.daysForward;
    const summary = await syncReservationsForTenant(req.tenantId, opts);
    res.json({ ok: true, ...summary });
  } catch (e) {
    console.error('[reservations] sync error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports._test = {
  appendReservationDateFilters,
  reservationDedupePartitionSql,
};
