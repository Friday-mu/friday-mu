'use strict';

// Decision log — append-only. Captures material picks, room moves,
// scope exemptions etc. with a free-shape JSONB payload. Decisions are
// not edited in place; correct a wrong decision by appending a new one.

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapeDecision } = require('./adapters');

const router = express.Router();

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
    const decisionKey = typeof req.query.decision_key === 'string' ? req.query.decision_key : null;
    const sql = decisionKey
      ? `SELECT * FROM design_decisions WHERE project_id = $1 AND decision_key = $2 ORDER BY decided_at DESC`
      : `SELECT * FROM design_decisions WHERE project_id = $1 ORDER BY decided_at DESC`;
    const params = decisionKey ? [projectId, decisionKey] : [projectId];
    const { rows } = await query(sql, params);
    res.json({ results: rows.map(shapeDecision) });
  } catch (e) {
    console.error('[design/decisions] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.project_id) return res.status(400).json({ error: 'project_id is required' });
    if (!body.decision_key) return res.status(400).json({ error: 'decision_key is required' });
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, body.project_id],
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const { rows } = await query(
      `INSERT INTO design_decisions (project_id, decision_key, value, decided_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [
        body.project_id,
        body.decision_key,
        body.value != null ? body.value : {},
        req.identity.userId || null,
      ],
    );
    res.status(201).json(shapeDecision(rows[0]));
  } catch (e) {
    console.error('[design/decisions] create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
