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
const { triggerDraftGeneration } = require('./draft_generator');
const { notifyUsers, publishFadEvent, resolveGmWatchers } = require('../realtime');

const FR_TENANT_ID = '00000000-0000-0000-0000-000000000001';

// Feature flag — set FAD_DRAFTGEN_DISABLED=true on the backend env to
// stop auto-drafts from firing. Rollback handle for Phase 3.1 burn-in
// if Kimi-FAD drafts misbehave. Default off → drafts fire.
const DRAFTGEN_DISABLED = process.env.FAD_DRAFTGEN_DISABLED === 'true';

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

// Auto-responses Guesty CS or channel platforms send on our behalf —
// regex-matched on body text. Ported from friday-gms poller's
// isGuestyAutoResponse so identical heuristics catch identical noise.
// Outbound messages matching these patterns get is_auto_response=true
// so they're filtered out of read-status / next-step / language-
// detection queries downstream.
const AUTO_RESPONSE_PATTERNS = [
  /thank you for your message/i,
  /our team will get back to you/i,
  /thank you for your patience/i,
  /thank you for contacting/i,
  /we have received your message/i,
  /we will respond as soon as possible/i,
  /we will get back to you/i,
  /your message has been received/i,
  /merci pour votre message/i,
  /nous vous répondrons/i,
];

function isGuestyAutoResponse(body) {
  if (!body || typeof body !== 'string') return false;
  return AUTO_RESPONSE_PATTERNS.some((rx) => rx.test(body));
}

// System notifications from Guesty (booking confirmations, status
// changes, cancellation pings). Same heuristics as GMS's
// isSystemNotification — body-text-based pattern matching. We tag
// these is_auto_response=true so they don't trigger draft generation
// or pollute the unread badge logic.
function isSystemNotification(body) {
  if (!body || typeof body !== 'string') return false;
  const lower = body.toLowerCase();
  if (lower.startsWith('new guest reservation') || lower.startsWith('new guest inquiry')) return true;
  if (lower.includes('status changed to')) return true;
  if (/reservation\s+[a-f0-9]{10,}/i.test(body)) return true;
  if (lower.startsWith('booking confirmed') || lower.startsWith('reservation confirmed')) return true;
  if (lower.startsWith('check-in reminder') || lower.startsWith('check-out reminder')) return true;
  if (lower.includes('has been canceled') || lower.includes('has been cancelled')) return true;
  if (lower.includes('payment received') || lower.includes('payment failed')) return true;
  return false;
}

// Body + attachments + reaction-flag derivation. Mirrors GMS poller
// lines 240-295 — the historical fix for "empty body" messages that
// otherwise render as blank bubbles. Handles three categories:
//   (a) text + optional attachments → strip HTML, append attachment
//       indicator if media present
//   (b) attachments-only → synthesize a "📎 Guest sent N photos/..."
//       placeholder body
//   (c) empty body + no attachments → likely a reaction, synthesize
//       "💬 Guest may have reacted" + flag for the caller to skip
//       draft generation
function processBodyAndAttachments(message) {
  let body = String(message?.body || '').slice(0, 50_000).trim();
  // Lightweight HTML strip — Guesty occasionally surfaces channel
  // platform HTML (Airbnb especially). Removes tags + collapses ws.
  body = body.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

  const attachmentsRaw = Array.isArray(message?.attachments) ? message.attachments : [];
  const attachments = attachmentsRaw
    .filter((a) => a && (a.url || a.original))
    .map((a) => ({
      url: a.url || a.original,
      filename: a.filename || null,
      mimeType: a.mimeType || a.type || null,
    }));

  let isReaction = false;

  if (!body && attachments.length > 0) {
    const types = attachments.map((a) => {
      const m = String(a.mimeType || '').toLowerCase();
      if (m.startsWith('image/')) return 'photo';
      if (m.startsWith('video/')) return 'video';
      if (m.startsWith('audio/')) return 'audio';
      return 'file';
    });
    const uniqueTypes = [...new Set(types)];
    body = `📎 Guest sent ${attachments.length} ${uniqueTypes.join('/')}${attachments.length > 1 ? 's' : ''}`;
  } else if (!body) {
    // No body and no filterable attachments — check the raw payload
    // for any attachment hints we might have dropped (no url but a
    // thumbnail / filename present).
    if (attachmentsRaw.length > 0) {
      const urls = attachmentsRaw.map((a) => a?.url || a?.original || a?.thumbnail).filter(Boolean);
      if (urls.length > 0) {
        for (const a of attachmentsRaw) {
          const url = a?.url || a?.original || a?.thumbnail;
          if (!url) continue;
          attachments.push({
            url,
            filename: a?.filename || 'attachment',
            mimeType: a?.mimeType || a?.type || 'image/jpeg',
          });
        }
        body = `📷 Guest sent ${urls.length} image${urls.length > 1 ? 's' : ''}`;
      } else {
        body = '📷 Guest sent media (image may not be available via API)';
      }
    } else {
      // Truly empty. Best guess: reaction (👍 etc.) or an unsupported
      // type Guesty couldn't surface. Tag as reaction so the caller
      // can skip draft generation; otherwise we'd ask Kimi to draft
      // a reply to an empty message.
      body = '💬 Guest may have reacted to a message';
      isReaction = true;
    }
  } else if (attachments.length > 0 && !body.startsWith('📎') && !body.startsWith('📷')) {
    body += `\n📎 ${attachments.length} attachment${attachments.length > 1 ? 's' : ''}`;
  }

  return { body, attachments, isReaction };
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

  // Derive body + attachments + reaction flag via the GMS-poller-
  // equivalent processor. Handles the empty-body / attachment-only /
  // reaction-only cases so the bubble never renders blank.
  const { body, attachments, isReaction } = processBodyAndAttachments(message);

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
  // NOTE: we deliberately do NOT pre-set original_language here. The
  // conversation-level language Guesty sends (event.conversation.language)
  // is the guest's profile preference, not the language of THIS message.
  // Trusting it caused German guest replies on English-profile conversations
  // to be tagged "en" and never translated. The translation_worker runs
  // detectLanguage on body and fills original_language + translated_body
  // properly within ~60s.

  // Module type — Guesty's per-message channel marker. Live in
  // message.module which is sometimes `{ type: 'whatsapp' }` and
  // sometimes the bare string. Preserve the raw value; the FAD
  // adapter (inboxClient.ts MODULE_TYPE_LABEL) normalises display.
  const rawModule = message?.module;
  const moduleType = (rawModule && typeof rawModule === 'object'
    ? rawModule.type
    : (rawModule ? String(rawModule) : null)) || null;

  // is_auto_response covers two upstream categories of "not really a
  // human reply" outbound messages: Guesty CS canned responses
  // (regex on body) and Guesty system pings (booking confirmations
  // etc.). Downstream queries filter these out of read-status /
  // next-step / draft-trigger logic.
  const isAutoResponse = direction === 'outbound'
    && (isGuestyAutoResponse(body) || isSystemNotification(body));

  const inserted = await query(
    `INSERT INTO messages (
       tenant_id, conversation_id, guesty_message_id, direction,
       body, sender_name, created_at,
       module_type, attachments, is_auto_response
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
      moduleType,
      attachments.length > 0 ? JSON.stringify(attachments) : null,
      isAutoResponse,
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

  // Auto-reopen: a new inbound message on a 'done' conversation
  // means the guest is back and we need to attend to it. GMS poller
  // did this; we preserve the behavior so closed threads don't
  // silently swallow new replies.
  if (direction === 'inbound' && !isReaction) {
    await query(
      `UPDATE conversations
         SET status = 'active', updated_at = NOW()
       WHERE id = $1 AND status = 'done'`,
      [conversationId],
    ).catch((e) => console.warn('[guesty/webhook/msg] auto-reopen failed:', e.message));
  }

  if (direction === 'outbound' && !isAutoResponse) {
    await query(
      `UPDATE drafts
          SET state = 'superseded', updated_at = NOW()
        WHERE conversation_id = $1
          AND state IN ('draft_ready', 'under_review', 'friday_drafting', 'generation_failed', 'send_queued', 'send_failed')`,
      [conversationId],
    ).catch((e) => console.warn('[guesty/webhook/msg] stale draft supersede failed:', e.message));
  }

  const tag = isReaction ? ' [reaction]' : isAutoResponse ? ' [auto-response]' : '';
  console.log(`[guesty/webhook/msg] inserted ${direction}${tag} message ${inserted.rows[0].id} (guesty=${guestyMessageId}) into conversation ${conversationId}`);

  publishFadEvent({
    tenantId: FR_TENANT_ID,
    type: direction === 'inbound' ? 'inbox.message_received' : 'inbox.message_sent',
    payload: {
      messageId: inserted.rows[0].id,
      conversationId,
      direction,
      isReaction,
      isAutoResponse,
    },
  }).catch(() => {});

  if (direction === 'inbound' && !isReaction && !isAutoResponse) {
    resolveGmWatchers(conversationId, FR_TENANT_ID).then((watchers) => {
      if (watchers.length === 0) return null;
      return notifyUsers({
        tenantId: FR_TENANT_ID,
        userIds: watchers,
        type: 'inbox_new_message',
        title: `New message from ${senderName || 'Guest'}`,
        body: body.slice(0, 180),
        url: `/fad?m=inbox&thread=${conversationId}`,
        source: 'inbox',
        sourceId: inserted.rows[0].id,
        priority: 'high',
        data: { conversationId, messageId: inserted.rows[0].id },
      });
    }).catch(() => {});
  }

  // Phase 3.1 — auto-draft generation. Fire-and-forget so a slow Kimi
  // call never blocks the webhook ack to Guesty (their retry threshold
  // is short). Skip outbound, reactions, auto-responses, and system
  // pings — they're not real guest messages and shouldn't burn LLM
  // budget. Disable globally via FAD_DRAFTGEN_DISABLED for rollback.
  if (
    direction === 'inbound'
    && !isReaction
    && !isAutoResponse
    && !DRAFTGEN_DISABLED
  ) {
    const msgId = inserted.rows[0].id;
    triggerDraftGeneration(msgId, conversationId).catch((e) => {
      console.error(`[guesty/webhook/msg] draft trigger failed for ${msgId}:`, e.message);
    });
  }

  return { messageId: inserted.rows[0].id, conversationId, direction, isReaction, isAutoResponse };
}

module.exports = { isMessageEvent, handleMessageEvent };
