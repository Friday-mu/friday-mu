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
// we've never seen (e.g. brand-new guest message before the reservation
// poll has fired), we create a stub conversations row from the
// `conversation` object that Guesty includes in the webhook payload.
// The poller enriches it later when Guesty quota allows.
//
// Field map confirmed against Guesty Open API webhook docs
// (https://open-api-docs.guesty.com/docs/webhooks-messages) on
// 2026-05-17. Best-effort defensive parsing — never crash on a
// missing field.

const { query } = require('../database/client');

const FR_TENANT_ID = '00000000-0000-0000-0000-000000000001';

// Guesty's actual event names (camelCase, "reservation." prefix).
// Per audit 2026-05-17 — the previous dotted-snake variants don't exist.
const MESSAGE_EVENTS = new Set([
  'reservation.messageReceived',
  'reservation.messageSent',
]);

function isMessageEvent(type) {
  return typeof type === 'string' && MESSAGE_EVENTS.has(type);
}

// Some Guesty payloads stringify the `meta`/`integration` sub-objects
// with an underscore prefix (`_meta`, `_integration`). Defensive
// helper: try the live object, fall back to JSON-parsing the
// underscored string.
function readNested(obj, key) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj[key] && typeof obj[key] === 'object') return obj[key];
  const underscored = obj[`_${key}`];
  if (typeof underscored === 'string') {
    try { return JSON.parse(underscored); } catch { return null; }
  }
  return underscored && typeof underscored === 'object' ? underscored : null;
}

// Map Guesty's `message.type` enum to our direction enum.
// Per audit: there's no `direction` field — must derive from `type`.
//   fromGuest      → inbound (guest wrote)
//   fromHost       → outbound (host team wrote)
//   fromGuesty     → outbound (Guesty CS replied on host's behalf)
//   fromThirdParty → outbound (Airbnb/Booking sent a system reply)
//   channel        → ambiguous — fall back to event name
function mapDirection(message, eventType) {
  const t = String(message?.type || '').trim();
  if (t === 'fromGuest') return 'inbound';
  if (t === 'fromHost' || t === 'fromGuesty' || t === 'fromThirdParty') return 'outbound';
  // Fall back to event-name signal.
  if (typeof eventType === 'string' && eventType.endsWith('Sent')) return 'outbound';
  return 'inbound';
}

// Normalize Guesty's `module` strings to our internal channel taxonomy.
function mapChannel(message, conversation) {
  const integration = readNested(conversation, 'integration');
  const candidates = [
    message?.module,
    integration?.platform,
    conversation?.platform,
  ].filter(Boolean);
  if (candidates.length === 0) return null;
  const s = String(candidates[0]).toLowerCase();
  if (s.includes('airbnb')) return 'airbnb';
  if (s.includes('booking')) return 'bookingcom';
  if (s.includes('whatsapp') || s === 'wa') return 'whatsapp';
  if (s.includes('email') || s === 'mail') return 'email';
  if (s.includes('sms')) return 'sms';
  if (s.includes('vrbo')) return 'vrbo';
  if (s === 'log') return 'log';
  return s.slice(0, 50);
}

// Guesty's `message.from` is a STRING — either bare email or
// "Display Name <email>". Extract email + display name defensively.
function parseFromString(from) {
  if (!from || typeof from !== 'string') return { name: null, email: null };
  const m = from.match(/^(.+?)\s*<\s*([^>]+)\s*>\s*$/);
  if (m) return { name: m[1].trim().replace(/^["']|["']$/g, ''), email: m[2].trim() };
  if (/^\S+@\S+\.\S+$/.test(from.trim())) return { name: null, email: from.trim() };
  return { name: from.trim(), email: null };
}

async function ensureConversation(event) {
  const conv = event?.conversation;
  const guestyConversationId = conv?._id || conv?.id;
  if (!guestyConversationId) return null;

  const existing = await query(
    `SELECT id FROM conversations
     WHERE tenant_id = $1 AND guesty_conversation_id = $2 LIMIT 1`,
    [FR_TENANT_ID, String(guestyConversationId)],
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  // Stub-create from whatever the webhook payload tells us. The
  // poller will enrich it once Guesty quota allows.
  const meta = readNested(conv, 'meta');
  const integration = readNested(conv, 'integration');

  const guestyReservationId = event?.reservationId || meta?.reservations?.[0]?._id || null;
  const guestName = meta?.guestName || null;
  // Guest email isn't directly on the conversation; derive it from
  // the inbound message's `from` string later (the caller passes the
  // message in via handleMessageEvent, so we defer to that path).
  const channel = mapChannel(event?.message, conv);
  const language = conv?.language || null;

  const inserted = await query(
    `INSERT INTO conversations (
       tenant_id, guesty_conversation_id, guesty_reservation_id,
       guest_name, channel, status, last_detected_language
     ) VALUES ($1, $2, $3, $4, $5, 'active', $6)
     RETURNING id`,
    [
      FR_TENANT_ID,
      String(guestyConversationId),
      guestyReservationId ? String(guestyReservationId) : null,
      guestName,
      channel,
      language || 'en',
    ],
  );
  console.log(`[guesty/webhook/msg] stub-created conversation ${inserted.rows[0].id} for guesty_conversation_id=${guestyConversationId}`);
  return inserted.rows[0].id;
}

async function handleMessageEvent(event) {
  const eventType = event?.event;
  const message = event?.message;
  if (!message) {
    console.warn('[guesty/webhook/msg] no message in payload — ignoring');
    return { skipped: 'no message' };
  }

  // Guesty's canonical id is postId (it's also mirrored as `id` and
  // sometimes `_id`). Skip system log entries.
  if (message.module === 'log') {
    return { skipped: 'log module' };
  }
  const guestyMessageId = message.postId || message.id || message._id;
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

  const conversationId = await ensureConversation(event);
  if (!conversationId) {
    console.warn(`[guesty/webhook/msg] no conversation id resolvable for message ${guestyMessageId}`);
    return { skipped: 'no conversation' };
  }

  const direction = mapDirection(message, eventType);
  const body = String(message.body || '').slice(0, 50_000);

  // Sender name: parse from the `from` string for inbound (guest);
  // fall back to conversation.meta.guestName. Outbound has no
  // canonical sender on the webhook — use a generic label.
  let senderName;
  if (direction === 'inbound') {
    const parsed = parseFromString(message.from);
    const meta = readNested(event?.conversation, 'meta');
    senderName = parsed.name || meta?.guestName || 'Guest';
  } else {
    senderName = message.type === 'fromGuesty' ? 'Guesty CS' : 'Friday';
  }

  const createdAt = message.createdAt || message.sentAt || new Date().toISOString();
  const language = event?.conversation?.language || null;

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
