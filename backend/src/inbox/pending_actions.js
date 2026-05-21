'use strict';

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');

const router = express.Router();

const VALID_STATUSES = new Set([
  'pending',
  'completed',
  'dismissed',
  'auto_dismissed',
  'auto_converted',
]);

function shapePendingAction(row) {
  if (!row) return null;
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    guest_name: row.guest_name,
    property_code: row.property_code,
    action_text: row.action_text,
    status: row.status,
    detected_at: row.detected_at,
    due_by: row.due_by,
    urgency: row.urgency,
    owner: row.owner,
    category: row.category,
    source: row.source,
    fad_task_id: row.fad_task_id,
    conversation: row.conversation_guest_name || row.conversation_channel
      ? {
          guest_name: row.conversation_guest_name,
          channel: row.conversation_channel,
          status: row.conversation_status,
          last_message_at: row.conversation_last_message_at,
        }
      : null,
  };
}

router.get('/', attachIdentity, async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
    if (status !== 'all' && !VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: 'invalid status' });
    }
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;
    const params = [req.tenantId];
    const filters = ['pa.tenant_id = $1'];
    if (status !== 'all') {
      params.push(status);
      filters.push(`pa.status = $${params.length}`);
    }
    const { rows } = await query(
      `SELECT pa.*,
              c.guest_name AS conversation_guest_name,
              c.channel AS conversation_channel,
              c.status AS conversation_status,
              c.last_message_at AS conversation_last_message_at
         FROM pending_actions pa
         LEFT JOIN conversations c ON c.id = pa.conversation_id
        WHERE ${filters.join(' AND ')}
        ORDER BY pa.due_by ASC NULLS LAST, pa.detected_at DESC
        LIMIT ${limit}`,
      params,
    );
    res.json({ pending_actions: rows.map(shapePendingAction) });
  } catch (e) {
    console.error('[pending-actions] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

module.exports._test = {
  shapePendingAction,
};
