'use strict';

// /api/tasks — tenant-scoped operational tasks (the FAD Operations
// module's backbone). Distinct from `design_tasks`, which models
// blockers + next-actions inside a design project workflow.
//
// Endpoints (auth via attachIdentity):
//   GET    /api/tasks                              list with filters
//   GET    /api/tasks/:id                          single, joined with
//                                                  comments + costs +
//                                                  assignee display
//   POST   /api/tasks                              create
//   PATCH  /api/tasks/:id                          partial update
//   DELETE /api/tasks/:id                          hard-delete
//   POST   /api/tasks/:id/comments                 add a comment
//   POST   /api/tasks/:id/costs                    add a cost line
//   DELETE /api/tasks/:taskId/costs/:costId        remove a cost line
//
// Status set: reported / scheduled / ready / in_progress / paused /
//             blocked / completed / closed / cancelled
//   - PATCH to 'completed' sets `completed_at = NOW()`
//   - PATCH out of 'completed' clears it
//   - `todo` and `done` are accepted only as migration/back-compat
//     aliases and are normalised at the route layer
//
// Cross-module links (loose — no FK enforcement):
//   - project_id        → design_projects.id
//   - property_code     → guesty_listings.nickname / property-map code
//   - reservation_guesty_id → guesty_reservations.guesty_id
//   - inbox_thread_id   → inbox_threads.id (website_inbox)
//   - bz_id             → Breezeway external id (when we sync)

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../auth/identity');

const router = express.Router();

const VALID_STATUS = new Set([
  'reported',
  'scheduled',
  'ready',
  'in_progress',
  'paused',
  'blocked',
  'completed',
  'closed',
  'cancelled',
]);
const VALID_PRIORITY = new Set(['lowest', 'low', 'medium', 'high', 'urgent']);
const VALID_VISIBILITY = new Set(['all', 'team', 'self']);
const VALID_COST_TYPE = new Set([
  'labor', 'material', 'expense', 'tax',
  'skilled_labor', 'unskilled_labor', 'mileage', 'markup',
]);

// Mig-050-era callers used todo/done. The cutover lifecycle keeps
// `todo` as a migration alias only.
function normaliseStatus(s) {
  if (s === 'todo') return 'scheduled';
  if (s === 'done') return 'completed';
  if (s === 'awaiting_approval') return 'blocked';
  return s;
}

function defaultStatusForSource(source) {
  if (source === 'inbox_ai' || source === 'reported_issue' || source === 'review') {
    return 'reported';
  }
  return 'scheduled';
}

function shapeTask(row, comments = [], costs = []) {
  if (!row) return null;
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    project_id: row.project_id,
    bz_id: row.bz_id,
    external_ref: row.external_ref,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    category: row.category,
    source: row.source,
    visibility: row.visibility,
    department: row.department,
    subdepartment: row.subdepartment,
    property_code: row.property_code,
    reservation_guesty_id: row.reservation_guesty_id,
    inbox_thread_id: row.inbox_thread_id,
    group_email_id: row.group_email_id,
    template: row.template,
    is_recurring: row.is_recurring,
    awaiting_human_approval: row.awaiting_human_approval,
    tags: row.tags || [],
    assignee_user_ids: row.assignee_user_ids || [],
    assignee_display_names: row.assignee_display_names || [], // joined
    requester_user_id: row.requester_user_id,
    created_by_user_id: row.created_by_user_id,
    due_date: row.due_date,
    due_time: row.due_time,
    estimated_minutes: row.estimated_minutes,
    spent_minutes: row.spent_minutes,
    attachment_count: row.attachment_count,
    ai_suggestions: row.ai_suggestions || [],
    activity_log: row.activity_log || [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    comments,
    costs,
  };
}

function shapeComment(row) {
  if (!row) return null;
  return {
    id: row.id,
    task_id: row.task_id,
    author_user_id: row.author_user_id,
    author_display_name: row.author_display_name, // joined
    text: row.text,
    mentions: row.mentions || [],
    synced_to_breezeway: row.synced_to_breezeway,
    created_at: row.created_at,
  };
}

function shapeCost(row) {
  if (!row) return null;
  return {
    id: row.id,
    task_id: row.task_id,
    type: row.type,
    amount_minor: row.amount_minor != null ? Number(row.amount_minor) : null,
    currency_code: row.currency_code,
    description: row.description,
    added_by_user_id: row.added_by_user_id,
    added_by_display_name: row.added_by_display_name, // joined
    owner_charge: row.owner_charge,
    flowed_to_finance_expense_id: row.flowed_to_finance_expense_id,
    created_at: row.created_at,
  };
}

// Resolve a UUID[] of assignee_user_ids to a parallel array of
// display_names (or username fallback). One round-trip per task in the
// list view; acceptable up to ~500 tasks, which the list cap enforces.
async function hydrateAssignees(rows) {
  const ids = new Set();
  for (const r of rows) {
    for (const id of r.assignee_user_ids || []) ids.add(id);
  }
  if (ids.size === 0) {
    return rows.map((r) => ({ ...r, assignee_display_names: [] }));
  }
  const { rows: users } = await query(
    `SELECT id, COALESCE(display_name, username, email) AS name
     FROM users WHERE id = ANY($1)`,
    [[...ids]],
  );
  const byId = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    ...r,
    assignee_display_names: (r.assignee_user_ids || []).map((id) => byId.get(id) || null),
  }));
}

async function loadComments(taskId, tenantId) {
  const { rows } = await query(
    `SELECT c.*, u.display_name AS author_display_name
     FROM task_comments c
     LEFT JOIN users u ON u.id = c.author_user_id
     WHERE c.task_id = $1 AND c.tenant_id = $2
     ORDER BY c.created_at ASC`,
    [taskId, tenantId],
  );
  return rows.map(shapeComment);
}

async function loadCosts(taskId, tenantId) {
  const { rows } = await query(
    `SELECT c.*, u.display_name AS added_by_display_name
     FROM task_costs c
     LEFT JOIN users u ON u.id = c.added_by_user_id
     WHERE c.task_id = $1 AND c.tenant_id = $2
     ORDER BY c.created_at ASC`,
    [taskId, tenantId],
  );
  return rows.map(shapeCost);
}

// Append a single entry to the JSONB activity_log on a task. Best-
// effort — never throws to the caller; activity tracking is a nice-
// to-have, not load-bearing.
async function appendActivity(taskId, tenantId, entry) {
  try {
    await query(
      `UPDATE tasks
       SET activity_log = activity_log || $3::jsonb,
           updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [taskId, tenantId, JSON.stringify([{
        id: 'a-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        ts: new Date().toISOString(),
        ...entry,
      }])],
    );
  } catch (e) {
    console.warn('[tasks/appendActivity] failed:', e.message);
  }
}

// GET / — list with filters. Returns shaped tasks WITHOUT comments +
// costs (avoids N+1 on long lists). Detail view loads those.
router.get('/', attachIdentity, async (req, res) => {
  try {
    const filters = ['t.tenant_id = $1'];
    const params = [req.tenantId];
    let i = 2;
    const includeCancelled = req.query.include === 'cancelled';
    if (typeof req.query.status === 'string' && req.query.status.length > 0) {
      const statuses = req.query.status.split(',')
        .map((s) => normaliseStatus(s.trim()))
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
        // Array membership via the GIN index.
        filters.push(`$${i++} = ANY(t.assignee_user_ids)`);
        params.push(assignee);
      }
    }
    if (typeof req.query.project === 'string') {
      filters.push(`t.project_id = $${i++}`);
      params.push(req.query.project);
    }
    if (typeof req.query.property === 'string') {
      filters.push(`t.property_code = $${i++}`);
      params.push(req.query.property);
    }
    if (typeof req.query.reservation === 'string') {
      filters.push(`t.reservation_guesty_id = $${i++}`);
      params.push(req.query.reservation);
    }
    if (typeof req.query.source === 'string') {
      filters.push(`t.source = $${i++}`);
      params.push(req.query.source);
    }
    if (typeof req.query.department === 'string') {
      filters.push(`t.department = $${i++}`);
      params.push(req.query.department);
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
      filters.push(`t.status IN ('reported', 'scheduled', 'ready', 'in_progress', 'paused', 'blocked')`);
    }
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;
    const { rows } = await query(
      `SELECT t.*
       FROM tasks t
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
    const hydrated = await hydrateAssignees(rows);
    res.json({ tasks: hydrated.map((r) => shapeTask(r)) });
  } catch (e) {
    console.error('[tasks] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', attachIdentity, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM tasks WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const [hydrated] = await hydrateAssignees(rows);
    const [comments, costs] = await Promise.all([
      loadComments(req.params.id, req.tenantId),
      loadCosts(req.params.id, req.tenantId),
    ]);
    res.json(shapeTask(hydrated, comments, costs));
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
    const source = typeof body.source === 'string' ? body.source : 'manual';
    const status = body.status ? normaliseStatus(body.status) : defaultStatusForSource(source);
    if (!VALID_STATUS.has(status)) return res.status(400).json({ error: `invalid status: ${body.status}` });
    const priority = VALID_PRIORITY.has(body.priority) ? body.priority : 'medium';
    const visibility = VALID_VISIBILITY.has(body.visibility) ? body.visibility : 'all';
    const assigneeIds = Array.isArray(body.assignee_user_ids)
      ? body.assignee_user_ids.filter(Boolean)
      : (body.assignee_user_id ? [body.assignee_user_id] : []);
    const tags = Array.isArray(body.tags) ? body.tags.filter(Boolean) : [];
    const externalRef = typeof body.external_ref === 'string' && body.external_ref.trim()
      ? body.external_ref.trim()
      : null;

    if (externalRef) {
      const { rows: existing } = await query(
        `SELECT * FROM tasks
         WHERE tenant_id = $1 AND external_ref = $2 AND status <> 'cancelled'
         ORDER BY created_at DESC
         LIMIT 1`,
        [req.tenantId, externalRef],
      );
      if (existing.length > 0) {
        const [hydrated] = await hydrateAssignees(existing);
        const [comments, costs] = await Promise.all([
          loadComments(hydrated.id, req.tenantId),
          loadCosts(hydrated.id, req.tenantId),
        ]);
        return res.status(200).json(shapeTask(hydrated, comments, costs));
      }
    }

    const { rows } = await query(
      `INSERT INTO tasks (
         tenant_id, project_id, bz_id, title, description,
         status, priority, category, source, visibility,
         department, subdepartment, property_code, reservation_guesty_id,
         requester_user_id, created_by_user_id,
         assignee_user_id, assignee_user_ids,
         due_date, due_time, estimated_minutes, spent_minutes,
         is_recurring, template, inbox_thread_id, group_email_id,
         awaiting_human_approval, tags, external_ref
       )
       VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10,
         $11, $12, $13, $14,
         $15, $16,
         $17, $18,
         $19, $20, $21, $22,
         $23, $24, $25, $26,
         $27, $28, $29
       )
       RETURNING *`,
      [
        req.tenantId,
        body.project_id || null,
        body.bz_id || null,
        title,
        typeof body.description === 'string' ? body.description : null,
        status,
        priority,
        typeof body.category === 'string' ? body.category : null,
        source,
        visibility,
        typeof body.department === 'string' ? body.department : null,
        typeof body.subdepartment === 'string' ? body.subdepartment : null,
        typeof body.property_code === 'string' ? body.property_code : null,
        typeof body.reservation_guesty_id === 'string' ? body.reservation_guesty_id : null,
        body.requester_user_id || null,
        req.identity?.userId || null,
        // Keep the legacy single column populated to the first assignee
        // so old read paths don't break during the transition window.
        assigneeIds[0] || null,
        assigneeIds,
        body.due_date || null,
        body.due_time || null,
        Number.isFinite(body.estimated_minutes) ? body.estimated_minutes : null,
        Number.isFinite(body.spent_minutes) ? body.spent_minutes : null,
        body.is_recurring === true,
        typeof body.template === 'string' ? body.template : null,
        typeof body.inbox_thread_id === 'string' ? body.inbox_thread_id : null,
        typeof body.group_email_id === 'string' ? body.group_email_id : null,
        body.awaiting_human_approval === true,
        tags,
        externalRef,
      ],
    );
    const created = rows[0];
    await appendActivity(created.id, req.tenantId, {
      kind: 'created',
      actorId: req.identity?.userId || 'system',
      detail: `Task created from ${created.source}`,
    });
    const [hydrated] = await hydrateAssignees([created]);
    res.status(201).json(shapeTask(hydrated, [], []));
  } catch (e) {
    if (e.code === '23505' && req.body?.external_ref) {
      try {
        const { rows } = await query(
          `SELECT * FROM tasks WHERE tenant_id = $1 AND external_ref = $2 LIMIT 1`,
          [req.tenantId, req.body.external_ref],
        );
        if (rows.length > 0) {
          const [hydrated] = await hydrateAssignees(rows);
          return res.status(200).json(shapeTask(hydrated));
        }
      } catch (lookupError) {
        console.error('[tasks] idempotency lookup failed:', lookupError.message);
      }
    }
    console.error('[tasks] create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', attachIdentity, async (req, res) => {
  try {
    const body = req.body || {};
    const { rows: existingRows } = await query(
      `SELECT * FROM tasks WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, req.params.id],
    );
    if (existingRows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const existing = existingRows[0];

    const sets = [];
    const params = [];
    let i = 1;
    const setCol = (col, val) => { sets.push(`${col} = $${i++}`); params.push(val); };

    if (typeof body.title === 'string' && body.title.trim().length > 0) setCol('title', body.title.trim());
    if (Object.prototype.hasOwnProperty.call(body, 'description')) setCol('description', body.description || null);
    if (typeof body.status === 'string') {
      const status = normaliseStatus(body.status);
      if (!VALID_STATUS.has(status)) return res.status(400).json({ error: `invalid status: ${body.status}` });
      setCol('status', status);
      if (status === 'completed' && existing.status !== 'completed') {
        sets.push(`completed_at = NOW()`);
      } else if (!['completed', 'closed'].includes(status) && existing.status === 'completed') {
        sets.push(`completed_at = NULL`);
      }
    }
    if (typeof body.priority === 'string') {
      if (!VALID_PRIORITY.has(body.priority)) return res.status(400).json({ error: `invalid priority: ${body.priority}` });
      setCol('priority', body.priority);
    }
    if (typeof body.visibility === 'string') {
      if (!VALID_VISIBILITY.has(body.visibility)) return res.status(400).json({ error: `invalid visibility: ${body.visibility}` });
      setCol('visibility', body.visibility);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'category')) setCol('category', body.category || null);
    if (Object.prototype.hasOwnProperty.call(body, 'source') && typeof body.source === 'string') setCol('source', body.source);
    if (Object.prototype.hasOwnProperty.call(body, 'department')) setCol('department', body.department || null);
    if (Object.prototype.hasOwnProperty.call(body, 'subdepartment')) setCol('subdepartment', body.subdepartment || null);
    if (Object.prototype.hasOwnProperty.call(body, 'property_code')) setCol('property_code', body.property_code || null);
    if (Object.prototype.hasOwnProperty.call(body, 'reservation_guesty_id')) setCol('reservation_guesty_id', body.reservation_guesty_id || null);
    if (Object.prototype.hasOwnProperty.call(body, 'project_id')) setCol('project_id', body.project_id || null);
    if (Object.prototype.hasOwnProperty.call(body, 'due_date')) setCol('due_date', body.due_date || null);
    if (Object.prototype.hasOwnProperty.call(body, 'due_time')) setCol('due_time', body.due_time || null);
    if (Object.prototype.hasOwnProperty.call(body, 'estimated_minutes')) setCol('estimated_minutes', Number.isFinite(body.estimated_minutes) ? body.estimated_minutes : null);
    if (Object.prototype.hasOwnProperty.call(body, 'spent_minutes')) setCol('spent_minutes', Number.isFinite(body.spent_minutes) ? body.spent_minutes : null);
    if (Object.prototype.hasOwnProperty.call(body, 'is_recurring')) setCol('is_recurring', body.is_recurring === true);
    if (Object.prototype.hasOwnProperty.call(body, 'awaiting_human_approval')) setCol('awaiting_human_approval', body.awaiting_human_approval === true);
    if (Object.prototype.hasOwnProperty.call(body, 'tags')) setCol('tags', Array.isArray(body.tags) ? body.tags : []);
    if (Object.prototype.hasOwnProperty.call(body, 'inbox_thread_id')) setCol('inbox_thread_id', body.inbox_thread_id || null);
    if (Object.prototype.hasOwnProperty.call(body, 'group_email_id')) setCol('group_email_id', body.group_email_id || null);
    if (Object.prototype.hasOwnProperty.call(body, 'external_ref')) {
      setCol('external_ref', typeof body.external_ref === 'string' && body.external_ref.trim() ? body.external_ref.trim() : null);
    }

    // Multi-assignee. Accept both `assignee_user_ids` (preferred) and
    // legacy `assignee_user_id` (single). Keep the legacy column in sync.
    let nextAssignees;
    if (Object.prototype.hasOwnProperty.call(body, 'assignee_user_ids')) {
      nextAssignees = Array.isArray(body.assignee_user_ids)
        ? body.assignee_user_ids.filter(Boolean)
        : [];
    } else if (Object.prototype.hasOwnProperty.call(body, 'assignee_user_id')) {
      nextAssignees = body.assignee_user_id ? [body.assignee_user_id] : [];
    }
    if (nextAssignees !== undefined) {
      setCol('assignee_user_ids', nextAssignees);
      setCol('assignee_user_id', nextAssignees[0] || null);
    }

    if (sets.length === 0) {
      const [hydrated] = await hydrateAssignees([existing]);
      return res.json(shapeTask(hydrated));
    }
    sets.push(`updated_at = NOW()`);

    const { rows } = await query(
      `UPDATE tasks SET ${sets.join(', ')}
       WHERE tenant_id = $${i++} AND id = $${i++}
       RETURNING *`,
      [...params, req.tenantId, req.params.id],
    );
    const updated = rows[0];
    const [hydrated] = await hydrateAssignees([updated]);
    res.json(shapeTask(hydrated));

    // Activity side effects (best-effort).
    if (Object.prototype.hasOwnProperty.call(body, 'status') && updated.status !== existing.status) {
      void appendActivity(updated.id, req.tenantId, {
        kind: 'status_changed',
        actorId: req.identity?.userId || 'system',
        detail: `${existing.status} → ${updated.status}`,
      });
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

// ─── Comments ────────────────────────────────────────────────────
router.post('/:id/comments', attachIdentity, async (req, res) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (text.length === 0) return res.status(400).json({ error: 'text is required' });
    // Confirm the task exists in this tenant before inserting.
    const { rows: taskRows } = await query(
      `SELECT id FROM tasks WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, req.params.id],
    );
    if (taskRows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const mentions = Array.isArray(req.body?.mentions) ? req.body.mentions.filter(Boolean) : [];
    const { rows } = await query(
      `INSERT INTO task_comments (task_id, tenant_id, author_user_id, text, mentions)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.params.id, req.tenantId, req.identity?.userId || null, text, mentions],
    );
    void appendActivity(req.params.id, req.tenantId, {
      kind: 'commented',
      actorId: req.identity?.userId || 'system',
    });
    // Reload with the author join for the response.
    const { rows: joined } = await query(
      `SELECT c.*, u.display_name AS author_display_name
       FROM task_comments c
       LEFT JOIN users u ON u.id = c.author_user_id
       WHERE c.id = $1`,
      [rows[0].id],
    );
    res.status(201).json(shapeComment(joined[0]));
  } catch (e) {
    console.error('[tasks/comments] create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Costs ───────────────────────────────────────────────────────
router.post('/:id/costs', attachIdentity, async (req, res) => {
  try {
    const body = req.body || {};
    const type = body.type;
    if (!VALID_COST_TYPE.has(type)) return res.status(400).json({ error: `invalid cost type: ${type}` });
    const amountMinor = Math.round(Number(body.amount_minor));
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      return res.status(400).json({ error: 'amount_minor must be a positive integer (minor units)' });
    }
    const currency = typeof body.currency_code === 'string' ? body.currency_code.toUpperCase() : '';
    if (currency.length === 0) return res.status(400).json({ error: 'currency_code is required' });
    const { rows: taskRows } = await query(
      `SELECT id FROM tasks WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, req.params.id],
    );
    if (taskRows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const { rows } = await query(
      `INSERT INTO task_costs (
         task_id, tenant_id, type, amount_minor, currency_code,
         description, added_by_user_id, owner_charge
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.params.id, req.tenantId, type, amountMinor, currency,
        typeof body.description === 'string' ? body.description : null,
        req.identity?.userId || null,
        body.owner_charge === true,
      ],
    );
    void appendActivity(req.params.id, req.tenantId, {
      kind: 'cost_added',
      actorId: req.identity?.userId || 'system',
      detail: `${type}: ${currency} ${(amountMinor / 100).toFixed(2)}`,
    });
    const { rows: joined } = await query(
      `SELECT c.*, u.display_name AS added_by_display_name
       FROM task_costs c
       LEFT JOIN users u ON u.id = c.added_by_user_id
       WHERE c.id = $1`,
      [rows[0].id],
    );
    res.status(201).json(shapeCost(joined[0]));
  } catch (e) {
    console.error('[tasks/costs] create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:taskId/costs/:costId', attachIdentity, async (req, res) => {
  try {
    const { rowCount } = await query(
      `DELETE FROM task_costs
       WHERE id = $1 AND task_id = $2 AND tenant_id = $3`,
      [req.params.costId, req.params.taskId, req.tenantId],
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Cost not found' });
    res.status(204).end();
  } catch (e) {
    console.error('[tasks/costs] delete error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
