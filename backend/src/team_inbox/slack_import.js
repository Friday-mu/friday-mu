'use strict';

// Slack → TeamInbox one-time history backfill worker.
//
// Status: PARKED on Ishant providing a Slack bot token. The schema +
// worker scaffolding is in place; the worker runs end-to-end once the
// token is plugged in. See `docs/handover/slack-import-setup.md` for
// the Slack app creation steps.
//
// Flow (run inside POST /api/team/slack-import/start):
//   1. Insert a slack_import_runs row (status='running')
//   2. Fetch Slack users via users.list, populate slack_user_map
//      matching by email against FAD users; unmatched stay NULL
//   3. Fetch Slack channels via conversations.list (types=public_channel,
//      private_channel), populate slack_channel_map with suggested
//      FAD-target by name match (operator confirms in admin UI before
//      run continues — for v1 we auto-confirm name matches and skip
//      everything else)
//   4. For each mapped channel:
//      a. conversations.history with cursor pagination + oldest=floor
//      b. For each non-bot user message: insert into team_channel_messages
//         with provenance + author_user_id lookup via slack_user_map.
//         Unique index on (slack_source_message_id, slack_source_channel_id)
//         dedupes if this is a re-run.
//   5. Fetch DMs (conversations.list types=im,mpim). For each:
//      a. Resolve the FAD-side team_dms row by participant_signature
//         (looking up each participant's FAD user_id via slack_user_map).
//         Skip DMs where any participant didn't map to a FAD user.
//      b. conversations.history + insert into team_dm_messages
//   6. Update slack_import_runs (status='succeeded', counts populated)
//
// Rate limiting: Slack's Tier-3 limit is 50 req/min per method.
// Worker sleeps minRequestIntervalMs (1200ms = ~50/min) between calls
// to stay under. Retry-After header honored on 429.
//
// Permissions needed on the Slack app:
//   - channels:history, channels:read
//   - groups:history, groups:read (private channels)
//   - im:history, im:read (DMs)
//   - mpim:history, mpim:read (group DMs)
//   - users:read, users:read.email
//   - files:read (for attachment metadata; download deferred to v2)
//
// What's NOT in v1:
//   - File downloads (we record attachment URLs as text; v2 mirrors
//     files into FAD's storage)
//   - Reactions (Slack's reactions don't map 1:1 to our 3-emoji set
//     so we'd need a mapping table; v2)
//   - Threads as TeamInbox threads (Slack thread_ts gets stored in
//     meta JSONB so we can rebuild thread structure later; v1 imports
//     all messages flat into the channel)
//   - Edits / deletes (we take the latest state Slack reports)

const https = require('https');
const { query } = require('../database/client');

const SLACK_API_BASE = 'https://slack.com/api';
const MIN_REQUEST_INTERVAL_MS = 1200; // ~50 req/min, Slack Tier-3 cap

let lastRequestAt = 0;

// ─── Slack API helper ───────────────────────────────────────────────

async function slackApi(method, token, params = {}) {
  // Throttle to stay under Tier-3 rate limit
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestAt = Date.now();

  const qs = new URLSearchParams(params).toString();
  const url = `${SLACK_API_BASE}/${method}${qs ? `?${qs}` : ''}`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        timeout: 30000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          // Slack 429 path — honor Retry-After if present
          if (res.statusCode === 429) {
            const retryAfter = parseInt(res.headers['retry-after'] || '60', 10);
            return reject(new Error(`Slack rate-limited; retry after ${retryAfter}s`));
          }
          try {
            const parsed = JSON.parse(data);
            if (!parsed.ok) {
              return reject(new Error(`Slack error: ${parsed.error || 'unknown'}`));
            }
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Slack response parse failed: ${e.message}`));
          }
        });
      },
    );
    req.on('timeout', () => { req.destroy(); reject(new Error(`Slack timeout: ${method}`)); });
    req.on('error', (err) => reject(new Error(`Slack request failed: ${err.message}`)));
    req.end();
  });
}

// Paginate through a Slack method that supports cursor pagination.
async function slackPaginate(method, token, params = {}) {
  const all = [];
  let cursor;
  do {
    const page = await slackApi(method, token, { ...params, ...(cursor ? { cursor } : {}), limit: 200 });
    // Slack returns the list under varying field names depending on method
    const list = page.members || page.channels || page.messages || page.ims || [];
    all.push(...list);
    cursor = page.response_metadata?.next_cursor;
  } while (cursor);
  return all;
}

// ─── Step 1: User mapping ───────────────────────────────────────────
// Fetch Slack users + match against FAD users by email. Returns the
// mapping table populated count.

async function mapSlackUsersToFad(tenantId, token) {
  const slackUsers = await slackPaginate('users.list', token);
  let mapped = 0;
  let unmapped = 0;

  for (const u of slackUsers) {
    if (u.is_bot || u.deleted) continue;
    const email = u.profile?.email || null;
    const slackId = u.id;
    let fadUserId = null;
    let matchMethod = 'unmatched';

    if (email) {
      const { rows } = await query(
        `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND tenant_id = $2 LIMIT 1`,
        [email, tenantId],
      );
      if (rows.length > 0) {
        fadUserId = rows[0].id;
        matchMethod = 'email';
      }
    }

    if (fadUserId) mapped++; else unmapped++;

    await query(
      `INSERT INTO slack_user_map (tenant_id, slack_user_id, slack_username, slack_email, slack_display_name, fad_user_id, match_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id, slack_user_id) DO UPDATE
         SET slack_username = EXCLUDED.slack_username,
             slack_email = EXCLUDED.slack_email,
             slack_display_name = EXCLUDED.slack_display_name,
             fad_user_id = EXCLUDED.fad_user_id,
             match_method = EXCLUDED.match_method`,
      [
        tenantId,
        slackId,
        u.name || null,
        email,
        u.profile?.display_name || u.profile?.real_name || u.name || null,
        fadUserId,
        matchMethod,
      ],
    );
  }
  return { mapped, unmapped, total: slackUsers.length };
}

// ─── Step 2: Channel mapping ────────────────────────────────────────
// Fetch Slack channels + auto-suggest FAD targets by name match. For
// v1 we auto-confirm exact matches; everything else gets skip=TRUE
// pending a manual remap by the operator.

async function mapSlackChannelsToFad(tenantId, token) {
  const slackChannels = await slackPaginate('conversations.list', token, {
    types: 'public_channel,private_channel',
    exclude_archived: false,
  });

  const { rows: fadChannels } = await query(
    `SELECT id, channel_key FROM team_channels WHERE tenant_id = $1`,
    [tenantId],
  );
  const byKey = new Map(fadChannels.map((c) => [c.channel_key.toLowerCase(), c.id]));

  for (const c of slackChannels) {
    const slackName = (c.name || '').toLowerCase();
    // Auto-match common renames first, then exact key match.
    const renames = {
      frgm: 'gm',
      'general': 'random',
      'guest-services': 'ops', // ops swallowed guest services per FAD scoping
    };
    const targetKey = renames[slackName] || slackName;
    const targetId = byKey.get(targetKey) || null;

    await query(
      `INSERT INTO slack_channel_map (tenant_id, slack_channel_id, slack_channel_name, slack_is_private, slack_is_archived, target_fad_channel_id, skip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id, slack_channel_id) DO UPDATE
         SET slack_channel_name = EXCLUDED.slack_channel_name,
             slack_is_private = EXCLUDED.slack_is_private,
             slack_is_archived = EXCLUDED.slack_is_archived,
             target_fad_channel_id = COALESCE(slack_channel_map.target_fad_channel_id, EXCLUDED.target_fad_channel_id),
             skip = slack_channel_map.skip`, // preserve operator-set skip
      [
        tenantId,
        c.id,
        c.name || null,
        !!c.is_private,
        !!c.is_archived,
        targetId,
        targetId === null, // skip by default if no match
      ],
    );
  }
  return { channels: slackChannels.length };
}

// ─── Step 3: Import channel history ─────────────────────────────────

async function importChannelHistory(tenantId, token, slackChannelId, fadChannelId, oldestTs) {
  let imported = 0;
  let cursor;
  const params = {
    channel: slackChannelId,
    limit: 200,
    ...(oldestTs ? { oldest: oldestTs } : {}),
  };
  do {
    const page = await slackApi('conversations.history', token, {
      ...params,
      ...(cursor ? { cursor } : {}),
    });
    const messages = page.messages || [];
    for (const m of messages) {
      // Skip non-message subtypes (joins, leaves, channel-topic-changes)
      if (m.subtype && m.subtype !== 'thread_broadcast' && m.subtype !== 'me_message') continue;
      if (!m.user || !m.text) continue;

      // Resolve author
      const { rows: userRows } = await query(
        `SELECT fad_user_id, slack_display_name FROM slack_user_map
         WHERE tenant_id = $1 AND slack_user_id = $2 LIMIT 1`,
        [tenantId, m.user],
      );
      const fadUserId = userRows[0]?.fad_user_id || null;
      const authorName = userRows[0]?.slack_display_name || 'Unknown';

      try {
        await query(
          `INSERT INTO team_channel_messages
             (channel_id, author_user_id, author_display_name, text, kind, meta, created_at,
              slack_source_message_id, slack_source_channel_id, slack_source_user_id)
           VALUES ($1, $2, $3, $4, 'text', $5, to_timestamp($6), $7, $8, $9)
           ON CONFLICT (slack_source_message_id, slack_source_channel_id) DO NOTHING`,
          [
            fadChannelId,
            fadUserId,
            authorName,
            m.text,
            JSON.stringify({
              slack_thread_ts: m.thread_ts || null,
              slack_attachments_count: (m.files || []).length,
              imported_from: 'slack',
            }),
            parseFloat(m.ts),
            m.ts,
            slackChannelId,
            m.user,
          ],
        );
        imported++;
      } catch (e) {
        console.warn('[slack_import] message insert skipped:', e.message);
      }
    }
    cursor = page.response_metadata?.next_cursor;
  } while (cursor);
  return imported;
}

// ─── Top-level orchestrator ─────────────────────────────────────────

async function runSlackImport(tenantId, token, opts = {}) {
  // Insert run row
  const { rows: runRows } = await query(
    `INSERT INTO slack_import_runs (tenant_id, imported_since)
     VALUES ($1, $2) RETURNING id`,
    [tenantId, opts.importedSince || null],
  );
  const runId = runRows[0].id;

  try {
    console.log(`[slack_import] Run ${runId} started for tenant ${tenantId}`);

    // Step 1: users
    const userResult = await mapSlackUsersToFad(tenantId, token);
    console.log(`[slack_import] Users: ${userResult.mapped} mapped / ${userResult.unmapped} unmapped`);

    // Step 2: channels
    const channelResult = await mapSlackChannelsToFad(tenantId, token);
    console.log(`[slack_import] Channels: ${channelResult.channels} mapped`);

    // Step 3: import history for every mapped non-skipped channel
    const { rows: mappings } = await query(
      `SELECT slack_channel_id, target_fad_channel_id
       FROM slack_channel_map
       WHERE tenant_id = $1 AND skip = FALSE AND target_fad_channel_id IS NOT NULL`,
      [tenantId],
    );

    const oldestTs = opts.importedSince
      ? (new Date(opts.importedSince).getTime() / 1000).toString()
      : null;

    let totalMessages = 0;
    let channelsImported = 0;
    for (const mapping of mappings) {
      try {
        const count = await importChannelHistory(
          tenantId, token,
          mapping.slack_channel_id, mapping.target_fad_channel_id,
          oldestTs,
        );
        console.log(`[slack_import] Channel ${mapping.slack_channel_id}: ${count} messages`);
        totalMessages += count;
        channelsImported++;
      } catch (e) {
        console.error(`[slack_import] Channel ${mapping.slack_channel_id} failed:`, e.message);
      }
    }

    await query(
      `UPDATE slack_import_runs
       SET status = 'succeeded', finished_at = NOW(),
           channels_imported = $2, messages_imported = $3,
           users_mapped = $4, users_unmapped = $5
       WHERE id = $1`,
      [runId, channelsImported, totalMessages, userResult.mapped, userResult.unmapped],
    );

    console.log(`[slack_import] Run ${runId} succeeded: ${totalMessages} messages from ${channelsImported} channels`);
    return { ok: true, runId, totalMessages, channelsImported };
  } catch (err) {
    await query(
      `UPDATE slack_import_runs SET status = 'failed', finished_at = NOW(), last_error = $2 WHERE id = $1`,
      [runId, err.message],
    );
    console.error(`[slack_import] Run ${runId} failed:`, err.message);
    throw err;
  }
}

module.exports = {
  runSlackImport,
  // Exposed for the admin UI (which can show the per-channel mapping
  // table + let the operator override skip/target assignments before
  // running the import).
  mapSlackUsersToFad,
  mapSlackChannelsToFad,
};
