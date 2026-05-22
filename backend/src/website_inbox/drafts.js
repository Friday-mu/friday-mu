'use strict';

// Website-inbox AI drafts.
//
// Website-originated threads are not Guesty conversations, so they must
// not be forced into the GMS `drafts` table or the Guesty send path.
// We keep their draft lifecycle inside inbox_events, validate drafts
// against the latest website event before sending, and continue the
// guest conversation by email through the existing website reply path.

const { query } = require('../database/client');
const { defaultComposer } = require('../knowledge/composer');
const { buildRuntimeKnowledgeBlock } = require('../knowledge/runtime_context');
const { generateDraftReply, DRAFT_MODEL } = require('../ai/kimi_draft');
const { loadTeachingsBlock, loadActionFeedbackBlock } = require('../inbox/learning_context');
const { publishFadEvent } = require('../realtime');
const {
  stripAIPreamble,
  correctCurrencyFormatting,
  detectTaskSignals,
  OPERATOR_DRAFT_LANGUAGE_CONTRACT,
} = require('../inbox/draft_generator');
const { sendEmail } = require('./resend');

const FR_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const WEBSITE_DRAFT_SOURCE_EVENTS = new Set([
  'booking.request_submitted',
  'experience.enquiry_submitted',
  'contact.form_submitted',
  'owner.enquiry_submitted',
]);

const ACTIONABLE_STATES = new Set([
  'friday_drafting',
  'draft_ready',
  'under_review',
  'generation_failed',
]);

const DRAFT_EVENT_TYPES_SQL = "('ai.friday_drafting', 'ai.draft_ready', 'ai.draft_generation_failed')";

function shouldAutoDraftWebsiteEvent(eventType) {
  return WEBSITE_DRAFT_SOURCE_EVENTS.has(String(eventType || ''));
}

function draftGenerationDisabled() {
  return process.env.FAD_DRAFTGEN_DISABLED === 'true'
    || process.env.FAD_WEBSITE_DRAFTGEN_DISABLED === 'true';
}

function payloadText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const direct = payload.body || payload.message || payload.question || payload.notes || payload.comments;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const parts = [
    payload.residence_slug ? `Residence: ${payload.residence_slug}` : null,
    payload.check_in && payload.check_out ? `Dates: ${payload.check_in} - ${payload.check_out}` : null,
    payload.checkIn && payload.checkOut ? `Dates: ${payload.checkIn} - ${payload.checkOut}` : null,
    payload.party_size || payload.partySize || payload.guests ? `Guests: ${payload.party_size || payload.partySize || payload.guests}` : null,
    payload.reference ? `Reference: ${payload.reference}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join('\n') : JSON.stringify(payload, null, 2).slice(0, 1200);
}

function guestFromThread(thread) {
  return thread?.guest_name || thread?.guest_email_raw || thread?.guest_email || 'Guest';
}

function formatEventForPrompt(event) {
  const payload = event.payload || {};
  const stamp = event.created_at ? new Date(event.created_at).toISOString() : 'unknown time';
  const source = event.source === 'fad' || String(event.event_type || '').startsWith('staff.')
    ? 'Friday'
    : 'Guest / website';
  return `[${stamp}] ${source} (${event.event_type}):\n${payloadText(payload)}`;
}

function draftRowToResponse(row) {
  const payload = row.payload || {};
  return {
    id: row.id,
    state: payload.state || 'draft_ready',
    draft_body: payload.draft_body || payload.body || '',
    confidence: payload.confidence ?? null,
    revision_number: payload.revision_number || 1,
    revision_instruction: payload.revision_instruction || null,
    model_used: payload.model_used || null,
    created_at: row.created_at,
    updated_at: payload.updated_at || payload.generated_at || row.created_at,
    source_event_id: payload.source_event_id || null,
  };
}

async function latestGuestEvent(threadId) {
  const { rows } = await query(
    `SELECT id, event_type, source, payload, created_at
       FROM inbox_events
      WHERE thread_id = $1
        AND source <> 'fad'
        AND event_type NOT LIKE 'ai.%'
        AND event_type NOT LIKE 'staff.%'
      ORDER BY created_at DESC, id::text DESC
      LIMIT 1`,
    [threadId],
  );
  return rows[0] || null;
}

async function latestStaffReply(threadId) {
  const { rows } = await query(
    `SELECT id, created_at
       FROM inbox_events
      WHERE thread_id = $1
        AND event_type = 'staff.reply_sent'
      ORDER BY created_at DESC, id::text DESC
      LIMIT 1`,
    [threadId],
  );
  return rows[0] || null;
}

async function getVisibleDraftsForThread(threadId) {
  const { rows } = await query(
    `WITH latest_guest_event AS (
       SELECT id, created_at
         FROM inbox_events
        WHERE thread_id = $1
          AND source <> 'fad'
          AND event_type NOT LIKE 'ai.%'
          AND event_type NOT LIKE 'staff.%'
        ORDER BY created_at DESC, id::text DESC
        LIMIT 1
     ),
     latest_staff_reply AS (
       SELECT created_at
         FROM inbox_events
        WHERE thread_id = $1
          AND event_type = 'staff.reply_sent'
        ORDER BY created_at DESC, id::text DESC
        LIMIT 1
     )
     SELECT d.id, d.payload, d.created_at
       FROM inbox_events d
       JOIN latest_guest_event l ON TRUE
       LEFT JOIN latest_staff_reply sr ON TRUE
      WHERE d.thread_id = $1
        AND d.event_type IN ${DRAFT_EVENT_TYPES_SQL}
        AND d.payload->>'source_event_id' = l.id::text
        AND COALESCE(d.payload->>'state', '') IN ('friday_drafting', 'draft_ready', 'under_review', 'generation_failed')
        AND (sr.created_at IS NULL OR sr.created_at <= l.created_at)
      ORDER BY d.created_at DESC, d.id::text DESC
      LIMIT 5`,
    [threadId],
  );
  return rows.map(draftRowToResponse);
}

function assertDraftCurrent({ draft, latestEvent, latestReply }) {
  const state = draft?.payload?.state || '';
  const sourceEventId = draft?.payload?.source_event_id || null;
  if (!draft || !ACTIONABLE_STATES.has(state)) {
    const err = new Error('draft_not_reviewable');
    err.status = 409;
    err.code = 'draft_not_reviewable';
    throw err;
  }
  if (!latestEvent || String(sourceEventId) !== String(latestEvent.id)) {
    const err = new Error('draft_stale');
    err.status = 409;
    err.code = 'draft_stale';
    throw err;
  }
  if (latestReply && new Date(latestReply.created_at) > new Date(latestEvent.created_at)) {
    const err = new Error('draft_stale');
    err.status = 409;
    err.code = 'draft_stale';
    throw err;
  }
}

async function loadDraftEvent(threadId, draftId) {
  const { rows } = await query(
    `SELECT id, thread_id, event_type, payload, created_at
       FROM inbox_events
      WHERE id = $1
        AND thread_id = $2
        AND event_type IN ${DRAFT_EVENT_TYPES_SQL}
      LIMIT 1`,
    [draftId, threadId],
  );
  return rows[0] || null;
}

async function getExistingDraftForSource(threadId, sourceEventId) {
  const { rows } = await query(
    `SELECT id, payload, created_at
       FROM inbox_events
      WHERE thread_id = $1
        AND event_type IN ${DRAFT_EVENT_TYPES_SQL}
        AND payload->>'source_event_id' = $2
      ORDER BY created_at DESC, id::text DESC
      LIMIT 1`,
    [threadId, String(sourceEventId)],
  );
  return rows[0] || null;
}

async function updateDraftEvent(draftId, eventType, patch) {
  const { rows } = await query(
    `UPDATE inbox_events
        SET event_type = $2,
            payload = payload || $3::jsonb
      WHERE id = $1
      RETURNING id, payload, created_at`,
    [draftId, eventType, JSON.stringify({ ...patch, updated_at: new Date().toISOString() })],
  );
  return rows[0] || null;
}

function scoreWebsiteDraft({ thread, triggerEvent, eventCount, hasKnowledge }) {
  const payload = triggerEvent?.payload || {};
  let score = 58;
  if (thread?.guest_email || thread?.guest_email_raw) score += 4;
  if (thread?.guest_name) score += 3;
  if (thread?.guest_phone) score += 2;
  if (payload.residence_slug || payload.residenceSlug || thread?.guesty_listing_id) score += 8;
  if ((payload.check_in && payload.check_out) || (payload.checkIn && payload.checkOut)) score += 6;
  if (payload.party_size || payload.partySize || payload.guests) score += 4;
  if (payloadText(payload).length > 40) score += 5;
  if (eventCount > 1) score += 4;
  if (hasKnowledge) score += 6;
  return Math.max(35, Math.min(88, score));
}

async function buildWebsiteDraft({ thread, triggerEvent, events, revisionInstruction, previousDraftBody }) {
  const latestText = payloadText(triggerEvent.payload);
  const history = events
    .filter((e) => !String(e.event_type || '').startsWith('ai.'))
    .map(formatEventForPrompt)
    .join('\n\n');

  let composerOutput;
  try {
    composerOutput = defaultComposer().load('inbox-drafts', {
      task_signals: detectTaskSignals(latestText),
      context_text: [latestText, history.slice(-8000)].filter(Boolean).join('\n\n').slice(0, 10000),
    });
  } catch (e) {
    console.warn(`[website-drafts] composer fallback: ${e.message}`);
    composerOutput = { system_message: '', metadata: { loaded_skills: [], property_code: null } };
  }

  const [teachingsBlock, feedbackBlock] = await Promise.all([
    loadTeachingsBlock(null, FR_TENANT_ID),
    loadActionFeedbackBlock(FR_TENANT_ID),
  ]);
  const runtimeKnowledgeBlock = buildRuntimeKnowledgeBlock({
    channel: 'website',
    contextText: [latestText, history, revisionInstruction, previousDraftBody].filter(Boolean).join('\n\n'),
  });

  const system = `${composerOutput.system_message || ''}
${runtimeKnowledgeBlock}
${teachingsBlock}
${feedbackBlock}
${OPERATOR_DRAFT_LANGUAGE_CONTRACT}

[Website Inbox Draft Contract]
You are drafting for a Friday operator, not sending directly to the guest.
Return only the guest-facing reply body in English.
Use the website-submitted facts, but do not invent prices, availability, payment confirmation, access details, or reservation status.
If the inquiry needs a human check, write a useful holding reply or ask one concise clarification.
Keep the tone warm, clear, and Friday Retreats branded.`;

  const contextLines = [
    `Guest: ${guestFromThread(thread)}`,
    `Email: ${thread.guest_email_raw || thread.guest_email || 'n/a'}`,
    `Phone: ${thread.guest_phone || 'n/a'}`,
    `Thread status: ${thread.status || 'open'}`,
    `Latest website event: ${triggerEvent.event_type}`,
    thread.guesty_listing_id ? `Guesty listing: ${thread.guesty_listing_id}` : null,
    thread.guesty_reservation_id ? `Guesty reservation: ${thread.guesty_reservation_id}` : null,
  ].filter(Boolean);

  const task = revisionInstruction
    ? `REVISION REQUEST: ${revisionInstruction}

Previous draft:
${previousDraftBody || '(unknown)'}

Rewrite the full reply. Return only the updated guest-facing message.`
    : 'Draft a reply to the latest website inquiry. Return only the reply text.';

  const user = `[Website thread context]
${contextLines.join('\n')}

[Website event history]
${history || formatEventForPrompt(triggerEvent)}

[Task]
${task}`;

  const kimi = await generateDraftReply({
    system,
    user,
    meter: { tenantId: FR_TENANT_ID, feature: 'website_inbox_draft' },
    timeoutMs: Number(process.env.KIMI_WEBSITE_DRAFT_TIMEOUT_MS) || 90_000,
    maxRetries: Number(process.env.KIMI_WEBSITE_DRAFT_MAX_RETRIES) || 0,
  });

  if (!kimi.ok) throw new Error(`Kimi website draft failed: ${kimi.error || 'unknown'}`);

  const body = correctCurrencyFormatting(stripAIPreamble(kimi.text || '')).trim();
  if (!body) throw new Error('empty website draft');

  return {
    draftBody: body,
    confidence: scoreWebsiteDraft({
      thread,
      triggerEvent,
      eventCount: events.length,
      hasKnowledge: !!(composerOutput.metadata?.loaded_skills || []).length,
    }),
    model: kimi.model || DRAFT_MODEL,
    inputTokens: kimi.inputTokens || 0,
    outputTokens: kimi.outputTokens || 0,
  };
}

async function triggerWebsiteDraftGeneration(threadId, sourceEventId, opts = {}) {
  const revisionInstruction = typeof opts.revisionInstruction === 'string' ? opts.revisionInstruction.trim() : '';
  const revisionNumber = Number(opts.revisionNumber || 1);
  let draftId = null;

  if (!revisionInstruction && draftGenerationDisabled()) return { skipped: 'website_draftgen_disabled' };

  try {
    const [threadRes, eventsRes] = await Promise.all([
      query(`SELECT * FROM inbox_threads WHERE id = $1 LIMIT 1`, [threadId]),
      query(
        `SELECT id, event_type, source, payload, created_at
           FROM inbox_events
          WHERE thread_id = $1
          ORDER BY created_at ASC, id::text ASC`,
        [threadId],
      ),
    ]);
    const thread = threadRes.rows[0];
    const events = eventsRes.rows || [];
    const triggerEvent = events.find((e) => String(e.id) === String(sourceEventId));
    if (!thread || !triggerEvent) return { skipped: 'thread_or_event_not_found' };
    if (!shouldAutoDraftWebsiteEvent(triggerEvent.event_type) && !revisionInstruction) {
      return { skipped: 'event_not_draftable' };
    }

    const latest = await latestGuestEvent(threadId);
    if (!latest || String(latest.id) !== String(sourceEventId)) return { skipped: 'not_latest_guest_event' };
    const reply = await latestStaffReply(threadId);
    if (reply && new Date(reply.created_at) > new Date(latest.created_at)) return { skipped: 'already_replied' };

    if (!revisionInstruction) {
      const existing = await getExistingDraftForSource(threadId, sourceEventId);
      const existingState = existing?.payload?.state;
      if (existing && ACTIONABLE_STATES.has(existingState)) {
        return { draftId: existing.id, state: existingState, skipped: 'draft_exists' };
      }
    }

    const inserted = await query(
      `INSERT INTO inbox_events (thread_id, event_type, source, payload)
       VALUES ($1, 'ai.friday_drafting', 'fad', $2::jsonb)
       RETURNING id, created_at`,
      [threadId, JSON.stringify({
        state: 'friday_drafting',
        source_event_id: String(sourceEventId),
        revision_number: revisionNumber,
        revision_instruction: revisionInstruction || null,
        previous_draft_id: opts.previousDraftId || null,
        created_at: new Date().toISOString(),
      })],
    );
    draftId = inserted.rows[0].id;

    const result = await buildWebsiteDraft({
      thread,
      triggerEvent,
      events,
      revisionInstruction,
      previousDraftBody: opts.previousDraftBody || null,
    });

    const currentLatest = await latestGuestEvent(threadId);
    const currentReply = await latestStaffReply(threadId);
    if (!currentLatest || String(currentLatest.id) !== String(sourceEventId) || (currentReply && new Date(currentReply.created_at) > new Date(currentLatest.created_at))) {
      await updateDraftEvent(draftId, 'ai.draft_generation_failed', { state: 'superseded', superseded_reason: 'thread_changed' });
      return { draftId, state: 'superseded', skipped: 'thread_changed' };
    }

    await updateDraftEvent(draftId, 'ai.draft_ready', {
      state: 'draft_ready',
      draft_body: result.draftBody,
      confidence: result.confidence,
      model_used: result.model,
      generated_at: new Date().toISOString(),
      token_usage: {
        input: result.inputTokens,
        output: result.outputTokens,
      },
    });

    await publishFadEvent({
      tenantId: FR_TENANT_ID,
      type: 'inbox.draft_ready',
      payload: {
        conversationId: `web-${threadId}`,
        threadId,
        draftId,
        source: 'website_inbox',
        confidence: result.confidence,
      },
    }).catch(() => {});

    return { draftId, state: 'draft_ready', confidence: result.confidence, model: result.model };
  } catch (e) {
    console.error(`[website-drafts] failed thread=${threadId} event=${sourceEventId}: ${e.message}`);
    if (draftId) {
      await updateDraftEvent(draftId, 'ai.draft_generation_failed', {
        state: 'generation_failed',
        error: e.message,
      }).catch(() => {});
    }
    return { draftId, error: e.message };
  }
}

async function approveWebsiteDraft({ threadId, draftId, body, channel = 'email', identity }) {
  if (channel !== 'email' && channel !== 'website') {
    const err = new Error('channel_not_available');
    err.status = 409;
    err.code = 'channel_not_available';
    throw err;
  }

  const [threadRes, draft, latest, latestReply] = await Promise.all([
    query(`SELECT * FROM inbox_threads WHERE id = $1 LIMIT 1`, [threadId]),
    loadDraftEvent(threadId, draftId),
    latestGuestEvent(threadId),
    latestStaffReply(threadId),
  ]);
  const thread = threadRes.rows[0];
  if (!thread) {
    const err = new Error('thread_not_found');
    err.status = 404;
    throw err;
  }
  assertDraftCurrent({ draft, latestEvent: latest, latestReply });

  if (channel === 'website') {
    const err = new Error(/^website-ai\+/i.test(thread.guest_email || thread.guest_email_raw || '')
      ? 'website_ai_handoff_drafts_takeover_only'
      : 'website_live_channel_not_available');
    err.status = 409;
    err.code = err.message;
    throw err;
  }

  const toEmail = thread.guest_email_raw || thread.guest_email;
  if (!toEmail) {
    const err = new Error('missing_guest_email');
    err.status = 409;
    throw err;
  }

  const messageBody = String(body || draft.payload?.draft_body || '').trim();
  if (!messageBody) {
    const err = new Error('empty_draft_body');
    err.status = 400;
    throw err;
  }

  const subject = 'Re: Your Friday enquiry';
  const provider = await sendEmail({
    to: toEmail,
    toName: thread.guest_name || undefined,
    subject,
    body: messageBody,
  });

  const eventRes = await query(
    `INSERT INTO inbox_events (thread_id, event_type, source, payload)
     VALUES ($1, 'staff.reply_sent', 'fad', $2::jsonb)
     RETURNING id, created_at`,
    [threadId, JSON.stringify({
      channel: 'email',
      body: messageBody,
      subject,
      to: toEmail,
      draft_id: draftId,
      sent_by: {
        user_id: identity?.userId || null,
        display_name: identity?.displayName || identity?.username || null,
      },
      provider: provider || null,
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

  await updateDraftEvent(draftId, 'ai.draft_ready', {
    state: 'sent',
    sent_at: new Date().toISOString(),
    sent_message_id: eventRes.rows[0]?.id || null,
    final_body: messageBody,
  });

  await publishFadEvent({
    tenantId: FR_TENANT_ID,
    type: 'inbox.message_sent',
    payload: { conversationId: `web-${threadId}`, threadId, draftId, messageId: eventRes.rows[0]?.id || null },
  }).catch(() => {});

  return {
    ok: true,
    message_id: eventRes.rows[0]?.id,
    sent_at: eventRes.rows[0]?.created_at,
    sent_via: 'email',
  };
}

async function reviseWebsiteDraft({ threadId, draftId, instruction }) {
  const cleanInstruction = String(instruction || '').trim();
  if (!cleanInstruction) {
    const err = new Error('revision_instruction_required');
    err.status = 400;
    throw err;
  }
  const [draft, latest, latestReply] = await Promise.all([
    loadDraftEvent(threadId, draftId),
    latestGuestEvent(threadId),
    latestStaffReply(threadId),
  ]);
  assertDraftCurrent({ draft, latestEvent: latest, latestReply });
  const revisionNumber = Number(draft.payload?.revision_number || 1) + 1;
  await updateDraftEvent(draftId, draft.event_type || 'ai.draft_ready', {
    state: 'revision_requested',
    revision_requested_at: new Date().toISOString(),
    revision_instruction: cleanInstruction,
  });
  triggerWebsiteDraftGeneration(threadId, latest.id, {
    revisionInstruction: cleanInstruction,
    revisionNumber,
    previousDraftId: draftId,
    previousDraftBody: draft.payload?.draft_body || null,
  }).catch((e) => {
    console.error(`[website-drafts] revise trigger failed draft=${draftId}: ${e.message}`);
  });
  return { ok: true, previous_draft_id: draftId, revision_number: revisionNumber, state: 'revision_requested' };
}

async function rejectWebsiteDraft({ threadId, draftId, reason, identity }) {
  const [draft, latest, latestReply] = await Promise.all([
    loadDraftEvent(threadId, draftId),
    latestGuestEvent(threadId),
    latestStaffReply(threadId),
  ]);
  assertDraftCurrent({ draft, latestEvent: latest, latestReply });
  await updateDraftEvent(draftId, draft.event_type || 'ai.draft_ready', {
    state: 'rejected',
    rejection_reason: reason ? String(reason).slice(0, 1000) : null,
    rejected_at: new Date().toISOString(),
    rejected_by: identity?.userId || identity?.username || null,
  });
  return { ok: true, draft: { id: draftId, state: 'rejected' } };
}

module.exports = {
  shouldAutoDraftWebsiteEvent,
  triggerWebsiteDraftGeneration,
  getVisibleDraftsForThread,
  approveWebsiteDraft,
  reviseWebsiteDraft,
  rejectWebsiteDraft,
  assertDraftCurrent,
};
