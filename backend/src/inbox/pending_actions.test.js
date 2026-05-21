'use strict';

const {
  shapePendingAction,
} = require('./pending_actions')._test;

describe('pending action proposal helpers', () => {
  test('shapes a pending action proposal without creating task fields', () => {
    expect(shapePendingAction({
      id: 'pa-1',
      conversation_id: 'conv-1',
      guest_name: 'Guest A',
      property_code: 'BS-1',
      action_text: 'Follow up with guest',
      status: 'pending',
      detected_at: '2026-05-21T00:00:00.000Z',
      due_by: '2026-05-22T00:00:00.000Z',
      urgency: 'high',
      owner: 'team',
      category: 'guest_communication',
      source: 'auto',
      fad_task_id: null,
      conversation_guest_name: 'Guest A',
      conversation_channel: 'whatsapp',
      conversation_status: 'active',
      conversation_last_message_at: '2026-05-21T00:00:00.000Z',
    })).toEqual({
      id: 'pa-1',
      conversation_id: 'conv-1',
      guest_name: 'Guest A',
      property_code: 'BS-1',
      action_text: 'Follow up with guest',
      status: 'pending',
      detected_at: '2026-05-21T00:00:00.000Z',
      due_by: '2026-05-22T00:00:00.000Z',
      urgency: 'high',
      owner: 'team',
      category: 'guest_communication',
      source: 'auto',
      fad_task_id: null,
      conversation: {
        guest_name: 'Guest A',
        channel: 'whatsapp',
        status: 'active',
        last_message_at: '2026-05-21T00:00:00.000Z',
      },
    });
  });
});
