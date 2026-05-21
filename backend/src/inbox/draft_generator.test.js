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
  OPERATOR_DRAFT_LANGUAGE_CONTRACT,
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
});
