'use strict';

// Properties (project locations). A design_property may link to a Guesty
// listing via guesty_listing_id when the same physical property is also
// rental-managed; v0.1 keeps these tables separate so design-side fields
// (sqft, construction_type, year_built) live alongside without touching
// the Guesty schema.

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { shapeProperty } = require('./adapters');

const router = express.Router();

const WRITABLE_FIELDS = [
  'counterparty_id', 'guesty_listing_id', 'name', 'address', 'city',
  'state', 'zipcode', 'sqft', 'construction_type', 'year_built', 'notes',
];

router.get('/', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const filters = ['tenant_id = $1'];
    const params = [req.tenantId];
    let idx = 2;
    if (typeof req.query.counterparty_id === 'string') {
      filters.push(`counterparty_id = $${idx++}`);
      params.push(req.query.counterparty_id);
    }
    const sql = `SELECT * FROM design_properties WHERE ${filters.join(' AND ')} ORDER BY name`;
    const { rows } = await query(sql, params);
    res.json({ results: rows.map(shapeProperty) });
  } catch (e) {
    console.error('[design/properties] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM design_properties WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Property not found' });
    res.json(shapeProperty(rows[0]));
  } catch (e) {
    console.error('[design/properties] detail error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name) return res.status(400).json({ error: 'name is required' });
    const cols = ['tenant_id', 'name'];
    const placeholders = ['$1', '$2'];
    const params = [req.tenantId, body.name];
    let idx = 3;
    for (const field of WRITABLE_FIELDS) {
      if (field === 'name') continue;
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        cols.push(field);
        placeholders.push(`$${idx++}`);
        params.push(body[field]);
      }
    }
    const sql = `INSERT INTO design_properties (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    const { rows } = await query(sql, params);
    res.status(201).json(shapeProperty(rows[0]));
  } catch (e) {
    console.error('[design/properties] create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    const sets = [];
    const params = [req.tenantId, req.params.id];
    let idx = 3;
    for (const field of WRITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        sets.push(`${field} = $${idx++}`);
        params.push(body[field] === '' ? null : body[field]);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No allowed fields to update' });
    sets.push('updated_at = NOW()');
    const sql = `UPDATE design_properties SET ${sets.join(', ')} WHERE tenant_id = $1 AND id = $2 RETURNING *`;
    const { rows } = await query(sql, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Property not found' });
    res.json(shapeProperty(rows[0]));
  } catch (e) {
    console.error('[design/properties] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
