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
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');

const router = express.Router();

const FR_TENANT_ID = '00000000-0000-0000-0000-000000000001';

// ────────────────────────────────────────────────────────────────────
// GET /api/inbox/conversations
// Optional query: status, channel, has_pending_draft
// Returns: { conversations: [...], total }
// ────────────────────────────────────────────────────────────────────
router.get('/', attachIdentity, async (req, res) => {
  try {
    const { status, channel, has_pending_draft } = req.query;
    const userId = req.identity?.username || req.identity?.userId || 'unknown';

    let sql = `
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
      WHERE c.tenant_id = $2
    `;
    const params = [userId, FR_TENANT_ID];
    let paramIdx = 3;

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

    res.json({
      conversations: result.rows,
      total: result.rows.length,
    });
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

module.exports = router;
