'use strict';

// Magic links — owner-portal auth tokens. v0.1 mints an HS256 JWT signed
// with JWT_SECRET; only the sha256 hash lives in design_magic_links so
// revocation is possible without storing the raw token server-side.
//
// Token payload: { kind: 'portal', project_id, project_slug, jti }.
// Tokens have a long expiry (10y per fixture); revocation flips
// revoked_at and short-circuits portal middleware lookups.
//
// portal_auth.js consumes these. Staff-side endpoints (mint / list /
// revoke) live here.

const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { shapeMagicLink } = require('./adapters');

const router = express.Router();

const TEN_YEARS_SEC = 60 * 60 * 24 * 365 * 10;

function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

// POST /api/design/magic_links — mint. Returns the raw token ONCE.
router.post('/', requireDesignPerm('design:portal_admin'), async (req, res) => {
  try {
    const { project_id, delivery_channel, expires_in_seconds } = req.body || {};
    if (!project_id) return res.status(400).json({ error: 'project_id is required' });

    const projectRes = await query(
      `SELECT id, slug FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, project_id],
    );
    if (projectRes.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const project = projectRes.rows[0];

    const jti = crypto.randomUUID();
    const ttl = Math.min(Math.max(expires_in_seconds || TEN_YEARS_SEC, 60), TEN_YEARS_SEC);
    const token = jwt.sign(
      // tenant_id embedded so portal middleware can scope queries to
      // the issuing tenant without a fallback to DEFAULT_TENANT_ID.
      { kind: 'portal', project_id: project.id, project_slug: project.slug, tenant_id: req.tenantId, jti },
      process.env.JWT_SECRET || '',
      { algorithm: 'HS256', expiresIn: ttl },
    );
    const tokenHash = hashToken(token);

    const { rows } = await query(
      `INSERT INTO design_magic_links (project_id, token_hash, expires_at, issued_by_user_id, delivery_channel)
       VALUES ($1, $2, NOW() + ($3 || ' seconds')::interval, $4, $5)
       RETURNING *`,
      [
        project.id,
        tokenHash,
        String(ttl),
        req.identity.userId || null,
        delivery_channel || null,
      ],
    );

    res.status(201).json({
      ...shapeMagicLink(rows[0]),
      // Raw token returned ONCE — caller is responsible for delivery via
      // WhatsApp / email / manual share. After this response, only the
      // hash is recoverable from the DB.
      token,
      portal_url: `/portal/auth?token=${encodeURIComponent(token)}`,
    });
  } catch (e) {
    console.error('[design/magic_links] mint error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/', requireDesignPerm('design:portal_admin'), async (req, res) => {
  try {
    const projectId = req.query.project_id;
    if (typeof projectId !== 'string') {
      return res.status(400).json({ error: 'project_id query param is required' });
    }
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, projectId],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const { rows } = await query(
      `SELECT * FROM design_magic_links WHERE project_id = $1 ORDER BY issued_at DESC`,
      [projectId],
    );
    res.json({ results: rows.map(shapeMagicLink) });
  } catch (e) {
    console.error('[design/magic_links] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/revoke', requireDesignPerm('design:portal_admin'), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE design_magic_links ml SET revoked_at = NOW()
       FROM design_projects p
       WHERE p.id = ml.project_id AND p.tenant_id = $1 AND ml.id = $2 AND ml.revoked_at IS NULL
       RETURNING ml.*`,
      [req.tenantId, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Active magic link not found' });
    res.json(shapeMagicLink(rows[0]));
  } catch (e) {
    console.error('[design/magic_links] revoke error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.hashToken = hashToken;
