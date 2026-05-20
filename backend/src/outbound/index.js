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
//   guest + whatsapp|airbnb|booking|email  → friday-gms compose
//                                            (POST /api/conversations/<id>/compose)
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
    // ─── guest — friday-gms compose ─────────────────────────────────
    if (audience === 'guest') {
      if (!GUEST_CHANNELS.has(channel)) {
        return res.status(400).json({ error: `audience=guest does not support channel=${channel}` });
      }
      // friday-gms compose requires reviewed_by (audit) + sent_via
      // (channel reference). The legacy GMS dashboard passed them from
      // its session; we read them from the FAD user's JWT identity.
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
      const teamBody = {
        text: body,
        ...(Array.isArray(meta.mentions)        ? { mentions:        meta.mentions } : {}),
        ...(meta.parentMessageId                ? { parentMessageId: meta.parentMessageId } : {}),
        ...(Array.isArray(meta.attachmentIds)   ? { attachmentIds:   meta.attachmentIds } : {}),
        ...(meta.kind                           ? { kind:            meta.kind } : {}),
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
    const status = e.response?.status || 500;
    const upstreamError = e.response?.data?.error;
    console.error('[outbound/send] error:', upstreamError || e.message);
    res.status(status).json({
      error: upstreamError || e.message || 'send failed',
      ...(e.response?.data ? { upstream: e.response.data } : {}),
    });
  }
});

module.exports = { router };
