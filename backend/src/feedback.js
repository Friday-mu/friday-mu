'use strict';

// Feedback inbox — bug reports, feature requests, and suggestions.
// Mounted at /api/feedback (FAD-wide; not design-scoped). Previously
// the BugReport modal in the frontend just discarded submissions —
// this is the wire that makes them persist.
//
// POST /api/feedback   — any authenticated user
// GET  /api/feedback   — admin/director only (triage inbox)

const express = require('express');
const { query } = require('./database/client');
const { attachIdentity } = require('./design/auth');

const router = express.Router();

const TYPES = new Set(['bug', 'feature', 'suggestion']);
const SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const STATUSES = new Set(['new', 'triaged', 'in_progress', 'resolved', 'wontfix', 'duplicate']);

// 5MB cap on the base64 data URL keeps DB rows bounded. A 0.5-scale
// 0.7-quality JPEG (what html2canvas produces in the frontend) lands
// at ~200-600KB for full-page captures, so 5MB is generous.
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

router.post('/', attachIdentity, async (req, res) => {
  try {
    const {
      type,
      title,
      description,
      severity,
      route_url: routeUrl,
      module_label: moduleLabel,
      screenshot_data_url: screenshotDataUrl,
    } = req.body || {};

    if (!TYPES.has(type)) {
      return res.status(400).json({ error: 'type must be bug, feature, or suggestion' });
    }
    if (typeof description !== 'string' || description.trim().length === 0) {
      return res.status(400).json({ error: 'description is required' });
    }
    if (severity != null && !SEVERITIES.has(severity)) {
      return res.status(400).json({ error: 'severity must be low|medium|high|critical' });
    }

    let screenshot = null;
    if (typeof screenshotDataUrl === 'string' && screenshotDataUrl.length > 0) {
      if (!screenshotDataUrl.startsWith('data:image/')) {
        return res.status(400).json({ error: 'screenshot must be a data:image/... URL' });
      }
      if (screenshotDataUrl.length > MAX_SCREENSHOT_BYTES) {
        return res.status(413).json({ error: 'screenshot too large (>5MB)' });
      }
      screenshot = screenshotDataUrl;
    }

    const { rows } = await query(
      `INSERT INTO feedback (
         type, title, description, severity, route_url, module_label,
         screenshot_data_url, user_id, user_username, user_display_name
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, type, title, description, severity, route_url, module_label,
                 status, created_at`,
      [
        type,
        (title || '').toString().trim() || null,
        description.trim(),
        severity || null,
        (routeUrl || '').toString().slice(0, 500) || null,
        (moduleLabel || '').toString().slice(0, 100) || null,
        screenshot,
        req.identity.userId,
        req.identity.username,
        req.identity.displayName,
      ],
    );

    res.json(rows[0]);
  } catch (err) {
    console.error('[feedback] POST error:', err.message);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

router.get('/', attachIdentity, async (req, res) => {
  if (req.identity.userRole !== 'admin' && req.identity.userRole !== 'director') {
    return res.status(403).json({ error: 'Forbidden — admin/director only' });
  }
  try {
    const filters = [];
    const params = [];
    if (req.query.type && TYPES.has(req.query.type)) {
      params.push(req.query.type);
      filters.push(`type = $${params.length}`);
    }
    if (req.query.status && STATUSES.has(req.query.status)) {
      params.push(req.query.status);
      filters.push(`status = $${params.length}`);
    }
    const sql = `
      SELECT id, type, title, description, severity, route_url, module_label,
             user_username, user_display_name, status, resolution_note,
             resolved_at, created_at, updated_at
      FROM feedback
      ${filters.length ? 'WHERE ' + filters.join(' AND ') : ''}
      ORDER BY created_at DESC
      LIMIT 200
    `;
    const { rows } = await query(sql, params);
    res.json({ results: rows });
  } catch (err) {
    console.error('[feedback] GET error:', err.message);
    res.status(500).json({ error: 'Failed to list feedback' });
  }
});

// PATCH /api/feedback/:id — admin/director only. Used by the future
// Settings → Feedback inbox to triage status + add resolution notes.
router.patch('/:id', attachIdentity, async (req, res) => {
  if (req.identity.userRole !== 'admin' && req.identity.userRole !== 'director') {
    return res.status(403).json({ error: 'Forbidden — admin/director only' });
  }
  try {
    const { status, resolution_note: resolutionNote } = req.body || {};
    if (status != null && !STATUSES.has(status)) {
      return res.status(400).json({ error: 'invalid status' });
    }
    const sets = [];
    const params = [];
    if (status != null) {
      params.push(status);
      sets.push(`status = $${params.length}`);
      if (status === 'resolved' || status === 'wontfix' || status === 'duplicate') {
        sets.push(`resolved_at = NOW()`);
        params.push(req.identity.userId);
        sets.push(`resolved_by = $${params.length}`);
      }
    }
    if (resolutionNote != null) {
      params.push(resolutionNote.toString().trim() || null);
      sets.push(`resolution_note = $${params.length}`);
    }
    if (sets.length === 0) return res.status(400).json({ error: 'nothing to update' });
    sets.push(`updated_at = NOW()`);
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE feedback SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, type, status, resolved_at, updated_at`,
      params,
    );
    if (rows.length === 0) return res.status(404).json({ error: 'feedback not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[feedback] PATCH error:', err.message);
    res.status(500).json({ error: 'Failed to update feedback' });
  }
});

module.exports = router;
