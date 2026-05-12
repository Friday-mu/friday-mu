'use strict';

// Payment gates — 7 per project per fixture: agreement_signed,
// design_fee_60, design_fee_40, execution_fee_t1, execution_fee_t2,
// project_funds, final_balance. Status: pending → received | waived.
// Logging the receipt fires a portal-visible activity event.

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapePaymentGate } = require('./adapters');
const { appendActivity } = require('./activities');

const router = express.Router();

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
      `SELECT * FROM design_payment_gates WHERE project_id = $1 ORDER BY due_date NULLS LAST, created_at`,
      [projectId],
    );
    res.json({ results: rows.map(shapePaymentGate) });
  } catch (e) {
    console.error('[design/payment_gates] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/design/payment_gates/:project_id/:gate_id — upsert (set
// amount + due_date for a gate). Idempotent.
router.put('/:project_id/:gate_id', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { project_id: projectId, gate_id: gateId } = req.params;
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, projectId],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const body = req.body || {};
    const { rows } = await query(
      `INSERT INTO design_payment_gates (project_id, gate_id, amount_minor, due_date)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, gate_id) DO UPDATE
       SET amount_minor = EXCLUDED.amount_minor,
           due_date = EXCLUDED.due_date,
           updated_at = NOW()
       RETURNING *`,
      [projectId, gateId, body.amount_minor || null, body.due_date || null],
    );
    res.json(shapePaymentGate(rows[0]));
  } catch (e) {
    console.error('[design/payment_gates] upsert error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/design/payment_gates/:project_id/:gate_id/receive
router.post('/:project_id/:gate_id/receive', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { project_id: projectId, gate_id: gateId } = req.params;
    const { amount_minor, received_at, note } = req.body || {};
    const { rows } = await query(
      `UPDATE design_payment_gates
       SET status = 'received',
           received_amount_minor = $3,
           received_at = COALESCE($4::timestamptz, NOW()),
           received_note = $5,
           updated_at = NOW()
       WHERE project_id = $1 AND gate_id = $2 AND status = 'pending'
       RETURNING *`,
      [projectId, gateId, amount_minor || null, received_at || null, note || null],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Pending gate not found' });
    await appendActivity({
      projectId,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: 'payment.received',
      payload: { gate_id: gateId, amount_minor: amount_minor || null },
      visibility: 'portal',
    });
    res.json(shapePaymentGate(rows[0]));
  } catch (e) {
    console.error('[design/payment_gates] receive error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/design/payment_gates/:project_id/:gate_id/waive
router.post('/:project_id/:gate_id/waive', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { project_id: projectId, gate_id: gateId } = req.params;
    const { note } = req.body || {};
    const { rows } = await query(
      `UPDATE design_payment_gates
       SET status = 'waived', received_note = $3, updated_at = NOW()
       WHERE project_id = $1 AND gate_id = $2 AND status = 'pending'
       RETURNING *`,
      [projectId, gateId, note || null],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Pending gate not found' });
    await appendActivity({
      projectId,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: 'payment.waived',
      payload: { gate_id: gateId, note: note || null },
      visibility: 'internal',
    });
    res.json(shapePaymentGate(rows[0]));
  } catch (e) {
    console.error('[design/payment_gates] waive error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
