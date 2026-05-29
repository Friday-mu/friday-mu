'use strict';

const {
  buildOpsCompactModuleContext,
  buildDeterministicOpsFallback,
  buildOpsModuleContext,
  buildSystemPrompt,
  buildPlanningConstraints,
  guestUrgentTask,
  parseOpsActionSuggestions,
  reservationBlocksOps,
  shouldRetryWithCompactOpsPrompt,
  shouldUseCompactOpsPromptFirst,
  stripOpsProtocolTags,
  taskSignalsForContext,
} = require('./consult')._test;

describe('Operations Friday Consult helpers', () => {
  test('compacts schedule context without dropping core planning fields', () => {
    const context = buildOpsModuleContext({
      context: 'schedule',
      selectedDate: '2026-05-27',
      plannerMode: 'user_day',
      scheduledTasks: [{
        id: 'task-1',
        title: 'Post-clean inspection',
        propertyCode: 'VA-1',
        status: 'scheduled',
        priority: 'high',
        department: 'inspection',
        subdepartment: 'post_clean',
        dueDate: '2026-05-27',
        dueTime: null,
        estimatedMinutes: 30,
        assigneeIds: [],
      }],
      reservations: [{
        id: 'rsv-1',
        propertyCode: 'VA-1',
        guestName: 'Guest One',
        checkInDate: '2026-05-26',
        checkOutDate: '2026-05-28',
        status: 'confirmed',
        calendarPricing: {
          nightsCached: 2,
          blockedNights: 0,
          totalMinor: 34000,
          minPriceMinor: 16000,
          maxPriceMinor: 18000,
          currencyCode: 'MUR',
          syncedAt: '2026-05-26T08:00:00.000Z',
        },
      }],
      unscheduledTasks: [{
        id: 'task-2',
        title: 'Fix AC drain leak',
        propertyCode: 'GBH-C8',
        status: 'reported',
        priority: 'urgent',
        department: 'maintenance',
        description: 'Guest reports water dripping from AC.',
      }],
      staff: [{ id: 'u-bryan', name: 'Bryan Henri', canAssign: true }],
      currentPlan: [{ taskId: 'task-1', dueTime: '09:00', reason: 'No exact time.' }],
    });

    expect(context).toContain('"consultSurface": "Friday Consult"');
    expect(context).toContain('"selectedDate": "2026-05-27"');
    expect(context).toContain('"scheduledTasks": 1');
    expect(context).toContain('"planningConstraints"');
    expect(context).toContain('"nonUrgentOccupiedTaskIds"');
    expect(context).toContain('"calendarPricingSignals"');
    expect(context).toContain('"availabilityPricingSummary"');
    expect(context).toContain('"totalMinor": 34000');
    expect(context).toContain('"unassignedOpenTasks"');
    expect(context).toContain('"assignableStaff"');
    expect(context).toContain('Fix AC drain leak');
    expect(context).toContain('Bryan Henri');
  });

  test('empty calendar pricing objects are treated as missing proof, not usable price signals', () => {
    const constraints = buildPlanningConstraints({
      selectedDate: '2026-05-29',
      rangeStart: '2026-05-29',
      rangeEnd: '2026-06-05',
      scheduledTasks: [],
      unscheduledTasks: [],
      staff: [],
      currentPlan: [],
      reservations: [{
        id: 'rsv-empty',
        propertyCode: 'GBH-C3',
        checkInDate: '2026-05-29',
        checkOutDate: '2026-06-01',
        status: 'confirmed',
        calendarPricing: {
          nightsCached: 0,
          blockedNights: 0,
          totalMinor: null,
          minPriceMinor: null,
          maxPriceMinor: null,
          currencyCode: null,
          syncedAt: null,
        },
      }],
    });

    expect(constraints.calendarPricingSignalCount).toBe(0);
    expect(constraints.calendarPricingSignals).toEqual([]);
    expect(constraints.calendarPricingMissingCount).toBe(1);
    expect(constraints.calendarPricingMissingReservations).toEqual([
      expect.objectContaining({ propertyCode: 'GBH-C3' }),
    ]);
    expect(constraints.availabilityPricingSummary).toContain('none include usable cached calendar-pricing values');
  });

  test('compact fallback context keeps planning signals but limits task detail', () => {
    const context = buildOpsCompactModuleContext({
      context: 'schedule',
      selectedDate: '2026-05-29',
      scheduledTasks: Array.from({ length: 45 }, (_, index) => ({
        id: `task-${index}`,
        title: `Visible task ${index}`,
        propertyCode: index % 2 === 0 ? 'BW-C4' : 'MV-1',
        status: 'scheduled',
        priority: index === 0 ? 'high' : 'medium',
        assigneeIds: [],
        description: `Long internal detail ${index}`.repeat(20),
      })),
      staff: [{ id: 'u-franny', name: 'Franny Henri', role: 'ops_manager', canAssign: true }],
      reservations: [{
        id: 'rsv-1',
        propertyCode: 'BW-C4',
        guestName: 'Guest One',
        checkInDate: '2026-05-28',
        checkOutDate: '2026-05-30',
        status: 'confirmed',
      }],
    });

    expect(context).toContain('"compact": true');
    expect(context).toContain('"unassignedOpenTaskCount": 45');
    expect(context).toContain('"assignableStaffCount": 1');
    expect(context).toContain('"calendarPricingMissingCount": 1');
    expect(context).toContain('"availabilityPricingSummary"');
    expect(context).toContain('"unassignedOpenTasks"');
    expect(context).toContain('Visible task 0');
    expect(context).not.toContain('Long internal detail');
    expect(context.length).toBeLessThan(20000);
  });

  test('system prompt enforces bounded responses and hides raw ids by default', () => {
    const prompt = buildSystemPrompt({
      context: 'schedule',
      composed: { system_message: 'Loaded ops KB.' },
      compact: true,
    });

    expect(prompt).toContain('Use at most 8 bullets and 450 words');
    expect(prompt).toContain('Do not output raw UUIDs');
    expect(prompt).toContain('always include an availability/pricing check');
    expect(prompt).toContain('do not recommend a schedule that leaves a visible open task with no named assignee');
    expect(prompt).toContain('compact fallback mode');
  });

  test('treats checkout day as schedulable after checkout for occupancy rules', () => {
    const reservation = {
      propertyCode: 'VA-1',
      checkInDate: '2026-05-26',
      checkOutDate: '2026-05-28',
      status: 'confirmed',
    };

    expect(reservationBlocksOps(reservation, '2026-05-27')).toBe(true);
    expect(reservationBlocksOps(reservation, '2026-05-28')).toBe(false);
  });

  test('includes middle days in weekly occupancy planning constraints', () => {
    const constraints = buildPlanningConstraints({
      selectedDate: '2026-05-25',
      rangeStart: '2026-05-25',
      rangeEnd: '2026-05-31',
      currentPlan: [],
      scheduledTasks: [],
      unscheduledTasks: [],
      reservations: [{
        id: 'rsv-week',
        propertyCode: 'GBH-C3',
        guestName: 'Guest Week',
        checkInDate: '2026-05-27',
        checkOutDate: '2026-05-29',
        status: 'confirmed',
      }],
    });

    expect(constraints.occupiedPropertyDays).toEqual(expect.arrayContaining([
      expect.objectContaining({ propertyCode: 'GBH-C3', day: '2026-05-27' }),
      expect.objectContaining({ propertyCode: 'GBH-C3', day: '2026-05-28' }),
    ]));
    expect(constraints.occupiedPropertyDays).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ propertyCode: 'GBH-C3', day: '2026-05-29' }),
    ]));
  });

  test('does not treat completed or closed tasks as open planning blockers', () => {
    const constraints = buildPlanningConstraints({
      selectedDate: '2026-05-27',
      rangeStart: '2026-05-27',
      rangeEnd: '2026-05-27',
      currentPlan: [],
      reservations: [{
        id: 'rsv-closed',
        propertyCode: 'VA-1',
        guestName: 'Guest One',
        checkInDate: '2026-05-26',
        checkOutDate: '2026-05-28',
        status: 'confirmed',
      }],
      scheduledTasks: [
        { id: 'closed-1', propertyCode: 'VA-1', status: 'completed', dueDate: '2026-05-27', assigneeIds: [] },
        { id: 'open-1', propertyCode: 'VA-1', status: 'scheduled', dueDate: '2026-05-27', assigneeIds: [] },
      ],
      unscheduledTasks: [
        { id: 'closed-2', propertyCode: 'GBH-C3', status: 'closed', assigneeIds: [] },
        { id: 'open-2', propertyCode: 'GBH-C4', status: 'reported', assigneeIds: [] },
      ],
    });

    expect(constraints.unassignedOpenTaskIds).toEqual(expect.arrayContaining(['open-1', 'open-2']));
    expect(constraints.unassignedOpenTasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'open-1', propertyCode: 'VA-1' }),
      expect.objectContaining({ id: 'open-2', propertyCode: 'GBH-C4' }),
    ]));
    expect(constraints.unassignedOpenTaskIds).not.toEqual(expect.arrayContaining(['closed-1', 'closed-2']));
    expect(constraints.nonUrgentOccupiedTaskIds).toEqual(['open-1']);
  });

  test('flags unscheduled non-urgent work blocked by selected-day occupancy', () => {
    const constraints = buildPlanningConstraints({
      selectedDate: '2026-05-27',
      rangeStart: '2026-05-27',
      rangeEnd: '2026-05-27',
      currentPlan: [],
      staff: [{ id: 'u-catherine', name: 'Catherine Henri', canAssign: true }],
      reservations: [{
        id: 'rsv-1',
        propertyCode: 'BW-C4',
        guestName: 'Guest One',
        checkInDate: '2026-05-26',
        checkOutDate: '2026-05-28',
        status: 'confirmed',
      }],
      scheduledTasks: [],
      unscheduledTasks: [
        { id: 'unscheduled-1', title: 'Aesthetic check', propertyCode: 'BW-C4', status: 'scheduled', priority: 'medium', assigneeIds: [] },
        { id: 'urgent-1', title: 'Guest lock access blocked', propertyCode: 'BW-C4', status: 'reported', priority: 'high', source: 'reported_issue', assigneeIds: [] },
      ],
    });

    expect(constraints.assignableStaff).toEqual([expect.objectContaining({ name: 'Catherine Henri' })]);
    expect(constraints.nonUrgentOccupiedTaskIds).toEqual(['unscheduled-1']);
    expect(constraints.nonUrgentOccupiedTasks).toEqual([
      expect.objectContaining({ id: 'unscheduled-1', title: 'Aesthetic check' }),
    ]);
  });

  test('classifies urgent guest access work as occupancy-eligible', () => {
    expect(guestUrgentTask({
      priority: 'high',
      source: 'reported_issue',
      title: 'Guest lock access blocked',
      description: 'Guest cannot enter the apartment.',
    })).toBe(true);

    expect(guestUrgentTask({
      priority: 'normal',
      source: 'manual',
      title: 'Monthly aesthetic check',
    })).toBe(false);
  });

  test('parses allowed ops action suggestions and strips protocol tags', () => {
    const raw = 'I would draft this first.\n[OPS_ACTION]{"type":"draft_schedule","label":"Draft day","reason":"Visible backlog","confidence":0.81}[/OPS_ACTION]\n[OPS_ACTION]{"type":"delete_everything"}[/OPS_ACTION]';
    const actions = parseOpsActionSuggestions(raw);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      type: 'draft_schedule',
      label: 'Draft day',
      reason: 'Visible backlog',
      confidence: 0.81,
    });
    expect(stripOpsProtocolTags(raw)).toBe('I would draft this first.');
  });

  test('detects useful task signals from operator language', () => {
    const signals = taskSignalsForContext('Can you roster Bryan, schedule AC maintenance, and check owner approval for the repair quote?');
    expect(signals).toEqual(expect.arrayContaining(['schedule', 'roster', 'maintenance', 'owner_approval']));
  });

  test('retries compact prompt for incomplete provider finishes', () => {
    expect(shouldRetryWithCompactOpsPrompt({
      ok: false,
      error: 'incomplete response (finish_reason=MAX_TOKENS)',
      finishReason: 'MAX_TOKENS',
    })).toBe(true);
    expect(shouldRetryWithCompactOpsPrompt({
      ok: false,
      error: 'rate limit',
      finishReason: null,
    })).toBe(false);
  });

  test('starts large roster reviews in compact mode instead of failing full context first', () => {
    expect(shouldUseCompactOpsPromptFirst({
      context: 'roster',
      scheduledTasks: Array.from({ length: 50 }, (_, i) => ({ id: `task-${i}` })),
      reservations: [],
    })).toBe(true);
    expect(shouldUseCompactOpsPromptFirst({
      context: 'roster',
      scheduledTasks: [],
      reservations: Array.from({ length: 70 }, (_, i) => ({ id: `rsv-${i}` })),
    })).toBe(true);
    expect(shouldUseCompactOpsPromptFirst({
      context: 'schedule',
      scheduledTasks: Array.from({ length: 80 }, (_, i) => ({ id: `task-${i}` })),
      reservations: [],
    })).toBe(false);
  });

  test('deterministic fallback gives bounded safe schedule checks after model exhaustion', () => {
    const fallback = buildDeterministicOpsFallback({
      context: 'schedule',
      selectedDate: '2026-05-29',
      scheduledTasks: [{
        id: 'task-1',
        title: 'Post-clean inspection',
        propertyCode: 'BW-C4',
        status: 'scheduled',
        priority: 'medium',
        dueDate: '2026-05-29',
        assigneeIds: [],
      }],
      unscheduledTasks: [{
        id: 'task-2',
        title: 'Restock coffee',
        propertyCode: 'GBH-C3',
        status: 'reported',
        priority: 'medium',
        assigneeIds: [],
      }],
      staff: [{ id: 'u-franny', name: 'Franny Henri', canAssign: true }],
      reservations: [{
        id: 'rsv-1',
        propertyCode: 'BW-C4',
        guestName: 'Guest One',
        checkInDate: '2026-05-28',
        checkOutDate: '2026-05-30',
        status: 'confirmed',
        calendarPricing: {
          nightsCached: 2,
          totalMinor: 32000,
          currencyCode: 'MUR',
        },
      }],
    }, { reason: 'finish_reason=length' });

    expect(fallback.text).toContain('safe planner checks locally');
    expect(fallback.text).toContain('Assignment blocker: 2');
    expect(fallback.text).toContain('Occupancy blocker: 1');
    expect(fallback.text).toContain('Availability/pricing check: 1');
    expect(fallback.text).toContain('Lunch/fairness rule');
    expect(fallback.text).toContain('[OPS_ACTION]');
    expect(fallback.action).toMatchObject({ type: 'draft_schedule' });
    expect(fallback.diagnostics).toMatchObject({
      unassignedOpenTaskCount: 2,
      nonUrgentOccupiedTaskCount: 1,
      calendarPricingSignalCount: 1,
      calendarPricingMissingCount: 0,
      assignableStaffCount: 1,
    });
  });

  test('deterministic fallback explicitly reports missing availability pricing proof', () => {
    const fallback = buildDeterministicOpsFallback({
      context: 'schedule',
      selectedDate: '2026-05-29',
      staff: [{ id: 'u-franny', name: 'Franny Henri', canAssign: true }],
      reservations: [{
        id: 'rsv-empty',
        propertyCode: 'GBH-C3',
        checkInDate: '2026-05-29',
        checkOutDate: '2026-06-01',
        status: 'confirmed',
        calendarPricing: {
          nightsCached: 0,
          blockedNights: 0,
          totalMinor: null,
          minPriceMinor: null,
          maxPriceMinor: null,
          currencyCode: null,
          syncedAt: null,
        },
      }],
    });

    expect(fallback.text).toContain('Availability/pricing check: 1 reservation overlay(s) are loaded');
    expect(fallback.text).toContain('Availability and prices are not proved by the cache');
    expect(fallback.diagnostics).toMatchObject({
      calendarPricingSignalCount: 0,
      calendarPricingMissingCount: 1,
    });
  });

  test('deterministic fallback does not suggest schedule actions without staff', () => {
    const fallback = buildDeterministicOpsFallback({
      context: 'schedule',
      selectedDate: '2026-05-29',
      unscheduledTasks: [{
        id: 'task-1',
        title: 'Aesthetic check',
        propertyCode: 'BW-C4',
        status: 'reported',
        priority: 'medium',
      }],
      staff: [],
      reservations: [],
    });

    expect(fallback.text).not.toContain('[OPS_ACTION]');
    expect(fallback.action).toBeNull();
    expect(fallback.diagnostics.assignableStaffCount).toBe(0);
  });
});
