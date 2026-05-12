'use strict';

// Projects CRUD + lifecycle controls (pause / resume / cancel).
//
// All routes require design:read or design:write per the matrix in
// auth.js. Lifecycle status (active/paused/cancelled) is orthogonal to
// the 17-stage workflow — both are tracked on design_projects.

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapeProject, shapeAsset } = require('./adapters');

// Mirror of the same constant in ai_images.js — strip the kind marker
// from the generator_prompt before handing the asset row back. Kept
// locally so projects.js doesn't need to import from a sibling router.
const KIND_PREFIX_RE = /^\[kind:([a-z_]+)\]\s+/;
function shapeSitePlanAsset(row) {
  const base = shapeAsset(row);
  if (!base) return null;
  const m = base.generator_prompt?.match(KIND_PREFIX_RE);
  if (m) {
    base.kind = m[1];
    base.generator_prompt = base.generator_prompt.slice(m[0].length);
  } else {
    base.kind = null;
  }
  return base;
}

const router = express.Router();

const WRITABLE_FIELDS = [
  'name', 'slug', 'counterparty_id', 'property_id', 'classification', 'tier',
  'lead_source', 'epc_minor', 'design_fee_minor', 'procurement_fee_minor',
  'budget_expectation_minor', 'goals', 'outcomes', 'urgency', 'pm_link',
  'design_lead_user_id', 'current_stage', 'stage_status', 'blocker',
  'next_action', 'start_date', 'estimated_completion',
];

// GET /api/design/projects — list with optional lifecycle / stage filters.
router.get('/', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const filters = [`tenant_id = $1`];
    const params = [DEFAULT_TENANT_ID];
    let idx = 2;
    if (typeof req.query.lifecycle_status === 'string') {
      filters.push(`lifecycle_status = $${idx++}`);
      params.push(req.query.lifecycle_status);
    }
    if (typeof req.query.current_stage === 'string') {
      filters.push(`current_stage = $${idx++}`);
      params.push(req.query.current_stage);
    }
    if (typeof req.query.counterparty_id === 'string') {
      filters.push(`counterparty_id = $${idx++}`);
      params.push(req.query.counterparty_id);
    }
    const sql = `SELECT * FROM design_projects WHERE ${filters.join(' AND ')} ORDER BY created_at DESC`;
    const { rows } = await query(sql, params);
    res.json({ results: rows.map(shapeProject) });
  } catch (e) {
    console.error('[design/projects] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/design/projects/by-slug/:slug — slug lookup for owner portal routing.
router.get('/by-slug/:slug', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM design_projects WHERE tenant_id = $1 AND slug = $2`,
      [DEFAULT_TENANT_ID, req.params.slug],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json(shapeProject(rows[0]));
  } catch (e) {
    console.error('[design/projects] by-slug error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/design/projects/:id — detail.
router.get('/:id', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json(shapeProject(rows[0]));
  } catch (e) {
    console.error('[design/projects] detail error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/design/projects/:id/site-plan — resolve the current site plan
// asset row via the design_projects.site_plan_image_id FK (set by the
// site-plan generator on POST /api/design/ai_images/generate-site-plan
// when called with set_as_project_plan: true). Returns 404 if either the
// project doesn't exist or no site plan is pinned. The asset row shape
// matches what /api/design/ai_images/:sha256 returns, with an extra
// `kind: 'site_plan'` tag for clarity.
router.get('/:id/site-plan', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT a.*
         FROM design_projects p
         JOIN design_assets a
           ON a.sha256 = p.site_plan_image_id
        WHERE p.tenant_id = $1 AND p.id = $2`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'No site plan set for this project' });
    res.json(shapeSitePlanAsset(rows[0]));
  } catch (e) {
    console.error('[design/projects] site-plan error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/design/projects — create.
router.post('/', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name || !body.slug) {
      return res.status(400).json({ error: 'name and slug are required' });
    }
    const cols = ['tenant_id', 'name', 'slug'];
    const placeholders = ['$1', '$2', '$3'];
    const params = [DEFAULT_TENANT_ID, body.name, body.slug];
    let idx = 4;
    for (const field of WRITABLE_FIELDS) {
      if (field === 'name' || field === 'slug') continue;
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        cols.push(field);
        placeholders.push(`$${idx++}`);
        params.push(body[field]);
      }
    }
    const sql = `INSERT INTO design_projects (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    const { rows } = await query(sql, params);
    res.status(201).json(shapeProject(rows[0]));
  } catch (e) {
    console.error('[design/projects] create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/design/projects/:id — partial update.
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
    const sql = `UPDATE design_projects SET ${sets.join(', ')} WHERE tenant_id = $1 AND id = $2 RETURNING *`;
    const { rows } = await query(sql, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json(shapeProject(rows[0]));
  } catch (e) {
    console.error('[design/projects] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/design/projects/:id/pause — set lifecycle_status='paused'.
router.post('/:id/pause', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { reason } = req.body || {};
    const { rows } = await query(
      `UPDATE design_projects
       SET lifecycle_status = 'paused',
           paused_at = NOW(),
           paused_reason = $3,
           paused_by_user_id = $4,
           updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND lifecycle_status = 'active'
       RETURNING *`,
      [DEFAULT_TENANT_ID, req.params.id, reason || null, req.identity.userId || null],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Active project not found' });
    }
    res.json(shapeProject(rows[0]));
  } catch (e) {
    console.error('[design/projects] pause error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/design/projects/:id/resume — back to active.
router.post('/:id/resume', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE design_projects
       SET lifecycle_status = 'active',
           paused_at = NULL,
           paused_reason = NULL,
           paused_by_user_id = NULL,
           updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND lifecycle_status = 'paused'
       RETURNING *`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Paused project not found' });
    }
    res.json(shapeProject(rows[0]));
  } catch (e) {
    console.error('[design/projects] resume error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/design/projects/:id/cancel — terminal. Optionally transfer
// procured items to Friday inventory.
router.post('/:id/cancel', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { reason, transfer_to_inventory } = req.body || {};
    const { rows } = await query(
      `UPDATE design_projects
       SET lifecycle_status = 'cancelled',
           cancelled_at = NOW(),
           cancelled_reason = $3,
           cancelled_by_user_id = $4,
           cancel_transfer_to_inventory = $5,
           updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND lifecycle_status <> 'cancelled'
       RETURNING *`,
      [
        DEFAULT_TENANT_ID,
        req.params.id,
        reason || null,
        req.identity.userId || null,
        transfer_to_inventory === true,
      ],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Project not found or already cancelled' });
    }
    res.json(shapeProject(rows[0]));
  } catch (e) {
    console.error('[design/projects] cancel error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
