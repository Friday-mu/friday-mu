'use strict';

// /api/tasks — tenant-scoped operational tasks. Separate from
// `design_tasks` (which is anchored to a design project + only
// models blockers + next-actions inside that workflow).
//
// Endpoints (all require auth via attachIdentity):
//   GET    /api/tasks                  list with filters
//   GET    /api/tasks/:id              single
//   POST   /api/tasks                  create
//   PATCH  /api/tasks/:id              update (incl. status transitions)
//   DELETE /api/tasks/:id              hard-delete (rarely used; the
//                                      preferred flow is PATCH status=cancelled)
//
// Filters on list:
//   ?status=todo|in_progress|done|cancelled  (repeatable via CSV)
//   ?assignee=<user_id>                      'me' resolves to req.identity.userId
//   ?project=<project_id>
//   ?priority=lowest|low|medium|high|urgent
//   ?due_before=YYYY-MM-DD                   inclusive
//   ?due_after=YYYY-MM-DD                    inclusive
//   ?overdue=true                            due_date < today AND status IN (todo, in_progress)
//   ?include=cancelled                       defaults exclude cancelled
//   ?limit=N (default 200, max 500)
//
// Assignee changes trigger an email via `tenants/email.js` →
// `tplTaskAssigned`. Fire-and-forget — never blocks the response.

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');
const { sendEmail, tplTaskAssigned } = require('../tenants/email');

const router = express.Router();

const VALID_STATUS = new Set(['todo', 'in_progress', 'done', 'cancelled']);
const VALID_PRIORITY = new Set(['lowest', 'low', 'medium', 'high', 'urgent']);

function shapeTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    project_id: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    category: row.category,
    assignee_user_id: row.assignee_user_id,
    assignee_display_name: row.assignee_display_name, // joined
    assignee_email: row.assignee_email,                // joined
    created_by_user_id: row.created_by_user_id,
    due_date: row.due_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
  };
}

const BASE_SELECT = `
  SELECT t.*,
         u.display_name AS assignee_display_name,
         u.email        AS assignee_email
  FROM tasks t
  LEFT JOIN users u ON u.id = t.assignee_user_id
`;

// Notify a newly-assigned user. Best-effort; never throws.
async function notifyAssignment(tenantId, taskId, assignerUserId) {
  try {
    const { rows } = await query(
      `SELECT t.*, u.email AS assignee_email, u.display_name AS assignee_display_name,
              tn.name AS tenant_name,
              au.display_name AS assigner_display_name, au.email AS assigner_email
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assignee_user_id
       LEFT JOIN tenants tn ON tn.id = t.tenant_id
       LEFT JOIN users au ON au.id = $3
       WHERE t.id = $1 AND t.tenant_id = $2`,
      [taskId, tenantId, assignerUserId],
    );
    const row = rows[0];
    if (!row || !row.assignee_email) return;
    // Don't email yourself.
    if (row.assignee_user_id === assignerUserId) return;
    const tpl = tplTaskAssigned({
      tenant: { name: row.tenant_name },
      task: {
        title: row.title,
        description: row.description,
        due_date: row.due_date,
        priority: row.priority,
      },
      assigner: {
        display_name: row.assigner_display_name,
        email: row.assigner_email,
      },
      // No standalone task-detail URL yet — link to Operations module.
      // Frontend wiring (next session) will add a dedicated ?task= deep-link.
      taskUrl: `https://gms.friday.mu/fad?m=operations`,
    });
    await sendEmail({ to: row.assignee_email, ...tpl });
  } catch (e) {
    console.error('[tasks/notifyAssignment] failed:', e.message);
  }
}

// GET / — list with filters.
router.get('/', attachIdentity, async (req, res) => {
  try {
    const filters = ['t.tenant_id = $1'];
    const params = [req.tenantId];
    let i = 2;
    const includeCancelled = req.query.include === 'cancelled';
    if (typeof req.query.status === 'string' && req.query.status.length > 0) {
      const statuses = req.query.status.split(',')
        .map((s) => s.trim())
        .filter((s) => VALID_STATUS.has(s));
      if (statuses.length > 0) {
        filters.push(`t.status = ANY($${i++})`);
        params.push(statuses);
      }
    } else if (!includeCancelled) {
      filters.push(`t.status != 'cancelled'`);
    }
    if (typeof req.query.assignee === 'string') {
      const assignee = req.query.assignee === 'me'
        ? req.identity?.userId
        : req.query.assignee;
      if (assignee) {
        filters.push(`t.assignee_user_id = $${i++}`);
        params.push(assignee);
      }
    }
    if (typeof req.query.project === 'string') {
      filters.push(`t.project_id = $${i++}`);
      params.push(req.query.project);
    }
    if (typeof req.query.priority === 'string' && VALID_PRIORITY.has(req.query.priority)) {
      filters.push(`t.priority = $${i++}`);
      params.push(req.query.priority);
    }
    if (typeof req.query.due_before === 'string') {
      filters.push(`t.due_date <= $${i++}`);
      params.push(req.query.due_before);
    }
    if (typeof req.query.due_after === 'string') {
      filters.push(`t.due_date >= $${i++}`);
      params.push(req.query.due_after);
    }
    if (req.query.overdue === 'true') {
      filters.push(`t.due_date < CURRENT_DATE`);
      filters.push(`t.status IN ('todo', 'in_progress')`);
    }
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;
    const { rows } = await query(
      `${BASE_SELECT}
       WHERE ${filters.join(' AND ')}
       ORDER BY
         CASE t.priority
           WHEN 'urgent' THEN 0
           WHEN 'high'   THEN 1
           WHEN 'medium' THEN 2
           WHEN 'low'    THEN 3
           WHEN 'lowest' THEN 4
         END,
         t.due_date ASC NULLS LAST,
         t.created_at DESC
       LIMIT ${limit}`,
      params,
    );
    res.json({ tasks: rows.map(shapeTask) });
  } catch (e) {
    console.error('[tasks] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', attachIdentity, async (req, res) => {
  try {
    const { rows } = await query(
      `${BASE_SELECT} WHERE t.tenant_id = $1 AND t.id = $2`,
      [req.tenantId, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json(shapeTask(rows[0]));
  } catch (e) {
    console.error('[tasks] get error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', attachIdentity, async (req, res) => {
  try {
    const body = req.body || {};
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (title.length === 0) return res.status(400).json({ error: 'title is required' });
    const status = VALID_STATUS.has(body.status) ? body.status : 'todo';
    const priority = VALID_PRIORITY.has(body.priority) ? body.priority : 'medium';
    const { rows } = await query(
      `INSERT INTO tasks (
         tenant_id, project_id, title, description, status, priority, category,
         assignee_user_id, created_by_user_id, due_date
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        req.tenantId,
        body.project_id || null,
        title,
        typeof body.description === 'string' ? body.description : null,
        status,
        priority,
        typeof body.category === 'string' ? body.category : null,
        body.assignee_user_id || null,
        req.identity?.userId || null,
        body.due_date || null,
      ],
    );
    const created = rows[0];
    res.status(201).json(shapeTask(created));
    if (created.assignee_user_id) {
      void notifyAssignment(req.tenantId, created.id, req.identity?.userId);
    }
  } catch (e) {
    console.error('[tasks] create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', attachIdentity, async (req, res) => {
  try {
    const body = req.body || {};
    // Load current row to detect assignee changes for the email.
    const { rows: existingRows } = await query(
      `SELECT * FROM tasks WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, req.params.id],
    );
    if (existingRows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const existing = existingRows[0];

    const sets = [];
    const params = [];
    let i = 1;
    if (typeof body.title === 'string' && body.title.trim().length > 0) {
      sets.push(`title = $${i++}`);
      params.push(body.title.trim());
    }
    if (Object.prototype.hasOwnProperty.call(body, 'description')) {
      sets.push(`description = $${i++}`);
      params.push(body.description || null);
    }
    if (typeof body.status === 'string') {
      if (!VALID_STATUS.has(body.status)) {
        return res.status(400).json({ error: `invalid status: ${body.status}` });
      }
      sets.push(`status = $${i++}`);
      params.push(body.status);
      // completed_at follows the status. Sets on first transition to
      // done; clears on transition out of done.
      if (body.status === 'done' && existing.status !== 'done') {
        sets.push(`completed_at = NOW()`);
      } else if (body.status !== 'done' && existing.status === 'done') {
        sets.push(`completed_at = NULL`);
      }
    }
    if (typeof body.priority === 'string') {
      if (!VALID_PRIORITY.has(body.priority)) {
        return res.status(400).json({ error: `invalid priority: ${body.priority}` });
      }
      sets.push(`priority = $${i++}`);
      params.push(body.priority);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'category')) {
      sets.push(`category = $${i++}`);
      params.push(body.category || null);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'assignee_user_id')) {
      sets.push(`assignee_user_id = $${i++}`);
      params.push(body.assignee_user_id || null);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'project_id')) {
      sets.push(`project_id = $${i++}`);
      params.push(body.project_id || null);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'due_date')) {
      sets.push(`due_date = $${i++}`);
      params.push(body.due_date || null);
    }

    if (sets.length === 0) {
      return res.json(shapeTask(existing));
    }
    sets.push(`updated_at = NOW()`);

    const { rows } = await query(
      `UPDATE tasks SET ${sets.join(', ')}
       WHERE tenant_id = $${i++} AND id = $${i++}
       RETURNING *`,
      [...params, req.tenantId, req.params.id],
    );
    const updated = rows[0];
    res.json(shapeTask(updated));

    // Email on assignee change (including initial assignment from null).
    if (
      Object.prototype.hasOwnProperty.call(body, 'assignee_user_id') &&
      updated.assignee_user_id &&
      updated.assignee_user_id !== existing.assignee_user_id
    ) {
      void notifyAssignment(req.tenantId, updated.id, req.identity?.userId);
    }
  } catch (e) {
    console.error('[tasks] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', attachIdentity, async (req, res) => {
  try {
    const { rowCount } = await query(
      `DELETE FROM tasks WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, req.params.id],
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Task not found' });
    res.status(204).end();
  } catch (e) {
    console.error('[tasks] delete error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
