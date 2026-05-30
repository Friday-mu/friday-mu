'use strict';

const crypto = require('node:crypto');
const express = require('express');
const request = require('supertest');

jest.mock('../database/client', () => ({ query: jest.fn() }));
jest.mock('../realtime', () => ({
  publishFadEvent: jest.fn(() => Promise.resolve()),
}));
jest.mock('./drafts', () => ({
  shouldAutoDraftWebsiteEvent: jest.fn((eventType) => eventType === 'booking.request_submitted'),
  triggerWebsiteDraftGeneration: jest.fn(() => Promise.resolve({ draftId: 'draft-1' })),
}));

const { query } = require('../database/client');
const { publishFadEvent } = require('../realtime');
const { triggerWebsiteDraftGeneration } = require('./drafts');
const { mountWebhook } = require('./webhook');

function app() {
  const server = express();
  server.use(express.raw({ type: '*/*', limit: '1mb' }));
  mountWebhook(server);
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

describe('website inbox webhook', () => {
  beforeEach(() => {
    process.env.FRIDAY_WEBSITE_INBOX_SECRET = 'test-secret';
    query.mockReset();
    publishFadEvent.mockClear();
    triggerWebsiteDraftGeneration.mockClear();
  });

  test('triggers website draft generation for booking inquiries after recording the event', async () => {
    const threadId = '11111111-1111-4111-8111-111111111111';
    const eventId = '22222222-2222-4222-8222-222222222222';
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: threadId }] })
      .mockResolvedValueOnce({ rows: [{ id: eventId }] })
      .mockResolvedValueOnce({ rows: [{ id: 'booking-request-1' }] });

    const rawBody = JSON.stringify({
      event_type: 'booking.request_submitted',
      source: 'website',
      data: {
        reference: 'FBR-TEST-1',
        email: 'guest@example.com',
        name: 'Guest Example',
        residence_slug: 'villa-demo',
      },
    });
    const { timestamp, signature } = signedHeaders(rawBody);

    const res = await request(app())
      .post('/friday-website')
      .set('Content-Type', 'application/json')
      .set('X-Friday-Inbox-Timestamp', timestamp)
      .set('X-Friday-Inbox-Signature', signature)
      .send(rawBody)
      .expect(200);

    expect(res.body).toMatchObject({ status: 'accepted', thread_id: threadId, event_id: eventId });
    expect(triggerWebsiteDraftGeneration).toHaveBeenCalledWith(threadId, eventId);
    expect(publishFadEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'website_inbox.thread_updated',
      payload: expect.objectContaining({ threadId, eventId, eventType: 'booking.request_submitted' }),
    }));
  });

  test('recovers missed website draft generation on duplicate inquiry retries', async () => {
    const threadId = '11111111-1111-4111-8111-111111111111';
    const eventId = '22222222-2222-4222-8222-222222222222';
    const duplicate = new Error('duplicate');
    duplicate.code = '23505';
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: threadId }] })
      .mockRejectedValueOnce(duplicate)
      .mockResolvedValueOnce({ rows: [{ id: eventId }] })
      .mockResolvedValueOnce({ rows: [{ id: 'booking-request-1' }] });

    const rawBody = JSON.stringify({
      event_type: 'booking.request_submitted',
      source: 'website',
      data: {
        reference: 'FBR-TEST-1',
        email: 'guest@example.com',
        name: 'Guest Example',
        residence_slug: 'villa-demo',
      },
    });
    const { timestamp, signature } = signedHeaders(rawBody);

    const res = await request(app())
      .post('/friday-website')
      .set('Content-Type', 'application/json')
      .set('X-Friday-Inbox-Timestamp', timestamp)
      .set('X-Friday-Inbox-Signature', signature)
      .send(rawBody)
      .expect(200);

    expect(res.body).toMatchObject({ status: 'duplicate', thread_id: threadId });
    expect(triggerWebsiteDraftGeneration).toHaveBeenCalledWith(threadId, eventId);
  });

  test('accepts proof uploads without guest email when linked by booking_request_id and does not auto-create reservations', async () => {
    const threadId = '11111111-1111-4111-8111-111111111111';
    const eventId = '33333333-3333-4333-8333-333333333333';
    query
      // resolveThreadId -> sidecar lookup by request id
      .mockResolvedValueOnce({ rows: [{ thread_id: threadId }] })
      // recordEvent -> insert proof event
      .mockResolvedValueOnce({ rows: [{ id: eventId }] })
      // markProofReceived -> ensure sidecar
      .mockResolvedValueOnce({ rows: [{ id: 'booking-request-1' }] })
      // markProofReceived -> update proof fields/status
      .mockResolvedValueOnce({ rows: [{ id: 'booking-request-1' }] });

    const rawBody = JSON.stringify({
      event_type: 'booking.proof_uploaded',
      source: 'website',
      data: {
        event_version: '2026-05-26',
        booking_request_id: 'FBR-TEST-1',
        reference: 'FBR-TEST-1',
        proof_viewer_url: 'https://www.friday.mu/api/proof/view?signed=1',
        file_name: 'proof.png',
        uploaded_at: '2026-05-26T10:15:00.000Z',
        guest: { name: 'Guest Example' },
      },
    });
    const { timestamp, signature } = signedHeaders(rawBody);

    const res = await request(app())
      .post('/friday-website')
      .set('Content-Type', 'application/json')
      .set('X-Friday-Inbox-Timestamp', timestamp)
      .set('X-Friday-Inbox-Signature', signature)
      .send(rawBody)
      .expect(200);

    expect(res.body).toMatchObject({ status: 'accepted', thread_id: threadId, event_id: eventId });
    expect(triggerWebsiteDraftGeneration).not.toHaveBeenCalled();
    expect(query.mock.calls.some((call) => String(call[0]).includes("'create_reservation'"))).toBe(false);
    expect(query.mock.calls.some((call) => String(call[0]).includes("status = CASE"))).toBe(true);
  });
});
