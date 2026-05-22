'use strict';

jest.mock('../ai/translate', () => ({
  translateText: jest.fn(),
}));

const { translateText } = require('../ai/translate');
const {
  ensureOperatorEnglishDraft,
  languageRoot,
  isTransientDraftFailure,
  buildDraftUserMessage,
  compactHistoryMessages,
  compactDraftSystemPrompt,
  latestGuestTurnMessages,
  latestGuestTurnPromptBlock,
  OPERATOR_DRAFT_LANGUAGE_CONTRACT,
  isGuestStatusUpdateRequest,
  statusUpdateSafetyInstruction,
  applyStatusUpdateSafety,
} = require('./draft_generator');

describe('draft generator language policy', () => {
  beforeEach(() => {
    translateText.mockReset();
  });

  test('normalizes non-English generated drafts back to English for operators', async () => {
    translateText.mockResolvedValue({
      sourceLang: 'fr',
      translated: 'Thank you for your message. We are checking the water supply and will come back to you shortly.',
    });

    const result = await ensureOperatorEnglishDraft(
      "Merci Floriane. Nous allons bien noter votre accord. Nous passerons verifier l'etat de l'alimentation en eau.",
      {
        message: { original_language: 'fr' },
        conversation: { id: 'conv-1', last_detected_language: 'fr' },
      },
    );

    expect(result).toBe('Thank you for your message. We are checking the water supply and will come back to you shortly.');
    expect(translateText).toHaveBeenCalledWith(expect.any(String), { conversationId: 'conv-1' });
  });

  test('does not spend translation calls for English guest threads', async () => {
    const result = await ensureOperatorEnglishDraft('Thanks, we will check and confirm shortly.', {
      message: { original_language: 'en-US' },
      conversation: { id: 'conv-2', last_detected_language: 'en' },
    });

    expect(result).toBe('Thanks, we will check and confirm shortly.');
    expect(translateText).not.toHaveBeenCalled();
  });

  test('keeps the original draft if normalization cannot produce an English translation', async () => {
    translateText.mockResolvedValue({
      sourceLang: null,
      translated: null,
    });

    const frenchDraft = 'Merci, nous allons verifier et revenir vers vous.';
    const result = await ensureOperatorEnglishDraft(frenchDraft, {
      message: { original_language: 'fr' },
      conversation: { id: 'conv-3', last_detected_language: 'fr' },
    });

    expect(result).toBe(frenchDraft);
  });

  test('language contract explicitly separates operator draft language from send language', () => {
    expect(languageRoot('fr-FR')).toBe('fr');
    expect(OPERATOR_DRAFT_LANGUAGE_CONTRACT).toContain('must always be in English');
    expect(OPERATOR_DRAFT_LANGUAGE_CONTRACT).toContain('translates the English operator draft back into the guest');
  });
});

describe('draft generator compact fallback policy', () => {
  test('treats length and timeout failures as compact-retryable', () => {
    expect(isTransientDraftFailure({ ok: false, finishReason: 'length' })).toBe(true);
    expect(isTransientDraftFailure({ ok: false, error: 'timeout of 90000ms exceeded' })).toBe(true);
    expect(isTransientDraftFailure({ ok: false, status: 503, error: 'upstream unavailable' })).toBe(true);
    expect(isTransientDraftFailure({ ok: false, status: 401, error: 'invalid api key' })).toBe(false);
  });

  test('compacts history while preserving the triggering message', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      id: `m-${i + 1}`,
      direction: i % 2 === 0 ? 'inbound' : 'outbound',
      body: `Message ${i + 1} ` + 'x'.repeat(1200),
      sender_name: i % 2 === 0 ? 'Guest' : 'Friday',
      created_at: `2026-05-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
    }));

    const compact = compactHistoryMessages(rows, 'm-5');
    expect(compact).toContain('Message 1');
    expect(compact).toContain('Message 5');
    expect(compact).toContain('Message 20');
    expect(compact).toContain('[truncated]');
    expect(compact.length).toBeLessThan(14000);
  });

  test('builds a stable draft user message from context, history, and task', () => {
    const prompt = buildDraftUserMessage({
      ctxLines: ['Property: LV-10', 'Guests: 2'],
      history: 'Guest: Hello',
      taskDirective: 'DRAFT A REPLY.',
    });

    expect(prompt).toContain('CONVERSATION CONTEXT:');
    expect(prompt).toContain('- Property: LV-10');
    expect(prompt).toContain('PREVIOUS MESSAGES:');
    expect(prompt).toContain('DRAFT A REPLY.');
  });

  test('compact fallback system prompt keeps compact KB and learning context', () => {
    const prompt = compactDraftSystemPrompt({
      propertyCode: 'RC-15',
      category: 'request',
      compactKnowledgeAppendix: '\n\n[Compact KB + Learning Context]\nT1: Do not invent operational status updates.',
    });

    expect(prompt).toContain('Property code: RC-15');
    expect(prompt).toContain('Trigger category: request');
    expect(prompt).toContain('Compact KB + Learning Context');
    expect(prompt).toContain('Do not invent operational status updates');
  });
});

describe('draft generator latest guest turn handling', () => {
  test('keeps short inbound bursts together for the drafting prompt', () => {
    const messages = [
      {
        id: 'm-1',
        direction: 'outbound',
        body: 'We can arrange that.',
        sender_name: 'Friday',
        created_at: '2026-05-22T08:00:00Z',
      },
      {
        id: 'm-2',
        direction: 'inbound',
        body: 'Can we check in at 1pm?',
        sender_name: 'Guest',
        created_at: '2026-05-22T08:01:00Z',
      },
      {
        id: 'm-3',
        direction: 'inbound',
        body: 'Sorry, I meant 2pm',
        sender_name: 'Guest',
        created_at: '2026-05-22T08:01:20Z',
      },
      {
        id: 'm-4',
        direction: 'inbound',
        body: '🙏',
        sender_name: 'Guest',
        created_at: '2026-05-22T08:01:30Z',
      },
    ];

    const turn = latestGuestTurnMessages(messages, 'm-4');
    const block = latestGuestTurnPromptBlock(messages, 'm-4');

    expect(turn.map((m) => m.id)).toEqual(['m-2', 'm-3', 'm-4']);
    expect(block).toContain('Latest guest turn');
    expect(block).toContain('I meant 2pm');
    expect(block).toContain('Emojis are tone');
  });

  test('stops the guest turn at the latest Friday reply', () => {
    const messages = [
      { id: 'm-1', direction: 'inbound', body: 'First question', created_at: '2026-05-22T08:00:00Z' },
      { id: 'm-2', direction: 'outbound', body: 'Answered', created_at: '2026-05-22T08:01:00Z' },
      { id: 'm-3', direction: 'inbound', body: 'Follow-up', created_at: '2026-05-22T08:02:00Z' },
    ];

    expect(latestGuestTurnMessages(messages, 'm-3').map((m) => m.id)).toEqual(['m-3']);
  });
});

describe('draft generator status update safety', () => {
  const latestMessage = {
    id: 'm-latest',
    direction: 'inbound',
    body: 'Bonjour avez vous du nouveau a nous communiquer ?',
    translated_body: 'Hello, do you have any news to communicate to us?',
  };
  const waterThread = [
    {
      direction: 'inbound',
      body: "Bonjour. Nous sommes a l'appartement et il n'y a pas d'eau",
      translated_body: 'Hello. We are at the apartment and there is no water.',
    },
    {
      direction: 'outbound',
      body: "Nous vérifions avec le syndic et vous tiendrons informée.",
      translated_body: 'We are checking with the building management and will keep you informed.',
    },
    latestMessage,
  ];

  test('detects French and English guest requests for new status', () => {
    expect(isGuestStatusUpdateRequest('Bonjour avez vous du nouveau a nous communiquer ?')).toBe(true);
    expect(isGuestStatusUpdateRequest('Do you have any update for us?')).toBe(true);
    expect(isGuestStatusUpdateRequest('Thanks, yes you can access the apartment')).toBe(false);
  });

  test('adds a hard guard when guest asks for updates on an incident without staff notes', () => {
    const guard = statusUpdateSafetyInstruction({
      message: latestMessage,
      conversation: { notes: null },
      messages: waterThread,
    });
    expect(guard).toContain('Latest status update guard');
    expect(guard).toContain('Do not convert old thread context into a new update');
  });

  test('replaces unsafe invented progress with a holding reply and lowers confidence', () => {
    const result = applyStatusUpdateSafety(
      'Hello Floriane, we have been informed that access has been granted and the issue should be resolved before your return tonight.',
      {
        message: latestMessage,
        conversation: { guest_name: 'Floriane Huc', notes: null },
        messages: waterThread,
      },
    );

    expect(result.applied).toBe(true);
    expect(result.confidenceCeiling).toBe(55);
    expect(result.draftBody).toContain('Hello Floriane');
    expect(result.draftBody).toContain('checking the water-supply status');
    expect(result.draftBody).toContain('unconfirmed update');
    expect(result.draftBody).not.toContain('before your return tonight');
  });

  test('allows specific updates when staff notes provide confirmed fresh status', () => {
    const result = applyStatusUpdateSafety(
      'Hello Floriane, the building manager confirmed the supply has been restored.',
      {
        message: latestMessage,
        conversation: { notes: 'Confirmed by syndic at 16:00: water restored.' },
        messages: waterThread,
      },
    );
    expect(result.applied).toBe(false);
  });
});
