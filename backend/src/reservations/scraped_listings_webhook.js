'use strict';

// Receiver for scrape-listings.mjs — Layer-3 listings ingest.
//
// Mirrors scraped_webhook.js (reservations). Upserts into the
// guesty_listings table with a synthesized guesty_id of
// `scrape:listing:<nickname>` so it coexists with API-poller rows.
//
// SCAFFOLD: this is permissive on the payload shape because the
// scraper sends `listing` as a raw {datakey:value} map (the exact
// datakeys from /properties aren't confirmed yet — first
// proven-correct run will iterate the contract).
//
// Mount: POST /api/integrations/guesty/scraped-listings
// Body parsing: express.raw (rawBody for HMAC verification).

const crypto = require('crypto');
const { query } = require('../database/client');

const SCRAPE_SECRET = process.env.GUESTY_WEBHOOK_SECRET;
const FR_TENANT_ID = '00000000-0000-0000-0000-000000000001';

function tryTimingSafeEqual(a, b) {
  try {
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

function verifySignature(rawBody, headers) {
  const sig = headers['x-guesty-signature'];
  if (!sig || !SCRAPE_SECRET) return false;
  const expected = crypto.createHmac('sha256', SCRAPE_SECRET).update(rawBody).digest('hex');
  return tryTimingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'));
}

// Field extractors. The scraper sends `listing` as either:
//   - A typed object with named fields (nickname, title, address, …)
//   - A raw {datakey: stringValue} map (when datakeys are unconfirmed)
// We try named fields first, fall back to datakey lookup.
function pick(listing, ...keys) {
  for (const k of keys) {
    if (listing[k] != null && listing[k] !== '') return listing[k];
    if (listing.allCells?.[k] != null && listing.allCells[k] !== '') return listing.allCells[k];
  }
  return null;
}

async function handleScrapedListing(req, res) {
  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody)) {
    return res.status(400).json({ error: 'expected raw body' });
  }
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = v;
  if (!verifySignature(rawBody, headers)) {
    console.warn('[guesty/scraped-listings] signature mismatch — rejecting');
    return res.status(401).json({ error: 'invalid signature' });
  }
  let payload;
  try { payload = JSON.parse(rawBody.toString('utf-8')); }
  catch { return res.status(400).json({ error: 'invalid JSON' }); }

  const l = payload?.listing;
  if (!l) return res.status(400).json({ error: 'missing listing' });

  // Derive the canonical nickname — the only key the dedup hangs off.
  const nickname = pick(l, 'nickname', 'title', 'name', 'listingNickname');
  if (!nickname) {
    return res.status(400).json({ error: 'missing listing.nickname (or title/name)' });
  }

  const syntheticId = `scrape:listing:${nickname}`;
  const title = pick(l, 'title', 'name', 'listingTitle');
  const addressFull = pick(l, 'address', 'addressFull');
  const addressCity = pick(l, 'city', 'addressCity');
  const bedrooms = pick(l, 'bedrooms', 'numBedrooms');
  const bathrooms = pick(l, 'bathrooms', 'numBathrooms');
  const basePriceRaw = pick(l, 'basePrice', 'price', 'baseRate');
  // basePrice might come in as "$220" or "220 EUR" — strip non-digits.
  let basePriceMinor = null;
  if (basePriceRaw) {
    const num = parseFloat(String(basePriceRaw).replace(/[^0-9.]/g, ''));
    if (Number.isFinite(num)) basePriceMinor = Math.round(num * 100);
  }
  const currency = pick(l, 'currency', 'currencyCode');

  try {
    await query(
      `INSERT INTO guesty_listings (
         tenant_id, guesty_id, nickname, title,
         address_full, address_city,
         bedrooms, bathrooms, base_price_minor, currency_code,
         is_active, raw, synced_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10,
         TRUE, $11, NOW()
       )
       ON CONFLICT (tenant_id, guesty_id) DO UPDATE SET
         nickname         = EXCLUDED.nickname,
         title            = EXCLUDED.title,
         address_full     = EXCLUDED.address_full,
         address_city     = EXCLUDED.address_city,
         bedrooms         = EXCLUDED.bedrooms,
         bathrooms        = EXCLUDED.bathrooms,
         base_price_minor = EXCLUDED.base_price_minor,
         currency_code    = EXCLUDED.currency_code,
         raw              = EXCLUDED.raw,
         synced_at        = NOW(),
         updated_at       = NOW()`,
      [
        FR_TENANT_ID,
        syntheticId,
        nickname,
        title,
        addressFull,
        addressCity,
        bedrooms ? Number(bedrooms) : null,
        bathrooms ? Number(bathrooms) : null,
        basePriceMinor,
        currency,
        JSON.stringify({ scrape: l, scrapedAt: payload.scrapedAt }),
      ],
    );
    res.json({ ok: true, id: syntheticId });
  } catch (e) {
    console.error('[guesty/scraped-listings] upsert error:', e.message);
    res.status(500).json({ error: e.message });
  }
}

module.exports = { handleScrapedListing };
