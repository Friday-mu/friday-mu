'use strict';

const { query } = require('../database/client');

const WA_WINDOW_MS = 24 * 60 * 60 * 1000;

function isWhatsAppModule(value) {
  const text = String(value || '').toLowerCase();
  return text.includes('whatsapp') || text === 'wa';
}

function isWithinWhatsAppWindow(value, now = Date.now()) {
  if (!value) return false;
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return false;
  return now - ts < WA_WINDOW_MS;
}

async function loadLastInboundWhatsAppAt(conversationId, queryFn = query) {
  if (!conversationId) return null;
  const { rows } = await queryFn(
    `SELECT MAX(m.created_at) AS last_whatsapp_inbound_at
       FROM messages m
       LEFT JOIN conversations c ON c.id = m.conversation_id
      WHERE m.conversation_id = $1
        AND m.direction = 'inbound'
        AND (
          LOWER(COALESCE(m.module_type, '')) LIKE '%whatsapp%'
          OR (
            NULLIF(TRIM(COALESCE(m.module_type, '')), '') IS NULL
            AND LOWER(COALESCE(c.communication_channel, c.channel, '')) LIKE '%whatsapp%'
          )
        )`,
    [conversationId],
  );
  return rows[0]?.last_whatsapp_inbound_at || null;
}

async function getWhatsAppWindowState(conversationId, queryFn = query, now = Date.now()) {
  const lastInboundAt = await loadLastInboundWhatsAppAt(conversationId, queryFn);
  if (!lastInboundAt) {
    return {
      open: false,
      lastInboundAt: null,
      expiresAt: null,
    };
  }
  const expiresAt = new Date(new Date(lastInboundAt).getTime() + WA_WINDOW_MS).toISOString();
  return {
    open: isWithinWhatsAppWindow(lastInboundAt, now),
    lastInboundAt,
    expiresAt,
  };
}

module.exports = {
  WA_WINDOW_MS,
  isWhatsAppModule,
  isWithinWhatsAppWindow,
  loadLastInboundWhatsAppAt,
  getWhatsAppWindowState,
};
