'use strict';

// Inbox drafts read-side, FAD-native. Two routes ported from
// friday-gms/src/routes/drafts.ts:
//
//   GET /api/inbox/drafts/queued/list  — recent queued / failed sends
//   GET /api/inbox/drafts/:id          — single draft
//
// Write-side (approve / reject / revise / retry / fail / dismiss)
// stays proxied to friday-gms — those are intelligence-layer-adjacent
// and frozen per the brief's anti-goal until Sprint 11.

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');

const router = express.Router();

const FR_TENANT_ID = '00000000-0000-0000-0000-000000000001';

// ────────────────────────────────────────────────────────────────────
// GET /api/inbox/drafts/queued/list
// Recent queued + failed drafts, joined to their conversations so the
// frontend can show the retry-card label without a second fetch.
// Must come BEFORE /:id so Express doesn't match "queued" as an id.
// ────────────────────────────────────────────────────────────────────
router.get('/queued/list', attachIdentity, async (_req, res) => {
  try {
    const result = await query(
      `SELECT d.id, d.state, d.draft_body, d.retry_count, d.send_method,
              d.updated_at, d.created_at, d.conversation_id, d.next_retry_at,
              c.guest_name, c.property_name, c.guesty_conversation_id, c.channel
         FROM drafts d
         JOIN conversations c ON c.id = d.conversation_id
         WHERE d.state IN ('send_queued', 'send_failed')
           AND c.tenant_id = $1
         ORDER BY d.updated_at DESC
         LIMIT 50`,
      [FR_TENANT_ID],
    );
    res.json({ drafts: result.rows });
  } catch (err) {
    console.error('[inbox/drafts] queued/list error:', err.message);
    res.status(500).json({ error: 'Failed to get queued drafts' });
  }
});

// ────────────────────────────────────────────────────────────────────
// GET /api/inbox/drafts/:id
// ────────────────────────────────────────────────────────────────────
router.get('/:id', attachIdentity, async (req, res) => {
  try {
    const result = await query('SELECT * FROM drafts WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    res.json({ draft: result.rows[0] });
  } catch (err) {
    console.error('[inbox/drafts] detail error:', err.message);
    res.status(500).json({ error: 'Failed to get draft' });
  }
});

module.exports = router;
