'use strict';

// Owner portal endpoints — magic-link gated, not JWT.
//
// Auth flow: the portal SPA receives a token from /portal/auth?token=...,
// stores it locally, and sends it as `Authorization: Bearer <token>` on
// every portal request. portalAuth middleware:
//   1. Decodes the JWT (HS256 / JWT_SECRET).
//   2. Verifies kind === 'portal'.
//   3. Looks up the matching design_magic_links row by token sha256.
//   4. Rejects if revoked_at IS NOT NULL.
//   5. Touches last_used_at on success.
//   6. Loads the associated project and attaches req.portalProject +
//      req.magicLink for the route handlers.
//
// Owner-stripping applied to every read: sensitive cost fields removed,
// internal activities filtered out, raw vendor info hidden.

const express = require('express');
const jwt = require('jsonwebtoken');
const { query, pool } = require('../database/client');
const {
  DEFAULT_TENANT_ID,
  shapeProject, shapeActivity, shapeMoodboard, shapePack,
  shapeSelection, shapeChangeOrder, shapeBudgetItem,
  shapeAgreement, shapePaymentGate, shapeCloseoutBinder,
  shapePortalLog,
} = require('./adapters');
const { hashToken } = require('./magic_links');

const router = express.Router();

async function portalAuth(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized — missing portal token' });
    }
    const token = auth.slice('Bearer '.length);
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET || '', { algorithms: ['HS256'] });
    } catch {
      return res.status(401).json({ error: 'Unauthorized — invalid portal token' });
    }
    if (payload.kind !== 'portal') {
      return res.status(401).json({ error: 'Unauthorized — wrong token kind' });
    }
    const tokenHash = hashToken(token);
    const { rows } = await query(
      `SELECT ml.*, p.id AS pid, p.slug AS pslug, p.tenant_id AS ptenant
       FROM design_magic_links ml
       JOIN design_projects p ON p.id = ml.project_id
       WHERE ml.token_hash = $1`,
      [tokenHash],
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Unauthorized — token not recognised' });
    const row = rows[0];
    if (row.revoked_at) return res.status(401).json({ error: 'Unauthorized — token revoked' });
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Unauthorized — token expired' });
    }
    if (row.ptenant !== DEFAULT_TENANT_ID) {
      return res.status(401).json({ error: 'Unauthorized — tenant mismatch' });
    }
    if (row.pid !== payload.project_id || row.pslug !== payload.project_slug) {
      return res.status(401).json({ error: 'Unauthorized — token/project mismatch' });
    }

    // Touch last_used_at; non-fatal if it fails.
    query(`UPDATE design_magic_links SET last_used_at = NOW() WHERE id = $1`, [row.id]).catch(() => {});

    req.portalProject = { id: row.pid, slug: row.pslug, tenant_id: row.ptenant };
    req.magicLink = row;
    next();
  } catch (e) {
    console.error('[design/portal] auth error:', e.message);
    res.status(500).json({ error: e.message });
  }
}

async function logPortalEvent({ projectId, magicLinkId, eventType, payload, userAgent, ipAddress }) {
  return query(
    `INSERT INTO design_portal_log (project_id, magic_link_id, event_type, payload, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [projectId, magicLinkId, eventType, payload || {}, userAgent || null, ipAddress || null],
  ).catch((e) => console.warn('[portal] log failed:', e.message));
}

// All portal routes below require portalAuth.
router.use(portalAuth);

// GET /api/design/portal/me — sanity probe + project context.
router.get('/me', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM design_projects WHERE id = $1`,
      [req.portalProject.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    await logPortalEvent({
      projectId: req.portalProject.id,
      magicLinkId: req.magicLink.id,
      eventType: 'view',
      payload: { surface: 'me' },
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
    res.json({ project: shapeProject(rows[0]) });
  } catch (e) {
    console.error('[design/portal] me error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/design/portal/activities — portal-visible activities only.
router.get('/activities', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM design_activities WHERE project_id = $1 AND visibility = 'portal' ORDER BY created_at DESC LIMIT 200`,
      [req.portalProject.id],
    );
    res.json({ results: rows.map(shapeActivity) });
  } catch (e) {
    console.error('[design/portal] activities error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/agreement', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM design_agreements WHERE project_id = $1`,
      [req.portalProject.id],
    );
    res.json(rows.length > 0 ? shapeAgreement(rows[0]) : null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/payments', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM design_payment_gates WHERE project_id = $1 ORDER BY due_date NULLS LAST, created_at`,
      [req.portalProject.id],
    );
    res.json({ results: rows.map(shapePaymentGate) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/moodboards', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM design_moodboards WHERE project_id = $1 AND status IN ('sent', 'approved', 'changes_requested') ORDER BY version_number DESC`,
      [req.portalProject.id],
    );
    res.json({ results: rows.map(shapeMoodboard) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/packs', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM design_packs WHERE project_id = $1 AND status IN ('sent', 'approved', 'changes_requested') ORDER BY version_number DESC`,
      [req.portalProject.id],
    );
    res.json({ results: rows.map(shapePack) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/selections', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM design_selections WHERE project_id = $1 AND status IN ('sent', 'picked', 'changes_requested') ORDER BY created_at DESC`,
      [req.portalProject.id],
    );
    res.json({ results: rows.map(shapeSelection) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/change_orders', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM design_change_orders WHERE project_id = $1 AND status IN ('sent', 'approved', 'rejected') ORDER BY created_at DESC`,
      [req.portalProject.id],
    );
    res.json({ results: rows.map(shapeChangeOrder) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/budget', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM design_budget_items WHERE project_id = $1 ORDER BY category_code, description`,
      [req.portalProject.id],
    );
    // Owner read: always strip sensitive (B3.1).
    res.json({ results: rows.map((r) => shapeBudgetItem(r, false)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/closeout', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM design_closeout_binders WHERE project_id = $1 AND status IN ('sent', 'signed')`,
      [req.portalProject.id],
    );
    res.json(rows.length > 0 ? shapeCloseoutBinder(rows[0]) : null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/design/portal/selections/:id/pick — owner action.
router.post('/selections/:id/pick', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { picked_option_id } = req.body || {};
    if (!picked_option_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'picked_option_id is required' });
    }
    const upd = await client.query(
      `UPDATE design_selections
       SET status = 'picked', picked_option_id = $3, picked_at = NOW(), updated_at = NOW()
       WHERE project_id = $1 AND id = $2 AND status = 'sent'
       RETURNING *`,
      [req.portalProject.id, req.params.id, picked_option_id],
    );
    if (upd.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Selection not pickable in current state' });
    }
    await client.query(
      `INSERT INTO design_activities (project_id, action, payload, visibility, actor_name)
       VALUES ($1, $2, $3, 'portal', 'Owner')`,
      [
        req.portalProject.id,
        'selection.picked.by_owner',
        { selection_id: req.params.id, picked_option_id },
      ],
    );
    await client.query('COMMIT');
    await logPortalEvent({
      projectId: req.portalProject.id,
      magicLinkId: req.magicLink.id,
      eventType: 'approval',
      payload: { kind: 'selection.pick', selection_id: req.params.id, picked_option_id },
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
    res.json(shapeSelection(upd.rows[0]));
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[design/portal] selection pick error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.post('/selections/:id/request-changes', async (req, res) => {
  try {
    const { comment } = req.body || {};
    const { rows } = await query(
      `UPDATE design_selections
       SET status = 'changes_requested', change_request_comment = $3, updated_at = NOW()
       WHERE project_id = $1 AND id = $2 AND status = 'sent'
       RETURNING *`,
      [req.portalProject.id, req.params.id, comment || null],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Selection not pickable in current state' });
    await query(
      `INSERT INTO design_activities (project_id, action, payload, visibility, actor_name)
       VALUES ($1, 'selection.changes_requested.by_owner', $2, 'portal', 'Owner')`,
      [req.portalProject.id, { selection_id: req.params.id, comment: comment || null }],
    );
    await logPortalEvent({
      projectId: req.portalProject.id,
      magicLinkId: req.magicLink.id,
      eventType: 'comment',
      payload: { kind: 'selection.changes_requested', selection_id: req.params.id },
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
    res.json(shapeSelection(rows[0]));
  } catch (e) {
    console.error('[design/portal] selection request-changes error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/design/portal/approvals/:id/respond — owner approve/reject.
router.post('/approvals/:id/respond', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { decision, comment } = req.body || {};
    if (decision !== 'approved' && decision !== 'rejected') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'decision must be approved or rejected' });
    }
    const approvalRes = await client.query(
      `SELECT * FROM design_approvals WHERE project_id = $1 AND id = $2 AND status = 'pending' FOR UPDATE`,
      [req.portalProject.id, req.params.id],
    );
    if (approvalRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pending approval not found' });
    }
    await client.query(`UPDATE design_approvals SET status = $2 WHERE id = $1`, [req.params.id, decision]);
    const eventRes = await client.query(
      `INSERT INTO design_approval_events (approval_id, respondent_name, decision, comment)
       VALUES ($1, 'Owner', $2, $3) RETURNING *`,
      [req.params.id, decision, comment || null],
    );
    await client.query(
      `INSERT INTO design_activities (project_id, action, payload, visibility, actor_name)
       VALUES ($1, $2, $3, 'portal', 'Owner')`,
      [req.portalProject.id, `approval.${decision}.by_owner`, { approval_id: req.params.id }],
    );
    await client.query('COMMIT');
    await logPortalEvent({
      projectId: req.portalProject.id,
      magicLinkId: req.magicLink.id,
      eventType: 'approval',
      payload: { approval_id: req.params.id, decision },
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
    res.json({
      approval_id: req.params.id,
      status: decision,
      event_id: eventRes.rows[0].id,
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[design/portal] approval respond error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Portal log read (staff-side, via a separate top-level route in index.js
// would be cleaner; for now exposing /portal/log as portal-auth'd is fine
// for the owner activity tab). Returns log entries scoped to this token's
// project — anyone with the link sees the link's activity.
router.get('/log', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM design_portal_log WHERE project_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [req.portalProject.id],
    );
    res.json({ results: rows.map(shapePortalLog) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.portalAuth = portalAuth;
module.exports.logPortalEvent = logPortalEvent;
