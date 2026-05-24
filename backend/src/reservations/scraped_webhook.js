'use strict';

// Receiver for scrape-reservations.mjs — Layer-3 reservations ingest.
//
// The Layer-1 Guesty Open API poller populates guesty_reservations
// with real Guesty `_id` values. When that API is rate-limited (5
// OAuth mints / 24h), the website starves for fresh availability
// data. This endpoint accepts scraped reservation summaries from
// the Playwright scraper and upserts them with a SYNTHESIZED
// guesty_id (`scrape:<confirmationCode>`) so they coexist with API
// rows without collision.
//
// When the API recovers and inserts real-ID rows for the same
// confirmation codes, both will exist briefly. A future cleanup job
// will dedup: any `scrape:` row with a matching confirmation_code in
// a real-ID row gets deleted.
//
// Mount: POST /api/integrations/guesty/scraped-reservations
// Body parsing: express.raw (rawBody for HMAC verification).
// Signature: x-guesty-signature (hex HMAC-SHA256 over GUESTY_WEBHOOK_SECRET).

const crypto = require('crypto');
const { query } = require('../database/client');

const SCRAPE_SECRET = process.env.GUESTY_WEBHOOK_SECRET;
const FR_TENANT_ID = '00000000-0000-0000-0000-000000000001';

function tryTimingSafeEqual(a, b) {
  try {
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function verifySignature(rawBody, headers) {
  const sig = headers['x-guesty-signature'];
  if (!sig || !SCRAPE_SECRET) return false;
  const expected = crypto.createHmac('sha256', SCRAPE_SECRET).update(rawBody).digest('hex');
  return tryTimingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'));
}

function nightsFrom(checkInDate, checkOutDate) {
  if (!checkInDate || !checkOutDate) return null;
  try {
    const ms = new Date(checkOutDate).getTime() - new Date(checkInDate).getTime();
    if (!Number.isFinite(ms) || ms < 0) return null;
    return Math.round(ms / 86_400_000);
  } catch { return null; }
}

async function handleScrapedReservation(req, res) {
  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody)) {
    return res.status(400).json({ error: 'expected raw body' });
  }
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = v;
  if (!verifySignature(rawBody, headers)) {
    console.warn('[guesty/scraped-reservations] signature mismatch — rejecting');
    return res.status(401).json({ error: 'invalid signature' });
  }
  let payload;
  try { payload = JSON.parse(rawBody.toString('utf-8')); }
  catch { return res.status(400).json({ error: 'invalid JSON' }); }

  const r = payload?.reservation;
  if (!r || !r.confirmationCode) {
    return res.status(400).json({ error: 'missing reservation.confirmationCode' });
  }

  const syntheticId = `scrape:${r.confirmationCode}`;
  const listingGuestyId = r.listingNickname || 'unknown';  // best-effort; real
                                                            // _id arrives via API poller
  const nights = nightsFrom(r.checkInDate, r.checkOutDate);

  // Split "First Last" → first_name + last_name. Without this the
  // FAD reservations list renders every scraper row as "Guest"
  // (transformReservation falls back to that when both name halves
  // are null). For names like "Maria Del Carmen Lopez", first_name
  // captures the first token and last_name captures the rest —
  // imperfect but recognizable in the UI; the API path will overwrite
  // with proper structured data when it recovers.
  let guestFirst = null, guestLast = null;
  if (typeof r.guestName === 'string' && r.guestName.trim()) {
    const parts = r.guestName.trim().split(/\s+/);
    guestFirst = parts[0] || null;
    guestLast = parts.slice(1).join(' ') || null;
  }

  try {
    // Scrape-vs-API guardrail (2026-05-25): if Guesty's API has already
    // returned this reservation (matched on confirmation_code), the API
    // row is authoritative — skip the scrape insert entirely so it can't
    // shadow the real record. Pre-existing scrape rows from before this
    // change are swept by migration 084 + the dedup in sync.js.
    if (r.confirmationCode) {
      const existing = await query(
        `SELECT 1 FROM guesty_reservations
          WHERE tenant_id = $1
            AND confirmation_code = $2
            AND source IS NOT NULL
            AND source <> 'scrape-l3'
          LIMIT 1`,
        [FR_TENANT_ID, r.confirmationCode],
      );
      if (existing.rows.length > 0) {
        console.log('[scraped-reservations] skip — API row exists for %s', r.confirmationCode);
        return res.json({ ok: true, skipped: 'api_row_authoritative', confirmationCode: r.confirmationCode });
      }
    }

    await query(
      `INSERT INTO guesty_reservations (
         tenant_id, guesty_id, listing_guesty_id, confirmation_code,
         status, source, channel,
         check_in_date, check_out_date,
         guest_first_name, guest_last_name,
         raw, synced_at
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7,
         $8, $9,
         $10, $11,
         $12, NOW()
       )
       ON CONFLICT (tenant_id, guesty_id) DO UPDATE SET
         listing_guesty_id = EXCLUDED.listing_guesty_id,
         confirmation_code = EXCLUDED.confirmation_code,
         check_in_date     = EXCLUDED.check_in_date,
         check_out_date    = EXCLUDED.check_out_date,
         guest_first_name  = COALESCE(EXCLUDED.guest_first_name, guesty_reservations.guest_first_name),
         guest_last_name   = COALESCE(EXCLUDED.guest_last_name,  guesty_reservations.guest_last_name),
         raw               = EXCLUDED.raw,
         synced_at         = NOW(),
         updated_at        = NOW()`,
      [
        FR_TENANT_ID,
        syntheticId,
        listingGuestyId,
        r.confirmationCode,
        'confirmed',          // scrape only sees the upcoming-confirmed view
        'scrape-l3',
        null,                 // channel not exposed in summary view
        r.checkInDate,
        r.checkOutDate,
        guestFirst,
        guestLast,
        JSON.stringify({
          scrape: r,
          scrapedAt: payload.scrapedAt,
          nightsDerived: nights,
        }),
      ],
    );
    res.json({ ok: true, id: syntheticId });
  } catch (e) {
    console.error('[guesty/scraped-reservations] upsert error:', e.message);
    res.status(500).json({ error: e.message });
  }
}

module.exports = { handleScrapedReservation };
