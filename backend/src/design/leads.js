'use strict';

// Leads CRUD + convert-to-project. Leads are CRM-lite records that may
// progress to a full design_project. Conversion is atomic: a project is
// created from the lead payload, and the lead row is marked
// status='converted' with converted_project_id set.

const express = require('express');
const { query, pool } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapeLead, shapeProject } = require('./adapters');

const router = express.Router();

const WRITABLE_FIELDS = ['name', 'email', 'phone', 'source', 'status', 'owner_user_id', 'staleness_days', 'notes'];

router.get('/', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const filters = ['tenant_id = $1'];
    const params = [DEFAULT_TENANT_ID];
    let idx = 2;
    if (typeof req.query.status === 'string') {
      filters.push(`status = $${idx++}`);
      params.push(req.query.status);
    }
    const sql = `SELECT * FROM design_leads WHERE ${filters.join(' AND ')} ORDER BY created_at DESC`;
    const { rows } = await query(sql, params);
    res.json({ results: rows.map(shapeLead) });
  } catch (e) {
    console.error('[design/leads] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM design_leads WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Lead not found' });
    res.json(shapeLead(rows[0]));
  } catch (e) {
    console.error('[design/leads] detail error:', e.message);
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
    const sql = `INSERT INTO design_leads (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    const { rows } = await query(sql, params);
    res.status(201).json(shapeLead(rows[0]));
  } catch (e) {
    console.error('[design/leads] create error:', e.message);
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
    const sql = `UPDATE design_leads SET ${sets.join(', ')} WHERE tenant_id = $1 AND id = $2 RETURNING *`;
    const { rows } = await query(sql, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Lead not found' });
    res.json(shapeLead(rows[0]));
  } catch (e) {
    console.error('[design/leads] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/design/leads/:id/convert — atomically create a project from
// the lead and mark the lead converted. Body may include extra project
// fields (slug is required if the auto-derived one collides).
router.post('/:id/convert', requireDesignPerm('design:write'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const leadRes = await client.query(
      `SELECT * FROM design_leads WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (leadRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Lead not found' });
    }
    const lead = leadRes.rows[0];
    if (lead.status === 'converted' && lead.converted_project_id) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Lead already converted', project_id: lead.converted_project_id });
    }

    const body = req.body || {};
    const projectName = body.name || lead.name;
    const projectSlug = body.slug || lead.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!projectSlug) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'slug could not be derived; pass slug in body' });
    }

    const projRes = await client.query(
      `INSERT INTO design_projects (tenant_id, name, slug, lead_source)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [DEFAULT_TENANT_ID, projectName, projectSlug, lead.source || null],
    );

    const updatedLeadRes = await client.query(
      `UPDATE design_leads
       SET status = 'converted',
           converted_project_id = $3,
           updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 RETURNING *`,
      [DEFAULT_TENANT_ID, req.params.id, projRes.rows[0].id],
    );

    await client.query('COMMIT');
    res.status(201).json({
      lead: shapeLead(updatedLeadRes.rows[0]),
      project: shapeProject(projRes.rows[0]),
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[design/leads] convert error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
