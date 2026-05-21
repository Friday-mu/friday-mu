'use strict';

const {
  mapUrgencyToPriority,
  dueParts,
  buildTaskTitle,
  buildTaskDescription,
} = require('./pending_actions')._test;

describe('pending action task bridge helpers', () => {
  test('maps action urgency to task priority', () => {
    expect(mapUrgencyToPriority('urgent')).toBe('urgent');
    expect(mapUrgencyToPriority('critical')).toBe('urgent');
    expect(mapUrgencyToPriority('high')).toBe('high');
    expect(mapUrgencyToPriority('low')).toBe('low');
    expect(mapUrgencyToPriority('medium')).toBe('medium');
    expect(mapUrgencyToPriority(null)).toBe('medium');
  });

  test('derives stable due date/time parts', () => {
    expect(dueParts('2026-06-01T09:30:00.000Z')).toEqual({
      dueDate: '2026-06-01',
      dueTime: '09:30',
    });
    expect(dueParts(null)).toEqual({ dueDate: null, dueTime: null });
  });

  test('builds concise titles from long pending action text', () => {
    const title = buildTaskTitle('x'.repeat(140));
    expect(title).toHaveLength(90);
    expect(title.endsWith('...')).toBe(true);
  });

  test('keeps source context in generated task description', () => {
    const description = buildTaskDescription({
      action_text: 'Follow up with guest',
      guest_name: 'Guest A',
      conversation_id: 'conv-1',
      category: 'guest_communication',
      owner: 'team',
    });
    expect(description).toContain('Inbox AI pending action');
    expect(description).toContain('Follow up with guest');
    expect(description).toContain('Guest A');
    expect(description).toContain('conv-1');
  });
});
