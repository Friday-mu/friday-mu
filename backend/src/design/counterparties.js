'use strict';

// Counterparties (clients) — list / detail / create / update. No archive
// flow in v0.1; the typical lifecycle change is "this counterparty owns
// a now-cancelled project", which is reflected on the project, not here.

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { shapeCounterparty } = require('./adapters');

const router = express.Router();

const WRITABLE_FIELDS = ['name', 'email', 'phone', 'notes'];

router.get('/', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM design_counterparties WHERE tenant_id = $1 ORDER BY name`,
      [req.tenantId],
    );
    res.json({ results: rows.map(shapeCounterparty) });
  } catch (e) {
    console.error('[design/counterparties] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM design_counterparties WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Counterparty not found' });
    res.json(shapeCounterparty(rows[0]));
  } catch (e) {
    console.error('[design/counterparties] detail error:', e.message);
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
    const sql = `INSERT INTO design_counterparties (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    const { rows } = await query(sql, params);
    res.status(201).json(shapeCounterparty(rows[0]));
  } catch (e) {
    console.error('[design/counterparties] create error:', e.message);
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
    const sql = `UPDATE design_counterparties SET ${sets.join(', ')} WHERE tenant_id = $1 AND id = $2 RETURNING *`;
    const { rows } = await query(sql, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Counterparty not found' });
    res.json(shapeCounterparty(rows[0]));
  } catch (e) {
    console.error('[design/counterparties] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
