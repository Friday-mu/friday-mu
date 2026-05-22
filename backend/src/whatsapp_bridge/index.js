'use strict';

const fs = require('fs');
const path = require('path');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const { query } = require('../database/client');
const { triggerDraftGeneration } = require('../inbox/draft_generator');
const { publishFadEvent } = require('../realtime');

const FR_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const PROVIDER_PREFIX = 'wa-web';
const DEFAULT_AUTH_DIR = path.join(process.cwd(), '.cache', 'whatsapp-bridge-auth');

const sensitiveRules = [
  {
    category: 'otp',
    re: /\b(otp|one[-\s]?time|verification|2fa|two[-\s]?factor|login code|security code)\b/i,
    reply: 'I cannot process login, OTP, or verification codes here. A Friday teammate will follow up through the proper channel.',
  },
  {
    category: 'payment_card',
    re: /\b(card number|credit card|debit card|cvv|cvc|expiry|expiration)\b|(?:\d[ -]?){13,19}/i,
    reply: 'Please do not send card or payment details here. A Friday teammate will follow up with a secure payment path.',
  },
  {
    category: 'sensitive_id',
    re: /\b(passport|national id|identity card|id card|driver'?s license|permit number)\b/i,
    reply: 'Please do not send passport or identity documents in this WhatsApp test chat. A Friday teammate will share the secure upload path.',
  },
  {
    category: 'medical_legal_emergency',
    re: /\b(ambulance|medical emergency|police|fire|lawyer|legal emergency|threat|violence|danger)\b/i,
    reply: 'This may need urgent human handling. Please contact local emergency services if anyone is at risk; the Friday team will follow up as soon as possible.',
  },
  {
    category: 'suspicious_link',
    re: /https?:\/\/(?!([^/\s]+\.)?friday\.mu\b)[^\s]+/i,
    reply: 'I cannot open or process external links in this WhatsApp test chat. A Friday teammate will review if needed.',
  },
];

function boolEnv(env, key, fallback = false) {
  if (env[key] == null || env[key] === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(env[key]).toLowerCase());
}

function intEnv(env, key, fallback, min = 0) {
  const value = Number(env[key]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.floor(value));
}

function normalizeJid(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes('@')) return raw.toLowerCase();
  const digits = raw.replace(/[^\d]/g, '');
  return digits ? `${digits}@s.whatsapp.net` : raw.toLowerCase();
}

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function loadConfig(env = process.env) {
  const allowlist = new Set(parseList(env.WHATSAPP_BRIDGE_ALLOWLIST).map(normalizeJid));
  return {
    enabled: boolEnv(env, 'WHATSAPP_BRIDGE_ENABLED', false),
    outboundEnabled: boolEnv(env, 'WHATSAPP_BRIDGE_OUTBOUND_ENABLED', false),
    killSwitch: boolEnv(env, 'WHATSAPP_BRIDGE_KILL_SWITCH', false),
    allowAll: boolEnv(env, 'WHATSAPP_BRIDGE_ALLOW_ALL', false),
    allowlist,
    authDir: env.WHATSAPP_BRIDGE_AUTH_DIR || DEFAULT_AUTH_DIR,
    pairingPhone: String(env.WHATSAPP_BRIDGE_PAIRING_PHONE || '').replace(/[^\d]/g, ''),
    chatRateLimitPerMin: intEnv(env, 'WHATSAPP_BRIDGE_CHAT_RATE_LIMIT_PER_MIN', 2, 1),
    globalRateLimitPerMin: intEnv(env, 'WHATSAPP_BRIDGE_GLOBAL_RATE_LIMIT_PER_MIN', 10, 1),
    groupTriggers: parseList(env.WHATSAPP_BRIDGE_GROUP_TRIGGERS || 'judith,ask friday,@judith')
      .map((item) => item.toLowerCase()),
    logLevel: env.WHATSAPP_BRIDGE_LOG_LEVEL || 'info',
  };
}

function isOutboundEnabled(config) {
  if (boolEnv(process.env, 'WHATSAPP_BRIDGE_KILL_SWITCH', config.killSwitch)) return false;
  return boolEnv(process.env, 'WHATSAPP_BRIDGE_OUTBOUND_ENABLED', config.outboundEnabled);
}

function ensureSecureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); } catch { /* best effort on non-POSIX FS */ }
  return dir;
}

function isGroupJid(jid) {
  return String(jid || '').endsWith('@g.us');
}

function phoneFromJid(jid) {
  const match = String(jid || '').match(/^(\d+)/);
  return match ? `+${match[1]}` : null;
}

function senderNameFromMessage(msg) {
  return msg?.pushName || phoneFromJid(msg?.key?.participant || msg?.key?.remoteJid) || 'WhatsApp guest';
}

function getMessageId(msg) {
  return msg?.key?.id || msg?.messageTimestamp || null;
}

function getTextFromBaileysMessage(msg) {
  const m = msg?.message || {};
  return [
    m.conversation,
    m.extendedTextMessage?.text,
    m.imageMessage?.caption,
    m.videoMessage?.caption,
    m.documentMessage?.caption,
    m.buttonsResponseMessage?.selectedDisplayText,
    m.listResponseMessage?.title,
  ].find((part) => typeof part === 'string' && part.trim())?.trim() || '';
}

function isAllowedChat(config, jid) {
  const normalized = normalizeJid(jid);
  if (config.allowAll) return true;
  return config.allowlist.has(normalized);
}

function shouldReplyToGroup(msg, text, config, ownJid) {
  if (!isGroupJid(msg?.key?.remoteJid)) return true;
  const context = msg?.message?.extendedTextMessage?.contextInfo ||
    msg?.message?.imageMessage?.contextInfo ||
    msg?.message?.videoMessage?.contextInfo ||
    {};
  const own = normalizeJid(ownJid || '');
  const mentioned = Array.isArray(context.mentionedJid)
    ? context.mentionedJid.map(normalizeJid).includes(own)
    : false;
  const quoted = Boolean(context.quotedMessage);
  const lower = String(text || '').toLowerCase();
  const triggered = config.groupTriggers.some((trigger) => trigger && lower.includes(trigger));
  return mentioned || quoted || triggered;
}

function detectSensitiveContent(text) {
  const value = String(text || '');
  const hit = sensitiveRules.find((rule) => rule.re.test(value));
  return hit ? { category: hit.category, reply: hit.reply } : null;
}

function createRateLimiter(now = () => Date.now()) {
  const globalHits = [];
  const chatHits = new Map();
  const prune = (arr, cutoff) => {
    while (arr.length && arr[0] < cutoff) arr.shift();
    return arr;
  };
  return {
    check(config, chatJid) {
      const cutoff = now() - 60_000;
      prune(globalHits, cutoff);
      const hits = prune(chatHits.get(chatJid) || [], cutoff);
      if (globalHits.length >= config.globalRateLimitPerMin) return { ok: false, scope: 'global' };
      if (hits.length >= config.chatRateLimitPerMin) return { ok: false, scope: 'chat' };
      globalHits.push(now());
      hits.push(now());
      chatHits.set(chatJid, hits);
      return { ok: true };
    },
  };
}

const rateLimiter = createRateLimiter();

async function logBridgeEvent({
  tenantId = FR_TENANT_ID,
  chatJid,
  senderJid = null,
  providerMessageId = null,
  conversationId = null,
  messageId = null,
  eventType,
  status = 'logged',
  payload = {},
  error = null,
}) {
  try {
    await query(
      `INSERT INTO whatsapp_bridge_events (
         tenant_id, chat_jid, sender_jid, provider_message_id,
         conversation_id, message_id, event_type, status, payload, error
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
       ON CONFLICT DO NOTHING`,
      [
        tenantId,
        chatJid,
        senderJid,
        providerMessageId,
        conversationId,
        messageId,
        eventType,
        status,
        JSON.stringify(payload || {}),
        error,
      ],
    );
  } catch (e) {
    console.warn('[whatsapp-bridge] audit log failed:', e.message);
  }
}

async function ensureBridgeConversation({ tenantId = FR_TENANT_ID, chatJid, guestName }) {
  const providerConversationId = `${PROVIDER_PREFIX}:${chatJid}`;
  const existing = await query(
    `SELECT id FROM conversations
      WHERE tenant_id = $1 AND guesty_conversation_id = $2
      LIMIT 1`,
    [tenantId, providerConversationId],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const displayName = guestName || phoneFromJid(chatJid) || chatJid;
  const inserted = await query(
    `INSERT INTO conversations (
       tenant_id, guesty_conversation_id, guest_name, guest_phone,
       channel, communication_channel, status, last_detected_language,
       last_message_at, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, 'whatsapp', 'whatsapp', 'active', 'en', NOW(), NOW(), NOW())
     RETURNING id`,
    [tenantId, providerConversationId, displayName, phoneFromJid(chatJid)],
  );
  return inserted.rows[0].id;
}

async function insertInboundMessage({ tenantId = FR_TENANT_ID, conversationId, providerMessageId, body, senderName, chatJid }) {
  const inserted = await query(
    `INSERT INTO messages (
       tenant_id, conversation_id, guesty_message_id, direction,
       body, sender_name, created_at, module_type, is_auto_response
     ) VALUES ($1, $2, $3, 'inbound', $4, $5, NOW(), 'whatsapp', false)
     ON CONFLICT (guesty_message_id) DO NOTHING
     RETURNING id`,
    [tenantId, conversationId, providerMessageId, body, senderName],
  );
  if (inserted.rows[0]) {
    await query(
      `UPDATE conversations
          SET last_message_at = NOW(),
              last_inbound_at = NOW(),
              updated_at = NOW(),
              status = CASE WHEN status = 'done' THEN 'active' ELSE status END
        WHERE id = $1`,
      [conversationId],
    );
    return { id: inserted.rows[0].id, duplicate: false };
  }
  const existing = await query(`SELECT id FROM messages WHERE guesty_message_id = $1 LIMIT 1`, [providerMessageId]);
  return { id: existing.rows[0]?.id || null, duplicate: true, chatJid };
}

async function insertOutboundMessage({ tenantId = FR_TENANT_ID, conversationId, providerMessageId, body }) {
  const inserted = await query(
    `INSERT INTO messages (
       tenant_id, conversation_id, guesty_message_id, direction, body,
       sender_name, sent_by, sent_via_system, module_type, created_at
     ) VALUES ($1, $2, $3, 'outbound', $4, 'Judith via burner WhatsApp', 'whatsapp-bridge', 'friday', 'whatsapp', NOW())
     ON CONFLICT (guesty_message_id) DO NOTHING
     RETURNING id`,
    [tenantId, conversationId, providerMessageId, body],
  );
  await query(
    `UPDATE conversations
        SET last_message_at = NOW(), updated_at = NOW()
      WHERE id = $1`,
    [conversationId],
  ).catch(() => {});
  return inserted.rows[0]?.id || null;
}

async function loadReadyDraft(draftId) {
  if (!draftId) return null;
  const { rows } = await query(
    `SELECT id, draft_body, confidence, state
       FROM drafts
      WHERE id = $1
      LIMIT 1`,
    [draftId],
  );
  return rows[0] || null;
}

async function sendText(sock, chatJid, text) {
  return sock.sendMessage(chatJid, { text });
}

async function handleInboundMessage({ sock, msg, config = loadConfig(), logger = console }) {
  const chatJid = msg?.key?.remoteJid;
  const senderJid = msg?.key?.participant || chatJid;
  const messageId = getMessageId(msg);
  const providerMessageId = messageId ? `${PROVIDER_PREFIX}:${messageId}` : null;
  if (!chatJid || !messageId || msg?.key?.fromMe || chatJid === 'status@broadcast') {
    return { skipped: 'not_inbound_user_message' };
  }

  const text = getTextFromBaileysMessage(msg);
  if (!text) return { skipped: 'empty_or_unsupported_message' };

  if (!isAllowedChat(config, chatJid)) {
    await logBridgeEvent({ chatJid, senderJid, providerMessageId, eventType: 'inbound_message', status: 'blocked', payload: { reason: 'allowlist' } });
    return { blocked: 'allowlist' };
  }

  if (!shouldReplyToGroup(msg, text, config, sock?.user?.id)) {
    await logBridgeEvent({ chatJid, senderJid, providerMessageId, eventType: 'group_message', status: 'skipped', payload: { reason: 'no_group_trigger' } });
    return { skipped: 'group_without_trigger' };
  }

  const rate = rateLimiter.check(config, chatJid);
  if (!rate.ok) {
    await logBridgeEvent({ chatJid, senderJid, providerMessageId, eventType: 'inbound_message', status: 'blocked', payload: { reason: 'rate_limit', scope: rate.scope } });
    return { blocked: `rate_limit_${rate.scope}` };
  }

  const conversationId = await ensureBridgeConversation({
    chatJid,
    guestName: senderNameFromMessage(msg),
  });
  const inserted = await insertInboundMessage({
    conversationId,
    providerMessageId,
    body: text,
    senderName: senderNameFromMessage(msg),
    chatJid,
  });
  await logBridgeEvent({
    chatJid,
    senderJid,
    providerMessageId,
    conversationId,
    messageId: inserted.id,
    eventType: 'inbound_message',
    status: inserted.duplicate ? 'skipped' : 'logged',
    payload: { duplicate: inserted.duplicate, textPreview: text.slice(0, 500) },
  });
  if (inserted.duplicate) return { duplicate: providerMessageId, conversationId, messageId: inserted.id };

  publishFadEvent({
    tenantId: FR_TENANT_ID,
    type: 'inbox.message_received',
    payload: { conversationId, messageId: inserted.id, source: 'whatsapp_bridge' },
  }).catch(() => {});

  const sensitive = detectSensitiveContent(text);
  if (sensitive) {
    await logBridgeEvent({ chatJid, senderJid, providerMessageId, conversationId, messageId: inserted.id, eventType: 'safety_block', status: 'blocked', payload: sensitive });
    if (isOutboundEnabled(config)) {
      const sent = await sendText(sock, chatJid, sensitive.reply);
      await insertOutboundMessage({
        conversationId,
        providerMessageId: `${PROVIDER_PREFIX}:out:${sent?.key?.id || Date.now()}`,
        body: sensitive.reply,
      });
      return { safetyReplySent: true, conversationId, messageId: inserted.id };
    }
    return { blocked: `sensitive_${sensitive.category}`, conversationId, messageId: inserted.id };
  }

  if (!isOutboundEnabled(config)) {
    await logBridgeEvent({ chatJid, senderJid, providerMessageId, conversationId, messageId: inserted.id, eventType: 'outbound_blocked', status: 'blocked', payload: { reason: 'kill_switch_or_outbound_disabled' } });
    return { inboundLogged: true, outboundBlocked: true, conversationId, messageId: inserted.id };
  }

  try {
    const draft = await triggerDraftGeneration(inserted.id, conversationId, { recoveryReason: 'whatsapp_bridge_auto_reply' });
    const ready = await loadReadyDraft(draft?.draftId);
    if (!ready || ready.state !== 'draft_ready' || !ready.draft_body) {
      await logBridgeEvent({ chatJid, senderJid, providerMessageId, conversationId, messageId: inserted.id, eventType: 'draft_generation', status: 'failed', payload: { draft }, error: draft?.error || 'draft_not_ready' });
      return { inboundLogged: true, draftFailed: true, conversationId, messageId: inserted.id, draft };
    }
    await logBridgeEvent({ chatJid, senderJid, providerMessageId, conversationId, messageId: inserted.id, eventType: 'draft_generation', status: 'generated', payload: { draftId: ready.id, confidence: ready.confidence } });
    const sent = await sendText(sock, chatJid, ready.draft_body);
    const outboundId = await insertOutboundMessage({
      conversationId,
      providerMessageId: `${PROVIDER_PREFIX}:out:${sent?.key?.id || Date.now()}`,
      body: ready.draft_body,
    });
    await logBridgeEvent({
      chatJid,
      senderJid,
      providerMessageId: sent?.key?.id ? `${PROVIDER_PREFIX}:out:${sent.key.id}` : null,
      conversationId,
      messageId: outboundId,
      eventType: 'outbound_send',
      status: 'sent',
      payload: { inboundMessageId: inserted.id, draftId: ready.id, rawProviderId: sent?.key?.id || null },
    });
    return { sent: true, conversationId, messageId: inserted.id, draftId: ready.id, outboundMessageId: outboundId };
  } catch (e) {
    logger.error?.(`[whatsapp-bridge] auto-reply failed for ${chatJid}: ${e.message}`);
    await logBridgeEvent({ chatJid, senderJid, providerMessageId, conversationId, messageId: inserted.id, eventType: 'outbound_send', status: 'failed', error: e.message });
    return { error: e.message, conversationId, messageId: inserted.id };
  }
}

async function startWhatsAppBridge(env = process.env) {
  const config = loadConfig(env);
  if (!config.enabled) {
    console.log('[whatsapp-bridge] disabled (WHATSAPP_BRIDGE_ENABLED is not true)');
    return null;
  }

  ensureSecureDir(config.authDir);
  const logger = P({ level: config.logLevel });
  const baileys = await import('@whiskeysockets/baileys');
  const makeWASocket = baileys.default || baileys.makeWASocket;
  const {
    DisconnectReason,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
  } = baileys;

  let reconnecting = false;
  const connect = async () => {
    const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
    const sock = makeWASocket({
      logger,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      getMessage: async () => undefined,
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        console.log('[whatsapp-bridge] scan this QR with the disposable burner WhatsApp account:');
        qrcode.generate(qr, { small: true });
      }
      if ((connection === 'connecting' || qr) && config.pairingPhone && !state.creds.registered) {
        const code = await sock.requestPairingCode(config.pairingPhone).catch((e) => {
          console.warn('[whatsapp-bridge] pairing code request failed:', e.message);
          return null;
        });
        if (code) console.log(`[whatsapp-bridge] pairing code for burner number ${config.pairingPhone}: ${code}`);
      }
      if (connection === 'open') console.log('[whatsapp-bridge] connected');
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.warn(`[whatsapp-bridge] connection closed (${statusCode || 'unknown'}), reconnect=${shouldReconnect}`);
        if (shouldReconnect && !reconnecting) {
          reconnecting = true;
          setTimeout(() => {
            reconnecting = false;
            connect().catch((e) => console.error('[whatsapp-bridge] reconnect failed:', e.message));
          }, 5_000);
        }
      }
    });

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages || []) {
        handleInboundMessage({ sock, msg, config, logger }).catch((e) => {
          console.error('[whatsapp-bridge] inbound handler failed:', e.message);
        });
      }
    });

    return sock;
  };

  return connect();
}

module.exports = {
  startWhatsAppBridge,
  handleInboundMessage,
  loadConfig,
  normalizeJid,
  getTextFromBaileysMessage,
  detectSensitiveContent,
  shouldReplyToGroup,
  createRateLimiter,
  _test: {
    FR_TENANT_ID,
    PROVIDER_PREFIX,
    isAllowedChat,
    isOutboundEnabled,
    ensureBridgeConversation,
    insertInboundMessage,
    insertOutboundMessage,
    logBridgeEvent,
  },
};
