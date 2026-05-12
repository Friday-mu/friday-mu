'use strict';

// Vendors (suppliers). Cross-project — a vendor appears across many
// budget items / change orders. The frontend's vendor performance view
// rolls up budget_items + change_orders by vendor_id.

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapeVendor } = require('./adapters');

const router = express.Router();

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

module.exports = router;
