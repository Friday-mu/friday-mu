'use strict';

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(() => Promise.resolve()),
}));

jest.mock('../database/client', () => ({
  query: jest.fn(),
}));

const webpush = require('web-push');
const { query } = require('../database/client');
const { router, sendPushToUsers, _test } = require('./push');

const JWT_SECRET = 'push-test-secret';
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function app() {
  const server = express();
  server.use(express.json());
  server.use('/api/push', router);
  return server;
}

function token() {
  return jwt.sign({
    user_id: USER_ID,
    role: 'admin',
    username: 'ishant',
    display_name: 'Ishant Ayadassen',
    tenant_id: TENANT_ID,
  }, JWT_SECRET);
}

function validSubscription(overrides = {}) {
  return {
    endpoint: 'https://push.example/subscription-1',
    expirationTime: null,
    keys: {
      p256dh: 'p256dh-key',
      auth: 'auth-key',
    },
    ...overrides,
  };
}

describe('push router', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.VAPID_PUBLIC_KEY = 'public-key';
    process.env.VAPID_PRIVATE_KEY = 'private-key';
    process.env.VAPID_SUBJECT = 'mailto:test@friday.mu';
    query.mockReset();
    webpush.setVapidDetails.mockClear();
    webpush.sendNotification.mockReset();
    webpush.sendNotification.mockResolvedValue();
  });

  afterEach(() => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
  });

  test('reports whether push delivery is fully configured', async () => {
    delete process.env.VAPID_PRIVATE_KEY;

    const res = await request(app())
      .get('/api/push/vapid-key')
      .expect(200);

    expect(res.body).toEqual({ publicKey: 'public-key', configured: false });
    expect(_test.pushConfigStatus()).toEqual({ hasPublicKey: true, configured: false });
  });

  test('rejects subscriptions without browser push keys', async () => {
    await request(app())
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${token()}`)
      .send({ endpoint: 'https://push.example/missing-keys' })
      .expect(400);

    expect(query).not.toHaveBeenCalled();
  });

  test('stores valid authenticated subscriptions', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'sub-1', last_seen_at: '2026-05-27T08:00:00.000Z' }] });

    const subscription = validSubscription();
    const res = await request(app())
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${token()}`)
      .send(subscription)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([
      TENANT_ID,
      USER_ID,
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth,
      JSON.stringify(subscription),
      null,
    ]);
  });

  test('prunes malformed stored subscriptions before delivery', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 'bad-sub', subscription: { endpoint: 'https://push.example/bad', keys: {} } },
      ],
    });
    query.mockResolvedValueOnce({ rows: [] });

    const result = await sendPushToUsers({
      tenantId: TENANT_ID,
      userIds: [USER_ID],
      title: 'New notification',
    });

    expect(result).toEqual({ sent: 0, pruned: 1, skipped: false });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(query.mock.calls[1][0]).toContain('DELETE FROM push_subscriptions');
    expect(query.mock.calls[1][1]).toEqual(['bad-sub']);
  });

  test('prunes push subscriptions rejected by the provider as stale', async () => {
    const subscription = validSubscription();
    query.mockResolvedValueOnce({
      rows: [
        { id: 'stale-sub', subscription },
      ],
    });
    query.mockResolvedValueOnce({ rows: [] });
    webpush.sendNotification.mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 }));

    const result = await sendPushToUsers({
      tenantId: TENANT_ID,
      userIds: [USER_ID],
      title: 'New notification',
    });

    expect(result).toEqual({ sent: 0, pruned: 1, skipped: false });
    expect(query.mock.calls[1][0]).toContain('DELETE FROM push_subscriptions');
    expect(query.mock.calls[1][1]).toEqual(['stale-sub']);
  });
});
