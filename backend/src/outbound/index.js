'use strict';

// /api/outbound — unified outbound abstraction. Per locked decision §2
// (2026-05-17): one endpoint federates Guesty / Resend / Meta-when-live /
// TeamInbox so callers (Friday Consult, TeamInbox compose, future email
// outbound, future autonomous send) don't each duplicate per-channel
// routing logic.
//
// Contract:
//   POST /api/outbound/send
//   Body: {
//     audience: 'guest'|'owner'|'vendor'|'team'|'unclassified',
//     channel:  'whatsapp'|'airbnb'|'booking'|'email'|'team-channel'|'team-dm',
//     contextId: '<conversation_id|channel_id|dm_id>',
//     body:     '<message body>',
//     meta?:    { ... }   // channel-specific extras (mentions, scope, to, etc.)
//   }
//   Returns: { ok, messageId?, draftId?, sentAt }
//
// Routing matrix:
//   guest + whatsapp|airbnb|booking|email  → FAD direct Guesty send for
//                                            operator-authored replies;
//                                            GMS compose only for dormant
//                                            draft/AI compose modes
//   owner|vendor + email                   → Resend
//   team + team-channel|team-dm            → TeamInbox internal send
//   owner|vendor + whatsapp                → Meta Hub stub (clear blocker error)
//   unclassified + *                       → 400 'classify_first'
//
// Implementation note: each path is a thin wrapper around the existing
// per-channel mechanism, NOT a re-implementation. Wrong abstractions
// are worse than copy-paste; the goal is one entry point, not deeper
// reuse. Refactoring callers (Friday Consult send, TeamInbox compose)
// to use this endpoint is a separate cleanup commit.

const express = require('express');
const axios = require('axios');
const { attachIdentity } = require('../design/auth');
const { sendEmail } = require('../website_inbox/resend');
const { query } = require('../database/client');
const { guestyRequest } = require('../website_inbox/guesty');
const { translateText, getConversationLanguageFallback } = require('../ai/translate');
const { publishFadEvent } = require('../realtime');
const { detectActions } = require('../inbox/action_detector');
const { checkAutoResolve } = require('../inbox/auto_resolve');

const router = express.Router();

const GMS_BASE_URL = process.env.GMS_BASE_URL || 'https://admin.friday.mu';
// fad-backend internal loopback for the team path — re-uses the
// existing /api/team/* validation (mentions / parentMessageId /
// attachmentIds) instead of duplicating it.
const FAD_BACKEND_INTERNAL_URL = process.env.FAD_BACKEND_INTERNAL_URL
  || `http://127.0.0.1:${process.env.PORT || 3002}`;

const VALID_AUDIENCES = new Set(['guest', 'owner', 'vendor', 'team', 'unclassified']);
const GUEST_CHANNELS  = new Set(['whatsapp', 'airbnb', 'booking', 'email']);
const TEAM_CHANNELS   = new Set(['team-channel', 'team-dm']);
const EMAIL_CHANNELS  = new Set(['email']);
const FR_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const WA_WINDOW_MS = 24 * 60 * 60 * 1000;
const ACTION_DETECTOR_DISABLED = process.env.FAD_ACTION_DETECTOR_DISABLED === 'true';
const AUTO_RESOLVE_DISABLED = process.env.FAD_AUTO_RESOLVE_DISABLED === 'true';

router.post('/send', attachIdentity, async (req, res) => {
  const userId = req.identity?.userId;
  if (!userId) return res.status(401).json({ error: 'No user context' });

  const audience  = String(req.body?.audience  || '').toLowerCase();
  const channel   = String(req.body?.channel   || '').toLowerCase();
  const contextId = String(req.body?.contextId || '');
  const body      = req.body?.body ?? '';
  const meta      = req.body?.meta || {};

  if (!VALID_AUDIENCES.has(audience)) {
    return res.status(400).json({ error: `unknown audience: ${audience}` });
  }
  if (!channel) {
    return res.status(400).json({ error: 'channel required' });
  }
  if (!contextId && audience !== 'owner' && audience !== 'vendor') {
    return res.status(400).json({ error: 'contextId required' });
  }

  // ─── unclassified — caller must classify first ───────────────────
  if (audience === 'unclassified') {
    return res.status(400).json({
      error: 'classify_first',
      message: 'Classify the thread (guest / owner / vendor / team) before sending.',
    });
  }

  try {
    // ─── guest — FAD direct send, with GMS compose fallback for AI modes ─
    if (audience === 'guest') {
      if (!GUEST_CHANNELS.has(channel)) {
        return res.status(400).json({ error: `audience=guest does not support channel=${channel}` });
      }
      // Guest outbound audit requires reviewed_by + sent_via. The legacy
      // GMS dashboard passed them from its session; we read them from the
      // FAD user's JWT identity.
      // Fallback chain favours human-readable name → username → userId
      // so the audit log never shows "anonymous".
      const reviewedBy =
        req.identity?.displayName ||
        req.identity?.username ||
        req.identity?.userId ||
        'fad-user';
      const requestedMode = String(meta.mode || 'direct_send');
      const mode = requestedMode === 'manual' ? 'direct_send' : requestedMode;
      const instruction = meta.instruction || (requestedMode === 'manual' ? body : undefined);
      // Operator-authored sends are FAD-native. Proxying this through
      // GMS compose regressed when the public admin host stopped exposing
      // /api/conversations/:id/compose; draft/AI compose can still proxy.
      if (mode === 'direct_send') {
        const result = await sendGuestDirect({
          tenantId: req.tenantId,
          conversationId: contextId,
          body,
          channel,
          reviewedBy,
        });
        return res.json(result);
      }
      const composeBody = {
        mode,
        body,
        channel,
        reviewed_by: reviewedBy,
        sent_via: channel,
        ...(instruction ? { instruction } : {}),
        ...(meta.scope       ? { scope:       meta.scope       } : {}),
      };
      const { data } = await axios.post(
        `${GMS_BASE_URL}/api/conversations/${encodeURIComponent(contextId)}/compose`,
        composeBody,
        {
          timeout: 30_000,
          headers: {
            'Content-Type': 'application/json',
            Authorization: req.headers.authorization,
          },
        },
      );
      return res.json({
        ok: true,
        // GMS compose response shape varies by mode — surface whatever
        // it gives us as `upstream` for callers that want it.
        messageId: data?.message_id || data?.sent_message_id || null,
        draftId:   data?.draft_id   || data?.draft?.id        || null,
        sentAt:    new Date().toISOString(),
        upstream:  data,
      });
    }

    // ─── owner / vendor ─────────────────────────────────────────────
    if (audience === 'owner' || audience === 'vendor') {
      if (channel === 'whatsapp') {
        // Meta Hub blocker — return a clear pointer instead of a
        // mystery 500. WhatsApp Business API for owner/vendor goes
        // through Meta Hub which isn't wired yet (separate workstream).
        return res.status(503).json({
          error: 'meta_hub_not_wired',
          message: 'WhatsApp for owners/vendors goes through Meta Hub which is not yet wired. Use email for now.',
        });
      }
      if (EMAIL_CHANNELS.has(channel)) {
        const to       = meta.to       || meta.toEmail;
        const toName   = meta.toName;
        const subject  = meta.subject  || `Friday Retreats — ${audience === 'owner' ? 'owner' : 'vendor'} message`;
        const replyTo  = meta.replyTo;
        if (!to) {
          return res.status(400).json({ error: 'meta.to (recipient email) required for email channel' });
        }
        const data = await sendEmail({ to, toName, subject, body, replyTo });
        return res.json({
          ok: true,
          messageId: data?.id || null,
          sentAt:    new Date().toISOString(),
          upstream:  data,
        });
      }
      return res.status(400).json({ error: `audience=${audience} does not support channel=${channel}` });
    }

    // ─── team — TeamInbox internal send (loopback) ──────────────────
    if (audience === 'team') {
      if (!TEAM_CHANNELS.has(channel)) {
        return res.status(400).json({ error: `audience=team only supports team-channel or team-dm` });
      }
      const path = channel === 'team-channel'
        ? `/api/team/channels/${encodeURIComponent(contextId)}/messages`
        : `/api/team/dms/${encodeURIComponent(contextId)}/messages`;
      const messageMeta = meta && typeof meta === 'object' && !Array.isArray(meta) ? { ...meta } : {};
      delete messageMeta.mentions;
      delete messageMeta.parentMessageId;
      delete messageMeta.attachmentIds;
      delete messageMeta.kind;
      const teamBody = {
        text: body,
        ...(Array.isArray(meta.mentions)        ? { mentions:        meta.mentions } : {}),
        ...(meta.parentMessageId                ? { parentMessageId: meta.parentMessageId } : {}),
        ...(Array.isArray(meta.attachmentIds)   ? { attachmentIds:   meta.attachmentIds } : {}),
        ...(meta.kind                           ? { kind:            meta.kind } : {}),
        ...(Object.keys(messageMeta).length > 0 ? { meta:            messageMeta } : {}),
      };
      const { data } = await axios.post(`${FAD_BACKEND_INTERNAL_URL}${path}`, teamBody, {
        timeout: 15_000,
        headers: {
          'Content-Type': 'application/json',
          Authorization: req.headers.authorization,
        },
      });
      return res.json({
        ok: true,
        messageId: data?.message?.id || null,
        sentAt:    data?.message?.ts || new Date().toISOString(),
        upstream:  data,
      });
    }

    return res.status(400).json({ error: `unknown (audience, channel) combination: ${audience} + ${channel}` });
  } catch (e) {
    const status = e.statusCode || e.response?.status || 500;
    const upstreamError = e.code || e.response?.data?.error;
    console.error('[outbound/send] error:', upstreamError || e.message);
    res.status(status).json({
      error: upstreamError || e.message || 'send failed',
      message: e.message,
      ...(e.response?.data ? { upstream: e.response.data } : {}),
    });
  }
});

function channelToGuestyModule(channel) {
  const c = String(channel || '').toLowerCase();
  if (c.includes('airbnb')) return 'airbnb2';
  if (c.includes('booking')) return 'bookingCom';
  if (c.includes('whatsapp')) return 'whatsapp';
  if (c.includes('email')) return 'email';
  if (c.includes('sms')) return 'sms';
  return 'email';
}

function stripProtocolTags(text) {
  if (!text) return text;
  return String(text)
    .replace(/\[DRAFT_UPDATE\][\s\S]*?\[\/DRAFT_UPDATE\]/g, '')
    .replace(/\[TEACH\][\s\S]*?\[\/TEACH\]/g, '')
    .replace(/\[REASONING\][\s\S]*?\[\/REASONING\]/g, '')
    .replace(/\[DRAFT\][\s\S]*?\[\/DRAFT\]/g, '')
    .replace(/\[REVISION_REQUEST\]/g, '')
    .replace(/\[COMPOSE_LEARNING\]/g, '')
    .replace(/\[LEARNING_DETECTED\]/g, '')
    .replace(/\[CONTEXT_REFRESH\]/g, '')
    .replace(/\[STR_KB\]/g, '')
    .replace(/\[SALES_KB\]/g, '')
    .trim();
}

async function sendViaGuesty(guestyConversationId, body, channel) {
  const moduleType = channelToGuestyModule(channel);
  const { data } = await guestyRequest({
    method: 'POST',
    path: `/communication/conversations/${encodeURIComponent(guestyConversationId)}/send-message`,
    data: {
      body,
      module: { type: moduleType },
    },
  });
  return data;
}

// 2026-05-23 — migrated from direct Kimi axios to the shared
// Gemini-primary / Kimi-2.6-fallback helper. Mirrors drafts_send.js's
// translateOutbound — both should call the same helper.
async function translateOutbound(text, targetLang) {
  const { runTextCompletion } = require('../ai/gemini_first');
  const system = `Translate the following message FROM English TO ${targetLang}. Preserve tone, warmth, line breaks, emoji and punctuation. Output ONLY the translation, no commentary, no labels.`;
  const result = await runTextCompletion({
    system,
    user: text,
    temperature: 0.3,
    maxTokens: 2000,
    timeoutMs: 90_000,
    feature: 'outbound_translate',
  });
  if (!result.ok || !result.text) return null;
  return result.text.trim().length > 0 ? result.text.trim() : null;
}

function extractGuestyMessageId(result) {
  return result?._id
    || result?.id
    || result?.data?._id
    || result?.data?.id
    || result?.message?._id
    || result?.message?.id
    || null;
}

async function sendGuestDirect({ tenantId, conversationId, body, channel, reviewedBy }) {
  const { rows } = await query(
    `SELECT id, tenant_id, guesty_conversation_id, channel, communication_channel,
            last_inbound_at, guest_name, property_name
       FROM conversations
      WHERE id = $1
        AND tenant_id = $2
      LIMIT 1`,
    [conversationId, tenantId],
  );
  const conversation = rows[0];
  if (!conversation) {
    const err = new Error('Conversation not found');
    err.statusCode = 404;
    err.code = 'conversation_not_found';
    throw err;
  }
  if (conversation.tenant_id !== FR_TENANT_ID) {
    const err = new Error('Guesty sending is only configured for the FR tenant');
    err.statusCode = 403;
    err.code = 'tenant_not_supported';
    throw err;
  }
  if (!conversation.guesty_conversation_id) {
    const err = new Error('Conversation is not synced to Guesty yet');
    err.statusCode = 409;
    err.code = 'conversation_not_synced';
    throw err;
  }

  const outboundChannel = String(channel || conversation.communication_channel || conversation.channel || '').toLowerCase();
  if (!outboundChannel) {
    const err = new Error('Cannot determine outbound channel');
    err.statusCode = 400;
    err.code = 'channel_required';
    throw err;
  }
  if (outboundChannel === 'whatsapp') {
    const lastInbound = conversation.last_inbound_at;
    const windowOpen = lastInbound
      && (Date.now() - new Date(lastInbound).getTime()) < WA_WINDOW_MS;
    if (!windowOpen) {
      const err = new Error('WhatsApp 24h conversation window closed — must use a template');
      err.statusCode = 409;
      err.code = 'whatsapp_window_expired';
      throw err;
    }
  }

  const rawBody = stripProtocolTags(body || '');
  if (!rawBody.trim()) {
    const err = new Error('Message body is empty after sanitization');
    err.statusCode = 400;
    err.code = 'empty_body';
    throw err;
  }

  let guestLang = null;
  try {
    const langRow = await query(
      `SELECT original_language FROM messages
         WHERE conversation_id = $1
           AND direction = 'inbound'
           AND original_language IS NOT NULL
         ORDER BY created_at DESC LIMIT 1`,
      [conversationId],
    );
    guestLang = langRow.rows[0]?.original_language || null;
  } catch {
    // best-effort
  }
  if (!guestLang) {
    guestLang = await getConversationLanguageFallback(conversationId);
  }

  let messageBody = rawBody;
  let translatedContent = null;
  let sentLanguage = null;
  const isGuestNonEnglish = guestLang && guestLang.toLowerCase().split(/[-_]/)[0] !== 'en';
  if (isGuestNonEnglish) {
    try {
      await translateText(rawBody, { conversationId });
      const targetTranslated = await translateOutbound(rawBody, guestLang);
      if (targetTranslated) {
        translatedContent = targetTranslated;
        messageBody = targetTranslated;
        sentLanguage = guestLang;
      }
    } catch (e) {
      console.warn('[outbound] guest direct outbound translation failed; sending original:', e.message);
    }
  }

  let guestySendResult;
  try {
    guestySendResult = await sendViaGuesty(conversation.guesty_conversation_id, messageBody, outboundChannel);
  } catch (e) {
    const err = new Error(e.message || 'Failed to send via Guesty');
    err.statusCode = 502;
    err.code = 'guesty_send_failed';
    throw err;
  }

  const guestyMessageId = extractGuestyMessageId(guestySendResult);
  const moduleType = channelToGuestyModule(outboundChannel);
  await query(
    `INSERT INTO messages (
       tenant_id, conversation_id, guesty_message_id, direction, body,
       translated_body, original_language,
       sender_name, sent_by, sent_via_system, module_type, created_at
     ) VALUES ($1, $2, $3, 'outbound', $4, $5, $6, $7, $8, 'friday', $9, NOW())
     ON CONFLICT (guesty_message_id) DO NOTHING`,
    [
      tenantId,
      conversationId,
      guestyMessageId,
      messageBody,
      sentLanguage ? rawBody : null,
      sentLanguage,
      `${reviewedBy} via Friday`,
      reviewedBy,
      moduleType,
    ],
  ).catch((e) => console.warn('[outbound] guest direct message insert failed:', e.message));

  await query(
    `UPDATE conversations
        SET last_message_at = NOW(), updated_at = NOW(), next_steps = NULL
      WHERE id = $1`,
    [conversationId],
  ).catch(() => {});
  await query(
    `UPDATE drafts
        SET state = 'superseded', updated_at = NOW()
      WHERE conversation_id = $1
        AND state IN ('draft_ready', 'under_review', 'friday_drafting', 'generation_failed', 'send_queued', 'send_failed')`,
    [conversationId],
  ).catch((e) => console.warn('[outbound] guest direct stale draft supersede failed:', e.message));

  publishFadEvent({
    tenantId,
    type: 'inbox.message_sent',
    payload: {
      conversationId,
      guestyMessageId,
      channel: outboundChannel,
      source: 'outbound',
    },
  }).catch(() => {});

  if (!ACTION_DETECTOR_DISABLED) {
    detectActions({
      draftBody: messageBody,
      conversationId,
      guestName: conversation.guest_name || null,
      propertyCode: conversation.property_name || null,
    }).catch((e) => console.error('[outbound] guest direct action-detector failed:', e.message));
  }
  if (!AUTO_RESOLVE_DISABLED) {
    checkAutoResolve(conversationId, messageBody)
      .catch((e) => console.error('[outbound] guest direct auto-resolve failed:', e.message));
  }

  return {
    ok: true,
    messageId: guestyMessageId,
    sentAt: new Date().toISOString(),
    upstream: guestySendResult,
  };
}

module.exports = { router };
