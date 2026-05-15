'use strict';

// Closeout binder — handover deliverable. One row per project (PK is
// project_id). warranties / maintenance / snags are JSONB arrays;
// status: draft → sent → signed.

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { shapeCloseoutBinder } = require('./adapters');
const { appendActivity } = require('./activities');

const router = express.Router();

router.get('/:project_id', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, req.params.project_id],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const { rows } = await query(
      `SELECT * FROM design_closeout_binders WHERE project_id = $1`,
      [req.params.project_id],
    );
    if (rows.length === 0) {
      return res.json({
        project_id: req.params.project_id,
        status: 'draft',
        warranties: [],
        maintenance: [],
        snags: [],
        sent_at: null,
        sign_off_at: null,
        signed_by: null,
        updated_at: null,
      });
    }
    res.json(shapeCloseoutBinder(rows[0]));
  } catch (e) {
    console.error('[design/closeout_binders] get error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/design/closeout_binders/:project_id — upsert draft.
router.put('/:project_id', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, req.params.project_id],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const body = req.body || {};
    // JSONB fields need explicit ::jsonb casting on the bound parameters —
    // node-postgres binds a plain JS array as a Postgres array literal,
    // tripping "invalid input syntax for type json". Stringify + cast on
    // the VALUES line; EXCLUDED.* references are already typed from there.
    const { rows } = await query(
      `INSERT INTO design_closeout_binders (project_id, warranties, maintenance, snags)
       VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb)
       ON CONFLICT (project_id) DO UPDATE
       SET warranties = EXCLUDED.warranties,
           maintenance = EXCLUDED.maintenance,
           snags = EXCLUDED.snags,
           updated_at = NOW()
       WHERE design_closeout_binders.status <> 'signed'
       RETURNING *`,
      [
        req.params.project_id,
        JSON.stringify(body.warranties || []),
        JSON.stringify(body.maintenance || []),
        JSON.stringify(body.snags || []),
      ],
    );
    if (rows.length === 0) return res.status(409).json({ error: 'Binder is signed; cannot modify' });
    res.json(shapeCloseoutBinder(rows[0]));
  } catch (e) {
    console.error('[design/closeout_binders] put error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:project_id/send', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE design_closeout_binders SET status = 'sent', sent_at = NOW(), updated_at = NOW()
       WHERE project_id = $1 AND status = 'draft' RETURNING *`,
      [req.params.project_id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Draft binder not found' });
    await appendActivity({
      projectId: req.params.project_id,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: 'closeout_binder.sent',
      payload: {},
      visibility: 'portal',
    });
    res.json(shapeCloseoutBinder(rows[0]));
  } catch (e) {
    console.error('[design/closeout_binders] send error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:project_id/sign-off', requireDesignPerm('design:approve'), async (req, res) => {
  try {
    const { signed_by } = req.body || {};
    const { rows } = await query(
      `UPDATE design_closeout_binders SET status = 'signed', sign_off_at = NOW(), signed_by = $2, updated_at = NOW()
       WHERE project_id = $1 AND status = 'sent' RETURNING *`,
      [req.params.project_id, signed_by || req.identity.userId || null],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Sent binder not found' });
    await appendActivity({
      projectId: req.params.project_id,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: 'closeout_binder.signed',
      payload: { signed_by: signed_by || req.identity.userId },
      visibility: 'portal',
    });
    res.json(shapeCloseoutBinder(rows[0]));
  } catch (e) {
    console.error('[design/closeout_binders] sign-off error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
