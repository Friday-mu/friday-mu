'use strict';

const crypto = require('node:crypto');
const express = require('express');
const request = require('supertest');

jest.mock('../database/client', () => ({ query: jest.fn() }));
jest.mock('../realtime', () => ({
  publishFadEvent: jest.fn(() => Promise.resolve()),
}));

const { query } = require('../database/client');
const { publishFadEvent } = require('../realtime');
const { mountAiHandoff, _test } = require('./ai_handoff');

function app() {
  const server = express();
  server.use(express.raw({ type: '*/*', limit: '1mb' }));
  mountAiHandoff(server);
  return server;
}

function signedHeaders(rawBody, secret = 'test-secret') {
  const timestamp = String(Date.now());
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');
  return { timestamp, signature };
}

describe('website AI handoff', () => {
  beforeEach(() => {
    process.env.FRIDAY_WEBSITE_INBOX_SECRET = 'test-secret';
    query.mockReset();
    publishFadEvent.mockClear();
  });

  test('sanitizes to summary plus the latest eight transcript messages', () => {
    const parsed = _test.parseEnvelope({
      source: 'friday-website',
      surface: 'guest',
      pageUrl: 'https://friday.mu/en',
      locale: 'en',
      visitorTurn: 'Need help',
      transcriptTail: Array.from({ length: 10 }, (_, index) => ({ role: 'user', content: `m${index}` })),
      conversationSummary: 'Summary',
      extracted: { property: 'Grand Baie' },
      toolsUsed: ['availability', 'availability'],
      confidence: 'low',
      escalationReason: 'Needs human context',
      recommendedNextAction: 'Take over',
      createdAt: '2026-05-22T08:00:00.000Z',
    });

    expect(parsed.envelope.transcriptTail).toHaveLength(8);
    expect(parsed.envelope.transcriptTail[0].content).toBe('m2');
    expect(parsed.envelope.toolsUsed).toEqual(['availability']);
    expect(parsed.handoffId).toMatch(/^wah_/);
  });

  test('accepts a signed handoff and publishes staff-visible events', async () => {
    const threadId = '11111111-1111-4111-8111-111111111111';
    const eventId = '22222222-2222-4222-8222-222222222222';
    query
      .mockResolvedValueOnce({ rows: [{ id: threadId }] })
      .mockResolvedValueOnce({ rows: [{ id: eventId, created_at: '2026-05-22T08:00:01.000Z' }] })
      .mockResolvedValueOnce({ rows: [{ started_at: '2026-05-22T08:00:01.000Z' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ started_at: '2026-05-22T08:00:01.000Z' }] })
      .mockResolvedValueOnce({ rows: [] });

    const rawBody = JSON.stringify({
      source: 'friday-website',
      surface: 'owner',
      pageUrl: 'https://friday.mu/en/owners',
      locale: 'en',
      visitorTurn: 'Can I self-manage but list on Friday?',
      transcriptTail: [{ role: 'user', content: 'Can I self-manage but list on Friday?' }],
      conversationSummary: 'Owner asks about self-managed website listing.',
      extracted: { bedrooms: '3', area: 'Tamarin' },
      toolsUsed: ['owner-terms'],
      confidence: 'medium',
      escalationReason: 'Selective commercial decision',
      recommendedNextAction: 'Human should review owner fit',
      createdAt: '2026-05-22T08:00:00.000Z',
    });
    const { timestamp, signature } = signedHeaders(rawBody);

    const res = await request(app())
      .post('/friday-website/ai-handoff')
      .set('Content-Type', 'application/json')
      .set('X-Friday-Inbox-Timestamp', timestamp)
      .set('X-Friday-Inbox-Signature', signature)
      .send(rawBody)
      .expect(200);

    expect(res.body).toMatchObject({
      status: 'accepted',
      eventId,
      threadId,
      conversationId: `web-${threadId}`,
      takeover: { takeoverState: 'ai_active', aiMayReply: true },
    });
    expect(query.mock.calls[1][0]).toContain('INSERT INTO inbox_events');
    expect(query.mock.calls[1][1][2]).toBe('website.ai_handoff');
    expect(publishFadEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'website_ai.handoff_received',
      payload: expect.objectContaining({ threadId, eventId, surface: 'owner' }),
    }));
  });

  test('preserves human takeover across newer handoffs in the same website conversation', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ started_at: '2026-05-22T08:00:01.000Z' }] })
      .mockResolvedValueOnce({ rows: [{
        id: '33333333-3333-4333-8333-333333333333',
        event_type: 'website.ai_handoff_takeover',
        source: 'fad',
        payload: { takeoverState: 'human_takeover' },
        created_at: '2026-05-22T08:02:00.000Z',
      }] });

    const state = await _test.takeoverStateForHandoff({
      id: '22222222-2222-4222-8222-222222222222',
      thread_id: '11111111-1111-4111-8111-111111111111',
      created_at: '2026-05-22T08:05:00.000Z',
      payload: { handoffId: 'wah_new', conversationKey: 'session-stable' },
    });

    expect(state).toMatchObject({ takeoverState: 'human_takeover', aiMayReply: false });
    expect(query.mock.calls[1][1]).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '2026-05-22T08:00:01.000Z',
      'website.ai_handoff_takeover',
      'staff.reply_sent',
    ]);
  });

  test('records signed visitor follow-up messages for live handoff threads', async () => {
    const handoffId = 'wah_live';
    const threadId = '11111111-1111-4111-8111-111111111111';
    const eventId = '44444444-4444-4444-8444-444444444444';
    query
      .mockResolvedValueOnce({ rows: [{
        id: '22222222-2222-4222-8222-222222222222',
        thread_id: threadId,
        reference: `website-ai:${handoffId}`,
        payload: { handoffId, conversationKey: 'session-live' },
        created_at: '2026-05-22T08:00:01.000Z',
      }] })
      .mockResolvedValueOnce({ rows: [{ id: eventId, created_at: '2026-05-22T08:03:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ started_at: '2026-05-22T08:00:01.000Z' }] })
      .mockResolvedValueOnce({ rows: [{
        id: '33333333-3333-4333-8333-333333333333',
        event_type: 'website.ai_handoff_takeover',
        source: 'fad',
        payload: {},
        created_at: '2026-05-22T08:02:00.000Z',
      }] });

    const rawBody = JSON.stringify({
      handoffId,
      messageId: 'site-msg-1',
      body: 'Are you still there?',
      createdAt: '2026-05-22T08:03:00.000Z',
    });
    const { timestamp, signature } = signedHeaders(rawBody);

    const res = await request(app())
      .post('/friday-website/ai-handoff/visitor-message')
      .set('Content-Type', 'application/json')
      .set('X-Friday-Inbox-Timestamp', timestamp)
      .set('X-Friday-Inbox-Signature', signature)
      .send(rawBody)
      .expect(200);

    expect(res.body).toMatchObject({
      status: 'accepted',
      handoffId,
      threadId,
      eventId,
      takeoverState: 'human_takeover',
      aiMayReply: false,
    });
    expect(query.mock.calls[1][0]).toContain('INSERT INTO inbox_events');
    expect(query.mock.calls[1][1][2]).toBe('website.visitor_message');
    expect(publishFadEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'website_ai.visitor_message_received',
      payload: expect.objectContaining({ threadId, handoffId, eventId }),
    }));
  });

  test('reports duplicate visitor follow-up messages truthfully', async () => {
    const handoffId = 'wah_live';
    const threadId = '11111111-1111-4111-8111-111111111111';
    const eventId = '44444444-4444-4444-8444-444444444444';
    const duplicate = new Error('duplicate');
    duplicate.code = '23505';
    query
      .mockResolvedValueOnce({ rows: [{
        id: '22222222-2222-4222-8222-222222222222',
        thread_id: threadId,
        reference: `website-ai:${handoffId}`,
        payload: { handoffId, conversationKey: 'session-live' },
        created_at: '2026-05-22T08:00:01.000Z',
      }] })
      .mockRejectedValueOnce(duplicate)
      .mockResolvedValueOnce({ rows: [{ id: eventId, created_at: '2026-05-22T08:03:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ started_at: '2026-05-22T08:00:01.000Z' }] })
      .mockResolvedValueOnce({ rows: [] });

    const rawBody = JSON.stringify({
      handoffId,
      messageId: 'site-msg-1',
      body: 'Are you still there?',
      createdAt: '2026-05-22T08:03:00.000Z',
    });
    const { timestamp, signature } = signedHeaders(rawBody);

    const res = await request(app())
      .post('/friday-website/ai-handoff/visitor-message')
      .set('Content-Type', 'application/json')
      .set('X-Friday-Inbox-Timestamp', timestamp)
      .set('X-Friday-Inbox-Signature', signature)
      .send(rawBody)
      .expect(200);

    expect(res.body).toMatchObject({
      status: 'duplicate',
      handoffId,
      threadId,
      eventId,
      takeoverState: 'ai_active',
      aiMayReply: true,
    });
  });

  test('rejects unsigned handoffs', async () => {
    const rawBody = JSON.stringify({ source: 'friday-website' });
    await request(app())
      .post('/friday-website/ai-handoff')
      .set('Content-Type', 'application/json')
      .send(rawBody)
      .expect(401);
  });
});
