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

  test('adds field-related reported issue scope for a valid field user', () => {
    const filters = ['t.tenant_id = $1'];
    const params = ['tenant-1'];
    const nextIndex = tasksRouter._test.appendTaskFieldRelatedFilter(
      { field_related: 'true' },
      filters,
      params,
      2,
      { userId: '11111111-1111-4111-8111-111111111111' },
    );

    expect(nextIndex).toBe(3);
    expect(params).toEqual(['tenant-1', '11111111-1111-4111-8111-111111111111']);
    expect(filters.join(' ')).toContain('t.requester_user_id = $2');
    expect(filters.join(' ')).toContain('$2::uuid = ANY(mt.assignee_user_ids)');
  });

  test('blocks field-related scope when the field user id is missing or invalid', () => {
    const filters = ['t.tenant_id = $1'];
    const params = ['tenant-1'];
    const nextIndex = tasksRouter._test.appendTaskFieldRelatedFilter(
      { field_related: 'true' },
      filters,
      params,
      2,
      { userId: 'not-a-uuid' },
    );

    expect(nextIndex).toBe(2);
    expect(params).toEqual(['tenant-1']);
    expect(filters).toContain('FALSE');
  });
});
