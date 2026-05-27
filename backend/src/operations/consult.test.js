'use strict';

const {
  buildOpsModuleContext,
  buildPlanningConstraints,
  guestUrgentTask,
  parseOpsActionSuggestions,
  reservationBlocksOps,
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
    expect(context).toContain('"totalMinor": 34000');
    expect(context).toContain('Fix AC drain leak');
    expect(context).toContain('Bryan Henri');
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
});
