'use strict';

// FAD-native draft approve + send — Stage 2.1 port.
//
// Replaces the gmsProxy that forwarded POST /api/inbox/drafts/:id/approve
// to friday-gms. Owns the full send flow now: lookup draft from shared
// Postgres, translate to guest's language if non-English, send via
// fad-backend's own Guesty client, dedup-insert the resulting outbound
// message, transition the draft state.
//
// What's intentionally NOT here (stays in GMS for now):
//   - reject / revise / retry / fail / dismiss draft mutations
//     (touch the learning collector + draft regen — intelligence
//     layer, frozen per brief §8 until Stage 3).
//   - Auto-resolve / auto-summarize / Slack notify / SSE push
//     side-effects after a send. Also intelligence layer.
//
// What it DOES handle:
//   - Translate the body to the guest's language (using the same
//     translateText + getConversationLanguageFallback that the inbound
//     translation worker uses).
//   - WhatsApp 24h-window enforcement. Outside the window → 409 with
//     a clear error code; the browser-fallback path (Stage 2.2) takes
//     over for templates.
//   - guesty_message_id propagation + ON CONFLICT dedup so the inbound
//     webhook can't re-insert the same message.

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');
const { translateText, getConversationLanguageFallback } = require('../ai/translate');
const { guestyRequest } = require('../website_inbox/guesty');

const router = express.Router();

const FR_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const WA_WINDOW_MS = 24 * 60 * 60 * 1000;

// Guesty's per-channel module names. Mirrors friday-gms's mapping in
// services/guesty.ts so module_type stays consistent across both
// senders during the cutover window.
function channelToGuestyModule(channel) {
  const c = String(channel || '').toLowerCase();
  if (c.includes('airbnb')) return 'airbnb2';
  if (c.includes('booking')) return 'bookingCom';
  if (c.includes('whatsapp')) return 'whatsapp';
  if (c.includes('email')) return 'email';
  if (c.includes('sms')) return 'sms';
  return 'email'; // safe default — direct-booking guests have email
}

// Strip the in-prompt protocol tags GMS's KB composer wraps around
// reasoning / drafting metadata. They shouldn't ever leak into a sent
// message; this is the same defence GMS applies at send time.
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

router.post('/:id/approve', attachIdentity, async (req, res) => {
  const draftId = req.params.id;
  const body = req.body || {};
  // Reviewer comes from the JWT identity per the brief's audit-trail
  // requirement (JWT can't be spoofed, request body could).
  const reviewedBy =
    req.identity?.displayName
    || req.identity?.username
    || req.identity?.userId
    || 'fad-user';

  // Allow the caller to override the body (edited-before-send case).
  // Otherwise we'll read it from the draft row.
  const overrideBody = typeof body.draft_body === 'string' ? body.draft_body : null;
  // Channel override (manual route picker). Falls back to the
  // conversation's channel.
  const overrideChannel = typeof body.sent_via === 'string' ? body.sent_via : null;

  // Load draft + conversation in one query — saves a round-trip and
  // makes the state-machine check atomic vs. a concurrent reject.
  let draftRow;
  try {
    const { rows } = await query(
      `SELECT d.id, d.conversation_id, d.draft_body, d.state, d.confidence,
              c.guesty_conversation_id, c.channel, c.communication_channel,
              c.last_inbound_at, c.tenant_id
         FROM drafts d
         JOIN conversations c ON c.id = d.conversation_id
         WHERE d.id = $1
         LIMIT 1`,
      [draftId],
    );
    draftRow = rows[0];
  } catch (e) {
    console.error('[drafts/approve] db lookup failed:', e.message);
    return res.status(500).json({ error: 'lookup_failed', message: e.message });
  }
  if (!draftRow) {
    return res.status(404).json({ error: 'draft_not_found' });
  }
  if (draftRow.tenant_id !== FR_TENANT_ID) {
    // Multi-tenant lockdown — only FR tenant has Guesty creds today.
    return res.status(403).json({ error: 'tenant_not_supported' });
  }
  if (!['draft_ready', 'under_review', 'send_failed', 'send_queued'].includes(draftRow.state)) {
    return res.status(409).json({
      error: 'invalid_draft_state',
      message: `cannot approve draft in state ${draftRow.state}`,
    });
  }
  if (!draftRow.guesty_conversation_id) {
    return res.status(409).json({ error: 'conversation_not_synced', message: 'no guesty_conversation_id yet' });
  }

  const channel = (overrideChannel || draftRow.communication_channel || draftRow.channel || '').toLowerCase();
  if (!channel) {
    return res.status(400).json({ error: 'channel_required', message: 'cannot determine outbound channel' });
  }

  // WhatsApp 24h-window check. Outside the window we 409 with a code
  // the frontend uses to surface the "use a template" toast — the
  // template browser-fallback (Stage 2.2) is a separate endpoint.
  if (channel === 'whatsapp') {
    const lastInbound = draftRow.last_inbound_at;
    const windowOpen = lastInbound
      && (Date.now() - new Date(lastInbound).getTime()) < WA_WINDOW_MS;
    if (!windowOpen) {
      return res.status(409).json({
        error: 'whatsapp_window_expired',
        message: 'WhatsApp 24h conversation window closed — must use a template',
      });
    }
  }

  // ── Translation ──
  // Read the guest's most recent inbound language; if not English,
  // translate the outbound body before sending. Falls back to the
  // conversation's cached language for emoji-only / empty cases via
  // getConversationLanguageFallback (chain: last_detected_language →
  // latest inbound → 'en').
  const rawBody = stripProtocolTags(overrideBody || draftRow.draft_body || '');
  if (!rawBody.trim()) {
    return res.status(400).json({ error: 'empty_body', message: 'draft body is empty after sanitization' });
  }

  let guestLang = null;
  try {
    const langRow = await query(
      `SELECT original_language FROM messages
         WHERE conversation_id = $1
           AND direction = 'inbound'
           AND original_language IS NOT NULL
         ORDER BY created_at DESC LIMIT 1`,
      [draftRow.conversation_id],
    );
    guestLang = langRow.rows[0]?.original_language || null;
  } catch {
    /* best-effort */
  }
  if (!guestLang) {
    guestLang = await getConversationLanguageFallback(draftRow.conversation_id);
  }

  let messageBody = rawBody;
  let translatedContent = null;
  let sentLanguage = null;
  const isGuestNonEnglish = guestLang && guestLang.toLowerCase().split(/[-_]/)[0] !== 'en';
  if (isGuestNonEnglish) {
    try {
      const r = await translateText(rawBody, { conversationId: draftRow.conversation_id });
      // translateText returns { translated, sourceLang }. For an
      // English source going to a non-English guest we want the
      // OUTBOUND translation, which requires a target-language call.
      // The existing helper detects source + translates to English,
      // but it doesn't support arbitrary target languages today —
      // fall through to a direct Kimi call below.
      // (Placeholder: we use a second Kimi call for outbound. Future
      // optimization: extend translateText to take a target lang.)
      void r; // unused — see direct call below
      const targetTranslated = await translateOutbound(rawBody, guestLang);
      if (targetTranslated) {
        translatedContent = targetTranslated;
        messageBody = targetTranslated;
        sentLanguage = guestLang;
        console.log(`[drafts/approve] translated draft ${draftId} → ${guestLang} for sending`);
      }
    } catch (e) {
      console.warn(`[drafts/approve] outbound translation failed (sending in EN):`, e.message);
    }
  }

  // ── Send via Guesty ──
  let guestySendResult;
  try {
    guestySendResult = await sendViaGuesty(draftRow.guesty_conversation_id, messageBody, channel);
  } catch (e) {
    console.error(`[drafts/approve] guesty send failed for draft ${draftId}:`, e.message);
    // Mark the draft as send_failed so the frontend can offer a retry.
    await query(
      `UPDATE drafts SET state = 'send_failed', updated_at = NOW() WHERE id = $1`,
      [draftId],
    ).catch(() => {});
    return res.status(502).json({
      error: 'guesty_send_failed',
      message: e.message || 'upstream send error',
    });
  }
  const guestyMessageId =
    guestySendResult?._id
    || guestySendResult?.id
    || guestySendResult?.data?._id
    || guestySendResult?.message?._id
    || null;

  // ── Update draft state ──
  try {
    await query(
      `UPDATE drafts
         SET state = 'sent',
             sent_at = NOW(),
             translated_content = $2,
             sent_language = $3,
             sent_via = $4,
             send_method = 'api',
             reviewed_by = $5,
             updated_at = NOW()
         WHERE id = $1`,
      [draftId, translatedContent, sentLanguage, channel, reviewedBy],
    );
  } catch (e) {
    console.warn('[drafts/approve] draft state update failed:', e.message);
  }

  // ── Insert outbound message ──
  // Includes guesty_message_id so the inbound webhook's ON CONFLICT
  // dedups any racing insert. Also fills the dedup-fallback fields
  // (sender_name with "<reviewer> via Friday" matching GMS's old
  // pattern so the inbox bubble adapter renders consistently).
  const moduleType = channelToGuestyModule(channel);
  try {
    await query(
      `INSERT INTO messages (
         tenant_id, conversation_id, guesty_message_id, direction, body,
         translated_body, original_language,
         sender_name, sent_by, sent_via_system, module_type, created_at
       ) VALUES ($1, $2, $3, 'outbound', $4, $5, $6, $7, $8, 'friday', $9, NOW())
       ON CONFLICT (guesty_message_id) DO NOTHING`,
      [
        FR_TENANT_ID,
        draftRow.conversation_id,
        guestyMessageId,
        messageBody,
        sentLanguage ? rawBody : null,
        sentLanguage,
        `${reviewedBy} via Friday`,
        reviewedBy,
        moduleType,
      ],
    );
  } catch (e) {
    console.warn('[drafts/approve] message insert failed:', e.message);
  }

  // ── Touch conversation timestamps ──
  await query(
    `UPDATE conversations
       SET last_message_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
    [draftRow.conversation_id],
  ).catch(() => {});

  console.log(`[drafts/approve] ✓ draft ${draftId} sent via ${channel} (guesty_message_id=${guestyMessageId})`);
  return res.json({
    ok: true,
    draft: { id: draftId, state: 'sent' },
    sent_at: new Date().toISOString(),
    sent_via: channel,
    sent_language: sentLanguage,
    guesty_message_id: guestyMessageId,
  });
});

// Outbound translation — directional translate of a known-English body
// to a target language. The existing translateText detects + translates
// TO English; this is the inverse direction so we keep a thin Kimi call
// here. Future refactor: fold the target-lang parameter into translate.js.
async function translateOutbound(text, targetLang) {
  const axios = require('axios');
  const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
  const KIMI_MODEL = process.env.KIMI_MODEL || 'moonshot-v1-8k';
  if (!process.env.KIMI_API_KEY) return null;
  const system = `Translate the following message FROM English TO ${targetLang}. Preserve tone, warmth, line breaks, emoji and punctuation. Output ONLY the translation, no commentary, no labels.`;
  const { data } = await axios.post(
    `${KIMI_BASE_URL}/chat/completions`,
    {
      model: KIMI_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: text },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.KIMI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    },
  );
  const out = data?.choices?.[0]?.message?.content;
  return typeof out === 'string' && out.trim().length > 0 ? out.trim() : null;
}

// POST /communication/conversations/{id}/send-message — same endpoint
// shape friday-gms uses. Wrap our generic guestyRequest helper so
// callers don't reimplement the URL.
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

// ────────────────────────────────────────────────────────────────────
// POST /api/inbox/drafts/:id/reject
// Mark a pending draft as rejected. Captures the reviewer + an
// optional reason. Skips the learning-collector hook GMS does
// post-update — that's an intelligence-layer side effect (Stage 3).
// ────────────────────────────────────────────────────────────────────
router.post('/:id/reject', attachIdentity, async (req, res) => {
  const draftId = req.params.id;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : null;
  const reviewedBy =
    req.identity?.displayName
    || req.identity?.username
    || req.identity?.userId
    || 'fad-user';
  try {
    const { rows } = await query(
      `UPDATE drafts
         SET state = 'rejected',
             reviewed_by = $1,
             rejection_reason = $2,
             updated_at = NOW()
       WHERE id = $3
         AND state IN ('draft_ready', 'under_review')
       RETURNING *`,
      [reviewedBy, reason, draftId],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'draft_not_found', message: 'draft not in a reviewable state' });
    }
    console.log(`[drafts/reject] draft ${draftId} rejected by ${reviewedBy}${reason ? ` (${reason.slice(0, 80)})` : ''}`);
    res.json({ draft: rows[0] });
  } catch (e) {
    console.error('[drafts/reject] error:', e.message);
    res.status(500).json({ error: 'reject_failed', message: e.message });
  }
});

// ────────────────────────────────────────────────────────────────────
// POST /api/inbox/drafts/:id/retry
// Re-send a queued or failed draft. Same send orchestration as
// /approve — we just enter from a different starting state.
// Atomically claims the draft via state transition so concurrent
// retries can't double-send.
// ────────────────────────────────────────────────────────────────────
router.post('/:id/retry', attachIdentity, async (req, res) => {
  const draftId = req.params.id;
  const reviewedBy =
    req.identity?.displayName
    || req.identity?.username
    || req.identity?.userId
    || 'fad-user';
  try {
    // Atomic claim — transitions to 'sending' only if in send_queued
    // / send_failed. Prevents double-send race.
    const claim = await query(
      `UPDATE drafts d
         SET state = 'sending', retry_count = COALESCE(retry_count, 0) + 1, updated_at = NOW()
        FROM conversations c
       WHERE d.id = $1 AND d.conversation_id = c.id
         AND d.state IN ('send_queued', 'send_failed')
       RETURNING d.id, d.conversation_id, d.draft_body, d.translated_content, d.sent_via, d.sent_language,
                 c.guesty_conversation_id, c.channel, c.communication_channel, c.last_inbound_at, c.tenant_id`,
      [draftId],
    );
    if (claim.rows.length === 0) {
      // Could be: already sent (race lost), still sending, or just wrong state.
      const check = await query(`SELECT state FROM drafts WHERE id = $1`, [draftId]);
      const state = check.rows[0]?.state;
      if (state === 'sent') return res.json({ draft: { id: draftId, state }, message: 'already sent' });
      if (state === 'sending') return res.status(409).json({ error: 'send_in_progress' });
      return res.status(404).json({ error: 'draft_not_found', message: 'not in a retryable state' });
    }
    const draft = claim.rows[0];
    const channel = (draft.sent_via || draft.communication_channel || draft.channel || '').toLowerCase();

    // WhatsApp window check — same gating as the approve path.
    if (channel === 'whatsapp') {
      const windowOpen = draft.last_inbound_at
        && (Date.now() - new Date(draft.last_inbound_at).getTime()) < WA_WINDOW_MS;
      if (!windowOpen) {
        // Revert to send_failed so the user can try again after the
        // guest replies (or via template).
        await query(`UPDATE drafts SET state = 'send_failed', updated_at = NOW() WHERE id = $1`, [draftId]);
        return res.status(409).json({
          error: 'whatsapp_window_expired',
          message: 'WhatsApp 24h window closed — guest must message first',
        });
      }
    }

    // Reuse the body/translation already on the draft if present,
    // otherwise re-translate fresh from draft_body.
    const messageBody = stripProtocolTags(draft.translated_content || draft.draft_body || '');
    if (!messageBody.trim()) {
      await query(`UPDATE drafts SET state = 'send_failed', updated_at = NOW() WHERE id = $1`, [draftId]);
      return res.status(400).json({ error: 'empty_body' });
    }

    let sendResult;
    try {
      sendResult = await sendViaGuesty(draft.guesty_conversation_id, messageBody, channel);
    } catch (e) {
      await query(`UPDATE drafts SET state = 'send_failed', updated_at = NOW() WHERE id = $1`, [draftId]).catch(() => {});
      return res.status(502).json({ error: 'guesty_send_failed', message: e.message });
    }
    const guestyMessageId =
      sendResult?._id || sendResult?.id || sendResult?.data?._id
      || sendResult?.message?._id || null;

    await query(
      `UPDATE drafts SET state = 'sent', sent_at = NOW(), send_method = 'manual',
         reviewed_by = COALESCE(reviewed_by, $2), updated_at = NOW() WHERE id = $1`,
      [draftId, reviewedBy],
    );

    const moduleType = channelToGuestyModule(channel);
    await query(
      `INSERT INTO messages (
         tenant_id, conversation_id, guesty_message_id, direction, body,
         translated_body, original_language, sender_name, sent_by, sent_via_system, module_type, created_at
       ) VALUES ($1, $2, $3, 'outbound', $4, $5, $6, $7, $8, 'friday', $9, NOW())
       ON CONFLICT (guesty_message_id) DO NOTHING`,
      [
        FR_TENANT_ID,
        draft.conversation_id,
        guestyMessageId,
        messageBody,
        draft.sent_language ? draft.draft_body : null,
        draft.sent_language,
        `${reviewedBy} via Friday`,
        reviewedBy,
        moduleType,
      ],
    ).catch((e) => console.warn('[drafts/retry] message insert failed:', e.message));

    await query(
      `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [draft.conversation_id],
    ).catch(() => {});

    console.log(`[drafts/retry] ✓ draft ${draftId} sent via ${channel} (guesty_message_id=${guestyMessageId})`);
    res.json({
      ok: true,
      draft: { id: draftId, state: 'sent' },
      sent_at: new Date().toISOString(),
      sent_via: channel,
      guesty_message_id: guestyMessageId,
    });
  } catch (e) {
    console.error('[drafts/retry] error:', e.message);
    res.status(500).json({ error: 'retry_failed', message: e.message });
  }
});

// ────────────────────────────────────────────────────────────────────
// POST /api/inbox/drafts/:id/fail
// Manually mark a queued/sending draft as failed (cancels any
// pending auto-retry on the GMS side — N/A here since we don't run
// an auto-retry worker yet).
// ────────────────────────────────────────────────────────────────────
router.post('/:id/fail', attachIdentity, async (req, res) => {
  const draftId = req.params.id;
  try {
    const { rows } = await query(
      `UPDATE drafts
         SET state = 'send_failed', next_retry_at = NULL, updated_at = NOW()
       WHERE id = $1
         AND state IN ('send_queued', 'sending')
       RETURNING *`,
      [draftId],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'queued_draft_not_found' });
    }
    res.json({ draft: rows[0], message: 'marked as failed' });
  } catch (e) {
    console.error('[drafts/fail] error:', e.message);
    res.status(500).json({ error: 'fail_failed', message: e.message });
  }
});

// ────────────────────────────────────────────────────────────────────
// POST /api/inbox/drafts/:id/dismiss
// Remove a failed draft from the queue view (silent — no learning
// event, no rejection_reason).
// ────────────────────────────────────────────────────────────────────
router.post('/:id/dismiss', attachIdentity, async (req, res) => {
  const draftId = req.params.id;
  try {
    const { rows } = await query(
      `UPDATE drafts
         SET state = 'dismissed', next_retry_at = NULL, updated_at = NOW()
       WHERE id = $1
         AND state = 'send_failed'
       RETURNING *`,
      [draftId],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'failed_draft_not_found' });
    }
    res.json({ draft: rows[0], message: 'dismissed' });
  } catch (e) {
    console.error('[drafts/dismiss] error:', e.message);
    res.status(500).json({ error: 'dismiss_failed', message: e.message });
  }
});

module.exports = router;
