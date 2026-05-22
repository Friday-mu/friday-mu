'use strict';

const crypto = require('node:crypto');
const { query } = require('../database/client');
const { publishFadEvent } = require('../realtime');
const { attachIdentity } = require('../design/auth');
const { verifySignature } = require('./webhook');

const SURFACES = new Set(['guest', 'owner', 'universal', 'feedback']);
const CONFIDENCE = new Set(['high', 'medium', 'low']);
const LOCALES = new Set(['en', 'fr']);
const AI_EVENT_TYPE = 'website.ai_handoff';
const TAKEOVER_EVENT_TYPE = 'website.ai_handoff_takeover';
const VISITOR_MESSAGE_EVENT_TYPE = 'website.visitor_message';
const STAFF_REPLY_EVENT_TYPE = 'staff.reply_sent';

function clampText(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function sha(input, len = 20) {
  return crypto.createHash('sha256').update(String(input), 'utf8').digest('hex').slice(0, len);
}

function safeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function sanitizeTranscriptTail(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-8)
    .map((message) => {
      if (!message || typeof message !== 'object') return null;
      const role = message.role === 'assistant' ? 'assistant' : message.role === 'user' ? 'user' : null;
      const content = clampText(message.content, 2000);
      if (!role || !content) return null;
      return { role, content };
    })
    .filter(Boolean);
}

function sanitizeExtracted(value) {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [key, raw] of Object.entries(value).slice(0, 50)) {
    const cleanKey = clampText(key, 80);
    const cleanValue = clampText(typeof raw === 'string' ? raw : JSON.stringify(raw), 1000);
    if (cleanKey && cleanValue) out[cleanKey] = cleanValue;
  }
  return out;
}

function sanitizeTools(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const tools = [];
  for (const item of value) {
    const clean = clampText(String(item || ''), 120);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    tools.push(clean);
    if (tools.length >= 20) break;
  }
  return tools;
}

function parseEnvelope(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const err = new Error('request body must be an object');
    err.status = 400;
    throw err;
  }

  if (payload.source !== 'friday-website') {
    const err = new Error('source must be friday-website');
    err.status = 400;
    throw err;
  }

  const surface = clampText(payload.surface, 40);
  if (!SURFACES.has(surface)) {
    const err = new Error('surface must be guest|owner|universal|feedback');
    err.status = 400;
    throw err;
  }

  const locale = clampText(payload.locale, 10).toLowerCase();
  if (!LOCALES.has(locale)) {
    const err = new Error('locale must be en|fr');
    err.status = 400;
    throw err;
  }

  const confidence = clampText(payload.confidence, 20).toLowerCase();
  if (!CONFIDENCE.has(confidence)) {
    const err = new Error('confidence must be high|medium|low');
    err.status = 400;
    throw err;
  }

  const createdAt = clampText(payload.createdAt, 80) || new Date().toISOString();
  if (Number.isNaN(new Date(createdAt).getTime())) {
    const err = new Error('createdAt must be an ISO timestamp');
    err.status = 400;
    throw err;
  }

  const visitorTurn = clampText(payload.visitorTurn, 3000);
  const conversationSummary = clampText(payload.conversationSummary, 5000);
  if (!visitorTurn && !conversationSummary) {
    const err = new Error('visitorTurn or conversationSummary is required');
    err.status = 400;
    throw err;
  }

  const optionalConversationId = clampText(
    payload.conversationId || payload.sessionId || payload.threadId || '',
    160,
  );
  const handoffSeed = JSON.stringify([
    payload.source,
    surface,
    clampText(payload.pageUrl, 2000),
    locale,
    visitorTurn,
    conversationSummary,
    createdAt,
    optionalConversationId,
  ]);
  const handoffHash = sha(handoffSeed, 24);
  const conversationKey = optionalConversationId
    ? `session-${sha(optionalConversationId, 24)}`
    : `handoff-${handoffHash}`;

  const envelope = {
    source: 'friday-website',
    surface,
    pageUrl: clampText(payload.pageUrl, 2000),
    locale,
    visitorTurn,
    transcriptTail: sanitizeTranscriptTail(payload.transcriptTail),
    conversationSummary,
    extracted: sanitizeExtracted(payload.extracted),
    toolsUsed: sanitizeTools(payload.toolsUsed),
    confidence,
    escalationReason: clampText(payload.escalationReason, 500),
    recommendedNextAction: clampText(payload.recommendedNextAction, 500),
    createdAt,
  };

  return {
    handoffId: `wah_${handoffHash}`,
    conversationKey,
    reference: `website-ai:wah_${handoffHash}`,
    envelope,
  };
}

function subjectFor(envelope) {
  const surfaceLabel = envelope.surface.charAt(0).toUpperCase() + envelope.surface.slice(1);
  return `Website AI · ${surfaceLabel}`;
}

function noteFor(envelope) {
  const reason = envelope.escalationReason || envelope.recommendedNextAction || 'AI handoff needs human review';
  return `AI handoff (${envelope.confidence}) — ${reason}`.slice(0, 4000);
}

async function findHandoffById(identifier) {
  const id = clampText(identifier, 120);
  if (!id) return null;
  const reference = id.startsWith('website-ai:') ? id : `website-ai:${id}`;
  const { rows } = await query(
    `
    SELECT e.id, e.thread_id, e.reference, e.payload, e.created_at
      FROM inbox_events e
     WHERE (e.reference = $1 OR e.id::text = $2)
       AND e.event_type = $3
     LIMIT 1
    `,
    [reference, id, AI_EVENT_TYPE],
  );
  return rows[0] || null;
}

async function handoffWindowStart(handoff) {
  const conversationKey = handoff?.payload?.conversationKey;
  if (!conversationKey) return handoff.created_at;
  const { rows } = await query(
    `
    SELECT MIN(created_at) AS started_at
      FROM inbox_events
     WHERE thread_id = $1
       AND event_type = $2
       AND payload->>'conversationKey' = $3
    `,
    [handoff.thread_id, AI_EVENT_TYPE, conversationKey],
  );
  return rows[0]?.started_at || handoff.created_at;
}

async function takeoverStateForHandoff(handoff) {
  if (!handoff) return { takeoverState: 'unknown', aiMayReply: false, takeoverEvent: null };
  const windowStart = await handoffWindowStart(handoff);
  const { rows } = await query(
    `
    SELECT id, event_type, source, payload, created_at
      FROM inbox_events
     WHERE thread_id = $1
       AND created_at >= $2
       AND event_type IN ($3, $4)
     ORDER BY created_at DESC, id::text DESC
     LIMIT 1
    `,
    [handoff.thread_id, windowStart, TAKEOVER_EVENT_TYPE, STAFF_REPLY_EVENT_TYPE],
  );
  const event = rows[0] || null;
  if (event) return { takeoverState: 'human_takeover', aiMayReply: false, takeoverEvent: event };
  return { takeoverState: 'ai_active', aiMayReply: true, takeoverEvent: null };
}

function eventBody(event) {
  const payload = event?.payload || {};
  const body = payload.body || payload.message || payload.visitorTurn || payload.final_body;
  return typeof body === 'string' ? body : '';
}

function eventRole(event) {
  const type = String(event?.event_type || '');
  if (type === STAFF_REPLY_EVENT_TYPE) return 'staff';
  if (type === VISITOR_MESSAGE_EVENT_TYPE) return 'visitor';
  if (type === AI_EVENT_TYPE) return 'handoff';
  if (event?.source === 'website_ai') return 'ai';
  return event?.source === 'fad' ? 'staff' : 'visitor';
}

async function liveMessagesForHandoff(handoff) {
  if (!handoff) return [];
  const windowStart = await handoffWindowStart(handoff);
  const { rows } = await query(
    `
    SELECT id, reference, event_type, source, payload, created_at
      FROM inbox_events
     WHERE thread_id = $1
       AND created_at >= $2
       AND event_type IN ($3, $4, $5, $6)
     ORDER BY created_at ASC, id::text ASC
     LIMIT 100
    `,
    [handoff.thread_id, windowStart, AI_EVENT_TYPE, TAKEOVER_EVENT_TYPE, VISITOR_MESSAGE_EVENT_TYPE, STAFF_REPLY_EVENT_TYPE],
  );
  return rows.map((event) => ({
    id: event.id,
    reference: event.reference || null,
    eventType: event.event_type,
    source: event.source,
    role: eventRole(event),
    body: eventBody(event),
    payload: event.payload || {},
    createdAt: event.created_at,
  }));
}

async function recordVisitorMessage({ handoff, body, providerMessageId, createdAt }) {
  const messageBody = clampText(body, 4000);
  if (!messageBody) {
    const err = new Error('message is required');
    err.status = 400;
    throw err;
  }
  const sentAt = clampText(createdAt, 80) || new Date().toISOString();
  if (Number.isNaN(new Date(sentAt).getTime())) {
    const err = new Error('createdAt must be an ISO timestamp');
    err.status = 400;
    throw err;
  }
  const handoffId = handoff.payload?.handoffId || null;
  const conversationKey = handoff.payload?.conversationKey || null;
  const reference = providerMessageId
    ? `website-ai-visitor:${safeKey(providerMessageId)}`
    : `website-ai-visitor:${handoffId || handoff.id}:${sha(`${sentAt}.${messageBody}`, 18)}`;
  const payload = {
    handoffId,
    conversationKey,
    body: messageBody,
    providerMessageId: clampText(providerMessageId, 160) || null,
    createdAt: sentAt,
  };

  let event;
  let isDuplicate = false;
  try {
    const { rows } = await query(
      `
      INSERT INTO inbox_events (thread_id, reference, event_type, source, payload)
      VALUES ($1, $2, $3, 'website', $4::jsonb)
      RETURNING id, created_at
      `,
      [handoff.thread_id, reference, VISITOR_MESSAGE_EVENT_TYPE, JSON.stringify(payload)],
    );
    event = rows[0];
  } catch (err) {
    if (err && err.code === '23505') {
      const existing = await query(
        `SELECT id, created_at FROM inbox_events WHERE reference = $1 AND event_type = $2 LIMIT 1`,
        [reference, VISITOR_MESSAGE_EVENT_TYPE],
      );
      event = existing.rows[0] || null;
      isDuplicate = true;
    } else {
      throw err;
    }
  }

  await query(
    `
    UPDATE inbox_threads
       SET last_event_type = $1,
           last_event_at = NOW(),
           updated_at = NOW()
     WHERE id = $2
    `,
    [VISITOR_MESSAGE_EVENT_TYPE, handoff.thread_id],
  );

  await publishFadEvent({
    type: 'website_ai.visitor_message_received',
    payload: {
      threadId: handoff.thread_id,
      handoffId,
      eventId: event?.id || null,
      conversationKey,
    },
  });
  await publishFadEvent({
    type: 'website_inbox.thread_updated',
    payload: { threadId: handoff.thread_id, eventId: event?.id || null, eventType: VISITOR_MESSAGE_EVENT_TYPE },
  });

  return {
    eventId: event?.id || null,
    eventCreatedAt: event?.created_at || null,
    isDuplicate,
    payload,
  };
}

async function recordHandoff({ parsed, signature, signedAt }) {
  const { handoffId, conversationKey, reference, envelope } = parsed;
  const guestEmail = `website-ai+${safeKey(conversationKey).slice(0, 48)}@friday.mu`;

  const threadRes = await query(
    `
    INSERT INTO inbox_threads (
      guest_email, guest_email_raw, guest_name, guest_phone,
      last_event_type, last_event_at, notes
    )
    VALUES (LOWER($1), $1, $2, NULL, $3, NOW(), $4)
    ON CONFLICT ((LOWER(guest_email))) DO UPDATE SET
      guest_name      = EXCLUDED.guest_name,
      last_event_type = EXCLUDED.last_event_type,
      last_event_at   = NOW(),
      notes           = EXCLUDED.notes,
      updated_at      = NOW()
    RETURNING id
    `,
    [guestEmail, subjectFor(envelope), AI_EVENT_TYPE, noteFor(envelope)],
  );
  const threadId = threadRes.rows[0].id;

  const payload = {
    ...envelope,
    handoffId,
    conversationKey,
    aiReplyState: 'escalated',
    takeoverState: 'ai_active',
    aiMayReply: true,
  };

  try {
    const eventRes = await query(
      `
      INSERT INTO inbox_events (
        thread_id, reference, event_type, source, payload, signature, signed_at
      )
      VALUES ($1, $2, $3, 'website_ai', $4::jsonb, $5, $6)
      RETURNING id, created_at
      `,
      [threadId, reference, AI_EVENT_TYPE, JSON.stringify(payload), signature || null, signedAt || null],
    );
    return {
      isDuplicate: false,
      threadId,
      eventId: eventRes.rows[0].id,
      eventCreatedAt: eventRes.rows[0].created_at,
      payload,
    };
  } catch (err) {
    if (err && err.code === '23505') {
      const existing = await findHandoffById(handoffId);
      return {
        isDuplicate: true,
        threadId: existing?.thread_id || threadId,
        eventId: existing?.id || null,
        eventCreatedAt: existing?.created_at || null,
        payload: existing?.payload || payload,
      };
    }
    throw err;
  }
}

async function recordAiTakeoverForThread({ threadId, identity, reason = 'human_takeover' }) {
  const latest = await query(
    `
    SELECT id, reference, payload, created_at
      FROM inbox_events
     WHERE thread_id = $1
       AND event_type = $2
     ORDER BY created_at DESC, id::text DESC
     LIMIT 1
    `,
    [threadId, AI_EVENT_TYPE],
  );
  const handoff = latest.rows[0];
  if (!handoff) return { ok: false, reason: 'no_ai_handoff' };

  const existing = await query(
    `
    SELECT id, event_type, payload, created_at
      FROM inbox_events
     WHERE thread_id = $1
       AND created_at >= $2
       AND event_type IN ($3, $4)
     ORDER BY created_at DESC, id::text DESC
     LIMIT 1
    `,
    [threadId, await handoffWindowStart(handoff), TAKEOVER_EVENT_TYPE, STAFF_REPLY_EVENT_TYPE],
  );
  if (existing.rows[0]) {
    return {
      ok: true,
      duplicate: true,
      handoffId: handoff.payload?.handoffId || null,
      eventId: existing.rows[0].id,
      takeoverState: 'human_takeover',
      aiMayReply: false,
    };
  }

  const payload = {
    handoffId: handoff.payload?.handoffId || null,
    conversationKey: handoff.payload?.conversationKey || null,
    takeoverState: 'human_takeover',
    aiMayReply: false,
    reason,
    takenBy: {
      userId: identity?.userId || null,
      displayName: identity?.displayName || identity?.username || null,
    },
    createdAt: new Date().toISOString(),
  };

  const eventRes = await query(
    `
    INSERT INTO inbox_events (thread_id, reference, event_type, source, payload)
    VALUES ($1, $2, $3, 'fad', $4::jsonb)
    RETURNING id, created_at
    `,
    [
      threadId,
      handoff.payload?.handoffId ? `website-ai-takeover:${handoff.payload.handoffId}` : null,
      TAKEOVER_EVENT_TYPE,
      JSON.stringify(payload),
    ],
  );

  await query(
    `
    UPDATE inbox_threads
       SET status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
           last_event_type = $1,
           last_event_at = NOW(),
           updated_at = NOW()
     WHERE id = $2
    `,
    [TAKEOVER_EVENT_TYPE, threadId],
  );

  await publishFadEvent({
    type: 'website_ai.takeover',
    payload: {
      threadId,
      handoffId: payload.handoffId,
      eventId: eventRes.rows[0].id,
      takeoverState: 'human_takeover',
      aiMayReply: false,
    },
  });
  await publishFadEvent({
    type: 'website_inbox.thread_updated',
    payload: { threadId, eventId: eventRes.rows[0].id, eventType: TAKEOVER_EVENT_TYPE },
  });

  return {
    ok: true,
    handoffId: payload.handoffId,
    eventId: eventRes.rows[0].id,
    takeoverState: 'human_takeover',
    aiMayReply: false,
  };
}

function signedAtFromHeader(value) {
  if (!value) return null;
  const s = String(value);
  const d = /^\d+$/.test(s) ? new Date(Number(s)) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseSignedJson(req, res) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!rawBody) {
    res.status(400).json({ error: 'empty body' });
    return null;
  }
  const sig = verifySignature({
    rawBody,
    timestampHeader: req.header('X-Friday-Inbox-Timestamp'),
    signatureHeader: req.header('X-Friday-Inbox-Signature'),
    secret: process.env.FRIDAY_WEBSITE_INBOX_SECRET,
  });
  if (!sig.ok) {
    console.warn('[website_inbox/ai_handoff] rejecting:', sig.reason);
    res.status(401).json({ error: 'Unauthorized', reason: sig.reason });
    return null;
  }
  try {
    return { payload: JSON.parse(rawBody), rawBody };
  } catch {
    res.status(400).json({ error: 'invalid JSON' });
    return null;
  }
}

function mountAiHandoff(router) {
  router.post('/friday-website/ai-handoff', async (req, res) => {
    const parsedBody = parseSignedJson(req, res);
    if (!parsedBody) return;

    let parsed;
    try {
      parsed = parseEnvelope(parsedBody.payload);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }

    try {
      const recorded = await recordHandoff({
        parsed,
        signature: req.header('X-Friday-Inbox-Signature'),
        signedAt: signedAtFromHeader(req.header('X-Friday-Inbox-Timestamp')),
      });
      const handoff = {
        id: recorded.eventId,
        thread_id: recorded.threadId,
        payload: recorded.payload,
        created_at: recorded.eventCreatedAt || new Date().toISOString(),
      };
      const state = await takeoverStateForHandoff(handoff);
      const messages = await liveMessagesForHandoff(handoff);

      await publishFadEvent({
        type: 'website_ai.handoff_received',
        payload: {
          threadId: recorded.threadId,
          eventId: recorded.eventId,
          handoffId: parsed.handoffId,
          surface: parsed.envelope.surface,
          confidence: parsed.envelope.confidence,
          takeoverState: state.takeoverState,
          aiMayReply: state.aiMayReply,
        },
      });
      await publishFadEvent({
        type: 'website_inbox.thread_updated',
        payload: { threadId: recorded.threadId, eventId: recorded.eventId, eventType: AI_EVENT_TYPE },
      });

      return res.json({
        status: recorded.isDuplicate ? 'duplicate' : 'accepted',
        handoffId: parsed.handoffId,
        eventId: recorded.eventId,
        threadId: recorded.threadId,
        conversationId: `web-${recorded.threadId}`,
        takeover: state,
        messages,
        stateUrl: '/api/inbox/website/friday-website/ai-handoff/state',
        visitorMessageUrl: '/api/inbox/website/friday-website/ai-handoff/visitor-message',
      });
    } catch (err) {
      console.error('[website_inbox/ai_handoff] record error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  router.post('/friday-website/ai-handoff/state', async (req, res) => {
    const parsedBody = parseSignedJson(req, res);
    if (!parsedBody) return;
    const identifier = parsedBody.payload?.handoffId || parsedBody.payload?.eventId || parsedBody.payload?.reference;
    if (!identifier) return res.status(400).json({ error: 'handoffId is required' });
    try {
      const handoff = await findHandoffById(identifier);
      if (!handoff) return res.status(404).json({ error: 'handoff not found' });
      const state = await takeoverStateForHandoff(handoff);
      const messages = await liveMessagesForHandoff(handoff);
      return res.json({
        handoffId: handoff.payload?.handoffId || null,
        threadId: handoff.thread_id,
        takeoverState: state.takeoverState,
        aiMayReply: state.aiMayReply,
        messages,
      });
    } catch (err) {
      console.error('[website_inbox/ai_handoff] state error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  router.post('/friday-website/ai-handoff/visitor-message', async (req, res) => {
    const parsedBody = parseSignedJson(req, res);
    if (!parsedBody) return;
    const identifier = parsedBody.payload?.handoffId || parsedBody.payload?.eventId || parsedBody.payload?.reference;
    if (!identifier) return res.status(400).json({ error: 'handoffId is required' });
    try {
      const handoff = await findHandoffById(identifier);
      if (!handoff) return res.status(404).json({ error: 'handoff not found' });
      const recorded = await recordVisitorMessage({
        handoff,
        body: parsedBody.payload?.body || parsedBody.payload?.message || parsedBody.payload?.visitorTurn,
        providerMessageId: parsedBody.payload?.messageId || parsedBody.payload?.providerMessageId,
        createdAt: parsedBody.payload?.createdAt,
      });
      const state = await takeoverStateForHandoff(handoff);
      return res.json({
        status: recorded.isDuplicate ? 'duplicate' : 'accepted',
        handoffId: handoff.payload?.handoffId || null,
        threadId: handoff.thread_id,
        eventId: recorded.eventId,
        takeoverState: state.takeoverState,
        aiMayReply: state.aiMayReply,
      });
    } catch (err) {
      console.error('[website_inbox/ai_handoff] visitor message error:', err.message);
      return res.status(err.status || 500).json({ error: err.message });
    }
  });
}

function mountAiHandoffStaffRoutes(router) {
  router.post('/threads/:id/ai-takeover', attachIdentity, async (req, res) => {
    try {
      const result = await recordAiTakeoverForThread({
        threadId: req.params.id,
        identity: req.identity,
        reason: clampText(req.body?.reason || 'human_takeover', 200),
      });
      if (!result.ok && result.reason === 'no_ai_handoff') {
        return res.status(409).json({ error: 'no_ai_handoff' });
      }
      return res.json(result);
    } catch (err) {
      console.error('[website_inbox/ai_handoff] takeover error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });
}

module.exports = {
  mountAiHandoff,
  mountAiHandoffStaffRoutes,
  recordAiTakeoverForThread,
  _test: {
    parseEnvelope,
    sanitizeTranscriptTail,
    sanitizeExtracted,
    sanitizeTools,
    takeoverStateForHandoff,
    liveMessagesForHandoff,
  },
};
