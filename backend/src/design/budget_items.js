'use strict';

// Budget items — line-item procurement detail. The sensitive triple
// (retail_cost_minor / negotiated_cost_minor / internal_work) is gated
// behind design:read_sensitive per B3.1 — owner-portal reads always
// strip these.

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm, hasPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapeBudgetItem } = require('./adapters');

const router = express.Router();

const WRITABLE_FIELDS = [
  'stage_key', 'category_code', 'description', 'unit_cost_minor', 'quantity',
  'retail_cost_minor', 'negotiated_cost_minor', 'internal_work', 'vendor_id', 'notes',
  // design-be-24: realised cash-out amount. Populated by the expense-capture
  // stage; consumed by the reconciliation matcher.
  'actual_paid_minor',
];

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
    const filters = ['project_id = $1'];
    const params = [projectId];
    let idx = 2;
    if (typeof req.query.category_code === 'string') {
      filters.push(`category_code = $${idx++}`);
      params.push(req.query.category_code);
    }
    if (typeof req.query.vendor_id === 'string') {
      filters.push(`vendor_id = $${idx++}`);
      params.push(req.query.vendor_id);
    }
    const sql = `SELECT * FROM design_budget_items WHERE ${filters.join(' AND ')} ORDER BY category_code, description`;
    const { rows } = await query(sql, params);
    const canSeeSensitive = hasPerm(req.identity.userRole, 'design:read_sensitive');
    res.json({ results: rows.map((r) => shapeBudgetItem(r, canSeeSensitive)) });
  } catch (e) {
    console.error('[design/budget_items] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT b.* FROM design_budget_items b
       JOIN design_projects p ON p.id = b.project_id
       WHERE p.tenant_id = $1 AND b.id = $2`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Budget item not found' });
    const canSeeSensitive = hasPerm(req.identity.userRole, 'design:read_sensitive');
    res.json(shapeBudgetItem(rows[0], canSeeSensitive));
  } catch (e) {
    console.error('[design/budget_items] detail error:', e.message);
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
    const sql = `INSERT INTO design_budget_items (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    const { rows } = await query(sql, params);
    res.status(201).json(shapeBudgetItem(rows[0], true));
  } catch (e) {
    console.error('[design/budget_items] create error:', e.message);
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
    const sql = `UPDATE design_budget_items b SET ${sets.join(', ')}
                 FROM design_projects p
                 WHERE p.id = b.project_id AND p.tenant_id = $1 AND b.id = $2
                 RETURNING b.*`;
    const { rows } = await query(sql, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Budget item not found' });
    res.json(shapeBudgetItem(rows[0], true));
  } catch (e) {
    console.error('[design/budget_items] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { rows } = await query(
      `DELETE FROM design_budget_items b USING design_projects p
       WHERE p.id = b.project_id AND p.tenant_id = $1 AND b.id = $2
       RETURNING b.id`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Budget item not found' });
    res.status(204).end();
  } catch (e) {
    console.error('[design/budget_items] delete error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
