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
const OPS_CONSULT_COMPACT_FIRST_TASK_THRESHOLD = Number(process.env.OPS_CONSULT_COMPACT_FIRST_TASK_THRESHOLD) || 50;
const OPS_CONSULT_COMPACT_FIRST_RESERVATION_THRESHOLD = Number(process.env.OPS_CONSULT_COMPACT_FIRST_RESERVATION_THRESHOLD) || 70;
const OPS_CONSULT_TASK_ASSIGNMENT_COVERAGE_LIMIT = Number(process.env.OPS_CONSULT_TASK_ASSIGNMENT_COVERAGE_LIMIT) || 160;

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
    estimatedMinutes: item.estimatedMinutes ?? item.estimated_minutes ?? null,
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
  const nightsCached = Number(pricing.nightsCached ?? 0);
  const blockedNights = Number(pricing.blockedNights ?? 0);
  const totalMinor = pricing.totalMinor ?? null;
  const minPriceMinor = pricing.minPriceMinor ?? null;
  const maxPriceMinor = pricing.maxPriceMinor ?? null;
  const syncedAt = pricing.syncedAt || null;
  const hasCachedAvailability = Number.isFinite(nightsCached) && nightsCached > 0;
  const hasBlockedSignal = Number.isFinite(blockedNights) && blockedNights > 0;
  const hasPriceSignal = [totalMinor, minPriceMinor, maxPriceMinor].some((value) => value != null);
  if (!hasCachedAvailability && !hasBlockedSignal && !hasPriceSignal && !syncedAt) return null;
  return {
    reservationId: reservation.id || null,
    propertyCode: reservation.propertyCode || null,
    checkInDate: reservation.checkInDate || null,
    checkOutDate: reservation.checkOutDate || null,
    nightsCached: Number.isFinite(nightsCached) ? nightsCached : 0,
    blockedNights: Number.isFinite(blockedNights) ? blockedNights : 0,
    totalMinor,
    minPriceMinor,
    maxPriceMinor,
    currencyCode: pricing.currencyCode || null,
    syncedAt,
  };
}

function formatPricingMissingReservation(reservation) {
  if (!reservation) return null;
  return {
    reservationId: reservation.id || null,
    propertyCode: reservation.propertyCode || null,
    checkInDate: reservation.checkInDate || null,
    checkOutDate: reservation.checkOutDate || null,
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

function taskHumanLabel(task) {
  if (!task) return 'unnamed task';
  const bits = [
    task.title || 'Untitled task',
    task.propertyCode ? `at ${task.propertyCode}` : '',
  ].filter(Boolean);
  return bits.join(' ');
}

function summarizeTaskSignals(tasks, limit = 4) {
  const list = safeArray(tasks, limit)
    .map(taskHumanLabel)
    .filter(Boolean);
  if (list.length === 0) return 'none named';
  const extra = Array.isArray(tasks) && tasks.length > limit ? `, plus ${tasks.length - limit} more` : '';
  return `${list.join('; ')}${extra}`;
}

function taskAssignmentHumanLabel(item) {
  if (!item) return 'unnamed task';
  const bits = [
    item.title || 'Untitled task',
    item.propertyCode ? `at ${item.propertyCode}` : '',
    item.coverageStatus === 'proposed_assignment' && Array.isArray(item.assigneeNames) && item.assigneeNames.length
      ? `to ${item.assigneeNames[0]}`
      : '',
    item.coverageStatus === 'manual_review' && item.reason
      ? `needs review: ${item.reason.replace(/_/g, ' ')}`
      : '',
  ].filter(Boolean);
  return bits.join(' ');
}

function summarizeTaskAssignmentRows(rows, limit = 4) {
  const list = safeArray(rows, limit)
    .map(taskAssignmentHumanLabel)
    .filter(Boolean);
  if (list.length === 0) return 'none named';
  const extra = Array.isArray(rows) && rows.length > limit ? `, plus ${rows.length - limit} more` : '';
  return `${list.join('; ')}${extra}`;
}

function occupiedTaskKey(propertyCode, day) {
  return `${cleanString(propertyCode, 120)}::${dateOnly(day)}`;
}

function taskPlanningDay(task, selectedDate) {
  return dateOnly(task?.dueDate) || dateOnly(selectedDate) || null;
}

function staffFitScoreForTask(task, staffUser) {
  const taskDepartment = cleanString(task?.department, 120).toLowerCase();
  const taskSubdepartment = cleanString(task?.subdepartment, 120).toLowerCase();
  const taskText = `${task?.title || ''} ${taskDepartment} ${taskSubdepartment}`.toLowerCase();
  const staffDepartment = cleanString(staffUser?.department, 120).toLowerCase();
  const staffRole = cleanString(staffUser?.role, 120).toLowerCase();
  const staffZone = cleanString(staffUser?.zone, 120).toLowerCase();
  const propertyCode = cleanString(task?.propertyCode, 120).toLowerCase();
  let score = 0;
  if (taskDepartment && staffDepartment && taskDepartment === staffDepartment) score += 40;
  if (taskDepartment && staffRole && staffRole.includes(taskDepartment)) score += 24;
  if (taskSubdepartment && staffRole && staffRole.includes(taskSubdepartment)) score += 16;
  if (staffZone && propertyCode && propertyCode.includes(staffZone)) score += 8;
  if (taskText.includes('clean') && staffRole.includes('clean')) score += 24;
  if ((taskText.includes('maintenance') || taskText.includes('repair') || taskText.includes('fix')) && staffRole.includes('maintenance')) score += 24;
  if ((taskText.includes('inspection') || taskText.includes('check')) && staffRole.includes('inspection')) score += 16;
  return score;
}

function chooseAssigneeForTask(task, assignableStaff, staffLoadMinutes, staffAssignmentCount) {
  if (!assignableStaff.length) return null;
  const ranked = assignableStaff
    .map((staffUser) => {
      const id = staffUser.id;
      const load = Number(staffLoadMinutes.get(id) || 0);
      const count = Number(staffAssignmentCount.get(id) || 0);
      return {
        staffUser,
        fit: staffFitScoreForTask(task, staffUser),
        load,
        count,
      };
    })
    .sort((a, b) => {
      if (b.fit !== a.fit) return b.fit - a.fit;
      if (a.load !== b.load) return a.load - b.load;
      if (a.count !== b.count) return a.count - b.count;
      return String(a.staffUser.name || '').localeCompare(String(b.staffUser.name || ''));
    });
  return ranked[0]?.staffUser || null;
}

function buildTaskAssignmentCoverage({ visibleOpenTasks, assignableStaff, occupiedPropertyDays, selectedDate }) {
  const occupiedByPropertyDay = new Set(
    safeArray(occupiedPropertyDays, 400)
      .map((item) => occupiedTaskKey(item?.propertyCode, item?.day))
      .filter((key) => key !== '::'),
  );
  const staffById = new Map(assignableStaff.map((user) => [user.id, user]));
  const staffLoadMinutes = new Map(assignableStaff.map((user) => [user.id, 0]));
  const staffAssignmentCount = new Map(assignableStaff.map((user) => [user.id, 0]));
  const openTasks = safeArray(visibleOpenTasks, 500).filter(Boolean);

  for (const task of openTasks) {
    const estimatedMinutes = Number(task.estimatedMinutes || 45);
    const assigneeIds = Array.isArray(task.assigneeIds) ? task.assigneeIds : [];
    for (const assigneeId of assigneeIds) {
      if (!staffById.has(assigneeId)) continue;
      staffLoadMinutes.set(assigneeId, Number(staffLoadMinutes.get(assigneeId) || 0) + (Number.isFinite(estimatedMinutes) ? estimatedMinutes : 45));
      staffAssignmentCount.set(assigneeId, Number(staffAssignmentCount.get(assigneeId) || 0) + 1);
    }
  }

  const assignments = openTasks.map((task) => {
    const planningDay = taskPlanningDay(task, selectedDate);
    const assigneeIds = Array.isArray(task.assigneeIds) ? task.assigneeIds.filter(Boolean) : [];
    const assigneeNames = Array.isArray(task.assigneeNames) ? task.assigneeNames.filter(Boolean) : [];
    const base = {
      taskId: task.id || null,
      title: task.title || '(untitled)',
      propertyCode: task.propertyCode || null,
      planningDay,
      dueTime: task.dueTime || null,
      status: task.status || null,
      priority: task.priority || null,
      department: task.department || null,
      estimatedMinutes: task.estimatedMinutes ?? null,
    };

    if (assigneeIds.length > 0) {
      return {
        ...base,
        coverageStatus: 'assigned_existing',
        assigneeIds,
        assigneeNames: assigneeNames.length
          ? assigneeNames
          : assigneeIds.map((id) => staffById.get(id)?.name).filter(Boolean),
        resolution: 'already_assigned',
      };
    }

    const blockedByOccupancy = task.propertyCode
      && planningDay
      && occupiedByPropertyDay.has(occupiedTaskKey(task.propertyCode, planningDay))
      && !guestUrgentTask(task);

    if (blockedByOccupancy) {
      return {
        ...base,
        coverageStatus: 'manual_review',
        reason: 'occupied_property_non_urgent',
        resolution: 'move_to_checkout_or_open_day_before_assignment',
      };
    }

    const proposedAssignee = chooseAssigneeForTask(task, assignableStaff, staffLoadMinutes, staffAssignmentCount);
    if (!proposedAssignee) {
      return {
        ...base,
        coverageStatus: 'manual_review',
        reason: 'no_assignable_staff',
        resolution: 'needs_staff_assignment_source',
      };
    }

    const estimatedMinutes = Number(task.estimatedMinutes || 45);
    staffLoadMinutes.set(
      proposedAssignee.id,
      Number(staffLoadMinutes.get(proposedAssignee.id) || 0) + (Number.isFinite(estimatedMinutes) ? estimatedMinutes : 45),
    );
    staffAssignmentCount.set(proposedAssignee.id, Number(staffAssignmentCount.get(proposedAssignee.id) || 0) + 1);
    return {
      ...base,
      coverageStatus: 'proposed_assignment',
      assigneeIds: [proposedAssignee.id],
      assigneeNames: [proposedAssignee.name],
      resolution: 'assign_in_draft',
    };
  });

  const limit = Math.max(20, OPS_CONSULT_TASK_ASSIGNMENT_COVERAGE_LIMIT);
  const existingAssignedTaskCount = assignments.filter((item) => item.coverageStatus === 'assigned_existing').length;
  const proposedAssignmentCount = assignments.filter((item) => item.coverageStatus === 'proposed_assignment').length;
  const manualReviewTaskCount = assignments.filter((item) => item.coverageStatus === 'manual_review').length;
  const omittedCount = Math.max(0, assignments.length - limit);
  return {
    summary: {
      visibleOpenTaskCount: assignments.length,
      existingAssignedTaskCount,
      proposedAssignmentCount,
      manualReviewTaskCount,
      taskLevelCoverageCount: assignments.length,
      allVisibleTasksRepresented: omittedCount === 0,
      allAssignableTasksHaveAssignee: manualReviewTaskCount === 0,
      truncated: omittedCount > 0,
      omittedCount,
      limit,
    },
    assignments: assignments.slice(0, limit),
    omittedTaskIds: omittedCount > 0
      ? assignments.slice(limit).map((item) => item.taskId).filter(Boolean).slice(0, 80)
      : [],
  };
}

function timeToMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

function intervalOverlapsMinutes(start, duration, windowStart, windowEnd) {
  if (!Number.isFinite(start)) return false;
  const safeDuration = Number.isFinite(Number(duration)) && Number(duration) > 0 ? Number(duration) : 45;
  const end = start + safeDuration;
  return start < windowEnd && end > windowStart;
}

function taskAssignedToStaff(item, staffId) {
  return Array.isArray(item?.assigneeIds) && item.assigneeIds.includes(staffId);
}

function taskMatchesPlanningDay(item, selectedDate) {
  const itemDay = dateOnly(item?.dueDate);
  const selected = dateOnly(selectedDate);
  return !selected || !itemDay || itemDay === selected;
}

function staffLooksOfficeBased(staffUser) {
  const text = `${staffUser?.role || ''} ${staffUser?.department || ''}`.toLowerCase();
  return /\b(admin|office|manager|ops_manager|reservations|finance|hr|guest|support)\b/.test(text);
}

function compactLunchConflict(item) {
  return {
    taskId: item.id || item.taskId || null,
    title: item.title || '(untitled)',
    propertyCode: item.propertyCode || null,
    dueTime: item.dueTime || null,
    estimatedMinutes: item.estimatedMinutes ?? null,
  };
}

function buildLunchCoverageSummary({ assignableStaff = [], visibleOpenTasks = [], currentPlan = [], selectedDate }) {
  const preferredWindow = { start: '12:00', end: '13:00' };
  const alternateWindows = [
    { start: '11:00', end: '12:00' },
    { start: '13:00', end: '14:00' },
  ];
  const lunchStart = 12 * 60;
  const lunchEnd = 13 * 60;
  const planItems = safeArray(visibleOpenTasks, 500).concat(safeArray(currentPlan, 200));
  const staffRows = safeArray(assignableStaff, 120).filter((user) => user?.id && user?.name);
  const rows = staffRows.map((staffUser) => {
    const conflicts = planItems
      .filter((item) => taskAssignedToStaff(item, staffUser.id))
      .filter((item) => taskMatchesPlanningDay(item, selectedDate))
      .filter((item) => intervalOverlapsMinutes(timeToMinutes(item.dueTime), item.estimatedMinutes, lunchStart, lunchEnd))
      .map(compactLunchConflict)
      .slice(0, 8);
    return {
      staffId: staffUser.id,
      name: staffUser.name,
      role: staffUser.role || null,
      department: staffUser.department || null,
      preferredWindowStatus: conflicts.length > 0 ? 'review_needed' : 'no_visible_conflict',
      visibleLunchConflicts: conflicts,
      recommendedAction: conflicts.length > 0
        ? 'Move lunch to 11:00-12:00 or 13:00-14:00, or move the conflicting task.'
        : 'Protect 12:00-13:00 unless a later draft introduces a conflict.',
    };
  });
  const staffNeedingLunchReviewCount = rows.filter((row) => row.preferredWindowStatus === 'review_needed').length;
  const officeStaffCount = staffRows.filter(staffLooksOfficeBased).length;
  return {
    policy: 'Every staff member needs one open hour for lunch/break; prefer 12:00-13:00, fallback 11:00-12:00 or 13:00-14:00. Stagger office staff so someone remains available.',
    preferredWindow,
    alternateWindows,
    staffCount: rows.length,
    staffNeedingLunchReviewCount,
    allVisibleStaffHaveLunchPath: rows.length > 0 && staffNeedingLunchReviewCount === 0,
    officeCoverage: {
      officeStaffCount,
      staggerRequired: officeStaffCount > 1,
      note: officeStaffCount > 1
        ? 'Do not put every office/head-office staff member at lunch at the same time.'
        : null,
    },
    staff: rows.slice(0, 80),
  };
}

function buildPlanningConstraints({ scheduledTasks = [], unscheduledTasks = [], staff = [], reservations = [], currentPlan = [], selectedDate, rangeStart, rangeEnd }) {
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
  const openScheduledTasks = scheduledTasks.filter(isOpenPlanningTask);
  const openUnscheduledTasks = unscheduledTasks.filter(isOpenPlanningTask);
  const visibleOpenTasks = openScheduledTasks.concat(openUnscheduledTasks);
  const occupiedSelectedProperties = new Set(
    occupiedPropertyDays
      .filter((item) => item.day === selected)
      .map((item) => item.propertyCode),
  );
  const selectedDateCandidateTasks = openScheduledTasks
    .filter((task) => selected && dateOnly(task.dueDate) === selected)
    .concat(
      openUnscheduledTasks
        .filter((task) => selected && !task.dueDate),
    );
  const nonUrgentOccupiedTasks = selectedDateCandidateTasks
    .filter((task) => occupiedSelectedProperties.has(task.propertyCode))
    .filter((task) => !guestUrgentTask(task))
    .map(compactPlanningTaskSignal)
    .filter(Boolean);
  const unassignedOpenTasks = visibleOpenTasks
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
  const calendarPricingSignals = reservations
    .map(formatPricingSignal)
    .filter(Boolean);
  const calendarPricingMissingReservations = reservations
    .filter((reservation) => !formatPricingSignal(reservation))
    .map(formatPricingMissingReservation)
    .filter(Boolean);
  const availabilityPricingSummary = calendarPricingSignals.length > 0
    ? `${calendarPricingSignals.length} reservation overlay(s) include usable cached calendar-pricing or availability signals; treat null price fields as unknown.`
    : (reservations.length > 0
      ? `${reservations.length} reservation overlay(s) are loaded, but none include usable cached calendar-pricing values; availability and prices are not proved by the cache.`
      : 'No reservation overlay is loaded, so availability and prices are not proved by the context.');
  const taskAssignmentCoverage = buildTaskAssignmentCoverage({
    visibleOpenTasks,
    assignableStaff,
    occupiedPropertyDays,
    selectedDate: selected,
  });
  const lunchCoverageSummary = buildLunchCoverageSummary({
    assignableStaff,
    visibleOpenTasks,
    currentPlan,
    selectedDate: selected,
  });
  return {
    assignmentPolicy: 'Roster and schedule drafts are task-level plans: every visible open task must be represented individually as already assigned, proposed to a named assignee, moved/blocked for a stated reason, or sent to manual review. Do not treat roster as staff coverage only.',
    occupancyPolicy: 'Do not schedule non-urgent non-guest-requested property work while occupied. Checkout day is available after checkout for turnover work. Urgent guest-requested issues may be handled during occupancy.',
    lunchPolicy: 'Protect one hour lunch for every staff member; prefer 12:00-13:00, fallback 11:00-12:00 or 13:00-14:00. Stagger office staff so someone remains available.',
    availabilityPricingSource: 'Use reservation overlays and calendarPricing from the FAD reservation cache when present; do not invent availability or prices if cache fields are missing.',
    availabilityPricingSummary,
    draftCompletenessPolicy: 'A roster or schedule draft is incomplete if any visible open task is missing from taskAssignmentCoverage. Do not present a partial task plan as complete.',
    taskAssignmentCoverage,
    lunchCoverageSummary,
    calendarPricingSignals: calendarPricingSignals.slice(0, 60),
    calendarPricingSignalCount: calendarPricingSignals.length,
    calendarPricingMissingCount: calendarPricingMissingReservations.length,
    calendarPricingMissingReservations: calendarPricingMissingReservations.slice(0, 60),
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

function buildDeterministicOpsFallback(body, { reason } = {}) {
  const scheduledTasks = safeArray(body.scheduledTasks || body.tasks, 220).map(compactTask).filter(Boolean);
  const unscheduledTasks = safeArray(body.unscheduledTasks, 120).map(compactTask).filter(Boolean);
  const staff = safeArray(body.staff || body.staffUsers, 80).map(compactStaff).filter(Boolean);
  const reservations = safeArray(body.reservations, 120).map(compactReservation).filter(Boolean);
  const currentPlan = safeArray(body.currentPlan || body.agentPlan || body.scheduleDraft, 80).map(compactPlanItem).filter(Boolean);
  const context = cleanString(body.context || body.mode, 80) || 'general';
  const counts = summarizeCounts({ scheduledTasks, unscheduledTasks, staff, reservations, currentPlan });
  const constraints = buildPlanningConstraints({
    scheduledTasks,
    unscheduledTasks,
    staff,
    reservations,
    currentPlan,
    selectedDate: body.selectedDate,
    rangeStart: body.rangeStart,
    rangeEnd: body.rangeEnd,
  });
  const unassignedCount = constraints.unassignedOpenTaskIds.length;
  const occupiedConflictCount = constraints.nonUrgentOccupiedTaskIds.length;
  const draftUnassignedCount = constraints.currentDraftUnassignedTaskIds.length;
  const pricingSignalCount = constraints.calendarPricingSignalCount || constraints.calendarPricingSignals.length;
  const pricingMissingCount = constraints.calendarPricingMissingCount || 0;
  const assignableStaffCount = constraints.assignableStaff.length;
  const assignmentCoverage = constraints.taskAssignmentCoverage || { summary: {}, assignments: [] };
  const assignmentSummary = assignmentCoverage.summary || {};
  const lunchSummary = constraints.lunchCoverageSummary || {};
  const manualReviewAssignments = safeArray(assignmentCoverage.assignments, 40)
    .filter((item) => item.coverageStatus === 'manual_review');
  const proposedAssignments = safeArray(assignmentCoverage.assignments, 40)
    .filter((item) => item.coverageStatus === 'proposed_assignment');
  const shouldSuggestDraft = ['schedule', 'roster', 'general'].includes(context)
    && assignableStaffCount > 0
    && (unscheduledTasks.length > 0 || unassignedCount > 0 || draftUnassignedCount > 0);

  const lines = [
    'Friday Consult could not get a complete model answer, so I ran the safe planner checks locally.',
    `Loaded ${counts.scheduledTasks} scheduled task(s), ${counts.unscheduledTasks} unscheduled task(s), ${counts.staff} staff record(s), and ${counts.reservations} reservation overlay(s).`,
  ];
  if (reason) {
    lines.push(`Model fallback reason: ${cleanString(reason, 180)}.`);
  }
  if (unassignedCount > 0) {
    lines.push(`Assignment blocker: ${unassignedCount} visible open task(s) have no assignee. First examples: ${summarizeTaskSignals(constraints.unassignedOpenTasks)}.`);
  } else {
    lines.push('Assignment check: no unassigned visible open task was detected in the provided context.');
  }
  lines.push(`Task-level roster coverage: ${assignmentSummary.visibleOpenTaskCount || 0} visible open task(s), ${assignmentSummary.existingAssignedTaskCount || 0} already assigned, ${assignmentSummary.proposedAssignmentCount || 0} proposed to named staff, ${assignmentSummary.manualReviewTaskCount || 0} needing manual review.`);
  if (proposedAssignments.length > 0) {
    lines.push(`First proposed task assignments: ${summarizeTaskAssignmentRows(proposedAssignments)}.`);
  }
  if (manualReviewAssignments.length > 0) {
    lines.push(`Manual-review task examples: ${summarizeTaskAssignmentRows(manualReviewAssignments)}.`);
  }
  if (assignmentSummary.truncated) {
    lines.push(`Coverage warning: ${assignmentSummary.omittedCount} task(s) were outside the compact coverage sample, so do not call the roster complete without a narrower date/property filter or full draft view.`);
  }
  if (occupiedConflictCount > 0) {
    lines.push(`Occupancy blocker: ${occupiedConflictCount} non-urgent task(s) are on occupied properties for the selected day. First examples: ${summarizeTaskSignals(constraints.nonUrgentOccupiedTasks)}.`);
  } else {
    lines.push('Occupancy check: no non-urgent selected-day occupied-property blocker was detected.');
  }
  if (pricingSignalCount > 0) {
    lines.push(`Availability/pricing check: ${pricingSignalCount} reservation overlay(s) include cached calendar-pricing signals. Treat missing prices or stale syncs as unknown, not confirmed.`);
  } else if (reservations.length > 0) {
    lines.push(`Availability/pricing check: ${pricingMissingCount || reservations.length} reservation overlay(s) are loaded, but none include usable cached calendar-pricing values. Availability and prices are not proved by the cache.`);
  } else {
    lines.push('Availability/pricing check: no reservation or cached calendar-pricing signal was provided, so do not infer rates or availability.');
  }
  if (lunchSummary.staffNeedingLunchReviewCount > 0) {
    lines.push(`Lunch/fairness rule: ${lunchSummary.staffNeedingLunchReviewCount} staff member(s) have visible 12:00-13:00 conflicts; move lunch to 11:00-12:00/13:00-14:00 or move those tasks.`);
  } else {
    lines.push('Lunch/fairness rule: no visible 12:00-13:00 staff conflict was detected; still protect one open hour per staff member and stagger office coverage.');
  }
  lines.push(shouldSuggestDraft
    ? 'Next safe step: create a reversible schedule draft, then review unassigned and occupancy blockers before applying it.'
    : 'Next safe step: do not apply changes automatically; review manually or provide staff/task context if planning is still needed.');

  const action = shouldSuggestDraft ? {
    type: 'draft_schedule',
    label: 'Draft safe schedule',
    reason: 'Local planner checks found open schedule work and assignable staff; the draft remains reversible for review before apply.',
    confidence: 0.62,
  } : null;

  return {
    text: `${lines.map((line) => `- ${line}`).join('\n')}${action ? `\n[OPS_ACTION]${JSON.stringify(action)}[/OPS_ACTION]` : ''}`,
    action,
    diagnostics: {
      unassignedOpenTaskCount: unassignedCount,
      nonUrgentOccupiedTaskCount: occupiedConflictCount,
      currentDraftUnassignedTaskCount: draftUnassignedCount,
      calendarPricingSignalCount: pricingSignalCount,
      calendarPricingMissingCount: pricingMissingCount,
      assignableStaffCount,
      taskAssignmentCoverage: assignmentSummary,
      lunchCoverage: {
        staffCount: lunchSummary.staffCount || 0,
        staffNeedingLunchReviewCount: lunchSummary.staffNeedingLunchReviewCount || 0,
        allVisibleStaffHaveLunchPath: Boolean(lunchSummary.allVisibleStaffHaveLunchPath),
      },
    },
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
      availabilityPricingSummary: planningConstraints.availabilityPricingSummary,
    },
    riskSignals: {
      unassignedOpenTaskCount: planningConstraints.unassignedOpenTaskIds.length,
      nonUrgentOccupiedTaskCount: planningConstraints.nonUrgentOccupiedTaskIds.length,
      occupiedPropertyDayCount: planningConstraints.occupiedPropertyDays.length,
      currentDraftUnassignedTaskCount: planningConstraints.currentDraftUnassignedTaskIds.length,
      calendarPricingSignalCount: planningConstraints.calendarPricingSignalCount,
      calendarPricingMissingCount: planningConstraints.calendarPricingMissingCount,
      assignableStaffCount: planningConstraints.assignableStaff.length,
      taskAssignmentCoverage: planningConstraints.taskAssignmentCoverage.summary,
      lunchCoverage: {
        staffCount: planningConstraints.lunchCoverageSummary.staffCount,
        staffNeedingLunchReviewCount: planningConstraints.lunchCoverageSummary.staffNeedingLunchReviewCount,
        allVisibleStaffHaveLunchPath: planningConstraints.lunchCoverageSummary.allVisibleStaffHaveLunchPath,
      },
    },
    taskAssignmentCoverage: {
      summary: planningConstraints.taskAssignmentCoverage.summary,
      assignments: planningConstraints.taskAssignmentCoverage.assignments.slice(0, 12),
      omittedTaskIds: planningConstraints.taskAssignmentCoverage.omittedTaskIds.slice(0, 40),
    },
    lunchCoverageSummary: {
      ...planningConstraints.lunchCoverageSummary,
      staff: planningConstraints.lunchCoverageSummary.staff.slice(0, 12),
    },
    unassignedOpenTasks: planningConstraints.unassignedOpenTasks.slice(0, 20),
    staff: staff.map((user) => ({
      id: user.id,
      name: user.name,
      role: user.role,
      zone: user.zone,
      canAssign: user.canAssign,
    })),
    scheduledTasks: scheduledTasks.slice(0, 20),
    unscheduledTasks: unscheduledTasks.slice(0, 12),
    occupiedPropertyDays: planningConstraints.occupiedPropertyDays.slice(0, 30),
    calendarPricingSignals: planningConstraints.calendarPricingSignals.slice(0, 20),
    calendarPricingMissingReservations: planningConstraints.calendarPricingMissingReservations.slice(0, 20),
    currentPlan: currentPlan.slice(0, 20),
    notes: cleanString(body.notes, 1600) || null,
  };
  return truncate(JSON.stringify(payload, null, 2), Math.min(OPS_CONSULT_CONTEXT_CHAR_LIMIT, 20_000));
}

function shouldUseCompactOpsPromptFirst(body) {
  const context = cleanString(body?.context || body?.mode, 80) || 'general';
  const scheduledCount = safeArray(body?.scheduledTasks || body?.tasks, 300).length;
  const unscheduledCount = safeArray(body?.unscheduledTasks, 200).length;
  const reservationCount = safeArray(body?.reservations, 200).length;
  const taskCount = scheduledCount + unscheduledCount;
  return context === 'roster'
    && (
      taskCount >= OPS_CONSULT_COMPACT_FIRST_TASK_THRESHOLD
      || reservationCount >= OPS_CONSULT_COMPACT_FIRST_RESERVATION_THRESHOLD
    );
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
- For schedule/roster QA, summarize counts and top risks before examples. Do not narrate every task unless asked, but use taskAssignmentCoverage to ensure every visible open task has a resolution.
- For schedule/roster QA, always include an availability/pricing check: say whether usable calendarPricing signals were present, or explicitly say availability/prices are not proved by the cache.
- Do not output raw UUIDs unless the operator explicitly asks for IDs; use task title, property code, and assignee names.
- For roster-generation and schedule-generation requests, account for every visible open task individually: keep existing assignments, assign it to named staff, move/block it for a stated reason, or name it as still needing manual review.
- If assignable staff are loaded, do not recommend a schedule that leaves a visible open task with no named assignee.
- Do not treat roster as staff coverage only; roster output must resolve task ownership as well as coverage/lunch/fairness.
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
    const compactFirst = shouldUseCompactOpsPromptFirst(requestContext);
    const moduleContext = compactFirst
      ? buildOpsCompactModuleContext(requestContext)
      : buildOpsModuleContext(requestContext);
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

    const userMessage = compactFirst
      ? [
          history ? `[Recent module consult turns]\n${history}` : '',
          '[Compact Operations module context]',
          moduleContext,
          '[Operator request]',
          instruction,
          '[Compact-first instruction]',
          'This roster context is large, so start with bounded planner checks. Do not narrate every task, but use taskAssignmentCoverage to verify every visible open task is assigned, blocked, or in manual review.',
        ].filter(Boolean).join('\n\n')
      : [
          history ? `[Recent module consult turns]\n${history}` : '',
          `[Live Operations module context]\n${moduleContext}`,
          `[Operator request]\n${instruction}`,
        ].filter(Boolean).join('\n\n');

    let compactFallbackUsed = compactFirst;
    let result = await generateDraftReply({
      system: buildSystemPrompt({ composed, context, compact: compactFirst }),
      user: userMessage,
      meter: { tenantId: req.tenantId, feature: compactFirst ? 'ops_consult_compact_first' : 'ops_consult' },
      timeoutMs: OPS_CONSULT_TIMEOUT_MS,
      maxRetries: OPS_CONSULT_MAX_RETRIES,
      maxTokens: compactFirst ? Math.min(OPS_CONSULT_MAX_TOKENS, 1800) : OPS_CONSULT_MAX_TOKENS,
    });

    if (!compactFirst && !result.ok && shouldRetryWithCompactOpsPrompt(result)) {
      compactFallbackUsed = true;
      const compactModuleContext = buildOpsCompactModuleContext(requestContext);
      const compactUserMessage = [
        '[Compact Operations module context]',
        compactModuleContext,
        '[Operator request]',
        instruction,
        '[Fallback instruction]',
        'The previous provider response was incomplete. Answer with a bounded summary only. Do not narrate every task, but keep taskAssignmentCoverage as the source of task-level roster truth.',
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

    let deterministicFallbackUsed = false;
    let deterministicFallbackDiagnostics = null;
    if (!result.ok && shouldRetryWithCompactOpsPrompt(result)) {
      deterministicFallbackUsed = true;
      const fallback = buildDeterministicOpsFallback(requestContext, {
        reason: result.error || result.finishReason || 'incomplete model response',
      });
      deterministicFallbackDiagnostics = fallback.diagnostics;
      result = {
        ok: true,
        text: fallback.text,
        model: 'ops-deterministic-fallback',
        inputTokens: result.inputTokens || null,
        outputTokens: result.outputTokens || null,
        finishReason: result.finishReason || 'deterministic_fallback',
      };
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
          compactFallbackUsed,
          deterministicFallbackUsed,
          deterministicFallbackDiagnostics,
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
        deterministicFallbackUsed,
        deterministicFallbackDiagnostics,
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
  buildDeterministicOpsFallback,
  buildSystemPrompt,
  buildPlanningConstraints,
  buildLunchCoverageSummary,
  buildTaskAssignmentCoverage,
  confidenceBand,
  guestUrgentTask,
  parseOpsActionSuggestions,
  reservationBlocksOps,
  shouldRetryWithCompactOpsPrompt,
  shouldUseCompactOpsPromptFirst,
  stripOpsProtocolTags,
  taskSignalsForContext,
};
