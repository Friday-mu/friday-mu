'use strict';

// Pulls reservations from Guesty and upserts into `guesty_reservations`.
// Default window: past 30 days through future 365 days from "now",
// keyed on check-in date — covers operational concerns (recent stays
// for review chase, upcoming for ops + finance) without dragging in
// the historical archive on every poll.
//
// Run order matters: properties sync must happen FIRST so reservations
// can FK-loosely against guesty_listings (we don't enforce the FK in
// SQL — see migration 049 — but the read-path JOIN expects it).

const { query } = require('../database/client');
const { listReservations } = require('../integrations/guesty');
const { inferReservationFinancials, majorToMinor } = require('./financials');
const { upsertGuestForReservation } = require('../guests/sync_from_reservation');

const DEFAULT_DAYS_BACK = 30;
const DEFAULT_DAYS_FORWARD = 365;

function isoDateOnly(d) {
  if (!d) return null;
  // Guesty returns 'YYYY-MM-DD' for *DateLocalized; also accept full
  // ISO and trim to date.
  const s = String(d);
  return s.length >= 10 ? s.slice(0, 10) : null;
}

function pickGuestName(reservation, which) {
  // Guesty has guest.firstName / guest.lastName but the older Open
  // API sometimes only returns guest.fullName. Cover both.
  const g = reservation.guest || {};
  if (which === 'first') {
    if (g.firstName) return String(g.firstName);
    if (g.fullName) return String(g.fullName).split(' ')[0] || null;
    return null;
  }
  if (g.lastName) return String(g.lastName);
  if (g.fullName) {
    const parts = String(g.fullName).split(' ');
    return parts.length > 1 ? parts.slice(1).join(' ') : null;
  }
  return null;
}

async function syncReservationsForTenant(tenantId, opts = {}) {
  if (!tenantId) throw new Error('syncReservationsForTenant: tenantId is required');
  const startedAt = Date.now();
  const daysBack = opts.daysBack ?? DEFAULT_DAYS_BACK;
  const daysForward = opts.daysForward ?? DEFAULT_DAYS_FORWARD;
  const now = new Date();
  const fromDate = opts.fromDate ?? new Date(now.getTime() - daysBack * 86400000).toISOString().slice(0, 10);
  const toDate = opts.toDate ?? new Date(now.getTime() + daysForward * 86400000).toISOString().slice(0, 10);

  const reservations = await listReservations({
    limit: opts.limit || 100,
    fromDate,
    toDate,
  });

  let inserted = 0;
  let updated = 0;
  for (const r of reservations) {
    if (!r?._id) continue;
    const listingId = r.listingId || r.listing?._id;
    if (!listingId) continue; // can't anchor without a listing
    const money = r.money || {};
    const financials = inferReservationFinancials(r);
    const totalMinor = majorToMinor(financials.total);
    const result = await query(
      `INSERT INTO guesty_reservations (
         tenant_id, guesty_id, listing_guesty_id, confirmation_code,
         status, source, channel,
         check_in_date, check_out_date,
         guests_count, adults, children, infants,
         guest_first_name, guest_last_name, guest_email, guest_phone,
         total_amount_minor, currency_code, raw
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       ON CONFLICT (tenant_id, guesty_id) DO UPDATE SET
         listing_guesty_id   = EXCLUDED.listing_guesty_id,
         confirmation_code   = EXCLUDED.confirmation_code,
         status              = EXCLUDED.status,
         source              = EXCLUDED.source,
         channel             = EXCLUDED.channel,
         check_in_date       = EXCLUDED.check_in_date,
         check_out_date      = EXCLUDED.check_out_date,
         guests_count        = EXCLUDED.guests_count,
         adults              = EXCLUDED.adults,
         children            = EXCLUDED.children,
         infants             = EXCLUDED.infants,
         guest_first_name    = EXCLUDED.guest_first_name,
         guest_last_name     = EXCLUDED.guest_last_name,
         guest_email         = EXCLUDED.guest_email,
         guest_phone         = EXCLUDED.guest_phone,
         total_amount_minor  = EXCLUDED.total_amount_minor,
         currency_code       = EXCLUDED.currency_code,
         raw                 = EXCLUDED.raw,
         synced_at           = NOW(),
         updated_at          = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        tenantId,
        String(r._id),
        String(listingId),
        r.confirmationCode || null,
        r.status || null,
        r.source || null,
        r.integration?.platform || r.source || null,
        isoDateOnly(r.checkInDateLocalized || r.checkIn),
        isoDateOnly(r.checkOutDateLocalized || r.checkOut),
        Number.isFinite(r.guestsCount) ? r.guestsCount : null,
        Number.isFinite(r.guests?.adults) ? r.guests.adults : null,
        Number.isFinite(r.guests?.children) ? r.guests.children : null,
        Number.isFinite(r.guests?.infants) ? r.guests.infants : null,
        pickGuestName(r, 'first'),
        pickGuestName(r, 'last'),
        r.guest?.email || null,
        r.guest?.phone || null,
        totalMinor,
        financials.currency || money.currency || null,
        JSON.stringify(r),
      ],
    );
    if (result.rows[0]?.inserted) inserted++;
    else updated++;
    // Best-effort fad_guests upsert. Never breaks reservation sync.
    await upsertGuestForReservation(tenantId, {
      guest_email: r.guest?.email || null,
      guest_phone: r.guest?.phone || null,
      guest_first_name: pickGuestName(r, 'first'),
      guest_last_name: pickGuestName(r, 'last'),
    });
  }

  return {
    fetched: reservations.length,
    inserted,
    updated,
    fromDate,
    toDate,
    durationMs: Date.now() - startedAt,
  };
}

// Upsert a single reservation — used by the webhook receiver when
// Guesty pushes a reservation.* event. Refetches the full row from
// Guesty rather than trusting the webhook payload, since the payload
// is sometimes a partial update.
async function upsertReservationById(tenantId, reservationId) {
  const { getReservation } = require('../integrations/guesty');
  const r = await getReservation({ reservationId });
  if (!r?._id) throw new Error('upsertReservationById: Guesty returned no _id');
  // Reuse the same upsert path by passing a single-element array
  // through the regular sync — but listReservations only accepts
  // filters. Cleaner: do the insert here directly. Trade some
  // duplication for clarity; the body is small.
  const listingId = r.listingId || r.listing?._id;
  if (!listingId) throw new Error(`upsertReservationById: reservation ${reservationId} has no listingId`);
  const money = r.money || {};
  const financials = inferReservationFinancials(r);
  const totalMinor = majorToMinor(financials.total);
  const result = await query(
    `INSERT INTO guesty_reservations (
       tenant_id, guesty_id, listing_guesty_id, confirmation_code,
       status, source, channel,
       check_in_date, check_out_date,
       guests_count, adults, children, infants,
       guest_first_name, guest_last_name, guest_email, guest_phone,
       total_amount_minor, currency_code, raw
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
     ON CONFLICT (tenant_id, guesty_id) DO UPDATE SET
       listing_guesty_id   = EXCLUDED.listing_guesty_id,
       confirmation_code   = EXCLUDED.confirmation_code,
       status              = EXCLUDED.status,
       source              = EXCLUDED.source,
       channel             = EXCLUDED.channel,
       check_in_date       = EXCLUDED.check_in_date,
       check_out_date      = EXCLUDED.check_out_date,
       guests_count        = EXCLUDED.guests_count,
       adults              = EXCLUDED.adults,
       children            = EXCLUDED.children,
       infants             = EXCLUDED.infants,
       guest_first_name    = EXCLUDED.guest_first_name,
       guest_last_name     = EXCLUDED.guest_last_name,
       guest_email         = EXCLUDED.guest_email,
       guest_phone         = EXCLUDED.guest_phone,
       total_amount_minor  = EXCLUDED.total_amount_minor,
       currency_code       = EXCLUDED.currency_code,
       raw                 = EXCLUDED.raw,
       synced_at           = NOW(),
       updated_at          = NOW()
     RETURNING (xmax = 0) AS inserted`,
    [
      tenantId,
      String(r._id),
      String(listingId),
      r.confirmationCode || null,
      r.status || null,
      r.source || null,
      r.integration?.platform || r.source || null,
      isoDateOnly(r.checkInDateLocalized || r.checkIn),
      isoDateOnly(r.checkOutDateLocalized || r.checkOut),
      Number.isFinite(r.guestsCount) ? r.guestsCount : null,
      Number.isFinite(r.guests?.adults) ? r.guests.adults : null,
      Number.isFinite(r.guests?.children) ? r.guests.children : null,
      Number.isFinite(r.guests?.infants) ? r.guests.infants : null,
      pickGuestName(r, 'first'),
      pickGuestName(r, 'last'),
      r.guest?.email || null,
      r.guest?.phone || null,
      totalMinor,
      financials.currency || money.currency || null,
      JSON.stringify(r),
    ],
  );
  // Best-effort fad_guests upsert (webhook path). Never breaks the
  // single-reservation refresh.
  await upsertGuestForReservation(tenantId, {
    guest_email: r.guest?.email || null,
    guest_phone: r.guest?.phone || null,
    guest_first_name: pickGuestName(r, 'first'),
    guest_last_name: pickGuestName(r, 'last'),
  });
  return {
    inserted: !!result.rows[0]?.inserted,
    listingId: String(listingId),
    checkInDate: isoDateOnly(r.checkInDateLocalized || r.checkIn),
    checkOutDate: isoDateOnly(r.checkOutDateLocalized || r.checkOut),
  };
}

module.exports = {
  syncReservationsForTenant,
  upsertReservationById,
  _test: {
    inferReservationFinancials,
    majorToMinor,
  },
};
