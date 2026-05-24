'use strict';

// /api/analytics/* — Analytics Intelligence Core Phase 0 (per scoping
// pack 36a43ca884928165b886fc3043e399a0).
//
// Deterministic SQL aggregates over the existing Postgres data. No LLM,
// no Cube Core yet — those are Phases 1 + later (gated on Ishant's ack
// for infra). This route returns the tier-1 portfolio metrics that
// drive the Analytics Overview tab + per-module Insights snapshots.
//
// Routes:
//   GET /portfolio?windowDays=N   — portfolio summary (revenue,
//                                    occupancy, ADR, RevPAR, channel
//                                    mix, top properties, MoM trend)
//   GET /channel-mix?windowDays=N — channel revenue + commission breakdown
//   GET /occupancy-heatmap?...    — per-property × month occupancy grid

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');

const router = express.Router();

const ACTIVE_STATUS_FILTER = `COALESCE(r.status, 'confirmed') NOT IN ('canceled', 'cancelled')`;

function clampWindow(input, def = 30) {
  const n = Number(input);
  if (!Number.isFinite(n)) return def;
  return Math.max(1, Math.min(n, 365));
}

// ────────────────────────────────────────────────────────────────
// GET /portfolio — tier-1 KPIs + trend + top-N
// ────────────────────────────────────────────────────────────────
router.get('/portfolio', attachIdentity, async (req, res) => {
  const tenantId = req.tenantId;
  const windowDays = clampWindow(req.query.windowDays, 30);
  const windowFrom = new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10);
  const windowTo = new Date().toISOString().slice(0, 10);
  // Previous-period window for MoM-style comparison.
  const prevFrom = new Date(Date.now() - 2 * windowDays * 86400000).toISOString().slice(0, 10);
  const prevTo = windowFrom;

  try {
    // ─── KPI block: revenue, reservations, booked-nights, occupancy ───
    // Joined across all properties (active + paused). Occupancy denominator
    // = window_days × active_listings_count (listings, not units).
    const propertyCountRes = await query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active
       FROM guesty_listings WHERE tenant_id = $1`,
      [tenantId],
    );
    const activeProps = Number(propertyCountRes.rows[0]?.active || 0);
    const totalProps = Number(propertyCountRes.rows[0]?.total || 0);

    const kpiCurrent = await aggregateWindow(tenantId, windowFrom, windowTo);
    const kpiPrev = await aggregateWindow(tenantId, prevFrom, prevTo);

    // Available room-nights = window_days × active_listings (industry
    // standard denominator). With clipped booked_nights from the fixed
    // aggregator above, occupancy is now a real percentage that won't
    // run away to 100% on every popular property.
    const availableNights = windowDays * Math.max(activeProps, 1);
    const occupancyPct = availableNights > 0
      ? Math.min(100, Math.round((kpiCurrent.booked_nights / availableNights) * 100))
      : 0;
    const prevOccupancyPct = availableNights > 0
      ? Math.min(100, Math.round((kpiPrev.booked_nights / availableNights) * 100))
      : 0;
    // ADR = revenue per occupied room-night (only counts nights that
    // were actually sold).
    const adrMinor = kpiCurrent.booked_nights > 0
      ? Math.round(kpiCurrent.revenue_minor / kpiCurrent.booked_nights)
      : 0;
    const prevAdrMinor = kpiPrev.booked_nights > 0
      ? Math.round(kpiPrev.revenue_minor / kpiPrev.booked_nights)
      : 0;
    // RevPAR = revenue per available room-night (revenue ÷ all room-nights
    // including unsold). RevPAR = Occupancy × ADR by definition.
    const revparMinor = availableNights > 0
      ? Math.round(kpiCurrent.revenue_minor / availableNights)
      : 0;

    // ─── Channel mix (window) ───
    // Window-correct: stays overlapping the window contribute their
    // in-window nights + pro-rated revenue. Channel name normalised
    // (Airbnb / Booking.com / Direct / etc.) with COALESCE channel →
    // source fallback for scraped rows.
    const channelRes = await query(
      `WITH overlapping AS (
         SELECT
           CASE
             WHEN LOWER(COALESCE(NULLIF(r.channel, ''), r.source, '')) IN ('airbnb', 'airbnb2', 'airbnb-v2') THEN 'Airbnb'
             WHEN LOWER(COALESCE(NULLIF(r.channel, ''), r.source, '')) IN ('booking', 'bookingcom', 'booking.com', 'bdc') THEN 'Booking.com'
             WHEN LOWER(COALESCE(NULLIF(r.channel, ''), r.source, '')) IN ('vrbo', 'homeaway') THEN 'VRBO'
             WHEN LOWER(COALESCE(NULLIF(r.channel, ''), r.source, '')) IN ('direct', 'website', 'friday', 'friday-direct') THEN 'Direct'
             WHEN LOWER(COALESCE(NULLIF(r.channel, ''), r.source, '')) IN ('manual', 'phone', 'walk-in') THEN 'Manual'
             WHEN LOWER(COALESCE(NULLIF(r.channel, ''), r.source, '')) IN ('owner') THEN 'Owner'
             WHEN LOWER(COALESCE(NULLIF(r.channel, ''), r.source, '')) IN ('email') THEN 'Email'
             WHEN LOWER(COALESCE(NULLIF(r.channel, ''), r.source, '')) LIKE 'scrape%' THEN 'Scraped (legacy)'
             WHEN COALESCE(NULLIF(r.channel, ''), r.source, '') = '' THEN 'Unknown'
             ELSE INITCAP(COALESCE(NULLIF(r.channel, ''), r.source))
           END AS channel,
           GREATEST(LEAST(r.check_out_date, ($3::date + INTERVAL '1 day')::date) - GREATEST(r.check_in_date, $2::date), 0)::int AS nights_in_window,
           GREATEST(r.check_out_date - r.check_in_date, 0)::int AS total_stay_nights,
           r.total_amount_minor
         FROM guesty_reservations r
         WHERE r.tenant_id = $1
           AND r.check_in_date < ($3::date + INTERVAL '1 day')::date
           AND r.check_out_date > $2::date
           AND ${ACTIVE_STATUS_FILTER}
       )
       SELECT
         channel,
         COUNT(*) FILTER (WHERE nights_in_window > 0)::int AS reservation_count,
         COALESCE(SUM(
           CASE
             WHEN total_amount_minor IS NULL OR total_stay_nights = 0 THEN 0
             ELSE ROUND(total_amount_minor::numeric * nights_in_window / total_stay_nights)
           END
         ), 0)::bigint AS revenue_minor,
         COALESCE(SUM(nights_in_window), 0)::int AS booked_nights
       FROM overlapping
       GROUP BY channel
       ORDER BY reservation_count DESC`,
      [tenantId, windowFrom, windowTo],
    );

    // ─── Top properties (window-correct: clip nights + pro-rate revenue) ───
    // Occupancy here is per single listing — for an N-day window the
    // denominator is just N (since this is one room's slice). Truly
    // multi-unit listings would need a unit-count multiplier; out of
    // scope for v0.1.
    const topPropsRes = await query(
      `WITH overlap_per_res AS (
         SELECT
           gl.guesty_id AS listing_guesty_id,
           COALESCE(p.code, gl.nickname) AS code,
           gl.nickname,
           gl.title,
           gl.picture_url,
           r.guesty_id AS reservation_id,
           GREATEST(LEAST(r.check_out_date, ($3::date + INTERVAL '1 day')::date) - GREATEST(r.check_in_date, $2::date), 0)::int AS nights_in_window,
           GREATEST(r.check_out_date - r.check_in_date, 0)::int AS total_stay_nights,
           r.total_amount_minor
         FROM guesty_listings gl
         LEFT JOIN fad_properties p
           ON p.tenant_id = gl.tenant_id AND p.guesty_id = gl.guesty_id
         LEFT JOIN guesty_reservations r
           ON r.tenant_id = gl.tenant_id
          AND r.listing_guesty_id = gl.guesty_id
          AND r.check_in_date < ($3::date + INTERVAL '1 day')::date
          AND r.check_out_date > $2::date
          AND ${ACTIVE_STATUS_FILTER}
         WHERE gl.tenant_id = $1
       )
       SELECT
         listing_guesty_id,
         code,
         nickname,
         title,
         picture_url,
         COUNT(reservation_id) FILTER (WHERE nights_in_window > 0)::int AS reservation_count,
         COALESCE(SUM(
           CASE
             WHEN total_amount_minor IS NULL OR total_stay_nights = 0 THEN 0
             ELSE ROUND(total_amount_minor::numeric * nights_in_window / total_stay_nights)
           END
         ), 0)::bigint AS revenue_minor,
         COALESCE(SUM(nights_in_window), 0)::int AS booked_nights
       FROM overlap_per_res
       GROUP BY listing_guesty_id, code, nickname, title, picture_url
       ORDER BY reservation_count DESC, code ASC
       LIMIT 10`,
      [tenantId, windowFrom, windowTo],
    );

    // ─── Daily revenue trend (chart) ───
    // For each day in the window: sum the per-night pro-rated revenue
    // from every overlapping stay. A 10-night €3000 stay contributes
    // €300/night on each of its 10 calendar days. Gives a real "what
    // revenue did the portfolio earn today" line — not "what new bookings
    // started today".
    const trendRes = await query(
      `SELECT
         d::date AS day,
         (SELECT COUNT(*)::int FROM guesty_reservations r
            WHERE r.tenant_id = $1
              AND r.check_in_date <= d::date
              AND r.check_out_date > d::date
              AND ${ACTIVE_STATUS_FILTER}
         ) AS occupied_count,
         COALESCE((
           SELECT SUM(
             CASE
               WHEN r.total_amount_minor IS NULL OR (r.check_out_date - r.check_in_date) = 0 THEN 0
               ELSE ROUND(r.total_amount_minor::numeric / (r.check_out_date - r.check_in_date))
             END
           ) FROM guesty_reservations r
            WHERE r.tenant_id = $1
              AND r.check_in_date <= d::date
              AND r.check_out_date > d::date
              AND ${ACTIVE_STATUS_FILTER}
         ), 0)::bigint AS revenue_minor
       FROM generate_series($2::date, $3::date, INTERVAL '1 day') d
       ORDER BY d ASC`,
      [tenantId, windowFrom, windowTo],
    );

    // ─── Inbox + Operations health ───
    let openTasks = null;
    let overdueTasks = null;
    try {
      const tasksRes = await query(
        `SELECT
           COUNT(*) FILTER (WHERE status IN ('reported', 'scheduled', 'ready', 'in_progress', 'paused', 'blocked'))::int AS open_tasks,
           COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('completed', 'closed', 'cancelled'))::int AS overdue_tasks
         FROM tasks WHERE tenant_id = $1`,
        [tenantId],
      );
      openTasks = Number(tasksRes.rows[0]?.open_tasks || 0);
      overdueTasks = Number(tasksRes.rows[0]?.overdue_tasks || 0);
    } catch (_) {
      // Tasks table not yet migrated for this tenant — skip cleanly.
    }

    const currency = kpiCurrent.currency || 'EUR';

    res.json({
      window: { from: windowFrom, to: windowTo, days: windowDays },
      currency,
      // Top-line KPIs
      kpis: {
        revenue_minor: kpiCurrent.revenue_minor,
        revenue_minor_prev: kpiPrev.revenue_minor,
        reservation_count: kpiCurrent.reservation_count,
        reservation_count_prev: kpiPrev.reservation_count,
        booked_nights: kpiCurrent.booked_nights,
        booked_nights_prev: kpiPrev.booked_nights,
        occupancy_pct: occupancyPct,
        occupancy_pct_prev: prevOccupancyPct,
        adr_minor: adrMinor,
        adr_minor_prev: prevAdrMinor,
        revpar_minor: revparMinor,
        active_properties: activeProps,
        total_properties: totalProps,
      },
      ops: {
        open_tasks: openTasks,
        overdue_tasks: overdueTasks,
      },
      channel_mix: channelRes.rows.map((r) => ({
        channel: r.channel,
        reservation_count: Number(r.reservation_count),
        revenue_minor: Number(r.revenue_minor),
        booked_nights: Number(r.booked_nights),
        share_pct: kpiCurrent.reservation_count > 0
          ? Math.round((Number(r.reservation_count) / kpiCurrent.reservation_count) * 100)
          : 0,
      })),
      top_properties: topPropsRes.rows.map((r) => ({
        code: r.code,
        nickname: r.nickname,
        title: r.title,
        picture_url: r.picture_url,
        reservation_count: Number(r.reservation_count),
        revenue_minor: Number(r.revenue_minor),
        booked_nights: Number(r.booked_nights),
        // Per-listing occupancy: clipped nights ÷ window-days (single room).
        // Caps at 100% only if our nights-in-window calc is exact (it is —
        // GREATEST/LEAST clamp clean).
        occupancy_pct: windowDays > 0
          ? Math.min(100, Math.round((Number(r.booked_nights) / windowDays) * 100))
          : 0,
        // Per-listing ADR (revenue ÷ occupied nights).
        adr_minor: Number(r.booked_nights) > 0
          ? Math.round(Number(r.revenue_minor) / Number(r.booked_nights))
          : null,
      })),
      revenue_trend: trendRes.rows.map((r) => ({
        day: r.day,
        // Number of listings occupied on this day (was: bookings starting today).
        occupied_count: Number(r.occupied_count),
        // Sum of per-night pro-rated revenue across all stays in residence.
        revenue_minor: Number(r.revenue_minor),
      })),
      data_quality: {
        revenue_source: 'guesty_reservations',
        gap_note: 'Some reservations may have NULL total_amount_minor where Guesty cache lacks the value — those contribute to reservation_count + booked_nights but not revenue. Sync follow-up logged.',
      },
    });
  } catch (e) {
    console.error('[analytics] portfolio failed:', e.message);
    res.status(500).json({ error: 'Portfolio aggregation failed' });
  }
});

// Window-correct aggregation. The window is [fromIso, toIso] inclusive
// of both ends — toIso is the LAST night the metric counts (so a stay
// checking out on toIso+1 is fully in-window if it started in-window).
//
// Bug we're fixing (2026-05-25):
//   - Previous version: SUM(check_out - check_in) for reservations
//     whose check_in fell in the window. A 100-night stay starting on
//     day 1 contributed all 100 nights to a 30-day window. ADR + Occ
//     came out nonsensical (100% caps, €50 ADR for Mauritius villas).
//
// Correct math (per industry definition of occupied room-nights):
//   nights_in_window = MAX(0, LEAST(check_out, to+1) - GREATEST(check_in, from))
//   pro_rated_revenue = total_amount_minor * nights_in_window / total_stay_nights
//
// reservation_count = stays that OVERLAP the window at all (so a long
//   stay that started before but extends into the window still counts).
async function aggregateWindow(tenantId, fromIso, toIso) {
  const { rows } = await query(
    `WITH overlapping AS (
       SELECT
         r.total_amount_minor,
         r.currency_code,
         r.check_in_date,
         r.check_out_date,
         GREATEST(
           LEAST(r.check_out_date, ($3::date + INTERVAL '1 day')::date) - GREATEST(r.check_in_date, $2::date),
           0
         )::int AS nights_in_window,
         GREATEST(r.check_out_date - r.check_in_date, 0)::int AS total_stay_nights
       FROM guesty_reservations r
       WHERE r.tenant_id = $1
         AND r.check_in_date < ($3::date + INTERVAL '1 day')::date
         AND r.check_out_date > $2::date
         AND ${ACTIVE_STATUS_FILTER}
     )
     SELECT
       COUNT(*) FILTER (WHERE nights_in_window > 0)::int AS reservation_count,
       COALESCE(SUM(nights_in_window), 0)::int AS booked_nights,
       COALESCE(SUM(
         CASE
           WHEN total_amount_minor IS NULL OR total_stay_nights = 0 THEN 0
           ELSE ROUND(total_amount_minor::numeric * nights_in_window / total_stay_nights)
         END
       ), 0)::bigint AS revenue_minor,
       (SELECT currency_code FROM overlapping
          WHERE currency_code IS NOT NULL
          GROUP BY currency_code ORDER BY COUNT(*) DESC LIMIT 1) AS currency
     FROM overlapping`,
    [tenantId, fromIso, toIso],
  );
  const row = rows[0] || {};
  return {
    reservation_count: Number(row.reservation_count || 0),
    revenue_minor: Number(row.revenue_minor || 0),
    booked_nights: Number(row.booked_nights || 0),
    currency: row.currency || null,
  };
}

// ────────────────────────────────────────────────────────────────
// GET /occupancy-heatmap?months=N — per-property × month occupancy %
// ────────────────────────────────────────────────────────────────
router.get('/occupancy-heatmap', attachIdentity, async (req, res) => {
  const tenantId = req.tenantId;
  const months = Math.max(1, Math.min(Number(req.query.months) || 6, 24));
  try {
    const { rows } = await query(
      `WITH months AS (
         SELECT
           date_trunc('month', NOW() - (n || ' month')::interval)::date AS month_start
         FROM generate_series(0, $2 - 1) n
       ),
       per_property_month AS (
         SELECT
           COALESCE(p.code, gl.nickname) AS code,
           gl.nickname,
           m.month_start,
           COALESCE(SUM(
             CASE
               WHEN r.guesty_id IS NULL THEN 0
               WHEN r.check_in_date IS NULL OR r.check_out_date IS NULL THEN 0
               ELSE GREATEST(
                 LEAST(r.check_out_date, (m.month_start + INTERVAL '1 month')::date)
                 - GREATEST(r.check_in_date, m.month_start), 0
               )
             END
           ), 0)::int AS booked_nights,
           EXTRACT(DAY FROM ((m.month_start + INTERVAL '1 month' - INTERVAL '1 day')))::int AS month_days
         FROM guesty_listings gl
         CROSS JOIN months m
         LEFT JOIN fad_properties p
           ON p.tenant_id = gl.tenant_id AND p.guesty_id = gl.guesty_id
         LEFT JOIN guesty_reservations r
           ON r.tenant_id = gl.tenant_id
          AND r.listing_guesty_id = gl.guesty_id
          AND ${ACTIVE_STATUS_FILTER}
          AND r.check_in_date < (m.month_start + INTERVAL '1 month')::date
          AND r.check_out_date > m.month_start
         WHERE gl.tenant_id = $1
           AND gl.is_active = TRUE
         GROUP BY code, gl.nickname, m.month_start
       )
       SELECT code, nickname, month_start, booked_nights, month_days
         FROM per_property_month
        ORDER BY code, month_start`,
      [tenantId, months],
    );

    const propertiesMap = new Map();
    const monthSet = new Set();
    for (const row of rows) {
      monthSet.add(row.month_start instanceof Date
        ? row.month_start.toISOString().slice(0, 10)
        : String(row.month_start).slice(0, 10));
      const entry = propertiesMap.get(row.code) || { code: row.code, nickname: row.nickname, cells: {} };
      const monthIso = row.month_start instanceof Date
        ? row.month_start.toISOString().slice(0, 10)
        : String(row.month_start).slice(0, 10);
      const days = Number(row.month_days || 30);
      const booked = Number(row.booked_nights || 0);
      entry.cells[monthIso] = days > 0 ? Math.min(100, Math.round((booked / days) * 100)) : 0;
      propertiesMap.set(row.code, entry);
    }

    const monthList = Array.from(monthSet).sort();
    const properties = Array.from(propertiesMap.values())
      .map((p) => ({
        code: p.code,
        nickname: p.nickname,
        row: monthList.map((m) => p.cells[m] ?? 0),
      }))
      .sort((a, b) => (a.code || '').localeCompare(b.code || ''));

    res.json({
      months: monthList,
      properties,
    });
  } catch (e) {
    console.error('[analytics] heatmap failed:', e.message);
    res.status(500).json({ error: 'Heatmap aggregation failed' });
  }
});

module.exports = router;
