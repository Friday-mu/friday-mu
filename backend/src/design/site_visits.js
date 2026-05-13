'use strict';

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapeSiteVisit } = require('./adapters');

const router = express.Router();

// Migration 022 added the frontend-aligned metadata fields. visit_date
// stays writable as the canonical DATE; visited_at is the TIMESTAMPTZ
// counterpart. attendees TEXT[] stays for multi-person notes; the
// single-visitor case uses visited_by_user_id.
const WRITABLE_FIELDS = [
  'visit_date',
  'visited_at',
  'visited_by_user_id',
  'walkthrough_video_url',
  'marketing_photo_consent',
  'status',
  'duration_min',
  'attendees',
  'notes',
  'photos_collected',
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
    const { rows } = await query(
      `SELECT * FROM design_site_visits WHERE project_id = $1 ORDER BY visit_date DESC`,
      [projectId],
    );
    res.json({ results: rows.map(shapeSiteVisit) });
  } catch (e) {
    console.error('[design/site_visits] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.project_id) return res.status(400).json({ error: 'project_id is required' });
    // visit_date can be derived from visited_at when only the timestamp
    // is supplied. SiteVisitStage submits visited_at (datetime-local)
    // and lets the backend derive the canonical DATE.
    let visitDate = body.visit_date;
    if (!visitDate && body.visited_at) {
      visitDate = String(body.visited_at).slice(0, 10);
    }
    if (!visitDate) return res.status(400).json({ error: 'visit_date or visited_at is required' });
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, body.project_id],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const { rows } = await query(
      `INSERT INTO design_site_visits (
         project_id, visit_date, visited_at, visited_by_user_id,
         walkthrough_video_url, marketing_photo_consent,
         duration_min, attendees, notes, photos_collected
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        body.project_id,
        visitDate,
        body.visited_at || null,
        body.visited_by_user_id || null,
        body.walkthrough_video_url || null,
        body.marketing_photo_consent != null ? !!body.marketing_photo_consent : null,
        body.duration_min || null,
        Array.isArray(body.attendees) ? body.attendees : [],
        body.notes || null,
        body.photos_collected || 0,
      ],
    );
    res.status(201).json(shapeSiteVisit(rows[0]));
  } catch (e) {
    console.error('[design/site_visits] create error:', e.message);
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
    const sql = `UPDATE design_site_visits sv SET ${sets.join(', ')}
                 FROM design_projects p
                 WHERE p.id = sv.project_id AND p.tenant_id = $1 AND sv.id = $2
                 RETURNING sv.*`;
    const { rows } = await query(sql, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Site visit not found' });
    res.json(shapeSiteVisit(rows[0]));
  } catch (e) {
    console.error('[design/site_visits] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
