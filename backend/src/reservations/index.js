'use strict';

// /api/reservations — FAD-native + Guesty-cache merged surface.
//
// Phase 1 architecture per v0.2 LOCKED scoping pack (Notion
// 34f43ca884928188a83ad290b1a13b1b): Reservations are read-from-Guesty
// with a FAD-native overlay for fields the system needs but Guesty
// doesn't carry (cleaning_arrangement, special_requests, internal_notes,
// driver assignment, planned-vs-actual, refund state).
//
// Routes:
//   GET    /                          — list, merged + deduped
//   GET    /inquiries                 — first-class inquiries (scoping §9)
//   POST   /inquiries                 — create inquiry
//   PATCH  /inquiries/:id             — update inquiry (status, quote, notes)
//   POST   /inquiries/:id/convert     — convert to reservation
//   POST   /sync                      — admin manual Guesty re-sync
//   POST   /                          — manual create (Draft → Confirm)
//   GET    /:id                       — single, merged
//   PATCH  /:id                       — update overlay fields (cleaning_arrangement,
//                                       special_requests, driver, planned arrivals)
//   POST   /:id/cancel                — FAD-side cancel + "Update Guesty" task
//   GET    /:id/activity              — FAD-native activity log

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');
const { syncReservationsForTenant } = require('./sync');
const { inferReservationFinancials, majorToMinor } = require('./financials');

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const reservationDedupePartitionSql = `COALESCE(
  CASE
    WHEN COALESCE(NULLIF(LOWER(TRIM(l.nickname)), ''), NULLIF(LOWER(TRIM(r.listing_guesty_id)), '')) IS NOT NULL
     AND r.check_in_date IS NOT NULL
     AND r.check_out_date IS NOT NULL
     AND COALESCE(
       NULLIF(LOWER(TRIM(r.guest_email)), ''),
       NULLIF(LOWER(TRIM(CONCAT_WS(' ', r.guest_first_name, r.guest_last_name))), ''),
       NULLIF(LOWER(TRIM(r.guest_phone)), '')
     ) IS NOT NULL
    THEN CONCAT_WS(
      '|',
      COALESCE(NULLIF(LOWER(TRIM(l.nickname)), ''), NULLIF(LOWER(TRIM(r.listing_guesty_id)), '')),
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

// ────────────────────────────────────────────────────────────────
// Shape helpers
// ────────────────────────────────────────────────────────────────

function shapeMergedReservation(row) {
  if (!row) return null;
  const financials = inferReservationFinancials(row.raw);
  const inferredTotalMinor = majorToMinor(financials.total);
  const o = row.overlay_id ? {
    id: row.overlay_id,
    status: row.overlay_status,
    channel: row.overlay_channel,
    cleaning_arrangement: row.overlay_cleaning_arrangement,
    special_requests_categories: row.overlay_special_requests_categories,
    special_requests_notes: row.overlay_special_requests_notes,
    internal_notes: row.overlay_internal_notes,
    access_info_sent_at: row.overlay_access_info_sent_at,
    driver_assignee_user_id: row.overlay_driver_assignee_user_id,
    review_requested_at: row.overlay_review_requested_at,
    actual_arrival: row.overlay_actual_arrival,
    actual_departure: row.overlay_actual_departure,
    refund_amount_minor: row.overlay_refund_amount_minor,
    refund_currency: row.overlay_refund_currency,
    refund_reason: row.overlay_refund_reason,
    extension_of_reservation_id: row.overlay_extension_of_reservation_id,
    cancelled_at: row.overlay_cancelled_at,
    cancel_reason: row.overlay_cancel_reason,
    source_kind: row.overlay_source_kind,
    property_id: row.overlay_property_id,
  } : null;
  return {
    id: row.id,
    overlay_id: o?.id || null,
    guesty_id: row.guesty_id,
    listing_guesty_id: row.listing_guesty_id,
    listing_nickname: row.listing_nickname,
    property_id: o?.property_id || null,
    confirmation_code: row.confirmation_code,
    status: o?.status || row.status,
    source: row.source,
    channel: o?.channel || row.channel,
    check_in_date: row.check_in_date,
    check_out_date: row.check_out_date,
    nights: row.nights,
    guests_count: row.guests_count,
    party: { adults: row.adults, children: row.children, infants: row.infants },
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
    // FAD-native overlay fields
    cleaning_arrangement: o?.cleaning_arrangement || null,
    special_requests: {
      categories: Array.isArray(o?.special_requests_categories) ? o.special_requests_categories : [],
      notes: o?.special_requests_notes || '',
    },
    internal_notes: o?.internal_notes || null,
    access_info_sent_at: o?.access_info_sent_at || null,
    driver_assignee_user_id: o?.driver_assignee_user_id || null,
    review_requested_at: o?.review_requested_at || null,
    actual_arrival: o?.actual_arrival || null,
    actual_departure: o?.actual_departure || null,
    refund: o?.refund_amount_minor != null ? {
      amount_minor: Number(o.refund_amount_minor),
      currency: o.refund_currency,
      reason: o.refund_reason,
    } : null,
    extension_of_reservation_id: o?.extension_of_reservation_id || null,
    cancelled_at: o?.cancelled_at || null,
    cancel_reason: o?.cancel_reason || null,
    source_kind: o?.source_kind || 'guesty_pull',
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

const OVERLAY_SELECT = `
  o.id AS overlay_id,
  o.status AS overlay_status,
  o.channel AS overlay_channel,
  o.cleaning_arrangement AS overlay_cleaning_arrangement,
  o.special_requests_categories AS overlay_special_requests_categories,
  o.special_requests_notes AS overlay_special_requests_notes,
  o.internal_notes AS overlay_internal_notes,
  o.access_info_sent_at AS overlay_access_info_sent_at,
  o.driver_assignee_user_id AS overlay_driver_assignee_user_id,
  o.review_requested_at AS overlay_review_requested_at,
  o.actual_arrival AS overlay_actual_arrival,
  o.actual_departure AS overlay_actual_departure,
  o.refund_amount_minor AS overlay_refund_amount_minor,
  o.refund_currency AS overlay_refund_currency,
  o.refund_reason AS overlay_refund_reason,
  o.extension_of_reservation_id AS overlay_extension_of_reservation_id,
  o.cancelled_at AS overlay_cancelled_at,
  o.cancel_reason AS overlay_cancel_reason,
  o.source_kind AS overlay_source_kind,
  o.property_id AS overlay_property_id
`;

// Resolve `:id` → reservations.id UUID. Auto-create overlay if there's
// a guesty_reservations row but no overlay yet.
async function resolveReservationId(tenantId, idOrGuestyId) {
  if (!idOrGuestyId) return null;
  const isUuid = UUID_RE.test(idOrGuestyId);
  if (isUuid) {
    const { rows } = await query(
      'SELECT id, guesty_id FROM reservations WHERE tenant_id = $1 AND id = $2 LIMIT 1',
      [tenantId, idOrGuestyId],
    );
    if (rows.length > 0) return { reservationId: rows[0].id, guestyId: rows[0].guesty_id };
    return null;
  }
  const existing = await query(
    'SELECT id, guesty_id FROM reservations WHERE tenant_id = $1 AND guesty_id = $2 LIMIT 1',
    [tenantId, idOrGuestyId],
  );
  if (existing.rows.length > 0) {
    return { reservationId: existing.rows[0].id, guestyId: existing.rows[0].guesty_id };
  }
  // No overlay — materialise from guesty_reservations cache.
  const cache = await query(
    `SELECT guesty_id, listing_guesty_id, confirmation_code, status, channel
       FROM guesty_reservations
      WHERE tenant_id = $1 AND guesty_id = $2 LIMIT 1`,
    [tenantId, idOrGuestyId],
  );
  if (cache.rows.length === 0) return null;
  const g = cache.rows[0];
  const insert = await query(
    `INSERT INTO reservations
       (tenant_id, guesty_id, confirmation_code, status, channel, source_kind)
     VALUES ($1, $2, $3, $4, $5, 'guesty_pull')
     ON CONFLICT (tenant_id, guesty_id) DO NOTHING
     RETURNING id, guesty_id`,
    [tenantId, g.guesty_id, g.confirmation_code, g.status, g.channel],
  );
  if (insert.rows.length === 0) {
    const again = await query(
      'SELECT id, guesty_id FROM reservations WHERE tenant_id = $1 AND guesty_id = $2 LIMIT 1',
      [tenantId, idOrGuestyId],
    );
    return again.rows.length > 0
      ? { reservationId: again.rows[0].id, guestyId: again.rows[0].guesty_id }
      : null;
  }
  return { reservationId: insert.rows[0].id, guestyId: insert.rows[0].guesty_id };
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

// ────────────────────────────────────────────────────────────────
// List
// ────────────────────────────────────────────────────────────────

router.get('/', attachIdentity, async (req, res) => {
  try {
    const filters = ['r.tenant_id = $1'];
    const params = [req.tenantId];
    let i = 2;
    if (typeof req.query.status === 'string') {
      filters.push(`COALESCE(o.status, r.status) = $${i++}`);
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
          LEFT JOIN guesty_listings l
            ON l.tenant_id = r.tenant_id AND l.guesty_id = r.listing_guesty_id
          LEFT JOIN reservations o
            ON o.tenant_id = r.tenant_id AND o.guesty_id = r.guesty_id
          WHERE ${filters.join(' AND ')}
       )
       SELECT r.*, l.nickname AS listing_nickname,
              ${OVERLAY_SELECT},
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
       LEFT JOIN reservations o
         ON o.tenant_id = r.tenant_id AND o.guesty_id = r.guesty_id
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
    res.json({ reservations: rows.map(shapeMergedReservation) });
  } catch (e) {
    console.error('[reservations] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────────────────
// Inquiries — first-class workflow (scoping §9)
// Must come BEFORE /:id catch-all
// ────────────────────────────────────────────────────────────────

router.get('/inquiries', attachIdentity, async (req, res) => {
  try {
    const filters = ['tenant_id = $1'];
    const params = [req.tenantId];
    let i = 2;
    if (typeof req.query.status === 'string') {
      filters.push(`status = $${i++}`);
      params.push(req.query.status);
    }
    const { rows } = await query(
      `SELECT * FROM inquiries WHERE ${filters.join(' AND ')}
        ORDER BY created_at DESC LIMIT 200`,
      params,
    );
    res.json({ inquiries: rows });
  } catch (e) {
    console.error('[reservations] inquiries list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/inquiries', attachIdentity, async (req, res) => {
  const b = req.body || {};
  if (!b.guestName) return res.status(400).json({ error: 'guestName required' });
  try {
    const { rows } = await query(
      `INSERT INTO inquiries (
         tenant_id, guest_name, guest_email, guest_phone, source,
         property_codes, check_in, check_out,
         party_adults, party_children, party_infants,
         status, quote_link, quote_amount_minor, currency, notes,
         created_by_user_id
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6::jsonb, $7, $8,
         $9, $10, $11,
         $12, $13, $14, $15, $16,
         $17
       ) RETURNING *`,
      [
        req.tenantId, b.guestName.trim(), b.guestEmail || null, b.guestPhone || null,
        b.source || 'website',
        JSON.stringify(b.propertyCodes || []),
        b.checkIn || null, b.checkOut || null,
        b.partySize?.adults ?? 0, b.partySize?.children ?? 0, b.partySize?.infants ?? 0,
        b.status || 'pending_quote',
        b.quoteLink || null, b.quoteAmount != null ? Math.round(b.quoteAmount * 100) : null,
        b.currency || 'EUR', b.notes || null,
        req.identity?.userId || null,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('[reservations] inquiry create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/inquiries/:id', attachIdentity, async (req, res) => {
  const b = req.body || {};
  const sets = [];
  const params = [req.tenantId, req.params.id];
  let i = 3;
  if (typeof b.status === 'string') { sets.push(`status = $${i++}`); params.push(b.status); }
  if (typeof b.quoteLink === 'string') { sets.push(`quote_link = $${i++}`); params.push(b.quoteLink); }
  if (b.quoteAmount != null) { sets.push(`quote_amount_minor = $${i++}`); params.push(Math.round(b.quoteAmount * 100)); }
  if (typeof b.notes === 'string') { sets.push(`notes = $${i++}`); params.push(b.notes); }
  if (typeof b.abandonReason === 'string') { sets.push(`abandon_reason = $${i++}`); params.push(b.abandonReason); }
  if (sets.length === 0) return res.status(400).json({ error: 'no fields to update' });
  try {
    const { rows } = await query(
      `UPDATE inquiries SET ${sets.join(', ')}
        WHERE tenant_id = $1 AND id = $2 RETURNING *`,
      params,
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Inquiry not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('[reservations] inquiry patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/inquiries/:id/convert', attachIdentity, async (req, res) => {
  if (req.identity?.userRole !== 'admin') {
    return res.status(403).json({ error: 'admin role required' });
  }
  try {
    const { rows: inquiries } = await query(
      'SELECT * FROM inquiries WHERE tenant_id = $1 AND id = $2 LIMIT 1',
      [req.tenantId, req.params.id],
    );
    if (inquiries.length === 0) return res.status(404).json({ error: 'Inquiry not found' });
    const inq = inquiries[0];
    if (inq.status === 'converted' && inq.converted_to_reservation_id) {
      return res.status(409).json({ error: 'already converted', reservationId: inq.converted_to_reservation_id });
    }
    // Create the reservation in draft state (Phase 1: FAD-side only;
    // Phase 2: write-through to Guesty).
    const insert = await query(
      `INSERT INTO reservations (
         tenant_id, status, channel, source_kind, confirmation_code, created_by_user_id
       ) VALUES ($1, 'draft', 'direct', 'inquiry_conversion', $2, $3)
       RETURNING id`,
      [
        req.tenantId,
        `FR-INQ-${String(Date.now()).slice(-6)}`,
        req.identity?.userId || null,
      ],
    );
    const reservationId = insert.rows[0].id;
    await query(
      `UPDATE inquiries SET status = 'converted', converted_to_reservation_id = $1
        WHERE tenant_id = $2 AND id = $3`,
      [reservationId, req.tenantId, req.params.id],
    );
    await query(
      `INSERT INTO reservation_activity_log (tenant_id, reservation_id, kind, actor_id, detail, metadata)
       VALUES ($1, $2, 'created', $3, $4, $5::jsonb)`,
      [
        req.tenantId, reservationId,
        req.identity?.userId || null,
        `Converted from inquiry · ${inq.guest_name}`,
        JSON.stringify({ inquiry_id: inq.id }),
      ],
    );
    res.status(201).json({ ok: true, reservationId, inquiry: { ...inq, status: 'converted', converted_to_reservation_id: reservationId } });
  } catch (e) {
    console.error('[reservations] inquiry convert error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────────────────
// Sync (existing)
// ────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────
// Manual create — POST /
// ────────────────────────────────────────────────────────────────
// Phase 1: FAD-side only (Draft → Confirm gate per scoping §10).
// Phase 2: write-through to Guesty on confirm step.

router.post('/', attachIdentity, async (req, res) => {
  if (req.identity?.userRole !== 'admin') {
    return res.status(403).json({ error: 'admin role required' });
  }
  const b = req.body || {};
  const confirmStep = b.step === 'confirm';
  try {
    const { rows } = await query(
      `INSERT INTO reservations (
         tenant_id, status, channel, source_kind, confirmation_code,
         property_id, cleaning_arrangement,
         special_requests_categories, special_requests_notes, internal_notes,
         driver_assignee_user_id, actual_arrival, actual_departure,
         extension_of_reservation_id, created_by_user_id
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7,
         $8::jsonb, $9, $10,
         $11, $12, $13,
         $14, $15
       )
       RETURNING *`,
      [
        req.tenantId,
        confirmStep ? (b.status || 'confirmed') : 'draft',
        b.channel || 'direct',
        b.sourceKind || 'manual',
        b.confirmationCode || `FR-DIR-${String(Date.now()).slice(-6)}`,
        b.propertyId || null,
        b.cleaningArrangement || null,
        JSON.stringify(b.specialRequests?.categories || []),
        b.specialRequests?.notes || null,
        b.internalNotes || null,
        b.driverAssigneeUserId || null,
        b.actualArrival || null,
        b.actualDeparture || null,
        b.extensionOfReservationId || null,
        req.identity?.userId || null,
      ],
    );
    await query(
      `INSERT INTO reservation_activity_log (tenant_id, reservation_id, kind, actor_id, detail)
       VALUES ($1, $2, 'created', $3, $4)`,
      [
        req.tenantId, rows[0].id, req.identity?.userId || null,
        `Reservation ${confirmStep ? 'confirmed' : 'drafted'} manually · ${b.channel || 'direct'}`,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('[reservations] create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────────────────
// Single
// ────────────────────────────────────────────────────────────────

router.get('/:id', attachIdentity, async (req, res) => {
  try {
    const isUuid = UUID_RE.test(req.params.id);
    const where = isUuid ? 'o.id = $2' : 'r.guesty_id = $2 OR o.guesty_id = $2';
    const { rows } = await query(
      `SELECT r.*, l.nickname AS listing_nickname,
              ${OVERLAY_SELECT},
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
       LEFT JOIN reservations o
         ON o.tenant_id = r.tenant_id AND o.guesty_id = r.guesty_id
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
       WHERE r.tenant_id = $1 AND (${where})
       LIMIT 1`,
      [req.tenantId, req.params.id],
    );
    if (rows.length === 0) {
      // Maybe an overlay-only manual reservation (no Guesty cache row yet)
      const fallback = await query(
        `SELECT o.id AS overlay_id, o.id, o.guesty_id, o.confirmation_code, o.status,
                o.channel AS overlay_channel, o.source_kind AS overlay_source_kind,
                o.cleaning_arrangement AS overlay_cleaning_arrangement,
                o.special_requests_categories AS overlay_special_requests_categories,
                o.special_requests_notes AS overlay_special_requests_notes,
                o.internal_notes AS overlay_internal_notes,
                o.access_info_sent_at AS overlay_access_info_sent_at,
                o.driver_assignee_user_id AS overlay_driver_assignee_user_id,
                o.review_requested_at AS overlay_review_requested_at,
                o.actual_arrival AS overlay_actual_arrival,
                o.actual_departure AS overlay_actual_departure,
                o.refund_amount_minor AS overlay_refund_amount_minor,
                o.refund_currency AS overlay_refund_currency,
                o.refund_reason AS overlay_refund_reason,
                o.extension_of_reservation_id AS overlay_extension_of_reservation_id,
                o.cancelled_at AS overlay_cancelled_at,
                o.cancel_reason AS overlay_cancel_reason,
                o.property_id AS overlay_property_id,
                o.status AS overlay_status,
                o.created_at, o.updated_at AS synced_at,
                NULL::jsonb AS raw, NULL::text AS source,
                NULL::date AS check_in_date, NULL::date AS check_out_date,
                NULL::integer AS nights, NULL::integer AS guests_count,
                NULL::integer AS adults, NULL::integer AS children, NULL::integer AS infants,
                NULL::text AS guest_first_name, NULL::text AS guest_last_name,
                NULL::text AS guest_email, NULL::text AS guest_phone,
                NULL::bigint AS total_amount_minor, NULL::text AS currency_code,
                NULL::text AS listing_guesty_id, NULL::text AS listing_nickname,
                NULL::bigint AS calendar_nights_cached, NULL::bigint AS calendar_blocked_nights,
                NULL::bigint AS calendar_total_minor, NULL::bigint AS calendar_min_price_minor,
                NULL::bigint AS calendar_max_price_minor, NULL::text AS calendar_currency_code,
                NULL::timestamptz AS calendar_synced_at
           FROM reservations o
          WHERE o.tenant_id = $1 AND (${isUuid ? 'o.id = $2' : 'o.guesty_id = $2'})
          LIMIT 1`,
        [req.tenantId, req.params.id],
      );
      if (fallback.rows.length === 0) return res.status(404).json({ error: 'Reservation not found' });
      return res.json(shapeMergedReservation(fallback.rows[0]));
    }
    res.json(shapeMergedReservation(rows[0]));
  } catch (e) {
    console.error('[reservations] get error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────────────────
// Update overlay fields — PATCH /:id
// ────────────────────────────────────────────────────────────────

router.patch('/:id', attachIdentity, async (req, res) => {
  try {
    const resolved = await resolveReservationId(req.tenantId, req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Reservation not found' });
    const b = req.body || {};
    const sets = [];
    const params = [req.tenantId, resolved.reservationId];
    let i = 3;
    if (typeof b.cleaningArrangement === 'string' || b.cleaningArrangement === null) {
      sets.push(`cleaning_arrangement = $${i++}`);
      params.push(b.cleaningArrangement);
    }
    if (b.specialRequests) {
      if (Array.isArray(b.specialRequests.categories)) {
        sets.push(`special_requests_categories = $${i++}::jsonb`);
        params.push(JSON.stringify(b.specialRequests.categories));
      }
      if (typeof b.specialRequests.notes === 'string') {
        sets.push(`special_requests_notes = $${i++}`);
        params.push(b.specialRequests.notes);
      }
    }
    if (typeof b.internalNotes === 'string') {
      sets.push(`internal_notes = $${i++}`);
      params.push(b.internalNotes);
    }
    if (typeof b.driverAssigneeUserId === 'string' || b.driverAssigneeUserId === null) {
      sets.push(`driver_assignee_user_id = $${i++}`);
      params.push(b.driverAssigneeUserId);
    }
    if (b.accessInfoSentAt !== undefined) {
      sets.push(`access_info_sent_at = $${i++}`);
      params.push(b.accessInfoSentAt);
    }
    if (b.actualArrival !== undefined) {
      sets.push(`actual_arrival = $${i++}`);
      params.push(b.actualArrival);
    }
    if (b.actualDeparture !== undefined) {
      sets.push(`actual_departure = $${i++}`);
      params.push(b.actualDeparture);
    }
    if (b.reviewRequestedAt !== undefined) {
      sets.push(`review_requested_at = $${i++}`);
      params.push(b.reviewRequestedAt);
    }
    if (typeof b.status === 'string') {
      sets.push(`status = $${i++}`);
      params.push(b.status);
    }
    if (typeof b.propertyId === 'string' || b.propertyId === null) {
      sets.push(`property_id = $${i++}`);
      params.push(b.propertyId);
    }
    if (sets.length === 0) return res.status(400).json({ error: 'no fields to update' });
    const { rows } = await query(
      `UPDATE reservations SET ${sets.join(', ')}
        WHERE tenant_id = $1 AND id = $2 RETURNING *`,
      params,
    );
    // Log specific kinds for important fields
    if (b.driverAssigneeUserId) {
      await query(
        `INSERT INTO reservation_activity_log (tenant_id, reservation_id, kind, actor_id, detail)
         VALUES ($1, $2, 'driver_assigned', $3, $4)`,
        [req.tenantId, resolved.reservationId, req.identity?.userId || null,
         `Driver assigned · ${b.driverAssigneeUserId}`],
      );
    }
    if (b.accessInfoSentAt) {
      await query(
        `INSERT INTO reservation_activity_log (tenant_id, reservation_id, kind, actor_id, detail)
         VALUES ($1, $2, 'access_info_sent', $3, $4)`,
        [req.tenantId, resolved.reservationId, req.identity?.userId || null,
         'Access codes + welcome message sent'],
      );
    }
    if (b.specialRequests) {
      await query(
        `INSERT INTO reservation_activity_log (tenant_id, reservation_id, kind, actor_id, detail)
         VALUES ($1, $2, 'special_request_added', $3, $4)`,
        [req.tenantId, resolved.reservationId, req.identity?.userId || null,
         `Special requests updated · ${(b.specialRequests.categories || []).join(', ') || 'notes only'}`],
      );
    }
    res.json(rows[0]);
  } catch (e) {
    console.error('[reservations] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────────────────
// Cancel — POST /:id/cancel
// ────────────────────────────────────────────────────────────────
// Phase 1 per scoping §10: FAD-side state flip + activity log. Owner
// notification already fired from Guesty earlier; this is the FAD-side
// record + an audit trail for the "Update Guesty manually" task that
// ops will do until Phase 2 write-through ships.

router.post('/:id/cancel', attachIdentity, async (req, res) => {
  if (req.identity?.userRole !== 'admin') {
    return res.status(403).json({ error: 'admin role required' });
  }
  try {
    const resolved = await resolveReservationId(req.tenantId, req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Reservation not found' });
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE reservations
          SET status = 'cancelled',
              cancelled_at = NOW(),
              cancelled_by_user_id = $3,
              cancel_reason = $4
        WHERE tenant_id = $1 AND id = $2
        RETURNING *`,
      [req.tenantId, resolved.reservationId, req.identity?.userId || null, b.reason || null],
    );
    await query(
      `INSERT INTO reservation_activity_log (tenant_id, reservation_id, kind, actor_id, detail)
       VALUES ($1, $2, 'cancelled', $3, $4)`,
      [
        req.tenantId, resolved.reservationId, req.identity?.userId || null,
        `Cancelled · ${b.reason || 'no reason given'} · Phase 1: FAD-side only, ops must push to Guesty manually`,
      ],
    );
    res.json({ ok: true, reservation: rows[0] });
  } catch (e) {
    console.error('[reservations] cancel error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────────────────
// Activity log
// ────────────────────────────────────────────────────────────────

router.get('/:id/activity', attachIdentity, async (req, res) => {
  try {
    const resolved = await resolveReservationId(req.tenantId, req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Reservation not found' });
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100;
    const { rows } = await query(
      `SELECT id, kind, actor_id, detail, metadata, ts
         FROM reservation_activity_log
        WHERE tenant_id = $1 AND reservation_id = $2
        ORDER BY ts DESC
        LIMIT ${limit}`,
      [req.tenantId, resolved.reservationId],
    );
    res.json({ activity: rows });
  } catch (e) {
    console.error('[reservations] activity error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports._test = {
  appendReservationDateFilters,
  reservationDedupePartitionSql,
};
