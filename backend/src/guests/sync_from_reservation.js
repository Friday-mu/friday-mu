'use strict';

// Upsert a fad_guests row from a single guesty_reservations record.
// Called after every reservation insert/update (both the poller and
// the webhook path). Best-effort: failures here never break the
// reservation sync.
//
// Identity rules:
//   email present → key on (tenant_id, LOWER(TRIM(email)))
//   email absent + phone present → key on (tenant_id, normalised phone)
//   neither → skip (don't create anonymous duplicates)
//
// Lifetime aggregates (total_stays_count, total_revenue_minor,
// last_seen_at) are recomputed from guesty_reservations on each touch,
// not incremented — easier to keep correct under retries.

const { query } = require('../database/client');

function normalisePhone(phone) {
  if (!phone) return null;
  return String(phone).trim().replace(/[^0-9+]/g, '') || null;
}

function pickDisplayName(first, last, email, phone) {
  const composed = [first, last].filter(Boolean).join(' ').trim();
  return composed || email || phone || 'Unnamed guest';
}

async function upsertGuestForReservation(tenantId, reservationLike) {
  if (!tenantId || !reservationLike) return null;
  const email = reservationLike.guest_email
    ? String(reservationLike.guest_email).trim().toLowerCase() || null
    : null;
  const phone = email ? null : normalisePhone(reservationLike.guest_phone);

  const firstName = reservationLike.guest_first_name || null;
  const lastName = reservationLike.guest_last_name || null;
  const displayName = pickDisplayName(firstName, lastName, email, phone);
  // Fallback identity key when Guesty redacted email + phone (very common
  // for OTA bookings). Allow name-keyed rows so the Guests tab can render.
  const nameKey = (!email && !phone)
    ? String(displayName || '').trim().toLowerCase() || null
    : null;
  if (!email && !phone && !nameKey) return null;

  try {
    // Recompute aggregates from source-of-truth. Cheap (indexed scan
    // on email or phone or name). Falls back gracefully when there's
    // nothing.
    let aggSql;
    let aggKey;
    if (email) {
      aggSql = `SELECT
           MIN(r.check_in_date)::timestamptz AS first_seen,
           MAX(r.check_in_date)::timestamptz AS last_seen,
           COUNT(*)::integer AS stays,
           COALESCE(SUM(r.total_amount_minor), 0)::bigint AS revenue
         FROM guesty_reservations r
         WHERE r.tenant_id = $1
           AND LOWER(TRIM(r.guest_email)) = $2`;
      aggKey = email;
    } else if (phone) {
      aggSql = `SELECT
           MIN(r.check_in_date)::timestamptz AS first_seen,
           MAX(r.check_in_date)::timestamptz AS last_seen,
           COUNT(*)::integer AS stays,
           COALESCE(SUM(r.total_amount_minor), 0)::bigint AS revenue
         FROM guesty_reservations r
         WHERE r.tenant_id = $1
           AND NULLIF(LOWER(TRIM(r.guest_email)), '') IS NULL
           AND REGEXP_REPLACE(TRIM(COALESCE(r.guest_phone, '')), '[^0-9+]', '', 'g') = $2`;
      aggKey = phone;
    } else {
      aggSql = `SELECT
           MIN(r.check_in_date)::timestamptz AS first_seen,
           MAX(r.check_in_date)::timestamptz AS last_seen,
           COUNT(*)::integer AS stays,
           COALESCE(SUM(r.total_amount_minor), 0)::bigint AS revenue
         FROM guesty_reservations r
         WHERE r.tenant_id = $1
           AND NULLIF(LOWER(TRIM(r.guest_email)), '') IS NULL
           AND NULLIF(TRIM(r.guest_phone), '') IS NULL
           AND LOWER(TRIM(CONCAT_WS(' ', r.guest_first_name, r.guest_last_name))) = $2`;
      aggKey = nameKey;
    }
    const { rows: aggRows } = await query(aggSql, [tenantId, aggKey]);
    const agg = aggRows[0] || {};

    // Upsert. The two partial unique indexes (email vs phone-only)
    // both guard the same logical key; choose the right ON CONFLICT
    // target accordingly.
    if (email) {
      await query(
        `INSERT INTO fad_guests (
           tenant_id, primary_email, primary_phone, display_name,
           first_name, last_name, first_seen_at, last_seen_at,
           total_stays_count, total_revenue_minor
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (tenant_id, LOWER(TRIM(primary_email)))
           WHERE primary_email IS NOT NULL AND TRIM(primary_email) <> ''
         DO UPDATE SET
           primary_phone       = COALESCE(EXCLUDED.primary_phone, fad_guests.primary_phone),
           display_name        = CASE
                                   WHEN fad_guests.display_name = 'Unnamed guest'
                                     THEN EXCLUDED.display_name
                                   ELSE fad_guests.display_name
                                 END,
           first_name          = COALESCE(EXCLUDED.first_name, fad_guests.first_name),
           last_name           = COALESCE(EXCLUDED.last_name, fad_guests.last_name),
           first_seen_at       = LEAST(fad_guests.first_seen_at, EXCLUDED.first_seen_at),
           last_seen_at        = GREATEST(fad_guests.last_seen_at, EXCLUDED.last_seen_at),
           total_stays_count   = EXCLUDED.total_stays_count,
           total_revenue_minor = EXCLUDED.total_revenue_minor`,
        [
          tenantId,
          email,
          normalisePhone(reservationLike.guest_phone),
          displayName,
          firstName,
          lastName,
          agg.first_seen || null,
          agg.last_seen || null,
          agg.stays || 1,
          agg.revenue || 0,
        ],
      );
    } else if (phone) {
      await query(
        `INSERT INTO fad_guests (
           tenant_id, primary_email, primary_phone, display_name,
           first_name, last_name, first_seen_at, last_seen_at,
           total_stays_count, total_revenue_minor
         ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (tenant_id, REGEXP_REPLACE(TRIM(primary_phone), '[^0-9+]', '', 'g'))
           WHERE primary_email IS NULL AND primary_phone IS NOT NULL AND TRIM(primary_phone) <> ''
         DO UPDATE SET
           display_name        = CASE
                                   WHEN fad_guests.display_name = 'Unnamed guest'
                                     THEN EXCLUDED.display_name
                                   ELSE fad_guests.display_name
                                 END,
           first_name          = COALESCE(EXCLUDED.first_name, fad_guests.first_name),
           last_name           = COALESCE(EXCLUDED.last_name, fad_guests.last_name),
           first_seen_at       = LEAST(fad_guests.first_seen_at, EXCLUDED.first_seen_at),
           last_seen_at        = GREATEST(fad_guests.last_seen_at, EXCLUDED.last_seen_at),
           total_stays_count   = EXCLUDED.total_stays_count,
           total_revenue_minor = EXCLUDED.total_revenue_minor`,
        [
          tenantId,
          phone,
          displayName,
          firstName,
          lastName,
          agg.first_seen || null,
          agg.last_seen || null,
          agg.stays || 1,
          agg.revenue || 0,
        ],
      );
    } else {
      // Name-bucket: no unique constraint (collisions are real for
      // common names). Manual SELECT-then-INSERT-or-UPDATE — Postgres
      // can't ON CONFLICT here.
      const existing = await query(
        `SELECT id FROM fad_guests
          WHERE tenant_id = $1
            AND primary_email IS NULL
            AND primary_phone IS NULL
            AND LOWER(TRIM(display_name)) = $2
          LIMIT 1`,
        [tenantId, nameKey],
      );
      if (existing.rows.length) {
        await query(
          `UPDATE fad_guests SET
             first_name          = COALESCE(first_name, $2),
             last_name           = COALESCE(last_name, $3),
             first_seen_at       = LEAST(first_seen_at, $4),
             last_seen_at        = GREATEST(last_seen_at, $5),
             total_stays_count   = $6,
             total_revenue_minor = $7
           WHERE id = $1`,
          [
            existing.rows[0].id,
            firstName,
            lastName,
            agg.first_seen || null,
            agg.last_seen || null,
            agg.stays || 1,
            agg.revenue || 0,
          ],
        );
      } else {
        await query(
          `INSERT INTO fad_guests (
             tenant_id, primary_email, primary_phone, display_name,
             first_name, last_name, first_seen_at, last_seen_at,
             total_stays_count, total_revenue_minor
           ) VALUES ($1, NULL, NULL, $2, $3, $4, $5, $6, $7, $8)`,
          [
            tenantId,
            displayName,
            firstName,
            lastName,
            agg.first_seen || null,
            agg.last_seen || null,
            agg.stays || 1,
            agg.revenue || 0,
          ],
        );
      }
    }
    return { ok: true };
  } catch (e) {
    // Never break reservation sync over guest sync.
    console.warn('[guests/sync] upsert failed for tenant=%s email=%s phone=%s: %s',
      tenantId, email, phone, e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { upsertGuestForReservation };
