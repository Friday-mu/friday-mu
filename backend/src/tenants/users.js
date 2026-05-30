'use strict';

// Tenant user management — list / invite / accept / role / deactivate.
// Mounted under /api/tenants alongside index.js + invoices.js (see
// backend/server.js). Three flavours of route in this file:
//
//   Authed admin (req.tenantId):
//     GET    /me/users                      list users in this tenant
//     GET    /me/invitations                list pending invitations
//     POST   /me/invitations                create + email invite
//     DELETE /me/invitations/:id            revoke pending invite
//     POST   /me/users/:user_id/role        change role (last-admin guard)
//     POST   /me/users/:user_id/deactivate  set is_active=false (last-admin guard)
//
//   Public (no auth):
//     GET    /invitations/:token            read invitation summary for the accept page
//     POST   /invitations/:token/accept     create user + mark accepted, return JWT
//
// Design notes:
// - Roles are restricted to ('admin', 'agent') at the DB layer (mig 041)
//   and re-checked in this file. 'agent' is the v0 non-admin tier — it
//   maps to GMS 'manager' role at JWT-mint time so existing FAD perm
//   gates (which key off 'admin') keep working unchanged.
// - Last-admin protection runs inside a transaction with FOR UPDATE so
//   two concurrent demotion / deactivation calls can't both leave the
//   tenant with zero admins. The guard counts active admins != the
//   target row; if the count is zero, we 409 before touching anything.
// - Token is 32 random bytes hex (64 chars). Single-use (status flips
//   to 'accepted' on use). 7-day TTL. See migration 041 header for the
//   threat model.
// - Invitation email is fire-and-forget (catch + log). The HTTP response
//   doesn't wait on Resend, mirroring the signup / invoice flows.

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, query } = require('../database/client');
const { attachIdentity } = require('../design/auth');
const { sendEmail, tplInvitation } = require('./email');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PG_UNIQUE_VIOLATION = '23505';
const INVITATION_TTL_DAYS = 7;
const TOKEN_BYTES = 32;
const DASHBOARD_URL = 'https://gms.friday.mu/fad';

// Map a tenant_invitations.role onto the GMS users.role column. 'agent'
// is the v0 non-admin tier — we persist it as GMS 'manager' so FAD's
// existing role checks (which look for 'admin') treat invitees as
// non-admin without further wiring. When a dedicated 'agent' role lands
// in the GMS permissions table, swap this mapping.
function _gmsRoleFor(invitationRole) {
  return invitationRole === 'admin' ? 'admin' : 'manager';
}

function _shapeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    display_name: row.display_name,
    tenant_id: row.tenant_id,
    is_active: row.is_active,
    must_change_password: row.must_change_password,
    created_at: row.created_at,
  };
}

function _shapeInvitation(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    email: row.email,
    role: row.role,
    status: row.status,
    invited_by_user_id: row.invited_by_user_id,
    expires_at: row.expires_at,
    accepted_at: row.accepted_at,
    accepted_user_id: row.accepted_user_id,
    created_at: row.created_at,
  };
}

function _requireTenantAdmin(req, res) {
  if (req.identity?.userRole !== 'admin') {
    res.status(403).json({ error: 'Forbidden — admin role required' });
    return false;
  }
  return true;
}

// ─────────────────────────── authed admin routes ─────────────────────

// GET /api/tenants/me/users — list users in the current tenant.
router.get('/me/users', attachIdentity, async (req, res) => {
  if (!_requireTenantAdmin(req, res)) return;
  try {
    const { rows } = await query(
      `SELECT id, username, email, role, display_name, tenant_id,
              is_active, must_change_password, created_at
         FROM users
        WHERE tenant_id = $1
        ORDER BY created_at ASC`,
      [req.tenantId],
    );
    res.json(rows.map(_shapeUser));
  } catch (e) {
    console.error('[tenants/me/users] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/tenants/me/invitations — pending invitations for this tenant.
router.get('/me/invitations', attachIdentity, async (req, res) => {
  if (!_requireTenantAdmin(req, res)) return;
  try {
    const { rows } = await query(
      `SELECT * FROM tenant_invitations
        WHERE tenant_id = $1 AND status = 'pending'
        ORDER BY created_at DESC`,
      [req.tenantId],
    );
    res.json(rows.map(_shapeInvitation));
  } catch (e) {
    console.error('[tenants/me/invitations] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tenants/me/invitations — create + send invite.
// Body: { email, role: 'admin' | 'agent' }
router.post('/me/invitations', attachIdentity, async (req, res) => {
  if (!_requireTenantAdmin(req, res)) return;
  const email = String(req.body?.email || '').trim().toLowerCase();
  const role = req.body?.role === 'admin' ? 'admin' : 'agent';

  if (!email || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'email must be a valid address' });
  }

  try {
    // 409 if a user with this email already exists in the tenant.
    const existingUser = await query(
      `SELECT 1 FROM users WHERE tenant_id = $1 AND LOWER(email) = $2 LIMIT 1`,
      [req.tenantId, email],
    );
    if (existingUser.rowCount > 0) {
      return res.status(409).json({ error: 'A user with this email already exists in the tenant' });
    }

    const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');

    const { rows } = await query(
      `INSERT INTO tenant_invitations
         (tenant_id, email, role, token, invited_by_user_id, expires_at)
       VALUES
         ($1, $2, $3, $4, $5, NOW() + INTERVAL '${INVITATION_TTL_DAYS} days')
       RETURNING *`,
      [req.tenantId, email, role, token, req.identity?.userId || null],
    );
    const invitation = rows[0];

    // Fire-and-forget email. Build acceptUrl with a query-string token
    // because the static-export frontend can't pre-render arbitrary
    // tokens in [token]/page.tsx routes — the public accept page lives
    // at /invitations and reads ?token=... at runtime.
    const acceptUrl = `${DASHBOARD_URL.replace(/\/fad$/, '')}/invitations?token=${encodeURIComponent(token)}`;
    const tenantRow = await query(`SELECT * FROM tenants WHERE id = $1`, [req.tenantId]);
    const tenant = tenantRow.rows[0];
    const inviter = req.identity
      ? { display_name: req.identity.displayName, email: req.identity.username }
      : null;
    const tpl = tplInvitation({ tenant, inviter, role, acceptUrl });
    sendEmail({ to: email, ...tpl }).catch(() => {});

    res.status(201).json(_shapeInvitation(invitation));
  } catch (e) {
    if (e && e.code === PG_UNIQUE_VIOLATION) {
      // Pending invitation already exists for this (tenant, email).
      return res.status(409).json({ error: 'A pending invitation already exists for this email' });
    }
    console.error('[tenants/me/invitations] create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/tenants/me/invitations/:id — revoke a pending invite.
router.delete('/me/invitations/:id', attachIdentity, async (req, res) => {
  if (!_requireTenantAdmin(req, res)) return;
  try {
    const { rows } = await query(
      `UPDATE tenant_invitations
          SET status = 'revoked'
        WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
        RETURNING *`,
      [req.params.id, req.tenantId],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Pending invitation not found' });
    }
    res.json(_shapeInvitation(rows[0]));
  } catch (e) {
    console.error('[tenants/me/invitations] revoke error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Count active admins in a tenant EXCLUDING a specific user. Used by
// the last-admin guard before demotion / deactivation. Takes a `client`
// so callers can hold a transaction.
async function _countOtherActiveAdmins(client, tenantId, excludeUserId) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM users
      WHERE tenant_id = $1
        AND role = 'admin'
        AND is_active = true
        AND id <> $2`,
    [tenantId, excludeUserId],
  );
  return rows[0]?.n ?? 0;
}

// POST /api/tenants/me/users/:user_id/role — change role.
// Body: { role: 'admin' | 'agent' }. Refuses to demote the last admin.
router.post('/me/users/:user_id/role', attachIdentity, async (req, res) => {
  if (!_requireTenantAdmin(req, res)) return;
  const targetRole = req.body?.role === 'admin' ? 'admin' : 'agent';
  const gmsRole = _gmsRoleFor(targetRole);
  const userId = req.params.user_id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock the row so two concurrent demotions can't race the count.
    const targetRes = await client.query(
      `SELECT * FROM users WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [userId, req.tenantId],
    );
    if (targetRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found in this tenant' });
    }
    const target = targetRes.rows[0];

    // Last-admin guard: if we're demoting an admin to non-admin, there
    // must be at least one OTHER active admin in the tenant.
    if (target.role === 'admin' && gmsRole !== 'admin') {
      const others = await _countOtherActiveAdmins(client, req.tenantId, userId);
      if (others === 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Cannot demote the last admin — promote another user first' });
      }
    }

    const updated = await client.query(
      `UPDATE users SET role = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [gmsRole, userId, req.tenantId],
    );
    await client.query('COMMIT');
    res.json(_shapeUser(updated.rows[0]));
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[tenants/me/users/role] error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /api/tenants/me/users/:user_id/deactivate — flip is_active=false.
router.post('/me/users/:user_id/deactivate', attachIdentity, async (req, res) => {
  if (!_requireTenantAdmin(req, res)) return;
  const userId = req.params.user_id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const targetRes = await client.query(
      `SELECT * FROM users WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [userId, req.tenantId],
    );
    if (targetRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found in this tenant' });
    }
    const target = targetRes.rows[0];

    // Last-admin guard: don't allow deactivating the only active admin.
    if (target.role === 'admin' && target.is_active) {
      const others = await _countOtherActiveAdmins(client, req.tenantId, userId);
      if (others === 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Cannot deactivate the last admin — promote another user first' });
      }
    }

    const updated = await client.query(
      `UPDATE users SET is_active = false WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [userId, req.tenantId],
    );
    await client.query('COMMIT');
    res.json(_shapeUser(updated.rows[0]));
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[tenants/me/users/deactivate] error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ─────────────────────────── public accept routes ────────────────────

// GET /api/tenants/invitations/:token — invitation summary for the
// accept page. Returns 404 if invalid / expired / non-pending; we
// don't leak why (avoids enumeration tells, though tokens are 64-char
// random hex so enumeration is moot in practice).
router.get('/invitations/:token', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT i.*, t.name AS tenant_name
         FROM tenant_invitations i
         JOIN tenants t ON t.id = i.tenant_id
        WHERE i.token = $1
          AND i.status = 'pending'
          AND i.expires_at > NOW()
        LIMIT 1`,
      [req.params.token],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Invitation not found or expired' });
    }
    const row = rows[0];
    res.json({
      email: row.email,
      role: row.role,
      tenant_name: row.tenant_name,
      expires_at: row.expires_at,
    });
  } catch (e) {
    console.error('[tenants/invitations/:token] get error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tenants/invitations/:token/accept — body { password, display_name? }.
// Creates the user, links to tenant, flips invitation to accepted, returns JWT.
router.post('/invitations/:token/accept', async (req, res) => {
  const password = req.body?.password;
  const displayName = req.body?.display_name;
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'password must be ≥ 8 characters' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the invitation row to prevent double-accept races.
    const invRes = await client.query(
      `SELECT * FROM tenant_invitations
        WHERE token = $1
          AND status = 'pending'
          AND expires_at > NOW()
        FOR UPDATE`,
      [req.params.token],
    );
    if (invRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invitation not found or expired' });
    }
    const inv = invRes.rows[0];

    // Email collision inside the tenant — defensive; the create-invite
    // path already 409s on this, but a user could have been provisioned
    // through another flow between invite and accept.
    const dup = await client.query(
      `SELECT 1 FROM users WHERE tenant_id = $1 AND LOWER(email) = LOWER($2) LIMIT 1`,
      [inv.tenant_id, inv.email],
    );
    if (dup.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'A user with this email already exists in the tenant' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const gmsRole = _gmsRoleFor(inv.role);
    const userRes = await client.query(
      `INSERT INTO users
         (username, email, password_hash, role, display_name, tenant_id, is_active, must_change_password)
       VALUES
         ($1, $1, $2, $3, $4, $5, true, false)
       RETURNING *`,
      [
        inv.email,
        passwordHash,
        gmsRole,
        (typeof displayName === 'string' && displayName.trim()) || inv.email,
        inv.tenant_id,
      ],
    );
    const user = userRes.rows[0];

    await client.query(
      `UPDATE tenant_invitations
          SET status = 'accepted',
              accepted_at = NOW(),
              accepted_user_id = $1
        WHERE id = $2`,
      [user.id, inv.id],
    );

    await client.query('COMMIT');

    const token = jwt.sign(
      {
        user_id: user.id,
        username: user.username,
        role: user.role,
        display_name: user.display_name,
        tenant_id: user.tenant_id,
      },
      process.env.JWT_SECRET || '',
      { algorithm: 'HS256', expiresIn: '7d' },
    );

    res.status(201).json({
      user: _shapeUser(user),
      token,
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (e && e.code === PG_UNIQUE_VIOLATION) {
      return res.status(409).json({ error: 'username or email already registered' });
    }
    console.error('[tenants/invitations/accept] error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
