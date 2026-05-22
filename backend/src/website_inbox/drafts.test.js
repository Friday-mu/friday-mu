'use strict';

jest.mock('../database/client', () => ({ query: jest.fn() }));
jest.mock('../realtime', () => ({ publishFadEvent: jest.fn(() => Promise.resolve()) }));

const {
  assertDraftCurrent,
  approveWebsiteDraft,
  shouldAutoDraftWebsiteEvent,
} = require('./drafts');
const { query } = require('../database/client');
const { publishFadEvent } = require('../realtime');

describe('website inbox draft guards', () => {
  beforeEach(() => {
    query.mockReset();
    publishFadEvent.mockClear();
  });

  test('auto-drafts inquiry-style website events and post-takeover visitor messages, not proof uploads', () => {
    expect(shouldAutoDraftWebsiteEvent('booking.request_submitted')).toBe(true);
    expect(shouldAutoDraftWebsiteEvent('experience.enquiry_submitted')).toBe(true);
    expect(shouldAutoDraftWebsiteEvent('contact.form_submitted')).toBe(true);
    expect(shouldAutoDraftWebsiteEvent('owner.enquiry_submitted')).toBe(true);
    expect(shouldAutoDraftWebsiteEvent('website.visitor_message')).toBe(true);
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

  test('approves website AI handoff drafts into the live website channel after human takeover', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'thread-1', guest_email: 'website-ai+session@friday.mu' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'draft-1',
          payload: { state: 'draft_ready', source_event_id: 'event-1', draft_body: 'Hello' },
          created_at: '2026-05-22T08:01:00.000Z',
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'event-1', created_at: '2026-05-22T08:00:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'handoff-1',
          reference: 'website-ai:wah_live',
          payload: { handoffId: 'wah_live', conversationKey: 'session-live' },
          created_at: '2026-05-22T08:00:00.000Z',
        }],
      })
      .mockResolvedValueOnce({ rows: [{ started_at: '2026-05-22T08:00:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'takeover-1', created_at: '2026-05-22T08:02:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'reply-1', created_at: '2026-05-22T08:03:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'draft-1', payload: { state: 'sent' }, created_at: '2026-05-22T08:01:00.000Z' }] });

    const result = await approveWebsiteDraft({
      threadId: 'thread-1',
      draftId: 'draft-1',
      body: 'Hello',
      channel: 'website',
      identity: { userId: 'user-1' },
    });

    expect(result).toMatchObject({
      ok: true,
      message_id: 'reply-1',
      sent_via: 'website',
      delivery: 'website_live',
      takeoverState: 'human_takeover',
      aiMayReply: false,
    });
    expect(query.mock.calls[9][0]).toContain('staff.reply_sent');
    expect(JSON.parse(query.mock.calls[9][1][1])).toMatchObject({
      channel: 'website',
      body: 'Hello',
      delivery: 'website_live',
      draft_id: 'draft-1',
      handoff_id: 'wah_live',
    });
    expect(publishFadEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'inbox.message_sent',
      payload: expect.objectContaining({ threadId: 'thread-1', draftId: 'draft-1', sentVia: 'website' }),
    }));
  });
});
