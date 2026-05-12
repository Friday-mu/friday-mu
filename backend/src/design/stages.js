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
const { DEFAULT_TENANT_ID, shapeStage } = require('./adapters');

const router = express.Router();

const UPSERT_FIELDS = ['status', 'entered_at', 'completed_at', 'owner_user_id', 'notes'];

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

module.exports = router;
