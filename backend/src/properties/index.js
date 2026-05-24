'use strict';

// /api/properties — FAD-native + Guesty-cache merged surface.
//
// Phase 1 architecture per v0.2 LOCKED scoping pack (Notion
// 34f43ca8849281f3a130f7def80a7c5d): Properties is the unification
// layer. We layer FAD-owned fields (lifecycle, onboarding, cards,
// owners, photos, activity) on top of the read-only Guesty listings
// cache (mig 049). Frontend gets one merged shape.
//
// Routes:
//   GET    /                                — list, merged
//   GET    /:id                             — single, merged. `:id` = UUID OR Guesty `_id`
//   POST   /                                — manual create (prospect/onboarding state)
//   POST   /sync                            — admin manual Guesty re-sync
//   GET    /:id/cards                       — Property Cards (AI-knowledge surface)
//   POST   /:id/cards                       — add card
//   PATCH  /:id/cards/:cardId               — update card
//   DELETE /:id/cards/:cardId               — delete card
//   GET    /:id/owners                      — N:M owner records
//   POST   /:id/owners                      — add/upsert owner
//   DELETE /:id/owners/:ownerRowId          — remove owner
//   GET    /:id/photos                      — photo gallery (schema-only Phase 1)
//   POST   /:id/photos                      — record photo (storage_key supplied)
//   DELETE /:id/photos/:photoId             — remove photo
//   GET    /:id/onboarding-artifacts        — structured artifact records
//   POST   /:id/onboarding-artifacts        — upsert artifact (by type)
//   GET    /:id/activity                    — FAD-native activity log

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');
const { syncListingsForTenant } = require('./sync');

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ────────────────────────────────────────────────────────────────
// Shape helpers
// ────────────────────────────────────────────────────────────────

// Merge the (read-only) Guesty cache row + the (writeable) FAD-native
// overlay row into the single Property shape the frontend consumes.
// Either side may be absent — a prospect has no Guesty cache row; a
// just-imported listing has no overlay row.
function shapeMergedListing(row) {
  if (!row) return null;
  const g = row.guesty || {};
  const o = row.overlay || {};
  // Prefer FAD-native overlay where it exists, fall back to Guesty cache.
  const guestyId = o.guesty_id || g.guesty_id || null;
  return {
    id: guestyId || o.id, // Frontend keys by guesty_id when present
    overlay_id: o.id || null, // The properties.id UUID (always present once overlay materialised)
    guesty_id: guestyId,
    code: o.code || g.nickname || (guestyId ? guestyId.slice(-8) : null),
    nickname: g.nickname || o.code || null,
    name: o.name || g.title || g.nickname || null,
    building_name: o.building_name || null,
    title: g.title || null,
    address: {
      full: o.address || g.address_full || null,
      city: g.address_city || null,
      country: g.address_country || null,
    },
    region: o.region || g.cohort || null,
    area: o.area || null,
    zone: o.zone || null,
    tier: o.tier || null,
    geo: o.geo_lat != null && o.geo_lng != null
      ? { lat: Number(o.geo_lat), lng: Number(o.geo_lng) }
      : null,
    picture_url: g.picture_url || null,
    property_type: o.listing_type || g.property_type || null,
    bedrooms: o.bedrooms != null ? Number(o.bedrooms) : (g.bedrooms != null ? Number(g.bedrooms) : null),
    bathrooms: o.bathrooms != null ? Number(o.bathrooms) : (g.bathrooms != null ? Number(g.bathrooms) : null),
    accommodates: o.max_occupancy != null ? Number(o.max_occupancy) : (g.accommodates != null ? Number(g.accommodates) : null),
    sqm: o.sqm != null ? Number(o.sqm) : null,
    description: o.description || null,
    // Lifecycle
    lifecycle_status: o.lifecycle_status || (g.is_active ? 'live' : 'paused'),
    onboarding_checklist: o.onboarding_checklist || {},
    live_since: o.live_since || null,
    paused_reason: o.paused_reason || null,
    pause_return_by: o.pause_return_by || null,
    // Multi-unit
    parent_property_id: o.parent_property_id || null,
    is_combo: !!o.is_combo,
    // Owner contract (the per-owner N:M records live at /owners)
    contract: {
      status: o.contract_status || null,
      commission_pct: o.commission_pct != null ? Number(o.commission_pct) : null,
      payment_day: o.payment_day != null ? Number(o.payment_day) : null,
      ends_at: o.contract_ends_at || null,
      xodo_envelope_id: o.contract_xodo_envelope_id || null,
    },
    maintenance_cap_override_minor: o.maintenance_cap_override_minor != null
      ? Number(o.maintenance_cap_override_minor) : null,
    // Listings — overlay JSONB array. Default to single friday_mu row
    // derived from the Guesty cache so existing surfaces render.
    listings: Array.isArray(o.listings) && o.listings.length > 0
      ? o.listings
      : (guestyId ? [{ channel: 'friday_mu', externalId: guestyId, status: g.is_active ? 'active' : 'paused' }] : []),
    base_price_minor: o.base_rate_mur_minor != null
      ? Number(o.base_rate_mur_minor)
      : (g.base_price_minor != null ? Number(g.base_price_minor) : null),
    currency_code: g.currency_code || null,
    is_active: g.is_active != null ? g.is_active : (o.lifecycle_status === 'live'),
    hero_photo_id: o.hero_photo_id || null,
    tags: Array.isArray(o.tags) ? o.tags : [],
    amenities: Array.isArray(o.amenities) ? o.amenities : [],
    is_syndic_managed: !!o.is_syndic_managed,
    syndic_id: o.syndic_id || null,
    last_activity_at: o.last_activity_at || g.synced_at || null,
    synced_at: g.synced_at || null,
    // Primary owner — populated when fad_property_owners + fad_owners
    // are joined in the list/single query. Phase 2 (T3.12).
    primary_owner_id: row.primary_owner_guesty_id || null,
    primary_owner_display_name: row.primary_owner_display_name || null,
    availability: {
      blocked_30d: row.blocked_30d != null ? Number(row.blocked_30d) : 0,
      min_price_minor_30d: row.min_price_minor_30d != null ? Number(row.min_price_minor_30d) : null,
      max_price_minor_30d: row.max_price_minor_30d != null ? Number(row.max_price_minor_30d) : null,
      calendar_synced_at: row.calendar_synced_at || null,
    },
    // T1.11: rolling 30-day occupancy + ADR computed from
    // guesty_reservations.check_in_date. Null on properties with no
    // bookings in the window. Currency derived from the dominant
    // reservation currency (falls back to EUR).
    metrics_30d: {
      occupancy_pct: row.metrics_occupancy_pct != null ? Number(row.metrics_occupancy_pct) : null,
      adr_minor: row.metrics_adr_minor != null ? Number(row.metrics_adr_minor) : null,
      revenue_minor: row.metrics_revenue_minor != null ? Number(row.metrics_revenue_minor) : null,
      booked_nights: row.metrics_booked_nights != null ? Number(row.metrics_booked_nights) : 0,
      reservation_count: row.metrics_reservation_count != null ? Number(row.metrics_reservation_count) : 0,
      currency: row.metrics_currency || null,
    },
  };
}

// Resolve `:id` URL param to a properties.id UUID. If a Guesty listing
// exists with no overlay row, auto-create the overlay so child routes
// have a stable target. Returns { propertyId, guestyId } or null.
async function resolvePropertyId(tenantId, idOrGuestyId) {
  if (!idOrGuestyId) return null;
  const isUuid = UUID_RE.test(idOrGuestyId);
  if (isUuid) {
    const { rows } = await query(
      'SELECT id, guesty_id FROM fad_properties WHERE tenant_id = $1 AND id = $2 LIMIT 1',
      [tenantId, idOrGuestyId],
    );
    if (rows.length > 0) return { propertyId: rows[0].id, guestyId: rows[0].guesty_id };
    return null;
  }
  // Treat as Guesty `_id`. Look up overlay first.
  const existing = await query(
    'SELECT id, guesty_id FROM fad_properties WHERE tenant_id = $1 AND guesty_id = $2 LIMIT 1',
    [tenantId, idOrGuestyId],
  );
  if (existing.rows.length > 0) {
    return { propertyId: existing.rows[0].id, guestyId: existing.rows[0].guesty_id };
  }
  // No overlay yet — auto-create one from the Guesty cache row.
  const cache = await query(
    `SELECT guesty_id, nickname, title, address_full, cohort,
            property_type, bedrooms, bathrooms, accommodates, is_active
       FROM guesty_listings
      WHERE tenant_id = $1 AND guesty_id = $2 LIMIT 1`,
    [tenantId, idOrGuestyId],
  );
  if (cache.rows.length === 0) return null;
  const g = cache.rows[0];
  const code = (g.nickname || '').trim() || g.guesty_id.slice(-8);
  const insert = await query(
    `INSERT INTO fad_properties
       (tenant_id, guesty_id, code, name, address, region, listing_type,
        bedrooms, bathrooms, max_occupancy, lifecycle_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (tenant_id, guesty_id) DO NOTHING
     RETURNING id, guesty_id`,
    [
      tenantId, g.guesty_id, code,
      g.title || g.nickname || `Listing ${g.guesty_id.slice(-6)}`,
      g.address_full,
      g.cohort,
      // Map Guesty property_type loosely to our enum; null on miss.
      ((g.property_type || '').toLowerCase().includes('villa')) ? 'villa'
        : ((g.property_type || '').toLowerCase().includes('apart')) ? 'apartment'
        : ((g.property_type || '').toLowerCase().includes('studio')) ? 'studio'
        : ((g.property_type || '').toLowerCase().includes('town')) ? 'townhouse'
        : ((g.property_type || '').toLowerCase().includes('bungalow')) ? 'bungalow'
        : null,
      g.bedrooms,
      g.bathrooms,
      g.accommodates,
      g.is_active ? 'live' : 'paused',
    ],
  );
  if (insert.rows.length === 0) {
    // Race — another caller materialised first. Re-read.
    const again = await query(
      'SELECT id, guesty_id FROM fad_properties WHERE tenant_id = $1 AND guesty_id = $2 LIMIT 1',
      [tenantId, idOrGuestyId],
    );
    return again.rows.length > 0
      ? { propertyId: again.rows[0].id, guestyId: again.rows[0].guesty_id }
      : null;
  }
  return { propertyId: insert.rows[0].id, guestyId: insert.rows[0].guesty_id };
}

// ────────────────────────────────────────────────────────────────
// List
// ────────────────────────────────────────────────────────────────

router.get('/', attachIdentity, async (req, res) => {
  try {
    const filters = ['gl.tenant_id = $1'];
    const params = [req.tenantId];
    let i = 2;
    if (typeof req.query.cohort === 'string' && req.query.cohort.length > 0) {
      filters.push(`COALESCE(p.region, gl.cohort) = $${i++}`);
      params.push(req.query.cohort);
    }
    if (req.query.active === 'true') {
      filters.push(`COALESCE(
        CASE WHEN p.lifecycle_status IS NOT NULL THEN p.lifecycle_status = 'live' END,
        gl.is_active
      ) = TRUE`);
    } else if (req.query.active === 'false') {
      filters.push(`COALESCE(
        CASE WHEN p.lifecycle_status IS NOT NULL THEN p.lifecycle_status = 'live' END,
        gl.is_active
      ) = FALSE`);
    }
    if (typeof req.query.lifecycle === 'string' && req.query.lifecycle.length > 0) {
      filters.push(`p.lifecycle_status = $${i++}`);
      params.push(req.query.lifecycle);
    }
    // Default scope: all guesty listings (with merged overlay where present)
    // PLUS overlay-only rows (prospects) that have no guesty_id yet.
    // Postgres won't accept JSON-extractor expressions in an ORDER BY that
    // sits on a UNION result, so we expose the two sort keys as proper
    // columns in both branches and ORDER BY them by name in the outer query.
    const { rows } = await query(
      `SELECT * FROM (
         SELECT
           row_to_json(gl) AS guesty,
           row_to_json(p) AS overlay,
           p.code AS sort_code,
           gl.nickname AS sort_nickname,
           cal.blocked_30d,
           cal.min_price_minor_30d,
           cal.max_price_minor_30d,
           cal.calendar_synced_at,
           owner_join.guesty_owner_id AS primary_owner_guesty_id,
           owner_join.display_name AS primary_owner_display_name,
           metrics.occupancy_pct AS metrics_occupancy_pct,
           metrics.adr_minor AS metrics_adr_minor,
           metrics.revenue_minor AS metrics_revenue_minor,
           metrics.booked_nights AS metrics_booked_nights,
           metrics.reservation_count AS metrics_reservation_count,
           metrics.currency AS metrics_currency
         FROM guesty_listings gl
         LEFT JOIN fad_properties p
           ON p.tenant_id = gl.tenant_id AND p.guesty_id = gl.guesty_id
         LEFT JOIN LATERAL (
           SELECT COUNT(*) FILTER (WHERE gc.is_available = FALSE) AS blocked_30d,
                  MIN(gc.price_minor) FILTER (WHERE gc.price_minor IS NOT NULL) AS min_price_minor_30d,
                  MAX(gc.price_minor) FILTER (WHERE gc.price_minor IS NOT NULL) AS max_price_minor_30d,
                  MAX(gc.fetched_at) AS calendar_synced_at
             FROM guesty_calendar gc
            WHERE gc.tenant_id = gl.tenant_id
              AND gc.listing_guesty_id = gl.guesty_id
              AND gc.date >= CURRENT_DATE
              AND gc.date < CURRENT_DATE + INTERVAL '30 days'
         ) cal ON TRUE
         LEFT JOIN LATERAL (
           SELECT po.owner_id AS guesty_owner_id, fo.display_name
             FROM fad_property_owners po
             LEFT JOIN fad_owners fo
               ON fo.tenant_id = po.tenant_id AND fo.guesty_owner_id = po.owner_id
            WHERE po.tenant_id = p.tenant_id
              AND po.property_id = p.id
              AND po.is_primary = TRUE
            LIMIT 1
         ) owner_join ON TRUE
         LEFT JOIN LATERAL (
           -- Window-correct (2026-05-25 fix): clip nights to the last
           -- 30 days, pro-rate revenue by overlap fraction. Mirrors
           -- backend/src/analytics/portfolio.js#aggregateWindow.
           WITH window_bounds AS (
             SELECT (CURRENT_DATE - INTERVAL '30 days')::date AS w_from,
                    CURRENT_DATE::date AS w_to
           ),
           overlap AS (
             SELECT
               GREATEST(LEAST(r.check_out_date, (wb.w_to + INTERVAL '1 day')::date) - GREATEST(r.check_in_date, wb.w_from), 0)::int AS nights_in_window,
               GREATEST(r.check_out_date - r.check_in_date, 0)::int AS total_stay_nights,
               r.total_amount_minor,
               r.currency_code
             FROM guesty_reservations r, window_bounds wb
             WHERE r.tenant_id = gl.tenant_id
               AND r.listing_guesty_id = gl.guesty_id
               AND r.check_in_date < (wb.w_to + INTERVAL '1 day')::date
               AND r.check_out_date > wb.w_from
               AND COALESCE(r.status, 'confirmed') NOT IN ('canceled', 'cancelled')
           )
           SELECT
             COALESCE(SUM(
               CASE
                 WHEN total_amount_minor IS NULL OR total_stay_nights = 0 THEN 0
                 ELSE ROUND(total_amount_minor::numeric * nights_in_window / total_stay_nights)
               END
             ), 0)::bigint AS revenue_minor,
             COUNT(*) FILTER (WHERE nights_in_window > 0)::int AS reservation_count,
             COALESCE(SUM(nights_in_window), 0)::int AS booked_nights,
             CASE
               WHEN COALESCE(SUM(nights_in_window), 0) > 0
                 THEN LEAST(100, ROUND(COALESCE(SUM(nights_in_window), 0)::numeric * 100 / 30))::int
               ELSE NULL
             END AS occupancy_pct,
             CASE
               WHEN COALESCE(SUM(nights_in_window), 0) > 0
                 THEN (
                   COALESCE(SUM(
                     CASE
                       WHEN total_amount_minor IS NULL OR total_stay_nights = 0 THEN 0
                       ELSE ROUND(total_amount_minor::numeric * nights_in_window / total_stay_nights)
                     END
                   ), 0) / COALESCE(SUM(nights_in_window), 1)
                 )::bigint
               ELSE NULL
             END AS adr_minor,
             (SELECT currency_code FROM overlap WHERE currency_code IS NOT NULL GROUP BY currency_code ORDER BY COUNT(*) DESC LIMIT 1) AS currency
           FROM overlap
         ) metrics ON TRUE
         WHERE ${filters.join(' AND ')}
         UNION ALL
         SELECT NULL::json AS guesty,
                row_to_json(p) AS overlay,
                p.code AS sort_code,
                NULL::text AS sort_nickname,
                NULL::bigint AS blocked_30d,
                NULL::bigint AS min_price_minor_30d,
                NULL::bigint AS max_price_minor_30d,
                NULL::timestamptz AS calendar_synced_at,
                owner_join.guesty_owner_id AS primary_owner_guesty_id,
                owner_join.display_name AS primary_owner_display_name,
                NULL::int AS metrics_occupancy_pct,
                NULL::bigint AS metrics_adr_minor,
                NULL::bigint AS metrics_revenue_minor,
                NULL::int AS metrics_booked_nights,
                NULL::int AS metrics_reservation_count,
                NULL::text AS metrics_currency
           FROM fad_properties p
           LEFT JOIN LATERAL (
             SELECT po.owner_id AS guesty_owner_id, fo.display_name
               FROM fad_property_owners po
               LEFT JOIN fad_owners fo
                 ON fo.tenant_id = po.tenant_id AND fo.guesty_owner_id = po.owner_id
              WHERE po.tenant_id = p.tenant_id
                AND po.property_id = p.id
                AND po.is_primary = TRUE
              LIMIT 1
           ) owner_join ON TRUE
          WHERE p.tenant_id = $1 AND p.guesty_id IS NULL
            ${typeof req.query.lifecycle === 'string'
              ? `AND p.lifecycle_status = $${params.length}` /* re-uses lifecycle param already pushed */
              : ''}
       ) merged
       ORDER BY sort_code NULLS LAST, sort_nickname NULLS LAST`,
      params,
    );
    res.json({ listings: rows.map(shapeMergedListing) });
  } catch (e) {
    console.error('[properties] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────────────────
// Single
// ────────────────────────────────────────────────────────────────

router.get('/:id', attachIdentity, async (req, res) => {
  try {
    const isUuid = UUID_RE.test(req.params.id);
    const params = [req.tenantId, req.params.id];
    const where = isUuid ? 'p.id = $2' : 'COALESCE(p.guesty_id, gl.guesty_id) = $2';
    const { rows } = await query(
      `SELECT
         row_to_json(gl) AS guesty,
         row_to_json(p) AS overlay,
         cal.blocked_30d,
         cal.min_price_minor_30d,
         cal.max_price_minor_30d,
         cal.calendar_synced_at,
         owner_join.guesty_owner_id AS primary_owner_guesty_id,
         owner_join.display_name AS primary_owner_display_name
       FROM fad_properties p
       LEFT JOIN guesty_listings gl
         ON gl.tenant_id = p.tenant_id AND gl.guesty_id = p.guesty_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*) FILTER (WHERE gc.is_available = FALSE) AS blocked_30d,
                MIN(gc.price_minor) FILTER (WHERE gc.price_minor IS NOT NULL) AS min_price_minor_30d,
                MAX(gc.price_minor) FILTER (WHERE gc.price_minor IS NOT NULL) AS max_price_minor_30d,
                MAX(gc.fetched_at) AS calendar_synced_at
           FROM guesty_calendar gc
          WHERE gc.tenant_id = COALESCE(p.tenant_id, gl.tenant_id)
            AND gc.listing_guesty_id = COALESCE(p.guesty_id, gl.guesty_id)
            AND gc.date >= CURRENT_DATE
            AND gc.date < CURRENT_DATE + INTERVAL '30 days'
       ) cal ON TRUE
       LEFT JOIN LATERAL (
         SELECT po.owner_id AS guesty_owner_id, fo.display_name
           FROM fad_property_owners po
           LEFT JOIN fad_owners fo
             ON fo.tenant_id = po.tenant_id AND fo.guesty_owner_id = po.owner_id
          WHERE po.tenant_id = p.tenant_id
            AND po.property_id = p.id
            AND po.is_primary = TRUE
          LIMIT 1
       ) owner_join ON TRUE
       WHERE p.tenant_id = $1 AND ${where}
       UNION ALL
       SELECT
         row_to_json(gl) AS guesty,
         NULL::json AS overlay,
         cal.blocked_30d,
         cal.min_price_minor_30d,
         cal.max_price_minor_30d,
         cal.calendar_synced_at,
         NULL::text AS primary_owner_guesty_id,
         NULL::text AS primary_owner_display_name
       FROM guesty_listings gl
       LEFT JOIN LATERAL (
         SELECT COUNT(*) FILTER (WHERE gc.is_available = FALSE) AS blocked_30d,
                MIN(gc.price_minor) FILTER (WHERE gc.price_minor IS NOT NULL) AS min_price_minor_30d,
                MAX(gc.price_minor) FILTER (WHERE gc.price_minor IS NOT NULL) AS max_price_minor_30d,
                MAX(gc.fetched_at) AS calendar_synced_at
           FROM guesty_calendar gc
          WHERE gc.tenant_id = gl.tenant_id
            AND gc.listing_guesty_id = gl.guesty_id
            AND gc.date >= CURRENT_DATE
            AND gc.date < CURRENT_DATE + INTERVAL '30 days'
       ) cal ON TRUE
       WHERE gl.tenant_id = $1 AND gl.guesty_id = $2
         AND NOT EXISTS (
           SELECT 1 FROM fad_properties p2
            WHERE p2.tenant_id = gl.tenant_id AND p2.guesty_id = gl.guesty_id
         )
       LIMIT 1`,
      params,
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Property not found' });
    res.json(shapeMergedListing(rows[0]));
  } catch (e) {
    console.error('[properties] get error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────────────────
// Manual create — POST /
// ────────────────────────────────────────────────────────────────
//
// Creates a FAD-native property in `prospect` or `onboarding` state.
// `guesty_id` is optional (NULL allowed for prospects). The frontend
// CreatePropertyDrawer sends camelCase; map to snake.

router.post('/', attachIdentity, async (req, res) => {
  if (req.identity?.userRole !== 'admin') {
    return res.status(403).json({ error: 'admin role required' });
  }
  const b = req.body || {};
  if (!b.code || typeof b.code !== 'string') {
    return res.status(400).json({ error: 'code required' });
  }
  if (!b.name || typeof b.name !== 'string') {
    return res.status(400).json({ error: 'name required' });
  }
  try {
    const insert = await query(
      `INSERT INTO fad_properties (
         tenant_id, code, name, building_name, address, region, area, zone, tier,
         geo_lat, geo_lng, listing_type, bedrooms, bathrooms, max_occupancy, sqm,
         description, lifecycle_status, onboarding_checklist, live_since,
         parent_property_id, is_combo, maintenance_cap_override_minor,
         contract_status, commission_pct, payment_day, contract_ends_at,
         contract_xodo_envelope_id, listings, base_rate_mur_minor, tags, amenities,
         is_syndic_managed, syndic_id, guesty_id
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15, $16,
         $17, $18, $19::jsonb, $20,
         $21, $22, $23,
         $24, $25, $26, $27,
         $28, $29::jsonb, $30, $31::jsonb, $32::jsonb,
         $33, $34, $35
       )
       RETURNING id, guesty_id`,
      [
        req.tenantId,
        b.code.trim(),
        b.name.trim(),
        b.buildingName || null,
        b.address || null,
        b.region || null,
        b.area || null,
        b.zone || null,
        b.tier || null,
        b.geo?.lat ?? null,
        b.geo?.lng ?? null,
        b.listingType || null,
        b.bedrooms ?? null,
        b.bathrooms ?? null,
        b.maxOccupancy ?? null,
        b.sqm ?? null,
        b.description || null,
        b.lifecycleStatus || 'onboarding',
        JSON.stringify(b.onboardingChecklist || {}),
        b.liveSince || null,
        b.parentPropertyId || null,
        !!b.isCombo,
        b.maintenanceCapOverrideMinor ?? null,
        b.contract?.status || null,
        b.contract?.commissionPct ?? null,
        b.contract?.paymentDay ?? null,
        b.contract?.endsAt || null,
        b.contract?.xodoEnvelopeId || null,
        JSON.stringify(b.listings || []),
        b.baseRateMUR ?? null,
        JSON.stringify(b.tags || []),
        JSON.stringify(b.amenities || []),
        !!b.isSyndicManaged,
        b.syndicId || null,
        b.guestyId || null,
      ],
    );
    const propertyId = insert.rows[0].id;
    // Seed activity log
    await query(
      `INSERT INTO property_activity_log (tenant_id, property_id, kind, actor_id, detail)
       VALUES ($1, $2, 'lifecycle_changed', $3, $4)`,
      [
        req.tenantId, propertyId,
        req.identity?.userId || null,
        `Property created in ${b.lifecycleStatus || 'onboarding'} state · code ${b.code.trim()}`,
      ],
    );
    // Primary owner — if provided, seed property_owners row
    if (b.primaryOwnerId) {
      await query(
        `INSERT INTO property_owners (tenant_id, property_id, owner_id, ownership_pct, is_primary)
         VALUES ($1, $2, $3, 100, TRUE)
         ON CONFLICT DO NOTHING`,
        [req.tenantId, propertyId, b.primaryOwnerId],
      );
    }
    // Return the freshly merged shape
    const { rows: shaped } = await query(
      `SELECT row_to_json(gl) AS guesty, row_to_json(p) AS overlay,
              NULL::bigint AS blocked_30d, NULL::bigint AS min_price_minor_30d,
              NULL::bigint AS max_price_minor_30d, NULL::timestamptz AS calendar_synced_at
         FROM fad_properties p
         LEFT JOIN guesty_listings gl
           ON gl.tenant_id = p.tenant_id AND gl.guesty_id = p.guesty_id
        WHERE p.id = $1`,
      [propertyId],
    );
    res.status(201).json(shapeMergedListing(shaped[0]));
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'code already in use for this tenant' });
    }
    console.error('[properties] create error:', e.message);
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
    const summary = await syncListingsForTenant(req.tenantId);
    res.json({ ok: true, ...summary });
  } catch (e) {
    console.error('[properties] sync error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────────────────
// Cards — AI-knowledge surface (replaces Breezeway FAQs)
// ────────────────────────────────────────────────────────────────

router.get('/:id/cards', attachIdentity, async (req, res) => {
  try {
    const resolved = await resolvePropertyId(req.tenantId, req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Property not found' });
    const { rows } = await query(
      `SELECT * FROM property_cards
        WHERE tenant_id = $1 AND (property_id = $2 OR property_id IS NULL)
        ORDER BY category, updated_at DESC`,
      [req.tenantId, resolved.propertyId],
    );
    res.json({ cards: rows });
  } catch (e) {
    console.error('[properties] cards list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/cards', attachIdentity, async (req, res) => {
  try {
    const resolved = await resolvePropertyId(req.tenantId, req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Property not found' });
    const b = req.body || {};
    if (!b.category || !b.title) {
      return res.status(400).json({ error: 'category and title required' });
    }
    const { rows } = await query(
      `INSERT INTO property_cards
         (tenant_id, property_id, category, title, body, surface, source,
          ai_thread_id, ai_confidence, last_updated_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        req.tenantId,
        b.scope === 'global' ? null : resolved.propertyId,
        b.category,
        b.title,
        b.body || '',
        b.surface || 'internal_only',
        b.source || 'manual',
        b.aiThreadId || null,
        b.aiConfidence ?? null,
        req.identity?.userId || null,
      ],
    );
    await query(
      `INSERT INTO property_activity_log (tenant_id, property_id, kind, actor_id, detail)
       VALUES ($1, $2, 'card_added', $3, $4)`,
      [req.tenantId, resolved.propertyId, req.identity?.userId || null, `Card added · ${b.category} · ${b.title}`],
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('[properties] card create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/cards/:cardId', attachIdentity, async (req, res) => {
  try {
    const resolved = await resolvePropertyId(req.tenantId, req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Property not found' });
    const b = req.body || {};
    const sets = [];
    const params = [req.tenantId, req.params.cardId];
    let i = 3;
    if (typeof b.title === 'string') { sets.push(`title = $${i++}`); params.push(b.title); }
    if (typeof b.body === 'string') { sets.push(`body = $${i++}`); params.push(b.body); }
    if (typeof b.category === 'string') { sets.push(`category = $${i++}`); params.push(b.category); }
    if (typeof b.surface === 'string') { sets.push(`surface = $${i++}`); params.push(b.surface); }
    if (req.identity?.userId) { sets.push(`last_updated_by_user_id = $${i++}`); params.push(req.identity.userId); }
    if (sets.length === 0) return res.status(400).json({ error: 'no fields to update' });
    const { rows } = await query(
      `UPDATE property_cards SET ${sets.join(', ')}
        WHERE tenant_id = $1 AND id = $2 RETURNING *`,
      params,
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Card not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('[properties] card patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id/cards/:cardId', attachIdentity, async (req, res) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM property_cards WHERE tenant_id = $1 AND id = $2',
      [req.tenantId, req.params.cardId],
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Card not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[properties] card delete error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────────────────
// Owners — N:M with ownership_pct
// ────────────────────────────────────────────────────────────────

router.get('/:id/owners', attachIdentity, async (req, res) => {
  try {
    const resolved = await resolvePropertyId(req.tenantId, req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Property not found' });
    const { rows } = await query(
      `SELECT id, property_id, owner_id, ownership_pct, is_primary, created_at, updated_at
         FROM property_owners
        WHERE tenant_id = $1 AND property_id = $2
        ORDER BY is_primary DESC, ownership_pct DESC`,
      [req.tenantId, resolved.propertyId],
    );
    res.json({ owners: rows });
  } catch (e) {
    console.error('[properties] owners list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/owners', attachIdentity, async (req, res) => {
  try {
    const resolved = await resolvePropertyId(req.tenantId, req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Property not found' });
    const b = req.body || {};
    if (!b.ownerId) return res.status(400).json({ error: 'ownerId required' });
    const { rows } = await query(
      `INSERT INTO property_owners (tenant_id, property_id, owner_id, ownership_pct, is_primary)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, property_id, owner_id)
       DO UPDATE SET ownership_pct = EXCLUDED.ownership_pct,
                     is_primary = EXCLUDED.is_primary
       RETURNING *`,
      [req.tenantId, resolved.propertyId, b.ownerId, b.ownershipPct ?? 100, !!b.isPrimary],
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('[properties] owner upsert error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id/owners/:ownerRowId', attachIdentity, async (req, res) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM property_owners WHERE tenant_id = $1 AND id = $2',
      [req.tenantId, req.params.ownerRowId],
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Owner row not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[properties] owner delete error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────────────────
// Photos — schema-only Phase 1
// ────────────────────────────────────────────────────────────────

router.get('/:id/photos', attachIdentity, async (req, res) => {
  try {
    const resolved = await resolvePropertyId(req.tenantId, req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Property not found' });
    const { rows } = await query(
      `SELECT * FROM property_photos
        WHERE tenant_id = $1 AND property_id = $2
        ORDER BY is_hero DESC, display_order ASC, created_at DESC`,
      [req.tenantId, resolved.propertyId],
    );
    res.json({ photos: rows });
  } catch (e) {
    console.error('[properties] photos list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/photos', attachIdentity, async (req, res) => {
  try {
    const resolved = await resolvePropertyId(req.tenantId, req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Property not found' });
    const b = req.body || {};
    if (!b.storageKey) return res.status(400).json({ error: 'storageKey required' });
    const { rows } = await query(
      `INSERT INTO property_photos
         (tenant_id, property_id, storage_key, url, alt_text, is_hero,
          display_order, tags, channels, uploaded_by, width, height, bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13)
       RETURNING *`,
      [
        req.tenantId, resolved.propertyId,
        b.storageKey,
        b.url || null,
        b.altText || null,
        !!b.isHero,
        b.displayOrder ?? 0,
        JSON.stringify(b.tags || []),
        JSON.stringify(b.channels || []),
        req.identity?.userId || null,
        b.width ?? null,
        b.height ?? null,
        b.bytes ?? null,
      ],
    );
    if (b.isHero) {
      // Clear other heroes + set this as hero pointer
      await query(
        `UPDATE property_photos SET is_hero = FALSE
          WHERE tenant_id = $1 AND property_id = $2 AND id <> $3`,
        [req.tenantId, resolved.propertyId, rows[0].id],
      );
      await query(
        'UPDATE fad_properties SET hero_photo_id = $1 WHERE id = $2',
        [rows[0].id, resolved.propertyId],
      );
    }
    await query(
      `INSERT INTO property_activity_log (tenant_id, property_id, kind, actor_id, detail)
       VALUES ($1, $2, 'photo_updated', $3, $4)`,
      [req.tenantId, resolved.propertyId, req.identity?.userId || null, 'Photo added'],
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('[properties] photo create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id/photos/:photoId', attachIdentity, async (req, res) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM property_photos WHERE tenant_id = $1 AND id = $2',
      [req.tenantId, req.params.photoId],
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Photo not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[properties] photo delete error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────────────────
// Onboarding artifacts — UPSERT by type
// ────────────────────────────────────────────────────────────────

router.get('/:id/onboarding-artifacts', attachIdentity, async (req, res) => {
  try {
    const resolved = await resolvePropertyId(req.tenantId, req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Property not found' });
    const { rows } = await query(
      `SELECT * FROM property_onboarding_artifacts
        WHERE tenant_id = $1 AND property_id = $2
        ORDER BY artifact_type ASC`,
      [req.tenantId, resolved.propertyId],
    );
    res.json({ artifacts: rows });
  } catch (e) {
    console.error('[properties] onboarding list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/onboarding-artifacts', attachIdentity, async (req, res) => {
  try {
    const resolved = await resolvePropertyId(req.tenantId, req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Property not found' });
    const b = req.body || {};
    if (!b.artifactType) return res.status(400).json({ error: 'artifactType required' });
    const { rows } = await query(
      `INSERT INTO property_onboarding_artifacts
         (tenant_id, property_id, artifact_type, status, started_at,
          completed_at, assigned_to_user_id, notes, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       ON CONFLICT (tenant_id, property_id, artifact_type) DO UPDATE
         SET status = EXCLUDED.status,
             started_at = COALESCE(property_onboarding_artifacts.started_at, EXCLUDED.started_at),
             completed_at = EXCLUDED.completed_at,
             assigned_to_user_id = EXCLUDED.assigned_to_user_id,
             notes = EXCLUDED.notes,
             payload = EXCLUDED.payload
       RETURNING *`,
      [
        req.tenantId, resolved.propertyId,
        b.artifactType,
        b.status || 'not_started',
        b.startedAt || (b.status && b.status !== 'not_started' ? new Date().toISOString() : null),
        b.status === 'complete' ? (b.completedAt || new Date().toISOString()) : null,
        b.assignedToUserId || null,
        b.notes || null,
        JSON.stringify(b.payload || {}),
      ],
    );
    if (rows[0].status === 'complete') {
      // Mirror to onboarding_checklist on the property
      await query(
        `UPDATE fad_properties
            SET onboarding_checklist = jsonb_set(
              onboarding_checklist,
              ARRAY[$1::text],
              '"complete"'::jsonb,
              true
            )
          WHERE id = $2`,
        [b.artifactType, resolved.propertyId],
      );
      await query(
        `INSERT INTO property_activity_log (tenant_id, property_id, kind, actor_id, detail)
         VALUES ($1, $2, 'onboarding_step_complete', $3, $4)`,
        [req.tenantId, resolved.propertyId, req.identity?.userId || null,
         `Artifact complete · ${b.artifactType}`],
      );
    }
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('[properties] onboarding upsert error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────────────────
// Activity log
// ────────────────────────────────────────────────────────────────

router.get('/:id/activity', attachIdentity, async (req, res) => {
  try {
    const resolved = await resolvePropertyId(req.tenantId, req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Property not found' });
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100;
    const { rows } = await query(
      `SELECT id, kind, actor_id, detail, metadata, ts
         FROM property_activity_log
        WHERE tenant_id = $1 AND property_id = $2
        ORDER BY ts DESC
        LIMIT ${limit}`,
      [req.tenantId, resolved.propertyId],
    );
    res.json({ activity: rows });
  } catch (e) {
    console.error('[properties] activity error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
