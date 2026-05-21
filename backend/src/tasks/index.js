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
//   POST   /api/tasks/:id/supplies                 record supply use
//   DELETE /api/tasks/:taskId/supplies/:supplyId   remove supply use
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
const { pool, query } = require('../database/client');
const { attachIdentity } = require('../design/auth');
const { sendEmail, tplTaskAssigned } = require('../tenants/email');
const {
  previewBreezewayCsv,
  applyBreezewayCsv,
  previewBreezewayBundle,
  applyBreezewayBundle,
} = require('./breezewayImport');

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
const VALID_REQUIREMENT_KIND = new Set([
  'check', 'photo', 'file', 'expense', 'supply', 'time', 'summary',
]);
const VALID_SUPPLY_CATEGORY = new Set([
  'linen', 'amenity', 'cleaning', 'maintenance', 'welcome', 'consumable', 'other',
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMPORT_ROLES = new Set([
  'admin',
  'director',
  'ops_manager',
  'operations_manager',
  'manager',
  'supervisor',
]);

const TASK_SORTS = {
  propertyCode: 't.property_code',
  property: 't.property_code',
  title: 't.title',
  subdepartment: 't.subdepartment',
  department: 't.department',
  status: `CASE t.status
    WHEN 'reported' THEN 0
    WHEN 'scheduled' THEN 1
    WHEN 'ready' THEN 2
    WHEN 'in_progress' THEN 3
    WHEN 'paused' THEN 4
    WHEN 'blocked' THEN 5
    WHEN 'completed' THEN 6
    WHEN 'closed' THEN 7
    WHEN 'cancelled' THEN 8
    ELSE 9
  END`,
  priority: `CASE t.priority
    WHEN 'urgent' THEN 0
    WHEN 'high' THEN 1
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 3
    WHEN 'lowest' THEN 4
    ELSE 5
  END`,
  dueDate: 't.due_date',
  due_date: 't.due_date',
  source: 't.source',
  createdAt: 't.created_at',
  updatedAt: 't.updated_at',
};

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function taskOrderBy(query) {
  const sortKey = typeof query.sort === 'string' ? query.sort : '';
  const sortExpr = TASK_SORTS[sortKey];
  if (!sortExpr) {
    return `CASE t.priority
        WHEN 'urgent' THEN 0
        WHEN 'high'   THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low'    THEN 3
        WHEN 'lowest' THEN 4
      END,
      t.due_date ASC NULLS LAST,
      t.created_at DESC`;
  }

  const dir = query.dir === 'desc' ? 'DESC' : 'ASC';
  const tieBreaker = sortExpr === 't.created_at' ? 't.id ASC' : 't.created_at DESC';
  return `${sortExpr} ${dir} NULLS LAST, ${tieBreaker}`;
}

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

function cleanText(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normaliseRequirements(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const id = cleanText(item.id, `req-${index + 1}`);
      const label = cleanText(item.label, 'Requirement');
      const kind = VALID_REQUIREMENT_KIND.has(item.kind) ? item.kind : 'check';
      return {
        id,
        label,
        kind,
        required: item.required !== false,
        description: cleanText(item.description, ''),
        evidenceHint: cleanText(item.evidenceHint, ''),
        gate: cleanText(item.gate, ''),
      };
    });
}

function normaliseRequirementState(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const ids = (arr) => (Array.isArray(arr)
    ? arr.filter((id) => typeof id === 'string' && id.trim().length > 0)
    : []);
  return {
    completedIds: ids(source.completedIds || source.completed_ids),
    waivedIds: ids(source.waivedIds || source.waived_ids),
    updatedAt: cleanText(source.updatedAt || source.updated_at, ''),
  };
}

function shapeTask(row, comments = [], costs = [], supplies = []) {
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
    requirements: row.requirements || [],
    requirement_state: row.requirement_state || { completedIds: [], waivedIds: [] },
    assignee_user_ids: row.assignee_user_ids || [],
    assignee_display_names: row.assignee_display_names || [], // joined
    requester_user_id: row.requester_user_id,
    requester_display_name: row.requester_display_name || null,
    created_by_user_id: row.created_by_user_id,
    created_by_display_name: row.created_by_display_name || null,
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
    import_batch_id: row.import_batch_id,
    source_payload: row.source_payload || {},
    source_created_at: row.source_created_at,
    source_updated_at: row.source_updated_at,
    source_started_at: row.source_started_at,
    source_due_at: row.source_due_at,
    source_completed_at: row.source_completed_at,
    comments,
    costs,
    supplies,
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

function shapeSupply(row) {
  if (!row) return null;
  return {
    id: row.id,
    task_id: row.task_id,
    supply_id: row.supply_id,
    supply_name: row.supply_name,
    category: row.category,
    quantity: row.quantity != null ? Number(row.quantity) : 0,
    unit: row.unit,
    location_code: row.location_code,
    unit_cost_minor: row.unit_cost_minor != null ? Number(row.unit_cost_minor) : null,
    currency_code: row.currency_code,
    owner_charge: row.owner_charge,
    stock_movement_id: row.stock_movement_id,
    flowed_to_task_cost_id: row.flowed_to_task_cost_id,
    added_by_user_id: row.added_by_user_id,
    added_by_display_name: row.added_by_display_name,
    created_at: row.created_at,
  };
}

function parsePositiveQuantity(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  return Math.round(quantity * 100) / 100;
}

function parseOptionalMinor(value) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Math.round(Number(value));
  if (!Number.isFinite(amount) || amount < 0) return null;
  return amount;
}

function requireImportRole(req, res) {
  const role = cleanText(req.identity?.userRole || req.identity?.role, '').toLowerCase();
  if (IMPORT_ROLES.has(role)) return true;
  res.status(403).json({ error: 'Operations import requires manager/supervisor access' });
  return false;
}

// Resolve UUID user references to display_names (or username/email fallback).
// One round-trip per task page; acceptable up to ~500 tasks, which the list
// cap enforces.
async function hydrateAssignees(rows) {
  const ids = new Set();
  for (const r of rows) {
    for (const id of r.assignee_user_ids || []) ids.add(id);
    if (r.requester_user_id) ids.add(r.requester_user_id);
    if (r.created_by_user_id) ids.add(r.created_by_user_id);
  }
  if (ids.size === 0) {
    return rows.map((r) => ({
      ...r,
      assignee_display_names: [],
      requester_display_name: null,
      created_by_display_name: null,
    }));
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
    requester_display_name: r.requester_user_id ? byId.get(r.requester_user_id) || null : null,
    created_by_display_name: r.created_by_user_id ? byId.get(r.created_by_user_id) || null : null,
  }));
}

async function loadComments(taskId, tenantId) {
  const { rows } = await query(
    `SELECT c.*, COALESCE(u.display_name, u.username, u.email) AS author_display_name
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
    `SELECT c.*, COALESCE(u.display_name, u.username, u.email) AS added_by_display_name
     FROM task_costs c
     LEFT JOIN users u ON u.id = c.added_by_user_id
     WHERE c.task_id = $1 AND c.tenant_id = $2
     ORDER BY c.created_at ASC`,
    [taskId, tenantId],
  );
  return rows.map(shapeCost);
}

async function loadSupplies(taskId, tenantId) {
  const { rows } = await query(
    `SELECT s.*, COALESCE(u.display_name, u.username, u.email) AS added_by_display_name
     FROM task_supplies s
     LEFT JOIN users u ON u.id = s.added_by_user_id
     WHERE s.task_id = $1 AND s.tenant_id = $2
     ORDER BY s.created_at ASC`,
    [taskId, tenantId],
  );
  return rows.map(shapeSupply);
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

// Send assignment emails to each newly-added assignee. Best-effort and
// deliberately after the API response path so task writes stay durable
// even if email delivery is unavailable.
async function notifyNewAssignees(tenantId, taskId, oldIds, newIds, actorUserId) {
  const oldSet = new Set(oldIds || []);
  const added = (newIds || []).filter((id) => !oldSet.has(id) && id !== actorUserId);
  if (added.length === 0) return;
  try {
    const { rows } = await query(
      `SELECT t.*, tn.name AS tenant_name,
              au.display_name AS assigner_display_name, au.email AS assigner_email
       FROM tasks t
       LEFT JOIN tenants tn ON tn.id = t.tenant_id
       LEFT JOIN users au ON au.id = $3
       WHERE t.id = $1 AND t.tenant_id = $2`,
      [taskId, tenantId, actorUserId],
    );
    const task = rows[0];
    if (!task) return;
    const { rows: assignees } = await query(
      `SELECT id, email, display_name FROM users WHERE id = ANY($1)`,
      [added],
    );
    for (const assignee of assignees) {
      if (!assignee.email) continue;
      const tpl = tplTaskAssigned({
        tenant: { name: task.tenant_name },
        task: {
          title: task.title,
          description: task.description,
          due_date: task.due_date,
          priority: task.priority,
        },
        assigner: {
          display_name: task.assigner_display_name,
          email: task.assigner_email,
        },
        taskUrl: `https://admin.friday.mu/fad?m=operations&task=${task.id}`,
      });
      sendEmail({ to: assignee.email, ...tpl }).catch((e) => {
        console.warn(`[tasks/notifyAssignees] sendEmail to ${assignee.email} failed:`, e.message);
      });
    }
  } catch (e) {
    console.error('[tasks/notifyAssignees] failed:', e.message);
  }
}

// GET / — list with filters. Returns shaped tasks WITHOUT comments +
// costs (avoids N+1 on long lists). Detail view loads those. The list
// response includes pagination metadata so Operations can handle
// historical imports without pretending the first slice is the universe.
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
        if (!UUID_RE.test(assignee)) {
          filters.push('FALSE');
        } else {
          // Array membership via the GIN index.
          filters.push(`$${i++}::uuid = ANY(t.assignee_user_ids)`);
          params.push(assignee);
        }
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
    if (typeof req.query.search === 'string' && req.query.search.trim().length > 0) {
      const needle = `%${req.query.search.trim()}%`;
      filters.push(`(
        t.title ILIKE $${i}
        OR COALESCE(t.description, '') ILIKE $${i}
        OR COALESCE(t.property_code, '') ILIKE $${i}
        OR COALESCE(t.bz_id, '') ILIKE $${i}
        OR COALESCE(t.external_ref, '') ILIKE $${i}
        OR COALESCE(t.department, '') ILIKE $${i}
        OR COALESCE(t.subdepartment, '') ILIKE $${i}
      )`);
      params.push(needle);
      i += 1;
    }
    const limit = clampInt(req.query.limit, 50, 1, 500);
    const offset = clampInt(req.query.offset, 0, 0, 1_000_000);
    const orderBy = taskOrderBy(req.query);
    const { rows } = await query(
      `SELECT t.*, COUNT(*) OVER()::int AS total_count
       FROM tasks t
       WHERE ${filters.join(' AND ')}
       ORDER BY ${orderBy}
       LIMIT $${i++}
       OFFSET $${i++}`,
      [...params, limit, offset],
    );
    const hydrated = await hydrateAssignees(rows);
    let total = rows.length > 0 ? Number(rows[0].total_count || 0) : 0;
    if (rows.length === 0 && offset > 0) {
      const { rows: countRows } = await query(
        `SELECT COUNT(*)::int AS total
         FROM tasks t
         WHERE ${filters.join(' AND ')}`,
        params,
      );
      total = Number(countRows[0]?.total || 0);
    }
    res.json({
      tasks: hydrated.map((r) => shapeTask(r)),
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      sort: typeof req.query.sort === 'string' && TASK_SORTS[req.query.sort] ? req.query.sort : null,
      dir: req.query.dir === 'desc' ? 'desc' : 'asc',
    });
  } catch (e) {
    console.error('[tasks] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── One-time Breezeway historical import ────────────────────────
router.post('/imports/breezeway/preview', attachIdentity, async (req, res) => {
  try {
    if (!requireImportRole(req, res)) return;
    const body = req.body || {};
    const csvText = typeof body.csvText === 'string' ? body.csvText : '';
    if (!csvText.trim()) return res.status(400).json({ error: 'csvText is required' });
    const { report } = await previewBreezewayCsv({
      csvText,
      fileName: typeof body.fileName === 'string' ? body.fileName : null,
      propertyMap: body.propertyMap && typeof body.propertyMap === 'object' ? body.propertyMap : {},
      userMap: body.userMap && typeof body.userMap === 'object' ? body.userMap : {},
      sampleSize: Number.isFinite(body.sampleSize) ? body.sampleSize : undefined,
      tenantId: req.tenantId,
      db: pool,
    });
    res.json(report);
  } catch (e) {
    console.error('[tasks/imports/breezeway] preview error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/imports/breezeway/apply', attachIdentity, async (req, res) => {
  try {
    if (!requireImportRole(req, res)) return;
    const body = req.body || {};
    if (body.confirmApply !== true) {
      return res.status(400).json({ error: 'confirmApply=true is required for Breezeway import apply mode' });
    }
    const csvText = typeof body.csvText === 'string' ? body.csvText : '';
    if (!csvText.trim()) return res.status(400).json({ error: 'csvText is required' });
    const report = await applyBreezewayCsv({
      csvText,
      fileName: typeof body.fileName === 'string' ? body.fileName : null,
      propertyMap: body.propertyMap && typeof body.propertyMap === 'object' ? body.propertyMap : {},
      userMap: body.userMap && typeof body.userMap === 'object' ? body.userMap : {},
      sampleSize: Number.isFinite(body.sampleSize) ? body.sampleSize : undefined,
      tenantId: req.tenantId,
      actorUserId: req.identity?.userId || null,
      db: pool,
    });
    res.json(report);
  } catch (e) {
    console.error('[tasks/imports/breezeway] apply error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/imports/breezeway/bundle-preview', attachIdentity, async (req, res) => {
  try {
    if (!requireImportRole(req, res)) return;
    const body = req.body || {};
    const fileTexts = body.files && typeof body.files === 'object' ? body.files : null;
    if (!fileTexts) return res.status(400).json({ error: 'files object is required' });
    const { report } = await previewBreezewayBundle({
      fileTexts,
      propertyMap: body.propertyMap && typeof body.propertyMap === 'object' ? body.propertyMap : {},
      userMap: body.userMap && typeof body.userMap === 'object' ? body.userMap : {},
      sampleSize: Number.isFinite(body.sampleSize) ? body.sampleSize : undefined,
      tenantId: req.tenantId,
      db: pool,
    });
    res.json(report);
  } catch (e) {
    console.error('[tasks/imports/breezeway] bundle preview error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/imports/breezeway/bundle-apply', attachIdentity, async (req, res) => {
  try {
    if (!requireImportRole(req, res)) return;
    const body = req.body || {};
    if (body.confirmApply !== true) {
      return res.status(400).json({ error: 'confirmApply=true is required for Breezeway bundle import apply mode' });
    }
    const fileTexts = body.files && typeof body.files === 'object' ? body.files : null;
    if (!fileTexts) return res.status(400).json({ error: 'files object is required' });
    const report = await applyBreezewayBundle({
      fileTexts,
      propertyMap: body.propertyMap && typeof body.propertyMap === 'object' ? body.propertyMap : {},
      userMap: body.userMap && typeof body.userMap === 'object' ? body.userMap : {},
      sampleSize: Number.isFinite(body.sampleSize) ? body.sampleSize : undefined,
      tenantId: req.tenantId,
      actorUserId: req.identity?.userId || null,
      db: pool,
    });
    res.json(report);
  } catch (e) {
    console.error('[tasks/imports/breezeway] bundle apply error:', e.message);
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
    const [comments, costs, supplies] = await Promise.all([
      loadComments(req.params.id, req.tenantId),
      loadCosts(req.params.id, req.tenantId),
      loadSupplies(req.params.id, req.tenantId),
    ]);
    res.json(shapeTask(hydrated, comments, costs, supplies));
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
    const requirements = normaliseRequirements(body.requirements);
    const requirementState = normaliseRequirementState(body.requirement_state);
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
        const [comments, costs, supplies] = await Promise.all([
          loadComments(hydrated.id, req.tenantId),
          loadCosts(hydrated.id, req.tenantId),
          loadSupplies(hydrated.id, req.tenantId),
        ]);
        return res.status(200).json(shapeTask(hydrated, comments, costs, supplies));
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
         awaiting_human_approval, tags, external_ref,
         requirements, requirement_state
       )
       VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10,
         $11, $12, $13, $14,
         $15, $16,
         $17, $18,
         $19, $20, $21, $22,
         $23, $24, $25, $26,
         $27, $28, $29,
         $30::jsonb, $31::jsonb
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
        JSON.stringify(requirements),
        JSON.stringify(requirementState),
      ],
    );
    const created = rows[0];
    await appendActivity(created.id, req.tenantId, {
      kind: 'created',
      actorId: req.identity?.userId || 'system',
      detail: `Task created from ${created.source}`,
    });
    const [hydrated] = await hydrateAssignees([created]);
    res.status(201).json(shapeTask(hydrated, [], [], []));
    if (assigneeIds.length > 0) {
      void notifyNewAssignees(req.tenantId, created.id, [], assigneeIds, req.identity?.userId);
    }
  } catch (e) {
    if (e.code === '23505' && req.body?.external_ref) {
      try {
        const { rows } = await query(
          `SELECT * FROM tasks WHERE tenant_id = $1 AND external_ref = $2 LIMIT 1`,
          [req.tenantId, req.body.external_ref],
        );
        if (rows.length > 0) {
          const [hydrated] = await hydrateAssignees(rows);
          const [comments, costs, supplies] = await Promise.all([
            loadComments(hydrated.id, req.tenantId),
            loadCosts(hydrated.id, req.tenantId),
            loadSupplies(hydrated.id, req.tenantId),
          ]);
          return res.status(200).json(shapeTask(hydrated, comments, costs, supplies));
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
    const setJsonCol = (col, val) => { sets.push(`${col} = $${i++}::jsonb`); params.push(JSON.stringify(val)); };

    if (typeof body.title === 'string' && body.title.trim().length > 0) setCol('title', body.title.trim());
    if (Object.prototype.hasOwnProperty.call(body, 'description')) setCol('description', body.description || null);
    if (typeof body.status === 'string') {
      const status = normaliseStatus(body.status);
      if (!VALID_STATUS.has(status)) return res.status(400).json({ error: `invalid status: ${body.status}` });
      setCol('status', status);
      if (status === 'completed' && existing.status !== 'completed') {
        sets.push(`completed_at = NOW()`);
      } else if (!['completed', 'closed'].includes(status) && ['completed', 'closed'].includes(existing.status)) {
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
    if (Object.prototype.hasOwnProperty.call(body, 'requirements')) {
      setJsonCol('requirements', normaliseRequirements(body.requirements));
    }
    if (Object.prototype.hasOwnProperty.call(body, 'requirement_state')) {
      setJsonCol('requirement_state', normaliseRequirementState(body.requirement_state));
    }
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
    if (nextAssignees !== undefined) {
      void notifyNewAssignees(
        req.tenantId,
        updated.id,
        existing.assignee_user_ids || [],
        updated.assignee_user_ids || [],
        req.identity?.userId,
      );
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

// ─── Supplies + inventory movements ─────────────────────────────
router.post('/:id/supplies', attachIdentity, async (req, res) => {
  const client = await pool.connect();
  try {
    const body = req.body || {};
    const supplyId = cleanText(body.supply_id, '');
    const supplyName = cleanText(body.supply_name, '');
    const category = cleanText(body.category, 'other');
    const quantity = parsePositiveQuantity(body.quantity);
    const unit = cleanText(body.unit, '');
    const locationCode = cleanText(body.location_code, '') || null;
    const currency = cleanText(body.currency_code, 'MUR').toUpperCase();
    const unitCostMinor = parseOptionalMinor(body.unit_cost_minor);

    if (!supplyId) return res.status(400).json({ error: 'supply_id is required' });
    if (!supplyName) return res.status(400).json({ error: 'supply_name is required' });
    if (!VALID_SUPPLY_CATEGORY.has(category)) return res.status(400).json({ error: `invalid supply category: ${category}` });
    if (quantity === null) return res.status(400).json({ error: 'quantity must be a positive number' });
    if (!unit) return res.status(400).json({ error: 'unit is required' });
    if (!currency) return res.status(400).json({ error: 'currency_code is required' });

    await client.query('BEGIN');
    const { rows: taskRows } = await client.query(
      `SELECT id FROM tasks WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, req.params.id],
    );
    if (taskRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Task not found' });
    }

    const { rows: movementRows } = await client.query(
      `INSERT INTO stock_movements (
         tenant_id, task_id, supply_id, supply_name, location_code,
         quantity_delta, unit, reason, created_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'task_use', $8)
       RETURNING *`,
      [
        req.tenantId,
        req.params.id,
        supplyId,
        supplyName,
        locationCode,
        -quantity,
        unit,
        req.identity?.userId || null,
      ],
    );

    let costId = null;
    const ownerCharge = body.owner_charge === true;
    if (ownerCharge && unitCostMinor !== null && unitCostMinor > 0) {
      const amountMinor = Math.round(quantity * unitCostMinor);
      const { rows: costRows } = await client.query(
        `INSERT INTO task_costs (
           task_id, tenant_id, type, amount_minor, currency_code,
           description, added_by_user_id, owner_charge
         )
         VALUES ($1, $2, 'material', $3, $4, $5, $6, TRUE)
         RETURNING id`,
        [
          req.params.id,
          req.tenantId,
          amountMinor,
          currency,
          `Supply: ${supplyName} x ${quantity} ${unit}`,
          req.identity?.userId || null,
        ],
      );
      costId = costRows[0]?.id || null;
    }

    const { rows } = await client.query(
      `INSERT INTO task_supplies (
         task_id, tenant_id, supply_id, supply_name, category,
         quantity, unit, location_code, unit_cost_minor, currency_code,
         owner_charge, stock_movement_id, flowed_to_task_cost_id,
         added_by_user_id
       )
       VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10,
         $11, $12, $13,
         $14
       )
       RETURNING *`,
      [
        req.params.id,
        req.tenantId,
        supplyId,
        supplyName,
        category,
        quantity,
        unit,
        locationCode,
        unitCostMinor,
        currency,
        ownerCharge,
        movementRows[0].id,
        costId,
        req.identity?.userId || null,
      ],
    );
    await client.query('COMMIT');

    void appendActivity(req.params.id, req.tenantId, {
      kind: 'supply_used',
      actorId: req.identity?.userId || 'system',
      detail: `${supplyName}: ${quantity} ${unit}`,
    });
    const { rows: joined } = await query(
      `SELECT s.*, u.display_name AS added_by_display_name
       FROM task_supplies s
       LEFT JOIN users u ON u.id = s.added_by_user_id
       WHERE s.id = $1`,
      [rows[0].id],
    );
    res.status(201).json(shapeSupply(joined[0]));
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[tasks/supplies] create error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.delete('/:taskId/supplies/:supplyId', attachIdentity, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT *
       FROM task_supplies
       WHERE id = $1 AND task_id = $2 AND tenant_id = $3
       FOR UPDATE`,
      [req.params.supplyId, req.params.taskId, req.tenantId],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Supply line not found' });
    }
    const supply = rows[0];
    await client.query(
      `DELETE FROM task_supplies WHERE id = $1 AND task_id = $2 AND tenant_id = $3`,
      [req.params.supplyId, req.params.taskId, req.tenantId],
    );
    if (supply.flowed_to_task_cost_id) {
      await client.query(
        `DELETE FROM task_costs
         WHERE id = $1 AND task_id = $2 AND tenant_id = $3`,
        [supply.flowed_to_task_cost_id, req.params.taskId, req.tenantId],
      );
    }
    await client.query(
      `INSERT INTO stock_movements (
         tenant_id, task_id, supply_id, supply_name, location_code,
         quantity_delta, unit, reason, created_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'task_supply_removed', $8)`,
      [
        req.tenantId,
        req.params.taskId,
        supply.supply_id,
        supply.supply_name,
        supply.location_code,
        Number(supply.quantity),
        supply.unit,
        req.identity?.userId || null,
      ],
    );
    await client.query('COMMIT');

    void appendActivity(req.params.taskId, req.tenantId, {
      kind: 'updated',
      actorId: req.identity?.userId || 'system',
      detail: `Removed supply: ${supply.supply_name}`,
    });
    res.status(204).end();
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[tasks/supplies] delete error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
