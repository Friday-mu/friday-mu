'use strict';

const tasksRouter = require('./index');

describe('task list schedule filters', () => {
  test('adds an explicit due-date-null filter for unscheduled queue requests', () => {
    const filters = ['t.tenant_id = $1'];

    tasksRouter._test.appendTaskScheduleFilters({ unscheduled: 'true' }, filters);

    expect(filters).toContain('t.due_date IS NULL');
  });

  test('does not add unscheduled filtering unless requested exactly', () => {
    const filters = ['t.tenant_id = $1'];

    tasksRouter._test.appendTaskScheduleFilters({ unscheduled: 'false' }, filters);

    expect(filters).toEqual(['t.tenant_id = $1']);
  });
});
