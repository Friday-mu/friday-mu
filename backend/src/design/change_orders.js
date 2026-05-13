'use strict';

// Change orders — scope deltas. line_items is a JSONB array authored on
// the frontend; for v0.1 the full array is replaced on PATCH.

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapeChangeOrder } = require('./adapters');
const { appendActivity } = require('./activities');

const router = express.Router();

// Migration 021 added title + co_number. co_number is server-assigned
// at INSERT (next MAX+1 per project) and not directly writable via
// PATCH — gaps are expected when COs are rejected/deleted and the
// sequence shouldn't shift retroactively.
const WRITABLE_FIELDS = ['line_items', 'reason', 'title'];

// JSONB fields need explicit casting through ::jsonb because the dynamic
// SET clause prevents node-postgres from inferring the column type — a
// plain JS array binds as a Postgres array literal and trips
// "invalid input syntax for type json".
const JSONB_FIELDS = new Set(['line_items']);

router.get('/', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const projectId = req.query.project_id;
    if (typeof projectId !== 'string') {
      return res.status(400).json({ error: 'project_id query param is required' });
    }
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, projectId],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const { rows } = await query(
      `SELECT * FROM design_change_orders WHERE project_id = $1 ORDER BY created_at DESC`,
      [projectId],
    );
    res.json({ results: rows.map(shapeChangeOrder) });
  } catch (e) {
    console.error('[design/change_orders] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.project_id) return res.status(400).json({ error: 'project_id is required' });
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, body.project_id],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    // co_number = next per-project sequence. COALESCE handles the
    // first-CO-on-project case where MAX returns NULL.
    const { rows: numRows } = await query(
      `SELECT COALESCE(MAX(co_number), 0) + 1 AS next FROM design_change_orders WHERE project_id = $1`,
      [body.project_id],
    );
    const coNumber = numRows[0].next;
    const { rows } = await query(
      `INSERT INTO design_change_orders (project_id, line_items, reason, title, co_number)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [body.project_id, body.line_items || [], body.reason || null, body.title || null, coNumber],
    );
    res.status(201).json(shapeChangeOrder(rows[0]));
  } catch (e) {
    console.error('[design/change_orders] create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    const sets = [];
    const params = [DEFAULT_TENANT_ID, req.params.id];
    let idx = 3;
    for (const field of WRITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        if (JSONB_FIELDS.has(field)) {
          sets.push(`${field} = $${idx++}::jsonb`);
          params.push(JSON.stringify(body[field] ?? []));
        } else {
          sets.push(`${field} = $${idx++}`);
          params.push(body[field] === '' ? null : body[field]);
        }
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No allowed fields to update' });
    sets.push('updated_at = NOW()');
    const sql = `UPDATE design_change_orders co SET ${sets.join(', ')}
                 FROM design_projects p
                 WHERE p.id = co.project_id AND p.tenant_id = $1 AND co.id = $2 AND co.status = 'draft'
                 RETURNING co.*`;
    const { rows } = await query(sql, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Draft change order not found' });
    res.json(shapeChangeOrder(rows[0]));
  } catch (e) {
    console.error('[design/change_orders] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/send', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE design_change_orders co SET status = 'sent', sent_at = NOW(), updated_at = NOW()
       FROM design_projects p
       WHERE p.id = co.project_id AND p.tenant_id = $1 AND co.id = $2 AND co.status = 'draft'
       RETURNING co.*`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Draft change order not found' });
    await appendActivity({
      projectId: rows[0].project_id,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: 'change_order.sent',
      payload: { change_order_id: rows[0].id },
      visibility: 'portal',
    });
    res.json(shapeChangeOrder(rows[0]));
  } catch (e) {
    console.error('[design/change_orders] send error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/approve', requireDesignPerm('design:approve'), async (req, res) => {
  try {
    const { decision_note } = req.body || {};
    const { rows } = await query(
      `UPDATE design_change_orders co SET status = 'approved', decided_at = NOW(), decided_by = $3, decision_note = $4, updated_at = NOW()
       FROM design_projects p
       WHERE p.id = co.project_id AND p.tenant_id = $1 AND co.id = $2 AND co.status = 'sent'
       RETURNING co.*`,
      [DEFAULT_TENANT_ID, req.params.id, req.identity.userId || null, decision_note || null],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Sent change order not found' });
    await appendActivity({
      projectId: rows[0].project_id,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: 'change_order.approved',
      payload: { change_order_id: rows[0].id },
      visibility: 'portal',
    });
    res.json(shapeChangeOrder(rows[0]));
  } catch (e) {
    console.error('[design/change_orders] approve error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/reject', requireDesignPerm('design:approve'), async (req, res) => {
  try {
    const { decision_note } = req.body || {};
    const { rows } = await query(
      `UPDATE design_change_orders co SET status = 'rejected', decided_at = NOW(), decided_by = $3, decision_note = $4, updated_at = NOW()
       FROM design_projects p
       WHERE p.id = co.project_id AND p.tenant_id = $1 AND co.id = $2 AND co.status = 'sent'
       RETURNING co.*`,
      [DEFAULT_TENANT_ID, req.params.id, req.identity.userId || null, decision_note || null],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Sent change order not found' });
    await appendActivity({
      projectId: rows[0].project_id,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: 'change_order.rejected',
      payload: { change_order_id: rows[0].id, note: decision_note || null },
      visibility: 'portal',
    });
    res.json(shapeChangeOrder(rows[0]));
  } catch (e) {
    console.error('[design/change_orders] reject error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
