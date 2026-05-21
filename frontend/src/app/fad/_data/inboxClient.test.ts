import { describe, expect, it } from 'vitest';

import { transformGmsDraft } from './inboxClient';

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
