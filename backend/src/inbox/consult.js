'use strict';

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');
const { defaultComposer } = require('../knowledge/composer');
const { buildCompactKnowledgeAppendix } = require('../knowledge/compact_prompt');
const { buildRuntimeKnowledgeBlock } = require('../knowledge/runtime_context');
const { generateDraftReply, DRAFT_MODEL } = require('../ai/kimi_draft');
const { loadActionFeedbackBlock } = require('./learning_context');
const {
  resolvePropertyCode,
  formatMessageForContext,
  detectTaskSignals,
  latestInboundMessage,
  latestGuestTurnPromptBlock,
  statusUpdateSafetyInstruction,
  applyStatusUpdateSafety,
  stripAIPreamble,
  capitalizeDraftOpening,
} = require('./draft_generator');
const {
  resolveInboxReservationContext,
  applyReservationContextToConversation,
  formatReservationContextForPrompt,
} = require('./reservation_context');
const { safeConversationSummary } = require('./summary_quality');
const { buildLiveExchangeRateBlock } = require('./exchange_rates');
const { publishFadEvent } = require('../realtime');
const { withConsultConversationLease } = require('./consult_lock');
const { recordLearningEvent } = require('../ask_friday/event_writer');

const router = express.Router();
// 2026-05-23 — timeouts bumped 90s → 8 min (primary) / 45s → 5 min
// (fallback). Coordinated with nginx proxy_read_timeout bump (60s →
// 600s). kimi_draft now tries Gemini 3.5 Flash first (typically <15s);
// the long ceiling covers Kimi K2.6's reasoning step on full-thread
// prompts when Gemini falls back. Without the nginx side, > 60s was
// dead time (nginx 504 first).
const CONSULT_TIMEOUT_MS = Number(process.env.KIMI_CONSULT_TIMEOUT_MS) || 480_000;
const CONSULT_MAX_RETRIES = Number(process.env.KIMI_CONSULT_MAX_RETRIES) || 0;
const CONSULT_MAX_TOKENS = Number(process.env.KIMI_CONSULT_MAX_TOKENS) || 3200;
// Compact Consult retries still carry KB, reservation context, and session
// history, so default to the long-context draft model unless ops overrides it.
const CONSULT_FALLBACK_MODEL = process.env.KIMI_CONSULT_FALLBACK_MODEL || process.env.KIMI_FAST_DRAFT_MODEL || DRAFT_MODEL;
const CONSULT_FALLBACK_TIMEOUT_MS = Number(process.env.KIMI_CONSULT_FALLBACK_TIMEOUT_MS) || 300_000;
const CONSULT_FALLBACK_MAX_RETRIES = Number(process.env.KIMI_CONSULT_FALLBACK_MAX_RETRIES) || 0;
const CONSULT_FALLBACK_MAX_TOKENS = Number(process.env.KIMI_CONSULT_FALLBACK_MAX_TOKENS) || 1800;
const CONSULT_TRANSIENT_FAILURE_RE = /(timeout|timed out|ECONNABORTED|ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up|rate limit|too many requests|overloaded|temporarily|unavailable|gateway|502|503|504)/i;
const CONSULT_RECENT_MESSAGE_LIMIT = Number(process.env.CONSULT_RECENT_MESSAGE_LIMIT) || 80;
const WEBSITE_CONVERSATION_PREFIX = 'web-';
const WEBSITE_AI_HANDOFF_EVENT_TYPE = 'website.ai_handoff';
const WEBSITE_VISITOR_MESSAGE_EVENT_TYPE = 'website.visitor_message';
const WEBSITE_TAKEOVER_EVENT_TYPE = 'website.ai_handoff_takeover';
const WEBSITE_STAFF_REPLY_EVENT_TYPE = 'staff.reply_sent';
const WEBSITE_DRAFT_EVENT_TYPES_SQL = "('ai.friday_drafting', 'ai.draft_ready', 'ai.draft_generation_failed')";

const VALID_CONTEXTS = new Set([
  'revision',
  'compose',
  'draft_review',
  'pending_action',
  'next_step',
  'teaching',
  'learning_candidate',
  'message_review',
]);

const CONVERSATION_REQUIRED_CONTEXTS = new Set([
  'revision',
  'compose',
  'draft_review',
  'message_review',
]);

const CONTEXT_TO_SURFACE = {
  revision: 'inbox-drafts',
  compose: 'inbox-drafts',
  draft_review: 'inbox-drafts',
  pending_action: 'pending-actions',
  next_step: 'pending-actions',
  teaching: 'inbox-advisory',
  learning_candidate: 'learning-analyzer',
  message_review: 'inbox-advisory',
};

const conversationLocks = new Map();

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function conversationIdForSession(value) {
  return isUuid(value) ? value : null;
}

function websiteThreadIdForConversation(value) {
  const text = String(value || '').trim();
  if (!text.startsWith(WEBSITE_CONVERSATION_PREFIX)) return null;
  const threadId = text.slice(WEBSITE_CONVERSATION_PREFIX.length);
  return isUuid(threadId) ? threadId : null;
}

function firstPayloadString(payload, keys) {
  if (!payload || typeof payload !== 'object') return '';
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value != null && typeof value !== 'object') {
      const text = String(value).trim();
      if (text) return text;
    }
  }
  return '';
}

function formatTranscriptTailForConsult(transcriptTail) {
  if (!Array.isArray(transcriptTail) || transcriptTail.length === 0) return '';
  return transcriptTail
    .map((message) => {
      const role = message?.role === 'assistant' ? 'Website AI' : 'Visitor';
      const content = typeof message?.content === 'string' ? message.content.trim() : '';
      return content ? `${role}: ${content}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

function formatKeyValueObjectForConsult(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const lines = Object.entries(value)
    .slice(0, 20)
    .map(([key, raw]) => {
      const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
      return text ? `- ${key}: ${text}` : '';
    })
    .filter(Boolean);
  return lines.length ? `${label}\n${lines.join('\n')}` : '';
}

function websiteEventBodyForConsult(event) {
  const payload = event?.payload || {};
  const type = String(event?.event_type || '');

  if (type === WEBSITE_AI_HANDOFF_EVENT_TYPE) {
    const parts = [
      firstPayloadString(payload, ['visitorTurn']) ? `Latest visitor turn:\n${firstPayloadString(payload, ['visitorTurn'])}` : '',
      firstPayloadString(payload, ['conversationSummary']) ? `Website AI summary:\n${firstPayloadString(payload, ['conversationSummary'])}` : '',
      formatTranscriptTailForConsult(payload.transcriptTail) ? `Transcript tail:\n${formatTranscriptTailForConsult(payload.transcriptTail)}` : '',
      formatKeyValueObjectForConsult(payload.extracted, 'Extracted website context:'),
      Array.isArray(payload.toolsUsed) && payload.toolsUsed.length ? `Tools/context used: ${payload.toolsUsed.join(', ')}` : '',
      payload.confidence ? `Website AI confidence: ${payload.confidence}` : '',
      firstPayloadString(payload, ['escalationReason']) ? `Escalation reason: ${firstPayloadString(payload, ['escalationReason'])}` : '',
      firstPayloadString(payload, ['recommendedNextAction']) ? `Recommended next action: ${firstPayloadString(payload, ['recommendedNextAction'])}` : '',
    ].filter(Boolean);
    return parts.join('\n\n');
  }

  if (type === WEBSITE_VISITOR_MESSAGE_EVENT_TYPE) {
    return firstPayloadString(payload, ['body', 'message', 'visitorTurn']);
  }

  if (type === WEBSITE_STAFF_REPLY_EVENT_TYPE) {
    const channel = firstPayloadString(payload, ['channel', 'delivery']);
    const body = firstPayloadString(payload, ['body', 'message', 'final_body']);
    return [channel ? `Channel: ${channel}` : '', body].filter(Boolean).join('\n');
  }

  if (type === WEBSITE_TAKEOVER_EVENT_TYPE) {
    const reason = firstPayloadString(payload, ['reason']);
    return [
      'Human takeover recorded for this website AI conversation.',
      payload.aiMayReply === false ? 'Website AI may not reply while takeover is active.' : '',
      reason ? `Reason: ${reason}` : '',
    ].filter(Boolean).join('\n');
  }

  const direct = firstPayloadString(payload, [
    'body',
    'message',
    'question',
    'notes',
    'comments',
    'visitorTurn',
  ]);
  if (direct) return direct;

  const facts = [
    firstPayloadString(payload, ['residence_slug', 'residenceSlug']) ? `Residence: ${firstPayloadString(payload, ['residence_slug', 'residenceSlug'])}` : '',
    firstPayloadString(payload, ['check_in', 'checkIn']) && firstPayloadString(payload, ['check_out', 'checkOut'])
      ? `Dates: ${firstPayloadString(payload, ['check_in', 'checkIn'])} - ${firstPayloadString(payload, ['check_out', 'checkOut'])}`
      : '',
    firstPayloadString(payload, ['party_size', 'partySize', 'guests']) ? `Guests: ${firstPayloadString(payload, ['party_size', 'partySize', 'guests'])}` : '',
    firstPayloadString(payload, ['reference']) ? `Reference: ${firstPayloadString(payload, ['reference'])}` : '',
  ].filter(Boolean);
  return facts.length ? facts.join('\n') : JSON.stringify(payload, null, 2).slice(0, 2000);
}

function websiteEventToConsultMessage(event) {
  const type = String(event?.event_type || '');
  const isStaff = event?.source === 'fad'
    || type === WEBSITE_STAFF_REPLY_EVENT_TYPE
    || type === WEBSITE_TAKEOVER_EVENT_TYPE;
  let sender = 'Website visitor';
  if (type === WEBSITE_AI_HANDOFF_EVENT_TYPE) sender = 'Website AI handoff';
  else if (type === WEBSITE_VISITOR_MESSAGE_EVENT_TYPE) sender = 'Website visitor';
  else if (type === WEBSITE_STAFF_REPLY_EVENT_TYPE) sender = 'Friday';
  else if (type === WEBSITE_TAKEOVER_EVENT_TYPE) sender = 'FAD takeover';
  else if (isStaff) sender = 'Friday';

  const body = websiteEventBodyForConsult(event).trim();
  if (!body) return null;
  return {
    id: event.id,
    direction: isStaff ? 'outbound' : 'inbound',
    sender_name: sender,
    body,
    translated_body: null,
    created_at: event.created_at,
    is_auto_response: false,
    module_type: 'website_inbox',
  };
}

function latestWebsiteHandoffPayload(events) {
  if (!Array.isArray(events)) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]?.event_type === WEBSITE_AI_HANDOFF_EVENT_TYPE) return events[i].payload || null;
  }
  return null;
}

function websitePropertyLabel(thread, events) {
  if (thread?.guesty_listing_id) return thread.guesty_listing_id;
  const allPayloads = Array.isArray(events) ? events.map((e) => e?.payload || {}) : [];
  for (let i = allPayloads.length - 1; i >= 0; i--) {
    const payload = allPayloads[i];
    const direct = firstPayloadString(payload, [
      'property_code',
      'propertyCode',
      'residence_slug',
      'residenceSlug',
      'listing_slug',
      'listingSlug',
      'listing_name',
      'listingName',
      'residence',
      'property',
    ]);
    if (direct) return direct;
    const extracted = payload.extracted;
    const fromExtracted = firstPayloadString(extracted, ['property', 'property_code', 'residence', 'residence_slug', 'area']);
    if (fromExtracted) return fromExtracted;
  }
  return null;
}

function websiteConversationFromThread(thread, events, conversationId) {
  const handoffPayload = latestWebsiteHandoffPayload(events) || {};
  const summary = firstPayloadString(handoffPayload, ['conversationSummary']);
  return {
    ...thread,
    id: conversationId,
    source_thread_id: thread.id,
    guest_name: thread.guest_name || thread.guest_email_raw || thread.guest_email || 'Website visitor',
    guest_email: thread.guest_email_raw || thread.guest_email || null,
    property_name: websitePropertyLabel(thread, events),
    channel: 'website',
    communication_channel: 'website',
    status: thread.status || 'open',
    conversation_summary: summary || thread.notes || null,
    notes: thread.notes || null,
  };
}

function withProcessConversationLock(conversationId, fn) {
  const key = conversationId || '__global__';
  const prev = conversationLocks.get(key) || Promise.resolve();
  let release;
  const lock = new Promise((resolve) => { release = resolve; });
  conversationLocks.set(key, lock);
  return prev.then(fn).finally(() => {
    release();
    if (conversationLocks.get(key) === lock) conversationLocks.delete(key);
  });
}

function withConversationLock(conversationId, tenantId, fn, metadata = {}) {
  const key = conversationId || '__global__';
  return withProcessConversationLock(key, () => withConsultConversationLease({
    tenantId,
    conversationId: key,
    holderRef: metadata.actorId || metadata.actorName || null,
    metadata,
  }, fn));
}

function actorName(req) {
  return req.identity?.displayName
    || req.identity?.username
    || req.identity?.userId
    || 'fad-user';
}

function actorId(req) {
  return req.identity?.userId || req.identity?.username || null;
}

function confidenceBand(value) {
  if (value >= 0.75) return 'high';
  if (value >= 0.5) return 'medium';
  if (value > 0) return 'low';
  return 'unknown';
}

function cleanInstruction(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function truncateText(value, maxLength) {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 18)).trimEnd()}\n[truncated]`;
}

function stripFullThreadEnvelope(value) {
  const text = String(value || '');
  if (!text.startsWith('[Operator requested FULL conversation context')) return text;
  const match = text.match(/\n\nMy question:\s*([\s\S]*)$/i);
  return match ? match[1].trim() : text;
}

function compactConsultEnvelopeForHistory(value) {
  const parsed = parseJsonish(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return value;
  const response = String(parsed.response_text || parsed.response || parsed.message || '').trim();
  const drafts = normalizeConsultDrafts(parsed);
  const lines = [];
  if (response) lines.push(response);
  drafts.forEach((draft, index) => {
    const label = draft.recipientLabel ? ` for ${draft.recipientLabel}` : '';
    lines.push(`Draft ${index + 1}${label}: ${truncateText(draft.body, 700)}`);
  });
  return lines.length ? lines.join('\n\n') : value;
}

function sanitizeConsultHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const next = { ...entry };
  if (typeof next.content === 'string') next.content = compactConsultEnvelopeForHistory(stripFullThreadEnvelope(next.content));
  if (typeof next.text === 'string') next.text = compactConsultEnvelopeForHistory(stripFullThreadEnvelope(next.text));
  return next;
}

function sanitizeConsultHistory(history) {
  return Array.isArray(history) ? history.map(sanitizeConsultHistoryEntry) : [];
}

function isTransientConsultFailure(result) {
  if (!result || result.ok) return false;
  if (result.finishReason === 'length') return true;
  const status = Number(result.status);
  if ([408, 409, 425, 429].includes(status)) return true;
  if (status >= 500) return true;
  return CONSULT_TRANSIENT_FAILURE_RE.test(String(result.error || ''));
}

function stripProtocolTags(text) {
  return String(text || '')
    .replace(/\[DRAFT_UPDATE\][\s\S]*?\[\/DRAFT_UPDATE\]/g, '')
    .replace(/\[TEACH\][\s\S]*?\[\/TEACH\]/g, '')
    .replace(/\[TASK\][\s\S]*?\[\/TASK\]/g, '')
    .trim();
}

function parseDraftUpdate(responseText) {
  const match = String(responseText || '').match(/\[DRAFT_UPDATE\]([\s\S]*?)\[\/DRAFT_UPDATE\]/);
  return match ? match[1].trim() || null : null;
}

function parseJsonish(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  if (!cleaned) return null;
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(cleaned.slice(first, last + 1)); } catch { /* fall through */ }
  }
  return null;
}

const DRAFT_LIKE_OPENING_RE = /^(hi|hello|dear|hey|good morning|good afternoon|good evening)\b[\s,!.:-]/i;
const DRAFT_LEAD_IN_RE = /^(?:sure|of course|absolutely|here(?:'s| is)|draft|message|reply|email)\b[\s\S]{0,180}?:\s*/i;
const DRAFT_SIGNOFF_RE = /\b(best regards|kind regards|regards|warm regards|thanks again|thank you)\b/i;

function extractUntaggedDraftUpdate(responseText, context) {
  if (!['compose', 'revision', 'draft_review'].includes(context)) return null;
  let text = stripProtocolTags(responseText);
  if (!text) return null;
  text = stripAIPreamble(text).trim();
  text = text.replace(DRAFT_LEAD_IN_RE, '').trim();
  if (!text) return null;
  const lineCount = text.split(/\n+/).filter((line) => line.trim()).length;
  const looksLikeDraft =
    DRAFT_LIKE_OPENING_RE.test(text)
    || DRAFT_SIGNOFF_RE.test(text)
    || (lineCount >= 2 && /\byou\b|\bwe\b|\bour\b|\bFriday\b/i.test(text));
  if (!looksLikeDraft) return null;
  return capitalizeDraftOpening(text);
}

function replaceDraftUpdate(responseText, draftUpdate) {
  const replacement = `[DRAFT_UPDATE]${draftUpdate || ''}[/DRAFT_UPDATE]`;
  const text = String(responseText || '');
  if (/\[DRAFT_UPDATE\][\s\S]*?\[\/DRAFT_UPDATE\]/.test(text)) {
    return text.replace(/\[DRAFT_UPDATE\][\s\S]*?\[\/DRAFT_UPDATE\]/, replacement);
  }
  return `${text.trim()}\n${replacement}`.trim();
}

function normalizeConsultDraft(raw) {
  const source = raw && typeof raw === 'object' ? raw : { body: raw };
  const body = stripProtocolTags(
    source.body
    || source.draft_body
    || source.draftBody
    || source.text
    || source.message
    || '',
  );
  if (!body) return null;
  const recipientLabel = source.recipient_label || source.recipientLabel || source.recipient || source.to || null;
  const targetHint = source.target_hint || source.targetHint || source.target || null;
  return {
    body: capitalizeDraftOpening(body),
    recipientLabel: recipientLabel ? String(recipientLabel).trim().slice(0, 120) : null,
    channel: source.channel ? String(source.channel).trim().slice(0, 40) : null,
    targetHint: targetHint ? String(targetHint).trim().slice(0, 200) : null,
  };
}

function normalizeConsultDrafts(parsed) {
  if (!parsed || typeof parsed !== 'object') return [];
  const rawDrafts = [];
  if (Array.isArray(parsed.drafts)) rawDrafts.push(...parsed.drafts);
  if (Array.isArray(parsed.draft_updates)) rawDrafts.push(...parsed.draft_updates);
  if (parsed.draft_update) rawDrafts.push(parsed.draft_update);
  if (parsed.draft) rawDrafts.push(parsed.draft);
  return rawDrafts
    .map(normalizeConsultDraft)
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeTeachingActionObject(action, teachingIdMap = {}) {
  if (!action) return [];
  if (typeof action === 'string') {
    return parseTeachingActions(`[TEACH]{"action":"create","instruction":${JSON.stringify(action)}}[/TEACH]`, teachingIdMap);
  }
  if (typeof action !== 'object') return [];
  return parseTeachingActions(`[TEACH]${JSON.stringify(action)}[/TEACH]`, teachingIdMap);
}

function parseTeachingActions(responseText, teachingIdMap = {}) {
  const actions = [];
  const matches = [...String(responseText || '').matchAll(/\[TEACH\]([\s\S]*?)\[\/TEACH\]/g)];
  for (const match of matches) {
    const raw = match[1].trim();
    try {
      const parsed = JSON.parse(raw);
      actions.push({
        action: parsed.action || 'create',
        instruction: String(parsed.instruction || '').trim(),
        scope: parsed.scope || 'global',
        propertyCode: parsed.property_code || parsed.propertyCode || null,
        reason: parsed.reason || null,
        existingTeachingId: parsed.existing
          ? teachingIdMap[parsed.existing] || parsed.existingTeachingId || null
          : (parsed.existingTeachingId || null),
        conflictingTeachingId: parsed.conflicting
          ? teachingIdMap[parsed.conflicting] || parsed.conflictingTeachingId || null
          : (parsed.conflictingTeachingId || null),
        conflictingTeachingIndex: parsed.conflicting || null,
      });
    } catch {
      actions.push({
        action: 'create',
        instruction: raw,
        scope: 'global',
      });
    }
  }
  return actions.filter((a) => a.instruction);
}

const VALID_TASK_DEPT = new Set(['cleaning', 'inspection', 'maintenance', 'office']);
const VALID_TASK_PRIORITY = new Set(['urgent', 'high', 'medium', 'low', 'lowest']);

function normalizeTaskSuggestionObject(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const title = String(parsed.title || '').trim();
  if (!title) return null;
  const dept = String(parsed.department || '').toLowerCase();
  const prio = String(parsed.priority || '').toLowerCase();
  return {
    title: title.slice(0, 140),
    description: String(parsed.description || '').trim().slice(0, 1000) || null,
    propertyCode: parsed.property_code || parsed.propertyCode || null,
    department: VALID_TASK_DEPT.has(dept) ? dept : 'maintenance',
    priority: VALID_TASK_PRIORITY.has(prio) ? prio : 'medium',
    subdepartment: parsed.subdepartment || null,
    dueDate: parsed.due_date || parsed.dueDate || null,
  };
}

// Parse [TASK]{json}[/TASK] suggestions emitted by legacy Friday Consult
// responses when the conversation surfaces actionable work.
function parseTaskSuggestions(responseText) {
  const suggestions = [];
  const matches = [...String(responseText || '').matchAll(/\[TASK\]([\s\S]*?)\[\/TASK\]/g)];
  for (const match of matches) {
    const raw = match[1].trim();
    try {
      const parsed = JSON.parse(raw);
      const suggestion = normalizeTaskSuggestionObject(parsed);
      if (suggestion) suggestions.push(suggestion);
    } catch {
      // Malformed JSON — skip. Friday will re-propose if it still matters.
    }
  }
  return suggestions;
}

function parseConsultEnvelope(responseText, context, teachingIdMap = {}) {
  const parsed = parseJsonish(responseText);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const drafts = normalizeConsultDrafts(parsed);
  const rawTeachings = Array.isArray(parsed.teaching_actions)
    ? parsed.teaching_actions
    : (Array.isArray(parsed.teachings) ? parsed.teachings : []);
  const teachingActions = rawTeachings.flatMap((action) => normalizeTeachingActionObject(action, teachingIdMap));
  const rawTasks = Array.isArray(parsed.task_suggestions)
    ? parsed.task_suggestions
    : (Array.isArray(parsed.tasks) ? parsed.tasks : []);
  const taskSuggestions = rawTasks
    .map(normalizeTaskSuggestionObject)
    .filter(Boolean);
  const responseTextValue = stripProtocolTags(
    parsed.response_text
    || parsed.response
    || parsed.message
    || parsed.operator_message
    || '',
  );
  return {
    responseText: responseTextValue,
    drafts,
    teachingActions,
    taskSuggestions,
    usedEnvelope: true,
    context,
  };
}

const TASK_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'guest', 'guests',
  'please', 'task', 'follow', 'up', 'followup', 'check', 'confirm', 'about',
  'regarding', 'property', 'friday', 'team', 'issue', 'request',
]);

function normalizeTaskText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !TASK_STOP_WORDS.has(word));
}

function taskSimilarity(a, b) {
  const aWords = normalizeTaskText(a);
  const bWords = normalizeTaskText(b);
  if (aWords.length === 0 || bWords.length === 0) return 0;
  const bSet = new Set(bWords);
  const overlap = aWords.filter((word) => bSet.has(word)).length;
  return overlap / Math.min(aWords.length, bWords.length);
}

function filterDuplicateTaskSuggestions(suggestions, existingWork) {
  if (!Array.isArray(suggestions) || suggestions.length === 0) return [];
  if (!Array.isArray(existingWork) || existingWork.length === 0) return suggestions;
  return suggestions.filter((suggestion) => {
    const candidate = [suggestion.title, suggestion.description].filter(Boolean).join(' ');
    return !existingWork.some((item) => {
      const existing = [item.title, item.action_text, item.description].filter(Boolean).join(' ');
      return taskSimilarity(candidate, existing) >= 0.6;
    });
  });
}

function formatExistingWorkForPrompt(existingWork) {
  if (!Array.isArray(existingWork) || existingWork.length === 0) return '';
  const lines = existingWork.slice(0, 30).map((item) => {
    const kind = item.kind === 'ops_task' ? 'Ops task' : 'Pending action';
    const title = item.title || item.action_text || item.description || '(untitled)';
    const status = item.status ? `status=${item.status}` : '';
    const owner = item.owner ? `owner=${item.owner}` : '';
    const due = item.due_date || item.due_by ? `due=${item.due_date || item.due_by}` : '';
    const property = item.property_code ? `property=${item.property_code}` : '';
    const reservation = item.reservation_guesty_id ? `reservation=${item.reservation_guesty_id}` : '';
    const extra = [status, owner, due, property, reservation].filter(Boolean).join(', ');
    return `- ${kind}: ${title}${extra ? ` (${extra})` : ''}`;
  });
  return [
    '[Existing open work for this thread]',
    ...lines,
    'Do not propose a duplicate task. If the operator asks about the same work, suggest updating the existing item instead.',
  ].join('\n');
}

function selectConsultSurface(context) {
  return CONTEXT_TO_SURFACE[context] || 'inbox-advisory';
}

function contextTaskInstruction(context) {
  switch (context) {
    case 'revision':
      return `Task: Help revise the current draft. If you rewrite it, put each complete updated guest-facing message in drafts[].body and briefly explain what changed in response_text.`;
    case 'compose':
      return `Task: Help compose guest-facing message drafts. When writing message text, put each complete message in drafts[].body. If the operator asks for separate recipients/messages, create one drafts[] item per recipient/message.`;
    case 'draft_review':
      return `Task: Review the draft only against Friday rules, active teachings, property facts, and platform constraints. If the operator asks for a rewrite, put the rewritten message in drafts[].body.`;
    case 'pending_action':
    case 'next_step':
      return `Task: Advise the team on the pending action or next operational step. Inbox may propose a pending action; Ops owns real task creation and lifecycle. Do not create or imply a task was created.`;
    case 'teaching':
    case 'learning_candidate':
      return `Task: Decide whether this pattern is worth learning. Use teaching_actions[] only when the operator should confirm a durable rule.`;
    case 'message_review':
      return `Task: Review the guest/team message for accuracy, tone, and operational risk. Suggest a concise correction when needed.`;
    default:
      return `Task: Answer the operator directly and concisely.`;
  }
}

function buildConsultUserMessage({
  instruction,
  context,
  conversation,
  messages,
  draftBody,
  liveExchangeRateBlock,
  sessionHistory,
  currentSessionSummary,
  existingWork,
  fullThread = false,
}) {
  const parts = [];
  parts.push(`[Consult context]\n- Mode: ${context}`);
  if (conversation) {
    const convLines = [
      `Conversation ID: ${conversation.id}`,
      `Guest: ${conversation.guest_name || 'unknown'}`,
      `Property: ${conversation.property_name || 'unknown'}`,
      `Channel: ${conversation.channel || conversation.communication_channel || 'unknown'}`,
      `Check-in: ${conversation.check_in_date || 'n/a'} -> check-out: ${conversation.check_out_date || 'n/a'}`,
      `Guests: ${conversation.num_guests || 'n/a'}`,
      `Status: ${conversation.status || 'unknown'}`,
    ];
    const priorSummary = safeConversationSummary(conversation.conversation_summary, { messages });
    if (priorSummary) convLines.push(`Prior summary (unverified; prefer actual messages): ${priorSummary}`);
    if (conversation.notes) convLines.push(`Staff notes: ${conversation.notes}`);
    parts.push(`[Conversation]\n${convLines.map((l) => `- ${l}`).join('\n')}`);
    const reservationBlock = formatReservationContextForPrompt(conversation.reservation_context);
    if (reservationBlock) parts.push(reservationBlock);
  }
  if (messages && messages.length > 0) {
    const label = fullThread ? 'Full thread messages' : 'Recent thread messages';
    parts.push(`[${label}]\n${messages.map(formatMessageForContext).join('\n\n')}`);
    const latestTurnBlock = latestGuestTurnPromptBlock(messages);
    if (latestTurnBlock) parts.push(latestTurnBlock);
  }
  if (draftBody) {
    parts.push(`[Current working draft]\n${draftBody}`);
  }
  if (liveExchangeRateBlock) {
    parts.push(liveExchangeRateBlock);
  }
  const existingWorkBlock = formatExistingWorkForPrompt(existingWork);
  if (existingWorkBlock) parts.push(existingWorkBlock);
  const latestInbound = latestInboundMessage(messages);
  const updateGuard = statusUpdateSafetyInstruction({
    message: latestInbound,
    conversation,
    messages,
  });
  if (updateGuard) parts.push(updateGuard);
  if (currentSessionSummary) {
    parts.push(`[Previous compacted Consult context]\n${currentSessionSummary}`);
  }
  if (sessionHistory && sessionHistory.length > 0) {
    const recent = sanitizeConsultHistory(sessionHistory).slice(-10).map((m) => {
      const role = m.role === 'assistant' ? 'Friday' : (m.sender || 'Operator');
      return `${role}: ${m.content || m.text || ''}`;
    }).join('\n\n');
    if (recent.trim()) parts.push(`[Recent Ask Friday turns]\n${recent}`);
  }
  parts.push(contextTaskInstruction(context));
  parts.push(`[Operator request]\n${instruction}`);
  return parts.join('\n\n');
}

function buildCompactConsultUserMessage({
  instruction,
  context,
  conversation,
  messages,
  draftBody,
  liveExchangeRateBlock,
  sessionHistory,
  currentSessionSummary,
  existingWork,
}) {
  const parts = [];
  parts.push(`[Compact Consult context]\n- Mode: ${context}`);
  if (conversation) {
    const convLines = [
      `Conversation ID: ${conversation.id}`,
      `Guest: ${conversation.guest_name || 'unknown'}`,
      `Property: ${conversation.property_name || 'unknown'}`,
      `Channel: ${conversation.channel || conversation.communication_channel || 'unknown'}`,
      `Stay: ${conversation.check_in_date || 'n/a'} -> ${conversation.check_out_date || 'n/a'}`,
      `Guests: ${conversation.num_guests || 'n/a'}`,
      `Status: ${conversation.status || 'unknown'}`,
    ];
    const priorSummary = safeConversationSummary(conversation.conversation_summary, { messages });
    if (priorSummary) {
      convLines.push(`Prior summary (unverified): ${truncateText(priorSummary, 900)}`);
    }
    parts.push(`[Conversation]\n${convLines.map((l) => `- ${l}`).join('\n')}`);
    const reservationBlock = formatReservationContextForPrompt(conversation.reservation_context);
    if (reservationBlock) parts.push(truncateText(reservationBlock, 1800));
  }
  const recentMessages = Array.isArray(messages)
    ? messages.slice(-8).map((m) => truncateText(formatMessageForContext(m), 900))
    : [];
  if (recentMessages.length > 0) {
    parts.push(`[Last thread messages]\n${recentMessages.join('\n\n')}`);
    const latestTurnBlock = latestGuestTurnPromptBlock(messages);
    if (latestTurnBlock) parts.push(truncateText(latestTurnBlock, 2200));
  }
  if (draftBody) {
    parts.push(`[Current working draft]\n${truncateText(draftBody, 1800)}`);
  }
  if (liveExchangeRateBlock) {
    parts.push(truncateText(liveExchangeRateBlock, 1800));
  }
  const existingWorkBlock = formatExistingWorkForPrompt(existingWork);
  if (existingWorkBlock) parts.push(truncateText(existingWorkBlock, 2200));
  const latestInbound = latestInboundMessage(messages);
  const updateGuard = statusUpdateSafetyInstruction({
    message: latestInbound,
    conversation,
    messages,
  });
  if (updateGuard) parts.push(updateGuard);
  if (currentSessionSummary) {
    parts.push(`[Previous Consult summary]\n${truncateText(currentSessionSummary, 1200)}`);
  }
  const recentTurns = Array.isArray(sessionHistory)
    ? sanitizeConsultHistory(sessionHistory).slice(-4).map((m) => {
      const role = m.role === 'assistant' ? 'Friday' : (m.sender || 'Operator');
      return `${role}: ${truncateText(m.content || m.text || '', 900)}`;
    }).filter((line) => line.trim())
    : [];
  if (recentTurns.length > 0) {
    parts.push(`[Last Ask Friday turns]\n${recentTurns.join('\n\n')}`);
  }
  parts.push(contextTaskInstruction(context));
  parts.push(`[Operator request]\n${truncateText(instruction, 1800)}`);
  return parts.join('\n\n');
}

function compactConsultSystemPrompt({
  context,
  propertyCode,
  compactKnowledgeAppendix,
}) {
  return `You are Friday, Friday Retreats' AI operations assistant inside FAD.

Respond in English. Be concise and operational.
Use only the compact context provided. Do not invent prices, availability, property features, refunds, or operational commitments.
Return only valid JSON with this shape:
{"response_text":"short operator-facing note","drafts":[{"body":"complete guest-facing draft","recipient_label":"optional","channel":"optional","target_hint":"optional"}],"teaching_actions":[],"task_suggestions":[]}
If the operator asks you to write or modify guest-facing messages, put each complete final message in drafts[].body. Do not paste draft text in response_text.
If you cannot safely answer from the compact context, say exactly what is missing and what the operator should check.
Use confidence gates: high confidence means answer directly; medium confidence means answer with a caveat or ask one clarification; low confidence means say human context is needed.

Surface: ${selectConsultSurface(context)}${propertyCode ? `\nProperty code: ${propertyCode}` : ''}${compactKnowledgeAppendix || ''}`;
}

function composeSystemPrompt({
  context,
  propertyCode,
  instruction,
  draftBody,
  conversation,
  messages,
  liveExchangeRateBlock,
  activeTeachingBlock,
  actionFeedbackBlock,
}) {
  const surface = selectConsultSurface(context);
  const acceptsPropertyCard = surface !== 'learning-analyzer';
  const conversationText = [
    conversation?.channel,
    conversation?.communication_channel,
    conversation?.property_name,
    formatReservationContextForPrompt(conversation?.reservation_context),
    Array.isArray(messages) ? messages.slice(-16).map((m) => `${m.body || ''}\n${m.translated_body || ''}`).join('\n\n') : '',
  ].filter(Boolean).join('\n\n');
  const composerOpts = {
    property_code: acceptsPropertyCard ? (propertyCode || undefined) : undefined,
    context_text: [instruction, draftBody, conversationText].filter(Boolean).join('\n\n').slice(0, 8000),
    task_signals: detectTaskSignals([instruction, draftBody, conversationText].filter(Boolean).join('\n\n')),
  };

  let composed;
  let missingKnowledge = false;
  try {
    composed = defaultComposer().load(surface, composerOpts);
  } catch (e) {
    if (propertyCode && acceptsPropertyCard) {
      missingKnowledge = true;
      composed = defaultComposer().load(surface, {
        ...composerOpts,
        property_code: undefined,
      });
    } else {
      throw e;
    }
  }

  const protocol = `You are Friday, Friday Retreats' AI operations assistant inside FAD.

Always respond in English.

CONSULT RESPONSE ENVELOPE:
- Return only valid JSON. No Markdown, no code fences, no prose outside JSON.
- Required shape:
{"response_text":"short operator-facing note","drafts":[{"body":"complete guest-facing draft","recipient_label":"optional","channel":"optional","target_hint":"optional"}],"teaching_actions":[],"task_suggestions":[]}
- Use response_text for a short operator-facing acknowledgement, explanation, caveat, or missing-context note.
- If you write or modify a guest-facing draft/message, put the complete final text in drafts[].body.
- Never paste guest-facing draft text in response_text.
- If the operator asks for separate messages or recipients, create one drafts[] item per message/recipient. Do not combine separate recipient drafts into one body.
- Draft body text must be English only. Translation happens later at send time.

TEACHING ACTIONS:
- If the operator gives a durable rule, correction, property fact, or recurring operational preference, add one teaching_actions[] object for the UI to confirm.
- Use property scope for property facts. Use global scope only for rules that apply across Friday.
- If the new rule conflicts with an active T-number teaching, use action "flag_conflict" and reference the T-number in "conflicting".
- Teaching action examples:
{"action":"create","instruction":"Keep checkout messages to 1-2 sentences","scope":"global"}
{"action":"create","instruction":"No daily cleaning. Linen change on Wednesdays only.","scope":"property","property_code":"LB-C"}
{"action":"flag_conflict","conflicting":"T2","instruction":"Always mention pool hours for this property","reason":"T2 says keep messages brief"}

TASK SUGGESTIONS:
- When the conversation surfaces real operational work (a maintenance request, cleaning issue, supply run, follow-up reminder, owner ack needed, etc.), add task_suggestions[] objects so the operator can one-click create them.
- Only propose a task when it's clearly actionable + not already handled in this thread. Do not propose tasks for purely informational requests, draft revisions, or learning rules.
- Choose department: cleaning · inspection · maintenance · office.
- Choose priority: urgent (guest is on-property + blocked) · high (guest arriving in <24h or comfort impact) · medium (standard turnaround) · low (cosmetic / nice-to-have).
- Property code: prefer the conversation's property when present, omit if uncertain.
- Task suggestion examples:
{"title":"Fix toilet leak at GBH-C8 — guest reports flooding","department":"maintenance","priority":"urgent","property_code":"GBH-C8","description":"Guest Gael Le Metayer messaged: keypad broken at entry door. Mathias to send technician this afternoon."}
{"title":"Restock welcome amenities at LB-3 before tomorrow's arrival","department":"cleaning","priority":"high","property_code":"LB-3","description":"Standard arrival pack: water, coffee, snacks."}

Be concise. Surface missing knowledge honestly. Do not invent prices, availability, property features, refunds, or operational commitments.`;
  const liveRateProtocol = liveExchangeRateBlock ? `
LIVE EXCHANGE-RATE PROTOCOL:
- If the operator asks for currency conversion or exchange rates, use only the live exchange-rate context in the user message.
- Do not answer exchange-rate questions from memory or historical/training data.
- If the live lookup is unavailable, say that plainly and ask the operator to verify the live rate or try again.` : '';
  const confidenceGates = `
CONFIDENCE GATES:
- High confidence: answer or draft directly from provided context.
- Medium confidence: draft with a caveat, or ask one concise clarification if that is safer.
- Low confidence: say the missing human/property/ops context needed; do not fabricate a guest-facing answer.
- Treat emojis as tone/acknowledgement unless surrounding text makes them factual.`;
  const runtimeKnowledgeBlock = buildRuntimeKnowledgeBlock({
    channel: conversation?.channel || conversation?.communication_channel,
    contextText: [instruction, draftBody, conversationText].filter(Boolean).join('\n\n'),
  });

  return {
    systemPrompt: `${protocol}${liveRateProtocol}${confidenceGates}\n\n${composed.system_message}${runtimeKnowledgeBlock}${activeTeachingBlock || ''}${actionFeedbackBlock || ''}`,
    missingKnowledge,
    metadata: composed.metadata,
    composerSystemMessage: composed.system_message,
    runtimeKnowledgeBlock,
  };
}

async function appendConsultSessionError({ sessionId, context, message, phase }) {
  if (!sessionId) return;
  await query(
    `UPDATE consult_sessions
        SET errors = COALESCE(errors, '[]'::jsonb) || $1::jsonb
      WHERE id = $2`,
    [JSON.stringify([{
      message,
      phase: phase || null,
      timestamp: new Date().toISOString(),
      context,
    }]), sessionId],
  );
}

async function loadConversationBundle(conversationId, tenantId, { fullThread = false } = {}) {
  if (!conversationId) return { conversation: null, messages: [] };
  const websiteThreadId = websiteThreadIdForConversation(conversationId);
  if (websiteThreadId) {
    return loadWebsiteConversationBundle(conversationId, websiteThreadId, tenantId, { fullThread });
  }
  if (!isUuid(conversationId)) return { conversation: null, messages: [] };
  const messagesPromise = fullThread
    ? query(
      `SELECT * FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC, id::text ASC`,
      [conversationId],
    )
    : query(
      `SELECT * FROM (
         SELECT * FROM messages
          WHERE conversation_id = $1
          ORDER BY created_at DESC, id::text DESC
          LIMIT $2
       ) recent
       ORDER BY created_at ASC, id::text ASC`,
      [conversationId, CONSULT_RECENT_MESSAGE_LIMIT],
    );
  const [convResult, messagesResult] = await Promise.all([
    query('SELECT * FROM conversations WHERE id = $1 AND tenant_id = $2', [conversationId, tenantId]),
    messagesPromise,
  ]);
  if (convResult.rows.length === 0) {
    const err = new Error('Conversation not found');
    err.statusCode = 404;
    throw err;
  }
  let conversation = convResult.rows[0];
  try {
    const reservationContext = await resolveInboxReservationContext(conversation, { tenantId });
    conversation = applyReservationContextToConversation(conversation, reservationContext);
  } catch (e) {
    console.warn(`[consult] reservation context overlay failed for ${conversationId}: ${e.message}`);
  }
  return {
    conversation,
    messages: messagesResult.rows,
  };
}

async function loadExistingInboxWork(conversationId, tenantId, conversation = null) {
  if (!isUuid(conversationId)) return [];
  const propertyCode = conversation ? resolvePropertyCode(conversation) : null;
  const reservationIds = [
    conversation?.reservation_id,
    conversation?.guesty_reservation_id,
    conversation?.reservation_context?.guesty_reservation_id,
    conversation?.reservation_context?.reservation_id,
  ].filter(Boolean).map((v) => String(v));
  const taskParams = [tenantId];
  const taskScopeClauses = [];
  taskParams.push(conversationId);
  taskScopeClauses.push(`inbox_thread_id = $${taskParams.length}`);
  if (reservationIds.length > 0) {
    taskParams.push(reservationIds);
    taskScopeClauses.push(`reservation_guesty_id = ANY($${taskParams.length}::text[])`);
  }
  if (propertyCode) {
    taskParams.push(propertyCode);
    taskScopeClauses.push(`property_code = $${taskParams.length}`);
  }
  const [pendingResult, taskResult] = await Promise.all([
    query(
      `SELECT action_text, status, due_by, owner, category
         FROM pending_actions
        WHERE tenant_id = $1
          AND conversation_id = $2
          AND COALESCE(status, 'open') NOT IN (
            'completed',
            'dismissed',
            'auto_dismissed',
            'auto_converted',
            'resolved'
          )
        ORDER BY detected_at DESC NULLS LAST, id::text DESC
        LIMIT 20`,
      [tenantId, conversationId],
    ),
    query(
      `SELECT title, description, status, due_date, source,
              property_code, reservation_guesty_id, inbox_thread_id
         FROM tasks
        WHERE tenant_id = $1
          AND (${taskScopeClauses.join(' OR ')})
          AND COALESCE(status, 'scheduled') NOT IN ('completed', 'closed', 'cancelled')
        ORDER BY created_at DESC NULLS LAST, id::text DESC
        LIMIT 20`,
      taskParams,
    ),
  ]);

  return [
    ...pendingResult.rows.map((row) => ({ kind: 'pending_action', ...row })),
    ...taskResult.rows.map((row) => ({ kind: 'ops_task', ...row })),
  ];
}

async function loadWebsiteConversationBundle(conversationId, threadId, tenantId, { fullThread = false } = {}) {
  const eventsPromise = fullThread
    ? query(
      `SELECT id, event_type, source, payload, created_at
         FROM inbox_events
        WHERE thread_id = $1
          AND event_type NOT IN ${WEBSITE_DRAFT_EVENT_TYPES_SQL}
        ORDER BY created_at ASC, id::text ASC`,
      [threadId],
    )
    : query(
      `SELECT * FROM (
         SELECT id, event_type, source, payload, created_at
           FROM inbox_events
          WHERE thread_id = $1
            AND event_type NOT IN ${WEBSITE_DRAFT_EVENT_TYPES_SQL}
          ORDER BY created_at DESC, id::text DESC
          LIMIT $2
       ) recent
       ORDER BY created_at ASC, id::text ASC`,
      [threadId, CONSULT_RECENT_MESSAGE_LIMIT],
    );

  const [threadResult, eventsResult] = await Promise.all([
    query('SELECT * FROM inbox_threads WHERE id = $1', [threadId]),
    eventsPromise,
  ]);
  if (threadResult.rows.length === 0) {
    const err = new Error('Website thread not found');
    err.statusCode = 404;
    throw err;
  }

  const events = eventsResult.rows || [];
  let conversation = websiteConversationFromThread(threadResult.rows[0], events, conversationId);
  try {
    const reservationContext = await resolveInboxReservationContext(conversation, { tenantId });
    conversation = applyReservationContextToConversation(conversation, reservationContext);
  } catch (e) {
    console.warn(`[consult] website reservation context overlay failed for ${conversationId}: ${e.message}`);
  }

  return {
    conversation,
    messages: events.map(websiteEventToConsultMessage).filter(Boolean),
  };
}

async function validateConsultDraftContext({ draftId, conversationId, tenantId }) {
  if (!draftId) return null;
  if (!isUuid(draftId)) {
    const err = new Error('Invalid draft id');
    err.statusCode = 400;
    err.code = 'invalid_draft_id';
    throw err;
  }
  const websiteThreadId = websiteThreadIdForConversation(conversationId);
  if (websiteThreadId) {
    return validateWebsiteConsultDraftContext({ draftId, threadId: websiteThreadId });
  }
  const { rows } = await query(
    `SELECT d.id, d.conversation_id, d.message_id, d.state,
            latest.id AS latest_message_id,
            latest.direction AS latest_direction
       FROM drafts d
       JOIN conversations c ON c.id = d.conversation_id
       LEFT JOIN LATERAL (
         SELECT id, direction
           FROM messages
          WHERE conversation_id = d.conversation_id
            AND COALESCE(is_auto_response, false) = false
          ORDER BY created_at DESC, id::text DESC
          LIMIT 1
       ) latest ON true
      WHERE d.id = $1
        AND c.tenant_id = $2
      LIMIT 1`,
    [draftId, tenantId],
  );
  const draft = rows[0];
  if (!draft) {
    const err = new Error('Draft not found');
    err.statusCode = 404;
    err.code = 'draft_not_found';
    throw err;
  }
  if (conversationId && String(draft.conversation_id) !== String(conversationId)) {
    const err = new Error('Draft does not belong to this conversation');
    err.statusCode = 409;
    err.code = 'draft_conversation_mismatch';
    throw err;
  }
  if (!['draft_ready', 'under_review'].includes(draft.state)) {
    const err = new Error(`Draft is no longer reviewable (${draft.state})`);
    err.statusCode = 409;
    err.code = 'invalid_draft_state';
    throw err;
  }
  if (!draft.latest_message_id || draft.latest_direction !== 'inbound' || String(draft.latest_message_id) !== String(draft.message_id)) {
    const err = new Error('The conversation changed after this draft was created. Refresh the thread before refining.');
    err.statusCode = 409;
    err.code = 'draft_stale';
    throw err;
  }
  return draft;
}

async function validateWebsiteConsultDraftContext({ draftId, threadId }) {
  const [draftRes, latestEventRes, latestReplyRes] = await Promise.all([
    query(
      `SELECT id, thread_id, event_type, payload, created_at
         FROM inbox_events
        WHERE id = $1
          AND thread_id = $2
          AND event_type IN ${WEBSITE_DRAFT_EVENT_TYPES_SQL}
        LIMIT 1`,
      [draftId, threadId],
    ),
    query(
      `SELECT id, event_type, source, payload, created_at
         FROM inbox_events
        WHERE thread_id = $1
          AND source <> 'fad'
          AND event_type NOT LIKE 'ai.%'
          AND event_type NOT LIKE 'staff.%'
        ORDER BY created_at DESC, id::text DESC
        LIMIT 1`,
      [threadId],
    ),
    query(
      `SELECT id, created_at
         FROM inbox_events
        WHERE thread_id = $1
          AND event_type = $2
        ORDER BY created_at DESC, id::text DESC
        LIMIT 1`,
      [threadId, WEBSITE_STAFF_REPLY_EVENT_TYPE],
    ),
  ]);
  const draft = draftRes.rows[0] || null;
  if (!draft) {
    const err = new Error('Draft not found');
    err.statusCode = 404;
    err.code = 'draft_not_found';
    throw err;
  }
  const state = draft.payload?.state || '';
  if (!['draft_ready', 'under_review'].includes(state)) {
    const err = new Error(`Draft is no longer reviewable (${state})`);
    err.statusCode = 409;
    err.code = 'invalid_draft_state';
    throw err;
  }

  const latestEvent = latestEventRes.rows[0] || null;
  const sourceEventId = draft.payload?.source_event_id || null;
  if (!latestEvent || String(sourceEventId) !== String(latestEvent.id)) {
    const err = new Error('The website conversation changed after this draft was created. Refresh the thread before refining.');
    err.statusCode = 409;
    err.code = 'draft_stale';
    throw err;
  }

  const latestReply = latestReplyRes.rows[0] || null;
  if (latestReply && new Date(latestReply.created_at) > new Date(latestEvent.created_at)) {
    const err = new Error('The website conversation already has a newer staff reply. Refresh the thread before refining.');
    err.statusCode = 409;
    err.code = 'draft_stale';
    throw err;
  }

  return draft;
}

async function loadTeachingBlockWithIds(tenantId, propertyCode) {
  const { rows } = await query(
    `SELECT id, instruction, scope, property_code, property_codes
       FROM teachings
      WHERE tenant_id = $1 AND status = 'active'
      ORDER BY taught_at ASC`,
    [tenantId],
  );
  const code = propertyCode ? String(propertyCode).trim() : null;
  const relevant = rows.filter((t) => {
    if (t.scope === 'global') return true;
    if (t.scope !== 'property' || !code) return false;
    if (Array.isArray(t.property_codes) && t.property_codes.length > 0) {
      return t.property_codes.includes(code);
    }
    return t.property_code === code;
  });
  const teachingIdMap = {};
  if (relevant.length === 0) return { block: '', teachingIdMap };
  let block = '\n[Active Teachings — durable team rules]\n';
  relevant.forEach((t, i) => {
    const key = `T${i + 1}`;
    teachingIdMap[key] = t.id;
    const scope = t.scope === 'property'
      ? `property:${Array.isArray(t.property_codes) && t.property_codes.length > 0 ? t.property_codes.join(',') : t.property_code}`
      : 'global';
    block += `${key} (${scope}): ${t.instruction}\n`;
  });
  block += '\n';
  return { block, teachingIdMap };
}

async function getOrCreateSession({ req, sessionId, conversationId, context, draftId, propertyCode }) {
  if (sessionId) {
    const { rows } = await query(
      `SELECT * FROM consult_sessions
        WHERE id = $1 AND tenant_id = $2
        LIMIT 1`,
      [sessionId, req.tenantId],
    );
    if (rows[0]) return rows[0];
  }

  const { rows } = await query(
    `INSERT INTO consult_sessions
       (tenant_id, user_name, conversation_id, context, property_code, draft_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      req.tenantId,
      actorName(req),
      conversationId || null,
      context,
      propertyCode || null,
      draftId || null,
    ],
  );
  return rows[0];
}

async function updateSessionAfterTurn({ sessionId, inputTokens, outputTokens, history, missingKnowledge }) {
  const sets = [
    'turn_count = turn_count + 1',
    'total_input_tokens = total_input_tokens + $1',
    'total_output_tokens = total_output_tokens + $2',
    'conversation_history = $3::jsonb',
    'last_activity_at = NOW()',
  ];
  const params = [inputTokens || 0, outputTokens || 0, JSON.stringify(history || [])];
  if (missingKnowledge) {
    sets.push('missing_knowledge = TRUE');
  }
  params.push(sessionId);
  await query(
    `UPDATE consult_sessions
        SET ${sets.join(', ')}
      WHERE id = $${params.length}`,
    params,
  );
}

async function generateConsultSummary(sessionId, tenantId) {
  const { rows } = await query(
    `SELECT conversation_history
       FROM consult_sessions
      WHERE id = $1 AND tenant_id = $2`,
    [sessionId, tenantId],
  );
  const history = rows[0]?.conversation_history || [];
  if (!Array.isArray(history) || history.length === 0) return null;
  const result = await generateDraftReply({
    system: 'Summarize this Ask Friday consultation session for future context. Preserve decisions, draft state, teachings proposed, unresolved questions, and operator preferences. Keep it concise.',
    user: JSON.stringify(history).slice(0, 50000),
    meter: { tenantId, feature: 'inbox_consult_summary' },
  });
  if (!result.ok) throw new Error(result.error || 'summary generation failed');
  const summary = stripProtocolTags(result.text);
  await query(
    `UPDATE consult_sessions
        SET summary = $1,
            summary_generated_at = NOW()
      WHERE id = $2 AND tenant_id = $3`,
    [summary, sessionId, tenantId],
  );
  return summary;
}

router.post('/', attachIdentity, async (req, res) => {
  let activeSessionId = req.body?.sessionId || null;
  try {
    const context = req.body?.context;
    const instruction = cleanInstruction(req.body?.text || req.body?.instruction);
    const conversationId = req.body?.conversationId || null;
    const sessionConversationId = conversationIdForSession(conversationId);
    const draftId = req.body?.draftId || null;
    const draftBody = cleanInstruction(req.body?.draftBody);
    const fullThread = req.body?.fullThread === true;

    if (!instruction || !context) {
      return res.status(400).json({ error: 'Missing required fields: instruction (or text), context' });
    }
    if (!VALID_CONTEXTS.has(context)) {
      return res.status(400).json({ error: `context must be one of: ${Array.from(VALID_CONTEXTS).join(', ')}` });
    }
    if (CONVERSATION_REQUIRED_CONTEXTS.has(context) && !conversationId) {
      return res.status(400).json({ error: 'conversationId is required for this context type' });
    }

    const processTurn = async () => {
      const { conversation, messages } = await loadConversationBundle(conversationId, req.tenantId, { fullThread });
      await validateConsultDraftContext({ draftId, conversationId, tenantId: req.tenantId });
      const existingWork = await loadExistingInboxWork(conversationId, req.tenantId, conversation).catch((e) => {
        console.warn(`[consult] existing work lookup failed for ${conversationId}: ${e.message}`);
        return [];
      });
      const propertyCode = conversation ? resolvePropertyCode(conversation) : null;
      const session = await getOrCreateSession({
        req,
        sessionId: activeSessionId,
        conversationId: sessionConversationId,
        context,
        draftId,
        propertyCode,
      });
      activeSessionId = session.id;

      const sessionHistory = Array.isArray(session.conversation_history)
        ? sanitizeConsultHistory(session.conversation_history)
        : (Array.isArray(req.body?.history) ? req.body.history : []);

      const [{ block: teachingsBlock, teachingIdMap }, actionFeedbackBlock] = await Promise.all([
        loadTeachingBlockWithIds(req.tenantId, propertyCode),
        loadActionFeedbackBlock(req.tenantId),
      ]);
      const liveExchangeRateBlock = await buildLiveExchangeRateBlock({
        instruction,
        draftBody,
        messages,
      });

      const composed = composeSystemPrompt({
        context,
        propertyCode,
        instruction,
        draftBody,
        conversation,
        messages,
        liveExchangeRateBlock,
        activeTeachingBlock: teachingsBlock,
        actionFeedbackBlock,
      });

      const userMessage = buildConsultUserMessage({
        instruction,
        context,
        conversation,
        messages,
        draftBody,
        liveExchangeRateBlock,
        sessionHistory,
        currentSessionSummary: session.running_summary || session.summary || null,
        existingWork,
        fullThread,
      });

      let result = await generateDraftReply({
        system: composed.systemPrompt,
        user: userMessage,
        meter: { tenantId: req.tenantId, feature: 'inbox_consult' },
        timeoutMs: CONSULT_TIMEOUT_MS,
        maxRetries: CONSULT_MAX_RETRIES,
        maxTokens: CONSULT_MAX_TOKENS,
        responseJson: true,
      });
      let fallbackUsed = false;
      let degraded = false;
      let modelTimeout = false;
      if (!result.ok && isTransientConsultFailure(result)) {
        fallbackUsed = true;
        modelTimeout = true;
        const fullContextError = result.error || 'transient consult model failure';
        console.warn(`[consult] full-context call failed (${fullContextError}); retrying compact consult context`);
        await appendConsultSessionError({
          sessionId: activeSessionId,
          context,
          message: fullContextError,
          phase: 'full_context',
        }).catch(() => {});

        const compactUserMessage = buildCompactConsultUserMessage({
          instruction,
          context,
          conversation,
          messages,
          draftBody,
          liveExchangeRateBlock,
          sessionHistory,
          currentSessionSummary: session.running_summary || session.summary || null,
          existingWork,
        });
        result = await generateDraftReply({
          system: compactConsultSystemPrompt({
            context,
            propertyCode,
            compactKnowledgeAppendix: buildCompactKnowledgeAppendix({
              systemMessage: composed.composerSystemMessage,
              surface: composed.metadata.surface,
              propertyCode: composed.metadata.property_code || propertyCode,
              activeTeachingBlock: teachingsBlock,
              actionFeedbackBlock,
              runtimeKnowledgeBlock: composed.runtimeKnowledgeBlock,
            }),
          }),
          user: compactUserMessage,
          meter: { tenantId: req.tenantId, feature: 'inbox_consult_compact' },
          timeoutMs: CONSULT_FALLBACK_TIMEOUT_MS,
          maxRetries: CONSULT_FALLBACK_MAX_RETRIES,
          maxTokens: CONSULT_FALLBACK_MAX_TOKENS,
          model: CONSULT_FALLBACK_MODEL,
          responseJson: true,
        });
      }
      if (!result.ok && isTransientConsultFailure(result)) {
        degraded = true;
        modelTimeout = true;
        const compactError = result.error || 'compact consult model failure';
        console.warn(`[consult] compact fallback failed (${compactError}); returning controlled degraded response`);
        await appendConsultSessionError({
          sessionId: activeSessionId,
          context,
          message: compactError,
          phase: 'compact_context',
        }).catch(() => {});
        result = {
          ok: true,
          text: 'Friday timed out while reading the consultation context. I kept this Consult session open. Please retry the same request, or make the request narrower; no guest message was changed.',
          model: CONSULT_FALLBACK_MODEL,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: result.latencyMs || null,
          degraded: true,
        };
      }
      if (!result.ok) throw new Error(result.error || 'Consult model call failed');

      const consultEnvelope = parseConsultEnvelope(result.text, context, teachingIdMap);
      let responseTextForHistory = result.text;
      let draftUpdates = consultEnvelope?.drafts || [];
      let draftUpdate = draftUpdates[0]?.body || parseDraftUpdate(result.text);
      let statusUpdateSafetyApplied = false;
      if (draftUpdate && draftUpdates.length === 0) {
        draftUpdates = [{ body: draftUpdate, recipientLabel: null, channel: null, targetHint: null }];
      }
      if (!draftUpdate) {
        const recoveredDraft = extractUntaggedDraftUpdate(result.text, context);
        if (recoveredDraft) {
          draftUpdate = recoveredDraft;
          draftUpdates = [{ body: recoveredDraft, recipientLabel: null, channel: null, targetHint: null }];
          responseTextForHistory = replaceDraftUpdate('Done — I prepared the draft.', draftUpdate);
        }
      }
      if (draftUpdates.length > 0) {
        const latestInbound = latestInboundMessage(messages);
        draftUpdates = draftUpdates.map((draft) => {
          const guarded = applyStatusUpdateSafety(draft.body, {
            message: latestInbound,
            conversation,
            messages,
          });
          if (!guarded.applied) return draft;
          statusUpdateSafetyApplied = true;
          return { ...draft, body: guarded.draftBody };
        });
        draftUpdate = draftUpdates[0]?.body || null;
        if (consultEnvelope) {
          responseTextForHistory = JSON.stringify({
            response_text: consultEnvelope.responseText,
            drafts: draftUpdates,
            teaching_actions: consultEnvelope.teachingActions,
            task_suggestions: consultEnvelope.taskSuggestions,
          });
        } else if (draftUpdate) {
          responseTextForHistory = replaceDraftUpdate(responseTextForHistory, draftUpdate);
        }
      } else if (consultEnvelope) {
        responseTextForHistory = JSON.stringify({
          response_text: consultEnvelope.responseText,
          drafts: [],
          teaching_actions: consultEnvelope.teachingActions,
          task_suggestions: consultEnvelope.taskSuggestions,
        });
      }
      const teachingActions = consultEnvelope
        ? consultEnvelope.teachingActions
        : parseTeachingActions(result.text, teachingIdMap);
      const parsedTaskSuggestions = consultEnvelope
        ? consultEnvelope.taskSuggestions
        : parseTaskSuggestions(result.text);
      const taskSuggestions = filterDuplicateTaskSuggestions(parsedTaskSuggestions, existingWork);
      const suppressedTaskSuggestionCount = parsedTaskSuggestions.length - taskSuggestions.length;
      let responseTextForClient = consultEnvelope
        ? consultEnvelope.responseText
        : stripProtocolTags(responseTextForHistory);
      if (!responseTextForClient && draftUpdate) {
        responseTextForClient = 'Done — I updated the draft in the editor.';
      }
      if (!responseTextForClient && teachingActions.length > 0) {
        responseTextForClient = 'I found a teaching candidate for you to confirm.';
      }
      if (!responseTextForClient && taskSuggestions.length > 0) {
        const n = taskSuggestions.length;
        responseTextForClient = n === 1
          ? 'I think this is worth a task — review below.'
          : `I think ${n} tasks are worth creating — review below.`;
      }
      if (!responseTextForClient && suppressedTaskSuggestionCount > 0) {
        responseTextForClient = 'This already appears to be covered by existing open work on the thread.';
      }

      const userHistory = {
        role: 'user',
        content: stripFullThreadEnvelope(instruction),
        sender: actorName(req),
        senderId: actorId(req),
      };
      const assistantHistory = {
        role: 'assistant',
        content: responseTextForHistory,
      };
      const nextHistory = [...sessionHistory, userHistory, assistantHistory].slice(-120);
      await updateSessionAfterTurn({
        sessionId: activeSessionId,
        inputTokens: result.inputTokens || 0,
        outputTokens: result.outputTokens || 0,
        history: nextHistory,
        missingKnowledge: composed.missingKnowledge,
      });

      if (conversationId) {
        publishFadEvent({
          tenantId: req.tenantId,
          type: 'inbox.consult_message',
          payload: {
            conversationId,
            sessionId: activeSessionId,
            context,
            draftId,
            actorName: actorName(req),
            hasDraftUpdate: draftUpdates.length > 0,
            draftUpdateCount: draftUpdates.length,
            teachingActionCount: teachingActions.length,
            taskSuggestionCount: taskSuggestions.length,
          },
        }).catch(() => {});
      }

      let confidence;
      if (degraded) confidence = 0.2;
      else if (fallbackUsed) confidence = 0.62;
      else if (composed.missingKnowledge) confidence = 0.55;
      else if (statusUpdateSafetyApplied) confidence = 0.55;
      else if (draftUpdate) confidence = 0.82;
      else confidence = 0.78;
      if (statusUpdateSafetyApplied) confidence = Math.min(confidence, 0.55);

      recordLearningEvent({
        tenantId: req.tenantId,
        event: {
          sourceSystem: 'fad',
          surfaceId: 'fad_consult',
          identityRef: {
            identityType: 'staff',
            identityKey: actorId(req) || actorName(req),
            authenticated: true,
          },
          sessionId: activeSessionId,
          intent: context,
          userTurnSummary: stripFullThreadEnvelope(instruction).slice(0, 900),
          assistantActionSummary: responseTextForClient.slice(0, 900),
          toolsUsed: [],
          knowledgeUsed: [
            'staff_inbox',
            'property_cards',
            'teachings',
            composed.metadata.surface,
          ].filter(Boolean),
          confidence: confidenceBand(confidence),
          outcome: degraded
            ? 'degraded'
            : (draftUpdate ? 'drafted' : (teachingActions.length ? 'teaching_candidate' : (taskSuggestions.length ? 'task_candidate' : 'answered'))),
          handoff: { triggered: false },
          signals: {
            fallbackUsed,
            degraded,
            modelTimeout,
            missingKnowledge: Boolean(composed.missingKnowledge),
            statusUpdateSafetyApplied,
            teachingActionCount: teachingActions.length,
            taskSuggestionCount: taskSuggestions.length,
            suppressedDuplicateTaskSuggestionCount: suppressedTaskSuggestionCount,
          },
          privacyClass: 'high',
          redactionStatus: 'partially_redacted',
          eventPayload: {
            conversationId,
            draftId,
            context,
            propertyCode: composed.metadata.property_code || null,
            knowledgeSurface: composed.metadata.surface,
          },
        },
      }).catch((e) => {
        console.warn('[consult] learning event write failed:', e.message);
      });

      res.json({
        response: responseTextForClient,
        model: result.model || DRAFT_MODEL,
        confidence,
        ...(draftUpdate ? { draft_update: draftUpdate } : {}),
        ...(draftUpdates.length > 0 ? { draft_updates: draftUpdates } : {}),
        ...(teachingActions.length > 0 ? { teaching_actions: teachingActions, teaching_action: teachingActions[0] } : {}),
        ...(taskSuggestions.length > 0 ? { task_suggestions: taskSuggestions } : {}),
        sessionId: activeSessionId,
        metadata: {
          surface: composed.metadata.surface,
          loadedSkills: composed.metadata.loaded_skills,
          tokenEstimate: composed.metadata.token_estimate,
          propertyCode: composed.metadata.property_code,
          fallbackUsed,
          degraded,
          modelTimeout,
          statusUpdateSafetyApplied,
          suppressedDuplicateTaskSuggestionCount: suppressedTaskSuggestionCount,
          draftUpdateCount: draftUpdates.length,
          structuredEnvelope: !!consultEnvelope,
          fullThread,
          messageCount: messages.length,
        },
        ...(composed.missingKnowledge ? { missingKnowledge: true } : {}),
      });
    };

    if (conversationId) {
      await withConversationLock(conversationId, req.tenantId, processTurn, {
        context,
        actorId: actorId(req),
        actorName: actorName(req),
      });
    } else {
      await processTurn();
    }
  } catch (e) {
    console.error('[consult] error:', e.message);
    if (activeSessionId) {
      await appendConsultSessionError({
        sessionId: activeSessionId,
        context: req.body?.context,
        message: e.message,
        phase: 'route_error',
      }).catch(() => {});
    }
    res.status(e.statusCode || 500).json({
      error: e.code || (e.statusCode ? e.message : 'Consultation failed'),
      details: e.message,
    });
  }
});

router.get('/session/active', attachIdentity, async (req, res) => {
  const conversationId = typeof req.query.conversationId === 'string' ? req.query.conversationId : '';
  const sessionConversationId = conversationIdForSession(conversationId);
  const context = typeof req.query.context === 'string' ? req.query.context : 'compose';
  const draftId = typeof req.query.draftId === 'string' ? req.query.draftId : null;
  if (!conversationId) return res.status(400).json({ error: 'conversationId query parameter required' });
  if (!sessionConversationId) return res.json({ session: null, sessionId: null });

  try {
    const { rows } = await query(
      `SELECT id, conversation_history, last_activity_at, context, draft_id
         FROM consult_sessions
        WHERE tenant_id = $1
          AND conversation_id = $2
          AND context = $3
          AND draft_id IS NOT DISTINCT FROM $4
          AND status IN ('active', 'compacted')
        ORDER BY last_activity_at DESC
        LIMIT 1`,
      [req.tenantId, sessionConversationId, context, draftId],
    );
    const session = rows[0];
    if (!session) return res.json({ session: null, sessionId: null });
    res.json({
      sessionId: session.id,
      session: {
        id: session.id,
        sessionId: session.id,
        history: session.conversation_history || [],
        context: session.context,
        draftId: session.draft_id,
      },
    });
  } catch (e) {
    console.error('[consult] active session error:', e.message);
    res.status(500).json({ error: 'Failed to load active Consult session', details: e.message });
  }
});

router.get('/history/:conversationId', attachIdentity, async (req, res) => {
  const sessionConversationId = conversationIdForSession(req.params.conversationId);
  if (!sessionConversationId) return res.json({ sessions: [] });
  try {
    const { rows } = await query(
      `SELECT id, user_name, conversation_history, summary, status, context,
              draft_id, created_at, ended_at, end_reason
         FROM consult_sessions
        WHERE tenant_id = $1 AND conversation_id = $2
        ORDER BY created_at ASC`,
      [req.tenantId, sessionConversationId],
    );
    res.json({
      sessions: rows.map((s) => ({
        id: s.id,
        userName: s.user_name,
        messages: sanitizeConsultHistory(s.conversation_history || []),
        summary: s.summary,
        status: s.status,
        context: s.context,
        draftId: s.draft_id,
        createdAt: s.created_at,
        endedAt: s.ended_at,
        endReason: s.end_reason,
      })),
    });
  } catch (e) {
    console.error('[consult] history error:', e.message);
    res.status(500).json({ error: 'Failed to load Consult history', details: e.message });
  }
});

router.post('/session/end', attachIdentity, async (req, res) => {
  const sessionId = req.body?.sessionId;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  try {
    await query(
      `UPDATE consult_sessions
          SET status = 'ended',
              ended_at = NOW(),
              conversation_history = COALESCE($3::jsonb, conversation_history),
              end_reason = COALESCE($4, end_reason)
        WHERE id = $1 AND tenant_id = $2 AND status IN ('active', 'compacted')`,
      [
        sessionId,
        req.tenantId,
        req.body?.history ? JSON.stringify(req.body.history) : null,
        req.body?.endReason || 'manual',
      ],
    );
    if (process.env.KIMI_API_KEY) {
      generateConsultSummary(sessionId, req.tenantId).catch((e) => {
        console.warn('[consult] background summary failed:', e.message);
      });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[consult] end session error:', e.message);
    res.status(500).json({ error: 'Failed to end Consult session', details: e.message });
  }
});

router.post('/:sessionId/summarize', attachIdentity, async (req, res) => {
  try {
    if (!process.env.KIMI_API_KEY) {
      return res.status(503).json({ error: 'KIMI_API_KEY not set' });
    }
    const summary = await generateConsultSummary(req.params.sessionId, req.tenantId);
    res.json({ summary });
  } catch (e) {
    console.error('[consult] summarize error:', e.message);
    res.status(500).json({ error: 'Summary generation failed', details: e.message });
  }
});

module.exports = router;

module.exports._test = {
  isUuid,
  conversationIdForSession,
  websiteThreadIdForConversation,
  websiteEventBodyForConsult,
  websiteEventToConsultMessage,
  websiteConversationFromThread,
  stripProtocolTags,
  parseDraftUpdate,
  parseConsultEnvelope,
  normalizeConsultDrafts,
  extractUntaggedDraftUpdate,
  parseTeachingActions,
  parseTaskSuggestions,
  normalizeTaskText,
  taskSimilarity,
  filterDuplicateTaskSuggestions,
  formatExistingWorkForPrompt,
  loadExistingInboxWork,
  selectConsultSurface,
  contextTaskInstruction,
  isTransientConsultFailure,
  buildCompactConsultUserMessage,
  compactConsultSystemPrompt,
  buildConsultUserMessage,
  composeSystemPrompt,
  stripFullThreadEnvelope,
  sanitizeConsultHistory,
  withConversationLock,
  withProcessConversationLock,
  confidenceBand,
  CONSULT_FALLBACK_MODEL,
};
