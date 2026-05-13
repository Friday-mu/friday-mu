'use strict';

// Rough budgets — pre-design cost estimates, line-item granularity.
// catalog_source_id points back to a prior budget row when this line was
// pulled from the cross-project catalog (where-used lookups).

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapeRoughBudget } = require('./adapters');

const router = express.Router();

// Migration 023 added version_id so individual line items belong to a
// rough-budget version. POST may include it directly; PATCH allows
// re-parenting an orphaned row.
const WRITABLE_FIELDS = ['category_code', 'description', 'unit_cost_minor', 'quantity', 'notes', 'catalog_source_id', 'version_id'];

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
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const { rows } = await query(
      `SELECT * FROM design_rough_budgets WHERE project_id = $1 ORDER BY category_code, description`,
      [projectId],
    );
    res.json({ results: rows.map(shapeRoughBudget) });
  } catch (e) {
    console.error('[design/rough_budgets] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/design/rough_budgets/where-used/:catalog_source_id — list rows
// from across projects that point back at the given catalog source.
router.get('/where-used/:catalog_source_id', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT rb.*, p.name AS project_name, p.id AS pid
       FROM design_rough_budgets rb
       JOIN design_projects p ON p.id = rb.project_id
       WHERE p.tenant_id = $1 AND rb.catalog_source_id = $2
       ORDER BY rb.created_at DESC`,
      [DEFAULT_TENANT_ID, req.params.catalog_source_id],
    );
    res.json({
      results: rows.map((r) => ({
        ...shapeRoughBudget(r),
        project_name: r.project_name,
      })),
    });
  } catch (e) {
    console.error('[design/rough_budgets] where-used error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.project_id) return res.status(400).json({ error: 'project_id is required' });
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, body.project_id],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const cols = ['project_id'];
    const placeholders = ['$1'];
    const params = [body.project_id];
    let idx = 2;
    for (const field of WRITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        cols.push(field);
        placeholders.push(`$${idx++}`);
        params.push(body[field]);
      }
    }
    const sql = `INSERT INTO design_rough_budgets (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    const { rows } = await query(sql, params);
    res.status(201).json(shapeRoughBudget(rows[0]));
  } catch (e) {
    console.error('[design/rough_budgets] create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

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
    const sql = `UPDATE design_rough_budgets rb SET ${sets.join(', ')}
                 FROM design_projects p
                 WHERE p.id = rb.project_id AND p.tenant_id = $1 AND rb.id = $2
                 RETURNING rb.*`;
    const { rows } = await query(sql, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Rough budget row not found' });
    res.json(shapeRoughBudget(rows[0]));
  } catch (e) {
    console.error('[design/rough_budgets] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { rows } = await query(
      `DELETE FROM design_rough_budgets rb USING design_projects p
       WHERE p.id = rb.project_id AND p.tenant_id = $1 AND rb.id = $2
       RETURNING rb.id`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Rough budget row not found' });
    res.status(204).end();
  } catch (e) {
    console.error('[design/rough_budgets] delete error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
