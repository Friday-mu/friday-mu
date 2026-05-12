'use strict';

// Moodboards — version-tracked per project. Status: draft → sent →
// approved | changes_requested. links JSONB is the array of inspirations
// (URLs + captions + optional image refs).

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapeMoodboard } = require('./adapters');
const { appendActivity } = require('./activities');

const router = express.Router();

const WRITABLE_FIELDS = ['version_number', 'name', 'links', 'notes'];

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
      `SELECT * FROM design_moodboards WHERE project_id = $1 ORDER BY version_number DESC`,
      [projectId],
    );
    res.json({ results: rows.map(shapeMoodboard) });
  } catch (e) {
    console.error('[design/moodboards] list error:', e.message);
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

    // Auto-bump version if not specified
    let versionNumber = body.version_number;
    if (versionNumber == null) {
      const { rows: maxRows } = await query(
        `SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM design_moodboards WHERE project_id = $1`,
        [body.project_id],
      );
      versionNumber = maxRows[0].next;
    }
    const { rows } = await query(
      `INSERT INTO design_moodboards (project_id, version_number, name, links, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        body.project_id,
        versionNumber,
        body.name || null,
        body.links || [],
        body.notes || null,
      ],
    );
    res.status(201).json(shapeMoodboard(rows[0]));
  } catch (e) {
    console.error('[design/moodboards] create error:', e.message);
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
        sets.push(`${field} = $${idx++}`);
        params.push(body[field] === '' ? null : body[field]);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No allowed fields to update' });
    sets.push('updated_at = NOW()');
    const sql = `UPDATE design_moodboards m SET ${sets.join(', ')}
                 FROM design_projects p
                 WHERE p.id = m.project_id AND p.tenant_id = $1 AND m.id = $2 AND m.status = 'draft'
                 RETURNING m.*`;
    const { rows } = await query(sql, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Draft moodboard not found' });
    res.json(shapeMoodboard(rows[0]));
  } catch (e) {
    console.error('[design/moodboards] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/send', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE design_moodboards m SET status = 'sent', sent_at = NOW(), updated_at = NOW()
       FROM design_projects p
       WHERE p.id = m.project_id AND p.tenant_id = $1 AND m.id = $2 AND m.status = 'draft'
       RETURNING m.*`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Draft moodboard not found' });
    await appendActivity({
      projectId: rows[0].project_id,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: 'moodboard.sent',
      payload: { moodboard_id: rows[0].id, version_number: rows[0].version_number },
      visibility: 'portal',
    });
    res.json(shapeMoodboard(rows[0]));
  } catch (e) {
    console.error('[design/moodboards] send error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/approve', requireDesignPerm('design:approve'), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE design_moodboards m SET status = 'approved', approved_at = NOW(), updated_at = NOW()
       FROM design_projects p
       WHERE p.id = m.project_id AND p.tenant_id = $1 AND m.id = $2 AND m.status = 'sent'
       RETURNING m.*`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Sent moodboard not found' });
    await appendActivity({
      projectId: rows[0].project_id,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: 'moodboard.approved',
      payload: { moodboard_id: rows[0].id, version_number: rows[0].version_number },
      visibility: 'portal',
    });
    res.json(shapeMoodboard(rows[0]));
  } catch (e) {
    console.error('[design/moodboards] approve error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
