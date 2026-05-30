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
//   GET    /api/team/messages/:kind/:id/replies     Thread replies for parent
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
// V1 features: text + @mentions + last-seen-at + polling. Threading:
// list endpoints return top-level messages only (parent_message_id IS
// NULL) with a reply_count subquery; thread replies are fetched on
// demand via /messages/:kind/:id/replies. Reactions land alongside.
//
// New-user channel autojoin: every authenticated request triggers a
// best-effort "join all public channels" insert at the top of the
// handler so users created post-migration aren't excluded from the
// seed.

const express = require('express');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const multer = require('multer');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');
const { notifyUsers, publishFadEvent } = require('../realtime');
const {
  isUuid,
  matchDesignProjectFromText,
  normalizeProjectForMeta,
} = require('./design_project_linker');

const router = express.Router();

// ─── Attachment storage config ─────────────────────────────────────
// Public nginx static serve under /uploads/team/... per locked
// decision §8 + Ishant 2026-05-18 nod (attachments-as-company-info,
// terms-of-use govern misuse). Writes under the fad-uploads root, NOT
// the FAD_UPLOAD_DIR env (which is design-photos-specific and points
// at .../photos on prod) — a separate TEAM_UPLOAD_DIR env keeps them
// independent.
const DEFAULT_UPLOAD_DIR = process.env.NODE_ENV === 'production'
  ? '/var/www/fad-uploads'
  : path.join(process.cwd(), 'uploads');
const UPLOAD_DIR = process.env.TEAM_UPLOAD_DIR || DEFAULT_UPLOAD_DIR;
const TEAM_UPLOAD_SUBDIR = 'team';
const TEAM_UPLOAD_URL_PREFIX = '/uploads/team';
const MAX_ATTACHMENT_BYTES = parseInt(process.env.TEAM_ATTACHMENT_MAX_BYTES || String(25 * 1024 * 1024), 10);

try { fs.mkdirSync(path.join(UPLOAD_DIR, TEAM_UPLOAD_SUBDIR), { recursive: true }); } catch (e) {
  console.warn('[team_inbox] could not pre-create upload dir:', e.message);
}

// Disk storage with deterministic UUID filenames. Multer processes
// the file stream before req.body, so we read target id from req.params.
// req._targetKind is set by the per-route setTargetKind() middleware
// since multer can't tell channel vs DM from the route alone.
const attachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const targetKind = req._targetKind || 'unknown';
    const targetId = req.params.id || 'unknown';
    const dest = path.join(UPLOAD_DIR, TEAM_UPLOAD_SUBDIR, targetKind, targetId);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 8) || '';
    cb(null, `${randomUUID()}${ext}`);
  },
});

const attachmentUploader = multer({
  storage: attachmentStorage,
  limits: { fileSize: MAX_ATTACHMENT_BYTES },
  // Public team channel — no MIME filter. Operator-internal; abuse
  // covered by terms of use, not technical gating.
});

function setTargetKind(kind) {
  return (req, _res, next) => { req._targetKind = kind; next(); };
}

// ─── Reaction emoji set ────────────────────────────────────────────
// Three semantic reactions per Ishant's spec. Adding a fourth later
// is a 1-line change here + an icon in the UI. Storing as text (not
// enum) for forward-compat.
const VALID_REACTIONS = new Set(['👀', '✅', '🙋']);

// ─── Helpers ────────────────────────────────────────────────────────

const REQUIRED_PUBLIC_CHANNELS = [
  {
    key: 'design',
    name: 'Design',
    purpose: 'Interior design projects, selections, owner approvals, procurement, and execution coordination',
    preserveUploadQuality: false,
  },
];

/** Sorted UUID list joined by '|' — deterministic key for DM dedup. */
function dmSignature(userIds) {
  return [...new Set(userIds)].sort().join('|');
}

async function ensureRequiredPublicChannels(tenantId) {
  if (!tenantId) return;
  for (const ch of REQUIRED_PUBLIC_CHANNELS) {
    await query(
      `INSERT INTO team_channels (tenant_id, channel_key, name, purpose, visibility, preserve_upload_quality)
       VALUES ($1, $2, $3, $4, 'public', $5)
       ON CONFLICT (tenant_id, channel_key) DO UPDATE
         SET name = EXCLUDED.name,
             purpose = EXCLUDED.purpose,
             visibility = 'public',
             preserve_upload_quality = EXCLUDED.preserve_upload_quality,
             archived_at = NULL,
             updated_at = NOW()`,
      [tenantId, ch.key, ch.name, ch.purpose, ch.preserveUploadQuality],
    );
  }
}

/** Best-effort join of the caller to every public channel they're
 *  not yet a member of. Catches edge cases where a user was created
 *  after the migration seed ran (no per-user backfill hook elsewhere).
 *  Runs as a single INSERT ... SELECT ON CONFLICT DO NOTHING. */
async function autojoinPublicChannels(tenantId, userId) {
  if (!tenantId || !userId) return;
  try {
    await ensureRequiredPublicChannels(tenantId);
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
    // isMember = false only happens for system admins viewing a private
    // channel they haven't joined. Frontend uses this to bucket them
    // into "Private channels (join to participate)".
    isMember: row.is_member !== undefined ? !!row.is_member : true,
  };
}

function channelKeyFromName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function canManageChannels(identity) {
  const role = String(identity?.userRole || '').toLowerCase();
  const username = String(identity?.username || '').toLowerCase();
  if (role === 'field' || role === 'external') return false;
  if (username === 'bryan@friday.mu' || username === 'catherine@friday.mu') return false;
  return true;
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
    attachments: row._attachments || [],
    // Reply count is computed by a LEFT JOIN LATERAL on the list endpoints.
    // Replies themselves return 0 here (they're fetched via /replies, never top-level).
    replyCount: Number(row.reply_count) || 0,
    meta: row.meta || null,
    editedAt: row.edited_at,
    ts: row.created_at,
    // Aggregated reactions: { '👀': [user_id, ...], '✅': [...], '🙋': [...] }
    // The frontend renders a chip per emoji with count + a clickable
    // toggle for the current user. Populated by the messages endpoint
    // via a side query (see loadReactionsForMessages below).
    reactions: row._reactions || {},
  };
}

function shapeAttachment(row) {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes) || 0,
    url: row.url,
    width: row.width,
    height: row.height,
    uploadedByUserId: row.uploaded_by_user_id,
    createdAt: row.created_at,
  };
}

function safeAttachmentFilename(filename) {
  const raw = String(filename || 'attachment').trim() || 'attachment';
  return raw.replace(/[\r\n"]/g, '').slice(0, 180);
}

function resolveAttachmentPath(storagePath) {
  const root = path.resolve(UPLOAD_DIR);
  const absolutePath = path.resolve(root, String(storagePath || ''));
  if (absolutePath !== root && absolutePath.startsWith(`${root}${path.sep}`)) {
    return absolutePath;
  }
  return null;
}

async function loadAccessibleAttachment(attachmentId, tenantId, userId) {
  const { rows } = await query(
    `SELECT a.*,
            c.visibility AS channel_visibility,
            d.participant_user_ids AS dm_participant_user_ids
     FROM team_message_attachments a
     LEFT JOIN team_channels c ON c.id = a.channel_id
     LEFT JOIN team_dms d ON d.id = a.dm_id
     WHERE a.id = $1 AND a.tenant_id = $2`,
    [attachmentId, tenantId],
  );
  if (rows.length === 0) {
    return { status: 404, error: 'Attachment not found' };
  }

  const attachment = rows[0];
  const boundToMessage = !!(attachment.channel_message_id || attachment.dm_message_id);
  if (!boundToMessage && attachment.uploaded_by_user_id !== userId) {
    return { status: 404, error: 'Attachment not found' };
  }

  if (attachment.channel_id && attachment.channel_visibility === 'private') {
    const member = await isChannelMember(attachment.channel_id, userId);
    if (!member) return { status: 403, error: 'Not a member of this channel' };
  }

  if (attachment.dm_id) {
    const participants = attachment.dm_participant_user_ids || [];
    if (!participants.includes(userId)) return { status: 403, error: 'Not a participant' };
  }

  return { attachment };
}

/**
 * Bulk-fetch attachments for a list of message IDs of a given kind.
 * One query instead of N. Returns a Map keyed by message_id with the
 * value being an array of shaped attachment objects.
 */
async function loadAttachmentsForMessages(messageIds, kind) {
  if (messageIds.length === 0) return new Map();
  const col = kind === 'channel' ? 'channel_message_id' : 'dm_message_id';
  const { rows } = await query(
    `SELECT * FROM team_message_attachments
     WHERE ${col} = ANY($1::uuid[])
     ORDER BY created_at`,
    [messageIds],
  );
  const byMsg = new Map();
  for (const r of rows) {
    const id = kind === 'channel' ? r.channel_message_id : r.dm_message_id;
    if (!byMsg.has(id)) byMsg.set(id, []);
    byMsg.get(id).push(shapeAttachment(r));
  }
  return byMsg;
}

/**
 * Bulk-fetch reactions for a list of message IDs of a given kind.
 * One query instead of N. Returns a Map keyed by message_id.
 */
async function loadReactionsForMessages(messageIds, kind) {
  if (messageIds.length === 0) return new Map();
  const { rows } = await query(
    `SELECT message_id, emoji, user_id
     FROM team_message_reactions
     WHERE message_id = ANY($1::uuid[]) AND message_kind = $2`,
    [messageIds, kind],
  );
  const byMsg = new Map();
  for (const r of rows) {
    if (!byMsg.has(r.message_id)) byMsg.set(r.message_id, {});
    const emojiMap = byMsg.get(r.message_id);
    if (!emojiMap[r.emoji]) emojiMap[r.emoji] = [];
    emojiMap[r.emoji].push(r.user_id);
  }
  return byMsg;
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

async function notifyTeamMessage({ tenantId, actorUserId, recipientUserIds, type, title, body, url, sourceId, data = {} }) {
  const ids = [...new Set((recipientUserIds || []).filter(Boolean).map(String))]
    .filter((id) => id !== String(actorUserId));
  if (ids.length === 0) return;
  await notifyUsers({
    tenantId,
    userIds: ids,
    type,
    title,
    body,
    url,
    source: 'team_inbox',
    sourceId,
    priority: type.includes('mention') || type.includes('dm') ? 'high' : 'normal',
    data: { module: 'inbox', ...data },
  });
}

function normalizeMessageMeta(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  return { ...input };
}

async function resolveDesignProjectMeta({ tenantId, channelId, channelKey, text, meta, parentMessageId }) {
  let nextMeta = normalizeMessageMeta(meta);
  const explicitProjectId = nextMeta?.designProjectId
    || nextMeta?.design_project_id
    || nextMeta?.designProject?.id;

  if (isUuid(explicitProjectId)) {
    const { rows } = await query(
      `SELECT id, name, slug
         FROM design_projects
        WHERE tenant_id = $1 AND id = $2
        LIMIT 1`,
      [tenantId, explicitProjectId],
    );
    if (rows[0]) {
      const linked = normalizeProjectForMeta(rows[0], 'manual', 1);
      return { ...(nextMeta || {}), designProjectId: linked.id, designProject: linked };
    }
  }

  if (parentMessageId) {
    const { rows } = await query(
      `SELECT meta
         FROM team_channel_messages
        WHERE id = $1 AND channel_id = $2 AND deleted_at IS NULL
        LIMIT 1`,
      [parentMessageId, channelId],
    );
    const parentProject = rows[0]?.meta?.designProject;
    if (parentProject?.id && parentProject?.name) {
      const linked = normalizeProjectForMeta(parentProject, 'inherited', 1);
      return { ...(nextMeta || {}), designProjectId: linked.id, designProject: linked };
    }
  }

  if (channelKey !== 'design') return nextMeta;

  const { rows } = await query(
    `SELECT id, name, slug
       FROM design_projects
      WHERE tenant_id = $1
        AND lifecycle_status <> 'cancelled'
      ORDER BY updated_at DESC
      LIMIT 250`,
    [tenantId],
  );
  const linked = matchDesignProjectFromText(text, rows);
  if (!linked) return nextMeta;
  return { ...(nextMeta || {}), designProjectId: linked.id, designProject: linked };
}

// ─── Channels ───────────────────────────────────────────────────────

// List channels visible to caller:
//   - Every public channel in the tenant (caller auto-joins on first request)
//   - Every private channel the caller is a member of
//   - System admins (users.role = 'admin') ALSO see all private channels they're
//     not a member of, with isMember=false — lets them bootstrap private-channel
//     membership from the admin UI without psql.
// Unread count per channel computed in the same query against team_message_reads.
router.get('/channels', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  await autojoinPublicChannels(req.tenantId, userId);
  const isSystemAdmin = req.identity?.userRole === 'admin';
  try {
    const { rows } = await query(
      `SELECT c.*,
              (m.user_id IS NOT NULL)        AS is_member,
              COALESCE(unread.cnt, 0)        AS unread_cnt
       FROM team_channels c
       LEFT JOIN team_channel_members m
         ON m.channel_id = c.id AND m.user_id = $2
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS cnt
         FROM team_channel_messages msg
         WHERE msg.channel_id = c.id
           AND msg.deleted_at IS NULL
           AND msg.parent_message_id IS NULL
           AND msg.author_user_id <> $2
           AND NOT EXISTS (
             SELECT 1 FROM team_message_reads r
             WHERE r.user_id = $2 AND r.message_id = msg.id AND r.message_kind = 'channel'
           )
       ) unread ON TRUE
       WHERE c.tenant_id = $1 AND c.archived_at IS NULL
         AND (
           c.visibility = 'public'    -- everyone sees public
           OR m.user_id IS NOT NULL   -- private + caller is a member
           OR $3::boolean             -- system admin sees private even when not a member
         )
       ORDER BY c.created_at`,
      [req.tenantId, userId, isSystemAdmin],
    );
    res.json({ channels: rows.map((r) => shapeChannel(r, r.unread_cnt)) });
  } catch (e) {
    console.error('[team_inbox] list channels error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/channels', attachIdentity, async (req, res) => {
  if (!canManageChannels(req.identity)) {
    return res.status(403).json({ error: 'Field staff cannot create channels' });
  }
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  const channelKey = channelKeyFromName(req.body?.key || name);
  if (!channelKey) return res.status(400).json({ error: 'valid channel key required' });
  const visibility = req.body?.visibility === 'private' ? 'private' : 'public';
  const purpose = String(req.body?.purpose || '').trim() || null;
  try {
    const { rows } = await query(
      `INSERT INTO team_channels (tenant_id, channel_key, name, purpose, visibility, preserve_upload_quality)
       VALUES ($1, $2, $3, $4, $5, FALSE)
       RETURNING *`,
      [req.tenantId, channelKey, name, purpose, visibility],
    );
    const channel = rows[0];
    if (visibility === 'public') {
      await query(
        `INSERT INTO team_channel_members (channel_id, user_id, role)
         SELECT $1, u.id, CASE WHEN u.id = $2 THEN 'admin' ELSE 'member' END
         FROM users u
         WHERE u.tenant_id = $3 AND u.is_active = TRUE
         ON CONFLICT (channel_id, user_id) DO NOTHING`,
        [channel.id, req.identity.userId, req.tenantId],
      );
    } else {
      await query(
        `INSERT INTO team_channel_members (channel_id, user_id, role)
         VALUES ($1, $2, 'admin')
         ON CONFLICT (channel_id, user_id) DO UPDATE SET role = 'admin'`,
        [channel.id, req.identity.userId],
      );
    }
    publishFadEvent({
      tenantId: req.tenantId,
      type: 'team.channel_created',
      payload: { channelId: channel.id, channelKey: channel.channel_key, actorUserId: req.identity.userId },
    }).catch(() => {});
    res.status(201).json({ channel: shapeChannel(channel) });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Channel key already exists' });
    }
    console.error('[team_inbox] create channel error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/channels/:id', attachIdentity, async (req, res) => {
  if (!canManageChannels(req.identity)) {
    return res.status(403).json({ error: 'Field staff cannot edit channels' });
  }
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : null;
  const purpose = typeof req.body?.purpose === 'string' ? req.body.purpose.trim() : undefined;
  const visibility = req.body?.visibility === 'private' || req.body?.visibility === 'public' ? req.body.visibility : null;
  if (!name && purpose === undefined && !visibility) return res.status(400).json({ error: 'No channel fields provided' });
  try {
    const sets = [];
    const params = [req.params.id, req.tenantId];
    let i = 3;
    if (name) { sets.push(`name = $${i++}`); params.push(name); }
    if (purpose !== undefined) { sets.push(`purpose = $${i++}`); params.push(purpose || null); }
    if (visibility) { sets.push(`visibility = $${i++}`); params.push(visibility); }
    sets.push('updated_at = NOW()');
    const { rows } = await query(
      `UPDATE team_channels
          SET ${sets.join(', ')}
        WHERE id = $1 AND tenant_id = $2 AND archived_at IS NULL
        RETURNING *`,
      params,
    );
    if (!rows[0]) return res.status(404).json({ error: 'Channel not found' });
    if (visibility === 'public') {
      await query(
        `INSERT INTO team_channel_members (channel_id, user_id, role)
         SELECT $1, u.id, 'member'
         FROM users u
         WHERE u.tenant_id = $2 AND u.is_active = TRUE
         ON CONFLICT (channel_id, user_id) DO NOTHING`,
        [rows[0].id, req.tenantId],
      );
    }
    res.json({ channel: shapeChannel(rows[0]) });
  } catch (e) {
    console.error('[team_inbox] update channel error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/channels/:id/archive', attachIdentity, async (req, res) => {
  if (!canManageChannels(req.identity)) {
    return res.status(403).json({ error: 'Field staff cannot archive channels' });
  }
  try {
    const { rows } = await query(
      `UPDATE team_channels
          SET archived_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2 AND archived_at IS NULL
        RETURNING *`,
      [req.params.id, req.tenantId],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Channel not found' });
    publishFadEvent({
      tenantId: req.tenantId,
      type: 'team.channel_archived',
      payload: { channelId: rows[0].id, channelKey: rows[0].channel_key, actorUserId: req.identity.userId },
    }).catch(() => {});
    res.json({ channel: shapeChannel(rows[0]) });
  } catch (e) {
    console.error('[team_inbox] archive channel error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/channels/:id', attachIdentity, async (req, res) => {
  if (!canManageChannels(req.identity)) {
    return res.status(403).json({ error: 'Field staff cannot delete channels' });
  }
  try {
    const { rows } = await query(
      `DELETE FROM team_channels
        WHERE id = $1 AND tenant_id = $2
        RETURNING id, channel_key`,
      [req.params.id, req.tenantId],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Channel not found' });
    publishFadEvent({
      tenantId: req.tenantId,
      type: 'team.channel_deleted',
      payload: { channelId: rows[0].id, channelKey: rows[0].channel_key, actorUserId: req.identity.userId },
    }).catch(() => {});
    res.json({ ok: true, channelId: rows[0].id });
  } catch (e) {
    console.error('[team_inbox] delete channel error:', e.message);
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

// Add a member (channel admin OR system admin).
//
// System admin escape hatch: private channels seed with zero members,
// so until at least one channel admin exists, only a tenant admin can
// bootstrap membership. Without this, the admin UI is unusable for
// freshly seeded private channels.
router.post('/channels/:id/members', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  const targetUserId = req.body?.userId;
  if (!targetUserId) return res.status(400).json({ error: 'userId required' });
  try {
    const systemAdmin = req.identity?.userRole === 'admin';
    const channelAdmin = await isChannelAdmin(req.params.id, userId);
    if (!systemAdmin && !channelAdmin) {
      return res.status(403).json({ error: 'Channel admin or system admin required' });
    }
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
    const systemAdmin = req.identity?.userRole === 'admin';
    const channelAdmin = await isChannelAdmin(req.params.id, userId);
    // Self-removal is always allowed (operators can leave a channel).
    const selfRemoval = req.params.userId === userId;
    if (!systemAdmin && !channelAdmin && !selfRemoval) {
      return res.status(403).json({ error: 'Channel admin or system admin required' });
    }
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
    // Top-level only: replies are fetched separately via /messages/:kind/:id/replies.
    // The reply_count subquery powers the "N replies" badge under each parent.
    let sql =
      `SELECT msg.*,
              $${params.length + 1}::text AS channel_key,
              COALESCE(rc.cnt, 0)         AS reply_count
       FROM team_channel_messages msg
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS cnt
         FROM team_channel_messages reply
         WHERE reply.parent_message_id = msg.id AND reply.deleted_at IS NULL
       ) rc ON TRUE
       WHERE msg.channel_id = $1
         AND msg.deleted_at IS NULL
         AND msg.parent_message_id IS NULL`;
    params.push(ch.channel_key);
    if (before && !Number.isNaN(before.getTime())) {
      sql += ` AND msg.created_at < $${params.length + 1}`;
      params.push(before.toISOString());
    }
    sql += ` ORDER BY msg.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    const { rows } = await query(sql, params);
    const ids = rows.map((r) => r.id);
    // Bulk-fetch reactions + attachments — single query each vs N
    const [reactionMap, attachmentMap] = await Promise.all([
      loadReactionsForMessages(ids, 'channel'),
      loadAttachmentsForMessages(ids, 'channel'),
    ]);
    rows.forEach((r) => {
      r._reactions = reactionMap.get(r.id) || {};
      r._attachments = attachmentMap.get(r.id) || [];
    });
    res.json({ messages: rows.map((r) => shapeMessage(r, 'channel')).reverse() });
  } catch (e) {
    console.error('[team_inbox] channel messages error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Bind a list of unbound attachment IDs to the just-sent message.
 * Validates the attachments belong to the same target (channel/dm) and
 * are unbound (no existing message ref). Silently drops invalid IDs
 * rather than failing the send — operators shouldn't lose a message
 * to a stale upload reference.
 */
async function bindAttachments({ attachmentIds, kind, targetId, messageId, tenantId }) {
  if (!Array.isArray(attachmentIds) || attachmentIds.length === 0) return;
  const targetCol = kind === 'channel' ? 'channel_id' : 'dm_id';
  const messageCol = kind === 'channel' ? 'channel_message_id' : 'dm_message_id';
  const otherMessageCol = kind === 'channel' ? 'dm_message_id' : 'channel_message_id';
  await query(
    `UPDATE team_message_attachments
     SET ${messageCol} = $1
     WHERE id = ANY($2::uuid[])
       AND tenant_id = $3
       AND ${targetCol} = $4
       AND ${messageCol} IS NULL
       AND ${otherMessageCol} IS NULL`,
    [messageId, attachmentIds.slice(0, 20), tenantId, targetId],
  );
}

// POST /channels/:id/attachments — upload a single file. Returns the
// attachment row; operator then references the id in the next send.
// Channel must be visible to the caller (private channels gated on
// membership).
router.post(
  '/channels/:id/attachments',
  attachIdentity,
  setTargetKind('channel'),
  attachmentUploader.single('file'),
  async (req, res) => {
    const userId = req.identity?.userId;
    if (!userId) return res.status(401).json({ error: 'No user context' });
    if (!req.file) return res.status(400).json({ error: 'file required (multipart field "file")' });
    try {
      const { rows: chRows } = await query(
        `SELECT id, visibility FROM team_channels WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.tenantId],
      );
      if (chRows.length === 0) {
        // Best-effort cleanup of the orphaned file.
        try { fs.unlinkSync(req.file.path); } catch (_e) { /* ignore */ }
        return res.status(404).json({ error: 'Channel not found' });
      }
      const ch = chRows[0];
      if (ch.visibility === 'private') {
        const member = await isChannelMember(ch.id, userId);
        if (!member) {
          try { fs.unlinkSync(req.file.path); } catch (_e) { /* ignore */ }
          return res.status(403).json({ error: 'Not a member of this channel' });
        }
      }
      const relPath = path.relative(UPLOAD_DIR, req.file.path);
      const url = `${TEAM_UPLOAD_URL_PREFIX}/channel/${ch.id}/${path.basename(req.file.path)}`;
      const { rows } = await query(
        `INSERT INTO team_message_attachments (
           tenant_id, channel_id, uploaded_by_user_id,
           filename, mime_type, size_bytes, storage_path, url
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [req.tenantId, ch.id, userId, req.file.originalname,
         req.file.mimetype, req.file.size, relPath, url],
      );
      res.json({ attachment: shapeAttachment(rows[0]) });
    } catch (e) {
      console.error('[team_inbox] channel upload error:', e.message);
      try { fs.unlinkSync(req.file.path); } catch (_e) { /* ignore */ }
      res.status(500).json({ error: e.message });
    }
  },
);

// POST /dms/:id/attachments — DM equivalent.
router.post(
  '/dms/:id/attachments',
  attachIdentity,
  setTargetKind('dm'),
  attachmentUploader.single('file'),
  async (req, res) => {
    const userId = req.identity?.userId;
    if (!userId) return res.status(401).json({ error: 'No user context' });
    if (!req.file) return res.status(400).json({ error: 'file required (multipart field "file")' });
    try {
      const { rows: dmRows } = await query(
        `SELECT id, participant_user_ids FROM team_dms WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.tenantId],
      );
      if (dmRows.length === 0) {
        try { fs.unlinkSync(req.file.path); } catch (_e) { /* ignore */ }
        return res.status(404).json({ error: 'DM not found' });
      }
      if (!dmRows[0].participant_user_ids.includes(userId)) {
        try { fs.unlinkSync(req.file.path); } catch (_e) { /* ignore */ }
        return res.status(403).json({ error: 'Not a participant' });
      }
      const relPath = path.relative(UPLOAD_DIR, req.file.path);
      const url = `${TEAM_UPLOAD_URL_PREFIX}/dm/${dmRows[0].id}/${path.basename(req.file.path)}`;
      const { rows } = await query(
        `INSERT INTO team_message_attachments (
           tenant_id, dm_id, uploaded_by_user_id,
           filename, mime_type, size_bytes, storage_path, url
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [req.tenantId, dmRows[0].id, userId, req.file.originalname,
         req.file.mimetype, req.file.size, relPath, url],
      );
      res.json({ attachment: shapeAttachment(rows[0]) });
    } catch (e) {
      console.error('[team_inbox] dm upload error:', e.message);
      try { fs.unlinkSync(req.file.path); } catch (_e) { /* ignore */ }
      res.status(500).json({ error: e.message });
    }
  },
);

// GET /attachments/:id/preview — authenticated inline document viewer
// source. The older /uploads/team/... URL remains for direct links and
// downloads, but the in-FAD preview should use this route so private
// channels and DMs keep their access checks.
router.get('/attachments/:id/preview', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  try {
    const loaded = await loadAccessibleAttachment(req.params.id, req.tenantId, userId);
    if (loaded.error) return res.status(loaded.status).json({ error: loaded.error });

    const attachment = loaded.attachment;
    const absolutePath = resolveAttachmentPath(attachment.storage_path);
    if (!absolutePath) return res.status(400).json({ error: 'Invalid attachment path' });
    if (!fs.existsSync(absolutePath)) return res.status(404).json({ error: 'Attachment file not found' });

    const filename = safeAttachmentFilename(attachment.filename);
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(absolutePath);
  } catch (e) {
    console.error('[team_inbox] attachment preview error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Send a channel message. Validates @mentions are real tenant users.
// Private channels remain member-only; public channels may mention any
// active tenant user because public membership is lazily backfilled.
router.post('/channels/:id/messages', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  const text = String(req.body?.text || '').trim();
  const attachmentIds = Array.isArray(req.body?.attachmentIds) ? req.body.attachmentIds : [];
  // Text is required only when there are no attachments — operators
  // can post a photo with no caption.
  if (!text && req.body?.kind === 'text' && attachmentIds.length === 0) {
    return res.status(400).json({ error: 'text or attachmentIds required' });
  }
  const kind = req.body?.kind || 'text';
  let meta = normalizeMessageMeta(req.body?.meta);
  const parentMessageId = req.body?.parentMessageId || null;
  let mentions = Array.isArray(req.body?.mentions) ? req.body.mentions : [];
  // Cap mention count and dedup. Validate they're real channel members.
  mentions = [...new Set(mentions)].slice(0, 50);
  // Defensive: drop non-UUID mention values before the `uuid[]` cast
  // below. Frontend currently passes roster IDs (e.g. 'u-catherine')
  // from TASK_USERS in some flows (ScheduleCallDrawer). Without this
  // filter Postgres rejects the cast and the whole send 500s, blocking
  // the message entirely. Reported by Mary 2026-05-17 14:21 UTC.
  // TODO: frontend should map roster IDs → real DB UUIDs before send.
  {
    const before = mentions.length;
    mentions = mentions.filter(
      (m) => typeof m === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(m),
    );
    if (mentions.length < before) {
      console.warn(`[team_inbox] channel POST: dropped ${before - mentions.length} non-UUID mentions`);
    }
  }
  try {
    const { rows: chRows } = await query(
      `SELECT id, visibility, channel_key, name FROM team_channels WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenantId],
    );
    if (chRows.length === 0) return res.status(404).json({ error: 'Channel not found' });
    const ch = chRows[0];
    if (ch.visibility === 'private') {
      const member = await isChannelMember(ch.id, userId);
      if (!member) return res.status(403).json({ error: 'Not a member of this channel' });
    }
    // Thread reply: parent must belong to this channel + be a top-level
    // message (no nested threads — Slack-style flat threading).
    if (parentMessageId) {
      const { rows: parentRows } = await query(
        `SELECT id FROM team_channel_messages
         WHERE id = $1 AND channel_id = $2 AND parent_message_id IS NULL AND deleted_at IS NULL`,
        [parentMessageId, ch.id],
      );
      if (parentRows.length === 0) {
        return res.status(400).json({ error: 'Parent message not found in this channel, or is itself a reply' });
      }
    }
    meta = await resolveDesignProjectMeta({
      tenantId: req.tenantId,
      channelId: ch.id,
      channelKey: ch.channel_key,
      text,
      meta,
      parentMessageId,
    });
    // Drop invalid mentions silently rather than blocking the message.
    // Private channels only keep members; public channels keep active
    // tenant users even if their public-channel membership has not been
    // autojoined yet.
    if (mentions.length > 0) {
      const { rows: valid } = ch.visibility === 'private'
        ? await query(
          `SELECT user_id FROM team_channel_members WHERE channel_id = $1 AND user_id = ANY($2::uuid[])`,
          [ch.id, mentions],
        )
        : await query(
          `SELECT id AS user_id FROM users
           WHERE tenant_id = $1 AND is_active = TRUE AND id = ANY($2::uuid[])`,
          [req.tenantId, mentions],
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
    await bindAttachments({
      attachmentIds, kind: 'channel', targetId: ch.id,
      messageId: insRows[0].id, tenantId: req.tenantId,
    });
    // Refetch attachments to surface them in the response.
    if (attachmentIds.length > 0) {
      const attachmentMap = await loadAttachmentsForMessages([insRows[0].id], 'channel');
      insRows[0]._attachments = attachmentMap.get(insRows[0].id) || [];
    }
    publishFadEvent({
      tenantId: req.tenantId,
      type: 'team.channel_message',
      payload: {
        channelId: ch.id,
        messageId: insRows[0].id,
        authorUserId: userId,
        designProject: meta?.designProject || null,
      },
    }).catch(() => {});
    notifyTeamMessage({
      tenantId: req.tenantId,
      actorUserId: userId,
      recipientUserIds: mentions,
      type: 'team_channel_mention',
      title: `${req.identity?.displayName || req.identity?.username || 'Someone'} mentioned you in #${ch.channel_key || ch.name || 'team'}`,
      body: text.slice(0, 180),
      url: `/fad?m=inbox&team=channel:${ch.id}`,
      sourceId: insRows[0].id,
      data: {
        channelId: ch.id,
        messageId: insRows[0].id,
        isMention: true,
        emailNotification: true,
        designProject: meta?.designProject || null,
      },
    }).catch(() => {});
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
           AND msg.parent_message_id IS NULL
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
    // Top-level only — same threading model as channel messages.
    let sql =
      `SELECT msg.*,
              $${params.length + 1}::uuid AS dm_id,
              COALESCE(rc.cnt, 0)         AS reply_count
       FROM team_dm_messages msg
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS cnt
         FROM team_dm_messages reply
         WHERE reply.parent_message_id = msg.id AND reply.deleted_at IS NULL
       ) rc ON TRUE
       WHERE msg.dm_id = $1
         AND msg.deleted_at IS NULL
         AND msg.parent_message_id IS NULL`;
    params.push(dm.id);
    if (before && !Number.isNaN(before.getTime())) {
      sql += ` AND msg.created_at < $${params.length + 1}`;
      params.push(before.toISOString());
    }
    sql += ` ORDER BY msg.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    const { rows } = await query(sql, params);
    const ids = rows.map((r) => r.id);
    const [reactionMap, attachmentMap] = await Promise.all([
      loadReactionsForMessages(ids, 'dm'),
      loadAttachmentsForMessages(ids, 'dm'),
    ]);
    rows.forEach((r) => {
      r._reactions = reactionMap.get(r.id) || {};
      r._attachments = attachmentMap.get(r.id) || [];
    });
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
  const attachmentIds = Array.isArray(req.body?.attachmentIds) ? req.body.attachmentIds : [];
  if (!text && req.body?.kind === 'text' && attachmentIds.length === 0) {
    return res.status(400).json({ error: 'text or attachmentIds required' });
  }
  const kind = req.body?.kind || 'text';
  const meta = req.body?.meta || null;
  const parentMessageId = req.body?.parentMessageId || null;
  let mentions = Array.isArray(req.body?.mentions)
    ? [...new Set(req.body.mentions)].slice(0, 50)
    : [];
  // Defensive: drop non-UUID mention values — frontend may pass roster
  // IDs (e.g. 'u-catherine') which would crash the uuid[] cast on
  // INSERT below. See channels POST for the longer note + Mary's report.
  {
    const before = mentions.length;
    mentions = mentions.filter(
      (m) => typeof m === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(m),
    );
    if (mentions.length < before) {
      console.warn(`[team_inbox] dm POST: dropped ${before - mentions.length} non-UUID mentions`);
    }
  }
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
    if (parentMessageId) {
      const { rows: parentRows } = await query(
        `SELECT id FROM team_dm_messages
         WHERE id = $1 AND dm_id = $2 AND parent_message_id IS NULL AND deleted_at IS NULL`,
        [parentMessageId, dm.id],
      );
      if (parentRows.length === 0) {
        return res.status(400).json({ error: 'Parent message not found in this DM, or is itself a reply' });
      }
    }
    const { rows: ins } = await query(
      `INSERT INTO team_dm_messages
         (dm_id, author_user_id, author_display_name, text, mention_user_ids, kind, meta, parent_message_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [dm.id, userId, req.identity?.displayName || req.identity?.username || 'Unknown',
       text, mentions, kind, meta ? JSON.stringify(meta) : null, parentMessageId],
    );
    await bindAttachments({
      attachmentIds, kind: 'dm', targetId: dm.id,
      messageId: ins[0].id, tenantId: req.tenantId,
    });
    if (attachmentIds.length > 0) {
      const attachmentMap = await loadAttachmentsForMessages([ins[0].id], 'dm');
      ins[0]._attachments = attachmentMap.get(ins[0].id) || [];
    }
    // Bump last_message_at so the DM list orders correctly.
    await query(
      `UPDATE team_dms SET last_message_at = NOW() WHERE id = $1`,
      [dm.id],
    );
    publishFadEvent({
      tenantId: req.tenantId,
      type: 'team.dm_message',
      payload: { dmId: dm.id, messageId: ins[0].id, authorUserId: userId },
    }).catch(() => {});
    notifyTeamMessage({
      tenantId: req.tenantId,
      actorUserId: userId,
      recipientUserIds: dm.participant_user_ids,
      type: 'team_dm_message',
      title: `DM from ${req.identity?.displayName || req.identity?.username || 'Friday team'}`,
      body: text.slice(0, 180),
      url: `/fad?m=inbox&team=dm:${dm.id}`,
      sourceId: ins[0].id,
      data: { dmId: dm.id, messageId: ins[0].id, emailNotification: true },
    }).catch(() => {});
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

// ─── Thread replies ─────────────────────────────────────────────────
// GET /api/team/messages/:kind/:id/replies — fetch all replies for a
// top-level message. Replies are excluded from the main list endpoint
// (parent_message_id IS NULL filter) so the UI fetches them on demand
// when the operator opens a thread surface.
//
// Returns replies in chronological order (oldest first) — thread reads
// top-down like Slack, opposite of the main timeline.

router.get('/messages/:kind/:id/replies', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  const kind = req.params.kind;
  if (kind !== 'channel' && kind !== 'dm') {
    return res.status(400).json({ error: 'kind must be channel or dm' });
  }
  const parentId = req.params.id;
  try {
    if (kind === 'channel') {
      // Resolve channel + verify access (private channels are member-gated).
      const { rows: parentRows } = await query(
        `SELECT msg.id, msg.channel_id, c.visibility, c.channel_key
         FROM team_channel_messages msg
         JOIN team_channels c ON c.id = msg.channel_id
         WHERE msg.id = $1 AND c.tenant_id = $2`,
        [parentId, req.tenantId],
      );
      if (parentRows.length === 0) return res.status(404).json({ error: 'Parent message not found' });
      const parent = parentRows[0];
      if (parent.visibility === 'private') {
        const member = await isChannelMember(parent.channel_id, userId);
        if (!member) return res.status(403).json({ error: 'Not a member of this channel' });
      }
      const { rows } = await query(
        `SELECT msg.*, $2::text AS channel_key, 0 AS reply_count
         FROM team_channel_messages msg
         WHERE msg.parent_message_id = $1 AND msg.deleted_at IS NULL
         ORDER BY msg.created_at ASC`,
        [parentId, parent.channel_key],
      );
      const ids = rows.map((r) => r.id);
      const [reactionMap, attachmentMap] = await Promise.all([
        loadReactionsForMessages(ids, 'channel'),
        loadAttachmentsForMessages(ids, 'channel'),
      ]);
      rows.forEach((r) => {
        r._reactions = reactionMap.get(r.id) || {};
        r._attachments = attachmentMap.get(r.id) || [];
      });
      return res.json({ replies: rows.map((r) => shapeMessage(r, 'channel')) });
    }
    // DM replies.
    const { rows: parentRows } = await query(
      `SELECT msg.id, msg.dm_id, dm.participant_user_ids
       FROM team_dm_messages msg
       JOIN team_dms dm ON dm.id = msg.dm_id
       WHERE msg.id = $1 AND dm.tenant_id = $2`,
      [parentId, req.tenantId],
    );
    if (parentRows.length === 0) return res.status(404).json({ error: 'Parent message not found' });
    if (!parentRows[0].participant_user_ids.includes(userId)) {
      return res.status(403).json({ error: 'Not a participant' });
    }
    const { rows } = await query(
      `SELECT msg.*, $2::uuid AS dm_id, 0 AS reply_count
       FROM team_dm_messages msg
       WHERE msg.parent_message_id = $1 AND msg.deleted_at IS NULL
       ORDER BY msg.created_at ASC`,
      [parentId, parentRows[0].dm_id],
    );
    const ids = rows.map((r) => r.id);
    const [reactionMap, attachmentMap] = await Promise.all([
      loadReactionsForMessages(ids, 'dm'),
      loadAttachmentsForMessages(ids, 'dm'),
    ]);
    rows.forEach((r) => {
      r._reactions = reactionMap.get(r.id) || {};
      r._attachments = attachmentMap.get(r.id) || [];
    });
    res.json({ replies: rows.map((r) => shapeMessage(r, 'dm')) });
  } catch (e) {
    console.error('[team_inbox] replies error:', e.message);
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

// ─── Slack import (one-time backfill — parked on bot token) ─────────
// Admin posts the Slack bot token + optional date floor; worker pulls
// users, channels, messages into TeamInbox with provenance tracking.
// See slack_import.js for the full flow + docs/handover/slack-import-setup.md
// for the Slack app creation steps.

router.post('/slack-import/start', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  // Only admins can trigger an import. Role check matches the gating
  // patterns elsewhere in fad-backend (design module, etc.).
  if (req.identity?.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }
  const token = String(req.body?.botToken || '').trim();
  if (!token.startsWith('xoxb-')) {
    return res.status(400).json({ error: 'Slack bot token required (starts with xoxb-)' });
  }
  const importedSince = req.body?.importedSince || null;

  try {
    const { runSlackImport } = require('./slack_import');
    // Kick off async — return run id immediately so the admin UI can
    // poll for status. The run can take minutes for large workspaces.
    const runPromise = runSlackImport(req.tenantId, token, { importedSince });
    // Fire-and-forget; don't await. Errors land in slack_import_runs.last_error.
    runPromise.catch((e) => console.error('[slack-import/start] async run failed:', e.message));
    res.json({ ok: true, message: 'Import started; poll /api/team/slack-import/runs for status' });
  } catch (e) {
    console.error('[slack-import/start] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/slack-import/runs', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });
  if (req.identity?.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }
  try {
    const { rows } = await query(
      `SELECT * FROM slack_import_runs WHERE tenant_id = $1 ORDER BY started_at DESC LIMIT 20`,
      [req.tenantId],
    );
    res.json({ runs: rows });
  } catch (e) {
    console.error('[slack-import/runs] error:', e.message);
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
