'use strict';

// Phase 3.3 — FAD-native follow-up draft generator.
//
// Replaces friday-gms/src/services/followup-draft-generator.ts. Called
// from followup_scanner.js after it creates a new inquiry_followup
// pending_action. Generates a warm, time-aware "checking in" draft for
// guests whose inquiry has gone unanswered.
//
// Differences from GMS source:
//   - Structured composer (`inquiry-followup` surface) instead of
//     monolithic sales-knowledge.json + inline string concat.
//   - Kimi K2.6 (temperature=1 per the model's hard constraint —
//     learned the hard way from Phase 3.1 hotfix) instead of Anthropic.
//   - Marked with draft_type='followup' so the inbox UI can flag it
//     and the draft generator's superseding logic won't clobber it.
//
// Pre-condition: an active inquiry_followup pending_action exists for
// this conversation. The scanner already created it; this function
// adds the AI draft alongside.

const { query } = require('../database/client');
const { defaultComposer } = require('../knowledge/composer');
const { generateDraftReply, DRAFT_MODEL } = require('../ai/kimi_draft');

const DRAFT_INITIAL_STATE = 'friday_drafting';
const DRAFT_READY_STATE = 'draft_ready';
const DRAFT_FAILED_STATE = 'generation_failed';

async function generateFollowupDraft(params) {
  const { conversationId, guestName, propertyName, propertyCode, hoursElapsed, channel } = params;
  if (!conversationId) return { skipped: 'no_conversation' };
  if (!process.env.KIMI_API_KEY) return { skipped: 'no_kimi_key' };

  // Dedup: skip if there's already an open follow-up draft on this
  // conversation (matches GMS pattern). We don't supersede follow-ups
  // automatically — the team manually approves or rejects them.
  try {
    const { rows: existing } = await query(
      `SELECT id FROM drafts
        WHERE conversation_id = $1
          AND draft_type = 'followup'
          AND state IN ('draft_ready', 'under_review', 'friday_drafting')
        LIMIT 1`,
      [conversationId],
    );
    if (existing.length > 0) {
      return { skipped: 'duplicate_followup', existingDraftId: existing[0].id };
    }
  } catch (e) {
    console.warn(`[followup-draft-gen] dedup query failed: ${e.message}`);
  }

  let draftId = null;
  try {
    // Conversation history — bounded at 20 messages for the user prompt.
    const { rows: messages } = await query(
      `SELECT direction, body, translated_body, sender_name, created_at
         FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC
        LIMIT 20`,
      [conversationId],
    );
    if (messages.length === 0) {
      return { skipped: 'no_messages' };
    }

    // Last inbound message_id — needed for the draft's message_id FK.
    const { rows: lastInRows } = await query(
      `SELECT id FROM messages
        WHERE conversation_id = $1 AND direction = 'inbound'
        ORDER BY created_at DESC LIMIT 1`,
      [conversationId],
    );
    const lastInboundId = lastInRows[0]?.id || null;
    if (!lastInboundId) {
      return { skipped: 'no_inbound' };
    }

    // Guest language fallback for the prompt — keep follow-ups in the
    // guest's language.
    const { rows: langRows } = await query(
      `SELECT original_language FROM messages
        WHERE conversation_id = $1
          AND direction = 'inbound'
          AND original_language IS NOT NULL
        ORDER BY created_at DESC LIMIT 1`,
      [conversationId],
    );
    const guestLanguage = langRows[0]?.original_language || 'en';

    // Reserve the row early so the inbox UI sees "Generating…".
    const { rows: insertResult } = await query(
      `INSERT INTO drafts
         (message_id, conversation_id, draft_body, state, draft_type, revision_number)
       VALUES ($1, $2, $3, $4, 'followup', 1)
       RETURNING id`,
      [lastInboundId, conversationId, '(Generating follow-up…)', DRAFT_INITIAL_STATE],
    );
    draftId = insertResult[0].id;

    // Compose KB system prompt for the inquiry-followup surface.
    let composed;
    try {
      composed = defaultComposer().load('inquiry-followup', {
        property_code: propertyCode || undefined,
        context_text: messages.map((m) => m.body || '').join('\n').slice(0, 2000),
      });
    } catch (e) {
      console.warn(`[followup-draft-gen] composer with property_code=${propertyCode} failed (${e.message}); retrying without property card`);
      composed = defaultComposer().load('inquiry-followup', {
        context_text: messages.map((m) => m.body || '').join('\n').slice(0, 2000),
      });
    }

    // Time description used in the prompt — sales tone shifts with how
    // long the inquiry has been unanswered. Mirrors GMS's logic.
    const timeDescription =
      hoursElapsed >= 168 ? 'over a week' :
      hoursElapsed >= 24  ? `${Math.round(hoursElapsed / 24)} days` :
      `${Math.round(hoursElapsed)} hours`;

    const channelNote =
      channel === 'airbnb' ? '\nNote: This is an Airbnb inquiry. Airbnb tracks response time — keep it concise and professional.' :
      channel === 'booking' ? '\nNote: This is a Booking.com inquiry. Response time affects ranking.' :
      '';

    // Build the conversation history block in [Role] body shape so the
    // model can see the dialogue flow.
    const conversationContext = messages
      .map((m) => {
        const role = m.direction === 'inbound' ? 'Guest' : (m.sender_name || 'Team');
        const text = m.translated_body || m.body || '';
        return `[${role}] ${text}`;
      })
      .join('\n\n');

    // Task framing — append to the composed KB so the model knows the
    // shape of output we need.
    const taskFraming = `TASK — The guest below has an open inquiry that has gone unanswered for ${timeDescription}. Generate a brief, warm follow-up message that:
- Acknowledges their original inquiry naturally
- Expresses continued interest in helping them
- Is warm but not pushy
- Is concise (2-4 sentences max)
- Does NOT apologise excessively
- References relevant inquiry details if available${channelNote}
${guestLanguage !== 'en' ? `\nThe guest communicates in ${guestLanguage}. Write the follow-up in ${guestLanguage}.` : ''}

Property: ${propertyName || 'our property'}
Guest: ${guestName || 'Guest'}

Output the message text only — no preamble, no commentary.`;

    const systemPrompt = `${composed.system_message}\n\n${taskFraming}`;
    const userMessage = `CONVERSATION SO FAR:\n${conversationContext}`;

    const kimi = await generateDraftReply({
      system: systemPrompt,
      user: userMessage,
      meter: { feature: 'inbox_followup_draft' },
    });
    if (!kimi.ok) {
      throw new Error(`Kimi followup call failed: ${kimi.error || 'unknown'}`);
    }

    const draftBody = String(kimi.text || '').trim();
    if (!draftBody) {
      throw new Error('empty draft body from Kimi');
    }

    await query(
      `UPDATE drafts
          SET draft_body = $1,
              confidence = 70,
              state = $2,
              updated_at = NOW()
        WHERE id = $3`,
      [draftBody, DRAFT_READY_STATE, draftId],
    );

    console.log(
      `[followup-draft-gen] ready draft=${draftId} conv=${conversationId} model=${kimi.model || DRAFT_MODEL} ` +
      `tokens=${kimi.inputTokens}+${kimi.outputTokens} kbSkills=${composed.metadata.loaded_skills.length} latency=${kimi.latencyMs}ms`,
    );
    return { draftId, state: DRAFT_READY_STATE };
  } catch (e) {
    console.error(`[followup-draft-gen] failed (conv=${conversationId}): ${e.message}`);
    if (draftId) {
      await query(
        `UPDATE drafts SET state = $1, updated_at = NOW()
          WHERE id = $2 AND state = $3`,
        [DRAFT_FAILED_STATE, draftId, DRAFT_INITIAL_STATE],
      ).catch(() => {});
    }
    return { error: e.message, draftId };
  }
}

module.exports = { generateFollowupDraft };
