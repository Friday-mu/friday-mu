'use strict';

const {
  buildOpsModuleContext,
  parseOpsActionSuggestions,
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
    expect(context).toContain('Fix AC drain leak');
    expect(context).toContain('Bryan Henri');
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
