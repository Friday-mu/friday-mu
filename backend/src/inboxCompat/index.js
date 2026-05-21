'use strict';

const express = require('express');
const { attachIdentity } = require('../auth/identity');

function text(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const out = String(value).trim();
  return out || fallback;
}

function first(...values) {
  for (const value of values) {
    const out = text(value);
    if (out) return out;
  }
  return '';
}

function getNested(source, path) {
  return path.reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), source);
}

function messageId(message, index) {
  return first(message.message_id, message.id, message.guesty_message_id, `pending-${index + 1}`);
}

function conversationId(message, index) {
  return first(
    message.conversation_id,
    message.guesty_conversation_id,
    getNested(message, ['booking_context', 'conversation_id']),
    getNested(message, ['booking_context', 'booking_id']),
    message.reservation_id,
    getNested(message, ['guest_info', 'email']) ? `guest_${getNested(message, ['guest_info', 'email'])}` : '',
    `pending-conversation-${index + 1}`,
  );
}

function timestamp(message) {
  return first(message.timestamp, message.created_at, message.received_at, new Date().toISOString());
}

function channel(message) {
  return first(message.channel, message.source, message.platform, message.module_type, 'email');
}

function extractMessages(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.messages)) return data.messages;
  if (Array.isArray(data?.data?.messages)) return data.data.messages;
  if (Array.isArray(data?.pending)) return data.pending;
  return [];
}

async function loadPendingMessages(gmsAPI) {
  if (!gmsAPI || typeof gmsAPI.get !== 'function') {
    throw Object.assign(new Error('GMS API client is not configured'), { statusCode: 503 });
  }
  const response = await gmsAPI.get('/pending');
  return extractMessages(response.data);
}

function shapeMessage(message, index) {
  const guest = message.guest_info || {};
  const createdAt = timestamp(message);
  return {
    id: messageId(message, index),
    conversation_id: conversationId(message, index),
    guesty_message_id: first(message.guesty_message_id, message.message_id, message.id),
    direction: first(message.direction, 'inbound'),
    body: first(message.body, message.message_text, message.content, ''),
    original_language: first(message.original_language, guest.language_preference, message.language, 'en'),
    translated_body: message.translated_body || message.content_translated || null,
    sender_name: first(message.sender_name, guest.name, 'Guest'),
    created_at: createdAt,
    sentiment: message.sentiment || null,
    is_auto_response: Boolean(message.is_auto_response),
    sent_by: message.sent_by || null,
    sent_via_system: first(message.sent_via_system, 'guesty'),
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
    module_type: channel(message),
    status: first(message.status, message.workflow_status, 'received'),
  };
}

function draftFromMessage(message, index) {
  const body = first(message.suggested_reply, message.ai_suggested_reply);
  if (!body) return null;
  return {
    id: first(message.draft_id, `draft-${messageId(message, index)}`),
    state: first(message.draft_state, 'draft_ready'),
    draft_body: body,
    confidence: message.confidence || message.ai_confidence || message.latest_draft_confidence || null,
    revision_number: message.revision_number || 1,
    model_used: message.model_used || null,
    created_at: timestamp(message),
    updated_at: timestamp(message),
  };
}

function shapeReservation(message) {
  const booking = message.booking_context || {};
  const guest = message.guest_info || {};
  const id = first(booking.booking_id, message.reservation_id, message.guesty_reservation_id);
  if (!id && !booking.property_id && !guest.name) return null;
  return {
    id,
    guesty_reservation_id: id,
    listing_name: first(booking.property_name, booking.property_id),
    listing_guesty_id: first(booking.property_id, message.property_id),
    status: booking.status || null,
    channel: channel(message),
    check_in_date: booking.check_in_date || booking.check_in || null,
    check_out_date: booking.check_out_date || booking.check_out || null,
    num_guests: booking.num_guests || booking.guests_count || null,
    guest_name: first(guest.name, message.guest_name),
    guest_email: first(guest.email, message.guest_email),
    guest_phone: first(guest.phone, message.guest_phone),
  };
}

function groupConversations(messages) {
  const map = new Map();
  messages.forEach((message, index) => {
    const id = conversationId(message, index);
    const guest = message.guest_info || {};
    const booking = message.booking_context || {};
    const createdAt = timestamp(message);
    const current = map.get(id) || {
      id,
      guesty_conversation_id: id,
      guesty_reservation_id: first(booking.booking_id, message.guesty_reservation_id),
      reservation_id: first(booking.booking_id, message.reservation_id),
      property_id: first(booking.property_id, message.property_id),
      property_name: first(booking.property_name, booking.property_id, message.property_name),
      guest_name: first(guest.name, message.guest_name, 'Guest'),
      guest_email: first(guest.email, message.guest_email),
      guest_phone: first(guest.phone, message.guest_phone),
      channel: channel(message),
      status: first(message.conversation_status, message.status, 'active'),
      check_in_date: booking.check_in_date || booking.check_in || null,
      check_out_date: booking.check_out_date || booking.check_out || null,
      num_guests: booking.num_guests || booking.guests_count || null,
      conversation_summary: first(message.conversation_summary, message.summary),
      created_at: createdAt,
      updated_at: createdAt,
      last_message_at: createdAt,
      last_message_body: first(message.body, message.message_text, message.content),
      last_message_direction: first(message.direction, 'inbound'),
      is_unread: true,
      inbound_count: 0,
      messages: [],
      drafts: [],
      reservation: null,
    };

    const shapedMessage = shapeMessage(message, index);
    current.messages.push(shapedMessage);
    if (shapedMessage.direction === 'inbound') current.inbound_count += 1;

    const draft = draftFromMessage(message, index);
    if (draft) current.drafts.push(draft);
    if (draft && !current.latest_draft_state) {
      current.latest_draft_state = draft.state;
      current.latest_draft_id = draft.id;
      current.latest_draft_confidence = draft.confidence;
    }

    const messageTime = new Date(createdAt).getTime();
    const lastTime = new Date(current.last_message_at).getTime();
    if (!Number.isFinite(lastTime) || messageTime >= lastTime) {
      current.updated_at = createdAt;
      current.last_message_at = createdAt;
      current.last_message_body = shapedMessage.body;
      current.last_message_direction = shapedMessage.direction;
      current.channel = shapedMessage.module_type;
    }

    current.reservation ||= shapeReservation(message);
    map.set(id, current);
  });

  return Array.from(map.values())
    .map((item) => {
      item.messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      delete item.messages;
      delete item.drafts;
      delete item.reservation;
      return item;
    })
    .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
}

function groupDetails(messages, targetId) {
  const rows = messages
    .map((message, index) => ({ message, index, id: conversationId(message, index) }))
    .filter((entry) => entry.id === targetId);
  if (rows.length === 0) return null;

  const conversation = groupConversations(messages).find((item) => item.id === targetId);
  if (!conversation) return null;
  const shapedMessages = rows.map((entry) => shapeMessage(entry.message, entry.index))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const drafts = rows.map((entry) => draftFromMessage(entry.message, entry.index)).filter(Boolean);
  const reservation = shapeReservation(rows[0].message);
  return {
    conversation,
    messages: shapedMessages,
    drafts,
    reservation,
    whatsapp_window_open: false,
    whatsapp_window_expires_at: null,
    available_channels: ['whatsapp', 'airbnb', 'booking', 'email'],
    recommended_channel: conversation.channel || 'email',
    seen_by: [],
  };
}

function notImplemented(res, feature) {
  return res.status(501).json({
    ok: false,
    error: 'not_implemented',
    feature,
    message: 'This Inbox backend action is not integrated on fad-rebuild yet.',
  });
}

function upstreamError(res, error, feature) {
  const upstreamStatus = error?.response?.status || error?.statusCode || null;
  const status = upstreamStatus && upstreamStatus >= 400 && upstreamStatus < 500 ? 502 : (error?.statusCode || 502);
  return res.status(status).json({
    ok: false,
    error: 'upstream_unavailable',
    feature,
    upstream_status: upstreamStatus,
    message: error?.message || 'Upstream GMS request failed',
  });
}

function createInboxCompatRouter({ gmsAPI } = {}) {
  const router = express.Router();

  router.use(attachIdentity);

  router.get('/inbox/conversations', async (req, res) => {
    try {
      const messages = await loadPendingMessages(gmsAPI);
      const conversations = groupConversations(messages);
      res.json({ conversations, total: conversations.length });
    } catch (error) {
      upstreamError(res, error, 'inbox_conversations');
    }
  });

  router.get('/inbox/conversations/:id', async (req, res) => {
    try {
      const messages = await loadPendingMessages(gmsAPI);
      const detail = groupDetails(messages, req.params.id);
      if (!detail) return res.status(404).json({ error: 'Conversation not found' });
      res.json(detail);
    } catch (error) {
      upstreamError(res, error, 'inbox_conversation_detail');
    }
  });

  router.patch('/inbox/conversations/:id/read', (req, res) => {
    res.json({ ok: true, persisted: false });
  });

  router.patch('/inbox/conversations/:id/unread', (req, res) => {
    res.json({ ok: true, persisted: false });
  });

  router.post('/inbox/conversations/:id/send-template', (req, res) => {
    notImplemented(res, 'send_whatsapp_template');
  });

  router.get('/inbox/website/threads', (req, res) => {
    res.json({ results: [], total: 0, mode: 'compat_empty' });
  });

  router.get('/inbox/website/threads/:id', (req, res) => {
    res.status(404).json({ error: 'Website inbox thread not found' });
  });

  router.post('/inbox/website/threads/:id/reply', (req, res) => {
    notImplemented(res, 'website_thread_reply');
  });

  router.get('/inbox/consult/history/:conversationId', (req, res) => {
    res.json({ sessions: [] });
  });

  router.get('/inbox/consult/session/active', (req, res) => {
    res.json({ session: null, sessionId: null });
  });

  router.post('/inbox/consult/session/end', (req, res) => {
    res.json({ ok: true, persisted: false });
  });

  router.post('/inbox/consult', (req, res) => {
    notImplemented(res, 'friday_consult');
  });

  router.get('/inbox/teachings', (req, res) => {
    res.json({ teachings: [] });
  });

  router.post('/inbox/teachings', (req, res) => {
    notImplemented(res, 'inbox_teachings_create');
  });

  router.patch('/inbox/teachings/:id', (req, res) => {
    notImplemented(res, 'inbox_teachings_update');
  });

  router.post('/inbox/teachings/:id/pause', (req, res) => {
    notImplemented(res, 'inbox_teachings_pause');
  });

  router.post('/inbox/drafts/:id/approve', (req, res) => {
    notImplemented(res, 'draft_approve_send');
  });

  router.post('/inbox/drafts/:id/reject', (req, res) => {
    notImplemented(res, 'draft_reject');
  });

  router.post('/inbox/drafts/:id/revise', (req, res) => {
    notImplemented(res, 'draft_revise');
  });

  router.post('/inbox/drafts/:id/retry', (req, res) => {
    notImplemented(res, 'draft_retry');
  });

  router.post('/inbox/drafts/:id/fail', (req, res) => {
    notImplemented(res, 'draft_fail');
  });

  router.post('/inbox/drafts/:id/dismiss', (req, res) => {
    notImplemented(res, 'draft_dismiss');
  });

  router.get('/team/channels', (req, res) => {
    res.json({ channels: [], mode: 'compat_empty' });
  });

  router.get('/team/dms', (req, res) => {
    res.json({ dms: [], mode: 'compat_empty' });
  });

  router.get('/team/users', (req, res) => {
    const identity = req.identity || {};
    const userId = identity.userId || 'current-user';
    res.json({
      users: [{
        id: userId,
        username: identity.username || 'current-user',
        displayName: identity.displayName || identity.username || 'Current user',
        email: '',
        role: identity.userRole || null,
      }],
      mode: 'compat_identity_only',
    });
  });

  router.get('/team/search', (req, res) => {
    res.json({ hits: [] });
  });

  router.post('/team/channels', (req, res) => {
    notImplemented(res, 'team_channel_create');
  });

  router.get('/team/channels/:id', (req, res) => {
    res.status(404).json({ error: 'Team channel not found' });
  });

  router.patch('/team/channels/:id', (req, res) => {
    notImplemented(res, 'team_channel_update');
  });

  router.delete('/team/channels/:id', (req, res) => {
    notImplemented(res, 'team_channel_delete');
  });

  router.post('/team/channels/:id/archive', (req, res) => {
    notImplemented(res, 'team_channel_archive');
  });

  router.get('/team/channels/:id/messages', (req, res) => {
    res.json({ messages: [] });
  });

  router.post('/team/channels/:id/read', (req, res) => {
    res.json({ ok: true, persisted: false });
  });

  router.post('/team/channels/:id/members', (req, res) => {
    notImplemented(res, 'team_channel_member_add');
  });

  router.delete('/team/channels/:id/members/:userId', (req, res) => {
    notImplemented(res, 'team_channel_member_remove');
  });

  router.post('/team/channels/:id/attachments', (req, res) => {
    notImplemented(res, 'team_channel_attachment_upload');
  });

  router.post('/team/dms', (req, res) => {
    notImplemented(res, 'team_dm_open');
  });

  router.get('/team/dms/:id/messages', (req, res) => {
    res.json({ messages: [] });
  });

  router.post('/team/dms/:id/read', (req, res) => {
    res.json({ ok: true, persisted: false });
  });

  router.post('/team/dms/:id/attachments', (req, res) => {
    notImplemented(res, 'team_dm_attachment_upload');
  });

  router.get('/team/messages/:kind/:messageId/reads', (req, res) => {
    res.json({ reads: [] });
  });

  router.get('/team/messages/:kind/:messageId/reactions', (req, res) => {
    res.json({ reactions: {} });
  });

  router.get('/team/messages/:kind/:messageId/replies', (req, res) => {
    res.json({ replies: [] });
  });

  router.post('/team/messages/:kind/:messageId/reactions', (req, res) => {
    notImplemented(res, 'team_message_reaction_add');
  });

  router.delete('/team/messages/:kind/:messageId/reactions/:emoji', (req, res) => {
    notImplemented(res, 'team_message_reaction_remove');
  });

  router.get('/team/attachments/:attachmentId/preview', (req, res) => {
    res.status(404).json({ error: 'Attachment not found' });
  });

  router.post('/outbound/send', (req, res) => {
    notImplemented(res, 'outbound_send');
  });

  return router;
}

module.exports = createInboxCompatRouter;
