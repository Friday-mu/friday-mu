'use strict';

const {
  safeConversationSummary,
  hasSummaryTopicDrift,
} = require('./summary_quality');

describe('conversation summary quality guard', () => {
  test('drops stale check-in summary once recent messages are about a water incident', () => {
    const summary = 'Guest Floriane confirmed she will arrive in the late afternoon. Friday still needs to send check-in instructions.';
    const messages = [
      {
        body: "Bonjour. Nous sommes a l'appartement et il n'y a pas d'eau",
        translated_body: 'Hello. We are at the apartment and there is no water.',
      },
      {
        body: 'Bonjour avez vous du nouveau a nous communiquer ?',
        translated_body: 'Hello, do you have any news to communicate to us?',
      },
    ];

    expect(hasSummaryTopicDrift(summary, messages)).toBe(true);
    expect(safeConversationSummary(summary, { messages })).toBeNull();
  });

  test('keeps a summary when it matches the active incident topic', () => {
    const summary = 'Guest reported no water in the apartment and Friday is checking with the building management.';
    const messages = [
      {
        body: 'Bonjour avez vous du nouveau a nous communiquer ?',
        translated_body: 'Hello, do you have any news to communicate to us about the water?',
      },
    ];

    expect(hasSummaryTopicDrift(summary, messages)).toBe(false);
    expect(safeConversationSummary(summary, { messages })).toBe(summary);
  });
});
