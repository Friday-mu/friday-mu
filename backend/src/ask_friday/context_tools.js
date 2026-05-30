'use strict';

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');
const { cleanString, safeJson } = require('./contracts');

const router = express.Router();

const CANCELLED_STATUSES = new Set([
  'cancelled',
  'canceled',
  'declined',
  'denied',
  'rejected',
  'expired',
  'closed',
  'voided',
]);
const HOLD_STATUSES = new Set(['hold', 'tentative', 'pending', 'reserved_hold', 'owner_hold']);
const INQUIRY_STATUSES = new Set([
  'inquiry',
  'pending_quote',
  'request',
  'requested',
  'quote',
  'preapproved',
  'pre_approved',
  'unconfirmed',
]);

function badRequest(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function isoDate(value) {
  const text = cleanString(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function normalizeStatus(raw) {
  const value = cleanString(raw, 80).toLowerCase();
  if (!value) return 'inquiry';
  if (value === 'confirmed' || value === 'reserved' || value === 'booked') return 'confirmed';
  if (value === 'checked_in' || value === 'checked-in') return 'checked_in';
  if (value === 'checked_out' || value === 'checked-out') return 'checked_out';
  if (CANCELLED_STATUSES.has(value)) return 'cancelled';
  if (HOLD_STATUSES.has(value)) return 'hold';
  if (INQUIRY_STATUSES.has(value)) return 'inquiry';
  return 'inquiry';
}

function overlayCanOverride(row) {
  if (!row?.overlay_status) return false;
  if (row.overlay_cancelled_at) return true;
  if (!row.guesty_id) return true;
  return cleanString(row.overlay_source_kind, 80).toLowerCase() !== 'guesty_pull';
}

function effectiveStatus(row) {
  return normalizeStatus(overlayCanOverride(row) ? row.overlay_status : row.status);
}

function occupancyClass(status) {
  if (status === 'confirmed' || status === 'checked_in') return 'occupied';
  if (status === 'hold') return 'hold';
  if (status === 'cancelled' || status === 'checked_out') return 'not_occupied';
  return 'inquiry';
}

function statusConfidence(status, row) {
  if (status === 'inquiry' && !cleanString(row?.status, 80)) return 'medium';
  if (status === 'inquiry') return 'medium';
  return 'high';
}

function sourceAgeSeconds(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 1000));
}

function freshnessClass(ageSeconds, staleAfterSeconds) {
  if (ageSeconds == null) return 'unknown';
  return ageSeconds <= staleAfterSeconds ? 'fresh' : 'stale';
}

function maxDate(values) {
  let max = null;
  for (const value of values) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) continue;
    if (!max || time > max.getTime()) max = new Date(time);
  }
  return max ? max.toISOString() : null;
}

function dateRange(from, to) {
  const dates = [];
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    return dates;
  }
  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

async function loadSurfacePolicy(tenantId, surfaceId, toolName) {
  const id = cleanString(surfaceId, 120);
  if (!id) throw badRequest('surfaceId is required');
  const { rows } = await query(
    `SELECT surface_id, source_system, access_class, allowed_tools, allowed_actions, status
       FROM ask_friday_surfaces
      WHERE tenant_id = $1
        AND surface_id = $2
      LIMIT 1`,
    [tenantId, id],
  );
  const surface = rows[0];
  if (!surface) throw badRequest(`surfaceId is not registered: ${id}`, 404);
  if (surface.status === 'paused' || surface.status === 'retired') {
    throw badRequest(`surfaceId is not available: ${id}`, 403);
  }
  const allowedTools = Array.isArray(surface.allowed_tools) ? surface.allowed_tools : [];
  if (allowedTools.length > 0 && !allowedTools.includes(toolName)) {
    throw badRequest(`tool is not allowed for ${id}: ${toolName}`, 403);
  }
  return {
    surfaceId: surface.surface_id,
    sourceSystem: surface.source_system,
    accessClass: surface.access_class,
    status: surface.status,
    allowedByRegistry: true,
    allowedTools,
  };
}

function policyBlock(policy, privacyClass) {
  return {
    surfaceId: policy.surfaceId,
    sourceSystem: policy.sourceSystem,
    accessClass: policy.accessClass,
    status: policy.status,
    allowedByRegistry: policy.allowedByRegistry,
    privacyClass,
  };
}

function respondError(res, error, label) {
  const status = error?.status || 500;
  if (status >= 500) console.error(`[ask-friday/context-tools] ${label}:`, error.message);
  return res.status(status).json({ error: label, message: error.message });
}

function reservationFilters(scope, params) {
  const filters = ['r.tenant_id = $1'];
  const reservationId = cleanString(scope.reservationId || scope.reservation_id, 160);
  const confirmationCode = cleanString(scope.confirmationCode || scope.confirmation_code, 120);
  const listingGuestyId = cleanString(scope.listingGuestyId || scope.listing_guesty_id, 160);
  const propertyCode = cleanString(scope.propertyCode || scope.property_code, 120);
  const window = scope.dateWindow || scope.date_window || {};
  const from = isoDate(window.from);
  const to = isoDate(window.to);

  if (reservationId) {
    params.push(reservationId);
    filters.push(`(r.guesty_id = $${params.length} OR r.id::text = $${params.length} OR o.id::text = $${params.length})`);
  }
  if (confirmationCode) {
    params.push(confirmationCode);
    filters.push(`LOWER(r.confirmation_code) = LOWER($${params.length})`);
  }
  if (listingGuestyId) {
    params.push(listingGuestyId);
    filters.push(`r.listing_guesty_id = $${params.length}`);
  }
  if (propertyCode) {
    params.push(propertyCode);
    filters.push(`LOWER(COALESCE(p.code, l.nickname, '')) = LOWER($${params.length})`);
  }
  if (from) {
    params.push(from);
    filters.push(`r.check_out_date > $${params.length}::date`);
  }
  if (to) {
    params.push(to);
    filters.push(`r.check_in_date < $${params.length}::date`);
  }
  return filters;
}

async function loadReservationContext({ tenantId, body }) {
  const scope = safeJson(body.scope || {}, 80, 4000);
  const params = [tenantId];
  const filters = reservationFilters(scope, params);
  const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 100);
  const { rows } = await query(
    `SELECT r.id,
            r.guesty_id,
            r.confirmation_code,
            r.status,
            r.source,
            r.channel,
            r.listing_guesty_id,
            r.check_in_date::text AS check_in_date,
            r.check_out_date::text AS check_out_date,
            r.guests_count,
            r.adults,
            r.children,
            r.infants,
            r.guest_first_name,
            r.guest_last_name,
            r.synced_at,
            l.nickname AS listing_nickname,
            p.code AS property_code,
            o.id AS overlay_id,
            o.status AS overlay_status,
            o.source_kind AS overlay_source_kind,
            o.cancelled_at AS overlay_cancelled_at,
            cal.nights_cached AS calendar_nights_cached,
            cal.blocked_nights AS calendar_blocked_nights,
            cal.calendar_synced_at
       FROM guesty_reservations r
       LEFT JOIN guesty_listings l
         ON l.tenant_id = r.tenant_id AND l.guesty_id = r.listing_guesty_id
       LEFT JOIN fad_properties p
         ON p.tenant_id = r.tenant_id AND p.guesty_id = r.listing_guesty_id
       LEFT JOIN fad_reservations o
         ON o.tenant_id = r.tenant_id AND o.guesty_id = r.guesty_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS nights_cached,
                COUNT(*) FILTER (WHERE gc.is_available = FALSE) AS blocked_nights,
                MAX(gc.fetched_at) AS calendar_synced_at
           FROM guesty_calendar gc
          WHERE gc.tenant_id = r.tenant_id
            AND gc.listing_guesty_id = r.listing_guesty_id
            AND r.check_in_date IS NOT NULL
            AND r.check_out_date IS NOT NULL
            AND gc.date >= r.check_in_date
            AND gc.date < r.check_out_date
       ) cal ON TRUE
      WHERE ${filters.join(' AND ')}
      ORDER BY r.check_in_date ASC NULLS LAST, r.created_at DESC
      LIMIT ${limit}`,
    params,
  );

  const newestSync = maxDate(rows.flatMap((row) => [row.synced_at, row.calendar_synced_at]));
  const ageSeconds = sourceAgeSeconds(newestSync);
  const rowsWithoutCalendarCoverage = rows.filter((row) => Number(row.calendar_nights_cached || 0) <= 0);
  const caveats = [];
  if (rows.length > 0 && rowsWithoutCalendarCoverage.length === rows.length) {
    caveats.push('Reservation context loaded without calendar cache coverage; availability and prices are not proved by this context.');
  } else if (rowsWithoutCalendarCoverage.length > 0) {
    caveats.push(`${rowsWithoutCalendarCoverage.length} reservation(s) have no calendar cache coverage; treat their availability and prices as unknown.`);
  }
  return {
    source: {
      system: 'fad',
      tables: ['guesty_reservations', 'fad_reservations', 'guesty_calendar'],
      apiPath: '/api/reservations',
      freshness: {
        syncedAt: newestSync,
        ageSeconds,
        freshnessClass: freshnessClass(ageSeconds, 30 * 60),
      },
    },
    reservations: rows.map((row) => {
      const normalized = effectiveStatus(row);
      const cls = occupancyClass(normalized);
      return {
        reservationRef: row.guesty_id ? `guesty:${row.guesty_id}` : `fad:${row.id}`,
        confirmationCode: row.confirmation_code || null,
        property: {
          propertyCode: row.property_code || row.listing_nickname || null,
          listingGuestyId: row.listing_guesty_id || null,
        },
        status: {
          raw: row.status || null,
          normalized,
          occupancyClass: cls,
          statusConfidence: statusConfidence(normalized, row),
          blockingForOps: cls === 'occupied',
        },
        stay: {
          checkInDate: row.check_in_date || null,
          checkOutDate: row.check_out_date || null,
          checkInIncluded: true,
          checkOutExcluded: true,
        },
        guest: {
          displayName: [row.guest_first_name, row.guest_last_name].filter(Boolean).join(' ') || null,
          partySize: row.guests_count != null ? Number(row.guests_count) : null,
          adults: row.adults != null ? Number(row.adults) : null,
          children: row.children != null ? Number(row.children) : null,
          infants: row.infants != null ? Number(row.infants) : null,
        },
        calendar: {
          nightsCached: row.calendar_nights_cached != null ? Number(row.calendar_nights_cached) : 0,
          blockedNights: row.calendar_blocked_nights != null ? Number(row.calendar_blocked_nights) : 0,
          syncedAt: row.calendar_synced_at || null,
        },
        allowedUse: ['ops_schedule', 'guest_reply_staff_review', 'reservation_review'],
      };
    }),
    caveats,
  };
}

async function resolveListing(tenantId, scope) {
  const listingGuestyId = cleanString(scope.listingGuestyId || scope.listing_guesty_id, 160);
  const propertyCode = cleanString(scope.propertyCode || scope.property_code, 120);
  if (!listingGuestyId && !propertyCode) throw badRequest('listingGuestyId or propertyCode is required');
  const { rows } = await query(
    `SELECT gl.guesty_id,
            COALESCE(p.code, gl.nickname) AS property_code,
            gl.nickname,
            gl.title,
            gl.accommodates,
            gl.bedrooms,
            gl.currency_code
       FROM guesty_listings gl
       LEFT JOIN fad_properties p
         ON p.tenant_id = gl.tenant_id AND p.guesty_id = gl.guesty_id
      WHERE gl.tenant_id = $1
        AND (
          ($2::text <> '' AND gl.guesty_id = $2)
          OR ($3::text <> '' AND LOWER(COALESCE(p.code, gl.nickname, '')) = LOWER($3))
        )
      LIMIT 1`,
    [tenantId, listingGuestyId, propertyCode],
  );
  if (!rows[0]) throw badRequest('listing not found for context scope', 404);
  return rows[0];
}

async function loadCalendarContext({ tenantId, body }) {
  const scope = safeJson(body.scope || {}, 80, 4000);
  const window = scope.dateWindow || scope.date_window || {};
  const from = isoDate(window.from);
  const to = isoDate(window.to);
  if (!from || !to || from >= to) throw badRequest('dateWindow.from and dateWindow.to are required as YYYY-MM-DD, with to after from');

  const listing = await resolveListing(tenantId, scope);
  const dates = dateRange(from, to);
  const calendarRes = await query(
    `SELECT date::text AS date,
            is_available,
            status,
            price_minor,
            currency_code,
            min_nights,
            max_nights,
            fetched_at
       FROM guesty_calendar
      WHERE tenant_id = $1
        AND listing_guesty_id = $2
        AND date >= $3::date
        AND date < $4::date
      ORDER BY date`,
    [tenantId, listing.guesty_id, from, to],
  );
  const blockRes = await query(
    `SELECT date::text AS date, reason, notes
       FROM fad_calendar_blocks
      WHERE tenant_id = $1
        AND listing_guesty_id = $2
        AND date >= $3::date
        AND date < $4::date
      ORDER BY date`,
    [tenantId, listing.guesty_id, from, to],
  );

  const rowsByDate = new Map(calendarRes.rows.map((row) => [row.date, row]));
  const blocksByDate = new Map(blockRes.rows.map((row) => [row.date, row]));
  let knownNights = 0;
  let blockedNights = 0;
  let totalMinor = 0;
  let pricedNights = 0;
  const nightly = [];
  for (const date of dates) {
    const row = rowsByDate.get(date);
    const block = blocksByDate.get(date);
    if (row) knownNights += 1;
    const blocked = Boolean(block) || row?.is_available === false;
    if (blocked) blockedNights += 1;
    if (row?.price_minor != null && !blocked) {
      totalMinor += Number(row.price_minor);
      pricedNights += 1;
    }
    nightly.push({
      date,
      state: !row && !block ? 'unknown' : (blocked ? 'blocked' : 'available'),
      priceMinor: row?.price_minor != null ? Number(row.price_minor) : null,
      currencyCode: row?.currency_code || listing.currency_code || null,
      blockSource: block ? 'fad_local' : (row?.is_available === false ? 'guesty_calendar' : null),
      blockReason: block?.reason || null,
    });
  }
  const unknownNights = Math.max(0, dates.length - knownNights);
  const state = unknownNights > 0
    ? 'unknown'
    : (blockedNights === 0 ? 'available' : (blockedNights === dates.length ? 'blocked' : 'partially_blocked'));
  const fetchedAt = maxDate(calendarRes.rows.map((row) => row.fetched_at));
  const ageSeconds = sourceAgeSeconds(fetchedAt);
  return {
    source: {
      system: 'fad',
      tables: ['guesty_calendar', 'fad_calendar_blocks'],
      apiPath: '/api/calendar/grid',
      freshness: {
        fetchedAt,
        ageSeconds,
        freshnessClass: freshnessClass(ageSeconds, 24 * 60 * 60),
      },
    },
    window: { from, to, checkOutExcluded: true },
    property: {
      propertyCode: listing.property_code || listing.nickname || null,
      listingGuestyId: listing.guesty_id,
      title: listing.title || null,
      accommodates: listing.accommodates != null ? Number(listing.accommodates) : null,
      bedrooms: listing.bedrooms != null ? Number(listing.bedrooms) : null,
    },
    availability: {
      state,
      knownNights,
      unknownNights,
      blockedNights,
      totalNights: dates.length,
    },
    pricing: {
      currencyCode: nightly.find((item) => item.currencyCode)?.currencyCode || listing.currency_code || null,
      totalMinor: pricedNights > 0 ? totalMinor : null,
      pricedNights,
      priceConfidence: unknownNights > 0 ? 'unknown' : 'source_dated',
    },
    nightly,
    blocks: blockRes.rows.map((row) => ({
      date: row.date,
      blockSource: 'fad_local',
      reason: row.reason || null,
      notes: row.notes || null,
    })),
    caveats: unknownNights > 0 ? ['Some calendar nights are missing from cache; availability is not proved.'] : [],
  };
}

function splitCards(cards, privacyMode) {
  const parsed = Array.isArray(cards) ? cards : [];
  const guestScoped = [];
  const staffPrivate = [];
  for (const card of parsed) {
    const item = {
      category: cleanString(card.category, 80),
      title: cleanString(card.title, 200),
      body: cleanString(card.body, 1200),
      surface: cleanString(card.surface, 80) || 'internal_only',
      source: cleanString(card.source, 80) || 'manual',
    };
    if (!item.title && !item.body) continue;
    if (item.surface === 'guest_facing' || item.surface === 'both') guestScoped.push(item);
    if ((privacyMode === 'staff_private' || privacyMode === 'restricted') && item.surface !== 'guest_facing') {
      staffPrivate.push(item);
    }
  }
  return { guestScoped, staffPrivate };
}

async function loadPropertyContext({ tenantId, body }) {
  const scope = safeJson(body.scope || {}, 80, 4000);
  const listingGuestyId = cleanString(scope.listingGuestyId || scope.listing_guesty_id, 160);
  const propertyCode = cleanString(scope.propertyCode || scope.property_code, 120);
  const propertyId = cleanString(scope.propertyId || scope.property_id, 160);
  if (!listingGuestyId && !propertyCode && !propertyId) {
    throw badRequest('propertyCode, propertyId, or listingGuestyId is required');
  }
  const { rows } = await query(
    `SELECT COALESCE(p.id::text, NULL) AS property_id,
            gl.guesty_id,
            COALESCE(p.code, gl.nickname) AS property_code,
            COALESCE(p.name, gl.title, gl.nickname) AS name,
            p.area,
            p.region,
            p.zone,
            p.tier,
            gl.address_city,
            gl.address_country,
            gl.picture_url,
            gl.property_type,
            COALESCE(p.bedrooms, gl.bedrooms) AS bedrooms,
            COALESCE(p.bathrooms, gl.bathrooms) AS bathrooms,
            COALESCE(p.max_occupancy, gl.accommodates) AS accommodates,
            COALESCE(p.description, NULL) AS description,
            gl.raw->'amenities' AS guesty_amenities,
            p.tags,
            p.amenities AS fad_amenities,
            p.lifecycle_status,
            p.maintenance_cap_override_minor,
            p.contract_status,
            p.commission_pct,
            gl.synced_at,
            p.updated_at AS overlay_updated_at,
            COALESCE(cards.cards, '[]'::jsonb) AS cards
       FROM guesty_listings gl
       FULL OUTER JOIN fad_properties p
         ON p.tenant_id = gl.tenant_id AND p.guesty_id = gl.guesty_id
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object(
           'category', pc.category,
           'title', pc.title,
           'body', pc.body,
           'surface', pc.surface,
           'source', pc.source,
           'updated_at', pc.updated_at
         ) ORDER BY pc.updated_at DESC) AS cards
           FROM fad_property_cards pc
          WHERE pc.tenant_id = COALESCE(p.tenant_id, gl.tenant_id)
            AND p.id IS NOT NULL
            AND pc.property_id = p.id
       ) cards ON TRUE
      WHERE COALESCE(gl.tenant_id, p.tenant_id) = $1
        AND (
          ($2::text <> '' AND (gl.guesty_id = $2 OR p.guesty_id = $2))
          OR ($3::text <> '' AND LOWER(COALESCE(p.code, gl.nickname, p.name, gl.title, '')) = LOWER($3))
          OR ($4::text <> '' AND p.id::text = $4)
        )
      LIMIT 1`,
    [tenantId, listingGuestyId, propertyCode, propertyId],
  );
  const row = rows[0];
  if (!row) throw badRequest('property not found for context scope', 404);
  const privacyMode = cleanString(body.privacyMode || body.privacy_mode, 80) || 'staff_private';
  const cards = splitCards(row.cards, privacyMode);
  const syncedAt = maxDate([row.synced_at, row.overlay_updated_at]);
  const ageSeconds = sourceAgeSeconds(syncedAt);
  const amenities = Array.isArray(row.guesty_amenities)
    ? row.guesty_amenities
    : (Array.isArray(row.fad_amenities) ? row.fad_amenities : []);
  return {
    source: {
      system: 'fad',
      tables: ['guesty_listings', 'fad_properties', 'fad_property_cards'],
      apiPath: '/api/properties',
      freshness: {
        syncedAt,
        lastReviewedAt: null,
        ageSeconds,
        freshnessClass: freshnessClass(ageSeconds, 7 * 24 * 60 * 60),
      },
    },
    property: {
      propertyCode: row.property_code || null,
      listingGuestyId: row.guesty_id || null,
      public: {
        name: row.name || null,
        area: row.area || row.region || null,
        city: row.address_city || null,
        country: row.address_country || null,
        pictureUrl: row.picture_url || null,
        propertyType: row.property_type || null,
        bedrooms: row.bedrooms != null ? Number(row.bedrooms) : null,
        bathrooms: row.bathrooms != null ? Number(row.bathrooms) : null,
        accommodates: row.accommodates != null ? Number(row.accommodates) : null,
        amenities,
        description: privacyMode === 'public' ? row.description || null : row.description || null,
      },
      guestScoped: {
        cards: privacyMode === 'public' ? [] : cards.guestScoped,
      },
      staffPrivate: privacyMode === 'staff_private' || privacyMode === 'restricted' ? {
        zone: row.zone || null,
        tier: row.tier || null,
        lifecycleStatus: row.lifecycle_status || null,
        tags: Array.isArray(row.tags) ? row.tags : [],
        cards: cards.staffPrivate,
      } : {},
      restricted: privacyMode === 'restricted' ? {
        contractStatus: row.contract_status || null,
        hasCommissionPct: row.commission_pct != null,
        hasMaintenanceCapOverride: row.maintenance_cap_override_minor != null,
      } : {},
    },
    fieldSources: [
      { path: 'public.amenities', source: 'guesty_listings.raw.amenities', trustTier: 'runtime_source', privacyClass: 'public' },
      { path: 'public.bedrooms', source: 'fad_properties overlay or guesty_listings', trustTier: 'runtime_source', privacyClass: 'public' },
      { path: 'staffPrivate.cards', source: 'fad_property_cards', trustTier: 'runtime_source', privacyClass: 'staff_private' },
    ],
    caveats: row.cards?.length ? [] : ['No property cards were available for this property scope.'],
  };
}

router.post('/load-reservation-context', attachIdentity, async (req, res) => {
  try {
    const policy = await loadSurfacePolicy(req.tenantId, req.body?.surfaceId || req.body?.surface_id, 'load_reservation_context');
    const context = await loadReservationContext({ tenantId: req.tenantId, body: req.body || {} });
    return res.json({
      tool: 'load_reservation_context',
      status: 'ok',
      policy: policyBlock(policy, cleanString(req.body?.privacyMode || req.body?.privacy_mode, 80) || 'staff_private'),
      ...context,
    });
  } catch (error) {
    return respondError(res, error, 'load_reservation_context_failed');
  }
});

router.post('/load-calendar-context', attachIdentity, async (req, res) => {
  try {
    const policy = await loadSurfacePolicy(req.tenantId, req.body?.surfaceId || req.body?.surface_id, 'load_calendar_context');
    const context = await loadCalendarContext({ tenantId: req.tenantId, body: req.body || {} });
    return res.json({
      tool: 'load_calendar_context',
      status: 'ok',
      policy: policyBlock(policy, cleanString(req.body?.privacyMode || req.body?.privacy_mode, 80) || 'staff_private'),
      ...context,
    });
  } catch (error) {
    return respondError(res, error, 'load_calendar_context_failed');
  }
});

router.post('/load-property-context', attachIdentity, async (req, res) => {
  try {
    const policy = await loadSurfacePolicy(req.tenantId, req.body?.surfaceId || req.body?.surface_id, 'load_property_context');
    const context = await loadPropertyContext({ tenantId: req.tenantId, body: req.body || {} });
    return res.json({
      tool: 'load_property_context',
      status: 'ok',
      policy: policyBlock(policy, cleanString(req.body?.privacyMode || req.body?.privacy_mode, 80) || 'staff_private'),
      ...context,
    });
  } catch (error) {
    return respondError(res, error, 'load_property_context_failed');
  }
});

module.exports = {
  router,
  _test: {
    normalizeStatus,
    occupancyClass,
    dateRange,
    loadReservationContext,
    loadCalendarContext,
    loadPropertyContext,
  },
};
