import { describe, expect, it } from 'vitest';

import type { InboxDraft, InboxMessage } from './fixtures';
import { sentDraftHasMatchingOutbound } from './inboxTimeline';

describe('sentDraftHasMatchingOutbound', () => {
  const sentDraft: InboxDraft = {
    id: 'draft-1',
    state: 'sent',
    body: 'The tourist tax is already included in the total Airbnb price, so there is no separate cash collection on arrival.',
    confidence: 0.9,
    createdAt: '2026-05-21T06:47:30.462Z',
    sentAt: '2026-05-21T06:47:30.462Z',
  };

  it('hides sent drafts when the real outbound message row already exists', () => {
    const messages: InboxMessage[] = [{
      from: 'us',
      name: 'Ishant',
      time: '2026-05-21T06:47:30.466Z',
      body: 'The tourist tax is already included in the total Airbnb price, so there is no separate cash collection on arrival.',
      viaSystem: 'FAD',
      viaChannel: 'Airbnb',
    }];

    expect(sentDraftHasMatchingOutbound(sentDraft, messages)).toBe(true);
  });

  it('does not hide historical sent drafts when no matching outbound exists nearby', () => {
    const messages: InboxMessage[] = [{
      from: 'us',
      name: 'Ishant',
      time: '2026-05-21T07:10:30.466Z',
      body: 'A different outbound reply.',
    }];

    expect(sentDraftHasMatchingOutbound(sentDraft, messages)).toBe(false);
  });

  it('matches against translated sent content when the wire message is not English', () => {
    const draft: InboxDraft = {
      ...sentDraft,
      body: 'Thanks, we will check the water supply and update you shortly.',
      bodyTranslated: "Merci, nous allons verifier l'alimentation en eau et vous tenir informee rapidement.",
    };
    const messages: InboxMessage[] = [{
      from: 'us',
      name: 'Ishant',
      time: '2026-05-21T06:47:30.466Z',
      body: "Merci, nous allons verifier l'alimentation en eau et vous tenir informee rapidement.",
    }];

    expect(sentDraftHasMatchingOutbound(draft, messages)).toBe(true);
  });

  it('hides same-second FAD outbound rows even when the operator edited text before send', () => {
    const draft: InboxDraft = {
      ...sentDraft,
      body: 'Hi Lubna, the exact address is Avenue Des Toucans, 90502 Flic en Flac, Mauritius. The building is part of the Royal Coast residences. Warm regards, Friday Retreats',
    };
    const messages: InboxMessage[] = [{
      from: 'us',
      name: 'Ishant',
      time: '2026-05-21T06:47:30.466Z',
      body: 'Hi Lubna, the exact address is Avenue Des Toucans, 90502 Flic en Flac, Mauritius. The building is part of the Residence Camelia. Warm regards, Friday Retreats',
      viaSystem: 'FAD',
    }];

    expect(sentDraftHasMatchingOutbound(draft, messages)).toBe(true);
  });
});
