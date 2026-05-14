'use strict';

// Rooms — spatial units within a design_property. Filterable by
// property_id. Used by site visits + photos to anchor spatial context.

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapeRoom } = require('./adapters');

const router = express.Router();

const WRITABLE_FIELDS = [
  'name', 'sqft', 'usage_kind',
  // Migration 031 — Site Visit detail fields. Number columns accept
  // null or numeric; PG coerces from JS numbers automatically.
  'length_m', 'width_m', 'height_m', 'windows', 'doors',
  'condition_notes', 'issues',
  'keep_furniture', 'remove_furniture',
  'design_opportunity', 'access_notes', 'utilities_notes',
];

router.get('/', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const propertyId = req.query.property_id;
    if (typeof propertyId !== 'string') {
      return res.status(400).json({ error: 'property_id query param is required' });
    }
    const ownerCheck = await query(
      `SELECT 1 FROM design_properties WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, propertyId],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Property not found' });
    const { rows } = await query(
      `SELECT * FROM design_rooms WHERE property_id = $1 ORDER BY name`,
      [propertyId],
    );
    res.json({ results: rows.map(shapeRoom) });
  } catch (e) {
    console.error('[design/rooms] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.property_id) return res.status(400).json({ error: 'property_id is required' });
    if (!body.name) return res.status(400).json({ error: 'name is required' });
    const ownerCheck = await query(
      `SELECT 1 FROM design_properties WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, body.property_id],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Property not found' });
    const { rows } = await query(
      `INSERT INTO design_rooms (property_id, name, sqft, usage_kind)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [body.property_id, body.name, body.sqft || null, body.usage_kind || null],
    );
    res.status(201).json(shapeRoom(rows[0]));
  } catch (e) {
    console.error('[design/rooms] create error:', e.message);
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
    const sql = `UPDATE design_rooms r SET ${sets.join(', ')}
                 FROM design_properties p
                 WHERE p.id = r.property_id AND p.tenant_id = $1 AND r.id = $2
                 RETURNING r.*`;
    const { rows } = await query(sql, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Room not found' });
    res.json(shapeRoom(rows[0]));
  } catch (e) {
    console.error('[design/rooms] patch error:', e.message);
    // 22003 = numeric_value_out_of_range — value exceeds the column's
    // NUMERIC(p,s) capacity. Frontend already clamps per-field, but
    // keep this here as a defence in depth so a direct API caller
    // (curl / Postman / scripts) gets a clear 400 instead of a generic
    // 500. 22P02 = invalid_text_representation (NaN/non-numeric).
    if (e && (e.code === '22003' || e.code === '22P02')) {
      return res.status(400).json({
        error: 'A numeric field is out of range. Dimensions must be in metres (max ~200); counts must fit in a small integer.',
      });
    }
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { rows } = await query(
      `DELETE FROM design_rooms r USING design_properties p
       WHERE p.id = r.property_id AND p.tenant_id = $1 AND r.id = $2
       RETURNING r.id`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Room not found' });
    res.status(204).end();
  } catch (e) {
    console.error('[design/rooms] delete error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
