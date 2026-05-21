'use strict';

// Email thread resolution — given an inbound message with headers +
// (optionally) a Gmail thread_id, find or create the email_threads
// row this message belongs to. Per locked decision §7, both signals
// are used in parallel:
//
//   1. Gmail thread_id (best-case, when message came via Gmail API).
//      Provider-scoped — Gmail's id only exists within that account.
//   2. Message-ID / References headers — cross-provider standard.
//      The reply chain via In-Reply-To + References stitches Outlook
//      replies into the same thread as the original Gmail message.
//
// Resolution order: thread_id first (cheap unique-index hit); fall
// back to header chain if no thread_id present or no row matches.
// Insert a new thread row if neither matches.

const { query } = require('../database/client');

/**
 * Resolve a thread for an inbound message. Returns the thread row.
 *
 * @param {object} args
 * @param {string} args.tenantId
 * @param {string} args.accountId
 * @param {string} [args.providerThreadId]  Gmail thread_id, if available
 * @param {string} [args.messageIdHeader]   RFC822 Message-ID header
 * @param {string} [args.inReplyToHeader]   RFC822 In-Reply-To header
 * @param {string[]} [args.references]      Parsed References header (array of Message-IDs)
 * @param {string}   [args.subject]         For new-thread subject
 * @param {string}   args.from              Sender email for participants seed
 * @param {string[]} [args.to]              Recipient emails
 * @param {Date}     args.sentAt
 */
async function resolveThread({
  tenantId,
  accountId,
  providerThreadId,
  messageIdHeader,
  inReplyToHeader,
  references,
  subject,
  from,
  to,
  sentAt,
}) {
  // 1. Gmail thread_id — unique per account.
  if (providerThreadId) {
    const { rows } = await query(
      `SELECT * FROM email_threads
       WHERE account_id = $1 AND provider_thread_id = $2`,
      [accountId, providerThreadId],
    );
    if (rows.length) return touch(rows[0], sentAt);
  }

  // 2. Header chain — match this message's In-Reply-To or any element
  //    of References against existing messages' message_id_header.
  //    If we find a match, return that message's thread.
  const candidateIds = [inReplyToHeader, ...(references || [])].filter(Boolean);
  if (candidateIds.length) {
    const { rows } = await query(
      `SELECT t.*
       FROM email_messages m
       JOIN email_threads t ON t.id = m.thread_id
       WHERE m.account_id = $1
         AND m.message_id_header = ANY($2::text[])
       ORDER BY t.last_message_at DESC
       LIMIT 1`,
      [accountId, candidateIds],
    );
    if (rows.length) return touch(rows[0], sentAt);
  }

  // 3. Fallback: this is the first message of a new thread.
  const participants = [
    ...(from ? [{ email: from.toLowerCase() }] : []),
    ...((to || []).map((e) => ({ email: String(e).toLowerCase() }))),
  ];
  const { rows: ins } = await query(
    `INSERT INTO email_threads (
       tenant_id, account_id, provider_thread_id, subject, participants,
       first_message_at, last_message_at, message_count
     ) VALUES ($1, $2, $3, $4, $5, $6, $6, 0)
     RETURNING *`,
    [tenantId, accountId, providerThreadId || null, subject || null,
     JSON.stringify(participants), sentAt],
  );
  return ins[0];
}

/**
 * Bump last_message_at + message_count. Used after appending a message
 * to an existing thread. Returns the updated row.
 */
async function touch(thread, sentAt) {
  const { rows } = await query(
    `UPDATE email_threads
     SET last_message_at = GREATEST(last_message_at, $2),
         message_count   = message_count + 1
     WHERE id = $1
     RETURNING *`,
    [thread.id, sentAt],
  );
  return rows[0];
}

/**
 * Parse an RFC822 References header into an array of Message-IDs.
 * Slack-style: `<a@x> <b@y> <c@z>` → ['<a@x>', '<b@y>', '<c@z>'].
 * Robust to whitespace, line folding, missing angle brackets.
 */
function parseReferences(raw) {
  if (!raw) return [];
  // Strip CRLF folding (continuation lines), then split on whitespace.
  const flat = String(raw).replace(/\r?\n\s+/g, ' ').trim();
  if (!flat) return [];
  // Tokenize on whitespace — Message-IDs themselves never contain
  // whitespace (CFWS comments aside, which we ignore).
  return flat
    .split(/\s+/)
    .map((tok) => tok.trim())
    .filter((tok) => tok.length > 0 && tok.includes('@'));
}

module.exports = {
  resolveThread,
  parseReferences,
};
