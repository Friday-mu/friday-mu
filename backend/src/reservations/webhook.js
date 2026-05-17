'use strict';

// Guesty webhook receiver.
//
// Guesty signs each webhook with HMAC-SHA256 over the raw body using
// the secret configured in their dashboard (GUESTY_WEBHOOK_SECRET on
// our side). Signature lives in the `x-guesty-signature` header.
//
// Mounted at POST /api/integrations/guesty/webhook in server.js. The
// route uses express.raw() so we can re-hash the exact bytes Guesty
// signed — express.json() would have parsed-and-restringified, which
// changes whitespace and breaks the HMAC.
//
// We respond fast (200 + ack), then UPSERT the reservation in the
// background. Guesty retries on non-2xx, and we don't want them
// stacking up because a single sync was slow.

const crypto = require('crypto');
const { upsertReservationById } = require('./sync');
const { FR_TENANT_ID } = require('./worker');
const { isMessageEvent, handleMessageEvent } = require('../inbox/guesty_message_webhook');

const WEBHOOK_SECRET = process.env.GUESTY_WEBHOOK_SECRET;

function verifySignature(rawBody, signature) {
  if (!WEBHOOK_SECRET) return false;
  if (typeof signature !== 'string' || signature.length === 0) return false;
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex'),
    );
  } catch {
    return false;
  }
}

// Reservation-shaped event types we care about. Listings rely on the
// 5-min poll since edits are rare.
const RESERVATION_EVENTS = new Set([
  'reservation.created',
  'reservation.updated',
  'reservation.canceled',
  'reservation.confirmed',
]);

async function handleWebhook(req, res) {
  const sig = req.get('x-guesty-signature') || req.get('X-Guesty-Signature');
  const rawBody = req.body; // Buffer — see express.raw() mount
  if (!Buffer.isBuffer(rawBody)) {
    return res.status(400).json({ error: 'expected raw body' });
  }
  if (!verifySignature(rawBody, sig)) {
    console.warn('[guesty/webhook] signature mismatch — rejecting');
    return res.status(401).json({ error: 'invalid signature' });
  }
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf-8'));
  } catch {
    return res.status(400).json({ error: 'invalid JSON' });
  }
  const type = event?.event || event?.type;

  // Message events: handle inline (no Guesty API refetch needed —
  // payload contains the whole message). This is the rate-limit
  // escape valve, so we want it on the fast path.
  if (isMessageEvent(type)) {
    res.json({ ok: true, queued: 'message' });
    handleMessageEvent(event).catch((e) => {
      console.error(`[guesty/webhook/msg] handler failed:`, e.message);
    });
    return;
  }

  if (!RESERVATION_EVENTS.has(type)) {
    // Not interested — but ack so Guesty doesn't retry.
    return res.json({ ok: true, ignored: type });
  }
  const reservationId = event?.reservation?._id || event?.data?._id || event?.reservationId;
  if (!reservationId) {
    return res.json({ ok: true, ignored: 'no reservation id in payload' });
  }
  // Ack immediately, sync in the background. Guesty's docs: timeout
  // 10s. Our refetch + UPSERT is usually <2s but bursty traffic
  // could stack — fire-and-forget here keeps the receiver snappy.
  res.json({ ok: true, queued: reservationId });
  // v1: only FR has a Guesty integration, so the tenant is implied.
  // When per-tenant integrations land, the webhook URL gains a
  // tenant slug or signs include a tenant id.
  upsertReservationById(FR_TENANT_ID, reservationId).catch((e) => {
    console.error(`[guesty/webhook] upsert ${reservationId} failed:`, e.message);
  });
}

module.exports = { handleWebhook };
