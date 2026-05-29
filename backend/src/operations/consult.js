'use strict';

const express = require('express');
const { attachIdentity } = require('../design/auth');
const { defaultComposer } = require('../knowledge/composer');
const { generateDraftReply, DRAFT_MODEL } = require('../ai/kimi_draft');
const { recordLearningEvent } = require('../ask_friday/event_writer');

const router = express.Router();

const OPS_CONSULT_TIMEOUT_MS = Number(process.env.OPS_CONSULT_TIMEOUT_MS) || 480_000;
const OPS_CONSULT_MAX_RETRIES = Number(process.env.OPS_CONSULT_MAX_RETRIES) || 0;
const OPS_CONSULT_MAX_TOKENS = Number(process.env.OPS_CONSULT_MAX_TOKENS) || 4200;
const OPS_CONSULT_CONTEXT_CHAR_LIMIT = Number(process.env.OPS_CONSULT_CONTEXT_CHAR_LIMIT) || 180_000;

const VALID_CONTEXTS = new Set([
  'schedule',
  'roster',
  'task_triage',
  'maintenance',
  'cleaning',
  'supplies',
  'owner_approval',
  'general',
]);

const VALID_ACTIONS = new Set([
  'draft_schedule',
  'apply_schedule_draft',
  'clear_schedule_times',
  'clear_times_and_assignees',
  'undo_last_schedule_step',
  'create_task_draft',
  'request_owner_approval',
]);

const OPEN_PLANNING_STATUSES = new Set(['reported', 'scheduled', 'ready', 'in_progress', 'paused', 'blocked']);

function cleanString(value, maxLength = 4000) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > maxLength ? text.slice(0, maxLength).trimEnd() : text;
}

function truncate(value, maxLength) {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 20)).trimEnd()}\n[truncated]`;
}

function safeArray(value, limit = 100) {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

function compactTask(task) {
  if (!task || typeof task !== 'object') return null;
  return {
    id: task.id || null,
    title: task.title || null,
    propertyCode: task.propertyCode || task.property_code || null,
    department: task.department || null,
    subdepartment: task.subdepartment || null,
    status: task.status || null,
    priority: task.priority || null,
    dueDate: task.dueDate || task.due_date || null,
    dueTime: task.dueTime || task.due_time || null,
    estimatedMinutes: task.estimatedMinutes ?? task.estimated_minutes ?? null,
    assigneeIds: Array.isArray(task.assigneeIds) ? task.assigneeIds : (Array.isArray(task.assignee_user_ids) ? task.assignee_user_ids : []),
    assigneeNames: Array.isArray(task.assigneeNames) ? task.assigneeNames : [],
    source: task.source || null,
    reservationId: task.reservationId || task.reservation_guesty_id || null,
    description: cleanString(task.description, 900) || null,
    riskFlags: Array.isArray(task.riskFlags) ? task.riskFlags.slice(0, 8) : [],
  };
}

function compactStaff(user) {
  if (!user || typeof user !== 'object') return null;
  return {
    id: user.id || user.userId || user.user_id || null,
    name: user.name || user.displayName || user.display_name || null,
    role: user.role || null,
    department: user.department || null,
    zone: user.zone || null,
    status: user.status || null,
    canAssign: user.canAssign ?? user.can_assign ?? null,
  };
}

function compactReservation(reservation) {
  if (!reservation || typeof reservation !== 'object') return null;
  const pricing = reservation.calendarPricing || reservation.calendar_pricing || null;
  return {
    id: reservation.id || reservation.guestyId || reservation.guesty_id || null,
    propertyCode: reservation.propertyCode || reservation.property_code || null,
    listingNickname: reservation.listingNickname || reservation.listing_nickname || null,
    guestName: reservation.guestName || reservation.guest_name || null,
    checkInDate: reservation.checkInDate || reservation.check_in_date || null,
    checkOutDate: reservation.checkOutDate || reservation.check_out_date || null,
    status: reservation.status || null,
    channel: reservation.channel || null,
    calendarPricing: pricing && typeof pricing === 'object' ? {
      nightsCached: Number(pricing.nightsCached ?? pricing.nights_cached ?? 0),
      blockedNights: Number(pricing.blockedNights ?? pricing.blocked_nights ?? 0),
      totalMinor: pricing.totalMinor ?? pricing.total_minor ?? null,
      minPriceMinor: pricing.minPriceMinor ?? pricing.min_price_minor ?? null,
      maxPriceMinor: pricing.maxPriceMinor ?? pricing.max_price_minor ?? null,
      currencyCode: pricing.currencyCode || pricing.currency_code || null,
      syncedAt: pricing.syncedAt || pricing.synced_at || null,
    } : null,
  };
}

function compactPlanItem(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    taskId: item.taskId || item.task_id || null,
    title: item.title || null,
    propertyCode: item.propertyCode || item.property_code || null,
    dueDate: item.dueDate || item.due_date || null,
    dueTime: item.dueTime || item.due_time || null,
    assigneeIds: Array.isArray(item.assigneeIds) ? item.assigneeIds : [],
    reason: item.reason || null,
  };
}

function summarizeCounts({ scheduledTasks, unscheduledTasks, staff, reservations, currentPlan }) {
  const byStatus = {};
  const byDepartment = {};
  for (const task of scheduledTasks.concat(unscheduledTasks)) {
    if (task?.status) byStatus[task.status] = (byStatus[task.status] || 0) + 1;
    if (task?.department) byDepartment[task.department] = (byDepartment[task.department] || 0) + 1;
  }
  return {
    scheduledTasks: scheduledTasks.length,
    unscheduledTasks: unscheduledTasks.length,
    staff: staff.length,
    reservations: reservations.length,
    currentDraftMoves: currentPlan.length,
    byStatus,
    byDepartment,
  };
}

function dateOnly(value) {
  const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function daysInRange(startValue, endValue) {
  const start = dateOnly(startValue);
  const end = dateOnly(endValue);
  if (!start || !end || start > end) return [];
  const days = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  while (cursor <= endDate && days.length < 45) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function reservationBlocksOps(reservation, day) {
  const status = cleanString(reservation?.status, 80).toLowerCase();
  if (!['confirmed', 'checked_in', 'reserved', 'booked'].includes(status)) return false;
  const checkIn = dateOnly(reservation.checkInDate);
  const checkOut = dateOnly(reservation.checkOutDate);
  if (!checkIn || !checkOut || !day) return false;
  return checkIn <= day && day < checkOut;
}

function guestUrgentTask(task) {
  const priority = cleanString(task?.priority, 80).toLowerCase();
  const source = cleanString(task?.source, 80).toLowerCase();
  const text = `${task?.title || ''} ${task?.description || ''}`.toLowerCase();
  return (priority === 'urgent' || priority === 'high')
    && (
      Boolean(task?.reservationId)
      || ['reported_issue', 'inbox_ai', 'reservation_trigger', 'guesty'].includes(source)
      || text.includes('guest')
      || text.includes('blocked')
      || text.includes('leak')
      || text.includes('no water')
      || text.includes('no power')
      || text.includes('lock')
      || text.includes('access')
    );
}

function isOpenPlanningTask(task) {
  return OPEN_PLANNING_STATUSES.has(cleanString(task?.status, 80).toLowerCase());
}

function formatPricingSignal(reservation) {
  const pricing = reservation?.calendarPricing;
  if (!pricing || typeof pricing !== 'object') return null;
  return {
    reservationId: reservation.id || null,
    propertyCode: reservation.propertyCode || null,
    checkInDate: reservation.checkInDate || null,
    checkOutDate: reservation.checkOutDate || null,
    totalMinor: pricing.totalMinor ?? null,
    minPriceMinor: pricing.minPriceMinor ?? null,
    maxPriceMinor: pricing.maxPriceMinor ?? null,
    currencyCode: pricing.currencyCode || null,
    syncedAt: pricing.syncedAt || null,
  };
}

function compactPlanningTaskSignal(task) {
  if (!task) return null;
  return {
    id: task.id || null,
    title: task.title || '(untitled)',
    propertyCode: task.propertyCode || null,
    dueDate: task.dueDate || null,
    dueTime: task.dueTime || null,
    status: task.status || null,
    priority: task.priority || null,
    assigneeNames: Array.isArray(task.assigneeNames) ? task.assigneeNames.slice(0, 4) : [],
  };
}

function buildPlanningConstraints({ scheduledTasks, unscheduledTasks, staff = [], reservations, currentPlan, selectedDate, rangeStart, rangeEnd }) {
  const daySet = new Set([
    ...daysInRange(rangeStart || selectedDate, rangeEnd || selectedDate),
    dateOnly(selectedDate),
  ].filter(Boolean));
  const days = Array.from(daySet).sort();
  const selected = dateOnly(selectedDate) || days[0] || null;
  const occupiedPropertyDays = [];
  for (const reservation of reservations) {
    for (const day of days) {
      if (reservationBlocksOps(reservation, day)) {
        occupiedPropertyDays.push({
          propertyCode: reservation.propertyCode,
          day,
          reservationId: reservation.id,
          guestName: reservation.guestName,
          status: reservation.status,
        });
      }
    }
  }
  const occupiedSelectedProperties = new Set(
    occupiedPropertyDays
      .filter((item) => item.day === selected)
      .map((item) => item.propertyCode),
  );
  const selectedDateCandidateTasks = scheduledTasks
    .filter(isOpenPlanningTask)
    .filter((task) => selected && task.dueDate === selected)
    .concat(
      unscheduledTasks
        .filter(isOpenPlanningTask)
        .filter((task) => selected && !task.dueDate),
    );
  const nonUrgentOccupiedTasks = selectedDateCandidateTasks
    .filter((task) => occupiedSelectedProperties.has(task.propertyCode))
    .filter((task) => !guestUrgentTask(task))
    .map(compactPlanningTaskSignal)
    .filter(Boolean);
  const unassignedOpenTasks = scheduledTasks.concat(unscheduledTasks)
    .filter(isOpenPlanningTask)
    .filter((task) => task.assigneeIds.length === 0)
    .map(compactPlanningTaskSignal)
    .filter(Boolean);
  const assignableStaff = staff
    .filter((user) => user?.canAssign !== false)
    .map((user) => ({
      id: user.id || null,
      name: user.name || null,
      role: user.role || null,
      department: user.department || null,
      zone: user.zone || null,
    }))
    .filter((user) => user.id && user.name);
  return {
    assignmentPolicy: 'Every drafted scheduled task must have at least one eligible assignee; do not leave work unassigned unless the staff directory is unavailable.',
    occupancyPolicy: 'Do not schedule non-urgent non-guest-requested property work while occupied. Checkout day is available after checkout for turnover work. Urgent guest-requested issues may be handled during occupancy.',
    lunchPolicy: 'Protect one hour lunch for every staff member; prefer 12:00-13:00, fallback 11:00-12:00 or 13:00-14:00. Stagger office staff so someone remains available.',
    availabilityPricingSource: 'Use reservation overlays and calendarPricing from the FAD reservation cache when present; do not invent availability or prices if cache fields are missing.',
    draftCompletenessPolicy: 'A planning draft should either assign every visible open task it pulls into the selected day or explicitly name the tasks that must move/manual-review. Do not present a partial plan as complete.',
    calendarPricingSignals: reservations
      .map(formatPricingSignal)
      .filter(Boolean)
      .slice(0, 60),
    assignableStaff: assignableStaff.slice(0, 60),
    unassignedOpenTasks: unassignedOpenTasks.slice(0, 60),
    unassignedOpenTaskIds: unassignedOpenTasks.map((task) => task.id).filter(Boolean).slice(0, 60),
    occupiedPropertyDays: occupiedPropertyDays.slice(0, 80),
    nonUrgentOccupiedTasks: nonUrgentOccupiedTasks.slice(0, 60),
    nonUrgentOccupiedTaskIds: nonUrgentOccupiedTasks.map((task) => task.id).filter(Boolean).slice(0, 60),
    currentDraftUnassignedTaskIds: currentPlan
      .filter((item) => !Array.isArray(item.assigneeIds) || item.assigneeIds.length === 0)
      .map((item) => item.taskId)
      .filter(Boolean)
      .slice(0, 60),
  };
}

function buildOpsModuleContext(body) {
  const scheduledTasks = safeArray(body.scheduledTasks || body.tasks, 220).map(compactTask).filter(Boolean);
  const unscheduledTasks = safeArray(body.unscheduledTasks, 120).map(compactTask).filter(Boolean);
  const staff = safeArray(body.staff || body.staffUsers, 80).map(compactStaff).filter(Boolean);
  const reservations = safeArray(body.reservations, 120).map(compactReservation).filter(Boolean);
  const currentPlan = safeArray(body.currentPlan || body.agentPlan || body.scheduleDraft, 80).map(compactPlanItem).filter(Boolean);

  const payload = {
    module: 'operations',
    consultSurface: 'Friday Consult',
    context: body.context || body.mode || 'general',
    selectedDate: body.selectedDate || null,
    rangeStart: body.rangeStart || null,
    rangeEnd: body.rangeEnd || null,
    plannerMode: body.plannerMode || null,
    timelineScale: body.timelineScale || null,
    counts: summarizeCounts({ scheduledTasks, unscheduledTasks, staff, reservations, currentPlan }),
    planningConstraints: buildPlanningConstraints({
      scheduledTasks,
      unscheduledTasks,
      staff,
      reservations,
      currentPlan,
      selectedDate: body.selectedDate,
      rangeStart: body.rangeStart,
      rangeEnd: body.rangeEnd,
    }),
    staff,
    scheduledTasks,
    unscheduledTasks,
    reservations,
    currentPlan,
    notes: cleanString(body.notes, 5000) || null,
  };
  return truncate(JSON.stringify(payload, null, 2), OPS_CONSULT_CONTEXT_CHAR_LIMIT);
}

function compactOpsTaskForFallback(task) {
  const compact = compactTask(task);
  if (!compact) return null;
  return {
    id: compact.id,
    title: compact.title,
    propertyCode: compact.propertyCode,
    status: compact.status,
    priority: compact.priority,
    dueDate: compact.dueDate,
    dueTime: compact.dueTime,
    estimatedMinutes: compact.estimatedMinutes,
    assigneeNames: compact.assigneeNames,
    assigneeIds: compact.assigneeIds,
    reservationId: compact.reservationId,
    source: compact.source,
    riskFlags: compact.riskFlags,
  };
}

function buildOpsCompactModuleContext(body) {
  const scheduledTasks = safeArray(body.scheduledTasks || body.tasks, 80).map(compactOpsTaskForFallback).filter(Boolean);
  const unscheduledTasks = safeArray(body.unscheduledTasks, 40).map(compactOpsTaskForFallback).filter(Boolean);
  const staff = safeArray(body.staff || body.staffUsers, 40).map(compactStaff).filter(Boolean);
  const reservations = safeArray(body.reservations, 80).map(compactReservation).filter(Boolean);
  const currentPlan = safeArray(body.currentPlan || body.agentPlan || body.scheduleDraft, 40).map(compactPlanItem).filter(Boolean);
  const planningConstraints = buildPlanningConstraints({
    scheduledTasks,
    unscheduledTasks,
    staff,
    reservations,
    currentPlan,
    selectedDate: body.selectedDate,
    rangeStart: body.rangeStart,
    rangeEnd: body.rangeEnd,
  });
  const payload = {
    module: 'operations',
    consultSurface: 'Friday Consult',
    compact: true,
    context: body.context || body.mode || 'general',
    selectedDate: body.selectedDate || null,
    rangeStart: body.rangeStart || null,
    rangeEnd: body.rangeEnd || null,
    plannerMode: body.plannerMode || null,
    counts: summarizeCounts({ scheduledTasks, unscheduledTasks, staff, reservations, currentPlan }),
    policies: {
      assignment: planningConstraints.assignmentPolicy,
      occupancy: planningConstraints.occupancyPolicy,
      lunch: planningConstraints.lunchPolicy,
      availabilityPricing: planningConstraints.availabilityPricingSource,
    },
    riskSignals: {
      unassignedOpenTaskCount: planningConstraints.unassignedOpenTaskIds.length,
      nonUrgentOccupiedTaskCount: planningConstraints.nonUrgentOccupiedTaskIds.length,
      occupiedPropertyDayCount: planningConstraints.occupiedPropertyDays.length,
      currentDraftUnassignedTaskCount: planningConstraints.currentDraftUnassignedTaskIds.length,
      calendarPricingSignalCount: planningConstraints.calendarPricingSignals.length,
      assignableStaffCount: planningConstraints.assignableStaff.length,
    },
    staff: staff.map((user) => ({
      id: user.id,
      name: user.name,
      role: user.role,
      zone: user.zone,
      canAssign: user.canAssign,
    })),
    scheduledTasks: scheduledTasks.slice(0, 30),
    unscheduledTasks: unscheduledTasks.slice(0, 20),
    occupiedPropertyDays: planningConstraints.occupiedPropertyDays.slice(0, 30),
    unassignedOpenTasks: planningConstraints.unassignedOpenTasks.slice(0, 20),
    calendarPricingSignals: planningConstraints.calendarPricingSignals.slice(0, 20),
    currentPlan: currentPlan.slice(0, 20),
    notes: cleanString(body.notes, 1600) || null,
  };
  return truncate(JSON.stringify(payload, null, 2), Math.min(OPS_CONSULT_CONTEXT_CHAR_LIMIT, 20_000));
}

function taskSignalsForContext(text) {
  const source = String(text || '').toLowerCase();
  const signals = [];
  for (const [signal, words] of Object.entries({
    schedule: ['schedule', 'time', 'move', 'drag', 'drop', 'day', 'week'],
    roster: ['roster', 'shift', 'off', 'standby', 'weekend', 'night'],
    owner_approval: ['owner', 'approval', 'expense', 'mur', 'quote', 'vendor', 'repair'],
    maintenance: ['maintenance', 'fix', 'ac', 'leak', 'lock', 'wifi', 'plumbing'],
    cleaning: ['clean', 'post-clean', 'inspection', 'arrival', 'turnover'],
    supplies: ['srl', 'supply', 'stock', 'amenities', 'welcome', 'coffee', 'sugar'],
  })) {
    if (words.some((word) => source.includes(word))) signals.push(signal);
  }
  return signals;
}

function stripOpsProtocolTags(text) {
  return String(text || '')
    .replace(/\[OPS_ACTION\][\s\S]*?\[\/OPS_ACTION\]/g, '')
    .trim();
}

function parseOpsActionSuggestions(text) {
  const suggestions = [];
  const matches = [...String(text || '').matchAll(/\[OPS_ACTION\]([\s\S]*?)\[\/OPS_ACTION\]/g)];
  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const type = cleanString(parsed.type || parsed.action, 80);
      if (!VALID_ACTIONS.has(type)) continue;
      suggestions.push({
        type,
        label: cleanString(parsed.label, 120) || type.replace(/_/g, ' '),
        reason: cleanString(parsed.reason, 1000) || null,
        confidence: Number.isFinite(Number(parsed.confidence)) ? Number(parsed.confidence) : null,
      });
    } catch {
      // Ignore malformed model tags; the visible answer still explains itself.
    }
  }
  return suggestions;
}

function responseContract({ compact = false } = {}) {
  return `RESPONSE CONTRACT:
- Default to a bounded operational summary, not an exhaustive report.
- Use at most 8 bullets and 450 words; compact fallback mode uses at most 5 bullets and 260 words.
- For schedule/roster QA, summarize counts and top risks before examples. Do not list every task.
- Do not output raw UUIDs unless the operator explicitly asks for IDs; use task title, property code, and assignee names.
- For schedule-generation requests, account for every visible open unassigned task: assign it, move/block it for a stated reason, or name it as still needing manual review.
- If assignable staff are loaded, do not recommend a schedule that leaves a visible open task with no named assignee.
- If a reversible local action would help, include one concise [OPS_ACTION] block after the summary.
- If the context is too large, say which exact summary is still reliable and ask for a narrower date/property filter.
${compact ? '- You are in compact fallback mode because a previous provider response was incomplete; be extra concise.' : ''}`;
}

function buildSystemPrompt({ composed, context, compact = false }) {
  return `You are Friday Consult, the Operations module agent inside FAD.

You help the Ops Manager plan schedules, rosters, task triage, maintenance, cleaning, supplies, and owner approvals.
Always distinguish draft/proposed changes from applied changes.
Do not claim that you changed FAD data unless an explicit tool/action result says it was applied.

STRUCTURED ACTION PROTOCOL:
If a reversible FAD action would help, include at most three [OPS_ACTION] JSON blocks after your explanation.
Allowed action types: ${Array.from(VALID_ACTIONS).join(', ')}.
Example:
[OPS_ACTION]{"type":"draft_schedule","label":"Draft schedule for selected day","reason":"There are unscheduled tasks and no-time tasks visible.","confidence":0.82}[/OPS_ACTION]

Do not use action tags for high-risk or non-reversible actions. Ask for human confirmation first.

${responseContract({ compact })}

Current Operations context: ${context}.

${composed.system_message}`;
}

function shouldRetryWithCompactOpsPrompt(result) {
  if (!result || result.ok) return false;
  const reason = cleanString(result.finishReason, 80).toLowerCase();
  const error = cleanString(result.error, 500).toLowerCase();
  return reason === 'length'
    || reason === 'max_tokens'
    || error.includes('finish_reason=length')
    || error.includes('finish_reason=max_tokens')
    || error.includes('incomplete response');
}

function confidenceBand(value) {
  if (value >= 0.75) return 'high';
  if (value >= 0.5) return 'medium';
  if (value > 0) return 'low';
  return 'unknown';
}

router.post('/consult', attachIdentity, async (req, res) => {
  try {
    const instruction = cleanString(req.body?.text || req.body?.instruction, 10_000);
    const context = VALID_CONTEXTS.has(req.body?.context) ? req.body.context : 'general';
    if (!instruction) return res.status(400).json({ error: 'instruction required' });

    const requestContext = { ...req.body, context };
    const moduleContext = buildOpsModuleContext(requestContext);
    const contextText = `${instruction}\n\n${moduleContext}`;
    const composed = defaultComposer().load('ops-consult', {
      property_code: cleanString(req.body?.propertyCode, 80) || undefined,
      context_text: contextText.slice(0, 40_000),
      task_signals: taskSignalsForContext(contextText),
    });

    const history = safeArray(req.body?.history, 20)
      .map((entry) => {
        const role = entry?.role === 'friday' || entry?.role === 'assistant' ? 'Friday Consult' : 'Operator';
        const text = cleanString(entry?.text || entry?.content, 1200);
        return text ? `${role}: ${text}` : '';
      })
      .filter(Boolean)
      .join('\n\n');

    const userMessage = [
      history ? `[Recent module consult turns]\n${history}` : '',
      `[Live Operations module context]\n${moduleContext}`,
      `[Operator request]\n${instruction}`,
    ].filter(Boolean).join('\n\n');

    let compactFallbackUsed = false;
    let result = await generateDraftReply({
      system: buildSystemPrompt({ composed, context }),
      user: userMessage,
      meter: { tenantId: req.tenantId, feature: 'ops_consult' },
      timeoutMs: OPS_CONSULT_TIMEOUT_MS,
      maxRetries: OPS_CONSULT_MAX_RETRIES,
      maxTokens: OPS_CONSULT_MAX_TOKENS,
    });

    if (!result.ok && shouldRetryWithCompactOpsPrompt(result)) {
      compactFallbackUsed = true;
      const compactModuleContext = buildOpsCompactModuleContext(requestContext);
      const compactUserMessage = [
        '[Compact Operations module context]',
        compactModuleContext,
        '[Operator request]',
        instruction,
        '[Fallback instruction]',
        'The previous provider response was incomplete. Answer with a bounded summary only. Do not enumerate all tasks.',
      ].join('\n\n');
      result = await generateDraftReply({
        system: buildSystemPrompt({ composed, context, compact: true }),
        user: compactUserMessage,
        meter: { tenantId: req.tenantId, feature: 'ops_consult_compact' },
        timeoutMs: OPS_CONSULT_TIMEOUT_MS,
        maxRetries: OPS_CONSULT_MAX_RETRIES,
        maxTokens: Math.min(OPS_CONSULT_MAX_TOKENS, 1800),
      });
    }

    if (!result.ok) {
      return res.status(result.status || 502).json({
        error: 'ops_consult_model_failed',
        details: result.error || 'Operations Consult model call failed',
        finishReason: result.finishReason || null,
        compactFallbackUsed,
      });
    }

    const actionSuggestions = parseOpsActionSuggestions(result.text);
    const confidence = actionSuggestions.some((item) => item.confidence != null)
      ? Math.max(...actionSuggestions.map((item) => item.confidence || 0))
      : 0.78;
    const responseText = stripOpsProtocolTags(result.text) || 'I reviewed the Operations context.';

    recordLearningEvent({
      tenantId: req.tenantId,
      event: {
        sourceSystem: 'fad',
        surfaceId: 'fad_ops_assistant',
        identityRef: {
          identityType: 'staff',
          identityKey: req.identity?.userId || req.identity?.username || 'fad-user',
          authenticated: true,
        },
        intent: context,
        userTurnSummary: instruction.slice(0, 900),
        assistantActionSummary: responseText.slice(0, 900),
        toolsUsed: [],
        knowledgeUsed: [
          'ops_tasks',
          'reservations',
          'properties',
          'staff_runbooks',
          'ops-consult',
        ],
        confidence: confidenceBand(confidence),
        outcome: actionSuggestions.length ? 'action_candidate' : 'answered',
        handoff: { triggered: false },
        signals: {
          actionSuggestionCount: actionSuggestions.length,
          context,
        },
        privacyClass: 'high',
        redactionStatus: 'partially_redacted',
        eventPayload: {
          context,
          propertyCode: composed.metadata.property_code || null,
          knowledgeSurface: composed.metadata.surface,
          module: 'operations',
        },
      },
    }).catch((e) => {
      console.warn('[operations/consult] learning event write failed:', e.message);
    });

    res.json({
      response: responseText,
      model: result.model || DRAFT_MODEL,
      action_suggestions: actionSuggestions,
      confidence,
      metadata: {
        surface: composed.metadata.surface,
        loadedSkills: composed.metadata.loaded_skills,
        tokenEstimate: composed.metadata.token_estimate,
        propertyCode: composed.metadata.property_code,
        inputTokens: result.inputTokens || null,
          outputTokens: result.outputTokens || null,
          finishReason: result.finishReason || null,
          compactFallbackUsed,
        },
      });
  } catch (e) {
    console.error('[operations/consult] error:', e.message);
    res.status(e.statusCode || 500).json({
      error: e.code || 'operations_consult_failed',
      details: e.message,
    });
  }
});

module.exports = router;

module.exports._test = {
  buildOpsCompactModuleContext,
  buildOpsModuleContext,
  buildSystemPrompt,
  buildPlanningConstraints,
  confidenceBand,
  guestUrgentTask,
  parseOpsActionSuggestions,
  reservationBlocksOps,
  shouldRetryWithCompactOpsPrompt,
  stripOpsProtocolTags,
  taskSignalsForContext,
};
