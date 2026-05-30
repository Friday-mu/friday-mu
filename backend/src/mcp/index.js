'use strict';

// FridayOS MCP gateway.
//
// Transport: JSON-RPC 2.0 over POST /api/mcp. This intentionally keeps
// the implementation dependency-free: the gateway exposes standard MCP
// initialize/tools/list/tools/call messages while using FAD's existing
// JWT + tenant scoping. High-risk writes are represented as approval
// requests in mcp_action_requests, then explicitly confirmed.

const express = require('express');
const jwt = require('jsonwebtoken');
const { query } = require('../database/client');
const { decodeJwt } = require('../design/auth');
const { DEFAULT_TENANT_ID } = require('../design/adapters');
const { publishFadEvent, notifyUsers } = require('../realtime');
const { sendEmail } = require('../website_inbox/resend');

const router = express.Router();

const SERVER_INFO = {
  name: 'fridayos-fad-mcp',
  version: '0.1.0',
};

const PROTOCOL_VERSION = '2024-11-05';
const PUBLIC_API_AUDIENCE = 'fad-public-api';
const PUBLIC_API_ISSUER = 'fad';

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tool(name, phase, risk, description, inputSchema) {
  return { name, phase, risk, description, inputSchema };
}

const TOOL_DEFINITIONS = [
  tool('fad.status', 1, 'read', 'Summarize tenant-level FAD health and live data counts.', {
    type: 'object',
    properties: {},
    additionalProperties: false,
  }),
  tool('fad.search', 1, 'read', 'Search FAD properties, reservations, tasks, Team Inbox messages, and website enquiries.', {
    type: 'object',
    properties: {
      query: { type: 'string', minLength: 1 },
      types: {
        type: 'array',
        items: { type: 'string', enum: ['properties', 'reservations', 'tasks', 'team_messages', 'website_threads'] },
      },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
    required: ['query'],
    additionalProperties: false,
  }),
  tool('properties.list', 1, 'read', 'List live FAD properties from the Guesty-backed cache.', {
    type: 'object',
    properties: {
      active: { type: 'boolean' },
      cohort: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 200 },
    },
    additionalProperties: false,
  }),
  tool('reservations.list', 1, 'read', 'List live reservations with optional date/status filters.', {
    type: 'object',
    properties: {
      status: { type: 'string' },
      listing: { type: 'string' },
      from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      to: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      upcoming: { type: 'boolean' },
      limit: { type: 'integer', minimum: 1, maximum: 200 },
    },
    additionalProperties: false,
  }),
  tool('availability.get', 1, 'read', 'Read cached availability and nightly pricing for a listing/date range.', {
    type: 'object',
    properties: {
      listingId: { type: 'string' },
      from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      to: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    },
    required: ['listingId', 'from', 'to'],
    additionalProperties: false,
  }),
  tool('team.users.list', 1, 'read', 'List active tenant users for mentions, assignment, and DM targeting.', {
    type: 'object',
    properties: {},
    additionalProperties: false,
  }),
  tool('team.channels.list', 1, 'read', 'List Team Inbox channels visible to the caller.', {
    type: 'object',
    properties: {
      includePrivate: { type: 'boolean' },
    },
    additionalProperties: false,
  }),
  tool('team.messages.list', 1, 'read', 'List recent messages from a Team Inbox channel.', {
    type: 'object',
    properties: {
      channelId: { type: 'string' },
      channelKey: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    },
    additionalProperties: false,
  }),
  tool('tasks.list', 1, 'read', 'List operational tasks.', {
    type: 'object',
    properties: {
      status: { type: 'string' },
      assignee: { type: 'string', description: 'UUID or "me".' },
      property: { type: 'string' },
      reservation: { type: 'string' },
      overdue: { type: 'boolean' },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    },
    additionalProperties: false,
  }),
  tool('website.threads.list', 1, 'read', 'List website enquiry inbox threads.', {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['open', 'in_progress', 'paid', 'closed'] },
      query: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    },
    additionalProperties: false,
  }),
  tool('website.threads.get', 1, 'read', 'Load one website enquiry thread with events and jobs.', {
    type: 'object',
    properties: {
      threadId: { type: 'string' },
    },
    required: ['threadId'],
    additionalProperties: false,
  }),
  tool('team.message.send', 2, 'safe_write', 'Post an internal Team Inbox channel message. Mentions must be user UUIDs.', {
    type: 'object',
    properties: {
      channelId: { type: 'string' },
      channelKey: { type: 'string' },
      text: { type: 'string', minLength: 1 },
      mentions: { type: 'array', items: { type: 'string' } },
      kind: { type: 'string', enum: ['text', 'system', 'task_link'] },
    },
    required: ['text'],
    additionalProperties: false,
  }),
  tool('tasks.create', 2, 'safe_write', 'Create an operational task in FAD.', {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 1 },
      description: { type: 'string' },
      priority: { type: 'string', enum: ['lowest', 'low', 'medium', 'high', 'urgent'] },
      status: { type: 'string', enum: ['reported', 'scheduled', 'ready', 'in_progress', 'paused', 'blocked', 'completed', 'closed', 'cancelled'] },
      assignee_user_ids: { type: 'array', items: { type: 'string' } },
      due_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      property_code: { type: 'string' },
      reservation_guesty_id: { type: 'string' },
      department: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
    },
    required: ['title'],
    additionalProperties: false,
  }),
  tool('tasks.comment.add', 2, 'safe_write', 'Add a comment to an operational task.', {
    type: 'object',
    properties: {
      taskId: { type: 'string' },
      text: { type: 'string', minLength: 1 },
      mentions: { type: 'array', items: { type: 'string' } },
    },
    required: ['taskId', 'text'],
    additionalProperties: false,
  }),
  tool('action.request.create', 3, 'high_risk_request', 'Create an approval request for guest-facing or revenue-impacting work.', {
    type: 'object',
    properties: {
      actionType: {
        type: 'string',
        enum: ['website_thread_reply', 'guest_reply_direct_send', 'reservation_change', 'pricing_change', 'availability_change', 'team_message_send'],
      },
      reason: { type: 'string' },
      riskLevel: { type: 'string', enum: ['medium', 'high', 'critical'] },
      payload: { type: 'object' },
    },
    required: ['actionType', 'payload'],
    additionalProperties: false,
  }),
  tool('action.request.confirm', 3, 'high_risk_confirm', 'Approve and execute a supported pending MCP action request.', {
    type: 'object',
    properties: {
      requestId: { type: 'string' },
      decision: { type: 'string', enum: ['approve', 'reject'] },
      note: { type: 'string' },
    },
    required: ['requestId', 'decision'],
    additionalProperties: false,
  }),
];

const TOOL_BY_NAME = new Map(TOOL_DEFINITIONS.map((t) => [t.name, t]));

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message, data) {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } };
}

function textContent(value) {
  return {
    content: [
      {
        type: 'text',
        text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function clampLimit(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), 1), max);
}

function cleanString(value, max = 4000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function isAdmin(identity) {
  const role = String(identity?.userRole || identity?.role || '').toLowerCase();
  return role === 'admin' || role === 'director';
}

function getBearerToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice('Bearer '.length).trim();
}

function decodeApiClientToken(token) {
  if (!token || !process.env.JWT_SECRET) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: PUBLIC_API_ISSUER,
      audience: PUBLIC_API_AUDIENCE,
    });
    return {
      kind: 'api_client',
      userId: null,
      userRole: null,
      username: decoded.sub || null,
      displayName: decoded.sub || 'API client',
      tenantId: decoded.tenant_id || DEFAULT_TENANT_ID,
      clientId: decoded.sub || null,
      scopes: Array.isArray(decoded.scopes) ? decoded.scopes : [],
    };
  } catch {
    return null;
  }
}

function attachMcpIdentity(req, res, next) {
  const userIdentity = decodeJwt(req);
  if (userIdentity) {
    req.mcpIdentity = {
      kind: 'user',
      ...userIdentity,
      tenantId: userIdentity.tenantId || DEFAULT_TENANT_ID,
      scopes: ['mcp:read', 'mcp:write', 'mcp:high-risk'],
    };
    req.tenantId = req.mcpIdentity.tenantId;
    return next();
  }

  const apiIdentity = decodeApiClientToken(getBearerToken(req));
  if (apiIdentity) {
    req.mcpIdentity = apiIdentity;
    req.tenantId = apiIdentity.tenantId;
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized — MCP requires a FAD user token or API client token' });
}

function hasMcpScope(ctx, scope) {
  if (ctx.kind === 'user') return true;
  return (ctx.scopes || []).includes(scope);
}

function requireRisk(ctx, risk) {
  if (risk === 'read' && hasMcpScope(ctx, 'mcp:read')) return;
  if (risk === 'safe_write') {
    if (!hasMcpScope(ctx, 'mcp:write')) throw new Error('MCP token missing mcp:write scope');
    if (ctx.kind !== 'user') throw new Error('Safe write tools require a user token for audit ownership');
    return;
  }
  if (risk === 'high_risk_request') {
    if (!hasMcpScope(ctx, 'mcp:write')) throw new Error('MCP token missing mcp:write scope');
    return;
  }
  if (risk === 'high_risk_confirm') {
    if (ctx.kind !== 'user') throw new Error('Confirming high-risk actions requires a user token');
    if (!isAdmin(ctx)) throw new Error('Confirming high-risk actions requires admin/director role');
    return;
  }
  throw new Error(`MCP token missing required scope for ${risk}`);
}

async function resolveChannel(ctx, args = {}) {
  const channelId = cleanString(args.channelId, 80);
  const channelKey = cleanString(args.channelKey, 80);
  if (!channelId && !channelKey) throw new Error('channelId or channelKey is required');

  const params = [ctx.tenantId];
  let where = 'tenant_id = $1 AND archived_at IS NULL';
  if (channelId) {
    params.push(channelId);
    where += ` AND id = $${params.length}`;
  } else {
    params.push(channelKey);
    where += ` AND channel_key = $${params.length}`;
  }

  const { rows } = await query(
    `SELECT id, tenant_id, channel_key, name, visibility
       FROM team_channels
      WHERE ${where}
      LIMIT 1`,
    params,
  );
  const ch = rows[0];
  if (!ch) throw new Error('Channel not found');
  if (ch.visibility === 'private') {
    if (!ctx.userId) throw new Error('Private channel access requires a user token');
    const member = await query(
      `SELECT 1 FROM team_channel_members WHERE channel_id = $1 AND user_id = $2 LIMIT 1`,
      [ch.id, ctx.userId],
    );
    if (member.rows.length === 0) throw new Error('Not a member of this private channel');
  }
  return ch;
}

function shapeToolForMcp(t) {
  return {
    name: t.name,
    description: `[Phase ${t.phase} | ${t.risk}] ${t.description}`,
    inputSchema: t.inputSchema,
  };
}

async function toolFadStatus(ctx) {
  const [props, reservations, tasks, channels, notifications] = await Promise.all([
    query(`SELECT COUNT(*)::int AS count FROM guesty_listings WHERE tenant_id = $1 AND is_active = TRUE`, [ctx.tenantId]),
    query(`SELECT COUNT(*)::int AS count FROM guesty_reservations WHERE tenant_id = $1`, [ctx.tenantId]),
    query(`SELECT COUNT(*)::int AS count FROM tasks WHERE tenant_id = $1 AND status != 'cancelled'`, [ctx.tenantId]),
    query(`SELECT COUNT(*)::int AS count FROM team_channels WHERE tenant_id = $1 AND archived_at IS NULL`, [ctx.tenantId]),
    ctx.userId
      ? query(`SELECT COUNT(*)::int AS count FROM fad_notifications WHERE tenant_id = $1 AND user_id = $2 AND read_at IS NULL`, [ctx.tenantId, ctx.userId])
      : Promise.resolve({ rows: [{ count: null }] }),
  ]);
  return {
    tenantId: ctx.tenantId,
    actor: { kind: ctx.kind, userId: ctx.userId, clientId: ctx.clientId || null, displayName: ctx.displayName || ctx.username || null },
    counts: {
      activeProperties: props.rows[0].count,
      reservations: reservations.rows[0].count,
      openTasks: tasks.rows[0].count,
      teamChannels: channels.rows[0].count,
      unreadNotifications: notifications.rows[0].count,
    },
  };
}

async function toolPropertiesList(ctx, args) {
  const filters = ['gl.tenant_id = $1'];
  const params = [ctx.tenantId];
  if (typeof args.cohort === 'string' && args.cohort.trim()) {
    params.push(args.cohort.trim());
    filters.push(`gl.cohort = $${params.length}`);
  }
  if (args.active === true) filters.push('gl.is_active = TRUE');
  if (args.active === false) filters.push('gl.is_active = FALSE');
  const limit = clampLimit(args.limit, 100, 200);
  const { rows } = await query(
    `SELECT gl.guesty_id, gl.nickname, gl.title, gl.address_city, gl.cohort,
            gl.bedrooms, gl.bathrooms, gl.accommodates, gl.base_price_minor,
            gl.currency_code, gl.is_active, gl.synced_at
       FROM guesty_listings gl
      WHERE ${filters.join(' AND ')}
      ORDER BY COALESCE(gl.nickname, gl.title) ASC NULLS LAST
      LIMIT ${limit}`,
    params,
  );
  return { properties: rows };
}

async function toolReservationsList(ctx, args) {
  const filters = ['r.tenant_id = $1'];
  const params = [ctx.tenantId];
  if (typeof args.status === 'string' && args.status.trim()) {
    params.push(args.status.trim());
    filters.push(`r.status = $${params.length}`);
  }
  if (typeof args.listing === 'string' && args.listing.trim()) {
    params.push(args.listing.trim());
    filters.push(`r.listing_guesty_id = $${params.length}`);
  }
  if (typeof args.from === 'string' && args.from.trim()) {
    params.push(args.from.trim());
    filters.push(`r.check_in_date >= $${params.length}::date`);
  }
  if (typeof args.to === 'string' && args.to.trim()) {
    params.push(args.to.trim());
    filters.push(`r.check_in_date <= $${params.length}::date`);
  }
  if (args.upcoming === true) filters.push('r.check_in_date >= CURRENT_DATE');
  const limit = clampLimit(args.limit, 100, 200);
  const { rows } = await query(
    `SELECT r.guesty_id, r.confirmation_code, r.status, r.source, r.channel,
            r.check_in_date, r.check_out_date, r.nights, r.guests_count,
            r.guest_first_name, r.guest_last_name, r.total_amount_minor,
            r.currency_code, l.nickname AS listing_nickname
       FROM guesty_reservations r
       LEFT JOIN guesty_listings l
         ON l.tenant_id = r.tenant_id AND l.guesty_id = r.listing_guesty_id
      WHERE ${filters.join(' AND ')}
      ORDER BY r.check_in_date ASC NULLS LAST, r.created_at ASC
      LIMIT ${limit}`,
    params,
  );
  return { reservations: rows };
}

async function toolAvailabilityGet(ctx, args) {
  const listingId = cleanString(args.listingId, 200);
  const from = cleanString(args.from, 20);
  const to = cleanString(args.to, 20);
  if (!listingId || !from || !to) throw new Error('listingId, from, and to are required');
  const { rows } = await query(
    `SELECT date::text, is_available, price_minor, currency_code, min_nights, fetched_at
       FROM guesty_calendar
      WHERE tenant_id = $1
        AND listing_guesty_id = $2
        AND date >= $3::date
        AND date < $4::date
      ORDER BY date ASC
      LIMIT 400`,
    [ctx.tenantId, listingId, from, to],
  );
  return {
    listingId,
    from,
    to,
    source: 'guesty_calendar_cache',
    nights: rows.length,
    days: rows,
  };
}

async function toolTeamUsersList(ctx) {
  const { rows } = await query(
    `SELECT id, username, display_name, email, role
       FROM users
      WHERE tenant_id = $1 AND is_active = TRUE
      ORDER BY display_name, username, email`,
    [ctx.tenantId],
  );
  return { users: rows };
}

async function toolTeamChannelsList(ctx, args) {
  const includePrivate = args.includePrivate === true;
  const params = [ctx.tenantId];
  let visibilityFilter = '';
  if (!includePrivate || !ctx.userId) visibilityFilter = `AND c.visibility = 'public'`;
  const { rows } = await query(
    `SELECT c.id, c.channel_key, c.name, c.purpose, c.visibility,
            CASE WHEN m.user_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_member
       FROM team_channels c
       LEFT JOIN team_channel_members m
         ON m.channel_id = c.id AND m.user_id = $2
      WHERE c.tenant_id = $1
        AND c.archived_at IS NULL
        ${visibilityFilter}
        AND (
          c.visibility = 'public'
          OR $2::uuid IS NOT NULL AND m.user_id IS NOT NULL
        )
      ORDER BY c.channel_key`,
    [ctx.tenantId, ctx.userId || null],
  );
  void params;
  return { channels: rows };
}

async function toolTeamMessagesList(ctx, args) {
  const ch = await resolveChannel(ctx, args);
  const limit = clampLimit(args.limit, 50, 100);
  const { rows } = await query(
    `SELECT id, author_user_id, author_display_name, text, mention_user_ids,
            kind, meta, parent_message_id, edited_at, created_at
       FROM team_channel_messages
      WHERE channel_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ${limit}`,
    [ch.id],
  );
  return { channel: ch, messages: rows.reverse() };
}

async function toolTasksList(ctx, args) {
  const filters = ['tenant_id = $1'];
  const params = [ctx.tenantId];
  if (typeof args.status === 'string' && args.status.trim()) {
    const statuses = args.status.split(',').map((s) => s.trim()).filter(Boolean);
    params.push(statuses);
    filters.push(`status = ANY($${params.length})`);
  } else {
    filters.push(`status != 'cancelled'`);
  }
  if (typeof args.assignee === 'string' && args.assignee.trim()) {
    const assignee = args.assignee === 'me' ? ctx.userId : args.assignee.trim();
    if (assignee) {
      params.push(assignee);
      filters.push(`$${params.length} = ANY(assignee_user_ids)`);
    }
  }
  if (typeof args.property === 'string' && args.property.trim()) {
    params.push(args.property.trim());
    filters.push(`property_code = $${params.length}`);
  }
  if (typeof args.reservation === 'string' && args.reservation.trim()) {
    params.push(args.reservation.trim());
    filters.push(`reservation_guesty_id = $${params.length}`);
  }
  if (args.overdue === true) {
    filters.push(`due_date < CURRENT_DATE`);
    filters.push(`status IN ('todo', 'in_progress', 'paused', 'reported')`);
  }
  const limit = clampLimit(args.limit, 50, 100);
  const { rows } = await query(
    `SELECT id, title, description, status, priority, category, department,
            property_code, reservation_guesty_id, assignee_user_ids,
            due_date, due_time, created_at, updated_at
       FROM tasks
      WHERE ${filters.join(' AND ')}
      ORDER BY
        CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
        due_date ASC NULLS LAST,
        created_at DESC
      LIMIT ${limit}`,
    params,
  );
  return { tasks: rows };
}

async function toolWebsiteThreadsList(ctx, args) {
  const filters = [];
  const params = [];
  if (typeof args.status === 'string' && args.status.trim()) {
    params.push(args.status.trim());
    filters.push(`status = $${params.length}`);
  } else {
    filters.push(`status <> 'closed'`);
  }
  if (typeof args.query === 'string' && args.query.trim()) {
    params.push(`%${args.query.trim().toLowerCase()}%`);
    filters.push(`(LOWER(guest_email) LIKE $${params.length} OR LOWER(COALESCE(guest_name, '')) LIKE $${params.length})`);
  }
  const limit = clampLimit(args.limit, 50, 100);
  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
  const { rows } = await query(
    `SELECT id, guest_email, guest_name, guest_phone, status, last_event_type,
            last_event_at, guesty_reservation_id, guesty_listing_id,
            guesty_reservation_status, paid_at, notes
       FROM inbox_threads
       ${where}
      ORDER BY last_event_at DESC
      LIMIT ${limit}`,
    params,
  );
  void ctx;
  return { threads: rows };
}

async function toolWebsiteThreadsGet(_ctx, args) {
  const threadId = cleanString(args.threadId, 80);
  if (!threadId) throw new Error('threadId is required');
  const threadRes = await query(`SELECT * FROM inbox_threads WHERE id = $1`, [threadId]);
  if (threadRes.rows.length === 0) throw new Error('Thread not found');
  const eventsRes = await query(
    `SELECT id, reference, event_type, source, payload, signed_at, created_at
       FROM inbox_events
      WHERE thread_id = $1
      ORDER BY created_at ASC`,
    [threadId],
  );
  const jobsRes = await query(
    `SELECT id, job_type, status, attempts, next_attempt_at, last_error,
            payload, result, created_at, updated_at
       FROM inbox_guesty_jobs
      WHERE thread_id = $1
      ORDER BY created_at ASC`,
    [threadId],
  );
  return { thread: threadRes.rows[0], events: eventsRes.rows, guesty_jobs: jobsRes.rows };
}

async function toolFadSearch(ctx, args) {
  const q = cleanString(args.query, 200);
  if (!q) throw new Error('query is required');
  const like = `%${q.toLowerCase()}%`;
  const requested = new Set(Array.isArray(args.types) && args.types.length ? args.types : ['properties', 'reservations', 'tasks', 'team_messages', 'website_threads']);
  const limit = clampLimit(args.limit, 10, 50);
  const result = {};
  if (requested.has('properties')) {
    result.properties = (await query(
      `SELECT guesty_id, nickname, title, address_city, cohort
         FROM guesty_listings
        WHERE tenant_id = $1
          AND (LOWER(COALESCE(nickname, '')) LIKE $2 OR LOWER(COALESCE(title, '')) LIKE $2 OR LOWER(COALESCE(address_city, '')) LIKE $2)
        ORDER BY COALESCE(nickname, title) ASC NULLS LAST
        LIMIT ${limit}`,
      [ctx.tenantId, like],
    )).rows;
  }
  if (requested.has('reservations')) {
    result.reservations = (await query(
      `SELECT guesty_id, confirmation_code, status, check_in_date, check_out_date,
              guest_first_name, guest_last_name, listing_guesty_id
         FROM guesty_reservations
        WHERE tenant_id = $1
          AND (
            LOWER(COALESCE(confirmation_code, '')) LIKE $2
            OR LOWER(COALESCE(guest_first_name, '') || ' ' || COALESCE(guest_last_name, '')) LIKE $2
            OR LOWER(COALESCE(guest_email, '')) LIKE $2
          )
        ORDER BY check_in_date DESC NULLS LAST
        LIMIT ${limit}`,
      [ctx.tenantId, like],
    )).rows;
  }
  if (requested.has('tasks')) {
    result.tasks = (await query(
      `SELECT id, title, status, priority, due_date, property_code
         FROM tasks
        WHERE tenant_id = $1
          AND (LOWER(title) LIKE $2 OR LOWER(COALESCE(description, '')) LIKE $2)
        ORDER BY updated_at DESC
        LIMIT ${limit}`,
      [ctx.tenantId, like],
    )).rows;
  }
  if (requested.has('team_messages')) {
    result.team_messages = (await query(
      `SELECT m.id, c.channel_key, m.author_display_name, m.text, m.created_at
         FROM team_channel_messages m
         JOIN team_channels c ON c.id = m.channel_id
         LEFT JOIN team_channel_members member
           ON member.channel_id = c.id AND member.user_id = $3
        WHERE c.tenant_id = $1
          AND m.deleted_at IS NULL
          AND LOWER(m.text) LIKE $2
          AND (c.visibility = 'public' OR member.user_id IS NOT NULL)
        ORDER BY m.created_at DESC
        LIMIT ${limit}`,
      [ctx.tenantId, like, ctx.userId || null],
    )).rows;
  }
  if (requested.has('website_threads')) {
    result.website_threads = (await query(
      `SELECT id, guest_email, guest_name, status, last_event_type, last_event_at
         FROM inbox_threads
        WHERE LOWER(COALESCE(guest_email, '')) LIKE $1
           OR LOWER(COALESCE(guest_name, '')) LIKE $1
        ORDER BY last_event_at DESC
        LIMIT ${limit}`,
      [like],
    )).rows;
  }
  return result;
}

async function toolTeamMessageSend(ctx, args) {
  const text = cleanString(args.text, 8000);
  if (!text) throw new Error('text is required');
  const ch = await resolveChannel(ctx, args);
  const kind = ['text', 'system', 'task_link'].includes(args.kind) ? args.kind : 'text';
  let mentions = Array.isArray(args.mentions) ? args.mentions.filter((id) => uuidRe.test(String(id))) : [];
  if (mentions.length > 0) {
    const { rows } = await query(
      `SELECT id FROM users WHERE tenant_id = $1 AND is_active = TRUE AND id = ANY($2::uuid[])`,
      [ctx.tenantId, mentions],
    );
    const valid = new Set(rows.map((r) => r.id));
    mentions = mentions.filter((id) => valid.has(id));
  }
  const { rows } = await query(
    `INSERT INTO team_channel_messages
       (channel_id, author_user_id, author_display_name, text, mention_user_ids, kind, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING id, author_user_id, author_display_name, text, mention_user_ids, kind, meta, created_at`,
    [
      ch.id,
      ctx.userId,
      ctx.displayName || ctx.username || 'FridayOS MCP',
      text,
      mentions,
      kind,
      JSON.stringify({ source: 'mcp', clientId: ctx.clientId || null }),
    ],
  );
  await publishFadEvent({
    tenantId: ctx.tenantId,
    type: 'team.channel_message',
    payload: { channelId: ch.id, messageId: rows[0].id, authorUserId: ctx.userId },
  }).catch(() => {});
  if (mentions.length > 0) {
    await notifyUsers({
      tenantId: ctx.tenantId,
      userIds: mentions,
      type: 'team_channel_mention',
      title: `${ctx.displayName || ctx.username || 'Someone'} mentioned you in #${ch.channel_key}`,
      body: text.slice(0, 180),
      url: `/fad?m=inbox&team=channel:${ch.id}`,
      source: 'mcp',
      sourceId: rows[0].id,
      data: { channelId: ch.id, messageId: rows[0].id, isMention: true, emailNotification: true },
    });
  }
  return { channel: ch, message: rows[0] };
}

async function toolTasksCreate(ctx, args) {
  const title = cleanString(args.title, 300);
  if (!title) throw new Error('title is required');
  const priority = ['lowest', 'low', 'medium', 'high', 'urgent'].includes(args.priority) ? args.priority : 'medium';
  // Allowed statuses are defined in migration 071_tasks_ops_lifecycle_reconcile.sql
  // (the tasks_status_check constraint). Earlier whitelists included 'todo' and
  // 'awaiting_approval' which were removed in that lifecycle reconcile —
  // attempting to insert one of those now 400s the DB and surfaces as
  // `ask_friday_action_failed` in the Ask Friday action card. Ishant reported
  // this 2026-05-23 (feedback 77ff359b): create_task from Ask Friday for the
  // WCC4 maintenance task threw a tasks_status_check violation. Default is
  // now 'scheduled' (matches the column default in migration 071).
  const ALLOWED_STATUSES = ['reported', 'scheduled', 'ready', 'in_progress', 'paused', 'blocked', 'completed', 'closed', 'cancelled'];
  const status = ALLOWED_STATUSES.includes(args.status) ? args.status : 'scheduled';
  const assignees = Array.isArray(args.assignee_user_ids) ? args.assignee_user_ids.filter((id) => uuidRe.test(String(id))) : [];
  const tags = Array.isArray(args.tags) ? args.tags.map((t) => cleanString(t, 80)).filter(Boolean) : ['mcp'];
  const { rows } = await query(
    `INSERT INTO tasks (
       tenant_id, title, description, status, priority, source, visibility,
       department, property_code, reservation_guesty_id, requester_user_id,
       created_by_user_id, assignee_user_id, assignee_user_ids, due_date, tags
     )
     VALUES ($1, $2, $3, $4, $5, 'mcp', 'all', $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      ctx.tenantId,
      title,
      typeof args.description === 'string' ? args.description.slice(0, 4000) : null,
      status,
      priority,
      typeof args.department === 'string' ? args.department.slice(0, 80) : null,
      typeof args.property_code === 'string' ? args.property_code.slice(0, 120) : null,
      typeof args.reservation_guesty_id === 'string' ? args.reservation_guesty_id.slice(0, 120) : null,
      ctx.userId,
      ctx.userId,
      assignees[0] || null,
      assignees,
      typeof args.due_date === 'string' ? args.due_date : null,
      tags,
    ],
  );
  return { task: rows[0] };
}

async function toolTasksCommentAdd(ctx, args) {
  const taskId = cleanString(args.taskId, 80);
  const text = cleanString(args.text, 4000);
  if (!taskId || !text) throw new Error('taskId and text are required');
  const exists = await query(`SELECT id FROM tasks WHERE tenant_id = $1 AND id = $2`, [ctx.tenantId, taskId]);
  if (exists.rows.length === 0) throw new Error('Task not found');
  const mentions = Array.isArray(args.mentions) ? args.mentions.filter((id) => uuidRe.test(String(id))) : [];
  const { rows } = await query(
    `INSERT INTO task_comments (task_id, tenant_id, author_user_id, text, mentions)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [taskId, ctx.tenantId, ctx.userId, text, mentions],
  );
  return { comment: rows[0] };
}

async function toolActionRequestCreate(ctx, args) {
  const actionType = cleanString(args.actionType, 100);
  const payload = args.payload && typeof args.payload === 'object' ? args.payload : {};
  const riskLevel = ['medium', 'high', 'critical'].includes(args.riskLevel) ? args.riskLevel : 'high';
  const { rows } = await query(
    `INSERT INTO mcp_action_requests
       (tenant_id, requested_by_user_id, requested_by_client_id, action_type, risk_level, reason, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING *`,
    [
      ctx.tenantId,
      ctx.userId || null,
      ctx.clientId || null,
      actionType,
      riskLevel,
      typeof args.reason === 'string' ? args.reason.slice(0, 1000) : null,
      JSON.stringify(payload),
    ],
  );
  return {
    request: rows[0],
    note: 'Request created. A director/admin must call action.request.confirm before execution.',
  };
}

async function executeConfirmedAction(ctx, request) {
  const payload = request.payload || {};
  if (request.action_type === 'team_message_send') {
    return toolTeamMessageSend(ctx, payload);
  }
  if (request.action_type === 'website_thread_reply') {
    const threadId = cleanString(payload.threadId, 80);
    const body = cleanString(payload.body, 8000);
    if (!threadId || !body) throw new Error('website_thread_reply requires threadId and body');
    const subject = cleanString(payload.subject, 200) || 'Re: Your Friday enquiry';
    const threadRes = await query(`SELECT * FROM inbox_threads WHERE id = $1`, [threadId]);
    if (threadRes.rows.length === 0) throw new Error('Thread not found');
    const thread = threadRes.rows[0];
    const toEmail = thread.guest_email_raw || thread.guest_email;
    if (!toEmail) throw new Error('Thread has no guest email');
    const emailResult = await sendEmail({ to: toEmail, toName: thread.guest_name || undefined, subject, body });
    const eventRes = await query(
      `INSERT INTO inbox_events (thread_id, event_type, source, payload)
       VALUES ($1, 'staff.reply_sent', 'mcp', $2::jsonb)
       RETURNING id, created_at`,
      [threadId, JSON.stringify({
        channel: 'email',
        subject,
        body,
        to: toEmail,
        sent_by: { user_id: ctx.userId, display_name: ctx.displayName || ctx.username || null },
        provider: emailResult || null,
        mcp_action_request_id: request.id,
      })],
    );
    await query(
      `UPDATE inbox_threads
          SET status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
              last_event_type = 'staff.reply_sent',
              last_event_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [threadId],
    );
    return { ok: true, sentVia: 'email', event: eventRes.rows[0], provider: emailResult || null };
  }
  return {
    approved: true,
    executed: false,
    reason: `Action type "${request.action_type}" is approval-only in this build. A FAD operator must execute it manually.`,
  };
}

async function toolActionRequestConfirm(ctx, args) {
  const requestId = cleanString(args.requestId, 80);
  if (!uuidRe.test(requestId)) throw new Error('requestId must be a UUID');
  const decision = args.decision;
  if (decision === 'reject') {
    const { rows: rejected } = await query(
      `UPDATE mcp_action_requests
          SET status = 'rejected', approved_by_user_id = $3, approved_at = NOW(), error = $4
        WHERE tenant_id = $1 AND id = $2 AND status = 'pending'
        RETURNING *`,
      [ctx.tenantId, requestId, ctx.userId, cleanString(args.note, 1000) || null],
    );
    if (rejected.length === 0) throw new Error('Action request not found or no longer pending');
    return { request: rejected[0] };
  }
  const approved = await query(
    `UPDATE mcp_action_requests
        SET status = 'approved', approved_by_user_id = $3, approved_at = NOW()
      WHERE tenant_id = $1 AND id = $2 AND status = 'pending'
      RETURNING *`,
    [ctx.tenantId, requestId, ctx.userId],
  );
  if (approved.rows.length === 0) throw new Error('Action request not found or no longer pending');
  try {
    const result = await executeConfirmedAction(ctx, approved.rows[0]);
    const finalStatus = result?.executed === false ? 'approved' : 'executed';
    const done = await query(
      `UPDATE mcp_action_requests
          SET status = $3, result = $4::jsonb, executed_at = CASE WHEN $3 = 'executed' THEN NOW() ELSE executed_at END
        WHERE tenant_id = $1 AND id = $2
        RETURNING *`,
      [ctx.tenantId, requestId, finalStatus, JSON.stringify(result || {})],
    );
    return { request: done.rows[0], result };
  } catch (e) {
    const failed = await query(
      `UPDATE mcp_action_requests
          SET status = 'failed', error = $3
        WHERE tenant_id = $1 AND id = $2
        RETURNING *`,
      [ctx.tenantId, requestId, e.message],
    );
    return { request: failed.rows[0], error: e.message };
  }
}

const TOOL_HANDLERS = {
  'fad.status': toolFadStatus,
  'fad.search': toolFadSearch,
  'properties.list': toolPropertiesList,
  'reservations.list': toolReservationsList,
  'availability.get': toolAvailabilityGet,
  'team.users.list': toolTeamUsersList,
  'team.channels.list': toolTeamChannelsList,
  'team.messages.list': toolTeamMessagesList,
  'tasks.list': toolTasksList,
  'website.threads.list': toolWebsiteThreadsList,
  'website.threads.get': toolWebsiteThreadsGet,
  'team.message.send': toolTeamMessageSend,
  'tasks.create': toolTasksCreate,
  'tasks.comment.add': toolTasksCommentAdd,
  'action.request.create': toolActionRequestCreate,
  'action.request.confirm': toolActionRequestConfirm,
};

async function callTool(ctx, name, args = {}) {
  const def = TOOL_BY_NAME.get(name);
  if (!def) throw new Error(`Unknown tool: ${name}`);
  requireRisk(ctx, def.risk);
  const handler = TOOL_HANDLERS[name];
  if (!handler) throw new Error(`No handler registered for tool: ${name}`);
  return handler(ctx, args || {});
}

async function handleJsonRpcMessage(ctx, msg) {
  const id = msg?.id ?? null;
  const method = msg?.method;
  try {
    if (method === 'initialize') {
      return jsonRpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    }
    if (method === 'notifications/initialized') {
      return null;
    }
    if (method === 'ping') {
      return jsonRpcResult(id, {});
    }
    if (method === 'tools/list') {
      requireRisk(ctx, 'read');
      return jsonRpcResult(id, { tools: TOOL_DEFINITIONS.map(shapeToolForMcp) });
    }
    if (method === 'tools/call') {
      const name = msg?.params?.name;
      const args = msg?.params?.arguments || {};
      const result = await callTool(ctx, name, args);
      return jsonRpcResult(id, textContent(result));
    }
    if (method === 'resources/list' || method === 'prompts/list') {
      return jsonRpcResult(id, method === 'resources/list' ? { resources: [] } : { prompts: [] });
    }
    return jsonRpcError(id, -32601, `Method not found: ${method}`);
  } catch (e) {
    return jsonRpcError(id, -32000, e.message);
  }
}

router.get('/', attachMcpIdentity, (req, res) => {
  res.json({
    ok: true,
    serverInfo: SERVER_INFO,
    protocolVersion: PROTOCOL_VERSION,
    transport: 'json-rpc-over-http',
    endpoint: '/api/mcp',
    tools: TOOL_DEFINITIONS.map(({ name, phase, risk, description }) => ({ name, phase, risk, description })),
  });
});

router.get('/oauth-protected-resource', (req, res) => {
  const base = process.env.FAD_PUBLIC_URL || process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`;
  res.json({
    resource: `${base.replace(/\/$/, '')}/api/mcp`,
    authorization_servers: [`${base.replace(/\/$/, '')}/api/auth/token`],
    scopes_supported: ['mcp:read', 'mcp:write', 'mcp:high-risk'],
    bearer_methods_supported: ['header'],
  });
});

router.post('/', attachMcpIdentity, async (req, res) => {
  const ctx = req.mcpIdentity;
  const payload = req.body;
  if (Array.isArray(payload)) {
    const responses = (await Promise.all(payload.map((msg) => handleJsonRpcMessage(ctx, msg)))).filter(Boolean);
    return res.json(responses);
  }
  const response = await handleJsonRpcMessage(ctx, payload);
  if (!response) return res.status(202).end();
  return res.json(response);
});

module.exports = {
  router,
  TOOL_DEFINITIONS,
  callTool,
  handleJsonRpcMessage,
};
