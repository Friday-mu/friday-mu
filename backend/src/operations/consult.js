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

function buildPlanningConstraints({ scheduledTasks, unscheduledTasks, reservations, currentPlan, selectedDate, rangeStart, rangeEnd }) {
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
  const nonUrgentOccupiedTaskIds = scheduledTasks
    .filter((task) => selected && task.dueDate === selected)
    .filter((task) => occupiedSelectedProperties.has(task.propertyCode))
    .filter((task) => !guestUrgentTask(task))
    .map((task) => task.id)
    .filter(Boolean);
  return {
    assignmentPolicy: 'Every drafted scheduled task must have at least one eligible assignee; do not leave work unassigned unless the staff directory is unavailable.',
    occupancyPolicy: 'Do not schedule non-urgent non-guest-requested property work while occupied. Checkout day is available after checkout for turnover work. Urgent guest-requested issues may be handled during occupancy.',
    lunchPolicy: 'Protect one hour lunch for every staff member; prefer 12:00-13:00, fallback 11:00-12:00 or 13:00-14:00. Stagger office staff so someone remains available.',
    availabilityPricingSource: 'Use reservation overlays and calendarPricing from the FAD reservation cache when present; do not invent availability or prices if cache fields are missing.',
    unassignedOpenTaskIds: scheduledTasks.concat(unscheduledTasks)
      .filter((task) => task.assigneeIds.length === 0)
      .map((task) => task.id)
      .filter(Boolean)
      .slice(0, 60),
    occupiedPropertyDays: occupiedPropertyDays.slice(0, 80),
    nonUrgentOccupiedTaskIds: nonUrgentOccupiedTaskIds.slice(0, 60),
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

function buildSystemPrompt({ composed, context }) {
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

Current Operations context: ${context}.

${composed.system_message}`;
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

    const moduleContext = buildOpsModuleContext({ ...req.body, context });
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

    const result = await generateDraftReply({
      system: buildSystemPrompt({ composed, context }),
      user: userMessage,
      meter: { tenantId: req.tenantId, feature: 'ops_consult' },
      timeoutMs: OPS_CONSULT_TIMEOUT_MS,
      maxRetries: OPS_CONSULT_MAX_RETRIES,
      maxTokens: OPS_CONSULT_MAX_TOKENS,
    });

    if (!result.ok) {
      return res.status(result.status || 502).json({
        error: 'ops_consult_model_failed',
        details: result.error || 'Operations Consult model call failed',
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
  buildOpsModuleContext,
  buildPlanningConstraints,
  confidenceBand,
  guestUrgentTask,
  parseOpsActionSuggestions,
  reservationBlocksOps,
  stripOpsProtocolTags,
  taskSignalsForContext,
};
