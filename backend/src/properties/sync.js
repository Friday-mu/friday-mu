'use strict';

// Pulls listings from Guesty and upserts them into the local
// `guesty_listings` cache. Intended to be called by:
//   - the 5-minute polling worker (`worker.js`)
//   - the manual re-sync admin endpoint
//   - the deploy-warmup path (one-shot at startup, optional)
//
// Tenant-scoped: takes a tenantId so a future multi-tenant rollout
// just stores per-tenant Guesty credentials and loops over tenants
// here. v1 only the env-var FR credentials are wired, so callers
// always pass `FR_TENANT_ID` for now.

const { query } = require('../database/client');
const { listListings } = require('../integrations/guesty');

// Reuse the same city → cohort mapping that server.js's review handler
// uses, so the Properties UI groups listings the same way as Reviews.
// Lift here so we don't depend on server.js, which mixes a lot of
// other state.
function cohortFromCity(city) {
  const c = String(city || '').trim().toLowerCase();
  if (!c) return 'other';
  if (c === 'flic en flac' || c === 'flic-en-flac' || c.includes('flic en flac')) return 'flic_en_flac';
  if (c === 'grand baie' || c === 'mont choisy' || c.includes('grand baie') || c.includes('mont choisy')) return 'grand_baie';
  if (c === 'pereybere') return 'pereybere';
  if (c === 'bel ombre' || c.includes('bel ombre')) return 'bel_ombre';
  if (c === 'tamarin' || c === 'black river' || c.includes('riviere noire') || c.includes('rivière noire') || c === 'arsenal') return 'west';
  return 'other';
}

// Pull a flat array of Guesty listing payloads and upsert each into
// guesty_listings keyed by (tenant_id, guesty_id). Returns
// { fetched, inserted, updated, durationMs }.
async function syncListingsForTenant(tenantId, opts = {}) {
  if (!tenantId) throw new Error('syncListingsForTenant: tenantId is required');
  const startedAt = Date.now();
  const listings = await listListings({ limit: opts.limit || 100 });

  let inserted = 0;
  let updated = 0;
  for (const listing of listings) {
    if (!listing?._id) continue;
    const address = listing.address || {};
    const picture = listing.picture?.thumbnail
      || listing.picture?.regular
      || listing.picture?.large
      || (Array.isArray(listing.pictures) && listing.pictures[0]?.thumbnail)
      || null;
    const basePrice = Number.isFinite(listing.prices?.basePrice)
      ? Math.round(listing.prices.basePrice * 100)
      : null;
    const result = await query(
      `INSERT INTO guesty_listings (
         tenant_id, guesty_id, nickname, title,
         address_full, address_city, address_country, cohort,
         picture_url, property_type, bedrooms, bathrooms, accommodates,
         base_price_minor, currency_code, is_active, raw
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (tenant_id, guesty_id) DO UPDATE SET
         nickname        = EXCLUDED.nickname,
         title           = EXCLUDED.title,
         address_full    = EXCLUDED.address_full,
         address_city    = EXCLUDED.address_city,
         address_country = EXCLUDED.address_country,
         cohort          = EXCLUDED.cohort,
         picture_url     = EXCLUDED.picture_url,
         property_type   = EXCLUDED.property_type,
         bedrooms        = EXCLUDED.bedrooms,
         bathrooms       = EXCLUDED.bathrooms,
         accommodates    = EXCLUDED.accommodates,
         base_price_minor = EXCLUDED.base_price_minor,
         currency_code   = EXCLUDED.currency_code,
         is_active       = EXCLUDED.is_active,
         raw             = EXCLUDED.raw,
         synced_at       = NOW(),
         updated_at      = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        tenantId,
        String(listing._id),
        listing.nickname || null,
        listing.title || listing.name || null,
        address.full || null,
        address.city || null,
        address.country || null,
        cohortFromCity(address.city),
        picture,
        listing.propertyType || null,
        Number.isFinite(listing.bedrooms) ? listing.bedrooms : null,
        Number.isFinite(listing.bathrooms) ? listing.bathrooms : null,
        Number.isFinite(listing.accommodates) ? listing.accommodates : null,
        basePrice,
        listing.prices?.currency || null,
        listing.active !== false,
        JSON.stringify(listing),
      ],
    );
    if (result.rows[0]?.inserted) inserted++;
    else updated++;
  }

  return {
    fetched: listings.length,
    inserted,
    updated,
    durationMs: Date.now() - startedAt,
  };
}

module.exports = { syncListingsForTenant, cohortFromCity };
