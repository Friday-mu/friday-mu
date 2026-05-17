'use strict';

// Cloud Pub/Sub push receiver — Gmail pushes a notification to our
// endpoint each time a new message lands. We then call history.list
// against the account's lastHistoryId to fetch the actual changes
// (Gmail's push notifications don't carry message bodies for security).
//
// Status: PARKED on Ishant creating the GCP OAuth client + Pub/Sub
// topic + push subscription. The endpoint exists now so the topic
// configuration in GCP console can target it from day one.
//
// Push subscription must be configured with:
//   - Endpoint URL: https://gms.friday.mu/api/email/pubsub/push
//   - Authentication: Push token validates a JWT in the
//     X-Goog-Iap-Jwt-Assertion header (skipped in dev).
//
// Notification payload (base64-encoded `data` field):
//   { "emailAddress": "user@friday.mu", "historyId": "12345678" }
//
// We resolve the email_account by email_address, then call
// gmail_client.listHistory(account, account.history_id), fetch each
// new message via getMessage, persist it.

const { query } = require('../database/client');
// gmail_client + thread/classifier wiring: loaded lazily so module
// load doesn't error when GCP env vars are missing.

/**
 * Handle a single Pub/Sub push notification. Express handler.
 * Pub/Sub expects a 200 response on success; non-200 triggers retry.
 */
async function handlePush(req, res) {
  try {
    const msg = req.body?.message;
    if (!msg?.data) {
      return res.status(400).json({ error: 'malformed Pub/Sub message' });
    }
    const decoded = Buffer.from(msg.data, 'base64').toString('utf8');
    const { emailAddress, historyId } = JSON.parse(decoded);
    if (!emailAddress || !historyId) {
      return res.status(400).json({ error: 'missing emailAddress/historyId' });
    }

    // Find the account by email.
    const { rows } = await query(
      `SELECT * FROM email_accounts
       WHERE email_address = $1 AND allowed = TRUE
       LIMIT 1`,
      [emailAddress.toLowerCase()],
    );
    if (rows.length === 0) {
      // Not an authorised account — ignore + ack so Pub/Sub stops
      // retrying. Logged for diagnostics.
      console.warn(`[email/watcher] push for unknown account: ${emailAddress}`);
      return res.json({ ok: true, note: 'unknown account' });
    }

    // TODO: actual sync. Steps once GCP is wired:
    //   1. require('./sync').ingestNewMessages(account, historyId)
    //   2. ingestNewMessages calls gmailClient.listHistory(account,
    //      account.history_id) to enumerate new messageIds.
    //   3. For each new id: getMessage(account, id, 'full'),
    //      parse headers + body, resolveThread(), classifyEmail(),
    //      insert email_messages row.
    //   4. Update email_accounts.history_id to the highest seen.
    res.json({ ok: true, note: 'sync not yet wired — schema + handler ready' });
  } catch (e) {
    console.error('[email/watcher] push error:', e.message);
    res.status(500).json({ error: e.message });
  }
}

module.exports = { handlePush };
