'use strict';

// Design packs — versioned, same status lifecycle as moodboards.
// image_ids JSONB references design_assets.sha256 entries.

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapePack } = require('./adapters');
const { appendActivity } = require('./activities');

const router = express.Router();

const WRITABLE_FIELDS = ['version_number', 'room_label', 'pdf_url', 'image_ids'];

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
      `SELECT * FROM design_packs WHERE project_id = $1 ORDER BY version_number DESC`,
      [projectId],
    );
    res.json({ results: rows.map(shapePack) });
  } catch (e) {
    console.error('[design/packs] list error:', e.message);
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
    let versionNumber = body.version_number;
    if (versionNumber == null) {
      const { rows: maxRows } = await query(
        `SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM design_packs WHERE project_id = $1`,
        [body.project_id],
      );
      versionNumber = maxRows[0].next;
    }
    const { rows } = await query(
      `INSERT INTO design_packs (project_id, version_number, room_label, pdf_url, image_ids)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        body.project_id,
        versionNumber,
        body.room_label || null,
        body.pdf_url || null,
        body.image_ids || [],
      ],
    );
    res.status(201).json(shapePack(rows[0]));
  } catch (e) {
    console.error('[design/packs] create error:', e.message);
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
    const sql = `UPDATE design_packs pk SET ${sets.join(', ')}
                 FROM design_projects p
                 WHERE p.id = pk.project_id AND p.tenant_id = $1 AND pk.id = $2 AND pk.status = 'draft'
                 RETURNING pk.*`;
    const { rows } = await query(sql, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Draft pack not found' });
    res.json(shapePack(rows[0]));
  } catch (e) {
    console.error('[design/packs] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/send', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE design_packs pk SET status = 'sent', sent_at = NOW(), updated_at = NOW()
       FROM design_projects p
       WHERE p.id = pk.project_id AND p.tenant_id = $1 AND pk.id = $2 AND pk.status = 'draft'
       RETURNING pk.*`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Draft pack not found' });
    await appendActivity({
      projectId: rows[0].project_id,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: 'design_pack.sent',
      payload: { pack_id: rows[0].id, version_number: rows[0].version_number },
      visibility: 'portal',
    });
    res.json(shapePack(rows[0]));
  } catch (e) {
    console.error('[design/packs] send error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/approve', requireDesignPerm('design:approve'), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE design_packs pk SET status = 'approved', approved_at = NOW(), updated_at = NOW()
       FROM design_projects p
       WHERE p.id = pk.project_id AND p.tenant_id = $1 AND pk.id = $2 AND pk.status = 'sent'
       RETURNING pk.*`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Sent pack not found' });
    await appendActivity({
      projectId: rows[0].project_id,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: 'design_pack.approved',
      payload: { pack_id: rows[0].id, version_number: rows[0].version_number },
      visibility: 'portal',
    });
    res.json(shapePack(rows[0]));
  } catch (e) {
    console.error('[design/packs] approve error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
