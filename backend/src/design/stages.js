'use strict';

// Per-project stage state. Sparse — only rows that have been touched
// exist. The project's current_stage cursor and stage_status live on
// design_projects; this table tracks per-stage history (entered/completed
// timestamps, owner, notes).
//
// Upsert by composite (project_id, stage_key) since stage_key is the
// natural ID within a project.

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapeStage, shapeProject } = require('./adapters');
const { appendActivity } = require('./activities');

const router = express.Router();

const UPSERT_FIELDS = ['status', 'entered_at', 'completed_at', 'owner_user_id', 'notes'];

// Lock checks per stage_key: when reopening a 'done' stage, the listed
// downstream document statuses block the operation. Designer must rewind
// the document first (or accept the lock).
//
// `idCol` differs because design_agreements + design_closeout_binders are
// single-row-per-project tables keyed by project_id directly (no `id`
// column), while design_moodboards / design_packs / design_change_orders
// have their own `id` PK with multiple rows possible per project.
//
// Keep stage_key values aligned with StageId in
// frontend/src/app/fad/_data/design.ts.
const STAGE_LOCK_CHECKS = {
  agreement:        [{ table: 'design_agreements',       idCol: 'project_id', label: 'agreement',       statuses: ['sent', 'signed'] }],
  signature:        [{ table: 'design_agreements',       idCol: 'project_id', label: 'agreement',       statuses: ['sent', 'signed'] }],
  'payment-gate':   [{ table: 'design_agreements',       idCol: 'project_id', label: 'agreement',       statuses: ['sent', 'signed'] }],
  moodboard:        [{ table: 'design_moodboards',       idCol: 'id',         label: 'moodboard',       statuses: ['approved'] }],
  'design-pack':    [{ table: 'design_packs',            idCol: 'id',         label: 'design pack',     statuses: ['approved'] }],
  'design-review':  [{ table: 'design_packs',            idCol: 'id',         label: 'design pack',     statuses: ['approved'] }],
  execution:        [{ table: 'design_change_orders',    idCol: 'id',         label: 'change order',    statuses: ['approved', 'rejected'] }],
  reconciliation:   [{ table: 'design_closeout_binders', idCol: 'project_id', label: 'closeout binder', statuses: ['signed'] }],
};

// GET /api/design/stages?project_id=... — list stage rows for a project.
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
    const { rows } = await query(
      `SELECT * FROM design_stages WHERE project_id = $1 ORDER BY entered_at NULLS LAST, created_at`,
      [projectId],
    );
    res.json({ results: rows.map(shapeStage) });
  } catch (e) {
    console.error('[design/stages] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/design/stages/:project_id/:stage_key — upsert.
router.put('/:project_id/:stage_key', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { project_id: projectId, stage_key: stageKey } = req.params;
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, projectId],
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const body = req.body || {};
    const cols = ['project_id', 'stage_key'];
    const placeholders = ['$1', '$2'];
    const params = [projectId, stageKey];
    let idx = 3;
    const updateSets = [];
    for (const field of UPSERT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        cols.push(field);
        placeholders.push(`$${idx}`);
        updateSets.push(`${field} = EXCLUDED.${field}`);
        params.push(body[field] === '' ? null : body[field]);
        idx++;
      }
    }
    updateSets.push('updated_at = NOW()');

    const sql = `INSERT INTO design_stages (${cols.join(', ')})
                 VALUES (${placeholders.join(', ')})
                 ON CONFLICT (project_id, stage_key)
                 DO UPDATE SET ${updateSets.join(', ')}
                 RETURNING *`;
    const { rows } = await query(sql, params);
    res.json(shapeStage(rows[0]));
  } catch (e) {
    console.error('[design/stages] upsert error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/design/stages/:project_id/:stage_key/reopen — rewind a done
// stage back to in-progress, unless a downstream document is locked.
//
// On conflict, returns 409 with { error, locked_by: [...] } so the UI can
// surface the blocking artifacts. On success, the project's current_stage
// cursor is realigned if the reopened stage was downstream of it.
router.post('/:project_id/:stage_key/reopen', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { project_id: projectId, stage_key: stageKey } = req.params;

    const ownerCheck = await query(
      `SELECT * FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, projectId],
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const project = ownerCheck.rows[0];

    const stageRes = await query(
      `SELECT * FROM design_stages WHERE project_id = $1 AND stage_key = $2`,
      [projectId, stageKey],
    );
    if (stageRes.rows.length === 0) {
      return res.status(404).json({ error: 'Stage not found' });
    }
    const stage = stageRes.rows[0];
    if (stage.status !== 'done') {
      return res.status(404).json({ error: 'Stage is not in done status; nothing to reopen' });
    }

    // Lock checks for this stage_key. Tables with their own `id` PK
    // (moodboards, packs, change_orders) return that; tables keyed by
    // project_id (agreements, closeout_binders) return the project_id
    // as their identifier so the locked_by entries are still uniquely
    // citable in the UI.
    const checks = STAGE_LOCK_CHECKS[stageKey] || [];
    const lockedBy = [];
    for (const check of checks) {
      const { rows: lockRows } = await query(
        `SELECT ${check.idCol} AS row_id, status FROM ${check.table}
         WHERE project_id = $1 AND status = ANY($2::text[])`,
        [projectId, check.statuses],
      );
      for (const r of lockRows) {
        lockedBy.push({ type: check.label, id: r.row_id, status: r.status });
      }
    }
    if (lockedBy.length > 0) {
      return res.status(409).json({
        error: 'Cannot reopen stage: downstream documents are locked',
        locked_by: lockedBy,
      });
    }

    const previousCompletedAt = stage.completed_at;

    const { rows: updatedRows } = await query(
      `UPDATE design_stages
       SET status = 'in-progress', completed_at = NULL, updated_at = NOW()
       WHERE project_id = $1 AND stage_key = $2
       RETURNING *`,
      [projectId, stageKey],
    );

    // Realign project.current_stage if the reopened stage sits beyond the
    // current cursor. Conservative — only updates when the reopened stage
    // was the latest non-done stage (i.e. equal to or after current_stage).
    // We don't know the canonical stage order on the backend without
    // duplicating the fixture, so we use a simpler rule: if current_stage
    // is downstream (no 'done' rows beyond stage_key), drop cursor back to
    // the reopened stage. Otherwise leave current_stage alone.
    let updatedProject = project;
    const { rows: laterDoneRows } = await query(
      `SELECT 1 FROM design_stages
       WHERE project_id = $1 AND status = 'done' AND stage_key <> $2
       LIMIT 1`,
      [projectId, stageKey],
    );
    if (laterDoneRows.length === 0) {
      // No other done stages — this was the latest non-done. Point cursor here.
      const { rows: projRows } = await query(
        `UPDATE design_projects
         SET current_stage = $3, stage_status = 'in-progress', updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2
         RETURNING *`,
        [DEFAULT_TENANT_ID, projectId, stageKey],
      );
      updatedProject = projRows[0] || project;
    }

    await appendActivity({
      projectId,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: 'stage.reopened',
      payload: { stage_key: stageKey, previous_completed_at: previousCompletedAt },
      visibility: 'internal',
    });

    res.json({ stage: shapeStage(updatedRows[0]), project: shapeProject(updatedProject) });
  } catch (e) {
    console.error('[design/stages] reopen error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
