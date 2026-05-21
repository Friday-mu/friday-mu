'use strict';

// Guesty webhook receiver.
//
// Guesty delivers webhooks via Svix. The signature scheme is:
//   - Headers: svix-id, svix-timestamp, svix-signature
//   - Algorithm: HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${rawBody}`
//   - Encoded base64; svix-signature value is `v1,<base64>` (multiple
//     space-separated versions tolerated during secret rotation).
//   - Secret format: `whsec_<base64>` — fetched from Guesty's
//     /webhooks/secret endpoint after registering the subscription.
//
// We ALSO support a legacy HMAC-hex scheme so the Layer-3 Mac scraper
// (scripts/guesty-scraper) can post synthesised events through the
// same ingestion path without faking Svix headers. The scraper sends
// `x-guesty-signature: <hex>` over its own secret.
//
// Body parsing: this route uses express.raw() (mounted in server.js)
// so we re-hash the EXACT bytes that were signed. The global
// express.json() bodyparser is skipped for this path — see the path
// allowlist near the top of server.js.
//
// Mount: POST /api/integrations/guesty/webhook. See server.js.

const crypto = require('crypto');
const { upsertReservationById } = require('./sync');
const { FR_TENANT_ID } = require('./worker');
const { isMessageEvent, handleMessageEvent } = require('../inbox/guesty_message_webhook');
const { refreshCalendarForListing } = require('../guesty_calendar');

const SVIX_SECRET = process.env.GUESTY_SVIX_SECRET;        // whsec_…
const LEGACY_SECRET = process.env.GUESTY_WEBHOOK_SECRET;   // for scraper

function tryTimingSafeEqual(a, b) {
  try {
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function verifySvix(rawBody, headers) {
  const svixId = headers['svix-id'];
  const svixTs = headers['svix-timestamp'];
  const svixSig = headers['svix-signature'];
  if (!svixId || !svixTs || !svixSig) return false;
  if (!SVIX_SECRET) return false;

  // Decode the secret. Svix-style secrets are `whsec_<base64>`; the
  // base64-decoded value is what we HMAC with.
  const secretBytes = SVIX_SECRET.startsWith('whsec_')
    ? Buffer.from(SVIX_SECRET.slice(6), 'base64')
    : Buffer.from(SVIX_SECRET, 'utf-8');

  const signedPayload = `${svixId}.${svixTs}.${rawBody.toString('utf-8')}`;
  const expected = crypto.createHmac('sha256', secretBytes).update(signedPayload).digest();

  // svix-signature may carry multiple `v1,<sig>` entries, space-separated.
  const candidates = svixSig.split(' ').map((entry) => {
    const [version, encoded] = entry.split(',');
    return version === 'v1' && encoded ? Buffer.from(encoded, 'base64') : null;
  }).filter(Boolean);

  for (const sig of candidates) {
    if (tryTimingSafeEqual(expected, sig)) return true;
  }
  return false;
}

function verifyLegacyHmac(rawBody, headers) {
  const sig = headers['x-guesty-signature'];
  if (!sig || !LEGACY_SECRET) return false;
  const expected = crypto.createHmac('sha256', LEGACY_SECRET).update(rawBody).digest('hex');
  return tryTimingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'));
}

function verifySignature(rawBody, headers) {
  // Try Svix first (real Guesty deliveries). Fall back to legacy HMAC
  // (our scraper). Either one is sufficient.
  if (verifySvix(rawBody, headers)) return 'svix';
  if (verifyLegacyHmac(rawBody, headers)) return 'legacy';
  return null;
}

// Guesty's actual reservation event names (camelCase per Svix-era docs).
const RESERVATION_EVENTS = new Set([
  'reservation.created',
  'reservation.updated',
  'reservation.canceled',
  'reservation.confirmed',
  // Some older payloads use these — keep for compatibility.
  'reservation.new',
  'reservation.modified',
]);

async function handleWebhook(req, res) {
  const rawBody = req.body; // Buffer — see express.raw() mount
  if (!Buffer.isBuffer(rawBody)) {
    return res.status(400).json({ error: 'expected raw body' });
  }
  // Normalise headers to lowercase for cross-source compatibility.
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = v;

  const verifiedAs = verifySignature(rawBody, headers);
  if (!verifiedAs) {
    console.warn('[guesty/webhook] signature mismatch — rejecting');
    return res.status(401).json({ error: 'invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf-8'));
  } catch {
    return res.status(400).json({ error: 'invalid JSON' });
  }
  const type = event?.event;

  // Message events: handle inline (no Guesty API refetch needed —
  // payload contains the whole message). This is the rate-limit
  // escape valve, so we want it on the fast path.
  if (isMessageEvent(type)) {
    res.json({ ok: true, queued: 'message', via: verifiedAs });
    handleMessageEvent(event).catch((e) => {
      console.error(`[guesty/webhook/msg] handler failed:`, e.message);
    });
    return;
  }

  if (!RESERVATION_EVENTS.has(type)) {
    return res.json({ ok: true, ignored: type, via: verifiedAs });
  }
  // Guesty flattens the reservation id to the top of the payload.
  const reservationId = event?.reservationId || event?.reservation?._id || event?.data?._id;
  if (!reservationId) {
    return res.json({ ok: true, ignored: 'no reservation id in payload' });
  }
  res.json({ ok: true, queued: reservationId, via: verifiedAs });
  upsertReservationById(FR_TENANT_ID, reservationId)
    .then((summary) => {
      if (!summary?.listingId || !summary?.checkInDate || !summary?.checkOutDate) return null;
      return refreshCalendarForListing({
        tenantId: FR_TENANT_ID,
        listingId: summary.listingId,
        fromIso: summary.checkInDate,
        toIso: summary.checkOutDate,
      });
    })
    .catch((e) => {
      console.error(`[guesty/webhook] upsert/calendar refresh ${reservationId} failed:`, e.message);
    });
}

module.exports = { handleWebhook };
