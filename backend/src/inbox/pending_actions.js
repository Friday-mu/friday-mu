'use strict';

const express = require('express');
const { pool, query } = require('../database/client');
const { attachIdentity } = require('../design/auth');

const router = express.Router();

const VALID_STATUSES = new Set([
  'pending',
  'completed',
  'dismissed',
  'auto_dismissed',
  'auto_converted',
]);

function actorName(req) {
  return req.identity?.displayName
    || req.identity?.username
    || req.identity?.userId
    || 'fad-user';
}

function mapUrgencyToPriority(urgency) {
  switch (String(urgency || '').toLowerCase()) {
    case 'critical':
    case 'urgent':
      return 'urgent';
    case 'high':
      return 'high';
    case 'low':
      return 'low';
    default:
      return 'medium';
  }
}

function dueParts(dueBy) {
  if (!dueBy) return { dueDate: null, dueTime: null };
  const d = new Date(dueBy);
  if (Number.isNaN(d.getTime())) return { dueDate: null, dueTime: null };
  return {
    dueDate: d.toISOString().slice(0, 10),
    dueTime: d.toISOString().slice(11, 16),
  };
}

function buildTaskTitle(actionText) {
  const cleaned = String(actionText || '').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 90) return cleaned;
  return cleaned.slice(0, 87).trimEnd() + '...';
}

function buildTaskDescription(action) {
  const lines = [
    'Created from an Inbox AI pending action.',
    '',
    `Original action: ${action.action_text}`,
  ];
  if (action.guest_name) lines.push(`Guest: ${action.guest_name}`);
  if (action.conversation_id) lines.push(`Conversation: ${action.conversation_id}`);
  if (action.category) lines.push(`Category: ${action.category}`);
  if (action.owner) lines.push(`Suggested owner: ${action.owner}`);
  if (action.completion_note) lines.push(`Prior note: ${action.completion_note}`);
  return lines.join('\n');
}

function shapePendingAction(row) {
  if (!row) return null;
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    guest_name: row.guest_name,
    property_code: row.property_code,
    action_text: row.action_text,
    status: row.status,
    detected_at: row.detected_at,
    due_by: row.due_by,
    urgency: row.urgency,
    owner: row.owner,
    category: row.category,
    source: row.source,
    fad_task_id: row.fad_task_id,
    conversation: row.conversation_guest_name || row.conversation_channel
      ? {
          guest_name: row.conversation_guest_name,
          channel: row.conversation_channel,
          status: row.conversation_status,
          last_message_at: row.conversation_last_message_at,
        }
      : null,
  };
}

function shapeTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    category: row.category,
    source: row.source,
    property_code: row.property_code,
    reservation_guesty_id: row.reservation_guesty_id,
    inbox_thread_id: row.inbox_thread_id,
    due_date: row.due_date,
    due_time: row.due_time,
    tags: row.tags || [],
    external_ref: row.external_ref,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function convertPendingActionToTask({
  pendingActionId,
  tenantId,
  actor = 'inbox_ai',
  overrides = {},
} = {}) {
  if (!pendingActionId) throw new Error('pendingActionId is required');
  if (!tenantId) throw new Error('tenantId is required');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT pa.*, c.guest_name AS conversation_guest_name
         FROM pending_actions pa
         LEFT JOIN conversations c ON c.id = pa.conversation_id
        WHERE pa.id = $1 AND pa.tenant_id = $2
        FOR UPDATE OF pa`,
      [pendingActionId, tenantId],
    );
    const action = rows[0];
    if (!action) {
      const err = new Error('Pending action not found');
      err.statusCode = 404;
      throw err;
    }

    if (action.fad_task_id) {
      const taskRows = await client.query(
        `SELECT * FROM tasks WHERE id = $1 AND tenant_id = $2`,
        [action.fad_task_id, tenantId],
      );
      if (taskRows.rows[0]) {
        await client.query('COMMIT');
        return {
          task: shapeTask(taskRows.rows[0]),
          pending_action: shapePendingAction(action),
          already_converted: true,
          created: false,
        };
      }
    }

    const externalRef = `pending_action:${action.id}`;
    const existingTask = await client.query(
      `SELECT * FROM tasks WHERE tenant_id = $1 AND external_ref = $2 LIMIT 1`,
      [tenantId, externalRef],
    );
    let task = existingTask.rows[0];
    if (!task) {
      const { dueDate, dueTime } = dueParts(action.due_by);
      const title = buildTaskTitle(overrides.title || action.action_text);
      const description = typeof overrides.description === 'string' && overrides.description.trim()
        ? overrides.description.trim()
        : buildTaskDescription(action);
      const priority = overrides.priority || mapUrgencyToPriority(action.urgency);
      const status = overrides.status === 'todo' ? 'todo' : 'reported';
      const insert = await client.query(
        `INSERT INTO tasks (
           tenant_id, title, description, status, priority, category, source,
           visibility, department, subdepartment, property_code,
           inbox_thread_id, due_date, due_time, awaiting_human_approval,
           tags, external_ref, created_by_user_id
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, 'inbox_ai',
           'team', 'office', 'guest_services', $7,
           $8, $9, $10, TRUE,
           $11, $12, $13
         )
         RETURNING *`,
        [
          tenantId,
          title,
          description,
          status,
          priority,
          action.category || 'guest_communication',
          action.property_code || null,
          String(action.conversation_id),
          dueDate,
          dueTime,
          ['inbox-ai', 'pending-action'],
          externalRef,
          overrides.createdByUserId || null,
        ],
      );
      task = insert.rows[0];
    }

    const updated = await client.query(
      `UPDATE pending_actions
          SET fad_task_id = $1,
              status = CASE WHEN status = 'pending' THEN 'auto_converted' ELSE status END,
              completed_at = COALESCE(completed_at, NOW()),
              completed_by = COALESCE(completed_by, $2),
              completion_note = COALESCE(completion_note, $3)
        WHERE id = $4 AND tenant_id = $5
        RETURNING *`,
      [
        task.id,
        actor,
        `Converted to FAD task ${task.id}`,
        action.id,
        tenantId,
      ],
    );

    await client.query('COMMIT');
    return {
      task: shapeTask(task),
      pending_action: shapePendingAction(updated.rows[0]),
      already_converted: !!existingTask.rows[0],
      created: !existingTask.rows[0],
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

router.get('/', attachIdentity, async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
    if (status !== 'all' && !VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: 'invalid status' });
    }
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;
    const params = [req.tenantId];
    const filters = ['pa.tenant_id = $1'];
    if (status !== 'all') {
      params.push(status);
      filters.push(`pa.status = $${params.length}`);
    }
    const { rows } = await query(
      `SELECT pa.*,
              c.guest_name AS conversation_guest_name,
              c.channel AS conversation_channel,
              c.status AS conversation_status,
              c.last_message_at AS conversation_last_message_at
         FROM pending_actions pa
         LEFT JOIN conversations c ON c.id = pa.conversation_id
        WHERE ${filters.join(' AND ')}
        ORDER BY pa.due_by ASC NULLS LAST, pa.detected_at DESC
        LIMIT ${limit}`,
      params,
    );
    res.json({ pending_actions: rows.map(shapePendingAction) });
  } catch (e) {
    console.error('[pending-actions] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/convert-to-task', attachIdentity, async (req, res) => {
  try {
    const result = await convertPendingActionToTask({
      pendingActionId: req.params.id,
      tenantId: req.tenantId,
      actor: actorName(req),
      overrides: {
        title: req.body?.title,
        description: req.body?.description,
        priority: req.body?.priority,
        status: req.body?.status,
        createdByUserId: req.identity?.userId || null,
      },
    });
    res.status(result.created ? 201 : 200).json(result);
  } catch (e) {
    console.error('[pending-actions] convert error:', e.message);
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.convertPendingActionToTask = convertPendingActionToTask;

module.exports._test = {
  mapUrgencyToPriority,
  dueParts,
  buildTaskTitle,
  buildTaskDescription,
};
