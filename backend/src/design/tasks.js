'use strict';

// Per-project tasks (work units). Differs from HR time-off / design
// stages — these are project-internal todos, can be assigned to any
// user, and roll into the project's "next action" / blocker fields when
// flagged.

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapeTask } = require('./adapters');

const router = express.Router();

const WRITABLE_FIELDS = ['stage_key', 'title', 'assignee_user_id', 'due_date', 'status', 'notes', 'completed_at'];

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
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const filters = ['project_id = $1'];
    const params = [projectId];
    let idx = 2;
    if (typeof req.query.status === 'string') {
      filters.push(`status = $${idx++}`);
      params.push(req.query.status);
    }
    if (typeof req.query.assignee_user_id === 'string') {
      filters.push(`assignee_user_id = $${idx++}`);
      params.push(req.query.assignee_user_id);
    }
    const sql = `SELECT * FROM design_tasks WHERE ${filters.join(' AND ')} ORDER BY due_date NULLS LAST, created_at`;
    const { rows } = await query(sql, params);
    res.json({ results: rows.map(shapeTask) });
  } catch (e) {
    console.error('[design/tasks] list error:', e.message);
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
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const cols = ['project_id', 'title'];
    const placeholders = ['$1', '$2'];
    const params = [body.project_id, body.title];
    let idx = 3;
    for (const field of WRITABLE_FIELDS) {
      if (field === 'title') continue;
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        cols.push(field);
        placeholders.push(`$${idx++}`);
        params.push(body[field]);
      }
    }
    const sql = `INSERT INTO design_tasks (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    const { rows } = await query(sql, params);
    res.status(201).json(shapeTask(rows[0]));
  } catch (e) {
    console.error('[design/tasks] create error:', e.message);
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
    const sql = `UPDATE design_tasks t SET ${sets.join(', ')}
                 FROM design_projects p
                 WHERE p.id = t.project_id AND p.tenant_id = $1 AND t.id = $2
                 RETURNING t.*`;
    const { rows } = await query(sql, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json(shapeTask(rows[0]));
  } catch (e) {
    console.error('[design/tasks] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { rows } = await query(
      `DELETE FROM design_tasks t USING design_projects p
       WHERE p.id = t.project_id AND p.tenant_id = $1 AND t.id = $2
       RETURNING t.id`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.status(204).end();
  } catch (e) {
    console.error('[design/tasks] delete error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
