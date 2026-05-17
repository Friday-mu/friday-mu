'use strict';

// Guesty message-event handler.
//
// Called by reservations/webhook.js dispatcher after signature
// verification succeeds. Inserts inbound/outbound messages straight
// from the webhook payload — no Guesty API refetch — so the inbox
// flow is fully decoupled from the rate-limited token-mint path.
//
// Idempotent: messages table has UNIQUE(guesty_message_id), so retried
// deliveries from Guesty are no-ops via ON CONFLICT DO NOTHING.
//
// Conversation seeding: if the message arrives for a guesty_conversation_id
// we've never seen (e.g. brand-new guest message before the 5-min
// reservation poll has fired), we create a stub conversations row with
// whatever the payload tells us. The poller will enrich it later when
// Guesty quota allows.
//
// Field map confirmed against Guesty Open API webhook samples
// (https://open-api-docs.guesty.com/docs/webhooks). Best-effort
// defensive parsing — never crash on a missing field.

const { query } = require('../database/client');

const FR_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const MESSAGE_EVENTS = new Set([
  'conversation.message.received',     // guest → us (inbound)
  'conversation.message.sent',         // us → guest via Guesty Inbox (outbound)
  'reservation.message.received',      // older alias seen in some samples
  'reservation.message.sent',
  'message.received',                  // some webhook configs strip the prefix
  'message.sent',
]);

function isMessageEvent(type) {
  return typeof type === 'string' && MESSAGE_EVENTS.has(type);
}

function pickMessagePayload(event) {
  // Guesty's payload shape varies by event type / API version. Try the
  // common spots, prefer the most-specific.
  return (
    event?.message ||
    event?.data?.message ||
    event?.data ||
    event
  );
}

function mapDirection(rawDirection, eventType) {
  const d = String(rawDirection || '').toLowerCase();
  if (d === 'inbound' || d === 'received' || d === 'in') return 'inbound';
  if (d === 'outbound' || d === 'sent' || d === 'out') return 'outbound';
  // Fall back to event-type signal.
  if (typeof eventType === 'string' && eventType.endsWith('.sent')) return 'outbound';
  return 'inbound';
}

function mapChannel(raw) {
  const s = String(raw || '').toLowerCase();
  if (!s) return null;
  if (s.includes('airbnb')) return 'airbnb';
  if (s.includes('booking')) return 'bookingcom';
  if (s.includes('whatsapp') || s === 'wa') return 'whatsapp';
  if (s.includes('email') || s === 'mail') return 'email';
  if (s.includes('sms')) return 'sms';
  if (s.includes('vrbo')) return 'vrbo';
  return s.slice(0, 50);
}

async function ensureConversation(payload) {
  const guestyConversationId =
    payload?.conversationId ||
    payload?.conversation_id ||
    payload?.conversation?._id ||
    payload?.conversation?.id;
  if (!guestyConversationId) return null;

  const existing = await query(
    `SELECT id FROM conversations
     WHERE tenant_id = $1 AND guesty_conversation_id = $2 LIMIT 1`,
    [FR_TENANT_ID, String(guestyConversationId)],
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  // Stub-create. Pull whatever we can from the payload; the poller
  // enriches it once Guesty quota recovers.
  const guestyReservationId =
    payload?.reservationId ||
    payload?.reservation_id ||
    payload?.reservation?._id ||
    payload?.conversation?.reservationId ||
    null;
  const guestName =
    payload?.guest?.fullName ||
    payload?.guest?.name ||
    payload?.guestName ||
    payload?.conversation?.guest?.fullName ||
    null;
  const guestEmail =
    payload?.guest?.email ||
    payload?.guestEmail ||
    payload?.conversation?.guest?.email ||
    null;
  const channel = mapChannel(
    payload?.module ||
    payload?.communicationType ||
    payload?.channel ||
    payload?.conversation?.channel,
  );

  const inserted = await query(
    `INSERT INTO conversations (
       tenant_id, guesty_conversation_id, guesty_reservation_id,
       guest_name, guest_email, channel, status
     ) VALUES ($1, $2, $3, $4, $5, $6, 'active')
     RETURNING id`,
    [
      FR_TENANT_ID,
      String(guestyConversationId),
      guestyReservationId ? String(guestyReservationId) : null,
      guestName,
      guestEmail,
      channel,
    ],
  );
  console.log(`[guesty/webhook/msg] stub-created conversation ${inserted.rows[0].id} for guesty_conversation_id=${guestyConversationId}`);
  return inserted.rows[0].id;
}

async function handleMessageEvent(event) {
  const payload = pickMessagePayload(event);
  const guestyMessageId =
    payload?._id || payload?.id || payload?.messageId || payload?.message_id;
  if (!guestyMessageId) {
    console.warn('[guesty/webhook/msg] no message id in payload — ignoring');
    return { skipped: 'no message id' };
  }

  // Quick dedup — UNIQUE constraint also covers this but checking
  // first avoids a wasted conversation upsert.
  const dup = await query(
    `SELECT id FROM messages WHERE guesty_message_id = $1 LIMIT 1`,
    [String(guestyMessageId)],
  );
  if (dup.rows.length > 0) {
    return { duplicate: guestyMessageId, messageId: dup.rows[0].id };
  }

  const conversationId = await ensureConversation(payload);
  if (!conversationId) {
    console.warn(`[guesty/webhook/msg] no conversation id resolvable for message ${guestyMessageId}`);
    return { skipped: 'no conversation' };
  }

  const direction = mapDirection(payload?.direction, event?.event || event?.type);
  const body = String(payload?.body || payload?.content || payload?.text || '').slice(0, 50_000);
  const senderName =
    payload?.sender?.fullName ||
    payload?.sender?.name ||
    payload?.from?.name ||
    payload?.senderName ||
    (direction === 'inbound' ? 'Guest' : 'Friday');
  const createdAt =
    payload?.createdAt || payload?.created_at || payload?.timestamp || new Date().toISOString();
  const language = payload?.language || payload?.detectedLanguage || null;

  const inserted = await query(
    `INSERT INTO messages (
       tenant_id, conversation_id, guesty_message_id, direction,
       body, sender_name, created_at, original_language
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (guesty_message_id) DO NOTHING
     RETURNING id`,
    [
      FR_TENANT_ID,
      conversationId,
      String(guestyMessageId),
      direction,
      body,
      senderName,
      createdAt,
      language,
    ],
  );

  if (inserted.rows.length === 0) {
    return { duplicate: guestyMessageId };
  }

  // Touch the conversation's last-message metadata so the inbox list
  // sorts correctly and unread badges flip.
  await query(
    `UPDATE conversations
       SET last_message_at = $2,
           updated_at = NOW(),
           last_inbound_at = CASE WHEN $3 = 'inbound' THEN $2 ELSE last_inbound_at END
     WHERE id = $1`,
    [conversationId, createdAt, direction],
  );

  console.log(`[guesty/webhook/msg] inserted ${direction} message ${inserted.rows[0].id} (guesty=${guestyMessageId}) into conversation ${conversationId}`);
  return { messageId: inserted.rows[0].id, conversationId, direction };
}

module.exports = { isMessageEvent, handleMessageEvent };
