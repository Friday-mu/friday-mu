'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');
const { invokeChat } = require('../ai/chat_proxy');
const { guestyRequest, listListings } = require('../integrations/guesty');
const { callTool } = require('../mcp');
const { recordActionRequest } = require('../ask_friday/action_writer');
const { recordLearningEvent } = require('../ask_friday/event_writer');

const router = express.Router();

const FR_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const MAX_QUESTION_CHARS = 1200;
const MAX_HISTORY_TURNS = 8;
const ASK_FRIDAY_MODEL = process.env.FAD_ASK_MODEL || 'gemini-3.5-flash';
const ASK_FRIDAY_MAX_TOKENS = Number(process.env.KIMI_FAD_ASK_MAX_TOKENS) || 4096;
const FOCUS_THREAD_MESSAGE_LIMIT = 40;
const FOCUS_OTHER_THREAD_LIMIT = 3;
const TEAM_CONTEXT_MESSAGE_LIMIT = 8;
const TEAM_FOCUS_MESSAGE_LIMIT = 24;
const WEBSITE_CONVERSATION_PREFIX = 'web-';
const WEBSITE_DRAFT_EVENT_TYPES_SQL = "('ai.friday_drafting', 'ai.draft_ready', 'ai.draft_generation_failed')";
const ASK_FRIDAY_GLOBAL_SURFACE_ID = 'fad_global_ask_friday';

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function parseInboxFocusThreadId(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.startsWith(WEBSITE_CONVERSATION_PREFIX)) {
    const threadId = raw.slice(WEBSITE_CONVERSATION_PREFIX.length);
    return isUuid(threadId) ? { kind: 'website', id: threadId, raw } : null;
  }
  return isUuid(raw) ? { kind: 'guesty', id: raw, raw } : null;
}

function cleanStringList(value, maxItems = 12, maxChars = 120) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanString(item, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function sanitizeScalarMap(value, maxEntries = 16, maxChars = 180) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value)
    .slice(0, maxEntries)
    .map(([key, raw]) => {
      const cleanKey = cleanString(key, 80);
      if (!cleanKey) return null;
      if (raw == null) return [cleanKey, raw];
      if (Array.isArray(raw)) return [cleanKey, cleanStringList(raw, 8, maxChars)];
      if (typeof raw === 'number' || typeof raw === 'boolean') return [cleanKey, raw];
      if (typeof raw === 'string') return [cleanKey, cleanString(raw, maxChars)];
      return [cleanKey, cleanString(raw.label || raw.id || raw.value || '', maxChars)];
    })
    .filter(Boolean)
    .filter(([, raw]) => raw !== '' && !(Array.isArray(raw) && raw.length === 0));
  return entries.length ? Object.fromEntries(entries) : null;
}

function sanitizeFocusedObject(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const type = cleanString(raw.type || raw.kind, 80).toLowerCase();
  const id = cleanString(raw.id || raw.objectId || raw.object_id, 140);
  const label = cleanString(raw.label || raw.title || raw.name, 180);
  if (!type && !id && !label) return null;
  return {
    type: type || null,
    id: id || null,
    label: label || null,
  };
}

function sanitizeSelection(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const selectedIds = cleanStringList(raw.selectedIds || raw.selected_ids || raw.ids, 20, 140);
  const cursorRange = cleanString(raw.cursorRange || raw.cursor_range, 120);
  const summary = cleanString(raw.summary, 240);
  if (!selectedIds.length && !cursorRange && !summary) return null;
  return {
    selectedIds,
    cursorRange: cursorRange || null,
    summary: summary || null,
  };
}

function sanitizeVisibleState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const summary = cleanString(raw.summary, 700);
  const activeTab = cleanString(raw.activeTab || raw.active_tab || raw.tab, 80);
  const filters = sanitizeScalarMap(raw.filters, 16, 160);
  const counts = sanitizeScalarMap(raw.counts || raw.visibleCounts || raw.visible_counts, 16, 80);
  if (!summary && !activeTab && !filters && !counts) return null;
  return {
    summary: summary || null,
    activeTab: activeTab || null,
    filters: filters || null,
    counts: counts || null,
  };
}

function cleanStalenessMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(Math.round(n), 600_000);
}

function sanitizeFocus(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const module = normalizeFocusModule(raw.module) || cleanString(raw.module, 40).toLowerCase();
  const threadId = cleanString(raw.threadId || raw.thread_id, 80);
  const focusMessageId = cleanString(raw.focusMessageId || raw.focus_message_id || raw.messageId, 80);
  const teamTarget = cleanString(raw.teamTarget || raw.team, 120);
  const pageUrl = cleanString(raw.pageUrl || raw.page_url, 600);
  const surfaceId = cleanString(raw.surfaceId || raw.surface_id, 100);
  const host = cleanString(raw.host, 80);
  const route = cleanString(raw.route || raw.pageRoute || raw.page_route, 300);
  const view = cleanString(raw.view, 100).toLowerCase();
  const focusedObject = sanitizeFocusedObject(raw.focusedObject || raw.focused_object || raw.object);
  const selection = sanitizeSelection(raw.selection);
  const visibleState = sanitizeVisibleState(raw.visibleState || raw.visible_state);
  const allowedActions = cleanStringList(raw.allowedActions || raw.allowed_actions, 12, 80);
  const privacyClass = cleanString(raw.privacyClass || raw.privacy_class, 60).toLowerCase();
  const stalenessMs = cleanStalenessMs(raw.stalenessMs ?? raw.staleness_ms);
  if (
    !module && !threadId && !focusMessageId && !teamTarget && !pageUrl &&
    !surfaceId && !host && !route && !view && !focusedObject && !selection &&
    !visibleState && !allowedActions.length && !privacyClass && stalenessMs == null
  ) return null;
  return {
    module: module || null,
    threadId: threadId || null,
    focusMessageId: focusMessageId || null,
    teamTarget: teamTarget || null,
    pageUrl: pageUrl || null,
    surfaceId: surfaceId || null,
    host: host || null,
    route: route || null,
    view: view || null,
    focusedObject,
    selection,
    visibleState,
    allowedActions,
    privacyClass: privacyClass || null,
    stalenessMs,
  };
}
// 2026-05-23 — bumped 45s → 8min (provider) / 25s → 90s (auto mode).
// Coordinated with nginx proxy_read_timeout (60s → 600s). Auto mode
// stays snappier since it's the interactive composer; provider mode
// can run longer reasoning chains.
const ASK_FRIDAY_PROVIDER_TIMEOUT_MS = Number(process.env.FAD_ASK_PROVIDER_TIMEOUT_MS) || 480_000;
const ASK_FRIDAY_AUTO_PROVIDER_TIMEOUT_MS = Number(process.env.FAD_ASK_AUTO_PROVIDER_TIMEOUT_MS) || 90_000;
const ACTION_TYPES = new Set(['navigate', 'create_task', 'send_team_message', 'request_approval']);
const ACTION_RISKS = new Set(['navigation', 'safe', 'approval']);
const ACTION_MODULES = ['inbox', 'operations', 'hr', 'reviews', 'design', 'reservations', 'properties'];
const ACTION_REGISTRY = {
  navigate: {
    risk: 'navigation',
    tool: null,
    direct: true,
  },
  create_task: {
    risk: 'safe',
    tool: 'tasks.create',
    direct: true,
  },
  send_team_message: {
    risk: 'safe',
    tool: 'team.message.send',
    direct: true,
  },
  request_approval: {
    risk: 'approval',
    tool: 'action.request.create',
    direct: false,
  },
};
const MODULE_LABELS = {
  inbox: 'Inbox',
  team: 'TeamInbox',
  operations: 'Operations',
  hr: 'HR',
  reviews: 'Reviews',
  design: 'Design',
  reservations: 'Reservations',
  properties: 'Properties',
};
const ASK_FRIDAY_CONTEXT_MODULES = ['inbox', 'team', 'operations', 'hr', 'reviews', 'design', 'reservations', 'properties'];
const ASK_FRIDAY_MODULE_KNOWLEDGE_SCOPES = {
  inbox: 'staff_inbox',
  team: 'staff_inbox',
  team_inbox: 'staff_inbox',
  team_messages: 'staff_inbox',
  operations: 'ops_tasks',
  hr: 'hr_staff',
  reviews: 'reviews',
  design: 'design_projects',
  reservations: 'reservations',
  properties: 'properties',
};
const ASK_FRIDAY_MODULE_SURFACE_IDS = {
  inbox: 'fad_consult',
  team: ASK_FRIDAY_GLOBAL_SURFACE_ID,
  operations: 'fad_ops_assistant',
  reservations: 'fad_reservations_calendar_assistant',
  properties: 'fad_properties_assistant',
};
const ASK_FRIDAY_EXCLUDED_DEMO_MODULES = [
  'finance',
  'calendar',
  'training',
  'analytics',
  'guests',
  'owners',
  'notifications',
];
const SECTION_SOURCE_KIND = {
  inbox: 'fad_db',
  guest_inbox: 'fad_db',
  website_ai_handoffs: 'fad_db',
  focused_inbox_thread: 'fad_db',
  team: 'fad_db',
  team_inbox_recent: 'fad_db',
  team_inbox_recent_channels: 'fad_db',
  team_inbox_recent_dms: 'fad_db',
  focused_team_inbox_thread: 'fad_db',
  operations: 'fad_db',
  hr: 'fad_db',
  reviews: 'guesty_api',
  design: 'fad_db',
  reservations: 'fad_db',
  properties: 'fad_db',
};

function cleanString(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function coreSurfaceIdsForContext(modules = [], focus = null) {
  const ids = new Set([ASK_FRIDAY_GLOBAL_SURFACE_ID]);
  for (const moduleName of modules || []) {
    const surfaceId = ASK_FRIDAY_MODULE_SURFACE_IDS[cleanString(moduleName, 80).toLowerCase()];
    if (surfaceId) ids.add(surfaceId);
  }
  const focusSurfaceId = cleanString(focus?.surfaceId || focus?.surface_id, 120);
  if (focusSurfaceId) ids.add(focusSurfaceId);
  return [...ids].slice(0, 12);
}

function cleanAnswer(value, max = 5000) {
  return String(value || '').trim().slice(0, max);
}

function compactBehaviorRules(rules) {
  if (!Array.isArray(rules)) return [];
  return rules.slice(0, 12).map((rule) => ({
    id: cleanString(rule?.id, 100) || null,
    priority: cleanString(rule?.priority, 40) || null,
    rule: cleanString(rule?.rule || rule?.text || rule?.description, 700),
  })).filter((rule) => rule.rule);
}

function compactStringArray(value, maxItems = 12, maxChars = 300) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanString(item, maxChars)).filter(Boolean).slice(0, maxItems);
}

function compactPackPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  return {
    contextPackClass: cleanString(payload.contextPackClass || payload.context_pack_class, 140) || null,
    statusNote: cleanString(payload.statusNote || payload.status_note, 300) || null,
    includedContext: compactStringArray(payload.includedContext || payload.included_context, 12, 300),
    excludedContext: compactStringArray(payload.excludedContext || payload.excluded_context, 12, 300),
    primaryJobs: compactStringArray(payload.primaryJobs || payload.primary_jobs, 12, 300),
    freshnessRules: compactStringArray(payload.freshnessRules || payload.freshness_rules, 12, 300),
    reviewBlockersBeforePublish: compactStringArray(
      payload.reviewBlockersBeforePublish || payload.review_blockers_before_publish,
      12,
      300,
    ),
  };
}

function shapeCoreContextPack(row, prefix) {
  const packId = row?.[`${prefix}_pack_id`];
  if (!packId) return null;
  return {
    packId,
    version: row[`${prefix}_version`],
    status: row[`${prefix}_status`],
    behaviorRules: compactBehaviorRules(row[`${prefix}_behavior_rules`]),
    toolPolicy: row[`${prefix}_tool_policy`] || {},
    memoryPolicy: row[`${prefix}_memory_policy`] || {},
    packPayload: compactPackPayload(row[`${prefix}_pack_payload`]),
    approvedBy: row[`${prefix}_approved_by`] || null,
    approvedAt: row[`${prefix}_approved_at`] || null,
    publishedAt: row[`${prefix}_published_at`] || null,
    updatedAt: row[`${prefix}_updated_at`] || null,
  };
}

function shapeCoreSurfaceState(row) {
  const latestPublished = shapeCoreContextPack(row, 'published');
  const latestDraft = shapeCoreContextPack(row, 'draft');
  return {
    surfaceId: row.surface_id,
    displayName: row.display_name,
    sourceSystem: row.source_system,
    accessClass: row.access_class,
    status: row.status,
    allowedKnowledgeScopes: row.allowed_knowledge_scopes || [],
    allowedTools: row.allowed_tools || [],
    allowedActions: row.allowed_actions || [],
    memoryPolicy: row.memory_policy || {},
    handoffPolicy: row.handoff_policy || {},
    modelPolicy: row.model_policy || {},
    contextBudget: row.context_budget || {},
    evalSuiteIds: row.eval_suite_ids || [],
    contextPackStatus: latestPublished ? 'published' : latestDraft ? 'draft' : 'missing',
    latestPublished,
    latestDraft,
  };
}

function cleanPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 40)
      .map(([key, raw]) => {
        if (raw == null) return [cleanString(key, 80), raw];
        if (Array.isArray(raw)) {
          return [cleanString(key, 80), raw.slice(0, 20).map((item) =>
            typeof item === 'string' ? cleanString(item, 1000) : item,
          )];
        }
        if (typeof raw === 'object') return [cleanString(key, 80), raw];
        if (typeof raw === 'string') return [cleanString(key, 80), cleanString(raw, 4000)];
        return [cleanString(key, 80), raw];
      })
      .filter(([key]) => key),
  );
}

function stripBlankPayloadValues(payload) {
  return Object.fromEntries(
    Object.entries(payload || {}).filter(([, value]) =>
      value !== undefined && value !== null && value !== '',
    ),
  );
}

function copyAlias(payload, from, to) {
  if (payload[to] == null && payload[from] != null) payload[to] = payload[from];
  delete payload[from];
}

function normalizePriority(value) {
  const raw = cleanString(value, 40).toLowerCase().replace(/\s+priority$/, '');
  if (['lowest', 'low', 'medium', 'high', 'urgent'].includes(raw)) return raw;
  return value;
}

function normalizeTaskStatus(value) {
  const raw = cleanString(value, 40).toLowerCase().replace(/\s+/g, '_');
  if (['todo', 'in_progress', 'paused', 'reported', 'awaiting_approval', 'completed', 'cancelled'].includes(raw)) {
    return raw;
  }
  return value;
}

function inferApprovalActionType({ label, summary, module, payload }) {
  const text = `${label || ''} ${summary || ''} ${module || ''} ${JSON.stringify(payload || {})}`.toLowerCase();
  if (/\b(pric|rate|discount|fee|amount|revenue|refund|payment)\b/.test(text)) return 'pricing_change';
  if (/\b(availability|available|calendar|block|unblock)\b/.test(text)) return 'availability_change';
  if (/\b(reply|respond|message|email|whatsapp|guest-facing|guest facing)\b/.test(text)) return 'guest_reply_direct_send';
  if (/\b(team|internal|channel|mention)\b/.test(text)) return 'team_message_send';
  return 'reservation_change';
}

function normalizeActionPayload(type, payload, raw, label, summary, module) {
  const next = { ...(payload || {}) };
  if (type === 'create_task') {
    copyAlias(next, 'taskTitle', 'title');
    copyAlias(next, 'task_title', 'title');
    copyAlias(next, 'propertyCode', 'property_code');
    copyAlias(next, 'property', 'property_code');
    copyAlias(next, 'dueDate', 'due_date');
    copyAlias(next, 'reservationGuestyId', 'reservation_guesty_id');
    copyAlias(next, 'reservationId', 'reservation_guesty_id');
    copyAlias(next, 'assigneeUserIds', 'assignee_user_ids');
    if (!cleanString(next.title, 300)) next.title = cleanString(raw.title || raw.taskTitle || raw.task_title || label, 300);
    if (!cleanString(next.description, 4000)) next.description = cleanString(raw.description || raw.body || raw.summary, 4000);
    if (next.priority) next.priority = normalizePriority(next.priority);
    if (next.status) next.status = normalizeTaskStatus(next.status);
    return stripBlankPayloadValues(next);
  }

  if (type === 'send_team_message') {
    copyAlias(next, 'channel_id', 'channelId');
    copyAlias(next, 'channel_key', 'channelKey');
    if (!cleanString(next.text, 8000)) {
      next.text = cleanString(next.message || next.body || raw.text || raw.message || raw.body || raw.summary, 8000);
    }
    delete next.message;
    delete next.body;
    return stripBlankPayloadValues(next);
  }

  if (type === 'request_approval') {
    copyAlias(next, 'action_type', 'actionType');
    copyAlias(next, 'risk_level', 'riskLevel');
    if (!cleanString(next.actionType, 100)) {
      next.actionType = cleanString(raw.actionType || raw.action_type, 100) ||
        inferApprovalActionType({ label, summary, module, payload: next });
    }
    if (!cleanString(next.reason, 1000)) next.reason = cleanString(raw.reason || summary || label, 1000);
    if (!next.payload || typeof next.payload !== 'object' || Array.isArray(next.payload)) {
      next.payload = { requestedAction: label, module, details: summary || label };
    }
    return stripBlankPayloadValues(next);
  }

  return stripBlankPayloadValues(next);
}

function cleanAction(raw, index = 0) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const type = cleanString(raw.type, 40);
  if (!ACTION_TYPES.has(type)) return null;
  const risk = ACTION_RISKS.has(raw.risk) ? raw.risk : (
    type === 'navigate' ? 'navigation' : type === 'request_approval' ? 'approval' : 'safe'
  );
  const label = cleanString(raw.label || raw.cta || raw.title || raw.payload?.label || raw.payload?.title, 80);
  const module = cleanString(raw.module, 80);
  const summary = cleanString(raw.summary || raw.body || raw.description, 240);
  const payload = normalizeActionPayload(type, cleanPayload(raw.payload), raw, label, summary, module);
  if (type === 'navigate' && !module) return null;
  if (type === 'create_task' && !cleanString(payload.title, 300)) return null;
  if (type === 'send_team_message' && (!cleanString(payload.text, 8000) || (!payload.channelId && !payload.channelKey))) return null;
  if (type === 'request_approval' && !cleanString(payload.actionType, 100)) return null;
  if ((type === 'create_task' || type === 'send_team_message' || type === 'request_approval') && !label) return null;
  return {
    id: cleanString(raw.id, 80) || `action_${index + 1}`,
    type,
    risk,
    label: label || 'Open',
    summary,
    module: module || null,
    payload,
  };
}

function actionPolicyError(action) {
  const policy = ACTION_REGISTRY[action?.type];
  if (!policy) return 'unsupported action type';
  if (action.type === 'navigate') return null;
  if (action.risk !== policy.risk) {
    return `risk mismatch: ${action.type} must be ${policy.risk}`;
  }
  if (action.risk === 'approval' && action.type !== 'request_approval') {
    return 'approval-risk actions must be routed through request_approval';
  }
  return null;
}

function sanitizeActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions.map(cleanAction).filter(Boolean).slice(0, 4);
}

function hasSimilarAction(actions, candidate) {
  return actions.some((action) => {
    if (action.type !== candidate.type) return false;
    if (action.type === 'navigate') return action.module === candidate.module;
    if (action.type === 'create_task') {
      // The model may phrase the same requested task differently from the
      // deterministic fallback. One create-task button is enough.
      return true;
    }
    return action.label.toLowerCase() === candidate.label.toLowerCase();
  });
}

function mergeCreateTaskAction(existing, deterministic, index) {
  if (!existing || !deterministic) return existing || deterministic;
  const existingTags = Array.isArray(existing.payload?.tags) ? existing.payload.tags : [];
  const deterministicTags = Array.isArray(deterministic.payload?.tags) ? deterministic.payload.tags : [];
  const mergedTags = Array.from(new Set([...existingTags, ...deterministicTags].filter(Boolean)));
  return cleanAction({
    ...existing,
    payload: {
      ...(existing.payload || {}),
      ...(deterministic.payload || {}),
      ...(mergedTags.length ? { tags: mergedTags } : {}),
    },
  }, index);
}

function firstRelevantModule(context) {
  const modules = Array.isArray(context?.requestedModules) ? context.requestedModules : [];
  return modules.find((module) => ACTION_MODULES.includes(module)) || null;
}

function navigateAction(module, reason = '') {
  if (!ACTION_MODULES.includes(module)) return null;
  const label = MODULE_LABELS[module] || module;
  return cleanAction({
    id: `open_${module}`,
    type: 'navigate',
    risk: 'navigation',
    label: `Open ${label}`,
    summary: reason || `Open the ${label} module with the current FAD context.`,
    module,
    payload: {},
  });
}

function todayInMauritius() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Indian/Mauritius',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const pick = (type) => parts.find((part) => part.type === type)?.value;
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

function addDays(dateIso, days) {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function inferTaskDueDate(question) {
  const q = question.toLowerCase();
  if (/\btomorrow\b/.test(q)) return addDays(todayInMauritius(), 1);
  if (/\btoday\b/.test(q)) return todayInMauritius();
  const explicit = q.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return explicit ? explicit[1] : undefined;
}

function inferPriority(question) {
  const q = question.toLowerCase();
  if (/\burgent|emergency|asap|critical\b/.test(q)) return 'urgent';
  if (/\bhigh priority|important|priority\b/.test(q)) return 'high';
  if (/\blow priority|when possible\b/.test(q)) return 'low';
  return 'medium';
}

function inferDepartment(question) {
  const q = question.toLowerCase();
  if (/\bac|air.?con|leak|water|drain|paint|door|lock|shower|wifi|electric|maintenance|repair\b/.test(q)) {
    return 'maintenance';
  }
  if (/\bclean|linen|housekeep|laundry\b/.test(q)) return 'housekeeping';
  if (/\bguest|arrival|check.?in|checkout\b/.test(q)) return 'operations';
  return 'operations';
}

function extractPropertyCode(question) {
  const match = String(question || '').match(/\b([A-Z]{1,4}-[A-Z0-9]{1,4})\b/);
  return match ? match[1].toUpperCase() : undefined;
}

function isAllFadScope(scope = '') {
  return cleanString(scope, 120).toLowerCase().includes('all of fad');
}

function questionHintsModule(question = '', module) {
  const hasPropertyCode = Boolean(extractPropertyCode(question));
  if (module === 'inbox') return /\b(inbox|guest conversation|conversation|message|reply|draft|website|ask friday|handoff|takeover)\b/i.test(question);
  if (module === 'team') return /\b(team\s*inbox|team chat|team message|team messages|internal message|internal messages|internal discussion|internal discussions|staff discussion|staff discussions|channel|dm|direct message|mention|mentions|what did (we|they) discuss|what are (we|they) discussing)\b/i.test(question);
  if (module === 'operations') return /\b(task|todo|work order|ops|operation|issue|maintenance|repair|schedule|roster|runner|inspection|housekeeping)\b/i.test(question);
  if (module === 'hr') return /\b(hr|staff|team|leave|time off|roster|availability|who is on)\b/i.test(question);
  if (module === 'reviews') return /\b(reviews?|ratings?|guest feedback|airbnb|booking\.?com|booking com)\b/i.test(question);
  if (module === 'design') return /\b(design|interior|project|vendor|moodboard|renovation|blocker)\b/i.test(question);
  if (module === 'reservations') return /\b(reservation|booking|arrival|arriving|check.?in|checkout|stay|returning guest|who'?s checking in)\b/i.test(question);
  if (module === 'properties') return hasPropertyCode || /\b(property|properties|villa|listing|availability|calendar|amenit|bedroom|bathroom)\b/i.test(question);
  return false;
}

function normalizeFocusModule(value) {
  const raw = cleanString(value, 120).toLowerCase();
  if (!raw) return null;
  const normalized = raw.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const aliases = {
    ops: 'operations',
    operation: 'operations',
    operations: 'operations',
    tasks: 'operations',
    schedule: 'operations',
    roster: 'operations',
    fad_ops_assistant: 'operations',
    fad_operations: 'operations',
    inbox: 'inbox',
    guest_inbox: 'inbox',
    guest_messages: 'inbox',
    website_handoff: 'inbox',
    fad_inbox_assistant: 'inbox',
    team: 'team',
    team_inbox: 'team',
    teaminbox: 'team',
    team_messages: 'team',
    staff_chat: 'team',
    hr: 'hr',
    people: 'hr',
    staff: 'hr',
    reviews: 'reviews',
    review: 'reviews',
    design: 'design',
    reservations: 'reservations',
    reservation: 'reservations',
    bookings: 'reservations',
    booking: 'reservations',
    properties: 'properties',
    property: 'properties',
    listings: 'properties',
    listing: 'properties',
  };
  if (ASK_FRIDAY_CONTEXT_MODULES.includes(normalized)) return normalized;
  if (aliases[normalized]) return aliases[normalized];
  if (/\b(ops|operations|schedule|roster|task|tasks)\b/.test(normalized)) return 'operations';
  if (/\b(team_inbox|teaminbox|team_messages|staff_chat)\b/.test(normalized)) return 'team';
  if (/\b(inbox|guest_messages|guest_inbox|handoff)\b/.test(normalized)) return 'inbox';
  if (/\b(reservation|reservations|booking|bookings)\b/.test(normalized)) return 'reservations';
  if (/\b(property|properties|listing|listings)\b/.test(normalized)) return 'properties';
  if (/\b(review|reviews)\b/.test(normalized)) return 'reviews';
  if (/\b(design)\b/.test(normalized)) return 'design';
  if (/\b(hr|people|staff)\b/.test(normalized)) return 'hr';
  return null;
}

function routeModuleHint(value) {
  const raw = cleanString(value, 600).toLowerCase();
  if (!raw) return null;
  const queryMatch = raw.match(/[?&](?:m|module|scope)=([a-z0-9_-]+)/i);
  if (queryMatch) {
    const module = normalizeFocusModule(queryMatch[1]);
    if (module) return module;
  }
  const pathMatch = raw.match(/\/fad\/?([a-z0-9_-]+)?/i);
  if (pathMatch?.[1]) {
    const module = normalizeFocusModule(pathMatch[1]);
    if (module) return module;
  }
  return normalizeFocusModule(raw);
}

function focusedObjectModuleHint(focusedObject) {
  const type = cleanString(focusedObject?.type, 80).toLowerCase();
  if (!type) return null;
  if (/\b(task|issue|work_order|workorder|schedule|roster)\b/.test(type)) return 'operations';
  if (/\b(conversation|thread|guest_message|message|handoff|draft)\b/.test(type)) return 'inbox';
  if (/\b(team|channel|dm|direct_message)\b/.test(type)) return 'team';
  if (/\b(reservation|booking|stay)\b/.test(type)) return 'reservations';
  if (/\b(property|listing|villa)\b/.test(type)) return 'properties';
  if (/\b(review|rating)\b/.test(type)) return 'reviews';
  if (/\b(project|design)\b/.test(type)) return 'design';
  if (/\b(staff|user|employee|leave)\b/.test(type)) return 'hr';
  return null;
}

function contextModulesFromFocus(focus = null) {
  if (!focus) return [];
  const candidates = [
    normalizeFocusModule(focus.module),
    normalizeFocusModule(focus.surfaceId),
    normalizeFocusModule(focus.view),
    routeModuleHint(focus.route),
    routeModuleHint(focus.pageUrl),
    focusedObjectModuleHint(focus.focusedObject),
  ].filter(Boolean);
  if (focus.threadId && parseInboxFocusThreadId(focus.threadId)) candidates.push('inbox');
  if (focus.teamTarget) candidates.push('team');
  return [...new Set(candidates.filter((module) => ASK_FRIDAY_CONTEXT_MODULES.includes(module)))];
}

function isBroadAllFadQuestion({ question = '', scope = '' }) {
  if (!isAllFadScope(scope)) return false;
  const q = String(question || '').toLowerCase();
  if (!q.trim()) return false;
  const hasSpecificModuleHint = ACTION_MODULES.some((module) => questionHintsModule(question, module));
  if (hasSpecificModuleHint) return false;
  return /\b(what needs|needs my attention|what should i know|daily brief|overview|status|priorit|risk|blocker|today|this week|across fad|all of fad|everything)\b/i.test(q);
}

function extractTaskTitle(question) {
  const stripped = cleanString(question, 240)
    .replace(/\b(create|add|make|open)\b\s+(an?\s+)?(operations?\s+)?(task|todo|issue|work order)\s*(to|for)?\s*/i, '')
    .replace(/\b(make it|set it as|mark it)\b.*$/i, '')
    .replace(/\b(tomorrow morning|tomorrow afternoon|tomorrow evening|this morning|this afternoon|this evening|today|tomorrow|morning|afternoon|evening)\b/ig, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.?!]+$/, '');
  if (!stripped) return 'Follow up from Ask Friday';
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

function deterministicActions({ question, context, modelActions }) {
  const actions = sanitizeActions(modelActions);
  const q = cleanString(question, MAX_QUESTION_CHARS);
  const qLower = q.toLowerCase();
  const additions = [];

  if (/\b(create|add|make|open)\b.*\b(task|todo|issue|work order)\b/.test(qLower)) {
    additions.push(cleanAction({
      id: 'create_ops_task',
      type: 'create_task',
      risk: 'safe',
      label: 'Create Ops Task',
      summary: 'Create an internal Operations task from this Ask Friday request.',
      module: 'operations',
      payload: {
        title: extractTaskTitle(q),
        description: `Created from Ask Friday request: ${q}`,
        priority: inferPriority(q),
        status: 'todo',
        department: inferDepartment(q),
        property_code: extractPropertyCode(q),
        due_date: inferTaskDueDate(q),
        tags: ['ask-friday'],
      },
    }));
  }

  if (
    actions.length === 0 ||
    /\b(open|show|go to|take me to|view)\b/.test(qLower) ||
    /\bwebsite ai|handoff|awaiting takeover|needs? reply|drafts?\b/.test(qLower)
  ) {
    const module = /\bwebsite ai|handoff|drafts?|guest conversations?|needs? reply\b/.test(qLower)
      ? 'inbox'
      : firstRelevantModule(context);
    const nav = navigateAction(module, module === 'inbox'
      ? 'Open Inbox where guest communication, website handoffs, and draft approval live.'
      : '');
    if (nav) additions.push(nav);
  }

  for (const candidate of additions.filter(Boolean)) {
    if (candidate.type === 'create_task') {
      const existingIndex = actions.findIndex((action) => action.type === 'create_task');
      if (existingIndex >= 0) {
        actions[existingIndex] = mergeCreateTaskAction(actions[existingIndex], candidate, existingIndex);
      } else {
        actions.push(candidate);
      }
    } else if (!hasSimilarAction(actions, candidate)) {
      actions.push(candidate);
    }
    if (actions.length >= 4) break;
  }
  return actions.slice(0, 4);
}

function wantsModule({ question = '', scope = '', module }) {
  const q = `${question} ${scope}`.toLowerCase();
  if (scope.toLowerCase().includes('all of fad')) return true;
  if (module === 'reservations' && /\b(reservation|booking|arrival|check.?in|guest|stay)\b/.test(q)) return true;
  if (module === 'properties' && /\b(property|villa|listing|availability|calendar)\b/.test(q)) return true;
  return q.includes(module);
}

function shouldLoad({ question, scope }, module) {
  if (!question && !scope) return false;
  const normalizedScope = cleanString(scope, 120).toLowerCase();
  if (!isAllFadScope(scope) && normalizedScope.includes(module)) return true;
  if (isBroadAllFadQuestion({ question, scope })) return true;
  if (questionHintsModule(question, module)) return true;
  if (!isAllFadScope(scope) && (module === 'reservations' || module === 'properties')) return wantsModule({ question, scope, module });
  return false;
}

function sectionSource(name) {
  return {
    kind: SECTION_SOURCE_KIND[name] || 'live_api',
    demo: false,
    freshness: 'live',
    checkedAt: new Date().toISOString(),
  };
}

function contextDataTruth() {
  return {
    mode: 'live-only',
    fixtureDataExcluded: true,
    excludedModules: ASK_FRIDAY_EXCLUDED_DEMO_MODULES,
    policy: 'Ask Friday context loaders must use live database/API sources only. Fixture/demo module data is excluded from production prompts.',
  };
}

async function loadAskFridayCoreSurfaceState(tenantId, modules, focus = null) {
  const surfaceIds = coreSurfaceIdsForContext(modules, focus);
  try {
    const { rows } = await query(
      `SELECT
         s.surface_id,
         s.display_name,
         s.source_system,
         s.access_class,
         s.status,
         s.allowed_knowledge_scopes,
         s.allowed_tools,
         s.allowed_actions,
         s.memory_policy,
         s.handoff_policy,
         s.model_policy,
         s.context_budget,
         s.eval_suite_ids,
         draft.pack_id AS draft_pack_id,
         draft.version AS draft_version,
         draft.status AS draft_status,
         draft.behavior_rules AS draft_behavior_rules,
         draft.tool_policy AS draft_tool_policy,
         draft.memory_policy AS draft_memory_policy,
         draft.pack_payload AS draft_pack_payload,
         draft.approved_by AS draft_approved_by,
         draft.approved_at AS draft_approved_at,
         draft.published_at AS draft_published_at,
         draft.updated_at AS draft_updated_at,
         published.pack_id AS published_pack_id,
         published.version AS published_version,
         published.status AS published_status,
         published.behavior_rules AS published_behavior_rules,
         published.tool_policy AS published_tool_policy,
         published.memory_policy AS published_memory_policy,
         published.pack_payload AS published_pack_payload,
         published.approved_by AS published_approved_by,
         published.approved_at AS published_approved_at,
         published.published_at AS published_published_at,
         published.updated_at AS published_updated_at
       FROM ask_friday_surfaces s
       LEFT JOIN LATERAL (
         SELECT pack_id, version, status, behavior_rules, tool_policy, memory_policy,
                pack_payload, approved_by, approved_at, published_at, updated_at
           FROM ask_friday_context_packs
          WHERE tenant_id = s.tenant_id
            AND surface_id = s.surface_id
            AND status = 'draft'
          ORDER BY version DESC, updated_at DESC
          LIMIT 1
       ) draft ON TRUE
       LEFT JOIN LATERAL (
         SELECT pack_id, version, status, behavior_rules, tool_policy, memory_policy,
                pack_payload, approved_by, approved_at, published_at, updated_at
           FROM ask_friday_context_packs
          WHERE tenant_id = s.tenant_id
            AND surface_id = s.surface_id
            AND status = 'published'
          ORDER BY version DESC, updated_at DESC
          LIMIT 1
       ) published ON TRUE
      WHERE s.tenant_id = $1
        AND s.surface_id = ANY($2::text[])
      ORDER BY ARRAY_POSITION($2::text[], s.surface_id)`,
      [tenantId, surfaceIds],
    );
    return {
      ok: true,
      source: 'ask_friday_core',
      surfaceIds,
      surfaces: rows.map(shapeCoreSurfaceState),
      policy: 'Use published context packs as canonical runtime guidance. Draft packs are staff-private planning guidance only and must not be treated as public or canonical truth.',
    };
  } catch (error) {
    return {
      ok: false,
      source: 'ask_friday_core',
      surfaceIds,
      surfaces: [],
      error: cleanString(error.message, 300),
      policy: 'Ask Friday Core surface state was unavailable; answer from live FAD context only and say Core governance context could not be loaded if relevant.',
    };
  }
}

async function safeSection(name, loader) {
  const source = sectionSource(name);
  try {
    return { name, ok: true, source, data: await loader() };
  } catch (e) {
    return { name, ok: false, source, error: cleanString(e.message, 240) };
  }
}

function extractList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.reviews)) return payload.reviews;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function buildListingIndex(listings) {
  const byId = new Map();
  for (const listing of Array.isArray(listings) ? listings : []) {
    for (const key of [listing?._id, listing?.id, listing?.listingId]) {
      if (key) byId.set(String(key), listing);
    }
  }
  return byId;
}

function reviewListing(row, listingIndex) {
  const ids = [row.listingId, row.listing_id, row.externalListingId, row.listing?._id, row.listing?.id].filter(Boolean);
  for (const id of ids) {
    const listing = listingIndex?.get(String(id));
    if (listing) return listing;
  }
  return null;
}

function reviewChannel(row) {
  const channel = String(row.channelId || row.channel || row.source || row.integration || '').toLowerCase();
  if (channel.includes('booking')) return 'booking.com';
  if (channel.includes('airbnb')) return 'airbnb';
  if (channel.includes('vrbo')) return 'vrbo';
  return row.channelId || row.channel || row.source || row.integration || null;
}

function reviewGuest(row, rawReview) {
  const reviewer = rawReview?.reviewer || {};
  const direct = row.guestName || row.guest_name || row.reviewerName || row.reviewer_name ||
    row.guest?.fullName || reviewer.name;
  if (direct) return direct;
  const guestId = row.guestId || row.guest_id || rawReview?.reviewer_id;
  return guestId ? `Guest ${String(guestId).slice(-6)}` : null;
}

function reviewRating(row, rawReview) {
  const scoring = rawReview?.scoring || {};
  const value = Number(
    scoring.review_score ??
    rawReview?.overall_rating ??
    rawReview?.rating ??
    row.rating ??
    row.overallRating ??
    row.reviewRating ??
    row.publicReview?.rating,
  );
  if (!Number.isFinite(value) || value <= 0) return null;
  const normalized = value > 5 && value <= 10 ? value / 2 : value;
  return Math.round(normalized * 10) / 10;
}

function reviewBody(row, rawReview) {
  const content = rawReview?.content || {};
  const bookingText = [
    content.headline,
    content.positive ? `Positive: ${content.positive}` : null,
    content.negative ? `Negative: ${content.negative}` : null,
  ].filter(Boolean).join(' ');
  const parts = [
    bookingText,
    rawReview?.public_review,
    rawReview?.review,
    row.publicReview,
    row.review,
    row.text,
    row.comment,
    row.content,
    row.body,
  ].filter(Boolean);
  const first = parts.find((part) => typeof part === 'string' && part.trim());
  return typeof first === 'string' ? first : first?.text || first?.body || '';
}

function reviewCreatedAt(row, rawReview) {
  return rawReview?.submitted_at ||
    rawReview?.created_timestamp ||
    rawReview?.first_completed_at ||
    row.createdAt ||
    row.created_at ||
    row.submittedAt ||
    null;
}

function reviewReplyStatus(row, rawReview) {
  const replies = Array.isArray(row.reviewReplies) ? row.reviewReplies : [];
  return replies.length > 0 || !!rawReview?.reply ? 'replied' : 'unreplied';
}

function shapeReview(row, listingIndex = null) {
  const rawReview = row.rawReview || {};
  const listing = reviewListing(row, listingIndex);
  const listingName = row.propertyNickname || row.listingNickname || listing?.nickname ||
    row.listing?.nickname || row.externalListingId || row.listingId || row.listing_id || null;
  return {
    id: row.id || row._id || row.reviewId || null,
    guest: reviewGuest(row, rawReview),
    rating: reviewRating(row, rawReview),
    listing: listingName,
    propertyTitle: row.propertyTitle || listing?.title || null,
    channel: reviewChannel(row),
    createdAt: reviewCreatedAt(row, rawReview),
    replyStatus: reviewReplyStatus(row, rawReview),
    excerpt: cleanString(reviewBody(row, rawReview), 280),
  };
}

// Load a single guest conversation (Guesty-side `conversations` table)
// with its recent messages. Used when the operator opens Ask Friday
// while viewing a specific thread — the model gets the actual thread
// instead of a recent-8 slice that may not even include it.
async function loadFocusedGuestyThread(tenantId, conversationId) {
  const [convRes, msgRes, draftRes] = await Promise.all([
    query(
      `SELECT id, guest_name, property_name, status, communication_channel,
              last_message_at, updated_at, guesty_id
         FROM conversations
        WHERE tenant_id = $1 AND id = $2`,
      [tenantId, conversationId],
    ),
    query(
      `SELECT * FROM (
         SELECT id, direction, body, created_at, sender_name, communication_channel
           FROM messages
          WHERE conversation_id = $1
          ORDER BY created_at DESC, id::text DESC
          LIMIT $2
       ) recent
       ORDER BY created_at ASC, id::text ASC`,
      [conversationId, FOCUS_THREAD_MESSAGE_LIMIT],
    ),
    query(
      `SELECT id, state, body, created_at, confidence
         FROM drafts
        WHERE conversation_id = $1
        ORDER BY created_at DESC
        LIMIT 3`,
      [conversationId],
    ),
  ]);
  const conv = convRes.rows[0] || null;
  if (!conv) return null;
  return {
    kind: 'guesty_conversation',
    id: conv.id,
    guest: conv.guest_name,
    property: conv.property_name,
    status: conv.status,
    channel: conv.communication_channel,
    lastMessageAt: conv.last_message_at || conv.updated_at,
    messages: msgRes.rows.map((m) => ({
      id: m.id,
      direction: m.direction,
      sender: m.sender_name,
      channel: m.communication_channel,
      at: m.created_at,
      excerpt: cleanString(m.body, 600),
    })),
    drafts: draftRes.rows.map((d) => ({
      id: d.id,
      state: d.state,
      confidence: d.confidence,
      createdAt: d.created_at,
      excerpt: cleanString(d.body, 400),
    })),
  };
}

// Load a single website AI handoff thread (FR-only — `inbox_threads`
// table) with its recent events. Mirrors loadFocusedGuestyThread but
// for the website path.
async function loadFocusedWebsiteThread(tenantId, threadId) {
  if (tenantId !== FR_TENANT_ID) return null;
  const [threadRes, eventRes] = await Promise.all([
    query(
      `SELECT t.id, t.guest_email, t.guest_name,
              (to_jsonb(t)->>'guest_phone') AS guest_phone,
              t.status, t.last_event_type, t.last_event_at,
              t.guesty_reservation_id, t.guesty_listing_id,
              t.guesty_reservation_status, t.paid_at
         FROM inbox_threads t
        WHERE t.id = $1`,
      [threadId],
    ),
    query(
      `SELECT * FROM (
         SELECT id, event_type, source, payload, created_at
           FROM inbox_events
          WHERE thread_id = $1
            AND event_type NOT IN ${WEBSITE_DRAFT_EVENT_TYPES_SQL}
          ORDER BY created_at DESC, id::text DESC
          LIMIT $2
       ) recent
       ORDER BY created_at ASC, id::text ASC`,
      [threadId, FOCUS_THREAD_MESSAGE_LIMIT],
    ),
  ]);
  const thread = threadRes.rows[0] || null;
  if (!thread) return null;
  // Find the most recent ai_handoff event so the operator's "explain this
  // handoff" question lands on the actual handoff payload — that was
  // Franny's reported failure mode.
  const latestHandoff = [...eventRes.rows]
    .reverse()
    .find((e) => e.event_type === 'website.ai_handoff');
  return {
    kind: 'website_ai_handoff_thread',
    id: thread.id,
    rawId: `${WEBSITE_CONVERSATION_PREFIX}${thread.id}`,
    guest: thread.guest_name || thread.guest_email,
    status: thread.status,
    lastEvent: thread.last_event_type,
    lastEventAt: thread.last_event_at,
    reservationId: thread.guesty_reservation_id,
    listingId: thread.guesty_listing_id,
    reservationStatus: thread.guesty_reservation_status,
    paidAt: thread.paid_at,
    latestAiHandoff: latestHandoff ? {
      at: latestHandoff.created_at,
      confidence: latestHandoff.payload?.confidence || null,
      escalationReason: cleanString(latestHandoff.payload?.escalationReason, 240),
      recommendedNextAction: cleanString(latestHandoff.payload?.recommendedNextAction, 240),
      summary: cleanString(latestHandoff.payload?.summary, 600),
    } : null,
    events: eventRes.rows.map((e) => ({
      id: e.id,
      type: e.event_type,
      source: e.source,
      at: e.created_at,
      excerpt: cleanString(
        e.payload?.text || e.payload?.body || e.payload?.message || e.payload?.summary || '',
        600,
      ),
    })),
  };
}

async function loadInboxContext(tenantId, focus = null) {
  // When the operator opens Ask Friday while looking at a specific
  // thread, pin that thread as the focus and bring fewer "other recent"
  // entries for situational awareness. The prompt routes the model's
  // attention to focus.thread first.
  const focusInfo = parseInboxFocusThreadId(focus?.threadId);
  let focused = null;
  if (focusInfo) {
    focused = focusInfo.kind === 'website'
      ? await loadFocusedWebsiteThread(tenantId, focusInfo.id)
      : await loadFocusedGuestyThread(tenantId, focusInfo.id);
  }
  const recentLimit = focused ? FOCUS_OTHER_THREAD_LIMIT : 8;

  const native = await safeSection('guest_inbox', async () => {
    const { rows } = await query(
      `SELECT c.id, c.guest_name, c.property_name, c.status, c.communication_channel,
              c.last_message_at, c.updated_at,
              (SELECT m.direction FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id::text DESC LIMIT 1) AS last_direction,
              (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id::text DESC LIMIT 1) AS last_body,
              (SELECT d.state FROM drafts d WHERE d.conversation_id = c.id ORDER BY d.created_at DESC LIMIT 1) AS latest_draft_state,
              (SELECT COUNT(*)::int FROM pending_actions pa WHERE pa.conversation_id = c.id AND pa.status != 'resolved') AS open_actions
         FROM conversations c
        WHERE c.tenant_id = $1
        ORDER BY COALESCE(c.last_message_at, c.updated_at, c.created_at) DESC
        LIMIT $2`,
      [tenantId, recentLimit],
    );
    return rows.map((r) => ({
      id: r.id,
      guest: r.guest_name,
      property: r.property_name,
      status: r.status,
      channel: r.communication_channel,
      lastMessageAt: r.last_message_at || r.updated_at,
      lastDirection: r.last_direction,
      lastMessageExcerpt: cleanString(r.last_body, 180),
      latestDraftState: r.latest_draft_state,
      openActions: r.open_actions,
    }));
  });

  const website = tenantId === FR_TENANT_ID ? await safeSection('website_ai_handoffs', async () => {
    const { rows } = await query(
      `SELECT t.id, t.guest_email, t.guest_name,
              (to_jsonb(t)->>'guest_phone') AS guest_phone,
              t.status, t.last_event_type, t.last_event_at,
              t.guesty_reservation_id, t.guesty_listing_id,
              t.guesty_reservation_status, t.paid_at,
              latest_handoff.payload AS ai_handoff_payload,
              latest_handoff.created_at AS ai_handoff_at,
              latest_takeover.created_at AS ai_takeover_at
         FROM inbox_threads t
         LEFT JOIN LATERAL (
           SELECT payload, created_at
             FROM inbox_events e
            WHERE e.thread_id = t.id AND e.event_type = 'website.ai_handoff'
            ORDER BY e.created_at DESC
            LIMIT 1
         ) latest_handoff ON TRUE
         LEFT JOIN LATERAL (
           SELECT created_at
             FROM inbox_events e
            WHERE e.thread_id = t.id
              AND e.event_type IN ('website.ai_handoff_takeover', 'staff.reply_sent')
              AND latest_handoff.created_at IS NOT NULL
              AND e.created_at >= latest_handoff.created_at
            ORDER BY e.created_at DESC
            LIMIT 1
         ) latest_takeover ON TRUE
        WHERE t.status <> 'closed'
        ORDER BY t.last_event_at DESC
        LIMIT $1`,
      [recentLimit],
    );
    return rows.map((r) => ({
      id: r.id,
      guest: r.guest_name || r.guest_email,
      status: r.status,
      lastEvent: r.last_event_type,
      lastEventAt: r.last_event_at,
      reservationId: r.guesty_reservation_id,
      listingId: r.guesty_listing_id,
      reservationStatus: r.guesty_reservation_status,
      paidAt: r.paid_at,
      teamTakeoverAt: r.ai_takeover_at,
      aiHandoff: r.ai_handoff_payload ? {
        confidence: r.ai_handoff_payload.confidence || null,
        escalationReason: cleanString(r.ai_handoff_payload.escalationReason, 160),
        recommendedNextAction: cleanString(r.ai_handoff_payload.recommendedNextAction, 160),
      } : null,
    }));
  }) : { name: 'website_ai_handoffs', ok: true, data: [] };

  const sections = [native, website];
  if (focused) {
    sections.unshift({
      name: 'focused_inbox_thread',
      ok: true,
      source: sectionSource('focused_inbox_thread'),
      data: focused,
    });
  }
  return { sections, focusedThreadKind: focused?.kind || null };
}

function parseTeamTarget(value) {
  const raw = cleanString(value, 160);
  if (!raw) return null;
  const match = raw.match(/^(channel|dm):(.+)$/i);
  if (!match) return null;
  const kind = match[1].toLowerCase();
  const valuePart = cleanString(match[2], 120);
  if (!valuePart) return null;
  if (kind === 'dm' && !isUuid(valuePart)) return null;
  return { kind, value: valuePart, raw };
}

function questionWantsDmContext(question = '') {
  return /\b(dm|dms|direct message|direct messages|private message|private messages)\b/i.test(question);
}

function shapeTeamChannelMessage(row) {
  return {
    kind: 'channel',
    id: row.id || row.message_id || null,
    channelId: row.channel_id || null,
    channelKey: row.channel_key || null,
    channelName: row.channel_name || row.name || null,
    visibility: row.visibility || null,
    messageKind: row.kind || 'text',
    author: row.author_display_name || null,
    at: row.created_at || null,
    excerpt: cleanString(row.text, 700),
  };
}

function shapeTeamDmMessage(row) {
  return {
    kind: 'dm',
    id: row.id || row.message_id || null,
    dmId: row.dm_id || null,
    participantCount: Number(row.participant_count) || null,
    messageKind: row.kind || 'text',
    author: row.author_display_name || null,
    at: row.created_at || null,
    excerpt: cleanString(row.text, 700),
  };
}

async function loadFocusedTeamContext(tenantId, identity, target) {
  const userId = identity?.userId;
  if (!userId || !target) return null;
  if (target.kind === 'channel') {
    const { rows: channelRows } = await query(
      `SELECT c.id, c.channel_key, c.name, c.visibility,
              (mem.user_id IS NOT NULL) AS is_member
         FROM team_channels c
         LEFT JOIN team_channel_members mem
           ON mem.channel_id = c.id AND mem.user_id = $2
        WHERE c.tenant_id = $1
          AND c.archived_at IS NULL
          AND (c.id::text = $3 OR c.channel_key = $3)
        LIMIT 1`,
      [tenantId, userId, target.value],
    );
    const channel = channelRows[0] || null;
    if (!channel) return { kind: 'channel', target: target.raw, access: 'not_found' };
    if (channel.visibility === 'private' && !channel.is_member) {
      return {
        kind: 'channel',
        target: target.raw,
        access: 'forbidden',
        channelKey: channel.channel_key,
        channelName: channel.name,
        visibility: channel.visibility,
        policy: 'Private TeamInbox channels are available only to members.',
      };
    }
    const { rows } = await query(
      `SELECT id, channel_id, $2::text AS channel_key, $3::text AS channel_name,
              $4::text AS visibility, author_display_name, text, kind, created_at
         FROM team_channel_messages
        WHERE channel_id = $1
          AND deleted_at IS NULL
        ORDER BY created_at DESC, id::text DESC
        LIMIT $5`,
      [channel.id, channel.channel_key, channel.name, channel.visibility, TEAM_FOCUS_MESSAGE_LIMIT],
    );
    return {
      kind: 'channel',
      target: target.raw,
      access: 'allowed',
      channelKey: channel.channel_key,
      channelName: channel.name,
      visibility: channel.visibility,
      messages: rows.map(shapeTeamChannelMessage).reverse(),
    };
  }

  const { rows: dmRows } = await query(
    `SELECT id, participant_user_ids, array_length(participant_user_ids, 1) AS participant_count
       FROM team_dms
      WHERE tenant_id = $1
        AND id = $2
        AND $3 = ANY(participant_user_ids)
      LIMIT 1`,
    [tenantId, target.value, userId],
  );
  const dm = dmRows[0] || null;
  if (!dm) return { kind: 'dm', target: target.raw, access: 'not_found_or_forbidden' };
  const { rows } = await query(
    `SELECT id, dm_id, $2::int AS participant_count, author_display_name, text, kind, created_at
       FROM team_dm_messages
      WHERE dm_id = $1
        AND deleted_at IS NULL
      ORDER BY created_at DESC, id::text DESC
      LIMIT $3`,
    [dm.id, Number(dm.participant_count) || null, TEAM_FOCUS_MESSAGE_LIMIT],
  );
  return {
    kind: 'dm',
    target: target.raw,
    access: 'allowed',
    participantCount: Number(dm.participant_count) || null,
    messages: rows.map(shapeTeamDmMessage).reverse(),
  };
}

async function loadTeamContext(tenantId, identity = {}, focus = null, options = {}) {
  const userId = identity?.userId;
  if (!userId) {
    return {
      policy: 'TeamInbox context requires an authenticated staff user.',
      skipped: 'missing_staff_identity',
      sections: [],
    };
  }

  const target = parseTeamTarget(focus?.teamTarget);
  const includeDms = Boolean(options.includeDms || target?.kind === 'dm');
  const focused = target ? await loadFocusedTeamContext(tenantId, identity, target) : null;
  const channelResult = await safeSection('team_inbox_recent_channels', async () => {
    const { rows } = await query(
      `SELECT msg.id, msg.channel_id, c.channel_key, c.name AS channel_name,
              c.visibility, msg.author_display_name, msg.text, msg.kind, msg.created_at
         FROM team_channel_messages msg
         JOIN team_channels c ON c.id = msg.channel_id
         LEFT JOIN team_channel_members mem
           ON mem.channel_id = c.id AND mem.user_id = $2
        WHERE c.tenant_id = $1
          AND c.archived_at IS NULL
          AND msg.deleted_at IS NULL
          AND msg.parent_message_id IS NULL
          AND (c.visibility = 'public' OR mem.user_id IS NOT NULL)
        ORDER BY msg.created_at DESC, msg.id::text DESC
        LIMIT $3`,
      [tenantId, userId, TEAM_CONTEXT_MESSAGE_LIMIT],
    );
    return rows.map(shapeTeamChannelMessage);
  });
  const dmResult = includeDms ? await safeSection('team_inbox_recent_dms', async () => {
    const { rows } = await query(
      `SELECT msg.id, msg.dm_id, array_length(dm.participant_user_ids, 1) AS participant_count,
              msg.author_display_name, msg.text, msg.kind, msg.created_at
         FROM team_dm_messages msg
         JOIN team_dms dm ON dm.id = msg.dm_id
        WHERE dm.tenant_id = $1
          AND $2 = ANY(dm.participant_user_ids)
          AND msg.deleted_at IS NULL
          AND msg.parent_message_id IS NULL
        ORDER BY msg.created_at DESC, msg.id::text DESC
        LIMIT $3`,
      [tenantId, userId, TEAM_CONTEXT_MESSAGE_LIMIT],
    );
    return rows.map(shapeTeamDmMessage);
  }) : {
    name: 'team_inbox_recent_dms',
    ok: true,
    source: sectionSource('team_inbox_recent_dms'),
    data: [],
    skipped: 'dm_context_requires_dm_focus_or_explicit_request',
  };

  const sections = [channelResult, dmResult];
  if (focused) {
    sections.unshift({
      name: 'focused_team_inbox_thread',
      ok: true,
      source: sectionSource('focused_team_inbox_thread'),
      data: focused,
    });
  }

  return {
    policy: 'TeamInbox messages are staff-only operational evidence, not canonical truth. Private channels are only loaded for members. DMs are only loaded for participants when a DM is focused or explicitly requested.',
    focusedTargetKind: focused?.kind || null,
    sections,
  };
}

async function loadOperationsContext(tenantId) {
  const { rows } = await query(
    `SELECT id, title, status, priority, category, department, property_code,
            reservation_guesty_id, assignee_user_ids, due_date, due_time, updated_at
       FROM tasks
      WHERE tenant_id = $1 AND status != 'cancelled'
      ORDER BY
        CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
        due_date ASC NULLS LAST,
        updated_at DESC
      LIMIT 14`,
    [tenantId],
  );
  return rows;
}

async function loadHrContext(tenantId) {
  const [staff, timeOff, roster] = await Promise.all([
    query(
      `SELECT name, role, department, zone, status, updated_at
         FROM hr_staff
        WHERE tenant_id = $1 AND archived_at IS NULL
        ORDER BY status, role, name
        LIMIT 30`,
      [tenantId],
    ),
    query(
      `SELECT r.id, s.name AS staff_name, r.type, r.start_date, r.end_date, r.status
         FROM hr_time_off_requests r
         JOIN hr_staff s ON s.id = r.staff_id
        WHERE r.tenant_id = $1 AND r.status = 'pending'
        ORDER BY r.created_at DESC
        LIMIT 10`,
      [tenantId],
    ),
    query(
      `SELECT s.name AS staff_name, d.work_date, d.availability, d.zone, d.leave_type
         FROM hr_roster_days d
         JOIN hr_staff s ON s.id = d.staff_id
        WHERE d.tenant_id = $1
          AND d.work_date >= CURRENT_DATE
          AND d.work_date < CURRENT_DATE + INTERVAL '8 days'
        ORDER BY d.work_date, s.name
        LIMIT 40`,
      [tenantId],
    ),
  ]);
  return {
    staff: staff.rows,
    pendingTimeOff: timeOff.rows,
    nextRosterDays: roster.rows,
  };
}

async function loadReviewsContext(tenantId) {
  if (tenantId !== FR_TENANT_ID) return { skipped: 'reviews are currently FR Guesty-only' };
  const [reviewsResp, listings] = await Promise.all([
    guestyRequest({
      method: 'GET',
      path: '/reviews',
      params: { limit: 8 },
    }),
    listListings({ limit: 100, maxPages: 2 }).catch(() => []),
  ]);
  const listingIndex = buildListingIndex(listings);
  return extractList(reviewsResp.data).slice(0, 8).map((row) => shapeReview(row, listingIndex));
}

async function loadDesignContext(tenantId) {
  const [projects, tasks] = await Promise.all([
    query(
      `SELECT id, name, current_stage, stage_status, lifecycle_status, blocker,
              next_action, tier, classification, updated_at
         FROM design_projects
        WHERE tenant_id = $1 AND lifecycle_status = 'active'
        ORDER BY updated_at DESC
        LIMIT 10`,
      [tenantId],
    ),
    query(
      `SELECT t.id, t.title, t.status, t.due_date, p.name AS project_name
         FROM design_tasks t
         JOIN design_projects p ON p.id = t.project_id
        WHERE p.tenant_id = $1 AND t.status != 'done'
        ORDER BY t.due_date ASC NULLS LAST, t.updated_at DESC
        LIMIT 12`,
      [tenantId],
    ),
  ]);
  return { activeProjects: projects.rows, openProjectTasks: tasks.rows };
}

async function loadReservationsContext(tenantId) {
  const { rows } = await query(
    `SELECT r.guesty_id, r.confirmation_code, r.status, r.source, r.channel,
            r.check_in_date, r.check_out_date, r.guests_count, r.adults,
            r.children, r.infants, r.guest_first_name, r.guest_last_name,
            r.total_amount_minor, r.currency_code, l.nickname AS listing_nickname
       FROM guesty_reservations r
       LEFT JOIN guesty_listings l
         ON l.tenant_id = r.tenant_id AND l.guesty_id = r.listing_guesty_id
      WHERE r.tenant_id = $1
        AND r.check_in_date >= CURRENT_DATE - INTERVAL '2 days'
      ORDER BY r.check_in_date ASC NULLS LAST
      LIMIT 12`,
    [tenantId],
  );
  return rows;
}

async function loadPropertiesContext(tenantId) {
  const { rows } = await query(
    `SELECT guesty_id, nickname, title, address_city, cohort, bedrooms,
            bathrooms, accommodates, is_active, synced_at
       FROM guesty_listings
      WHERE tenant_id = $1 AND is_active = TRUE
      ORDER BY COALESCE(nickname, title) ASC NULLS LAST
      LIMIT 30`,
    [tenantId],
  );
  return rows;
}

async function loadFridayContext({ tenantId, question, scope, focus, identity = {} }) {
  const requested = ASK_FRIDAY_CONTEXT_MODULES
    .filter((module) => shouldLoad({ question, scope }, module));
  let effective = requested.length > 0 ? requested : ['inbox', 'operations', 'reservations', 'properties'];
  // The shared right panel is page-aware: when the host tells Core the active
  // module/object, that focused module must be present even for vague prompts
  // such as "what should I do next?"
  for (const focusModule of contextModulesFromFocus(focus).reverse()) {
    if (!effective.includes(focusModule)) effective = [focusModule, ...effective];
  }
  const loaders = {
    inbox: () => loadInboxContext(tenantId, focus),
    team: () => loadTeamContext(tenantId, identity, focus, { includeDms: questionWantsDmContext(question) }),
    operations: () => loadOperationsContext(tenantId),
    hr: () => loadHrContext(tenantId),
    reviews: () => loadReviewsContext(tenantId),
    design: () => loadDesignContext(tenantId),
    reservations: () => loadReservationsContext(tenantId),
    properties: () => loadPropertiesContext(tenantId),
  };
  const sections = await Promise.all(effective.map((name) => safeSection(name, loaders[name])));
  const askFridayCore = await loadAskFridayCoreSurfaceState(tenantId, effective, focus);
  return {
    tenantId,
    requestedModules: effective,
    focus: focus || null,
    checkedAt: new Date().toISOString(),
    dataTruth: contextDataTruth(),
    askFridayCore,
    sections,
  };
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-MAX_HISTORY_TURNS).map((m) => ({
    role: m?.role === 'assistant' || m?.role === 'ai' ? 'assistant' : 'user',
    content: cleanString(m?.content || m?.body || m?.text, 700),
  })).filter((m) => m.content);
}

function buildSystemPrompt() {
  return `You are Ask Friday inside FAD, Friday Retreats' staff operations cockpit.

Purpose:
- Answer staff questions using the supplied live FAD context.
- Think across Inbox, TeamInbox, Operations, HR, Reviews, Design, Reservations, and Properties when present.
- Act as a command surface: answer, propose next steps, and return structured action buttons when the operator can safely act.
- You do not execute actions yourself. The UI will only execute an action after a staff member clicks the button.

Rules:
- Use only the supplied context. If a source is unavailable or missing, say that plainly.
- Treat context.dataTruth as binding. Never infer from, cite, summarize, or act on demo/fixture module data. If a module is excluded because it is not live-wired yet, say that plainly.
- Treat context.askFridayCore as governance context for the active Ask Friday surface(s): published context packs are canonical guidance; draft packs are staff-private planning guidance only; missing Core surface state means you must fall back to live FAD context and say what is missing if relevant.
- Keep ownership boundaries clear: Inbox owns guest communication context; TeamInbox is staff-only internal discussion/evidence, not canonical truth; Operations owns real tasks/issues; HR owns staff/roster; Design owns design projects; Reviews are read-only Guesty feedback.
- **Focus rule:** if a section named "focused_inbox_thread" is present under context.sections[*].data.sections (or anywhere in the inbox subtree), the operator is asking about THAT specific thread. Anchor your answer on its messages / events / latestAiHandoff. The other inbox entries are background context only — do not summarize or mix them in unless the question explicitly asks for a cross-thread comparison.
- **Page focus rule:** operatorFocus is compact page state from the current FAD surface. Use operatorFocus.module/view/focusedObject/selection/visibleState to understand where the staff member is working, but treat it as navigation/attention context only. Operational truth still comes from context.sections and owning module tools.
- For "explain this AI handoff" / "what's going on with this guest" / "summarise this conversation" style questions, use only the focused thread's events and latestAiHandoff payload; do not pull in unrelated threads.
- If TeamInbox context is present, treat it as what the team is discussing. Use it to explain team intent, blockers, and next checks, but confirm operational truth against the owning module before making commitments.
- Prefer concise operational answers: answer first, then the evidence or next check.
- Do not use markdown tables. Use compact bullets so the FAD panel stays readable on desktop and mobile.
- If confidence is low, ask one targeted clarification instead of inventing.
- For operational questions, return at least one concrete next step or safe action when the supplied context supports it.
- Safe internal actions may be proposed as create_task or send_team_message.
- Guest-facing, revenue-impacting, access-code, payment, pricing, reservation, HR-record, and approval-sensitive changes must be request_approval only. Never propose direct execution for those.
- Use navigate actions to send the operator to the owning module when that is the best next step.
- Never claim an action has been done unless the supplied context says it was already done.
- Do not expose private credentials, raw tokens, or internal implementation details.
- Use the supplied mauritiusCalendar values for relative dates like today and tomorrow. Do not infer Mauritius dates from UTC timestamps.

Return JSON only:
{
  "answer": "markdown answer",
  "confidence": "high|medium|low",
  "followups": ["short suggested follow-up", "..."],
  "sourcesUsed": ["inbox", "team", "operations"],
  "actions": [
    {
      "type": "navigate|create_task|send_team_message|request_approval",
      "risk": "navigation|safe|approval",
      "label": "short button label",
      "summary": "what will happen if clicked",
      "module": "operations|inbox|hr|reviews|design|reservations|properties|null",
      "payload": {}
    }
  ]
}`;
}

function buildUserPrompt({ question, scope, context, focus }) {
  return JSON.stringify({
    question: cleanString(question, MAX_QUESTION_CHARS),
    scope: cleanString(scope || 'All of FAD', 120),
    operatorFocus: focus || null,
    mauritiusCalendar: {
      today: todayInMauritius(),
      tomorrow: addDays(todayInMauritius(), 1),
    },
    context,
  }, null, 2);
}

function parseModelResponse(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try {
    const parsed = JSON.parse(candidate);
    return {
      answer: cleanAnswer(parsed.answer) || raw,
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
      followups: Array.isArray(parsed.followups) ? parsed.followups.map((f) => cleanString(f, 120)).filter(Boolean).slice(0, 4) : [],
      sourcesUsed: Array.isArray(parsed.sourcesUsed) ? parsed.sourcesUsed.map((s) => cleanString(s, 60)).filter(Boolean).slice(0, 8) : [],
      actions: sanitizeActions(parsed.actions),
    };
  } catch {
    return {
      answer: raw || 'Friday did not return an answer.',
      confidence: 'medium',
      followups: [],
      sourcesUsed: [],
      actions: [],
    };
  }
}

function mcpContextFromRequest(req) {
  return {
    kind: 'user',
    userId: req.identity?.userId || null,
    userRole: req.identity?.userRole || null,
    username: req.identity?.username || null,
    displayName: req.identity?.displayName || req.identity?.username || null,
    tenantId: req.tenantId,
    scopes: ['mcp:read', 'mcp:write', 'mcp:high-risk'],
  };
}

function resultSummary(type, result) {
  if (type === 'create_task') return `Task created: ${result?.task?.title || result?.task?.id || 'new task'}`;
  if (type === 'send_team_message') return `Message posted in #${result?.channel?.channel_key || 'team'}`;
  if (type === 'request_approval') return `Approval request created: ${result?.request?.id || 'pending request'}`;
  return 'Action completed';
}

function staffIdentityKey(req) {
  return req.identity?.userId || req.identity?.username || req.identity?.displayName || 'fad-user';
}

function stableActionRequestId(action) {
  const snapshot = JSON.stringify({
    id: action.id || null,
    type: action.type,
    label: action.label || null,
    module: action.module || null,
    summary: action.summary || null,
    payload: action.payload || {},
  });
  const hash = crypto.createHash('sha256').update(snapshot).digest('hex').slice(0, 24);
  return `fadask_${hash}`;
}

function coreRiskClassForAction(action) {
  return action.risk === 'approval' ? 'approval' : 'low';
}

function actionResultRef(result) {
  if (!result || typeof result !== 'object') return null;
  if (result.task?.id) return { type: 'task', id: result.task.id };
  if (result.request?.id) return { type: 'approval_request', id: result.request.id };
  if (result.message?.id) return { type: 'team_message', id: result.message.id };
  return null;
}

function mirrorCoreActionRequest({ req, action, reason, status = 'pending', result = null }) {
  if (!action || action.type === 'navigate') return Promise.resolve(null);
  return Promise.resolve(recordActionRequest({
    tenantId: req.tenantId,
    action: {
      actionId: stableActionRequestId(action),
      sourceSystem: 'fad',
      surfaceId: 'fad_global_ask_friday',
      requestedBy: {
        identityType: 'staff',
        identityKey: staffIdentityKey(req),
        authenticated: true,
      },
      actionType: action.type,
      riskClass: coreRiskClassForAction(action),
      payload: {
        action: {
          id: action.id,
          type: action.type,
          label: action.label,
          module: action.module,
          summary: action.summary,
          payload: action.payload,
        },
        resultRef: actionResultRef(result),
        resultSummary: result ? resultSummary(action.type, result) : null,
      },
      reason,
      approvalRequired: action.risk === 'approval',
      status,
    },
  }));
}

function mirrorCoreActionRequests({ req, actions, reason }) {
  return Promise.all((actions || []).map((action) =>
    mirrorCoreActionRequest({ req, action, reason }).catch((error) => {
      console.warn('[fad/friday] action request mirror failed:', error.message);
      return null;
    }),
  ));
}

function allowedCoreKnowledgeScopes(context, surfaceId) {
  const surface = (context?.askFridayCore?.surfaces || [])
    .find((item) => item.surfaceId === surfaceId);
  return Array.isArray(surface?.allowedKnowledgeScopes)
    ? surface.allowedKnowledgeScopes.map((scope) => cleanString(scope, 160)).filter(Boolean)
    : [];
}

function knowledgeScopesForAskFriday(context, parsed, eventSurfaceId = ASK_FRIDAY_GLOBAL_SURFACE_ID) {
  const scopes = new Set(['fad_live_context']);
  for (const moduleName of context?.requestedModules || []) {
    const scope = ASK_FRIDAY_MODULE_KNOWLEDGE_SCOPES[moduleName];
    if (scope) scopes.add(scope);
  }
  for (const source of parsed?.sourcesUsed || []) {
    const scope = ASK_FRIDAY_MODULE_KNOWLEDGE_SCOPES[cleanString(source, 80).toLowerCase()];
    if (scope) scopes.add(scope);
  }
  const allowed = allowedCoreKnowledgeScopes(context, eventSurfaceId);
  const result = [...scopes].slice(0, 40);
  return allowed.length ? result.filter((scope) => allowed.includes(scope)) : result;
}

router.post('/actions/execute', attachIdentity, async (req, res) => {
  try {
    const action = cleanAction(req.body?.action || req.body, 0);
    if (!action) return res.status(400).json({ error: 'valid action is required' });
    const policyError = actionPolicyError(action);
    if (policyError) return res.status(400).json({ error: 'ask_friday_action_policy_rejected', details: policyError });
    if (action.type === 'navigate') {
      return res.json({ ok: true, action, result: { module: action.module }, summary: `Opened ${action.module}` });
    }

    const ctx = mcpContextFromRequest(req);
    let toolName;
    let args;
    if (action.type === 'create_task') {
      toolName = ACTION_REGISTRY.create_task.tool;
      args = action.payload;
    } else if (action.type === 'send_team_message') {
      toolName = ACTION_REGISTRY.send_team_message.tool;
      args = action.payload;
    } else if (action.type === 'request_approval') {
      toolName = ACTION_REGISTRY.request_approval.tool;
      args = action.payload;
    } else {
      return res.status(400).json({ error: 'unsupported action type' });
    }

    const result = await callTool(ctx, toolName, args);
    mirrorCoreActionRequest({
      req,
      action,
      status: 'executed',
      result,
      reason: 'Staff executed an Ask Friday action from the global FAD command surface.',
    }).catch((error) => {
      console.warn('[fad/friday] executed action mirror failed:', error.message);
    });
    return res.json({
      ok: true,
      action,
      tool: toolName,
      result,
      summary: resultSummary(action.type, result),
    });
  } catch (e) {
    console.error('[fad/friday] action execute error:', e.message);
    return res.status(400).json({ error: 'ask_friday_action_failed', details: e.message });
  }
});

router.post('/ask', attachIdentity, async (req, res) => {
  try {
    const question = cleanString(req.body?.question, MAX_QUESTION_CHARS);
    if (question.length < 2) return res.status(400).json({ error: 'question is required' });
    const scope = cleanString(req.body?.scope || 'All of FAD', 120);
    const history = sanitizeHistory(req.body?.history);
    const focus = sanitizeFocus(req.body?.focus);
    const context = await loadFridayContext({ tenantId: req.tenantId, question, scope, focus, identity: req.identity });
    const model = req.body?.model || ASK_FRIDAY_MODEL;
    const timeoutMs = String(model).toLowerCase() === 'auto'
      ? ASK_FRIDAY_AUTO_PROVIDER_TIMEOUT_MS
      : ASK_FRIDAY_PROVIDER_TIMEOUT_MS;
    const result = await invokeChat({
      system: buildSystemPrompt(),
      messages: [
        ...history,
        { role: 'user', content: buildUserPrompt({ question, scope, context, focus }) },
      ],
      model,
      maxTokens: ASK_FRIDAY_MAX_TOKENS,
      timeoutMs,
      meter: { tenantId: req.tenantId, feature: 'fad_ask_friday' },
    });
    if (!result.ok) {
      return res.status(result.status === 429 ? 429 : 502).json({
        error: 'ask_friday_model_failed',
        details: result.error || 'model call failed',
        context,
      });
    }
    const parsed = parseModelResponse(result.message?.content || '');
    const actions = deterministicActions({ question, context, modelActions: parsed.actions });
    mirrorCoreActionRequests({
      req,
      actions,
      reason: `Ask Friday suggested actions after staff asked: ${question}`,
    }).catch((e) => {
      console.warn('[fad/friday] suggested actions mirror failed:', e.message);
    });
    recordLearningEvent({
      tenantId: req.tenantId,
      event: {
        sourceSystem: 'fad',
        surfaceId: 'fad_global_ask_friday',
        identityRef: {
          identityType: 'staff',
          identityKey: staffIdentityKey(req),
          authenticated: true,
        },
        intent: scope,
        userTurnSummary: question,
        assistantActionSummary: parsed.answer.slice(0, 900),
        toolsUsed: ['load_fad_context'],
        knowledgeUsed: knowledgeScopesForAskFriday(context, parsed),
        confidence: parsed.confidence,
        outcome: actions.length ? 'action_candidate' : 'answered',
        handoff: { triggered: false },
        signals: {
          actionCount: actions.length,
          requestedModules: context.requestedModules,
          askFridayCore: {
            ok: context.askFridayCore?.ok,
            surfaceIds: context.askFridayCore?.surfaceIds || [],
            surfaces: (context.askFridayCore?.surfaces || []).map((surface) => ({
              surfaceId: surface.surfaceId,
              status: surface.status,
              contextPackStatus: surface.contextPackStatus,
            })),
          },
          sourceStatus: context.sections.map((s) => ({
            name: s.name,
            ok: s.ok,
            source: s.source || null,
            error: s.error || null,
          })),
          fallbackUsed: !!result.fallbackUsed,
          focus: focus || null,
        },
        privacyClass: 'high',
        redactionStatus: 'partially_redacted',
        eventPayload: {
          scope,
          focus,
          model: result.model || null,
        },
      },
    }).catch((e) => {
      console.warn('[fad/friday] learning event write failed:', e.message);
    });
    return res.json({
      ...parsed,
      actions,
      model: result.model || null,
      fallbackUsed: !!result.fallbackUsed,
      contextSummary: {
        requestedModules: context.requestedModules,
        dataTruth: context.dataTruth,
        askFridayCore: {
          ok: context.askFridayCore?.ok,
          source: context.askFridayCore?.source || 'ask_friday_core',
          surfaceIds: context.askFridayCore?.surfaceIds || [],
          surfaces: (context.askFridayCore?.surfaces || []).map((surface) => ({
            surfaceId: surface.surfaceId,
            displayName: surface.displayName,
            status: surface.status,
            accessClass: surface.accessClass,
            contextPackStatus: surface.contextPackStatus,
            latestContextPackId: surface.latestPublished?.packId || surface.latestDraft?.packId || null,
            latestContextPackVersion: surface.latestPublished?.version || surface.latestDraft?.version || null,
          })),
          error: context.askFridayCore?.error || null,
        },
        focus: context.focus || null,
        sourceStatus: context.sections.map((s) => ({
          name: s.name,
          ok: s.ok,
          source: s.source || null,
          error: s.error || null,
        })),
      },
      usage: result.usage || null,
    });
  } catch (e) {
    console.error('[fad/friday] ask error:', e.message);
    return res.status(500).json({ error: 'ask_friday_failed', details: e.message });
  }
});

module.exports = {
  router,
  _test: {
    buildSystemPrompt,
    buildUserPrompt,
    parseModelResponse,
    sanitizeHistory,
    coreSurfaceIdsForContext,
    shapeCoreSurfaceState,
    loadAskFridayCoreSurfaceState,
    cleanAction,
    actionPolicyError,
    sanitizeActions,
    deterministicActions,
    contextDataTruth,
    todayInMauritius,
    addDays,
    isBroadAllFadQuestion,
    questionHintsModule,
    shouldLoad,
    shapeReview,
    buildListingIndex,
    sanitizeFocus,
    normalizeFocusModule,
    contextModulesFromFocus,
    parseInboxFocusThreadId,
    parseTeamTarget,
    questionWantsDmContext,
    loadFocusedGuestyThread,
    loadFocusedWebsiteThread,
    loadTeamContext,
    loadFocusedTeamContext,
    allowedCoreKnowledgeScopes,
    knowledgeScopesForAskFriday,
    stableActionRequestId,
    ASK_FRIDAY_MODEL,
    ASK_FRIDAY_MAX_TOKENS,
    ASK_FRIDAY_PROVIDER_TIMEOUT_MS,
    ASK_FRIDAY_AUTO_PROVIDER_TIMEOUT_MS,
  },
};
