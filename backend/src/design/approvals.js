'use strict';

// Approvals + approval events — generic workflow gate. Approvals point
// to a target row (selection / change_order / agreement / moodboard /
// design_pack / closeout). Events are append-only respond-records;
// status on the approval flips when an event lands.

const express = require('express');
const { query, pool } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { shapeApproval, shapeApprovalEvent } = require('./adapters');
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
      [req.tenantId, projectId],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const filters = ['project_id = $1'];
    const params = [projectId];
    let idx = 2;
    if (typeof req.query.status === 'string') {
      filters.push(`status = $${idx++}`);
      params.push(req.query.status);
    }
    if (typeof req.query.type === 'string') {
      filters.push(`type = $${idx++}`);
      params.push(req.query.type);
    }
    const sql = `SELECT * FROM design_approvals WHERE ${filters.join(' AND ')} ORDER BY sent_at DESC`;
    const { rows } = await query(sql, params);
    res.json({ results: rows.map(shapeApproval) });
  } catch (e) {
    console.error('[design/approvals] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const { rows: approvalRows } = await query(
      `SELECT a.* FROM design_approvals a
       JOIN design_projects p ON p.id = a.project_id
       WHERE p.tenant_id = $1 AND a.id = $2`,
      [req.tenantId, req.params.id],
    );
    if (approvalRows.length === 0) return res.status(404).json({ error: 'Approval not found' });
    const { rows: eventRows } = await query(
      `SELECT * FROM design_approval_events WHERE approval_id = $1 ORDER BY responded_at`,
      [req.params.id],
    );
    res.json({
      ...shapeApproval(approvalRows[0]),
      events: eventRows.map(shapeApprovalEvent),
    });
  } catch (e) {
    console.error('[design/approvals] detail error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.project_id) return res.status(400).json({ error: 'project_id is required' });
    if (!body.type) return res.status(400).json({ error: 'type is required' });
    if (!body.target_id) return res.status(400).json({ error: 'target_id is required' });
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, body.project_id],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const { rows } = await query(
      `INSERT INTO design_approvals (project_id, type, target_id, respondent_user_id, respondent_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        body.project_id,
        body.type,
        body.target_id,
        body.respondent_user_id || null,
        body.respondent_name || null,
      ],
    );
    res.status(201).json(shapeApproval(rows[0]));
  } catch (e) {
    console.error('[design/approvals] create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/design/approvals/:id/respond — staff-side response. Flips
// approval status + appends an event. Owner-side responds come through
// the portal router in design-be-5b.
router.post('/:id/respond', requireDesignPerm('design:approve'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { decision, comment } = req.body || {};
    if (decision !== 'approved' && decision !== 'rejected') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'decision must be approved or rejected' });
    }
    const approvalRes = await client.query(
      `SELECT a.* FROM design_approvals a
       JOIN design_projects p ON p.id = a.project_id
       WHERE p.tenant_id = $1 AND a.id = $2 AND a.status = 'pending'
       FOR UPDATE OF a`,
      [req.tenantId, req.params.id],
    );
    if (approvalRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pending approval not found' });
    }
    const updated = await client.query(
      `UPDATE design_approvals SET status = $2 WHERE id = $1 RETURNING *`,
      [req.params.id, decision],
    );
    const eventRes = await client.query(
      `INSERT INTO design_approval_events (approval_id, respondent_user_id, respondent_name, decision, comment)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        req.params.id,
        req.identity.userId || null,
        req.identity.displayName || req.identity.username || null,
        decision,
        comment || null,
      ],
    );
    await client.query('COMMIT');
    await appendActivity({
      projectId: approvalRes.rows[0].project_id,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: `approval.${decision}`,
      payload: { approval_id: req.params.id, type: approvalRes.rows[0].type, target_id: approvalRes.rows[0].target_id },
      visibility: 'portal',
    }).catch(() => { /* activity logging non-fatal */ });
    res.json({
      ...shapeApproval(updated.rows[0]),
      event: shapeApprovalEvent(eventRes.rows[0]),
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[design/approvals] respond error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
