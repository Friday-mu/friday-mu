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
  if (!email && !phone) return null;

  const firstName = reservationLike.guest_first_name || null;
  const lastName = reservationLike.guest_last_name || null;
  const displayName = pickDisplayName(firstName, lastName, email, phone);

  try {
    // Recompute aggregates from source-of-truth. Cheap (indexed scan
    // on email or phone). Falls back gracefully when there's nothing.
    const aggSql = email
      ? `SELECT
           MIN(r.check_in_date)::timestamptz AS first_seen,
           MAX(r.check_in_date)::timestamptz AS last_seen,
           COUNT(*)::integer AS stays,
           COALESCE(SUM(r.total_amount_minor), 0)::bigint AS revenue
         FROM guesty_reservations r
         WHERE r.tenant_id = $1
           AND LOWER(TRIM(r.guest_email)) = $2`
      : `SELECT
           MIN(r.check_in_date)::timestamptz AS first_seen,
           MAX(r.check_in_date)::timestamptz AS last_seen,
           COUNT(*)::integer AS stays,
           COALESCE(SUM(r.total_amount_minor), 0)::bigint AS revenue
         FROM guesty_reservations r
         WHERE r.tenant_id = $1
           AND NULLIF(LOWER(TRIM(r.guest_email)), '') IS NULL
           AND REGEXP_REPLACE(TRIM(COALESCE(r.guest_phone, '')), '[^0-9+]', '', 'g') = $2`;
    const { rows: aggRows } = await query(aggSql, [tenantId, email || phone]);
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
    } else {
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
