'use strict';

// Activity feed — internal audit trail. Append-only. Each entry has a
// visibility flag: 'internal' for staff-only events, 'portal' for events
// also shown on the owner-facing portal Activity tab.
//
// Read paths: GET ?project_id=... defaults to all visibilities; pass
// ?visibility=portal to filter (used by the portal endpoints in
// design-be-5). Append via POST or the in-process appendActivity helper
// that the resource routers (selections / change-orders / etc.) call.

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { shapeActivity } = require('./adapters');

const router = express.Router();

// In-process helper for resource routers (selection.send, pack.approve,
// etc.) that want to log an activity without an HTTP round-trip.
async function appendActivity({ projectId, actorUserId, actorName, action, payload, visibility }) {
  const { rows } = await query(
    `INSERT INTO design_activities (project_id, actor_user_id, actor_name, action, payload, visibility)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      projectId,
      actorUserId || null,
      actorName || null,
      action,
      payload || {},
      visibility || 'internal',
    ],
  );
  return shapeActivity(rows[0]);
}

router.get('/', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const projectId = req.query.project_id;
    if (typeof projectId !== 'string') {
      return res.status(400).json({ error: 'project_id query param is required' });
    }
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, projectId],
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const visibility = typeof req.query.visibility === 'string' ? req.query.visibility : null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    const sql = visibility
      ? `SELECT * FROM design_activities WHERE project_id = $1 AND visibility = $2 ORDER BY created_at DESC LIMIT $3`
      : `SELECT * FROM design_activities WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2`;
    const params = visibility ? [projectId, visibility, limit] : [projectId, limit];
    const { rows } = await query(sql, params);
    res.json({ results: rows.map(shapeActivity) });
  } catch (e) {
    console.error('[design/activities] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.project_id) return res.status(400).json({ error: 'project_id is required' });
    if (!body.action) return res.status(400).json({ error: 'action is required' });
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, body.project_id],
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const activity = await appendActivity({
      projectId: body.project_id,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: body.action,
      payload: body.payload || {},
      visibility: body.visibility === 'portal' ? 'portal' : 'internal',
    });
    res.status(201).json(activity);
  } catch (e) {
    console.error('[design/activities] create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.appendActivity = appendActivity;
