'use strict';

// Gmail OAuth flow — per-user connect, refresh, allowlist gating.
//
// Status: PARKED on Ishant creating a GCP OAuth client. The handshake
// can't reach Google until env vars are set:
//   GMAIL_OAUTH_CLIENT_ID
//   GMAIL_OAUTH_CLIENT_SECRET
//   GMAIL_OAUTH_REDIRECT_URI  (e.g. https://gms.friday.mu/api/email/oauth/callback)
//   GMAIL_OAUTH_SCOPES        (default: 'https://www.googleapis.com/auth/gmail.modify')
//   GMAIL_OAUTH_DOMAIN_ALLOWLIST (default: 'friday.mu') — comma-separated
//
// Once configured: GET /api/email/oauth/init?provider=gmail returns the
// Google consent URL; user signs in; Google redirects to /oauth/callback;
// we exchange the code for tokens, persist them encrypted to
// email_accounts, and start the watch + initial backfill.
//
// Allowlist gating: @friday.mu addresses are auto-marked allowed=TRUE.
// Anything else inserts allowed=FALSE awaiting tenant-admin approval
// (PATCH /api/email/accounts/:id/authorize endpoint).

const { encrypt } = require('./crypto_helper');
const { query } = require('../database/client');

function getConfig() {
  return {
    clientId: process.env.GMAIL_OAUTH_CLIENT_ID || null,
    clientSecret: process.env.GMAIL_OAUTH_CLIENT_SECRET || null,
    redirectUri: process.env.GMAIL_OAUTH_REDIRECT_URI || null,
    scopes: (process.env.GMAIL_OAUTH_SCOPES
      || 'https://www.googleapis.com/auth/gmail.modify').split(/[, ]+/).filter(Boolean),
    allowlist: (process.env.GMAIL_OAUTH_DOMAIN_ALLOWLIST || 'friday.mu')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  };
}

function isConfigured() {
  const c = getConfig();
  return !!(c.clientId && c.clientSecret && c.redirectUri);
}

/**
 * Build the Google consent URL the operator clicks to start the flow.
 * Includes `state` for CSRF — backend re-checks on callback.
 */
function buildAuthUrl({ userId, tenantId, state }) {
  const c = getConfig();
  if (!isConfigured()) throw new Error('Gmail OAuth not configured (env vars missing)');
  const params = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: 'code',
    access_type: 'offline', // need refresh_token
    prompt: 'consent',      // force refresh_token even on repeat connects
    scope: c.scopes.join(' '),
    // state carries (user_id, tenant_id, nonce); the nonce is verified
    // against a session-side cache (sketched — for v1 we sign with HMAC
    // so we don't need server state).
    state,
  });
  // userId & tenantId are baked into `state` by the caller (index.js).
  void userId; void tenantId;
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange the auth code for tokens. Calls the Google token endpoint
 * directly via fetch (no googleapis dep yet).
 */
async function exchangeCode(code) {
  const c = getConfig();
  if (!isConfigured()) throw new Error('Gmail OAuth not configured');
  const body = new URLSearchParams({
    code,
    client_id: c.clientId,
    client_secret: c.clientSecret,
    redirect_uri: c.redirectUri,
    grant_type: 'authorization_code',
  });
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token exchange failed: ${resp.status} ${text}`);
  }
  return resp.json(); // { access_token, refresh_token, expires_in, scope, id_token? }
}

/**
 * Fetch the connected account's email + sub (provider_account_id) from
 * Google's userinfo endpoint. Avoids us having to parse the id_token.
 */
async function fetchUserInfo(accessToken) {
  const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`userinfo fetch failed: ${resp.status} ${text}`);
  }
  return resp.json(); // { sub, email, email_verified, name, ... }
}

/**
 * Persist a connected Gmail account. @friday.mu addresses are
 * auto-allowed; others land allowed=FALSE pending tenant-admin nod.
 */
async function upsertAccount({ tenantId, userId, tokenResp, userInfo }) {
  const c = getConfig();
  const email = String(userInfo.email || '').toLowerCase();
  const domain = email.split('@')[1] || '';
  const allowed = c.allowlist.includes(domain);
  const accessEnc = encrypt(tokenResp.access_token);
  // refresh_token only comes through on first consent (prompt=consent
  // forces it). On subsequent re-connects Google may omit it; we keep
  // the existing one if so.
  const refreshEnc = tokenResp.refresh_token ? encrypt(tokenResp.refresh_token) : null;
  const expiresAt = tokenResp.expires_in
    ? new Date(Date.now() + (tokenResp.expires_in * 1000)).toISOString()
    : null;
  // Upsert by (provider, provider_account_id) — same Google account
  // re-connecting overwrites the previous row's tokens.
  const sql = refreshEnc
    ? `INSERT INTO email_accounts (
         tenant_id, user_id, provider, provider_account_id, email_address,
         allowed, access_token_encrypted, refresh_token_encrypted, access_token_expires_at
       ) VALUES ($1,$2,'gmail',$3,$4,$5,$6,$7,$8)
       ON CONFLICT (provider, provider_account_id) DO UPDATE SET
         access_token_encrypted = EXCLUDED.access_token_encrypted,
         refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
         access_token_expires_at = EXCLUDED.access_token_expires_at,
         updated_at = NOW()
       RETURNING *`
    : `INSERT INTO email_accounts (
         tenant_id, user_id, provider, provider_account_id, email_address,
         allowed, access_token_encrypted, access_token_expires_at
       ) VALUES ($1,$2,'gmail',$3,$4,$5,$6,$7)
       ON CONFLICT (provider, provider_account_id) DO UPDATE SET
         access_token_encrypted = EXCLUDED.access_token_encrypted,
         access_token_expires_at = EXCLUDED.access_token_expires_at,
         updated_at = NOW()
       RETURNING *`;
  const params = refreshEnc
    ? [tenantId, userId, userInfo.sub, email, allowed, accessEnc, refreshEnc, expiresAt]
    : [tenantId, userId, userInfo.sub, email, allowed, accessEnc, expiresAt];
  const { rows } = await query(sql, params);
  return rows[0];
}

module.exports = {
  getConfig,
  isConfigured,
  buildAuthUrl,
  exchangeCode,
  fetchUserInfo,
  upsertAccount,
};
