'use strict';

// Photos — URL refs, kind-classified ('exterior' / 'interior' / 'detail'
// / 'concept' / 'as-built'). Actual blob storage external; this table
// just indexes the refs.

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapePhoto } = require('./adapters');

const router = express.Router();

const WRITABLE_FIELDS = ['kind', 'caption', 'url', 'room_id'];

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
    const filters = ['project_id = $1'];
    const params = [projectId];
    let idx = 2;
    if (typeof req.query.kind === 'string') {
      filters.push(`kind = $${idx++}`);
      params.push(req.query.kind);
    }
    if (typeof req.query.room_id === 'string') {
      filters.push(`room_id = $${idx++}`);
      params.push(req.query.room_id);
    }
    const sql = `SELECT * FROM design_photos WHERE ${filters.join(' AND ')} ORDER BY uploaded_at DESC`;
    const { rows } = await query(sql, params);
    res.json({ results: rows.map(shapePhoto) });
  } catch (e) {
    console.error('[design/photos] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.project_id) return res.status(400).json({ error: 'project_id is required' });
    if (!body.kind) return res.status(400).json({ error: 'kind is required' });
    if (!body.url) return res.status(400).json({ error: 'url is required' });
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, body.project_id],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const { rows } = await query(
      `INSERT INTO design_photos (project_id, room_id, kind, caption, url)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [body.project_id, body.room_id || null, body.kind, body.caption || null, body.url],
    );
    res.status(201).json(shapePhoto(rows[0]));
  } catch (e) {
    console.error('[design/photos] create error:', e.message);
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
    const sql = `UPDATE design_photos ph SET ${sets.join(', ')}
                 FROM design_projects p
                 WHERE p.id = ph.project_id AND p.tenant_id = $1 AND ph.id = $2
                 RETURNING ph.*`;
    const { rows } = await query(sql, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Photo not found' });
    res.json(shapePhoto(rows[0]));
  } catch (e) {
    console.error('[design/photos] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { rows } = await query(
      `DELETE FROM design_photos ph USING design_projects p
       WHERE p.id = ph.project_id AND p.tenant_id = $1 AND ph.id = $2
       RETURNING ph.id`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Photo not found' });
    res.status(204).end();
  } catch (e) {
    console.error('[design/photos] delete error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
