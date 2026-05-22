'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../database/client', () => ({ query: jest.fn() }));
jest.mock('../realtime', () => ({ publishFadEvent: jest.fn(() => Promise.resolve()) }));
jest.mock('../design/auth', () => ({
  attachIdentity: (req, _res, next) => {
    req.identity = {
      userId: '99999999-9999-4999-8999-999999999999',
      displayName: 'Judith',
    };
    req.tenantId = '00000000-0000-0000-0000-000000000001';
    next();
  },
}));
jest.mock('./guesty', () => ({ confirmReservation: jest.fn() }));
jest.mock('./resend', () => ({ sendEmail: jest.fn(() => Promise.resolve({ id: 'email-1' })) }));
jest.mock('./drafts', () => ({
  getVisibleDraftsForThread: jest.fn(() => Promise.resolve([])),
  triggerWebsiteDraftGeneration: jest.fn(() => Promise.resolve({})),
  approveWebsiteDraft: jest.fn(),
  reviseWebsiteDraft: jest.fn(),
  rejectWebsiteDraft: jest.fn(),
}));
jest.mock('./ai_handoff', () => ({
  recordAiTakeoverForThread: jest.fn(() => Promise.resolve({
    ok: true,
    handoffId: 'wah_live',
    takeoverState: 'human_takeover',
    aiMayReply: false,
  })),
}));

const { query } = require('../database/client');
const { publishFadEvent } = require('../realtime');
const { sendEmail } = require('./resend');
const { recordAiTakeoverForThread } = require('./ai_handoff');
const { mountThreads } = require('./threads');

function app() {
  const server = express();
  server.use(express.json());
  mountThreads(server);
  return server;
}

describe('website inbox threads', () => {
  beforeEach(() => {
    query.mockReset();
    publishFadEvent.mockClear();
    sendEmail.mockClear();
    recordAiTakeoverForThread.mockClear();
  });

  test('lists website AI handoffs using the whole conversation takeover window', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await request(app()).get('/threads').expect(200);

    const sql = query.mock.calls[0][0];
    expect(sql).toContain('latest_handoff_window');
    expect(sql).toContain("e.payload->>'conversationKey' = latest_handoff.payload->>'conversationKey'");
    expect(sql).toContain('COALESCE(latest_handoff_window.started_at, latest_handoff.created_at)');
  });

  test('queues staff replies to website AI handoffs for live website pickup', async () => {
    const threadId = '11111111-1111-4111-8111-111111111111';
    const messageId = '22222222-2222-4222-8222-222222222222';
    query
      .mockResolvedValueOnce({ rows: [{
        id: threadId,
        guest_email: 'website-ai+session-live@friday.mu',
        guest_email_raw: 'website-ai+session-live@friday.mu',
        guest_name: 'Website AI · Guest',
      }] })
      .mockResolvedValueOnce({ rows: [{ id: messageId, created_at: '2026-05-22T08:10:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app())
      .post(`/threads/${threadId}/reply`)
      .send({ channel: 'website', body: 'Mary is joining now. We can continue here.' })
      .expect(200);

    expect(res.body).toMatchObject({
      ok: true,
      message_id: messageId,
      sent_via: 'website',
      delivery: 'website_live',
    });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(recordAiTakeoverForThread).toHaveBeenCalledWith(expect.objectContaining({
      threadId,
      reason: 'staff_reply_sent',
    }));
    expect(query.mock.calls[1][0]).toContain('INSERT INTO inbox_events');
    expect(JSON.parse(query.mock.calls[1][1][1])).toMatchObject({
      channel: 'website',
      body: 'Mary is joining now. We can continue here.',
      delivery: 'website_live',
      handoff_id: 'wah_live',
    });
    expect(publishFadEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'inbox.message_sent',
      payload: expect.objectContaining({ threadId, messageId, sentVia: 'website' }),
    }));
  });

  test('blocks email replies on website AI handoff threads', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: '11111111-1111-4111-8111-111111111111',
      guest_email: 'website-ai+session-live@friday.mu',
      guest_email_raw: 'website-ai+session-live@friday.mu',
      guest_name: 'Website AI · Guest',
    }] });

    const res = await request(app())
      .post('/threads/11111111-1111-4111-8111-111111111111/reply')
      .send({ channel: 'email', body: 'Hello' })
      .expect(409);

    expect(res.body.error).toBe('website_ai_handoff_reply_requires_website_channel');
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
