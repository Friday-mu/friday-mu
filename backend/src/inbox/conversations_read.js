'use strict';

// Inbox read-side, FAD-native. Phase 1 of the friday-gms read-side
// port — replaces the gmsProxy calls for the three highest-traffic
// inbox routes:
//
//   GET /api/inbox/conversations        — list (with optional filters)
//   GET /api/inbox/conversations/:id    — detail bundle
//   GET /api/inbox/conversations/:id/messages
//
// Source: friday-gms/src/routes/conversations.ts (handlers verbatim,
// translated from TS → CommonJS and tenant-scoped to FR for now).
//
// The DB is shared between fad-backend and friday-gms — same Postgres,
// same schema. This route is a drop-in replacement; the response
// shape exactly matches what the FAD frontend already consumes from
// the proxy.
//
// Multi-tenancy posture: every query filters by tenant_id (FR for
// now). Sets us up for the per-tenant work in roadmap §5.4.1 without
// having to revisit these handlers.

const express = require('express');
const axios = require('axios');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');
const { publishFadEvent } = require('../realtime');

const router = express.Router();

const FR_TENANT_ID = '00000000-0000-0000-0000-000000000001';

// SQL fragment used by both list + search — identical column set, same
// is_unread computation, same read_status join. Keep them in sync.
const LIST_SELECT_SQL = `
  SELECT c.*,
    (SELECT d.state FROM drafts d WHERE d.conversation_id = c.id ORDER BY d.created_at DESC LIMIT 1) as latest_draft_state,
    (SELECT d.id FROM drafts d WHERE d.conversation_id = c.id ORDER BY d.created_at DESC LIMIT 1) as latest_draft_id,
    (SELECT d.confidence FROM drafts d WHERE d.conversation_id = c.id ORDER BY d.created_at DESC LIMIT 1) as latest_draft_confidence,
    (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.direction = 'inbound') as inbound_count,
    (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_body,
    (SELECT m.direction FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_direction,
    CASE
      WHEN rs.last_read_at IS NULL AND EXISTS (
        SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.direction = 'inbound'
      ) THEN true
      WHEN rs.last_read_at IS NOT NULL AND EXISTS (
        SELECT 1 FROM messages m1
        WHERE m1.conversation_id = c.id AND m1.direction = 'inbound'
        AND m1.created_at > rs.last_read_at
        AND NOT EXISTS (
          SELECT 1 FROM messages m2
          WHERE m2.conversation_id = c.id AND m2.direction = 'outbound'
          AND m2.is_auto_response IS NOT TRUE
          AND m2.created_at > m1.created_at
        )
      ) THEN true
      ELSE false
    END as is_unread
  FROM conversations c
  LEFT JOIN read_status rs ON rs.conversation_id = c.id AND rs.user_id = $1
`;

// ────────────────────────────────────────────────────────────────────
// GET /api/inbox/conversations/search
// Must come BEFORE the /:id route so Express doesn't match it as id=search.
// Query: q (text), status, property, channel, dateFrom, dateTo
// ────────────────────────────────────────────────────────────────────
router.get('/search', attachIdentity, async (req, res) => {
  try {
    const { q, status, property, channel, dateFrom, dateTo } = req.query;
    const userId = req.identity?.username || req.identity?.userId || 'unknown';
    const params = [userId, FR_TENANT_ID];
    let paramIdx = 3;

    let sql = LIST_SELECT_SQL + ' WHERE c.tenant_id = $2';

    if (q && typeof q === 'string' && q.trim()) {
      const searchTerm = `%${q.trim()}%`;
      sql += ` AND (
        c.guest_name ILIKE $${paramIdx}
        OR c.property_name ILIKE $${paramIdx}
        OR c.guest_email ILIKE $${paramIdx}
        OR c.conversation_summary ILIKE $${paramIdx}
        OR c.notes ILIKE $${paramIdx}
        OR EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND (m.body ILIKE $${paramIdx} OR m.translated_body ILIKE $${paramIdx}))
      )`;
      params.push(searchTerm);
      paramIdx++;
    }
    if (status && typeof status === 'string') {
      sql += ` AND c.status = $${paramIdx++}`;
      params.push(status);
    }
    if (property && typeof property === 'string') {
      sql += ` AND c.property_name = $${paramIdx++}`;
      params.push(property);
    }
    if (channel && typeof channel === 'string') {
      sql += ` AND c.channel = $${paramIdx++}`;
      params.push(channel);
    }
    if (dateFrom && typeof dateFrom === 'string') {
      sql += ` AND c.last_message_at >= $${paramIdx++}`;
      params.push(dateFrom);
    }
    if (dateTo && typeof dateTo === 'string') {
      sql += ` AND c.last_message_at <= $${paramIdx++}`;
      params.push(dateTo + 'T23:59:59.999Z');
    }

    sql += ' ORDER BY c.last_message_at DESC NULLS LAST LIMIT 100';

    const result = await query(sql, params);
    res.json({ conversations: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('[inbox/conversations] search error:', err.message);
    res.status(500).json({ error: 'Failed to search conversations', details: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────
// GET /api/inbox/conversations/filters
// Must come BEFORE the /:id route.
// Returns distinct properties / channels / statuses for filter dropdowns.
// ────────────────────────────────────────────────────────────────────
router.get('/filters', attachIdentity, async (_req, res) => {
  try {
    const [properties, channels, statuses] = await Promise.all([
      query(
        `SELECT DISTINCT property_name FROM conversations
           WHERE property_name IS NOT NULL AND tenant_id = $1
           ORDER BY property_name`,
        [FR_TENANT_ID],
      ),
      query(
        `SELECT DISTINCT channel FROM conversations
           WHERE channel IS NOT NULL AND tenant_id = $1
           ORDER BY channel`,
        [FR_TENANT_ID],
      ),
      query(
        `SELECT DISTINCT status FROM conversations
           WHERE status IS NOT NULL AND tenant_id = $1
           ORDER BY status`,
        [FR_TENANT_ID],
      ),
    ]);
    res.json({
      properties: properties.rows.map((r) => r.property_name),
      channels: channels.rows.map((r) => r.channel),
      statuses: statuses.rows.map((r) => r.status),
    });
  } catch (err) {
    console.error('[inbox/conversations] filters error:', err.message);
    res.status(500).json({ error: 'Failed to get filter options', details: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────
// POST /api/inbox/conversations/:id/send-template
// WhatsApp templates are mandatory when the 24h window is closed. FAD
// owns the UI route now, but the upstream sender is still external
// until the Meta/Guesty template contract is configured. If
// GMS_TEMPLATE_SEND_PATH is absent, return a blocked state the UI can
// surface instead of pretending the template was sent.
// ────────────────────────────────────────────────────────────────────
router.post('/:id/send-template', attachIdentity, async (req, res) => {
  const { id } = req.params;
  const templateId = typeof req.body?.templateId === 'string' ? req.body.templateId.trim() : '';
  if (!templateId) {
    return res.status(400).json({ error: 'template_id_required', message: 'Choose a WhatsApp template first.' });
  }
  try {
    const { rows } = await query(
      `SELECT id, tenant_id, guesty_conversation_id, channel, communication_channel
         FROM conversations
        WHERE id = $1 AND tenant_id = $2
        LIMIT 1`,
      [id, FR_TENANT_ID],
    );
    const conv = rows[0];
    if (!conv) return res.status(404).json({ error: 'conversation_not_found' });
    const channel = String(conv.communication_channel || conv.channel || '').toLowerCase();
    if (channel && channel !== 'whatsapp') {
      return res.status(409).json({
        error: 'not_whatsapp_conversation',
        message: `Template sends are only available for WhatsApp conversations; current channel is ${channel}.`,
      });
    }

    const configuredPath = process.env.GMS_TEMPLATE_SEND_PATH;
    if (!configuredPath) {
      return res.status(409).json({
        error: 'template_send_not_configured',
        state: 'blocked',
        message: 'WhatsApp template sender is not configured on this backend yet. Send the template manually in Guesty/WhatsApp and refresh the thread.',
        manualAction: 'open_guesty_or_whatsapp',
      });
    }

    const gmsBase = process.env.GMS_BASE_URL || 'https://admin.friday.mu';
    const path = configuredPath
      .replace(':conversationId', encodeURIComponent(id))
      .replace(':guestyConversationId', encodeURIComponent(conv.guesty_conversation_id || id));
    const { data } = await axios.post(
      `${gmsBase}${path}`,
      {
        template_id: templateId,
        variables: req.body?.variables || {},
        conversation_id: id,
        guesty_conversation_id: conv.guesty_conversation_id,
      },
      {
        timeout: 30_000,
        headers: {
          'Content-Type': 'application/json',
          Authorization: req.headers.authorization,
        },
      },
    );
    await publishFadEvent({
      tenantId: conv.tenant_id,
      type: 'inbox.template_sent',
      payload: { conversationId: id, templateId },
    });
    res.json({ ok: true, state: 'sent', upstream: data });
  } catch (e) {
    const status = e.response?.status || 500;
    console.error('[inbox/conversations] send-template error:', e.response?.data || e.message);
    res.status(status).json({
      error: e.response?.data?.error || 'template_send_failed',
      message: e.response?.data?.message || e.message,
      upstream: e.response?.data,
    });
  }
});

// ────────────────────────────────────────────────────────────────────
// GET /api/inbox/conversations
// Optional query: status, channel, has_pending_draft
// Returns: { conversations: [...], total }
// ────────────────────────────────────────────────────────────────────
router.get('/', attachIdentity, async (req, res) => {
  try {
    const { status, channel, has_pending_draft } = req.query;
    const userId = req.identity?.username || req.identity?.userId || 'unknown';
    const params = [userId, FR_TENANT_ID];
    let paramIdx = 3;
    let sql = LIST_SELECT_SQL + ' WHERE c.tenant_id = $2';

    if (status) {
      sql += ` AND c.status = $${paramIdx++}`;
      params.push(status);
    }
    if (channel) {
      sql += ` AND c.channel = $${paramIdx++}`;
      params.push(channel);
    }
    if (has_pending_draft === 'true') {
      sql += ` AND EXISTS (SELECT 1 FROM drafts d WHERE d.conversation_id = c.id AND d.state IN ('draft_ready', 'under_review'))`;
    }

    sql += ' ORDER BY c.last_message_at DESC NULLS LAST';

    const result = await query(sql, params);
    res.json({ conversations: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('[inbox/conversations] list error:', err.message);
    res.status(500).json({ error: 'Failed to list conversations', details: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────
// GET /api/inbox/conversations/:id
// Returns the detail bundle the frontend expects: conversation +
// messages + drafts + reservation + WhatsApp window status + channels +
// seen-by.
// ────────────────────────────────────────────────────────────────────
router.get('/:id', attachIdentity, async (req, res) => {
  try {
    const { id } = req.params;

    const [convResult, messagesResult, draftsResult, reservationResult, channelsResult] =
      await Promise.all([
        query(
          `SELECT c.*,
                  (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.direction = 'inbound') as inbound_count
             FROM conversations c
             WHERE c.id = $1 AND c.tenant_id = $2`,
          [id, FR_TENANT_ID],
        ),
        query('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC', [id]),
        query('SELECT * FROM drafts WHERE conversation_id = $1 ORDER BY created_at DESC', [id]),
        query(
          'SELECT r.* FROM reservations r JOIN conversations c ON c.reservation_id = r.id WHERE c.id = $1',
          [id],
        ),
        query(
          'SELECT DISTINCT module_type FROM messages WHERE conversation_id = $1 AND module_type IS NOT NULL',
          [id],
        ),
      ]);

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const moduleTypeMap = {
      airbnb2: 'airbnb',
      bookingCom: 'booking',
      whatsapp: 'whatsapp',
      email: 'email',
      sms: 'email',
    };
    const conv = convResult.rows[0];
    const channelSet = new Set();
    for (const row of channelsResult.rows) {
      const mapped = moduleTypeMap[row.module_type];
      if (mapped) channelSet.add(mapped);
    }
    if (conv.communication_channel) {
      const cc = String(conv.communication_channel).toLowerCase();
      const mapped =
        moduleTypeMap[cc] ||
        (cc.includes('airbnb')
          ? 'airbnb'
          : cc.includes('booking')
            ? 'booking'
            : cc);
      if (['airbnb', 'booking', 'whatsapp', 'email'].includes(mapped)) channelSet.add(mapped);
    }
    if (conv.channel) {
      const ch = String(conv.channel).toLowerCase();
      if (['airbnb', 'booking', 'whatsapp', 'email'].includes(ch)) channelSet.add(ch);
    }
    const available_channels = channelSet.size > 0 ? Array.from(channelSet) : null;

    // Smart channel routing — recommend, don't restrict
    const bookingSource = String(conv.channel || conv.communication_channel || '').toLowerCase();
    let recommended_channel = null;
    if (bookingSource.includes('airbnb')) {
      recommended_channel = 'airbnb';
    } else if (bookingSource.includes('booking')) {
      recommended_channel = 'booking';
    } else if (bookingSource.includes('whatsapp') || bookingSource === 'direct') {
      recommended_channel = 'whatsapp';
    } else if (bookingSource.includes('email')) {
      recommended_channel = 'email';
    }

    // WhatsApp 24h window
    let whatsapp_window_open = null;
    let whatsapp_window_expires_at = null;
    if (available_channels && available_channels.includes('whatsapp')) {
      if (conv.last_inbound_at) {
        const expiresAt = new Date(new Date(conv.last_inbound_at).getTime() + 24 * 60 * 60 * 1000);
        whatsapp_window_open = expiresAt > new Date();
        whatsapp_window_expires_at = expiresAt.toISOString();
      } else {
        whatsapp_window_open = false;
      }
    }

    // Who has seen this conversation
    const seenByResult = await query(
      `SELECT rs.user_id, u.display_name, rs.last_read_at
         FROM read_status rs
         JOIN users u ON u.username = rs.user_id
         WHERE rs.conversation_id = $1
         ORDER BY rs.last_read_at DESC`,
      [id],
    );

    res.json({
      conversation: conv,
      messages: messagesResult.rows,
      drafts: draftsResult.rows,
      reservation: reservationResult.rows[0] || null,
      whatsapp_window_open,
      whatsapp_window_expires_at,
      available_channels,
      recommended_channel,
      seen_by: seenByResult.rows,
    });
  } catch (err) {
    console.error('[inbox/conversations] detail error:', err.message);
    res.status(500).json({ error: 'Failed to get conversation', details: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────
// GET /api/inbox/conversations/:id/messages
// ────────────────────────────────────────────────────────────────────
router.get('/:id/messages', attachIdentity, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [id],
    );
    res.json({ messages: result.rows });
  } catch (err) {
    console.error('[inbox/conversations] messages error:', err.message);
    res.status(500).json({ error: 'Failed to get messages', details: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────
// GET /api/inbox/conversations/:id/reservation
// ────────────────────────────────────────────────────────────────────
router.get('/:id/reservation', attachIdentity, async (req, res) => {
  try {
    const result = await query(
      `SELECT r.* FROM reservations r
         JOIN conversations c ON c.reservation_id = r.id
         WHERE c.id = $1`,
      [req.params.id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No reservation linked to this conversation' });
    }
    res.json({ reservation: result.rows[0] });
  } catch (err) {
    console.error('[inbox/conversations] reservation error:', err.message);
    res.status(500).json({ error: 'Failed to get reservation', details: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────
// GET /api/inbox/conversations/:id/drafts
// ────────────────────────────────────────────────────────────────────
router.get('/:id/drafts', attachIdentity, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM drafts WHERE conversation_id = $1 ORDER BY created_at DESC',
      [req.params.id],
    );
    res.json({ drafts: result.rows });
  } catch (err) {
    console.error('[inbox/conversations] drafts error:', err.message);
    res.status(500).json({ error: 'Failed to get drafts', details: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────
// GET /api/inbox/conversations/:id/channels
// ────────────────────────────────────────────────────────────────────
router.get('/:id/channels', attachIdentity, async (req, res) => {
  try {
    const result = await query(
      'SELECT channel, guest_email FROM conversations WHERE id = $1 AND tenant_id = $2',
      [req.params.id, FR_TENANT_ID],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    const conversation = result.rows[0];
    res.json({
      channels: {
        channel: conversation.channel,
        guest_email: conversation.guest_email,
        // phone support pending
      },
    });
  } catch (err) {
    console.error('[inbox/conversations] channels error:', err.message);
    res.status(500).json({ error: 'Failed to get channels', details: err.message });
  }
});

// Website-inbox thread IDs are prefixed with `web-` and aren't UUIDs.
// The unified inbox UI sends mark-read/unread to /api/inbox/conversations/
// regardless of source, so we have to gracefully short-circuit those —
// the website-inbox has its own read-state mechanism in
// /api/inbox/website/*. Returning success keeps the badge logic stable
// without erroring.
function isWebsiteThreadId(id) {
  return typeof id === 'string' && id.startsWith('web-');
}

// ────────────────────────────────────────────────────────────────────
// PATCH /api/inbox/conversations/:id/read
// Upsert read_status row for (conv, user).
// ────────────────────────────────────────────────────────────────────
router.patch('/:id/read', attachIdentity, async (req, res) => {
  try {
    const { id } = req.params;
    if (isWebsiteThreadId(id)) {
      // website-inbox owns its own read tracking; no-op for us.
      return res.json({ success: true, skipped: 'website-thread' });
    }
    const userId = req.identity?.username || req.identity?.userId || 'unknown';
    await query(
      `INSERT INTO read_status (conversation_id, user_id, last_read_at)
       VALUES ($1, $2, now())
       ON CONFLICT (conversation_id, user_id)
       DO UPDATE SET last_read_at = now()`,
      [id, userId],
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[inbox/conversations] mark-read error:', err.message);
    res.status(500).json({ error: 'Failed to mark as read', details: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────
// PATCH /api/inbox/conversations/:id/unread
// Delete read_status row so the conversation appears unread again.
// ────────────────────────────────────────────────────────────────────
router.patch('/:id/unread', attachIdentity, async (req, res) => {
  try {
    const { id } = req.params;
    if (isWebsiteThreadId(id)) {
      return res.json({ success: true, skipped: 'website-thread' });
    }
    const userId = req.identity?.username || req.identity?.userId || 'unknown';
    await query(
      'DELETE FROM read_status WHERE conversation_id = $1 AND user_id = $2',
      [id, userId],
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[inbox/conversations] mark-unread error:', err.message);
    res.status(500).json({ error: 'Failed to mark as unread', details: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────
// PATCH /api/inbox/conversations/:id
// Update conversation fields (notes, status, auto_send_enabled).
// Includes the "pending actions guard" that blocks status=done unless
// force_done=true is set when open actions exist on the thread.
//
// Skipped vs GMS: the SSE broadcast on status change. FAD has no SSE
// path today; Sprint 10 §5.3.6 plans /api/public/events via Postgres
// LISTEN/NOTIFY and that's where status-change broadcasts will hook in.
// ────────────────────────────────────────────────────────────────────
router.patch('/:id', attachIdentity, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, status, auto_send_enabled, force_done } = req.body || {};

    if (status === 'done' && !force_done) {
      const pendingResult = await query(
        `SELECT COUNT(*) as count FROM pending_actions
           WHERE conversation_id = $1 AND status = 'pending'`,
        [id],
      );
      const pendingCount = parseInt(pendingResult.rows[0].count, 10);
      if (pendingCount > 0) {
        return res.status(409).json({
          error: 'pending_actions_exist',
          message: `This conversation has ${pendingCount} open action(s). Complete or dismiss them first.`,
          pending_count: pendingCount,
        });
      }
    }

    const updates = [];
    const params = [];
    let paramIdx = 1;

    if (notes !== undefined) {
      updates.push(`notes = $${paramIdx++}`);
      params.push(notes);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIdx++}`);
      params.push(status);
      if (status === 'active') {
        updates.push(`manually_reopened = true`);
      } else if (status === 'done') {
        updates.push(`manually_reopened = false`);
      }
    }
    if (auto_send_enabled !== undefined) {
      updates.push(`auto_send_enabled = $${paramIdx++}`);
      params.push(auto_send_enabled);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = now()`);
    params.push(id);
    params.push(FR_TENANT_ID);

    const result = await query(
      `UPDATE conversations SET ${updates.join(', ')}
         WHERE id = $${paramIdx} AND tenant_id = $${paramIdx + 1}
         RETURNING *`,
      params,
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ conversation: result.rows[0] });
  } catch (err) {
    console.error('[inbox/conversations] update error:', err.message);
    res.status(500).json({ error: 'Failed to update conversation', details: err.message });
  }
});

module.exports = router;
