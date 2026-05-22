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

function isoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function moneyLabel(value, currency) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const code = String(currency || '').trim().toUpperCase();
  if (!code) return n.toFixed(2);
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${code} ${n.toFixed(2)}`;
  }
}

function asObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function getPath(obj, path) {
  return String(path).split('.').reduce((acc, key) => {
    if (acc && typeof acc === 'object' && Object.prototype.hasOwnProperty.call(acc, key)) return acc[key];
    return undefined;
  }, obj);
}

function firstValue(obj, paths) {
  for (const path of paths) {
    const value = getPath(obj, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function firstPresent(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function numberValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return numberValue(
      value.amount
      ?? value.value
      ?? value.total
      ?? value.gross
      ?? value.net
      ?? value.hostAmount
      ?? value.guestAmount
      ?? value.amountDue
      ?? value.balanceDue,
    );
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function moneyValue(obj, paths) {
  const value = firstValue(obj, paths);
  return numberValue(value);
}

function firstNumber(obj, paths) {
  return numberValue(firstValue(obj, paths));
}

function possiblePaymentArrays(raw, money) {
  return [
    raw.payments,
    raw.payment?.payments,
    raw.paymentInfo?.payments,
    raw.invoice?.payments,
    raw.financials?.payments,
    money.payments,
  ].find(Array.isArray) || [];
}

function inferPartyContext(row) {
  const raw = asObject(row?.raw);
  const guests = asObject(raw.guests);
  const party = asObject(raw.party);
  const guestBreakdown = asObject(raw.guestBreakdown);
  const adults = firstPresent(
    row?.adults,
    firstNumber(raw, ['adults', 'guests.adults', 'party.adults', 'guestBreakdown.adults']),
  );
  const children = firstPresent(
    row?.children,
    firstNumber(raw, ['children', 'guests.children', 'party.children', 'guestBreakdown.children']),
  );
  const infants = firstPresent(
    row?.infants,
    firstNumber(raw, ['infants', 'guests.infants', 'party.infants', 'guestBreakdown.infants']),
  );
  const explicitTotal = firstPresent(
    row?.num_guests,
    row?.guests_count,
    firstNumber(raw, [
      'guestsCount',
      'guests_count',
      'numberOfGuests',
      'numGuests',
      'occupancy',
      'guestCount',
      'guests.total',
      'guests.count',
      'guests.guestsCount',
      'party.total',
      'party.count',
      'guestBreakdown.total',
    ]),
    numberValue(guests.totalGuests),
    numberValue(party.totalGuests),
  );
  const breakdownTotal = [adults, children, infants]
    .map(numberValue)
    .filter((n) => n != null)
    .reduce((sum, n) => sum + n, 0);
  return {
    num_guests: explicitTotal != null ? Number(explicitTotal) : (breakdownTotal > 0 ? breakdownTotal : null),
    adults: adults == null ? null : Number(adults),
    children: children == null ? null : Number(children),
    infants: infants == null ? null : Number(infants),
  };
}

function inferFinancialContext(row) {
  const raw = asObject(row?.raw);
  const money = asObject(raw.money);
  const payments = possiblePaymentArrays(raw, money);
  const paidFromPayments = payments.reduce((sum, payment) => {
    const amount = numberValue(
      payment?.amount
      ?? payment?.value
      ?? payment?.paidAmount
      ?? payment?.totalPaid
      ?? payment?.amountPaid,
    );
    const status = String(payment?.status || '').toLowerCase();
    if (amount == null || ['failed', 'cancelled', 'canceled', 'void', 'refunded'].includes(status)) return sum;
    return sum + amount;
  }, 0);
  const amountPaid = moneyValue(raw, [
    'amountPaid',
    'paidAmount',
    'totalPaid',
    'money.totalPaid',
    'money.paid',
    'money.paidAmount',
    'money.amountPaid',
    'money.paymentsTotal',
    'payment.amountPaid',
    'payment.totalPaid',
    'payment.paidAmount',
    'paymentInfo.amountPaid',
    'paymentInfo.totalPaid',
    'invoice.totalPaid',
    'invoice.paidAmount',
    'financials.amountPaid',
    'financials.totalPaid',
    'financials.paid',
  ]);
  const outstandingBalance = moneyValue(raw, [
    'balanceDue',
    'outstandingBalance',
    'remainingBalance',
    'amountDue',
    'money.balanceDue',
    'money.remainingBalance',
    'money.outstandingBalance',
    'money.balance',
    'money.amountDue',
    'payment.balanceDue',
    'payment.outstandingBalance',
    'payment.amountDue',
    'paymentInfo.balanceDue',
    'paymentInfo.outstandingBalance',
    'invoice.balanceDue',
    'invoice.outstandingBalance',
    'financials.balanceDue',
    'financials.outstandingBalance',
    'financials.remainingBalance',
  ]);
  const totalPrice = moneyValue(raw, [
    'totalPrice',
    'totalAmount',
    'guestTotal',
    'guestTotalPrice',
    'money.totalPrice',
    'money.total',
    'money.guestTotal',
    'money.guestTotalPrice',
    'money.invoiceTotal',
    'money.subtotalPrice',
    'invoice.total',
    'invoice.totalAmount',
    'financials.total',
    'financials.totalPrice',
    'financials.guestTotal',
  ]);
  const paymentStatus = firstValue(raw, [
    'paymentStatus',
    'payment.status',
    'paymentInfo.status',
    'invoice.paymentStatus',
    'invoice.status',
    'money.paymentStatus',
    'money.status',
    'financialStatus',
    'financials.paymentStatus',
    'financials.status',
  ]);
  const paid = amountPaid != null ? amountPaid : (paidFromPayments > 0 ? paidFromPayments : null);
  const derivedTotal = totalPrice != null
    ? totalPrice
    : (paid != null && outstandingBalance != null ? paid + outstandingBalance : null);
  return {
    total_price: derivedTotal,
    amount_paid: paid,
    outstanding_balance: outstandingBalance,
    payment_status: paymentStatus ? String(paymentStatus) : null,
    currency: firstValue(raw, [
      'currency',
      'currencyCode',
      'money.currency',
      'money.currencyCode',
      'payment.currency',
      'paymentInfo.currency',
      'invoice.currency',
      'financials.currency',
    ]),
    fare_accommodation: moneyValue(raw, [
      'money.fareAccommodation',
      'money.accommodationFare',
      'money.subtotalPrice',
      'financials.fareAccommodation',
      'financials.accommodationFare',
    ]),
    cleaning_fee: moneyValue(raw, [
      'money.cleaningFee',
      'money.fareCleaning',
      'money.cleaningFeeValue',
      'financials.cleaningFee',
    ]),
    nightly_rate: moneyValue(raw, [
      'money.nightlyRate',
      'money.averageNightlyRate',
      'financials.nightlyRate',
      'financials.averageNightlyRate',
    ]),
  };
}

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

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function phoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function oneKeyMatch(rows, predicate) {
  const matches = rows.filter(predicate);
  const keys = new Set(matches.map(reservationKey).filter(Boolean));
  if (keys.size !== 1) return null;
  return matches;
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
    const convEmail = normalizeEmail(conversation.guest_email);
    if (convEmail) {
      const byEmail = oneKeyMatch(current, (row) => normalizeEmail(row.guest_email) === convEmail);
      if (byEmail) return chooseCurrentReservationCandidate(byEmail, conversation, now);
    }

    const convPhone = phoneDigits(conversation.guest_phone);
    if (convPhone.length >= 6) {
      const byPhone = oneKeyMatch(current, (row) => {
        const rowPhone = phoneDigits(row.guest_phone);
        return rowPhone.length >= 6 && (rowPhone.endsWith(convPhone) || convPhone.endsWith(rowPhone));
      });
      if (byPhone) return chooseCurrentReservationCandidate(byPhone, conversation, now);
    }

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
  const financial = inferFinancialContext(row);
  const party = inferPartyContext(row);
  const guestName = row.guest_name
    || [row.guest_first_name, row.guest_last_name].filter(Boolean).join(' ').trim()
    || null;
  return {
    id: row.id,
    guesty_reservation_id: row.guesty_reservation_id || row.guesty_id || null,
    confirmation_code: row.confirmation_code || null,
    listing_name: row.listing_name || row.listing_nickname || row.listing_guesty_id || null,
    listing_guesty_id: row.listing_guesty_id || null,
    status: row.status || null,
    channel: row.channel || row.source || null,
    source,
    check_in: row.check_in || row.check_in_date || null,
    check_out: row.check_out || row.check_out_date || null,
    number_of_nights: row.number_of_nights ?? row.nights ?? null,
    num_guests: party.num_guests,
    adults: party.adults,
    children: party.children,
    infants: party.infants,
    guest_name: guestName,
    guest_email: row.guest_email || null,
    guest_phone: row.guest_phone || null,
    total_price: row.total_price != null ? row.total_price : (financial.total_price ?? totalMajor),
    currency: row.currency || row.currency_code || financial.currency || null,
    amount_paid: financial.amount_paid,
    outstanding_balance: financial.outstanding_balance,
    payment_status: financial.payment_status,
    cleaning_fee: row.cleaning_fee ?? financial.cleaning_fee ?? null,
    nightly_rate: row.nightly_rate ?? financial.nightly_rate ?? null,
    accommodation_fare: financial.fare_accommodation,
    special_requests: row.special_requests || null,
    listing_base_price: row.listing_base_price_minor == null ? null : Number(row.listing_base_price_minor) / 100,
    listing_currency: row.listing_currency_code || null,
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
    reservation_context: reservation,
    reservation_total_price: reservation.total_price,
    reservation_currency: reservation.currency,
    reservation_amount_paid: reservation.amount_paid,
    reservation_outstanding_balance: reservation.outstanding_balance,
    reservation_payment_status: reservation.payment_status,
    reservation_cleaning_fee: reservation.cleaning_fee,
    reservation_nightly_rate: reservation.nightly_rate,
    reservation_accommodation_fare: reservation.accommodation_fare,
    reservation_special_requests: reservation.special_requests,
    reservation_channel: reservation.channel,
    reservation_number_of_nights: reservation.number_of_nights,
    reservation_availability_context: reservation.availability_context || null,
    reservation_context_source: reservation.operational_context_source || null,
  };
}

async function loadAvailabilityContextForReservation(reservation, tenantId) {
  if (!tenantId || !reservation?.listing_guesty_id) return null;
  const from = isoDate(reservation.check_in);
  const to = isoDate(reservation.check_out);
  if (!from || !to || from >= to) return null;
  const { rows } = await query(
    `SELECT date::text AS date, is_available, status, price_minor, currency_code, min_nights
       FROM guesty_calendar
      WHERE tenant_id = $1
        AND listing_guesty_id = $2
        AND date >= $3::date
        AND date < $4::date
      ORDER BY date ASC`,
    [tenantId, reservation.listing_guesty_id, from, to],
  );
  if (rows.length === 0) {
    return {
      source: 'guesty_calendar',
      status: 'missing',
      listing_guesty_id: reservation.listing_guesty_id,
      from,
      to,
      nights_requested: reservation.number_of_nights || null,
      message: 'No cached availability/pricing rows for this stay window. Do not invent rates or open dates.',
    };
  }
  const prices = rows
    .map((r) => (r.price_minor == null ? null : Number(r.price_minor) / 100))
    .filter((n) => Number.isFinite(n));
  const blockedDates = rows
    .filter((r) => r.is_available === false)
    .map((r) => String(r.date).slice(0, 10));
  const currencies = [...new Set(rows.map((r) => r.currency_code).filter(Boolean))];
  return {
    source: 'guesty_calendar',
    status: 'loaded',
    listing_guesty_id: reservation.listing_guesty_id,
    from,
    to,
    nights_requested: reservation.number_of_nights || rows.length,
    rows_cached: rows.length,
    blocked_dates: blockedDates,
    min_price: prices.length ? Math.min(...prices) : null,
    max_price: prices.length ? Math.max(...prices) : null,
    currency: currencies[0] || reservation.currency || reservation.listing_currency || null,
    min_nights: rows.map((r) => r.min_nights).filter((v) => v != null)[0] || null,
  };
}

async function enrichReservationContext(reservation, tenantId) {
  if (!reservation) return null;
  const enriched = { ...reservation };
  try {
    enriched.availability_context = await loadAvailabilityContextForReservation(enriched, tenantId);
  } catch (e) {
    enriched.availability_context = {
      source: 'guesty_calendar',
      status: 'error',
      message: `Availability/pricing cache could not be loaded: ${e.message}`,
    };
  }
  return enriched;
}

function availabilityPromptLine(availability) {
  if (!availability) return 'Availability/pricing cache: unavailable; do not invent rates or open dates.';
  if (availability.status === 'missing' || availability.status === 'error') {
    return `Availability/pricing cache: ${availability.message || availability.status}; do not invent rates or open dates.`;
  }
  const bits = [
    `${availability.rows_cached || 0}/${availability.nights_requested || '?'} stay nights cached`,
  ];
  if (availability.blocked_dates?.length) {
    bits.push(`blocked dates in cache: ${availability.blocked_dates.join(', ')} (may reflect the confirmed reservation itself)`);
  }
  const min = moneyLabel(availability.min_price, availability.currency);
  const max = moneyLabel(availability.max_price, availability.currency);
  if (min && max) bits.push(min === max ? `nightly cache price: ${min}` : `nightly cache price range: ${min}-${max}`);
  if (availability.min_nights) bits.push(`min nights: ${availability.min_nights}`);
  return `Availability/pricing cache: ${bits.join('; ')}`;
}

function formatReservationContextForPrompt(reservation) {
  if (!reservation) return '';
  const currency = reservation.currency || reservation.listing_currency;
  const lines = [
    `[Reservation / Financial / Availability Context]`,
    `- Source: ${reservation.operational_context_source || reservation.source || 'unknown'}`,
    `- Reservation: ${reservation.guesty_reservation_id || reservation.id || 'unknown'} (${reservation.status || 'unknown status'})`,
    `- Guest: ${reservation.guest_name || 'unknown'}; listing: ${reservation.listing_name || reservation.listing_guesty_id || 'unknown'}`,
    `- Channel: ${reservation.channel || 'unknown'}`,
    `- Stay: ${reservation.check_in || 'n/a'} -> ${reservation.check_out || 'n/a'}; nights: ${reservation.number_of_nights || 'n/a'}; guests: ${reservation.num_guests || 'n/a'}`,
    `- Total: ${moneyLabel(reservation.total_price, currency) || 'unknown'}; paid: ${moneyLabel(reservation.amount_paid, currency) || 'unknown'}; outstanding: ${moneyLabel(reservation.outstanding_balance, currency) || 'unknown'}; payment status: ${reservation.payment_status || 'unknown'}`,
    `- Nightly: ${moneyLabel(reservation.nightly_rate, currency) || 'unknown'}; cleaning: ${moneyLabel(reservation.cleaning_fee, currency) || 'unknown'}; accommodation fare: ${moneyLabel(reservation.accommodation_fare, currency) || 'unknown'}`,
    `- Special requests: ${reservation.special_requests || 'none recorded'}`,
    `- ${availabilityPromptLine(reservation.availability_context)}`,
  ];
  return lines.join('\n');
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

  const email = normalizeEmail(conversation.guest_email);
  if (email) {
    filters.push(`LOWER(COALESCE(gr.guest_email, '')) = $${i++}`);
    params.push(email);
  }

  const phone = phoneDigits(conversation.guest_phone);
  if (phone.length >= 6) {
    filters.push(`REGEXP_REPLACE(COALESCE(gr.guest_phone, ''), '\\D', '', 'g') LIKE $${i++}`);
    params.push(`%${phone.slice(-8)}`);
  }

  const name = guestNameParts(conversation.guest_name);
  if (name.first) {
    filters.push(`LOWER(COALESCE(gr.guest_first_name, '')) = $${i++}`);
    params.push(name.first);
  }

  if (filters.length === 0) return [];

  const { rows } = await query(
    `SELECT gr.*, l.nickname AS listing_nickname,
            l.base_price_minor AS listing_base_price_minor,
            l.currency_code AS listing_currency_code
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
  if (liveCandidate) {
    return enrichReservationContext(shapeReservationForInbox(liveCandidate, 'guesty_reservations_current'), resolvedTenantId);
  }
  if (legacyRow) {
    return enrichReservationContext(shapeReservationForInbox(legacyRow, 'reservations_legacy'), resolvedTenantId);
  }
  return null;
}

module.exports = {
  resolveInboxReservationContext,
  applyReservationContextToConversation,
  formatReservationContextForPrompt,
  _test: {
    chooseCurrentReservationCandidate,
    shapeReservationForInbox,
    formatReservationContextForPrompt,
    availabilityPromptLine,
    inferFinancialContext,
    inferPartyContext,
    normalizeName,
    normalizeEmail,
    phoneDigits,
    guestNameParts,
    isCurrentStay,
  },
};
