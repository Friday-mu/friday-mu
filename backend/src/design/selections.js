'use strict';

// Selections — owner picker UI. Each selection has options[] (JSONB) and
// status transitions: draft → sent → picked | changes_requested.
//
// Options are mutated via JSONB array helpers; for v0.1, the full
// options array is replaced on PATCH (simpler than path-based updates).

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapeSelection } = require('./adapters');
const { appendActivity } = require('./activities');

const router = express.Router();

// Migration 020 added room_id + category_code so selections can be
// keyed by room and budget category — the frontend has always tracked
// these but until the migration they had no backend column.
const WRITABLE_FIELDS = ['title', 'pack_id', 'options', 'room_id', 'category_code'];

// JSONB fields need explicit casting through ::jsonb because the dynamic
// SET clause prevents node-postgres from inferring the column type — a
// plain JS array binds as a Postgres array literal and trips
// "invalid input syntax for type json".
const JSONB_FIELDS = new Set(['options']);

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
      `SELECT * FROM design_selections WHERE project_id = $1 ORDER BY created_at DESC`,
      [projectId],
    );
    res.json({ results: rows.map(shapeSelection) });
  } catch (e) {
    console.error('[design/selections] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.project_id) return res.status(400).json({ error: 'project_id is required' });
    if (!body.title) return res.status(400).json({ error: 'title is required' });
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, body.project_id],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const { rows } = await query(
      `INSERT INTO design_selections (project_id, pack_id, title, options, room_id, category_code)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        body.project_id,
        body.pack_id || null,
        body.title,
        body.options || [],
        body.room_id || null,
        body.category_code || null,
      ],
    );
    res.status(201).json(shapeSelection(rows[0]));
  } catch (e) {
    console.error('[design/selections] create error:', e.message);
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
    const sql = `UPDATE design_selections s SET ${sets.join(', ')}
                 FROM design_projects p
                 WHERE p.id = s.project_id AND p.tenant_id = $1 AND s.id = $2 AND s.status = 'draft'
                 RETURNING s.*`;
    const { rows } = await query(sql, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Draft selection not found' });
    res.json(shapeSelection(rows[0]));
  } catch (e) {
    console.error('[design/selections] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/send', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE design_selections s SET status = 'sent', sent_at = NOW(), updated_at = NOW()
       FROM design_projects p
       WHERE p.id = s.project_id AND p.tenant_id = $1 AND s.id = $2 AND s.status = 'draft'
       RETURNING s.*`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Draft selection not found' });
    await appendActivity({
      projectId: rows[0].project_id,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: 'selection.sent',
      payload: { selection_id: rows[0].id, title: rows[0].title },
      visibility: 'portal',
    });
    res.json(shapeSelection(rows[0]));
  } catch (e) {
    console.error('[design/selections] send error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Staff-side: manually record a pick (e.g. owner phoned in their choice).
// Owner-side picks come through the portal router in design-be-5b.
router.post('/:id/pick', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { picked_option_id } = req.body || {};
    if (!picked_option_id) return res.status(400).json({ error: 'picked_option_id is required' });
    const { rows } = await query(
      `UPDATE design_selections s SET status = 'picked', picked_option_id = $3, picked_at = NOW(), updated_at = NOW()
       FROM design_projects p
       WHERE p.id = s.project_id AND p.tenant_id = $1 AND s.id = $2 AND s.status = 'sent'
       RETURNING s.*`,
      [DEFAULT_TENANT_ID, req.params.id, picked_option_id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Sent selection not found' });
    await appendActivity({
      projectId: rows[0].project_id,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: 'selection.picked',
      payload: { selection_id: rows[0].id, picked_option_id },
      visibility: 'portal',
    });
    res.json(shapeSelection(rows[0]));
  } catch (e) {
    console.error('[design/selections] pick error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/request-changes', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { comment } = req.body || {};
    const { rows } = await query(
      `UPDATE design_selections s SET status = 'changes_requested', change_request_comment = $3, updated_at = NOW()
       FROM design_projects p
       WHERE p.id = s.project_id AND p.tenant_id = $1 AND s.id = $2 AND s.status = 'sent'
       RETURNING s.*`,
      [DEFAULT_TENANT_ID, req.params.id, comment || null],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Sent selection not found' });
    await appendActivity({
      projectId: rows[0].project_id,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: 'selection.changes_requested',
      payload: { selection_id: rows[0].id, comment: comment || null },
      visibility: 'portal',
    });
    res.json(shapeSelection(rows[0]));
  } catch (e) {
    console.error('[design/selections] request-changes error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
