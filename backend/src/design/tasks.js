'use strict';

// Per-project tasks (work units). Differs from HR time-off / design
// stages — these are project-internal todos, can be assigned to any
// user, and roll into the project's "next action" / blocker fields when
// flagged.

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { shapeTask } = require('./adapters');
const { appendActivity } = require('./activities');

const router = express.Router();

const WRITABLE_FIELDS = ['stage_key', 'title', 'assignee_user_id', 'due_date', 'status', 'notes', 'completed_at', 'category'];
const VALID_CATEGORIES = ['general', 'blocker', 'next_action'];

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
    if (typeof req.query.category === 'string') {
      if (!VALID_CATEGORIES.includes(req.query.category)) {
        return res.status(400).json({ error: `category must be one of ${VALID_CATEGORIES.join(', ')}` });
      }
      filters.push(`category = $${idx++}`);
      params.push(req.query.category);
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
    if (Object.prototype.hasOwnProperty.call(body, 'category') && !VALID_CATEGORIES.includes(body.category)) {
      return res.status(400).json({ error: `category must be one of ${VALID_CATEGORIES.join(', ')}` });
    }
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, body.project_id],
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
    // QA-§5.8: log to activity timeline so blocker/next-action adds
    // surface in the project's activity feed (not just the task panel).
    // category=general tasks also log because they're useful for
    // procurement teams reviewing what got added when.
    const taskRow = rows[0];
    const action =
      taskRow.category === 'blocker' ? 'task.blocker.added' :
      taskRow.category === 'next_action' ? 'task.next_action.added' :
      'task.added';
    await appendActivity({
      projectId: body.project_id,
      actorUserId: req.identity?.userId,
      actorName: req.identity?.displayName || req.identity?.username,
      action,
      payload: { task_id: taskRow.id, title: taskRow.title, category: taskRow.category },
      visibility: 'internal',
    }).catch((err) => console.warn('[design/tasks] activity append failed:', err.message));
    res.status(201).json(shapeTask(taskRow));
  } catch (e) {
    console.error('[design/tasks] create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    if (Object.prototype.hasOwnProperty.call(body, 'category') && !VALID_CATEGORIES.includes(body.category)) {
      return res.status(400).json({ error: `category must be one of ${VALID_CATEGORIES.join(', ')}` });
    }
    const sets = [];
    const params = [req.tenantId, req.params.id];
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
    // Log resolution / status-change events. Only fires when status
    // moved to 'done' on this PATCH — keeps the activity log uncluttered.
    if (body.status === 'done') {
      const taskRow = rows[0];
      const action =
        taskRow.category === 'blocker' ? 'task.blocker.resolved' :
        taskRow.category === 'next_action' ? 'task.next_action.resolved' :
        'task.completed';
      await appendActivity({
        projectId: taskRow.project_id,
        actorUserId: req.identity?.userId,
        actorName: req.identity?.displayName || req.identity?.username,
        action,
        payload: { task_id: taskRow.id, title: taskRow.title, category: taskRow.category },
        visibility: 'internal',
      }).catch((err) => console.warn('[design/tasks] activity append failed:', err.message));
    }
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
      [req.tenantId, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.status(204).end();
  } catch (e) {
    console.error('[design/tasks] delete error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
