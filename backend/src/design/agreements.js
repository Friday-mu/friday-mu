'use strict';

// Agreements — one row per project (PK is project_id). Holds fee terms
// + annex_b JSONB (14 schedule rows with tiered cost thresholds). Status
// progresses draft → sent → signed; voided is the escape hatch.

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapeAgreement } = require('./adapters');
const { appendActivity } = require('./activities');

const router = express.Router();

const WRITABLE_FIELDS = [
  'design_fee_percent', 'procurement_fee_percent', 'contingency_percent',
  'annex_b',
];

router.get('/:project_id', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, req.params.project_id],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const { rows } = await query(
      `SELECT * FROM design_agreements WHERE project_id = $1`,
      [req.params.project_id],
    );
    if (rows.length === 0) {
      return res.json({
        project_id: req.params.project_id,
        status: 'draft',
        sent_at: null,
        signed_at: null,
        signed_by: null,
        design_fee_percent: null,
        procurement_fee_percent: null,
        contingency_percent: null,
        annex_b: {},
        updated_at: null,
      });
    }
    res.json(shapeAgreement(rows[0]));
  } catch (e) {
    console.error('[design/agreements] get error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/design/agreements/:project_id — upsert (draft edits).
router.put('/:project_id', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, req.params.project_id],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const body = req.body || {};
    const cols = ['project_id'];
    const placeholders = ['$1'];
    const params = [req.params.project_id];
    let idx = 2;
    const updateSets = [];
    for (const field of WRITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        cols.push(field);
        placeholders.push(`$${idx}`);
        updateSets.push(`${field} = EXCLUDED.${field}`);
        params.push(body[field]);
        idx++;
      }
    }
    updateSets.push('updated_at = NOW()');
    const sql = `INSERT INTO design_agreements (${cols.join(', ')})
                 VALUES (${placeholders.join(', ')})
                 ON CONFLICT (project_id) DO UPDATE SET ${updateSets.join(', ')}
                 RETURNING *`;
    const { rows } = await query(sql, params);
    res.json(shapeAgreement(rows[0]));
  } catch (e) {
    console.error('[design/agreements] put error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/design/agreements/:project_id/send — mark sent, log activity.
router.post('/:project_id/send', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE design_agreements SET status = 'sent', sent_at = NOW(), updated_at = NOW()
       WHERE project_id = $1 AND status = 'draft' RETURNING *`,
      [req.params.project_id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Draft agreement not found' });
    await appendActivity({
      projectId: req.params.project_id,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: 'agreement.sent',
      payload: {},
      visibility: 'portal',
    });
    res.json(shapeAgreement(rows[0]));
  } catch (e) {
    console.error('[design/agreements] send error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/design/agreements/:project_id/sign — mark signed + log.
router.post('/:project_id/sign', requireDesignPerm('design:approve'), async (req, res) => {
  try {
    const { signed_by } = req.body || {};
    const { rows } = await query(
      `UPDATE design_agreements
       SET status = 'signed', signed_at = NOW(), signed_by = $2, updated_at = NOW()
       WHERE project_id = $1 AND status = 'sent' RETURNING *`,
      [req.params.project_id, signed_by || req.identity.userId || null],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Sent agreement not found' });
    await appendActivity({
      projectId: req.params.project_id,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: 'agreement.signed',
      payload: { signed_by: signed_by || req.identity.userId },
      visibility: 'portal',
    });
    res.json(shapeAgreement(rows[0]));
  } catch (e) {
    console.error('[design/agreements] sign error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
