'use strict';

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');
const { invokeChat } = require('../ai/chat_proxy');
const { guestyRequest, listListings } = require('../integrations/guesty');
const { callTool } = require('../mcp');

const router = express.Router();

const FR_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const MAX_QUESTION_CHARS = 1200;
const MAX_HISTORY_TURNS = 8;
const ASK_FRIDAY_MODEL = process.env.FAD_ASK_MODEL || 'claude-sonnet-4-6';
const ASK_FRIDAY_MAX_TOKENS = Number(process.env.KIMI_FAD_ASK_MAX_TOKENS) || 4096;
const ASK_FRIDAY_PROVIDER_TIMEOUT_MS = Number(process.env.FAD_ASK_PROVIDER_TIMEOUT_MS) || 45_000;
const ASK_FRIDAY_AUTO_PROVIDER_TIMEOUT_MS = Number(process.env.FAD_ASK_AUTO_PROVIDER_TIMEOUT_MS) || 25_000;
const ACTION_TYPES = new Set(['navigate', 'create_task', 'send_team_message', 'request_approval']);
const ACTION_RISKS = new Set(['navigation', 'safe', 'approval']);
const ACTION_MODULES = ['inbox', 'operations', 'hr', 'reviews', 'design', 'reservations', 'properties'];
const MODULE_LABELS = {
  inbox: 'Inbox',
  operations: 'Operations',
  hr: 'HR',
  reviews: 'Reviews',
  design: 'Design',
  reservations: 'Reservations',
  properties: 'Properties',
};

function cleanString(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanAnswer(value, max = 5000) {
  return String(value || '').trim().slice(0, max);
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

function cleanAction(raw, index = 0) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const type = cleanString(raw.type, 40);
  if (!ACTION_TYPES.has(type)) return null;
  const risk = ACTION_RISKS.has(raw.risk) ? raw.risk : (
    type === 'navigate' ? 'navigation' : type === 'request_approval' ? 'approval' : 'safe'
  );
  const label = cleanString(raw.label || raw.cta || raw.title, 80);
  const payload = cleanPayload(raw.payload);
  const module = cleanString(raw.module, 80);
  if (type === 'navigate' && !module) return null;
  if ((type === 'create_task' || type === 'send_team_message' || type === 'request_approval') && !label) return null;
  return {
    id: cleanString(raw.id, 80) || `action_${index + 1}`,
    type,
    risk,
    label: label || 'Open',
    summary: cleanString(raw.summary || raw.body || raw.description, 240),
    module: module || null,
    payload,
  };
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
  if (module === 'operations') return /\b(task|todo|work order|ops|operation|issue|maintenance|repair|schedule|roster|runner|inspection|housekeeping)\b/i.test(question);
  if (module === 'hr') return /\b(hr|staff|team|leave|time off|roster|availability|who is on)\b/i.test(question);
  if (module === 'reviews') return /\b(reviews?|ratings?|guest feedback|airbnb|booking\.?com|booking com)\b/i.test(question);
  if (module === 'design') return /\b(design|interior|project|vendor|moodboard|renovation|blocker)\b/i.test(question);
  if (module === 'reservations') return /\b(reservation|booking|arrival|arriving|check.?in|checkout|stay|returning guest|who'?s checking in)\b/i.test(question);
  if (module === 'properties') return hasPropertyCode || /\b(property|properties|villa|listing|availability|calendar|amenit|bedroom|bathroom)\b/i.test(question);
  return false;
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
    if (!hasSimilarAction(actions, candidate)) actions.push(candidate);
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

async function safeSection(name, loader) {
  try {
    return { name, ok: true, data: await loader() };
  } catch (e) {
    return { name, ok: false, error: cleanString(e.message, 240) };
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

async function loadInboxContext(tenantId) {
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
        LIMIT 8`,
      [tenantId],
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
      `SELECT id, guest_email, guest_name, guest_phone, status, last_event_type,
              last_event_at, guesty_reservation_id, guesty_listing_id,
              guesty_reservation_status, paid_at,
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
        LIMIT 8`,
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

  return { sections: [native, website] };
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

async function loadFridayContext({ tenantId, question, scope }) {
  const requested = ['inbox', 'operations', 'hr', 'reviews', 'design', 'reservations', 'properties']
    .filter((module) => shouldLoad({ question, scope }, module));
  const effective = requested.length > 0 ? requested : ['inbox', 'operations', 'reservations', 'properties'];
  const loaders = {
    inbox: () => loadInboxContext(tenantId),
    operations: () => loadOperationsContext(tenantId),
    hr: () => loadHrContext(tenantId),
    reviews: () => loadReviewsContext(tenantId),
    design: () => loadDesignContext(tenantId),
    reservations: () => loadReservationsContext(tenantId),
    properties: () => loadPropertiesContext(tenantId),
  };
  const sections = await Promise.all(effective.map((name) => safeSection(name, loaders[name])));
  return {
    tenantId,
    requestedModules: effective,
    checkedAt: new Date().toISOString(),
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
- Think across Inbox, Operations, HR, Reviews, Design, Reservations, and Properties when present.
- Act as a command surface: answer, propose next steps, and return structured action buttons when the operator can safely act.
- You do not execute actions yourself. The UI will only execute an action after a staff member clicks the button.

Rules:
- Use only the supplied context. If a source is unavailable or missing, say that plainly.
- Keep ownership boundaries clear: Inbox owns guest communication context; Operations owns real tasks/issues; HR owns staff/roster; Design owns design projects; Reviews are read-only Guesty feedback.
- Prefer concise operational answers: answer first, then the evidence or next check.
- If confidence is low, ask one targeted clarification instead of inventing.
- For operational questions, return at least one concrete next step or safe action when the supplied context supports it.
- Safe internal actions may be proposed as create_task or send_team_message.
- Guest-facing, revenue-impacting, access-code, payment, pricing, reservation, HR-record, and approval-sensitive changes must be request_approval only. Never propose direct execution for those.
- Use navigate actions to send the operator to the owning module when that is the best next step.
- Never claim an action has been done unless the supplied context says it was already done.
- Do not expose private credentials, raw tokens, or internal implementation details.

Return JSON only:
{
  "answer": "markdown answer",
  "confidence": "high|medium|low",
  "followups": ["short suggested follow-up", "..."],
  "sourcesUsed": ["inbox", "operations"],
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

function buildUserPrompt({ question, scope, context }) {
  return JSON.stringify({
    question: cleanString(question, MAX_QUESTION_CHARS),
    scope: cleanString(scope || 'All of FAD', 120),
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

router.post('/actions/execute', attachIdentity, async (req, res) => {
  try {
    const action = cleanAction(req.body?.action || req.body, 0);
    if (!action) return res.status(400).json({ error: 'valid action is required' });
    if (action.type === 'navigate') {
      return res.json({ ok: true, action, result: { module: action.module }, summary: `Opened ${action.module}` });
    }

    const ctx = mcpContextFromRequest(req);
    let toolName;
    let args;
    if (action.type === 'create_task') {
      toolName = 'tasks.create';
      args = action.payload;
    } else if (action.type === 'send_team_message') {
      toolName = 'team.message.send';
      args = action.payload;
    } else if (action.type === 'request_approval') {
      toolName = 'action.request.create';
      args = action.payload;
    } else {
      return res.status(400).json({ error: 'unsupported action type' });
    }

    const result = await callTool(ctx, toolName, args);
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
    const context = await loadFridayContext({ tenantId: req.tenantId, question, scope });
    const model = req.body?.model || ASK_FRIDAY_MODEL;
    const timeoutMs = String(model).toLowerCase() === 'auto'
      ? ASK_FRIDAY_AUTO_PROVIDER_TIMEOUT_MS
      : ASK_FRIDAY_PROVIDER_TIMEOUT_MS;
    const result = await invokeChat({
      system: buildSystemPrompt(),
      messages: [
        ...history,
        { role: 'user', content: buildUserPrompt({ question, scope, context }) },
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
    return res.json({
      ...parsed,
      actions,
      model: result.model || null,
      fallbackUsed: !!result.fallbackUsed,
      contextSummary: {
        requestedModules: context.requestedModules,
        sourceStatus: context.sections.map((s) => ({ name: s.name, ok: s.ok, error: s.error || null })),
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
    cleanAction,
    sanitizeActions,
    deterministicActions,
    isBroadAllFadQuestion,
    questionHintsModule,
    shouldLoad,
    shapeReview,
    buildListingIndex,
    ASK_FRIDAY_MODEL,
    ASK_FRIDAY_MAX_TOKENS,
    ASK_FRIDAY_PROVIDER_TIMEOUT_MS,
    ASK_FRIDAY_AUTO_PROVIDER_TIMEOUT_MS,
  },
};
