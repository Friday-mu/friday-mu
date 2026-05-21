'use strict';

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../database/client', () => ({
  query: jest.fn(),
  pool: {
    connect: jest.fn(),
  },
}));

const { pool, query } = require('../database/client');
const rosterRouter = require('./roster');

const JWT_SECRET = 'hr-roster-test-secret';
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const STAFF_ID = '33333333-3333-4333-8333-333333333333';
const WEEK_ID = '44444444-4444-4444-8444-444444444444';
const DAY_ID = '55555555-5555-4555-8555-555555555555';

function app() {
  const server = express();
  server.use(express.json());
  server.use('/api/hr/roster', rosterRouter);
  return server;
}

function token(role = 'ops_manager') {
  return jwt.sign({
    user_id: USER_ID,
    role,
    username: 'franny',
    display_name: 'Franny Henri',
    tenant_id: TENANT_ID,
  }, JWT_SECRET);
}

function mockClient() {
  return {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  };
}

const weekRow = {
  id: WEEK_ID,
  tenant_id: TENANT_ID,
  week_start: '2026-05-18',
  week_end: '2026-05-24',
  status: 'draft',
  published_at: null,
  published_by: null,
  published_by_name: null,
  created_by: USER_ID,
  updated_by: USER_ID,
  created_at: '2026-05-22T08:00:00.000Z',
  updated_at: '2026-05-22T08:00:00.000Z',
};

const dayRow = {
  id: DAY_ID,
  staff_id: STAFF_ID,
  staff_name: 'Bryan Henri',
  user_id: null,
  date: '2026-05-18',
  availability: 'on',
  zone: 'north',
  leave_type: null,
  start_time: null,
  end_time: null,
  notes: null,
  source: 'manual',
  created_at: '2026-05-22T08:00:00.000Z',
  updated_at: '2026-05-22T08:00:00.000Z',
};

describe('hr roster router', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    query.mockReset();
    pool.connect.mockReset();
  });

  test('lists only own published roster rows for field staff without team roster permission', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: STAFF_ID, name: 'Bryan Henri' }] })
      .mockResolvedValueOnce({ rows: [{ ...weekRow, status: 'published', published_at: '2026-05-22T09:00:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [dayRow] });

    const res = await request(app())
      .get('/api/hr/roster?week_start=2026-05-18')
      .set('Authorization', `Bearer ${token('field')}`)
      .expect(200);

    expect(res.body.roster.days).toHaveLength(1);
    expect(res.body.roster.days[0]).toMatchObject({
      staff_id: STAFF_ID,
      date: '2026-05-18',
      availability: 'on',
      zone: 'north',
    });
    expect(query.mock.calls[2][1]).toEqual([TENANT_ID, WEEK_ID, STAFF_ID]);
  });

  test('hides manager draft roster rows from field staff', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: STAFF_ID, name: 'Bryan Henri' }] })
      .mockResolvedValueOnce({ rows: [weekRow] });

    const res = await request(app())
      .get('/api/hr/roster?week_start=2026-05-18')
      .set('Authorization', `Bearer ${token('field')}`)
      .expect(200);

    expect(res.body.roster.status).toBe('draft');
    expect(res.body.roster.days).toEqual([]);
    expect(query).toHaveBeenCalledTimes(2);
  });

  test('saves a roster draft with staff-id idempotent upserts', async () => {
    const client = mockClient();
    pool.connect.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: WEEK_ID }] })
      .mockResolvedValueOnce({ rows: [{ id: STAFF_ID, user_id: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    query
      .mockResolvedValueOnce({ rows: [weekRow] })
      .mockResolvedValueOnce({ rows: [dayRow] });

    const res = await request(app())
      .put('/api/hr/roster')
      .set('Authorization', `Bearer ${token('ops_manager')}`)
      .send({
        week_start: '2026-05-18',
        days: [{
          staff_id: STAFF_ID,
          date: '2026-05-18',
          availability: 'on',
          zone: 'north',
        }],
      })
      .expect(200);

    expect(res.body.roster.status).toBe('draft');
    expect(client.query.mock.calls[1][0]).toContain('ON CONFLICT (tenant_id, week_start)');
    expect(client.query.mock.calls[3][0]).toContain('ON CONFLICT (tenant_id, week_id, staff_id, work_date)');
    expect(client.query.mock.calls[3][1]).toEqual([
      TENANT_ID,
      WEEK_ID,
      STAFF_ID,
      '2026-05-18',
      'on',
      'north',
      null,
      null,
      null,
      null,
    ]);
    expect(client.release).toHaveBeenCalled();
  });

  test('rejects invalid roster days before writing', async () => {
    await request(app())
      .put('/api/hr/roster')
      .set('Authorization', `Bearer ${token('ops_manager')}`)
      .send({
        week_start: '2026-05-18',
        days: [{
          staff_id: STAFF_ID,
          date: '2026-05-30',
          availability: 'on',
        }],
      })
      .expect(400);

    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('publishes a saved roster week and returns the refreshed week', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: WEEK_ID }] })
      .mockResolvedValueOnce({ rows: [{ count: 7 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...weekRow, status: 'published', published_at: '2026-05-22T09:00:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [dayRow] });

    const res = await request(app())
      .post('/api/hr/roster/publish')
      .set('Authorization', `Bearer ${token('ops_manager')}`)
      .send({ week_start: '2026-05-18' })
      .expect(200);

    expect(res.body.roster.status).toBe('published');
    expect(query.mock.calls[2][0]).toContain("status = 'published'");
    expect(query.mock.calls[2][1]).toEqual([TENANT_ID, '2026-05-18', USER_ID]);
  });
});
