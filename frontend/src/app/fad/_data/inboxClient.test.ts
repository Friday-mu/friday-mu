import { describe, expect, it } from 'vitest';

import { transformGmsConversation, transformGmsDraft, usableConversationSummary } from './inboxClient';

describe('transformGmsDraft', () => {
  it('maps FAD send-time translated_content for sent-draft language toggles', () => {
    const draft = transformGmsDraft({
      id: 'draft-1',
      state: 'sent',
      draft_body: 'Thanks, we will check the water supply and update you shortly.',
      translated_content: "Merci, nous allons verifier l'alimentation en eau et vous tenir informee rapidement.",
      confidence: 91,
      created_at: '2026-05-21T08:00:00Z',
      sent_at: '2026-05-21T08:10:00Z',
    });

    expect(draft.body).toBe('Thanks, we will check the water supply and update you shortly.');
    expect(draft.bodyTranslated).toBe("Merci, nous allons verifier l'alimentation en eau et vous tenir informee rapidement.");
    expect(draft.createdAt).toBe('2026-05-21T08:10:00Z');
    expect(draft.sentAt).toBe('2026-05-21T08:10:00Z');
  });
});

describe('conversation summary hygiene', () => {
  it('drops prompt-failure summaries from the inbox subject and preview fallback', () => {
    const badSummary = "I'm ready to help summarize conversations between guests and Friday. However, I don't see a conversation history yet.";
    const thread = transformGmsConversation({
      id: 'conv-1',
      guest_name: 'Andrew Warren',
      conversation_summary: badSummary,
      created_at: '2026-05-21T08:00:00Z',
    });

    expect(usableConversationSummary(badSummary)).toBeUndefined();
    expect(thread.summary).toBeUndefined();
    expect(thread.subject).toBe('(no subject)');
    expect(thread.preview).toBe('');
  });

  it('keeps normal summaries', () => {
    const summary = 'Guest wants to extend the stay and asked about payment timing.';
    expect(usableConversationSummary(summary)).toBe(summary);
  });
});
