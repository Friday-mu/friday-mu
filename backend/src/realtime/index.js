'use strict';

const express = require('express');
const { pool, query } = require('../database/client');
const { attachIdentity, decodeJwt } = require('../design/auth');

const router = express.Router();
const clients = new Map();
let listenerStarted = false;
let listenerClient = null;

function eventName(type) {
  return String(type || 'fad_event').replace(/[^a-zA-Z0-9_.:-]/g, '_');
}

function writeSse(res, event) {
  res.write(`event: ${eventName(event.type)}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function broadcast(event) {
  const targetUserIds = Array.isArray(event.userIds) ? new Set(event.userIds.map(String)) : null;
  for (const [id, client] of clients) {
    if (targetUserIds && !targetUserIds.has(String(client.userId))) continue;
    try {
      writeSse(client.res, event);
    } catch {
      clients.delete(id);
    }
  }
}

async function startPgListener() {
  if (listenerStarted || !process.env.DATABASE_URL) return;
  listenerStarted = true;
  try {
    listenerClient = await pool.connect();
    await listenerClient.query('LISTEN fad_events');
    listenerClient.on('notification', (msg) => {
      if (msg.channel !== 'fad_events' || !msg.payload) return;
      try {
        broadcast(JSON.parse(msg.payload));
      } catch (e) {
        console.warn('[realtime] invalid pg_notify payload:', e.message);
      }
    });
    listenerClient.on('error', (e) => {
      console.warn('[realtime] pg listener error:', e.message);
    });
    console.log('[realtime] listening on pg channel fad_events');
  } catch (e) {
    console.warn('[realtime] pg listener unavailable:', e.message);
  }
}

function authEventSource(req, res, next) {
  const token = typeof req.query.token === 'string' ? req.query.token : null;
  if (token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${token}`;
  }
  return attachIdentity(req, res, next);
}

router.get('/stream', authEventSource, (req, res) => {
  const id = `${req.identity.userId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  clients.set(id, {
    res,
    userId: req.identity.userId,
    tenantId: req.tenantId,
  });
  writeSse(res, {
    type: 'connected',
    ts: new Date().toISOString(),
    userIds: [req.identity.userId],
  });
  const heartbeat = setInterval(() => {
    try {
      res.write(`: ${Date.now()}\n\n`);
    } catch {
      clearInterval(heartbeat);
      clients.delete(id);
    }
  }, 25_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(id);
  });
});

router.get('/notifications', attachIdentity, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, type, title, body, url, source, source_id, priority, data,
              read_at, created_at
         FROM fad_notifications
        WHERE tenant_id = $1 AND user_id = $2
        ORDER BY created_at DESC
        LIMIT 100`,
      [req.tenantId, req.identity.userId],
    );
    res.json({ notifications: rows });
  } catch (e) {
    console.error('[realtime] notifications list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/notifications/mark-read', attachIdentity, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  try {
    if (ids.length === 0) {
      await query(
        `UPDATE fad_notifications
            SET read_at = NOW()
          WHERE tenant_id = $1 AND user_id = $2 AND read_at IS NULL`,
        [req.tenantId, req.identity.userId],
      );
    } else {
      await query(
        `UPDATE fad_notifications
            SET read_at = NOW()
          WHERE tenant_id = $1 AND user_id = $2 AND id = ANY($3::uuid[])`,
        [req.tenantId, req.identity.userId, ids],
      );
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[realtime] notifications mark-read error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

async function publishFadEvent(input) {
  const event = {
    type: input.type || 'fad_event',
    ts: input.ts || new Date().toISOString(),
    tenantId: input.tenantId || null,
    userIds: Array.isArray(input.userIds) ? input.userIds.map(String) : undefined,
    payload: input.payload || {},
  };
  let publishedViaPg = false;
  if (process.env.DATABASE_URL) {
    try {
      await query('SELECT pg_notify($1, $2)', ['fad_events', JSON.stringify(event)]);
      publishedViaPg = !!listenerClient;
    } catch (e) {
      console.warn('[realtime] pg_notify failed:', e.message);
    }
  }
  if (!publishedViaPg) broadcast(event);
  return event;
}

async function notifyUsers({ tenantId, userIds, type, title, body = null, url = null, source = 'fad', sourceId = null, priority = 'normal', data = {} }) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!tenantId || ids.length === 0) return [];
  const inserted = [];
  for (const userId of ids) {
    try {
      const { rows } = await query(
        `INSERT INTO fad_notifications
           (tenant_id, user_id, type, title, body, url, source, source_id, priority, data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
         RETURNING id, user_id, type, title, body, url, source, source_id, priority, data, created_at`,
        [
          tenantId,
          userId,
          type,
          title,
          body,
          url,
          source,
          sourceId,
          priority,
          JSON.stringify(data || {}),
        ],
      );
      inserted.push(rows[0]);
    } catch (e) {
      console.warn(`[realtime] notification insert failed for ${userId}:`, e.message);
    }
  }
  await publishFadEvent({
    tenantId,
    userIds: ids,
    type: 'notification.created',
    payload: { notifications: inserted },
  });
  return inserted;
}

async function resolveGmWatchers(conversationId, tenantId) {
  const params = [tenantId];
  let conversationClause = '';
  if (conversationId) {
    params.push(conversationId);
    conversationClause = `
      OR u.id IN (
        SELECT DISTINCT rs.user_id::uuid
        FROM read_status rs
        WHERE rs.conversation_id = $2
          AND rs.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )`;
  }
  try {
    const { rows } = await query(
      `SELECT DISTINCT u.id
         FROM users u
        WHERE u.tenant_id = $1
          AND u.is_active = TRUE
          AND (
            u.role IN ('admin', 'director', 'manager')
            OR u.email LIKE '%@friday.mu'
            ${conversationClause}
          )
        LIMIT 50`,
      params,
    );
    return rows.map((r) => r.id);
  } catch (e) {
    console.warn('[realtime] resolveGmWatchers failed:', e.message);
    return [];
  }
}

function decodeTokenFromQuery(token) {
  const req = { headers: { authorization: token ? `Bearer ${token}` : '' } };
  return decodeJwt(req);
}

module.exports = {
  router,
  publishFadEvent,
  notifyUsers,
  resolveGmWatchers,
  startPgListener,
  decodeTokenFromQuery,
};
