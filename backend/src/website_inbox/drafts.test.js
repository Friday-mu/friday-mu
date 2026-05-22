'use strict';

jest.mock('../database/client', () => ({ query: jest.fn() }));

const {
  assertDraftCurrent,
  shouldAutoDraftWebsiteEvent,
} = require('./drafts');

describe('website inbox draft guards', () => {
  test('auto-drafts inquiry-style website events, not proof uploads', () => {
    expect(shouldAutoDraftWebsiteEvent('booking.request_submitted')).toBe(true);
    expect(shouldAutoDraftWebsiteEvent('experience.enquiry_submitted')).toBe(true);
    expect(shouldAutoDraftWebsiteEvent('contact.form_submitted')).toBe(true);
    expect(shouldAutoDraftWebsiteEvent('owner.enquiry_submitted')).toBe(true);
    expect(shouldAutoDraftWebsiteEvent('booking.proof_uploaded')).toBe(false);
  });

  test('accepts a current actionable website draft', () => {
    expect(() => assertDraftCurrent({
      draft: { payload: { state: 'draft_ready', source_event_id: 'event-1' } },
      latestEvent: { id: 'event-1', created_at: '2026-05-22T08:00:00.000Z' },
      latestReply: null,
    })).not.toThrow();
  });

  test('blocks stale website drafts when a newer guest event is latest', () => {
    expect(() => assertDraftCurrent({
      draft: { payload: { state: 'draft_ready', source_event_id: 'event-1' } },
      latestEvent: { id: 'event-2', created_at: '2026-05-22T08:05:00.000Z' },
      latestReply: null,
    })).toThrow('draft_stale');
  });

  test('blocks website drafts after staff has already replied', () => {
    expect(() => assertDraftCurrent({
      draft: { payload: { state: 'draft_ready', source_event_id: 'event-1' } },
      latestEvent: { id: 'event-1', created_at: '2026-05-22T08:00:00.000Z' },
      latestReply: { id: 'reply-1', created_at: '2026-05-22T08:02:00.000Z' },
    })).toThrow('draft_stale');
  });
});
