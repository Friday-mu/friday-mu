'use strict';

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');

const router = express.Router();

const MAX_EVENTS_PER_BATCH = 100;

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function truncate(value, max) {
  if (value == null) return null;
  const str = String(value);
  return str.length > max ? str.slice(0, max) : str;
}

function normalizeEvent(raw, identity) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const eventType = truncate(raw.event_type || raw.eventType, 120);
  if (!eventType || !/^[a-zA-Z0-9_.:-]+$/.test(eventType)) return null;

  const eventData = raw.event_data && typeof raw.event_data === 'object' && !Array.isArray(raw.event_data)
    ? raw.event_data
    : (raw.eventData && typeof raw.eventData === 'object' && !Array.isArray(raw.eventData) ? raw.eventData : {});

  let createdAt = new Date();
  if (raw.timestamp || raw.created_at) {
    const parsed = new Date(raw.timestamp || raw.created_at);
    if (!Number.isNaN(parsed.getTime())) createdAt = parsed;
  }

  const userName = truncate(
    identity?.displayName || identity?.username || raw.user_name || raw.userName,
    160,
  );

  return {
    eventType,
    eventData,
    sessionId: truncate(raw.session_id || raw.sessionId, 160),
    userName,
    createdAt,
  };
}

router.post('/batch', attachIdentity, async (req, res) => {
  const rawEvents = Array.isArray(req.body?.events) ? req.body.events : [];
  if (rawEvents.length === 0) {
    return res.status(400).json({ error: 'events array required' });
  }
  if (rawEvents.length > MAX_EVENTS_PER_BATCH) {
    return res.status(413).json({ error: 'too_many_events', max: MAX_EVENTS_PER_BATCH });
  }

  const tenantId = req.tenantId;
  const userId = isUuid(req.identity?.userId) ? req.identity.userId : null;
  const events = rawEvents
    .map((event) => normalizeEvent(event, req.identity))
    .filter(Boolean);

  if (events.length === 0) {
    return res.status(400).json({ error: 'no_valid_events' });
  }

  try {
    for (const event of events) {
      await query(
        `INSERT INTO analytics_events (
           tenant_id, user_id, event_type, event_data, session_id, created_at, user_name
         ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
        [
          tenantId,
          userId,
          event.eventType,
          JSON.stringify(event.eventData || {}),
          event.sessionId,
          event.createdAt,
          event.userName,
        ],
      );
    }
    return res.json({ ok: true, inserted: events.length });
  } catch (e) {
    console.error('[analytics/events] batch insert failed:', e.message);
    return res.status(500).json({ error: 'analytics_insert_failed', message: e.message });
  }
});

module.exports = router;
module.exports._test = {
  isUuid,
  normalizeEvent,
};
