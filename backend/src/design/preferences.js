'use strict';

// Preferences — single row per project. The 16 preference areas
// (palette, lighting, layout, furnishing, etc.) are stored as a single
// JSONB blob since the shape evolves. GET / PUT only (no POST/DELETE).

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapePreferences } = require('./adapters');

const router = express.Router();

// GET /api/design/preferences/:project_id — fetch (returns empty {} if
// the project exists but has never had preferences saved).
router.get('/:project_id', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, req.params.project_id],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const { rows } = await query(
      `SELECT * FROM design_preferences WHERE project_id = $1`,
      [req.params.project_id],
    );
    if (rows.length === 0) {
      return res.json({
        project_id: req.params.project_id,
        preferences: {},
        notes: null,
        updated_at: null,
      });
    }
    res.json(shapePreferences(rows[0]));
  } catch (e) {
    console.error('[design/preferences] get error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/design/preferences/:project_id — upsert.
router.put('/:project_id', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, req.params.project_id],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const body = req.body || {};
    const { rows } = await query(
      `INSERT INTO design_preferences (project_id, preferences, notes)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id) DO UPDATE
       SET preferences = EXCLUDED.preferences, notes = EXCLUDED.notes, updated_at = NOW()
       RETURNING *`,
      [
        req.params.project_id,
        body.preferences != null ? body.preferences : {},
        body.notes || null,
      ],
    );
    res.json(shapePreferences(rows[0]));
  } catch (e) {
    console.error('[design/preferences] put error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
