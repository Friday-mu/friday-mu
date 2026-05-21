'use strict';

const {
  stripProtocolTags,
  parseDraftUpdate,
  parseTeachingActions,
  selectConsultSurface,
  buildConsultUserMessage,
  buildCompactConsultUserMessage,
  compactConsultSystemPrompt,
  conversationIdForSession,
  isTransientConsultFailure,
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

  test('adds the latest status update guard to Consult prompts for incident update requests', () => {
    const message = buildConsultUserMessage({
      instruction: 'Rewrite the draft',
      context: 'compose',
      conversation: {
        id: 'c1',
        guest_name: 'Floriane Huc',
        property_name: 'RC-15',
        channel: 'airbnb',
        check_in_date: '2026-05-20',
        check_out_date: '2026-05-24',
        num_guests: 2,
        status: 'active',
        notes: null,
      },
      messages: [
        {
          direction: 'inbound',
          sender_name: 'Floriane Huc',
          body: "Bonjour. Nous sommes a l'appartement et il n'y a pas d'eau",
          translated_body: 'Hello. We are at the apartment and there is no water.',
          created_at: '2026-05-20T12:00:00Z',
        },
        {
          direction: 'inbound',
          sender_name: 'Floriane Huc',
          body: 'Bonjour avez vous du nouveau a nous communiquer ?',
          translated_body: 'Hello, do you have any news to communicate to us?',
          created_at: '2026-05-21T12:00:00Z',
        },
      ],
      draftBody: '',
      sessionHistory: [],
      currentSessionSummary: null,
    });

    expect(message).toContain('Latest status update guard');
    expect(message).toContain('No staff note with a confirmed new status');
  });

  test('classifies Kimi timeouts and temporary upstream failures as transient', () => {
    expect(isTransientConsultFailure({ ok: false, error: 'timeout of 45000ms exceeded' })).toBe(true);
    expect(isTransientConsultFailure({ ok: false, error: 'empty response (finish_reason=length)', finishReason: 'length' })).toBe(true);
    expect(isTransientConsultFailure({ ok: false, status: 429, error: 'Too Many Requests' })).toBe(true);
    expect(isTransientConsultFailure({ ok: false, status: 503, error: 'upstream unavailable' })).toBe(true);
    expect(isTransientConsultFailure({ ok: false, status: 401, error: 'invalid api key' })).toBe(false);
    expect(isTransientConsultFailure({ ok: true })).toBe(false);
  });

  test('builds a compact fallback prompt with bounded thread and session context', () => {
    const messages = Array.from({ length: 12 }, (_, i) => ({
      created_at: '2026-06-01T10:00:00Z',
      sender_name: i % 2 ? 'Friday' : 'Guest',
      direction: i % 2 ? 'outbound' : 'inbound',
      body: `Message ${i + 1}`,
    }));
    const sessionHistory = Array.from({ length: 7 }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content: `Consult turn ${i + 1}`,
      sender: 'Ishant',
    }));

    const message = buildCompactConsultUserMessage({
      instruction: 'Please make the draft warmer',
      context: 'compose',
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
      messages,
      draftBody: 'Current draft',
      sessionHistory,
      currentSessionSummary: 'Earlier decision',
    });

    expect(message).toContain('[Compact Consult context]');
    expect(message).toContain('Guest: Guest A');
    expect(message).not.toContain('Message 4');
    expect(message).toContain('Message 5');
    expect(message).toContain('Message 12');
    expect(message).not.toContain('Consult turn 1');
    expect(message).toContain('Consult turn 4');
    expect(message).toContain('Consult turn 7');
    expect(message).toContain('Please make the draft warmer');
  });

  test('compact fallback system prompt preserves Consult draft protocol', () => {
    const prompt = compactConsultSystemPrompt({ context: 'compose', propertyCode: 'BS-1' });
    expect(prompt).toContain('Respond in English');
    expect(prompt).toContain('[DRAFT_UPDATE]');
    expect(prompt).toContain('Property code: BS-1');
  });
});
