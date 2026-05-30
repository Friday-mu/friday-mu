'use strict';

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../database/client');
const { sendEmail, tplPasswordReset } = require('../tenants/email');
const { DEFAULT_TENANT_ID } = require('../design/adapters');

const router = express.Router();

const TOKEN_TTL_HOURS = 1;
const RESET_URL_BASE =
  process.env.PASSWORD_RESET_URL_BASE || 'https://admin.friday.mu/reset-password';

// Derive FAD role when migration 075's `fad_role` is null (existing test
// rows pre-migration, or any new login created via routes that bypass
// the migration mapping). Keeps logins working without surprise nulls.
const FAD_ROLE_FROM_COARSE = {
  admin: 'director',
  agent: 'field',
};
function resolveFadRole(user) {
  if (user.fad_role) return user.fad_role;
  return FAD_ROLE_FROM_COARSE[user.role] || 'field';
}

function signUserToken(user) {
  const username = user.email || user.username;
  return jwt.sign(
    {
      user_id: user.id,
      username,
      role: user.role,
      fad_role: resolveFadRole(user),
      display_name: user.display_name || username,
      tenant_id: user.tenant_id || DEFAULT_TENANT_ID,
    },
    process.env.JWT_SECRET || '',
    { expiresIn: '7d' },
  );
}

function shapeUser(user, token = null) {
  const shaped = {
    user_id: user.id,
    id: user.id,
    username: user.email || user.username,
    email: user.email,
    display_name: user.display_name || user.email || user.username,
    role: user.role,
    fad_role: resolveFadRole(user),
    tenant_id: user.tenant_id || DEFAULT_TENANT_ID,
    must_change_password: !!user.must_change_password,
    // T3.15 v0.3 — cross-device UI language preference. Null = no
    // preference set; frontend falls back to browser language + the
    // localStorage cache (`fad:lang`). Set via PATCH /api/auth/me/preferences.
    preferred_language: user.preferred_language || null,
  };
  if (token) shaped.token = token;
  return shaped;
}

function authPayload(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(auth.slice('Bearer '.length), process.env.JWT_SECRET || '');
  } catch {
    return null;
  }
}

async function loadActiveUserById(userId) {
  if (!userId) return null;
  const { rows } = await query(
    `SELECT id, username, email, password_hash, role, fad_role, display_name,
            tenant_id, is_active, must_change_password, preferred_language
       FROM users
      WHERE id = $1
        AND is_active = TRUE
      LIMIT 1`,
    [userId],
  );
  return rows[0] || null;
}

async function sendResetEmailForUser(user) {
  const token = crypto.randomBytes(32).toString('hex');
  await query(
    `UPDATE users
        SET reset_token = $1,
            reset_token_expires = NOW() + INTERVAL '${TOKEN_TTL_HOURS} hour'
      WHERE id = $2`,
    [token, user.id],
  );

  const resetUrl = `${RESET_URL_BASE}?token=${encodeURIComponent(token)}`;
  const tpl = tplPasswordReset({ user, resetUrl });
  await sendEmail({ to: user.email, ...tpl });
}

router.post('/login', async (req, res) => {
  const identifier = String(req.body?.username || req.body?.email || '').trim().toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!identifier || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const { rows } = await query(
      // fad_role MUST be selected — signUserToken/shapeUser call resolveFadRole,
      // which falls back to the coarse role map (admin→director, agent→field) when
      // fad_role is absent. Omitting it here minted EVERY agent as 'field' (no guest
      // inbox) regardless of their real fad_role. (Bugfix 2026-05-30.)
      `SELECT id, username, email, password_hash, role, fad_role, display_name,
              tenant_id, is_active, must_change_password, preferred_language
         FROM users
        WHERE LOWER(COALESCE(email, '')) = $1
           OR LOWER(COALESCE(username, '')) = $1
        ORDER BY CASE WHEN LOWER(COALESCE(email, '')) = $1 THEN 0 ELSE 1 END
        LIMIT 1`,
      [identifier],
    );
    const user = rows[0];

    if (!user || !user.is_active || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordOk = bcrypt.compareSync(password, user.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signUserToken(user);
    return res.json(shapeUser(user, token));
  } catch (e) {
    console.error('[auth/login] FAD-native login failed:', e.message);
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', async (req, res) => {
  const payload = authPayload(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await loadActiveUserById(payload.user_id || payload.userId);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    return res.json(shapeUser(user));
  } catch (e) {
    console.error('[auth/me] FAD-native auth check failed:', e.message);
    return res.status(500).json({ error: 'Auth check failed' });
  }
});

// T3.15 v0.3 — update the caller's UI preferences (cross-device).
// Currently only `preferred_language` ('en' | 'fr' | null). Validate
// strictly so a bad payload can't write garbage into the column past
// the CHECK constraint. Returns the updated user shape.
router.patch('/me/preferences', async (req, res) => {
  const payload = authPayload(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  const body = req.body || {};
  const hasLang = Object.prototype.hasOwnProperty.call(body, 'preferred_language');
  if (!hasLang) {
    return res.status(400).json({ error: 'preferred_language is required' });
  }
  const next = body.preferred_language;
  if (next !== null && next !== 'en' && next !== 'fr') {
    return res.status(400).json({ error: 'preferred_language must be null, "en", or "fr"' });
  }

  try {
    const userId = payload.user_id || payload.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    await query(
      `UPDATE users SET preferred_language = $1 WHERE id = $2`,
      [next, userId],
    );
    const user = await loadActiveUserById(userId);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    return res.json(shapeUser(user));
  } catch (e) {
    console.error('[auth/me/preferences] update failed:', e.message);
    return res.status(500).json({ error: 'Could not update preferences' });
  }
});

router.post('/password-reset/me/request', async (req, res) => {
  const payload = authPayload(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await loadActiveUserById(payload.user_id || payload.userId);
    if (!user || !user.email) return res.status(404).json({ error: 'User not found' });
    await sendResetEmailForUser(user);
    return res.json({ ok: true, email: user.email });
  } catch (e) {
    console.error('[auth/password-reset/me/request] error:', e.message);
    return res.status(500).json({ error: 'Could not send reset email' });
  }
});

router.post('/change-password', async (req, res) => {
  const payload = authPayload(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  const { current_password, new_password } = req.body || {};
  if (typeof current_password !== 'string' || !current_password) {
    return res.status(400).json({ error: 'current_password required' });
  }
  if (typeof new_password !== 'string' || new_password.length < 8) {
    return res.status(400).json({ error: 'new_password must be >= 8 characters' });
  }
  if (new_password === current_password) {
    return res.status(400).json({ error: 'new_password must differ from current_password' });
  }

  try {
    const user = await loadActiveUserById(payload.user_id || payload.userId);
    if (!user || !user.password_hash) return res.status(404).json({ error: 'User not found' });

    const passwordOk = bcrypt.compareSync(current_password, user.password_hash);
    if (!passwordOk) {
      return res.status(400).json({ error: 'current_password is incorrect' });
    }

    const passwordHash = bcrypt.hashSync(new_password, 10);
    await query(
      `UPDATE users
          SET password_hash = $1,
              must_change_password = FALSE,
              reset_token = NULL,
              reset_token_expires = NULL
        WHERE id = $2`,
      [passwordHash, user.id],
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error('[auth/change-password] error:', e.message);
    return res.status(500).json({ error: 'change-password failed' });
  }
});

router.post('/logout', (req, res) => {
  res.json({ ok: true });
});

module.exports = router;
module.exports.signUserToken = signUserToken;
module.exports.shapeUser = shapeUser;
module.exports.resolveFadRole = resolveFadRole;
