'use strict';

const { query } = require('../database/client');

const CURRENT_STATUSES = new Set([
  'active',
  'confirmed',
  'reserved',
  'checked_in',
  'checked-in',
  'in_house',
  'in-house',
  'staying',
]);

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function guestNameParts(value) {
  const parts = normalizeName(value).split(' ').filter(Boolean);
  return {
    first: parts[0] || null,
    last: parts.length > 1 ? parts[parts.length - 1] : null,
    normalized: parts.join(' '),
  };
}

function isCurrentStay(row, now = new Date()) {
  if (!row?.check_in_date || !row?.check_out_date) return false;
  const checkIn = new Date(row.check_in_date).getTime();
  const checkOut = new Date(row.check_out_date).getTime();
  if (!Number.isFinite(checkIn) || !Number.isFinite(checkOut)) return false;
  const nowMs = now.getTime();
  const twoDaysAgo = nowMs - (2 * 24 * 60 * 60 * 1000);
  const thirtyDaysAhead = nowMs + (30 * 24 * 60 * 60 * 1000);
  return checkOut >= twoDaysAgo && checkIn <= thirtyDaysAhead;
}

function reservationKey(row) {
  return row?.confirmation_code || row?.guesty_id || row?.id || null;
}

function statusRank(row) {
  const status = String(row?.status || '').toLowerCase();
  if (CURRENT_STATUSES.has(status)) return 0;
  if (!status) return 1;
  return 2;
}

function sourceRank(row) {
  const source = String(row?.source || '').toLowerCase();
  const guestyId = String(row?.guesty_id || '');
  if (source.includes('scrape') || guestyId.startsWith('scrape:')) return 0;
  return 1;
}

function chooseCurrentReservationCandidate(rows, conversation, now = new Date()) {
  if (!Array.isArray(rows) || rows.length === 0 || !conversation) return null;
  const current = rows.filter((row) => isCurrentStay(row, now));
  if (current.length === 0) return null;

  const keys = new Set(current.map(reservationKey).filter(Boolean));
  if (keys.size > 1) {
    const convName = guestNameParts(conversation.guest_name);
    const exactFullName = current.filter((row) => {
      if (!convName.first || !convName.last) return false;
      const first = normalizeName(row.guest_first_name);
      const last = normalizeName(row.guest_last_name);
      return first === convName.first && last === convName.last;
    });
    const exactKeys = new Set(exactFullName.map(reservationKey).filter(Boolean));
    if (exactKeys.size !== 1) return null;
    return chooseCurrentReservationCandidate(exactFullName, conversation, now);
  }

  return [...current].sort((a, b) => {
    const byStatus = statusRank(a) - statusRank(b);
    if (byStatus !== 0) return byStatus;
    const bySource = sourceRank(a) - sourceRank(b);
    if (bySource !== 0) return bySource;
    return new Date(b.updated_at || b.synced_at || b.created_at || 0).getTime()
      - new Date(a.updated_at || a.synced_at || a.created_at || 0).getTime();
  })[0] || null;
}

function shapeReservationForInbox(row, source = 'legacy') {
  if (!row) return null;
  const totalMinor = row.total_amount_minor == null ? null : Number(row.total_amount_minor);
  const totalMajor = Number.isFinite(totalMinor) ? totalMinor / 100 : null;
  const guestName = row.guest_name
    || [row.guest_first_name, row.guest_last_name].filter(Boolean).join(' ').trim()
    || null;
  return {
    id: row.id,
    guesty_reservation_id: row.guesty_reservation_id || row.guesty_id || null,
    listing_name: row.listing_name || row.listing_nickname || row.listing_guesty_id || null,
    listing_guesty_id: row.listing_guesty_id || null,
    status: row.status || null,
    channel: row.channel || row.source || null,
    source,
    check_in: row.check_in || row.check_in_date || null,
    check_out: row.check_out || row.check_out_date || null,
    number_of_nights: row.number_of_nights || row.nights || null,
    num_guests: row.num_guests || row.guests_count || null,
    guest_name: guestName,
    guest_email: row.guest_email || null,
    guest_phone: row.guest_phone || null,
    total_price: row.total_price != null ? row.total_price : totalMajor,
    currency: row.currency || row.currency_code || null,
    cleaning_fee: row.cleaning_fee || null,
    nightly_rate: row.nightly_rate || null,
    special_requests: row.special_requests || null,
    operational_context_source: source,
  };
}

function applyReservationContextToConversation(conversation, reservation) {
  if (!conversation || !reservation) return conversation;
  return {
    ...conversation,
    property_name: reservation.listing_name || conversation.property_name,
    check_in_date: reservation.check_in || conversation.check_in_date,
    check_out_date: reservation.check_out || conversation.check_out_date,
    num_guests: reservation.num_guests || conversation.num_guests,
    guesty_reservation_id: reservation.guesty_reservation_id || conversation.guesty_reservation_id,
    reservation_context_source: reservation.operational_context_source || null,
  };
}

async function loadLegacyReservation(conversationId) {
  const { rows } = await query(
    `SELECT r.*
       FROM reservations r
       JOIN conversations c ON c.reservation_id = r.id
      WHERE c.id = $1
      LIMIT 1`,
    [conversationId],
  );
  return rows[0] || null;
}

async function loadGuestyReservationsForConversation(conversation, tenantId) {
  const params = [tenantId];
  const filters = [];
  let i = 2;

  if (conversation.guesty_reservation_id) {
    filters.push(`gr.guesty_id = $${i++}`);
    params.push(conversation.guesty_reservation_id);
  }

  const name = guestNameParts(conversation.guest_name);
  if (name.first) {
    filters.push(`LOWER(COALESCE(gr.guest_first_name, '')) = $${i++}`);
    params.push(name.first);
  }

  if (filters.length === 0) return [];

  const { rows } = await query(
    `SELECT gr.*, l.nickname AS listing_nickname
       FROM guesty_reservations gr
       LEFT JOIN guesty_listings l
         ON l.tenant_id = gr.tenant_id
        AND l.guesty_id = gr.listing_guesty_id
      WHERE gr.tenant_id = $1
        AND (${filters.join(' OR ')})
      ORDER BY gr.check_in_date DESC NULLS LAST, gr.updated_at DESC NULLS LAST
      LIMIT 12`,
    params,
  );
  return rows;
}

async function resolveInboxReservationContext(conversation, { tenantId } = {}) {
  if (!conversation?.id) return null;
  const resolvedTenantId = tenantId || conversation.tenant_id;
  const [legacyRow, liveRows] = await Promise.all([
    loadLegacyReservation(conversation.id).catch(() => null),
    resolvedTenantId
      ? loadGuestyReservationsForConversation(conversation, resolvedTenantId).catch(() => [])
      : Promise.resolve([]),
  ]);

  const liveCandidate = chooseCurrentReservationCandidate(liveRows, conversation);
  if (liveCandidate) return shapeReservationForInbox(liveCandidate, 'guesty_reservations_current');
  if (legacyRow) return shapeReservationForInbox(legacyRow, 'reservations_legacy');
  return null;
}

module.exports = {
  resolveInboxReservationContext,
  applyReservationContextToConversation,
  _test: {
    chooseCurrentReservationCandidate,
    shapeReservationForInbox,
    normalizeName,
    guestNameParts,
    isCurrentStay,
  },
};
