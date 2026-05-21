'use strict';

// Phase 3.1 — FAD-native auto-draft generator.
//
// Replaces friday-gms/src/services/draft-generator.ts.triggerDraftGeneration
// for the inbound-message → AI-draft pipeline. Reads conversation +
// message + property knowledge, builds a structured system prompt via
// the knowledge composer (Phase 3.0), calls Kimi K2.6, writes a drafts
// row that the inbox UI displays for user review.
//
// Structural differences from the GMS source:
//   - Uses the structured composer (`backend/knowledge/composer.js`)
//     instead of the 400-line string-concat in generateReply(). GMS
//     ran the composer in shadow mode only (output discarded); we
//     promote it to the active loader. Per FAD shadow-log analysis
//     this cuts ~70-78% of prompt tokens with strictly more named
//     rule coverage.
//   - Kimi K2.6 (Moonshot) instead of Claude Sonnet 4. Locked
//     2026-05-18 by Ishant — cheaper, OpenAI-compatible, 262K context.
//   - No parallel-run with GMS. GMS's draft-gen gets disabled at the
//     same time this ships. See [[fad_kill_gms_no_parallel_run]] for
//     the rollback flow if regression appears.
//   - Auto-send path removed for first burn-in. Every FAD-native draft
//     passes through user review. Re-enable via AUTO_SEND_ENABLED env
//     once quality is observed steady.
//
// Triggering: called from guesty_message_webhook.js after an inbound
// non-reaction non-auto-response message is inserted. Fire-and-forget
// from the webhook's perspective — failures don't fail the webhook.

const { query } = require('../database/client');
const { defaultComposer } = require('../knowledge/composer');
const { generateDraftReply, classifyMessageWithKimi, DRAFT_MODEL } = require('../ai/kimi_draft');
const { translateText } = require('../ai/translate');
const { loadTeachingsBlock, loadActionFeedbackBlock } = require('./learning_context');
const { notifyUsers, publishFadEvent, resolveGmWatchers } = require('../realtime');
const {
  resolveInboxReservationContext,
  applyReservationContextToConversation,
} = require('./reservation_context');
const { safeConversationSummary } = require('./summary_quality');

const DRAFT_INITIAL_STATE = 'friday_drafting';
const DRAFT_READY_STATE = 'draft_ready';
const DRAFT_FAILED_STATE = 'generation_failed';
const DRAFT_SUPERSEDED_STATE = 'superseded';

const OPERATOR_DRAFT_LANGUAGE_CONTRACT = `
[Operator Draft Language Contract]
The draft_body stored for FAD operators must always be in English, even when the guest writes in French or another language.
Do not write the visible operator draft in the guest's language.
The approve/send path translates the English operator draft back into the guest's language immediately before sending.
`;

const DRAFT_PRIMARY_TIMEOUT_MS = Number(process.env.KIMI_DRAFT_PRIMARY_TIMEOUT_MS) || 90_000;
const DRAFT_PRIMARY_MAX_RETRIES = Number(process.env.KIMI_DRAFT_PRIMARY_MAX_RETRIES) || 0;
const DRAFT_FALLBACK_MODEL = process.env.KIMI_DRAFT_FALLBACK_MODEL || process.env.KIMI_FAST_DRAFT_MODEL || 'moonshot-v1-8k';
const DRAFT_FALLBACK_TIMEOUT_MS = Number(process.env.KIMI_DRAFT_FALLBACK_TIMEOUT_MS) || 45_000;
const DRAFT_FALLBACK_MAX_RETRIES = Number(process.env.KIMI_DRAFT_FALLBACK_MAX_RETRIES) || 0;
const DRAFT_FALLBACK_MAX_TOKENS = Number(process.env.KIMI_DRAFT_FALLBACK_MAX_TOKENS) || 1400;
const DRAFT_TRANSIENT_FAILURE_RE = /(timeout|timed out|ECONNABORTED|ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up|overloaded|temporarily|unavailable|gateway|502|503|504)/i;

// ────────────────────────────────────────────────────────────────────
// Helpers ported from friday-gms/src/services/draft-generator.ts
// ────────────────────────────────────────────────────────────────────

// Format a single message row for the conversation-history block in the
// user prompt. Mirrors GMS's formatMessageForContext: human-readable
// timestamp + sender + body, with [System notification] /
// [Automated reply already sent] prefixes for filtered outbound rows
// so the model knows not to repeat them.
function formatMessageForContext(msg) {
  const date = new Date(msg.created_at);
  const stamp = date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  let prefix = '';
  if (msg.is_auto_response) {
    // The webhook flags auto-responses + system notifications via this
    // single column. Distinguish them in display by looking at body
    // shape — GMS treats them identically for draft purposes anyway.
    prefix = '[Automated reply already sent] ';
  }

  const text = msg.translated_body || msg.body || '';
  const sender = msg.sender_name || (msg.direction === 'inbound' ? 'Guest' : 'Friday');
  return `[${stamp}] ${prefix}${sender}: ${text}`;
}

// Strip AI-preamble wrappers that some models emit despite system-prompt
// instructions ("Here's a draft:", "Of course! Here is a reply:", etc.).
// Mirrors GMS's regex list + greeting-heuristic fallback. Imperfect by
// nature — false positives risk truncating the actual reply. Kept
// conservative.
const PREAMBLE_PATTERNS = [
  /^(here(?:'s| is)?\s+(?:a |the |an |your |my )?(?:draft|reply|response|suggestion|message|version)[:\.]?\s*)/i,
  /^(of course[,!]?\s+(?:here(?:'s| is)?[:\.]?\s*)?)/i,
  /^(sure[,!]?\s+(?:here(?:'s| is)?[:\.]?\s*)?)/i,
  /^(certainly[,!]?\s+(?:here(?:'s| is)?[:\.]?\s*)?)/i,
  /^(?:draft|reply|response)[:\.]\s+/i,
  /^(absolutely[,!]?\s+)/i,
  /^(no problem[,!]?\s+)/i,
  /^(happy to[^\.!]*[\.!]\s+)/i,
  /^(let me[^\.!]*[\.!]\s+)/i,
  /^(i'(?:ll|d)\s+(?:draft|write|reply|respond)[^\.!]*[\.!]\s+)/i,
  /^(here you go[:\.]?\s+)/i,
];

const GREETINGS = [
  'hi ', 'hello ', 'dear ', 'bonjour ', 'hey ', 'hi,', 'hello,', 'dear,', 'bonjour,', 'hey,',
  'thank you', 'thanks', 'welcome', 'good morning', 'good afternoon', 'good evening',
];

const STATUS_UPDATE_REQUEST_RE = /\b(?:any\s+(?:news|updates?)|do\s+you\s+have\s+(?:any\s+)?(?:news|updates?)|what(?:'s| is)\s+the\s+latest|status\s+update|latest\s+update|nouveau(?:x)?|nouvelles?|avez[-\s]?vous\s+du\s+nouveau|du\s+nouveau|des\s+nouvelles|mise\s+[àa]\s+jour|avancement|où\s+en\s+est|ou\s+en\s+est)\b/i;
const OPS_INCIDENT_RE = /\b(?:water|eau|hot\s*water|chauffe[-\s]?eau|ballon\s+d['’]?eau|toilet|toilettes?|flush|plumbing|pump|pompe|supply|alimentation|syndic|building\s+(?:management|manager|supply)|gestion\s+de\s+l['’]?immeuble|incident|issue|problem|probl[eè]me|refund|remboursement|repair|r[eé]paration|restored?|r[eé]tabli|r[eè]gl[ée])\b/i;

function latestInboundMessage(messages) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.direction === 'inbound') return messages[i];
  }
  return null;
}

function isGuestStatusUpdateRequest(text) {
  return STATUS_UPDATE_REQUEST_RE.test(String(text || ''));
}

function isOperationalIncidentContext(messages, extraText = '') {
  const recentText = Array.isArray(messages)
    ? messages.slice(-16).map((m) => `${m.body || ''}\n${m.translated_body || ''}`).join('\n')
    : '';
  return OPS_INCIDENT_RE.test(`${extraText || ''}\n${recentText}`);
}

function statusUpdateSafetyApplies({ message, conversation, messages }) {
  const guestText = `${message?.body || ''}\n${message?.translated_body || ''}`;
  if (!isGuestStatusUpdateRequest(guestText)) return false;
  if (!isOperationalIncidentContext(messages, guestText)) return false;
  // If a human has put fresh operational notes on the conversation, let
  // the model use them. Without notes, an "any update?" reply should be
  // a holding reply, not invented progress from stale thread context.
  return !String(conversation?.notes || '').trim();
}

function statusUpdateSafetyInstruction(ctx) {
  if (!statusUpdateSafetyApplies(ctx)) return '';
  return `[Latest status update guard]
The latest guest message is asking for a new status update on an operational incident.
No staff note with a confirmed new status is present in this prompt.
Do not convert old thread context into a new update. Do not say the issue is restored, will be resolved by a specific time, that access has newly been granted, or that Friday is actively working with the board/syndic unless that exact new fact appears in staff notes.
Safe reply pattern: acknowledge the guest, say Friday is checking the latest status with the team/building management/syndic now, and promise a confirmed update shortly.`;
}

function guestFirstName(conversation) {
  const raw = String(conversation?.guest_name || '').trim();
  if (!raw) return '';
  return raw.split(/\s+/)[0].replace(/[^\p{L}'’-]/gu, '');
}

function buildSafeStatusUpdateDraft({ message, messages, conversation }) {
  const text = `${message?.body || ''}\n${message?.translated_body || ''}`;
  const waterIncident = /\b(?:water|eau|hot\s*water|chauffe[-\s]?eau|toilettes?|toilet|pump|pompe|alimentation|supply)\b/i.test(
    `${text}\n${Array.isArray(messages) ? messages.slice(-12).map((m) => `${m.body || ''}\n${m.translated_body || ''}`).join('\n') : ''}`,
  );
  const subject = waterIncident ? 'water-supply status' : 'latest status';
  const name = guestFirstName(conversation);
  return `Hello${name ? ` ${name}` : ''},

We are checking the ${subject} with our team and the building management now. We do not want to give you an unconfirmed update, so we will come back to you as soon as we have confirmed information.

Thank you for your patience,
Friday Retreats`;
}

function applyStatusUpdateSafety(draftBody, ctx) {
  if (!statusUpdateSafetyApplies(ctx)) {
    return { draftBody, applied: false, confidenceCeiling: null };
  }
  return {
    draftBody: buildSafeStatusUpdateDraft(ctx),
    applied: true,
    confidenceCeiling: 55,
  };
}

function stripAIPreamble(text) {
  if (!text || typeof text !== 'string') return text || '';
  let out = String(text).trim();

  // First pass: known preamble patterns
  let changed = true;
  while (changed) {
    changed = false;
    for (const rx of PREAMBLE_PATTERNS) {
      const next = out.replace(rx, '');
      if (next !== out) {
        out = next.trim();
        changed = true;
      }
    }
  }

  // Second pass: if the text still has obvious meta-talk before a
  // greeting, drop everything before the greeting. Only triggers when
  // there's actually content before the greeting (i.e. preamble) AND
  // the greeting appears within the first ~250 chars.
  const lowered = out.toLowerCase();
  for (const g of GREETINGS) {
    const idx = lowered.indexOf(g);
    if (idx > 0 && idx < 250) {
      out = out.slice(idx).trim();
      break;
    }
  }

  return out;
}

function truncateText(value, maxLength) {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 18)).trimEnd()}\n[truncated]`;
}

function isTransientDraftFailure(result) {
  if (!result || result.ok) return false;
  if (result.finishReason === 'length') return true;
  const status = Number(result.status);
  if ([408, 409, 425].includes(status)) return true;
  if (status >= 500) return true;
  return DRAFT_TRANSIENT_FAILURE_RE.test(String(result.error || ''));
}

function buildDraftUserMessage({ ctxLines, history, taskDirective }) {
  return `CONVERSATION CONTEXT:
${ctxLines.map((l) => `- ${l}`).join('\n')}

PREVIOUS MESSAGES:
${history}

${taskDirective}`;
}

function compactDraftSystemPrompt({ propertyCode, category }) {
  return `You are Friday Retreats' guest-message drafting assistant.

Use this compact fallback only when the full knowledge prompt is too large or times out.

Rules:
- Draft in English for the FAD operator. Translation happens later at send time.
- Reply only to the latest guest message.
- Prefer the current reservation/property context shown in the prompt.
- Be concise, warm, operationally precise, and do not invent prices, availability, refunds, access instructions, or commitments.
- If key operational facts are missing, write a useful reply that says the team will verify and come back.
- Output the reply text only. No preamble or commentary.

Context hints:
- Property code: ${propertyCode || 'unknown'}
- Trigger category: ${category || 'other'}`;
}

function compactHistoryMessages(allMessages, triggeringMessageId) {
  const messages = Array.isArray(allMessages) ? allMessages : [];
  const first = messages.slice(0, 2);
  const recent = messages.slice(-12);
  const byId = new Map();
  for (const msg of [...first, ...recent]) {
    byId.set(String(msg.id || `${msg.created_at}-${byId.size}`), msg);
  }
  if (triggeringMessageId) {
    const triggering = messages.find((msg) => String(msg.id) === String(triggeringMessageId));
    if (triggering) byId.set(String(triggering.id), triggering);
  }
  return [...byId.values()]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((msg) => truncateText(formatMessageForContext(msg), 900))
    .join('\n\n');
}

// Currency normalisation. Mirrors GMS's correctCurrencyFormatting —
// "595 euros" → "€595", "595 USD" → "$595", "595 MUR" / "595 rupees"
// → "Rs 595". Single-pass for each known unit.
function correctCurrencyFormatting(text) {
  if (!text || typeof text !== 'string') return text || '';
  let out = String(text);

  out = out.replace(/(\d+(?:[.,]\d+)?)\s*(?:euros?|EUR\b)/gi, '€$1');
  out = out.replace(/EUR\s*(\d+(?:[.,]\d+)?)/gi, '€$1');

  out = out.replace(/(\d+(?:[.,]\d+)?)\s*(?:dollars?|USD\b)/gi, '$$$1');
  out = out.replace(/USD\s*(\d+(?:[.,]\d+)?)/gi, '$$$1');

  out = out.replace(/(\d+(?:[.,]\d+)?)\s*(?:rupees?|MUR\b)/gi, 'Rs $1');
  out = out.replace(/MUR\s*(\d+(?:[.,]\d+)?)/gi, 'Rs $1');

  out = out.replace(/(\d+(?:[.,]\d+)?)\s*GBP\b/gi, '£$1');
  out = out.replace(/GBP\s*(\d+(?:[.,]\d+)?)/gi, '£$1');

  return out;
}

function languageRoot(lang) {
  if (!lang || typeof lang !== 'string') return null;
  const root = lang.toLowerCase().split(/[-_\s(]/)[0].trim();
  return root || null;
}

async function ensureOperatorEnglishDraft(draftBody, { message, conversation }) {
  const guestLanguage = languageRoot(message?.original_language || conversation?.last_detected_language);
  if (!guestLanguage || guestLanguage === 'en') return draftBody;

  try {
    const translated = await translateText(draftBody, {
      conversationId: conversation?.id,
    });
    const sourceLanguage = languageRoot(translated?.sourceLang);
    if (sourceLanguage && sourceLanguage !== 'en' && translated?.translated) {
      return translated.translated;
    }
  } catch (e) {
    console.warn(`[draft-gen] operator draft language normalization failed: ${e.message}`);
  }

  return draftBody;
}

// Confidence scoring. Mirrors GMS's calculateConfidence — starts at 70,
// adjusts for completeness + risk signals + content red-flags. Result
// is clamped [10, 98] and stored on drafts.confidence.
function calculateConfidence({
  category,
  hasCheckIn,
  hasCheckOut,
  hasGuests,
  hasProperty,
  hasStaffNotes,
  messageCount,
  hasPropertyKnowledge,
  isNonEnglish,
  messageWordCount,
  bodyText,
}) {
  let score = 70;

  if (category === 'routine') score += 10;
  if (category === 'question') score += 5;

  if (hasCheckIn && hasCheckOut && hasGuests && hasProperty) score += 10;
  if (hasStaffNotes) score += 5;
  if (messageCount >= 3) score += 5;
  if (messageCount >= 6) score += 5;
  if (hasPropertyKnowledge) score += 10;
  else score -= 10;

  if (category === 'complaint') score -= 20;
  if (category === 'emergency') score -= 10;
  if (messageWordCount > 200) score -= 15;
  if (!hasProperty) score -= 10;
  if (isNonEnglish) score -= 5;

  const lower = String(bodyText || '').toLowerCase();
  if (/\b(legal|safety|emergency|injury|security|lawyer|police)\b/.test(lower)) score -= 10;
  if (/\b(damage|refund|discount|problem|issue|broken|dirty|disgusting)\b/.test(lower)) score -= 20;

  return Math.max(10, Math.min(98, Math.round(score)));
}

// Should we even draft on this conversation? GMS's three suppression
// rules:
//   1. Reservation status is terminal (cancelled / completed / closed /
//      no_show) — guest is no longer staying with us.
//   2. Checkout was before yesterday AND no inbound in the last 2h —
//      conversation is winding down naturally, don't proactively chase.
//   3. Last message > 7 days ago AND no pending_actions — this thread
//      is dormant.
// Best-effort: any DB error returns false (let the gen proceed) per
// GMS's fail-open semantics.
async function shouldSuppressDraft(conversationId) {
  try {
    const { rows } = await query(
      `SELECT c.last_message_at, c.last_inbound_at, c.check_out_date,
              r.status AS reservation_status
         FROM conversations c
         LEFT JOIN reservations r ON r.id = c.reservation_id
         WHERE c.id = $1
         LIMIT 1`,
      [conversationId],
    );
    const row = rows[0];
    if (!row) return false;

    if (['cancelled', 'completed', 'closed', 'no_show'].includes(String(row.reservation_status))) {
      return 'reservation_terminated';
    }

    if (row.check_out_date) {
      const yesterday = Date.now() - 24 * 60 * 60 * 1000;
      const checkout = new Date(row.check_out_date).getTime();
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      const lastInbound = row.last_inbound_at ? new Date(row.last_inbound_at).getTime() : 0;
      if (checkout <= yesterday && lastInbound < twoHoursAgo) {
        return 'post_checkout_no_recent_inbound';
      }
    }

    if (row.last_message_at) {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const lastMessage = new Date(row.last_message_at).getTime();
      if (lastMessage < sevenDaysAgo) {
        const { rows: pa } = await query(
          `SELECT 1 FROM pending_actions WHERE conversation_id = $1 AND status != 'resolved' LIMIT 1`,
          [conversationId],
        );
        if (pa.length === 0) return 'stale_no_pending_actions';
      }
    }

    return false;
  } catch (e) {
    console.warn(`[draft-gen] shouldSuppressDraft check failed for ${conversationId}: ${e.message} — proceeding`);
    return false;
  }
}

async function latestSubstantiveMessage(conversationId) {
  const { rows } = await query(
    `SELECT id, direction
       FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [conversationId],
  );
  return rows[0] || null;
}

// Property-code resolution for the composer's property card. FAD stores
// the short code (e.g. "AO-11", "GBH-C3") in conversations.property_name
// — the column name is legacy. The composer reads
// `properties/<code>.json` from the KB; if there's no card for this
// property the composer throws and we retry without a property card.
function resolvePropertyCode(conversation) {
  if (!conversation) return null;
  const code = conversation.property_name || conversation.property_code;
  return code ? String(code).trim() : null;
}

// Detect a few task signals from the inbound body so the composer can
// lazy-load discount-bounds / refund-bounds rule fragments. Mirrors the
// trigger keywords declared in `backend/knowledge/index.json`.
function detectTaskSignals(text) {
  if (!text) return [];
  const signals = [];
  if (/discount|deal|promo|reduction|reduce/i.test(text)) signals.push('discount');
  if (/refund|compensation|reimburse/i.test(text)) signals.push('refund');
  return signals;
}

// ────────────────────────────────────────────────────────────────────
// Core generation flow
// ────────────────────────────────────────────────────────────────────

async function generateDraft({ message, conversation, revisionInstruction, previousDraftBody }) {
  // 1. Conversation history. Used in the user-message half of the prompt.
  const { rows: allMessages } = await query(
    `SELECT id, direction, body, translated_body, sender_name, created_at, is_auto_response, module_type
       FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC`,
    [conversation.id],
  );

  // 2. Classify the triggering message — used for both confidence and
  //    (potentially) lazy-load signals. Fail-open to 'other'.
  const guestText = message.translated_body || message.body || '';
  const category = await classifyMessageWithKimi(guestText, { feature: 'inbox_classify' });

  // 3. Compose system prompt.
  const propertyCode = resolvePropertyCode(conversation);
  const taskSignals = detectTaskSignals(guestText);

  let composerOutput;
  try {
    composerOutput = defaultComposer().load('inbox-drafts', {
      property_code: propertyCode || undefined,
      task_signals: taskSignals,
      context_text: guestText.slice(0, 2000),
    });
  } catch (e) {
    // Most common cause: property_code didn't match any properties/*.json
    // card. Fall back to composing without a property card so the draft
    // still ships — degraded but useful.
    console.warn(
      `[draft-gen] composer with property_code=${propertyCode} failed (${e.message}); retrying without property card`,
    );
    composerOutput = defaultComposer().load('inbox-drafts', {
      task_signals: taskSignals,
      context_text: guestText.slice(0, 2000),
    });
  }

  // 4. Build the user message — conversation context + history + the
  //    final task directive.
  const history = allMessages.map(formatMessageForContext).join('\n\n');

  const ctxLines = [
    `Property: ${conversation.property_name || 'unknown'}`,
    `Channel: ${conversation.channel || 'unknown'}`,
    `Check-in: ${conversation.check_in_date || 'n/a'} → check-out: ${conversation.check_out_date || 'n/a'}`,
    `Guests: ${conversation.num_guests || 'n/a'}`,
    `Conversation status: ${conversation.status || 'unknown'}`,
    `Triggering message classified as: ${category}`,
  ];
  if (conversation.notes) ctxLines.push(`Staff notes: ${conversation.notes}`);
  const priorSummary = safeConversationSummary(conversation.conversation_summary, { messages: allMessages });
  if (priorSummary) ctxLines.push(`Prior summary (unverified; prefer actual messages): ${priorSummary}`);

  let taskDirective;
  if (revisionInstruction) {
    taskDirective = `⚠️ REVISION REQUEST — TOP PRIORITY: ${revisionInstruction}

Previous draft:
${previousDraftBody || '(unknown)'}

Rewrite the draft to address the revision instruction above. Preserve everything that wasn't called out for change.`;
  } else {
    const latestUpdateGuard = statusUpdateSafetyInstruction({
      message,
      conversation,
      messages: allMessages,
    });
    taskDirective = `${latestUpdateGuard ? `${latestUpdateGuard}\n\n` : ''}DRAFT A REPLY TO THE LATEST MESSAGE.

Messages labeled [Automated reply already sent] or [System notification] indicate actions already taken — do NOT repeat information that was already sent to the guest.

Output the reply text only. No preamble, no "Here's a draft:", no commentary.`;
  }

  const userMessage = buildDraftUserMessage({ ctxLines, history, taskDirective });

  // 4b. Dynamic learning blocks — restored after Sprint 8/9 audit
  // (2026-05-19): the structured composer doesn't include them, but
  // GMS draft-generator.ts:726-751 + :941-960 always injected them
  // and Sprint 9 explicitly preserved the contract. Appended to the
  // composer's system_message so they augment rather than replace.
  const [teachingsBlock, feedbackBlock] = await Promise.all([
    loadTeachingsBlock(propertyCode),
    loadActionFeedbackBlock(),
  ]);
  const systemPrompt = composerOutput.system_message
    + teachingsBlock
    + feedbackBlock
    + OPERATOR_DRAFT_LANGUAGE_CONTRACT;

  // 5. Call Kimi. The first pass uses the full FAD knowledge prompt,
  // but does not retry the same long prompt repeatedly. If it fails
  // because the context is too large or the model times out, retry once
  // with a compact prompt and truncated history.
  let kimi = await generateDraftReply({
    system: systemPrompt,
    user: userMessage,
    meter: { feature: 'inbox_draft' },
    timeoutMs: DRAFT_PRIMARY_TIMEOUT_MS,
    maxRetries: DRAFT_PRIMARY_MAX_RETRIES,
  });
  let fallbackUsed = false;

  if (!kimi.ok && isTransientDraftFailure(kimi)) {
    fallbackUsed = true;
    const fullContextError = kimi.error || 'transient draft model failure';
    console.warn(`[draft-gen] full-context call failed (${fullContextError}); retrying compact draft context`);
    const compactUserMessage = buildDraftUserMessage({
      ctxLines,
      history: compactHistoryMessages(allMessages, message.id),
      taskDirective,
    });
    kimi = await generateDraftReply({
      system: compactDraftSystemPrompt({ propertyCode, category }),
      user: compactUserMessage,
      meter: { feature: 'inbox_draft_compact' },
      timeoutMs: DRAFT_FALLBACK_TIMEOUT_MS,
      maxRetries: DRAFT_FALLBACK_MAX_RETRIES,
      maxTokens: DRAFT_FALLBACK_MAX_TOKENS,
      model: DRAFT_FALLBACK_MODEL,
    });
  }

  if (!kimi.ok) {
    throw new Error(`Kimi draft call failed: ${kimi.error || 'unknown'}`);
  }

  // 6. Post-process: strip AI-preamble + currency normalisation.
  const stripped = stripAIPreamble(kimi.text);
  const normalizedBody = correctCurrencyFormatting(stripped);
  const operatorEnglishBody = await ensureOperatorEnglishDraft(normalizedBody, {
    message,
    conversation,
  });
  let draftBody = correctCurrencyFormatting(operatorEnglishBody);
  const safety = revisionInstruction
    ? { applied: false, confidenceCeiling: null }
    : applyStatusUpdateSafety(draftBody, {
      message,
      conversation,
      messages: allMessages,
    });
  if (safety.applied) draftBody = safety.draftBody;

  // 7. Confidence scoring.
  let confidence = calculateConfidence({
    category,
    hasCheckIn: !!conversation.check_in_date,
    hasCheckOut: !!conversation.check_out_date,
    hasGuests: !!conversation.num_guests,
    hasProperty: !!conversation.property_name,
    hasStaffNotes: !!conversation.notes,
    messageCount: allMessages.length,
    hasPropertyKnowledge: composerOutput.metadata.property_code !== null,
    isNonEnglish: message.original_language && message.original_language !== 'en',
    messageWordCount: (guestText.match(/\S+/g) || []).length,
    bodyText: guestText,
  });
  if (typeof safety.confidenceCeiling === 'number') {
    confidence = Math.min(confidence, safety.confidenceCeiling);
  }

  return {
    draftBody,
    confidence,
    inputTokens: kimi.inputTokens || 0,
    outputTokens: kimi.outputTokens || 0,
    model: kimi.model || DRAFT_MODEL,
    category,
    loadedSkills: composerOutput.metadata.loaded_skills || [],
    tokenEstimate: composerOutput.metadata.token_estimate || 0,
    promptLatencyMs: kimi.latencyMs || null,
    fallbackUsed,
    safetyApplied: safety.applied ? 'status_update_holding_reply' : null,
  };
}

// ────────────────────────────────────────────────────────────────────
// Orchestrator — owns the drafts-row state machine
// ────────────────────────────────────────────────────────────────────

async function triggerDraftGeneration(messageId, conversationId, opts = {}) {
  const { revisionInstruction, revisionNumber = 1 } = opts;
  let draftId = null;
  let conversationRow = null;

  try {
    // Defensive direction recheck — at trigger time the row is already
    // inserted, so this catches the rare case of an outbound message
    // routing into draft-gen by mistake.
    if (!revisionInstruction) {
      const { rows } = await query(
        `SELECT direction FROM messages WHERE id = $1 LIMIT 1`,
        [messageId],
      );
      if (!rows[0]) {
        return { skipped: 'message_not_found' };
      }
      if (rows[0].direction !== 'inbound') {
        return { skipped: 'not_inbound' };
      }

      const suppress = await shouldSuppressDraft(conversationId);
      if (suppress) {
        console.log(`[draft-gen] suppressed for conv ${conversationId}: ${suppress}`);
        return { skipped: suppress };
      }
    }

    // Supersede prior actionable drafts — they're stale now there's
    // either a new inbound or a fresh revision request.
    await query(
      `UPDATE drafts
          SET state = $1, updated_at = NOW()
        WHERE conversation_id = $2 AND state IN ($3, 'under_review')`,
      [DRAFT_SUPERSEDED_STATE, conversationId, DRAFT_READY_STATE],
    );

    // Insert the placeholder friday_drafting row so the inbox UI can
    // show "Generating…" while we wait on Kimi.
    const { rows: inserted } = await query(
      `INSERT INTO drafts (
         message_id, conversation_id, draft_body, state,
         revision_number, revision_instruction
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        messageId,
        conversationId,
        revisionInstruction ? '(Revising…)' : '(Generating…)',
        DRAFT_INITIAL_STATE,
        revisionNumber,
        revisionInstruction || null,
      ],
    );
    draftId = inserted[0].id;

    // Pull the message + conversation rows we need for the prompt.
    const [messageRows, convRows] = await Promise.all([
      query(
        `SELECT id, body, translated_body, original_language, sender_name, created_at, direction
           FROM messages WHERE id = $1 LIMIT 1`,
        [messageId],
      ),
      query(
        `SELECT id, property_name, property_id, guesty_conversation_id, channel, status,
                tenant_id, guest_name,
                check_in_date, check_out_date, num_guests, notes, conversation_summary,
                last_message_at, last_inbound_at, last_detected_language, reservation_id,
                auto_send_enabled
           FROM conversations WHERE id = $1 LIMIT 1`,
        [conversationId],
      ),
    ]);

    if (!messageRows.rows[0] || !convRows.rows[0]) {
      throw new Error(`message ${messageId} or conversation ${conversationId} not found`);
    }
    conversationRow = convRows.rows[0];
    try {
      const reservationContext = await resolveInboxReservationContext(conversationRow, {
        tenantId: conversationRow.tenant_id,
      });
      conversationRow = applyReservationContextToConversation(conversationRow, reservationContext);
    } catch (e) {
      console.warn(`[draft-gen] reservation context overlay failed for ${conversationId}: ${e.message}`);
    }

    // Previous draft body — only fetched on revision so the revision
    // prompt can show what's being rewritten.
    let previousDraftBody = null;
    if (revisionInstruction) {
      const prior = await query(
        `SELECT draft_body FROM drafts
          WHERE conversation_id = $1 AND state = $2
          ORDER BY updated_at DESC LIMIT 1`,
        [conversationId, DRAFT_SUPERSEDED_STATE],
      );
      previousDraftBody = prior.rows[0]?.draft_body || null;
    }

    const result = await generateDraft({
      message: messageRows.rows[0],
      conversation: conversationRow,
      revisionInstruction,
      previousDraftBody,
    });

    if (!revisionInstruction) {
      const latest = await latestSubstantiveMessage(conversationId);
      if (!latest || latest.direction !== 'inbound' || String(latest.id) !== String(messageId)) {
        await query(
          `UPDATE drafts
              SET state = $1,
                  updated_at = NOW()
            WHERE id = $2`,
          [DRAFT_SUPERSEDED_STATE, draftId],
        );
        console.log(`[draft-gen] superseded draft=${draftId}; latest substantive message is ${latest?.direction || 'missing'} ${latest?.id || ''}`);
        return { draftId, state: DRAFT_SUPERSEDED_STATE, skipped: 'latest_message_not_inbound' };
      }
    }

    await query(
      `UPDATE drafts
          SET draft_body = $1,
              confidence = $2,
              state = $3,
              updated_at = NOW()
        WHERE id = $4`,
      [result.draftBody, result.confidence, DRAFT_READY_STATE, draftId],
    );

    console.log(
      `[draft-gen] ready draft=${draftId} msg=${messageId} conv=${conversationId} ` +
      `model=${result.model} conf=${result.confidence} ` +
      `tokens=${result.inputTokens}+${result.outputTokens} ` +
      `kbSkills=${result.loadedSkills.length} latency=${result.promptLatencyMs}ms`,
    );

    publishFadEvent({
      tenantId: convRows.rows[0]?.tenant_id,
      type: 'inbox.draft_ready',
      payload: { draftId, messageId, conversationId, confidence: result.confidence },
    }).catch(() => {});
    resolveGmWatchers(conversationId, convRows.rows[0]?.tenant_id).then((watchers) => {
      if (watchers.length === 0) return null;
      return notifyUsers({
        tenantId: convRows.rows[0]?.tenant_id,
        userIds: watchers,
        type: 'inbox_draft_ready',
        title: 'Draft ready',
        body: convRows.rows[0]?.guest_name ? `${convRows.rows[0].guest_name} has a reply ready` : 'A guest reply is ready for review',
        url: `/fad?m=inbox&thread=${conversationId}`,
        source: 'inbox',
        sourceId: draftId,
        priority: result.confidence < 55 ? 'high' : 'normal',
        data: { conversationId, draftId, confidence: result.confidence },
      });
    }).catch(() => {});

    return {
      draftId,
      state: DRAFT_READY_STATE,
      confidence: result.confidence,
      model: result.model,
    };
  } catch (e) {
    console.error(`[draft-gen] failed message=${messageId} conv=${conversationId}: ${e.message}`);
    if (draftId) {
      await query(
        `UPDATE drafts SET state = $1, updated_at = NOW()
          WHERE id = $2 AND state = $3`,
        [DRAFT_FAILED_STATE, draftId, DRAFT_INITIAL_STATE],
      ).catch((err) => console.warn(`[draft-gen] failed-state UPDATE errored: ${err.message}`));
      const tenantId = conversationRow?.tenant_id;
      if (tenantId) {
        resolveGmWatchers(conversationId, tenantId).then((watchers) => {
          if (watchers.length === 0) return null;
          return notifyUsers({
            tenantId,
            userIds: watchers,
            type: 'inbox_draft_generation_failed',
            title: 'Draft generation failed',
            body: conversationRow?.guest_name
              ? `Friday could not generate a reply for ${conversationRow.guest_name}.`
              : 'Friday could not generate a guest reply.',
            url: `/fad?m=inbox&thread=${conversationId}`,
            source: 'inbox',
            sourceId: draftId,
            priority: 'high',
            data: { conversationId, draftId, messageId },
          });
        }).catch(() => {});
      }
    }
    return { error: e.message, draftId };
  }
}

module.exports = {
  triggerDraftGeneration,
  generateDraft,
  // Exposed for tests + the reaper.
  stripAIPreamble,
  correctCurrencyFormatting,
  calculateConfidence,
  shouldSuppressDraft,
  resolvePropertyCode,
  detectTaskSignals,
  formatMessageForContext,
  languageRoot,
  ensureOperatorEnglishDraft,
  isTransientDraftFailure,
  buildDraftUserMessage,
  compactDraftSystemPrompt,
  compactHistoryMessages,
  latestInboundMessage,
  isGuestStatusUpdateRequest,
  isOperationalIncidentContext,
  statusUpdateSafetyApplies,
  statusUpdateSafetyInstruction,
  buildSafeStatusUpdateDraft,
  guestFirstName,
  applyStatusUpdateSafety,
  OPERATOR_DRAFT_LANGUAGE_CONTRACT,
};
