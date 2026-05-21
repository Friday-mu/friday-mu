'use strict';

const {
  stripProtocolTags,
  parseDraftUpdate,
  parseTeachingActions,
  selectConsultSurface,
  buildConsultUserMessage,
  conversationIdForSession,
} = require('./consult')._test;

describe('FAD-native Consult helpers', () => {
  test('extracts draft updates and strips protocol tags from visible response', () => {
    const raw = 'Done.\n[DRAFT_UPDATE]Hello guest\nThanks[/DRAFT_UPDATE]\n[TEACH]{"action":"create","instruction":"Keep it short"}[/TEACH]';
    expect(parseDraftUpdate(raw)).toBe('Hello guest\nThanks');
    expect(stripProtocolTags(raw)).toBe('Done.');
  });

  test('parses teaching JSON and resolves T-number references to UUIDs', () => {
    const raw = '[TEACH]{"action":"flag_conflict","conflicting":"T2","instruction":"Mention pool hours","scope":"property","property_code":"BS-1","reason":"new operator rule"}[/TEACH]';
    const actions = parseTeachingActions(raw, { T2: '11111111-1111-4111-8111-111111111111' });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      action: 'flag_conflict',
      instruction: 'Mention pool hours',
      scope: 'property',
      propertyCode: 'BS-1',
      conflictingTeachingId: '11111111-1111-4111-8111-111111111111',
      conflictingTeachingIndex: 'T2',
    });
  });

  test('maps Consult contexts onto FAD knowledge surfaces', () => {
    expect(selectConsultSurface('compose')).toBe('inbox-drafts');
    expect(selectConsultSurface('pending_action')).toBe('pending-actions');
    expect(selectConsultSurface('message_review')).toBe('inbox-advisory');
    expect(selectConsultSurface('learning_candidate')).toBe('learning-analyzer');
  });

  test('only UUID conversation ids are persisted on consult sessions', () => {
    expect(conversationIdForSession('6844ad5c-1e74-45e1-95d0-f2ad4e290bca')).toBe('6844ad5c-1e74-45e1-95d0-f2ad4e290bca');
    expect(conversationIdForSession('web-a76f8a9d-fea8-4214-88ed-912dc91e6fb9')).toBeNull();
  });

  test('builds a conversation-bound user prompt with draft and session context', () => {
    const message = buildConsultUserMessage({
      instruction: 'Make it shorter',
      context: 'revision',
      conversation: {
        id: 'c1',
        guest_name: 'Guest A',
        property_name: 'BS-1',
        channel: 'whatsapp',
        check_in_date: '2026-06-01',
        check_out_date: '2026-06-08',
        num_guests: 2,
        status: 'active',
      },
      messages: [],
      draftBody: 'Long draft',
      sessionHistory: [{ role: 'user', content: 'Earlier ask', sender: 'Ishant' }],
      currentSessionSummary: 'Prior decision',
    });
    expect(message).toContain('Guest: Guest A');
    expect(message).toContain('[Current working draft]');
    expect(message).toContain('Long draft');
    expect(message).toContain('Prior decision');
    expect(message).toContain('Make it shorter');
  });
});
