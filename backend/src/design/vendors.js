'use strict';

// Vendors (suppliers). Cross-project — a vendor appears across many
// budget items / change orders. The frontend's vendor performance view
// rolls up budget_items + change_orders by vendor_id.

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapeVendor } = require('./adapters');

const router = express.Router();

// Per-tenant guard. Vendors don't have a state machine like
// selections / change_orders / site_visits, so "draft-only" is
// approximated as "no downstream references." Currently the only FK
// is design_budget_items.vendor_id (selections.options.vendor_id
// lives in JSONB and is not enforced as FK; we don't scan it for v1).
async function vendorHasReferences(vendorId) {
  const { rows } = await query(
    `SELECT 1 FROM design_budget_items WHERE vendor_id = $1 LIMIT 1`,
    [vendorId],
  );
  return rows.length > 0;
}

const WRITABLE_FIELDS = ['name', 'category', 'email', 'phone', 'notes'];

router.get('/', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const filters = ['tenant_id = $1'];
    const params = [DEFAULT_TENANT_ID];
    let idx = 2;
    if (typeof req.query.category === 'string') {
      filters.push(`category = $${idx++}`);
      params.push(req.query.category);
    }
    const sql = `SELECT * FROM design_vendors WHERE ${filters.join(' AND ')} ORDER BY name`;
    const { rows } = await query(sql, params);
    res.json({ results: rows.map(shapeVendor) });
  } catch (e) {
    console.error('[design/vendors] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM design_vendors WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Vendor not found' });
    res.json(shapeVendor(rows[0]));
  } catch (e) {
    console.error('[design/vendors] detail error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name) return res.status(400).json({ error: 'name is required' });
    const cols = ['tenant_id', 'name'];
    const placeholders = ['$1', '$2'];
    const params = [DEFAULT_TENANT_ID, body.name];
    let idx = 3;
    for (const field of WRITABLE_FIELDS) {
      if (field === 'name') continue;
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        cols.push(field);
        placeholders.push(`$${idx++}`);
        params.push(body[field]);
      }
    }
    const sql = `INSERT INTO design_vendors (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    const { rows } = await query(sql, params);
    res.status(201).json(shapeVendor(rows[0]));
  } catch (e) {
    console.error('[design/vendors] create error:', e.message);
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
    const sql = `UPDATE design_vendors SET ${sets.join(', ')} WHERE tenant_id = $1 AND id = $2 RETURNING *`;
    const { rows } = await query(sql, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Vendor not found' });
    res.json(shapeVendor(rows[0]));
  } catch (e) {
    console.error('[design/vendors] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// DELETE — only when zero downstream budget_items reference this
// vendor. Returns 409 with a reference-count hint if there are any,
// so the UI can suggest "reassign before deleting." On success: 204.
//
// We don't soft-delete vendors here. The expected workflow is: spot
// a duplicate / mistaken vendor row, fix any references, then prune.
// Soft delete is the right answer once vendor performance history
// matters; this v0 keeps the table small.
router.delete('/:id', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { rows: existing } = await query(
      `SELECT id, name FROM design_vendors WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (existing.length === 0) return res.status(404).json({ error: 'Vendor not found' });
    if (await vendorHasReferences(req.params.id)) {
      const { rows: countRows } = await query(
        `SELECT COUNT(*)::int AS n FROM design_budget_items WHERE vendor_id = $1`,
        [req.params.id],
      );
      return res.status(409).json({
        error: `Vendor "${existing[0].name}" is referenced by ${countRows[0].n} budget item(s). Reassign or delete those first.`,
        references: { budget_items: countRows[0].n },
      });
    }
    await query(`DELETE FROM design_vendors WHERE id = $1`, [req.params.id]);
    res.status(204).end();
  } catch (e) {
    console.error('[design/vendors] delete error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
