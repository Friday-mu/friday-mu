'use strict';

// Wrapped Gmail API client — per-user requests using a fresh access
// token (refreshed from the encrypted refresh_token on demand).
//
// Status: PARKED on Ishant creating the GCP OAuth client. Until that
// lands the client can't reach gmail.googleapis.com (the only way to
// get a working access_token is to complete the OAuth flow).
//
// What this module does once wired:
//   - getValidAccessToken(account): returns a non-expired access token,
//     refreshing from refresh_token via Google's token endpoint when
//     access_token_expires_at <= now() + 60s.
//   - listMessages(account, opts): GET /gmail/v1/users/me/messages
//     with q + pageToken + history_id filtering.
//   - getMessage(account, id): GET /gmail/v1/users/me/messages/:id
//     with format=full to get headers + body parts.
//   - sendMessage(account, body): POST /gmail/v1/users/me/messages/send
//     with a multipart/mime body. Needed when Friday sends outbound
//     email replies (unified outbound abstraction will route here).
//   - watch(account, topicName): POST /gmail/v1/users/me/watch to
//     register Pub/Sub push notifications. Returns historyId + expiration.
//   - stopWatch(account): POST /gmail/v1/users/me/stop.
//
// Implementation note: doing this with raw fetch instead of pulling in
// the `googleapis` package — keeps deps small + lets us see exactly
// what we're sending on the wire. Switch to googleapis when scope
// grows (calendar, drive, etc.).

const { decrypt, encrypt } = require('./crypto_helper');
const { query } = require('../database/client');
const { getConfig } = require('./oauth');

/**
 * Return a valid access token for the given account, refreshing if
 * within 60s of expiry. Writes the new token back to the row.
 */
async function getValidAccessToken(account) {
  const now = Date.now();
  const exp = account.access_token_expires_at ? new Date(account.access_token_expires_at).getTime() : 0;
  if (exp > now + 60_000 && account.access_token_encrypted) {
    return decrypt(account.access_token_encrypted);
  }
  if (!account.refresh_token_encrypted) {
    throw new Error('No refresh_token on file for this account; re-run OAuth init');
  }
  const c = getConfig();
  const refreshToken = decrypt(account.refresh_token_encrypted);
  const body = new URLSearchParams({
    client_id: c.clientId,
    client_secret: c.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token refresh failed: ${resp.status} ${text}`);
  }
  const { access_token, expires_in } = await resp.json();
  const expiresAt = new Date(now + ((expires_in || 3600) * 1000)).toISOString();
  await query(
    `UPDATE email_accounts
     SET access_token_encrypted = $1,
         access_token_expires_at = $2,
         updated_at = NOW()
     WHERE id = $3`,
    [encrypt(access_token), expiresAt, account.id],
  );
  return access_token;
}

async function gmailGet(account, path, params = {}) {
  const token = await getValidAccessToken(account);
  const qs = new URLSearchParams(params).toString();
  const url = `https://gmail.googleapis.com/gmail/v1${path}${qs ? `?${qs}` : ''}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gmail ${path} ${resp.status}: ${text}`);
  }
  return resp.json();
}

async function listMessages(account, opts = {}) {
  return gmailGet(account, '/users/me/messages', {
    maxResults: opts.maxResults || 50,
    ...(opts.q ? { q: opts.q } : {}),
    ...(opts.pageToken ? { pageToken: opts.pageToken } : {}),
    ...(opts.labelIds ? { labelIds: Array.isArray(opts.labelIds) ? opts.labelIds.join(',') : opts.labelIds } : {}),
  });
}

async function getMessage(account, id, format = 'full') {
  return gmailGet(account, `/users/me/messages/${id}`, { format });
}

/**
 * List history events since lastHistoryId — basis for incremental
 * sync after the initial backfill.
 */
async function listHistory(account, startHistoryId) {
  return gmailGet(account, '/users/me/history', {
    startHistoryId,
    historyTypes: 'messageAdded',
  });
}

/**
 * Register a Gmail watch — Pub/Sub topic name passed from env.
 * Expires in 7 days max; the pull worker re-arms before expiry.
 */
async function startWatch(account, topicName) {
  const token = await getValidAccessToken(account);
  const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topicName,
      labelIds: ['INBOX'],
      labelFilterAction: 'include',
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gmail watch ${resp.status}: ${text}`);
  }
  return resp.json(); // { historyId, expiration (ms epoch) }
}

module.exports = {
  getValidAccessToken,
  listMessages,
  getMessage,
  listHistory,
  startWatch,
};
