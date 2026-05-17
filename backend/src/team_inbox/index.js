'use strict';

// /api/team — internal team chat. Channels + DMs + messages + read
// receipts + reactions. Backs TeamInbox.tsx — replaces the
// fixture-era empty-array shims from 2026-05-13.
//
// Endpoints (auth via attachIdentity; tenant-scoped):
//
//   Channels
//   --------
//   GET    /api/team/channels                       List channels visible
//                                                   to caller (public +
//                                                   private-where-member)
//   GET    /api/team/channels/:id                   Channel detail incl.
//                                                   members + unread count
//   POST   /api/team/channels/:id/members           Add a user (admin only)
//   DELETE /api/team/channels/:id/members/:userId   Remove a user (admin only)
//   GET    /api/team/channels/:id/messages          List messages
//                                                   (paginated, recent-first)
//   POST   /api/team/channels/:id/messages          Send a message
//   POST   /api/team/channels/:id/read              Mark all current
//                                                   messages as read
//
//   DMs
//   ---
//   GET    /api/team/dms                            List the caller's DMs
//                                                   (most-recent first)
//   POST   /api/team/dms                            Create or fetch a DM
//                                                   thread with a given
//                                                   participant set
//   GET    /api/team/dms/:id/messages               List DM messages
//   POST   /api/team/dms/:id/messages               Send a DM message
//   POST   /api/team/dms/:id/read                   Mark all read
//
//   Read receipts + reactions (per-message)
//   ---------------------------------------
//   GET    /api/team/messages/:kind/:id/reads       Who's seen this
//   GET    /api/team/messages/:kind/:id/reactions   Aggregated reactions
//   POST   /api/team/messages/:kind/:id/reactions   Add a reaction
//   DELETE /api/team/messages/:kind/:id/reactions/:emoji  Remove
//
//   Users
//   -----
//   GET    /api/team/users                          List tenant users
//                                                   (for @mention picker +
//                                                   DM target selection)
//
// kind = 'channel' | 'dm' (route param distinguishes which table the
// message id lives in — messages are split across two tables).
//
// V1 features: text + @mentions + last-seen-at + polling. Threading
// works at the schema level (parent_message_id column) but the UI
// won't surface it until Day 2-3. Reactions land in Day 2-3 too;
// the endpoints exist now so the frontend can land in lockstep.
//
// New-user channel autojoin: every authenticated request triggers a
// best-effort "join all public channels" insert at the top of the
// handler so users created post-migration aren't excluded from the
// seed.

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');

const router = express.Router();

// ─── Reaction emoji set ────────────────────────────────────────────
// Three semantic reactions per Ishant's spec. Adding a fourth later
// is a 1-line change here + an icon in the UI. Storing as text (not
// enum) for forward-compat.
const VALID_REACTIONS = new Set(['👀', '✅', '🙋']);

// ─── Helpers ────────────────────────────────────────────────────────

/** Sorted UUID list joined by '|' — deterministic key for DM dedup. */
function dmSignature(userIds) {
  return [...new Set(userIds)].sort().join('|');
}

/** Best-effort join of the caller to every public channel they're
 *  not yet a member of. Catches edge cases where a user was created
 *  after the migration seed ran (no per-user backfill hook elsewhere).
 *  Runs as a single INSERT ... SELECT ON CONFLICT DO NOTHING. */
async function autojoinPublicChannels(tenantId, userId) {
  if (!tenantId || !userId) return;
  try {
    await query(
      `INSERT INTO team_channel_members (channel_id, user_id, role)
       SELECT c.id, $2, 'member'
       FROM team_channels c
       WHERE c.tenant_id = $1
         AND c.visibility = 'public'
         AND c.archived_at IS NULL
       ON CONFLICT (channel_id, user_id) DO NOTHING`,
      [tenantId, userId],
    );
  } catch (e) {
    // Non-fatal — let the request proceed even if autojoin fails
    // (e.g., transient DB hiccup). The user just sees fewer channels
    // until their next request retries.
    console.warn('[team_inbox] autojoinPublicChannels failed:', e.message);
  }
}

/** Verify the caller is a member of the given channel (any role). */
async function isChannelMember(channelId, userId) {
  const { rows } = await query(
    `SELECT 1 FROM team_channel_members WHERE channel_id = $1 AND user_id = $2 LIMIT 1`,
    [channelId, userId],
  );
  return rows.length > 0;
}

/** Verify the caller is a channel admin (for membership management). */
async function isChannelAdmin(channelId, userId) {
  const { rows } = await query(
    `SELECT 1 FROM team_channel_members
     WHERE channel_id = $1 AND user_id = $2 AND role = 'admin' LIMIT 1`,
    [channelId, userId],
  );
  return rows.length > 0;
}

function shapeChannel(row, unreadCount = 0) {
  return {
    id: row.id,
    key: row.channel_key,
    name: row.name,
    purpose: row.purpose,
    visibility: row.visibility,
    preserveUploadQuality: row.preserve_upload_quality,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    unread: Number(unreadCount) || 0,
  };
}

function shapeMessage(row, kind) {
  return {
    id: row.id,
    kind: row.kind || 'text',
    channelKey: row.channel_key || undefined,
    dmId: kind === 'dm' ? row.dm_id : undefined,
    authorId: row.author_user_id,
    authorName: row.author_display_name,
    text: row.text,
    mentions: row.mention_user_ids || [],
    parentMessageId: row.parent_message_id,
    meta: row.meta || null,
    editedAt: row.edited_at,
    ts: row.created_at,
  };
}

function shapeUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
  };
}

// ─── Channels ───────────────────────────────────────────────────────

// List channels visible to caller (every public channel in the tenant +
// every private channel the caller is a member of). Unread count per
// channel computed in the same query against team_message_reads.
router.get('/channels', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  await autojoinPublicChannels(req.tenantId, userId);
  try {
    const { rows } = await query(
      `SELECT c.*,
              COALESCE(unread.cnt, 0) AS unread_cnt
       FROM team_channels c
       JOIN team_channel_members m
         ON m.channel_id = c.id AND m.user_id = $2
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS cnt
         FROM team_channel_messages msg
         WHERE msg.channel_id = c.id
           AND msg.deleted_at IS NULL
           AND msg.author_user_id <> $2
           AND NOT EXISTS (
             SELECT 1 FROM team_message_reads r
             WHERE r.user_id = $2 AND r.message_id = msg.id AND r.message_kind = 'channel'
           )
       ) unread ON TRUE
       WHERE c.tenant_id = $1 AND c.archived_at IS NULL
       ORDER BY c.created_at`,
      [req.tenantId, userId],
    );
    res.json({ channels: rows.map((r) => shapeChannel(r, r.unread_cnt)) });
  } catch (e) {
    console.error('[team_inbox] list channels error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Channel detail incl. members. Used by the right-rail member list.
router.get('/channels/:id', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  try {
    const { rows: chRows } = await query(
      `SELECT * FROM team_channels WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenantId],
    );
    if (chRows.length === 0) return res.status(404).json({ error: 'Channel not found' });
    const ch = chRows[0];
    if (ch.visibility === 'private') {
      const member = await isChannelMember(ch.id, userId);
      if (!member) return res.status(403).json({ error: 'Not a member of this channel' });
    }
    const { rows: memRows } = await query(
      `SELECT u.id, u.username, u.display_name, u.email, u.role, m.role AS channel_role, m.joined_at
       FROM team_channel_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.channel_id = $1
       ORDER BY u.display_name`,
      [ch.id],
    );
    res.json({
      channel: shapeChannel(ch),
      members: memRows.map((r) => ({
        ...shapeUser(r),
        channelRole: r.channel_role,
        joinedAt: r.joined_at,
      })),
    });
  } catch (e) {
    console.error('[team_inbox] channel detail error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Add a member (admin only).
router.post('/channels/:id/members', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  const targetUserId = req.body?.userId;
  if (!targetUserId) return res.status(400).json({ error: 'userId required' });
  try {
    const admin = await isChannelAdmin(req.params.id, userId);
    if (!admin) return res.status(403).json({ error: 'Channel admin required' });
    const { rows: targetRows } = await query(
      `SELECT id FROM users WHERE id = $1 AND tenant_id = $2`,
      [targetUserId, req.tenantId],
    );
    if (targetRows.length === 0) return res.status(404).json({ error: 'User not in tenant' });
    await query(
      `INSERT INTO team_channel_members (channel_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (channel_id, user_id) DO NOTHING`,
      [req.params.id, targetUserId, req.body?.role === 'admin' ? 'admin' : 'member'],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[team_inbox] add member error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/channels/:id/members/:userId', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  try {
    const admin = await isChannelAdmin(req.params.id, userId);
    if (!admin) return res.status(403).json({ error: 'Channel admin required' });
    await query(
      `DELETE FROM team_channel_members WHERE channel_id = $1 AND user_id = $2`,
      [req.params.id, req.params.userId],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[team_inbox] remove member error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// List channel messages — most-recent first, paginated.
//   ?before=<iso> — return messages with created_at < before
//   ?limit=N (default 50, max 200)
router.get('/channels/:id/messages', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  try {
    const { rows: chRows } = await query(
      `SELECT id, visibility, channel_key FROM team_channels WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenantId],
    );
    if (chRows.length === 0) return res.status(404).json({ error: 'Channel not found' });
    const ch = chRows[0];
    if (ch.visibility === 'private') {
      const member = await isChannelMember(ch.id, userId);
      if (!member) return res.status(403).json({ error: 'Not a member of this channel' });
    }
    const before = req.query.before ? new Date(String(req.query.before)) : null;
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || 50), 10) || 50));
    const params = [ch.id];
    let sql =
      `SELECT msg.*, $${params.length + 1}::text AS channel_key
       FROM team_channel_messages msg
       WHERE msg.channel_id = $1 AND msg.deleted_at IS NULL`;
    params.push(ch.channel_key);
    if (before && !Number.isNaN(before.getTime())) {
      sql += ` AND msg.created_at < $${params.length + 1}`;
      params.push(before.toISOString());
    }
    sql += ` ORDER BY msg.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    const { rows } = await query(sql, params);
    res.json({ messages: rows.map((r) => shapeMessage(r, 'channel')).reverse() });
  } catch (e) {
    console.error('[team_inbox] channel messages error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Send a channel message. Validates @mentions are channel members.
router.post('/channels/:id/messages', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  const text = String(req.body?.text || '').trim();
  if (!text && req.body?.kind === 'text') {
    return res.status(400).json({ error: 'text required' });
  }
  const kind = req.body?.kind || 'text';
  const meta = req.body?.meta || null;
  const parentMessageId = req.body?.parentMessageId || null;
  let mentions = Array.isArray(req.body?.mentions) ? req.body.mentions : [];
  // Cap mention count and dedup. Validate they're real channel members.
  mentions = [...new Set(mentions)].slice(0, 50);
  try {
    const { rows: chRows } = await query(
      `SELECT id, visibility FROM team_channels WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenantId],
    );
    if (chRows.length === 0) return res.status(404).json({ error: 'Channel not found' });
    const ch = chRows[0];
    if (ch.visibility === 'private') {
      const member = await isChannelMember(ch.id, userId);
      if (!member) return res.status(403).json({ error: 'Not a member of this channel' });
    }
    // Drop mentions of non-members (channel might be private and the
    // mentioned user isn't in it; silently drop rather than 400).
    if (mentions.length > 0) {
      const { rows: valid } = await query(
        `SELECT user_id FROM team_channel_members WHERE channel_id = $1 AND user_id = ANY($2::uuid[])`,
        [ch.id, mentions],
      );
      const validSet = new Set(valid.map((v) => v.user_id));
      mentions = mentions.filter((m) => validSet.has(m));
    }
    const { rows: insRows } = await query(
      `INSERT INTO team_channel_messages
         (channel_id, author_user_id, author_display_name, text, mention_user_ids, kind, meta, parent_message_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [ch.id, userId, req.identity?.displayName || req.identity?.username || 'Unknown',
       text, mentions, kind, meta ? JSON.stringify(meta) : null, parentMessageId],
    );
    res.json({ message: shapeMessage(insRows[0], 'channel') });
  } catch (e) {
    console.error('[team_inbox] channel send error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Mark all currently-loaded messages in a channel as read.
// Body: { upToMessageId? } — if provided, only mark messages with
// id <= upToMessageId (handles "I scrolled to here" semantics). Else
// marks every message in the channel.
router.post('/channels/:id/read', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  try {
    const { rows: chRows } = await query(
      `SELECT id, visibility FROM team_channels WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenantId],
    );
    if (chRows.length === 0) return res.status(404).json({ error: 'Channel not found' });
    if (chRows[0].visibility === 'private') {
      const member = await isChannelMember(chRows[0].id, userId);
      if (!member) return res.status(403).json({ error: 'Not a member of this channel' });
    }
    // Insert read-receipts for every unread channel message. Conflict
    // = already marked; do nothing.
    await query(
      `INSERT INTO team_message_reads (user_id, message_id, message_kind)
       SELECT $1, msg.id, 'channel'
       FROM team_channel_messages msg
       WHERE msg.channel_id = $2 AND msg.deleted_at IS NULL
       ON CONFLICT (user_id, message_id) DO NOTHING`,
      [userId, chRows[0].id],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[team_inbox] channel read error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── DMs ───────────────────────────────────────────────────────────

// List the caller's DMs — recent-first.
router.get('/dms', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  try {
    const { rows } = await query(
      `SELECT dm.*,
              COALESCE(unread.cnt, 0) AS unread_cnt
       FROM team_dms dm
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS cnt
         FROM team_dm_messages msg
         WHERE msg.dm_id = dm.id
           AND msg.deleted_at IS NULL
           AND msg.author_user_id <> $2
           AND NOT EXISTS (
             SELECT 1 FROM team_message_reads r
             WHERE r.user_id = $2 AND r.message_id = msg.id AND r.message_kind = 'dm'
           )
       ) unread ON TRUE
       WHERE dm.tenant_id = $1
         AND $2 = ANY(dm.participant_user_ids)
       ORDER BY dm.last_message_at DESC`,
      [req.tenantId, userId],
    );
    res.json({
      dms: rows.map((r) => ({
        id: r.id,
        participantIds: r.participant_user_ids,
        unread: Number(r.unread_cnt) || 0,
        lastMessageAt: r.last_message_at,
      })),
    });
  } catch (e) {
    console.error('[team_inbox] list dms error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Create or fetch the DM thread with a given participant set.
// Body: { participantIds: [<user_id>, ...] }. Caller is auto-added.
router.post('/dms', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  const others = Array.isArray(req.body?.participantIds) ? req.body.participantIds : [];
  const participants = [...new Set([userId, ...others])];
  if (participants.length < 2) {
    return res.status(400).json({ error: 'Need at least one other participant' });
  }
  try {
    // Validate every participant belongs to this tenant
    const { rows: tenantUsers } = await query(
      `SELECT id FROM users WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
      [participants, req.tenantId],
    );
    if (tenantUsers.length !== participants.length) {
      return res.status(400).json({ error: 'One or more participants not in tenant' });
    }
    const sig = dmSignature(participants);
    // Upsert: if a DM with this exact participant set exists, return it.
    const { rows: existing } = await query(
      `SELECT * FROM team_dms WHERE tenant_id = $1 AND participant_signature = $2`,
      [req.tenantId, sig],
    );
    if (existing.length > 0) {
      const dm = existing[0];
      return res.json({
        dm: {
          id: dm.id,
          participantIds: dm.participant_user_ids,
          lastMessageAt: dm.last_message_at,
        },
      });
    }
    const { rows: ins } = await query(
      `INSERT INTO team_dms (tenant_id, participant_signature, participant_user_ids)
       VALUES ($1, $2, $3::uuid[])
       RETURNING *`,
      [req.tenantId, sig, participants],
    );
    res.json({
      dm: {
        id: ins[0].id,
        participantIds: ins[0].participant_user_ids,
        lastMessageAt: ins[0].last_message_at,
      },
    });
  } catch (e) {
    console.error('[team_inbox] dm create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/dms/:id/messages', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  try {
    const { rows: dmRows } = await query(
      `SELECT * FROM team_dms WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenantId],
    );
    if (dmRows.length === 0) return res.status(404).json({ error: 'DM not found' });
    const dm = dmRows[0];
    if (!dm.participant_user_ids.includes(userId)) {
      return res.status(403).json({ error: 'Not a participant' });
    }
    const before = req.query.before ? new Date(String(req.query.before)) : null;
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || 50), 10) || 50));
    const params = [dm.id];
    let sql =
      `SELECT msg.*, $${params.length + 1}::uuid AS dm_id
       FROM team_dm_messages msg
       WHERE msg.dm_id = $1 AND msg.deleted_at IS NULL`;
    params.push(dm.id);
    if (before && !Number.isNaN(before.getTime())) {
      sql += ` AND msg.created_at < $${params.length + 1}`;
      params.push(before.toISOString());
    }
    sql += ` ORDER BY msg.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    const { rows } = await query(sql, params);
    res.json({ messages: rows.map((r) => shapeMessage(r, 'dm')).reverse() });
  } catch (e) {
    console.error('[team_inbox] dm messages error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/dms/:id/messages', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  const text = String(req.body?.text || '').trim();
  if (!text && req.body?.kind === 'text') {
    return res.status(400).json({ error: 'text required' });
  }
  const kind = req.body?.kind || 'text';
  const meta = req.body?.meta || null;
  const parentMessageId = req.body?.parentMessageId || null;
  const mentions = Array.isArray(req.body?.mentions)
    ? [...new Set(req.body.mentions)].slice(0, 50)
    : [];
  try {
    const { rows: dmRows } = await query(
      `SELECT * FROM team_dms WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenantId],
    );
    if (dmRows.length === 0) return res.status(404).json({ error: 'DM not found' });
    const dm = dmRows[0];
    if (!dm.participant_user_ids.includes(userId)) {
      return res.status(403).json({ error: 'Not a participant' });
    }
    const { rows: ins } = await query(
      `INSERT INTO team_dm_messages
         (dm_id, author_user_id, author_display_name, text, mention_user_ids, kind, meta, parent_message_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [dm.id, userId, req.identity?.displayName || req.identity?.username || 'Unknown',
       text, mentions, kind, meta ? JSON.stringify(meta) : null, parentMessageId],
    );
    // Bump last_message_at so the DM list orders correctly.
    await query(
      `UPDATE team_dms SET last_message_at = NOW() WHERE id = $1`,
      [dm.id],
    );
    res.json({ message: shapeMessage({ ...ins[0], dm_id: dm.id }, 'dm') });
  } catch (e) {
    console.error('[team_inbox] dm send error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/dms/:id/read', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  try {
    const { rows: dmRows } = await query(
      `SELECT * FROM team_dms WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenantId],
    );
    if (dmRows.length === 0) return res.status(404).json({ error: 'DM not found' });
    if (!dmRows[0].participant_user_ids.includes(userId)) {
      return res.status(403).json({ error: 'Not a participant' });
    }
    await query(
      `INSERT INTO team_message_reads (user_id, message_id, message_kind)
       SELECT $1, msg.id, 'dm'
       FROM team_dm_messages msg
       WHERE msg.dm_id = $2 AND msg.deleted_at IS NULL
       ON CONFLICT (user_id, message_id) DO NOTHING`,
      [userId, dmRows[0].id],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[team_inbox] dm read error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Per-message read receipts (UI popover: who's seen this) ────────

router.get('/messages/:kind/:id/reads', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  const kind = req.params.kind;
  if (kind !== 'channel' && kind !== 'dm') {
    return res.status(400).json({ error: 'kind must be channel or dm' });
  }
  try {
    const { rows } = await query(
      `SELECT u.id, u.display_name, u.username, r.read_at
       FROM team_message_reads r
       JOIN users u ON u.id = r.user_id
       WHERE r.message_id = $1 AND r.message_kind = $2 AND u.tenant_id = $3
       ORDER BY r.read_at`,
      [req.params.id, kind, req.tenantId],
    );
    res.json({
      reads: rows.map((r) => ({
        userId: r.id,
        displayName: r.display_name,
        username: r.username,
        readAt: r.read_at,
      })),
    });
  } catch (e) {
    console.error('[team_inbox] reads list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Reactions ──────────────────────────────────────────────────────

router.get('/messages/:kind/:id/reactions', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  const kind = req.params.kind;
  if (kind !== 'channel' && kind !== 'dm') {
    return res.status(400).json({ error: 'kind must be channel or dm' });
  }
  try {
    const { rows } = await query(
      `SELECT u.id AS user_id, u.display_name, r.emoji
       FROM team_message_reactions r
       JOIN users u ON u.id = r.user_id
       WHERE r.message_id = $1 AND r.message_kind = $2 AND u.tenant_id = $3
       ORDER BY r.created_at`,
      [req.params.id, kind, req.tenantId],
    );
    // Aggregate by emoji: { '👀': [{userId, displayName}, ...], '✅': [...] }
    const grouped = {};
    for (const r of rows) {
      if (!grouped[r.emoji]) grouped[r.emoji] = [];
      grouped[r.emoji].push({ userId: r.user_id, displayName: r.display_name });
    }
    res.json({ reactions: grouped });
  } catch (e) {
    console.error('[team_inbox] reactions list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/messages/:kind/:id/reactions', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  const kind = req.params.kind;
  const emoji = String(req.body?.emoji || '');
  if (kind !== 'channel' && kind !== 'dm') {
    return res.status(400).json({ error: 'kind must be channel or dm' });
  }
  if (!VALID_REACTIONS.has(emoji)) {
    return res.status(400).json({ error: `emoji must be one of ${[...VALID_REACTIONS].join(' ')}` });
  }
  try {
    await query(
      `INSERT INTO team_message_reactions (user_id, message_id, message_kind, emoji)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, message_id, emoji) DO NOTHING`,
      [userId, req.params.id, kind, emoji],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[team_inbox] reaction add error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/messages/:kind/:id/reactions/:emoji', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  try {
    await query(
      `DELETE FROM team_message_reactions
       WHERE user_id = $1 AND message_id = $2 AND message_kind = $3 AND emoji = $4`,
      [userId, req.params.id, req.params.kind, req.params.emoji],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[team_inbox] reaction remove error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Search ────────────────────────────────────────────────────────
// Postgres full-text search over channel messages + DM messages the
// caller has access to. Returns hits with channel/DM context for
// the result-card UI. File search hooks in later (Day 2-3 when file
// uploads ship; separate `team_file_attachments` table will get its
// own tsvector).
//
// GET /api/team/search?q=<query>&limit=N
//
// Result shape:
//   {
//     hits: [
//       { kind: 'channel'|'dm', channelId/dmId, messageId,
//         authorName, text, ts, channelKey?, channelName?,
//         participantIds?, rank }
//     ]
//   }
//
// Ranking uses ts_rank_cd on the tsvector + the query. Hits ordered
// by rank DESC then created_at DESC. Limit caps at 100 results.

router.get('/search', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  const q = String(req.query.q || '').trim();
  if (q.length < 2) {
    return res.json({ hits: [], note: 'query must be at least 2 characters' });
  }
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || 30), 10) || 30));
  try {
    // websearch_to_tsquery handles natural-language queries with
    // quotes, OR, etc. Falls back to plainto_tsquery for safety.
    const { rows: channelHits } = await query(
      `WITH q AS (SELECT websearch_to_tsquery('english', $1) AS tsq)
       SELECT msg.id          AS message_id,
              msg.channel_id,
              msg.author_display_name,
              msg.text,
              msg.created_at,
              c.channel_key,
              c.name          AS channel_name,
              ts_rank_cd(msg.text_tsv, q.tsq) AS rank
       FROM team_channel_messages msg
       JOIN team_channels c ON c.id = msg.channel_id
       JOIN team_channel_members mem ON mem.channel_id = c.id AND mem.user_id = $2
       CROSS JOIN q
       WHERE c.tenant_id = $3
         AND msg.deleted_at IS NULL
         AND c.archived_at IS NULL
         AND msg.text_tsv @@ q.tsq
       ORDER BY rank DESC, msg.created_at DESC
       LIMIT $4`,
      [q, userId, req.tenantId, limit],
    );

    const { rows: dmHits } = await query(
      `WITH q AS (SELECT websearch_to_tsquery('english', $1) AS tsq)
       SELECT msg.id          AS message_id,
              msg.dm_id,
              msg.author_display_name,
              msg.text,
              msg.created_at,
              dm.participant_user_ids,
              ts_rank_cd(msg.text_tsv, q.tsq) AS rank
       FROM team_dm_messages msg
       JOIN team_dms dm ON dm.id = msg.dm_id
       CROSS JOIN q
       WHERE dm.tenant_id = $3
         AND $2 = ANY(dm.participant_user_ids)
         AND msg.deleted_at IS NULL
         AND msg.text_tsv @@ q.tsq
       ORDER BY rank DESC, msg.created_at DESC
       LIMIT $4`,
      [q, userId, req.tenantId, limit],
    );

    // Merge + re-rank across both kinds, then cap to limit.
    const hits = [
      ...channelHits.map((r) => ({
        kind: 'channel',
        channelId: r.channel_id,
        channelKey: r.channel_key,
        channelName: r.channel_name,
        messageId: r.message_id,
        authorName: r.author_display_name,
        text: r.text,
        ts: r.created_at,
        rank: Number(r.rank) || 0,
      })),
      ...dmHits.map((r) => ({
        kind: 'dm',
        dmId: r.dm_id,
        participantIds: r.participant_user_ids,
        messageId: r.message_id,
        authorName: r.author_display_name,
        text: r.text,
        ts: r.created_at,
        rank: Number(r.rank) || 0,
      })),
    ]
      .sort((a, b) => b.rank - a.rank || new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, limit);

    res.json({ hits });
  } catch (e) {
    console.error('[team_inbox] search error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Users (for @mention picker + DM target selection) ──────────────

router.get('/users', attachIdentity, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, username, display_name, email, role
       FROM users
       WHERE tenant_id = $1 AND is_active = TRUE
       ORDER BY display_name`,
      [req.tenantId],
    );
    res.json({ users: rows.map(shapeUser) });
  } catch (e) {
    console.error('[team_inbox] users list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = { router };
