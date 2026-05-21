'use strict';

// Public password-reset flow for FAD tenant users.
//
// Two endpoints, both public (no auth middleware):
//
//   POST /api/auth/password-reset/request  { email }
//     → always returns 200 { ok: true } regardless of whether the email
//       exists. Don't leak account existence. If the user is found and
//       active, generate a 32-byte hex token, stash it on users.reset_token
//       with a 1h expiry, and fire tplPasswordReset via Resend.
//
//   POST /api/auth/password-reset/confirm  { token, new_password }
//     → look up the user by (reset_token, expiry > NOW, is_active = true),
//       bcrypt the new password (cost 10, matching signup), clear the
//       token. Single-use by construction — we clear it on success.
//
// Token security choices:
//   - 32 bytes from crypto.randomBytes → 64 hex chars, 256 bits of entropy
//   - 1h expiry, stored as a TIMESTAMPTZ on the row
//   - Single-use: cleared on successful confirm
//   - Never logged, never returned to the client
//   - Delivered only via email link (URL param)

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query } = require('../database/client');
const { sendEmail, tplPasswordReset } = require('../tenants/email');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_BYTES = 32;
const TOKEN_TTL_HOURS = 1;
const RESET_URL_BASE =
  process.env.PASSWORD_RESET_URL_BASE || 'https://gms.friday.mu/reset-password';

// POST /api/auth/password-reset/request
// Public. Always 200. Body: { email }.
router.post('/password-reset/request', async (req, res) => {
  const { email } = req.body || {};

  // Soft validation only — even on a clearly malformed email we still
  // return 200 to avoid leaking signal. Just skip the DB hit.
  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
    return res.json({ ok: true });
  }

  const normalised = email.trim().toLowerCase();

  try {
    const { rows } = await query(
      `SELECT id, email, display_name, is_active
         FROM users
        WHERE LOWER(email) = $1
        LIMIT 1`,
      [normalised],
    );
    const user = rows[0];

    // Only generate + email if the user exists and is active. Always
    // respond ok regardless.
    if (user && user.is_active) {
      const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
      await query(
        `UPDATE users
            SET reset_token = $1,
                reset_token_expires = NOW() + INTERVAL '${TOKEN_TTL_HOURS} hour'
          WHERE id = $2`,
        [token, user.id],
      );

      const resetUrl = `${RESET_URL_BASE}?token=${encodeURIComponent(token)}`;
      const tpl = tplPasswordReset({ user, resetUrl });
      // Fire-and-forget. Never block the response on SMTP.
      sendEmail({ to: user.email, ...tpl }).catch(() => {});
    }

    return res.json({ ok: true });
  } catch (e) {
    // Log internally, but still don't leak. Returning 200 here means a
    // DB failure looks identical to a missing-user response to a caller
    // — that's fine, this endpoint is not used for diagnostics.
    console.error('[auth/password-reset/request] error:', e.message);
    return res.json({ ok: true });
  }
});

// POST /api/auth/password-reset/confirm
// Public. Body: { token, new_password }. 400 on invalid/expired.
router.post('/password-reset/confirm', async (req, res) => {
  const { token, new_password } = req.body || {};

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'token is required' });
  }
  if (!new_password || typeof new_password !== 'string' || new_password.length < 8) {
    return res.status(400).json({ error: 'new_password must be ≥ 8 characters' });
  }

  try {
    const { rows } = await query(
      `SELECT id, email
         FROM users
        WHERE reset_token = $1
          AND reset_token_expires > NOW()
          AND is_active = true
        LIMIT 1`,
      [token],
    );
    const user = rows[0];
    if (!user) {
      return res.status(400).json({ error: 'invalid or expired token' });
    }

    const passwordHash = bcrypt.hashSync(new_password, 10);
    await query(
      `UPDATE users
          SET password_hash = $1,
              reset_token = NULL,
              reset_token_expires = NULL,
              must_change_password = false
        WHERE id = $2`,
      [passwordHash, user.id],
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error('[auth/password-reset/confirm] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
