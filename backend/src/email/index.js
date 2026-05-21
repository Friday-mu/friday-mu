'use strict';

// /api/email — Gmail integration (and Outlook/M365 in v2).
//
// Status: SCAFFOLD. Schema (mig 055) is shipped; OAuth + sync workers
// are present but the OAuth handshake can't reach Google until Ishant
// creates a GCP project + sets env vars (see oauth.js header comment).
//
// Endpoints (tenant-scoped, auth via attachIdentity unless noted):
//
//   Accounts
//   --------
//   GET    /api/email/accounts                  List the caller's connected accounts
//   GET    /api/email/oauth/init                Build the Google consent URL
//   GET    /api/email/oauth/callback            OAuth redirect target (no auth)
//   PATCH  /api/email/accounts/:id/authorize    Tenant admin: flip allowed=TRUE for non-allowlist
//   DELETE /api/email/accounts/:id              Disconnect an account
//   GET    /api/email/accounts/pending          Tenant admin: list pending non-allowlist accounts
//
//   Threads + messages
//   ------------------
//   GET    /api/email/threads                   List threads, filterable by audience
//   GET    /api/email/threads/:id               Detail + messages list
//   POST   /api/email/threads/:id/reclassify    Manual override of audience
//
//   Webhooks
//   --------
//   POST   /api/email/pubsub/push               Cloud Pub/Sub push receiver (no auth — Google-signed)
//
//   Diagnostics
//   -----------
//   GET    /api/email/status                    Public — returns whether OAuth env is configured

const express = require('express');
const crypto = require('crypto');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');
const oauth = require('./oauth');
const watcher = require('./watcher');

const router = express.Router();

const STATE_SECRET = process.env.GMAIL_OAUTH_STATE_SECRET
  || process.env.JWT_SECRET
  || 'dev-state-secret';

function signState(payload) {
  const json = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', STATE_SECRET).update(json).digest('hex');
  return Buffer.from(JSON.stringify({ payload, sig })).toString('base64url');
}

function verifyState(state) {
  try {
    const { payload, sig } = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    const expected = crypto.createHmac('sha256', STATE_SECRET).update(JSON.stringify(payload)).digest('hex');
    if (sig !== expected) return null;
    // Expire after 10 min — protects against replay if someone snags
    // the state from logs.
    if (Date.now() - (payload.iat || 0) > 10 * 60 * 1000) return null;
    return payload;
  } catch (_e) {
    return null;
  }
}

// ─── Public status ─────────────────────────────────────────────────

router.get('/status', (req, res) => {
  res.json({
    configured: oauth.isConfigured(),
    provider: 'gmail',
    note: oauth.isConfigured()
      ? 'OAuth configured; ready to connect accounts'
      : 'PARKED: set GMAIL_OAUTH_CLIENT_ID / SECRET / REDIRECT_URI to enable connections',
  });
});

// ─── OAuth ─────────────────────────────────────────────────────────

router.get('/oauth/init', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  if (!oauth.isConfigured()) {
    return res.status(503).json({ error: 'Gmail OAuth not configured' });
  }
  const state = signState({ userId, tenantId: req.tenantId, iat: Date.now() });
  const url = oauth.buildAuthUrl({ userId, tenantId: req.tenantId, state });
  res.json({ url });
});

// Note: no attachIdentity — Google's redirect is anonymous from our
// perspective. The signed `state` carries the identity instead.
router.get('/oauth/callback', async (req, res) => {
  if (!oauth.isConfigured()) {
    return res.status(503).send('Gmail OAuth not configured');
  }
  const { code, state, error } = req.query;
  if (error) return res.status(400).send(`Google rejected the flow: ${error}`);
  if (!code || !state) return res.status(400).send('missing code or state');
  const claims = verifyState(String(state));
  if (!claims) return res.status(400).send('invalid or expired state');
  try {
    const tokenResp = await oauth.exchangeCode(String(code));
    const userInfo = await oauth.fetchUserInfo(tokenResp.access_token);
    const account = await oauth.upsertAccount({
      tenantId: claims.tenantId,
      userId: claims.userId,
      tokenResp,
      userInfo,
    });
    // Land back on the FAD settings module — the email-accounts panel
    // will pick up the new row on next render.
    const ok = account.allowed ? 'connected' : 'pending_authorization';
    res.redirect(`/fad/?m=settings&email_status=${ok}`);
  } catch (e) {
    console.error('[email/oauth/callback] error:', e.message);
    res.status(500).send(`OAuth callback failed: ${e.message}`);
  }
});

// ─── Account management ────────────────────────────────────────────

router.get('/accounts', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  try {
    const { rows } = await query(
      `SELECT id, provider, email_address, allowed,
              authorized_at, watch_expiration,
              created_at, updated_at
       FROM email_accounts
       WHERE tenant_id = $1 AND user_id = $2
       ORDER BY created_at`,
      [req.tenantId, userId],
    );
    res.json({ accounts: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/accounts/pending', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  if (req.identity?.userRole !== 'admin') {
    return res.status(403).json({ error: 'Tenant admin required' });
  }
  try {
    const { rows } = await query(
      `SELECT a.id, a.provider, a.email_address, a.created_at,
              u.id AS user_id, u.display_name AS connected_by_name
       FROM email_accounts a
       JOIN users u ON u.id = a.user_id
       WHERE a.tenant_id = $1 AND a.allowed = FALSE
       ORDER BY a.created_at DESC`,
      [req.tenantId],
    );
    res.json({ pending: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/accounts/:id/authorize', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  if (req.identity?.userRole !== 'admin') {
    return res.status(403).json({ error: 'Tenant admin required' });
  }
  const reason = String(req.body?.reason || '').slice(0, 500);
  try {
    const { rows } = await query(
      `UPDATE email_accounts
       SET allowed = TRUE,
           authorized_by_user_id = $1,
           authorized_reason = $2,
           authorized_at = NOW(),
           updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4
       RETURNING id, email_address, allowed`,
      [userId, reason || null, req.params.id, req.tenantId],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Account not found' });
    res.json({ account: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/accounts/:id', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  try {
    // Owners can disconnect their own accounts; admins can disconnect any.
    const isAdmin = req.identity?.userRole === 'admin';
    const { rows } = await query(
      `DELETE FROM email_accounts
       WHERE id = $1 AND tenant_id = $2 AND ($3::boolean OR user_id = $4)
       RETURNING id`,
      [req.params.id, req.tenantId, isAdmin, userId],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Account not found or not owned by caller' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Threads + messages ────────────────────────────────────────────

router.get('/threads', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  const audience = req.query.audience ? String(req.query.audience) : null;
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || 50), 10) || 50));
  try {
    const params = [req.tenantId];
    let sql =
      `SELECT t.id, t.subject, t.classified_audience, t.classified_by,
              t.last_message_at, t.first_message_at, t.message_count,
              t.status, t.participants
       FROM email_threads t
       WHERE t.tenant_id = $1`;
    if (audience) {
      params.push(audience);
      sql += ` AND t.classified_audience = $${params.length}`;
    }
    params.push(limit);
    sql += ` ORDER BY t.last_message_at DESC LIMIT $${params.length}`;
    const { rows } = await query(sql, params);
    res.json({ threads: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/threads/:id', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  try {
    const { rows: thread } = await query(
      `SELECT * FROM email_threads WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenantId],
    );
    if (thread.length === 0) return res.status(404).json({ error: 'Thread not found' });
    const { rows: messages } = await query(
      `SELECT id, message_id_header, in_reply_to_header, references_header,
              from_email, from_name, to_emails, cc_emails, subject,
              body_text, body_html, sent_at, received_at, direction, labels
       FROM email_messages
       WHERE thread_id = $1
       ORDER BY sent_at`,
      [req.params.id],
    );
    res.json({ thread: thread[0], messages });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/threads/:id/reclassify', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  const audience = String(req.body?.audience || '');
  if (!['guest', 'owner', 'vendor', 'team', 'unclassified'].includes(audience)) {
    return res.status(400).json({ error: 'audience must be guest|owner|vendor|team|unclassified' });
  }
  try {
    const { rows } = await query(
      `UPDATE email_threads
       SET classified_audience = $1,
           classified_by = 'manual',
           classified_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING id, classified_audience`,
      [audience, req.params.id, req.tenantId],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Thread not found' });
    // Update the cache for the dominant sender so future messages
    // from them classify the same way.
    const { rows: senderRows } = await query(
      `SELECT from_email FROM email_messages
       WHERE thread_id = $1
       GROUP BY from_email
       ORDER BY COUNT(*) DESC LIMIT 1`,
      [req.params.id],
    );
    if (senderRows.length > 0) {
      await query(
        `INSERT INTO email_classification_cache
           (tenant_id, sender_email, classified_audience, classifier, reason)
         VALUES ($1, $2, $3, 'manual', 'manual override via /threads/:id/reclassify')
         ON CONFLICT (tenant_id, sender_email) DO UPDATE SET
           classified_audience = EXCLUDED.classified_audience,
           classifier = 'manual',
           reason = EXCLUDED.reason,
           classified_at = NOW()`,
        [req.tenantId, senderRows[0].from_email.toLowerCase(), audience],
      );
    }
    res.json({ thread: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Pub/Sub push receiver ────────────────────────────────────────
// No attachIdentity — Google sends an anonymous push. Production
// deployment should add a verifier on X-Goog-Iap-Jwt-Assertion or use
// a Pub/Sub push subscription that's gated by VPC ACL.

router.post('/pubsub/push', express.json(), watcher.handlePush);

module.exports = { router };
