'use strict';

const { query } = require('../database/client');
const { guestyRequest } = require('../website_inbox/guesty');

const CACHE_FRESH_HOURS = Number(process.env.GUESTY_CALENDAR_CACHE_HOURS || 24);

function isoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function daysBetween(fromIso, toIso) {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return NaN;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function eachDateBetween(fromIso, toIso) {
  const out = [];
  const start = new Date(`${fromIso}T00:00:00Z`);
  const end = new Date(`${toIso}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function priceToMinor(v) {
  const n = num(v);
  return n == null ? null : Math.round(n * 100);
}

function extractCalendarDays(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw;
  if (Array.isArray(obj.days)) return obj.days;
  if (Array.isArray(obj.calendar)) return obj.calendar;
  if (Array.isArray(obj.data)) return obj.data;
  if (obj.data && typeof obj.data === 'object') {
    if (Array.isArray(obj.data.days)) return obj.data.days;
    if (Array.isArray(obj.data.calendar)) return obj.data.calendar;
    if (Array.isArray(obj.data.data)) return obj.data.data;
  }
  if (obj.calendar && typeof obj.calendar === 'object') {
    if (Array.isArray(obj.calendar.days)) return obj.calendar.days;
    if (Array.isArray(obj.calendar.data)) return obj.calendar.data;
  }
  return [];
}

function listingIdFromCalendarObject(obj) {
  if (!obj || typeof obj !== 'object') return null;
  return obj.listingId || obj.listing_id || obj.listing?._id || obj.listing?.id || obj._id || obj.id || null;
}

function extractListingCalendars(raw, requestedListingIds) {
  const ids = requestedListingIds.map(String);
  const calendars = new Map();
  if (!raw || typeof raw !== 'object') {
    if (ids.length === 1) calendars.set(ids[0], raw);
    return calendars;
  }

  const candidates = [];
  if (Array.isArray(raw)) candidates.push(...raw);
  else {
    if (Array.isArray(raw.results)) candidates.push(...raw.results);
    if (Array.isArray(raw.listings)) candidates.push(...raw.listings);
    if (Array.isArray(raw.calendars)) candidates.push(...raw.calendars);
    if (Array.isArray(raw.data)) candidates.push(...raw.data);
    if (raw.data && typeof raw.data === 'object') {
      if (Array.isArray(raw.data.results)) candidates.push(...raw.data.results);
      if (Array.isArray(raw.data.listings)) candidates.push(...raw.data.listings);
      if (Array.isArray(raw.data.calendars)) candidates.push(...raw.data.calendars);
    }
    for (const id of ids) {
      if (raw[id]) calendars.set(id, raw[id]);
      if (raw.data && raw.data[id]) calendars.set(id, raw.data[id]);
    }
  }

  for (const c of candidates) {
    const id = listingIdFromCalendarObject(c);
    if (id) calendars.set(String(id), c);
  }

  if (calendars.size === 0 && ids.length === 1) {
    calendars.set(ids[0], raw);
  }
  return calendars;
}

function normalizeDay(day) {
  if (!day || typeof day !== 'object') return null;
  const date = String(day.date || day.dateLocalized || day.day || '').slice(0, 10);
  if (!isoDate(date)) return null;
  const status = String(day.status || day.availability || day.blockType || '').toLowerCase();
  const allotment = num(day.allotment);
  const blocked = allotment != null
    ? allotment <= 0
    : status === 'booked' ||
      status === 'blocked' ||
      status === 'unavailable' ||
      status === 'reserved' ||
      status === 'not_available' ||
      day.available === false ||
      day.isAvailable === false ||
      day.isBaseAvailable === false;
  const price =
    day.price ??
    day.basePrice ??
    day.nightlyPrice ??
    day.rate ??
    day.amount ??
    day?.pricing?.price ??
    day?.pricing?.basePrice;
  return {
    date,
    isAvailable: !blocked,
    status: status || null,
    priceMinor: priceToMinor(price),
    currencyCode: day.currency || day.currencyCode || day?.pricing?.currency || null,
    minNights: num(day.minNights ?? day.minimumNights ?? day.minStay),
    maxNights: num(day.maxNights ?? day.maximumNights ?? day.maxStay),
    raw: day,
  };
}

function normalizeCalendar(raw) {
  const blockedDates = [];
  const pricesByDate = {};
  for (const d of extractCalendarDays(raw)) {
    const day = normalizeDay(d);
    if (!day) continue;
    if (!day.isAvailable) blockedDates.push(day.date);
    if (day.priceMinor != null) pricesByDate[day.date] = day.priceMinor / 100;
  }
  return { blockedDates, pricesByDate };
}

function normalizeCalendarRows(rows, listing, fromIso, toIso) {
  const blockedDates = [];
  const pricesByDate = {};
  const basePriceMinor = Number(listing?.base_price_minor);
  const basePrice = Number.isFinite(basePriceMinor)
    ? basePriceMinor / 100
    : num(listing?.raw?.prices?.basePrice);

  for (const row of rows) {
    const date = String(row.date).slice(0, 10);
    if (!isoDate(date)) continue;
    if (row.is_available === false) blockedDates.push(date);
    if (row.price_minor != null) pricesByDate[date] = Number(row.price_minor) / 100;
  }

  if (Number.isFinite(basePrice)) {
    for (const d of eachDateBetween(fromIso, toIso)) {
      if (pricesByDate[d] == null) pricesByDate[d] = basePrice;
    }
  }

  return {
    blockedDates: blockedDates.sort(),
    pricesByDate,
  };
}

async function upsertCalendarDays({ tenantId, listingId, days, source = 'guesty_calendar' }) {
  if (!tenantId) throw new Error('upsertCalendarDays: tenantId is required');
  if (!listingId) throw new Error('upsertCalendarDays: listingId is required');
  let upserted = 0;
  for (const day of days) {
    if (!day?.date) continue;
    await query(
      `INSERT INTO guesty_calendar (
         tenant_id, listing_guesty_id, date, is_available, status,
         price_minor, currency_code, min_nights, max_nights, source, raw
       )
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
       ON CONFLICT (tenant_id, listing_guesty_id, date) DO UPDATE SET
         is_available  = EXCLUDED.is_available,
         status        = EXCLUDED.status,
         price_minor   = EXCLUDED.price_minor,
         currency_code = EXCLUDED.currency_code,
         min_nights    = EXCLUDED.min_nights,
         max_nights    = EXCLUDED.max_nights,
         source        = EXCLUDED.source,
         raw           = EXCLUDED.raw,
         fetched_at    = NOW(),
         updated_at    = NOW()`,
      [
        tenantId,
        listingId,
        day.date,
        day.isAvailable !== false,
        day.status || null,
        day.priceMinor,
        day.currencyCode || null,
        day.minNights,
        day.maxNights,
        source,
        JSON.stringify(day.raw || {}),
      ],
    );
    upserted++;
  }
  return upserted;
}

async function loadCalendarRows({ tenantId, listingId, fromIso, toIso }) {
  const { rows } = await query(
    `SELECT date::text AS date,
            is_available,
            status,
            price_minor,
            currency_code,
            min_nights,
            max_nights,
            source,
            fetched_at
       FROM guesty_calendar
      WHERE tenant_id = $1
        AND listing_guesty_id = $2
        AND date >= $3::date
        AND date < $4::date
      ORDER BY date ASC`,
    [tenantId, listingId, fromIso, toIso],
  );
  return rows;
}

function cacheCoversRange(rows, fromIso, toIso) {
  return rows.length >= eachDateBetween(fromIso, toIso).length;
}

function cacheIsFresh(rows, maxAgeHours = CACHE_FRESH_HOURS) {
  if (!rows.length) return false;
  const cutoff = Date.now() - maxAgeHours * 3_600_000;
  return rows.every((r) => new Date(r.fetched_at).getTime() >= cutoff);
}

async function fetchGuestyCalendar({ listingIds, fromIso, toIso }) {
  const ids = listingIds.map(String).filter(Boolean);
  if (!ids.length) return new Map();
  const { data } = await guestyRequest({
    method: 'GET',
    path: '/availability-pricing/api/calendar/listings',
    params: {
      listingIds: ids.join(','),
      startDate: fromIso,
      endDate: toIso,
      includeAllotment: true,
    },
  });
  return extractListingCalendars(data, ids);
}

async function refreshCalendarForListing({ tenantId, listingId, fromIso, toIso }) {
  const calendars = await fetchGuestyCalendar({ listingIds: [listingId], fromIso, toIso });
  const raw = calendars.get(String(listingId));
  const days = extractCalendarDays(raw).map(normalizeDay).filter(Boolean);
  await upsertCalendarDays({ tenantId, listingId, days, source: 'guesty_calendar' });
  return loadCalendarRows({ tenantId, listingId, fromIso, toIso });
}

async function getCachedAvailability({ tenantId, listing, fromIso, toIso, allowStale = false }) {
  const listingId = listing?.guesty_id || listing?.listing_guesty_id || listing?.id;
  const rows = await loadCalendarRows({ tenantId, listingId, fromIso, toIso });
  if (!cacheCoversRange(rows, fromIso, toIso)) return null;
  if (!allowStale && !cacheIsFresh(rows)) return null;
  return {
    availability: normalizeCalendarRows(rows, listing, fromIso, toIso),
    rows,
  };
}

module.exports = {
  CACHE_FRESH_HOURS,
  isoDate,
  daysBetween,
  eachDateBetween,
  extractCalendarDays,
  extractListingCalendars,
  normalizeDay,
  normalizeCalendar,
  normalizeCalendarRows,
  upsertCalendarDays,
  loadCalendarRows,
  cacheCoversRange,
  cacheIsFresh,
  fetchGuestyCalendar,
  refreshCalendarForListing,
  getCachedAvailability,
};
