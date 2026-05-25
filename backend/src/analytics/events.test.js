'use strict';

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../database/client', () => ({
  query: jest.fn(),
}));

const { query } = require('../database/client');
const eventsRouter = require('./events');

const JWT_SECRET = 'analytics-events-test-secret';
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function app() {
  const server = express();
  server.use(express.json());
  server.use('/api/analytics/events', eventsRouter);
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

describe('analytics events router', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
  });

  test('stores authenticated FAD analytics events locally', async () => {
    const res = await request(app())
      .post('/api/analytics/events/batch')
      .set('Authorization', `Bearer ${token()}`)
      .send({
        events: [{
          event_type: 'fad_module_open',
          event_data: { module: 'inbox' },
          session_id: 'sess-1',
          timestamp: '2026-05-21T08:00:00.000Z',
        }],
      })
      .expect(200);

    expect(res.body).toEqual({ ok: true, inserted: 1 });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('INSERT INTO analytics_events');
    expect(params[0]).toBe(TENANT_ID);
    expect(params[1]).toBe(USER_ID);
    expect(params[2]).toBe('fad_module_open');
    expect(JSON.parse(params[3])).toEqual({ module: 'inbox' });
    expect(params[4]).toBe('sess-1');
    expect(params[6]).toBe('Ishant Ayadassen');
  });

  test('rejects invalid event names before writing', async () => {
    await request(app())
      .post('/api/analytics/events/batch')
      .set('Authorization', `Bearer ${token()}`)
      .send({ events: [{ event_type: 'bad event', event_data: {} }] })
      .expect(400);

    expect(query).not.toHaveBeenCalled();
  });
});
