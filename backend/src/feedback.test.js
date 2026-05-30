'use strict';

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('./database/client', () => ({
  query: jest.fn(),
}));

jest.mock('./realtime', () => ({
  notifyUsers: jest.fn(() => Promise.resolve()),
}));

const { query } = require('./database/client');
const { notifyUsers } = require('./realtime');
const feedbackRouter = require('./feedback');

const JWT_SECRET = 'feedback-test-secret';
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function app() {
  const server = express();
  server.use(express.json({ limit: '8mb' }));
  server.use('/api/feedback', feedbackRouter);
  return server;
}

function token(role = 'admin') {
  return jwt.sign({
    user_id: USER_ID,
    role,
    username: 'ishant',
    display_name: 'Ishant Ayadassen',
    tenant_id: TENANT_ID,
  }, JWT_SECRET);
}

describe('feedback router', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    query.mockReset();
    notifyUsers.mockClear();
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_FEEDBACK_WEBHOOK_URL;
    delete process.env.SLACK_NOTIFY_CHANNEL;
    delete process.env.FAD_FEEDBACK_OWNER_EMAILS;
  });

  test('lists tenant-scoped feedback with screenshot metadata only', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'fb-1',
        type: 'bug',
        description: 'Broken',
        status: 'new',
        has_screenshot: true,
      }],
    });

    const res = await request(app())
      .get('/api/feedback?type=bug&status=new')
      .set('Authorization', `Bearer ${token()}`)
      .expect(200);

    expect(res.body.results).toEqual([{
      id: 'fb-1',
      type: 'bug',
      description: 'Broken',
      status: 'new',
      has_screenshot: true,
    }]);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('tenant_id = $1');
    expect(sql).toContain('AS has_screenshot');
    expect(sql).not.toContain(', screenshot_data_url');
    expect(params).toEqual([TENANT_ID, 'bug', 'new']);
  });

  test('lists recent feedback before the id route catches recent as an id', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'fb-1',
        type: 'bug',
        description: 'Broken',
        status: 'new',
        has_screenshot: false,
      }],
    });

    const res = await request(app())
      .get('/api/feedback/recent?limit=3')
      .set('Authorization', `Bearer ${token()}`)
      .expect(200);

    expect(res.body.results).toHaveLength(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('WHERE tenant_id = $1');
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(sql).toContain('LIMIT $2');
    expect(params).toEqual([TENANT_ID, 3]);
  });

  test('loads one tenant-scoped feedback row with the full screenshot', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'fb-1',
        type: 'bug',
        description: 'Broken',
        status: 'new',
        has_screenshot: true,
        screenshot_data_url: 'data:image/jpeg;base64,abc',
      }],
    });

    const res = await request(app())
      .get('/api/feedback/fb-1')
      .set('Authorization', `Bearer ${token()}`)
      .expect(200);

    expect(res.body.feedback.screenshot_data_url).toBe('data:image/jpeg;base64,abc');
    expect(query.mock.calls[0][1]).toEqual(['fb-1', TENANT_ID]);
  });

  test('stores multiple screenshots and notifies only the feedback owner', async () => {
    const shot1 = 'data:image/jpeg;base64,aaa';
    const shot2 = 'data:image/jpeg;base64,bbb';
    query
      .mockResolvedValueOnce({
        rows: [{
          id: 'fb-new',
          type: 'bug',
          title: 'Broken flow',
          description: 'Details',
          severity: null,
          route_url: '/fad?m=inbox',
          module_label: 'Inbox',
          status: 'new',
          source: 'fad',
          created_at: '2026-05-28T00:00:00.000Z',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: USER_ID }],
      });

    await request(app())
      .post('/api/feedback')
      .set('Authorization', `Bearer ${token()}`)
      .send({
        type: 'bug',
        title: 'Broken flow',
        description: 'Details',
        route_url: '/fad?m=inbox',
        module_label: 'Inbox',
        screenshot_data_urls: [shot1, shot2],
        diagnostics: { viewport: { width: 390, height: 844 } },
      })
      .expect(200);

    const [insertSql, insertParams] = query.mock.calls[0];
    expect(insertSql).toContain('screenshot_data_urls');
    expect(insertSql).toContain('diagnostics');
    expect(insertParams[6]).toBe(shot2);
    expect(JSON.parse(insertParams[7])).toEqual([shot1, shot2]);
    expect(JSON.parse(insertParams[8])).toMatchObject({ viewport: { width: 390, height: 844 } });

    await new Promise((resolve) => setImmediate(resolve));
    const [recipientSql, recipientParams] = query.mock.calls[1];
    expect(recipientSql).toContain('LOWER(COALESCE(email');
    expect(recipientSql).not.toContain("role IN ('admin', 'director')");
    expect(recipientParams).toEqual([TENANT_ID, ['ishant@friday.mu']]);
    expect(notifyUsers).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TENANT_ID,
      userIds: [USER_ID],
      data: expect.objectContaining({
        emailNotification: true,
        emailNotifyOnline: true,
        feedbackId: 'fb-new',
      }),
    }));
  });

  test('records fix provenance and verification evidence on patch', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'fb-1',
        type: 'bug',
        description: 'Broken',
        status: 'resolved',
        fixed_commit: 'abc123',
        fix_verified_at: '2026-05-20T12:00:00.000Z',
        root_cause: 'Missing backend route',
      }],
    });

    const res = await request(app())
      .patch('/api/feedback/fb-1')
      .set('Authorization', `Bearer ${token()}`)
      .send({
        status: 'resolved',
        fixed_commit: 'abc123',
        fixed_branch: 'fad-design-os-v01-frontend',
        fix_deployed_at: 'now',
        fix_verified_at: '2026-05-20T12:00:00.000Z',
        root_cause: 'Missing backend route',
        fix_verification_note: 'Checked screenshot and live route.',
      })
      .expect(200);

    expect(res.body.fixed_commit).toBe('abc123');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('fixed_commit');
    expect(sql).toContain('fix_verified_by');
    expect(sql).toContain('WHERE id = $');
    expect(params).toContain('resolved');
    expect(params).toContain('abc123');
    expect(params).toContain(USER_ID);
    expect(params.slice(-2)).toEqual(['fb-1', TENANT_ID]);
  });

  test('rejects invalid verification timestamps before writing', async () => {
    await request(app())
      .patch('/api/feedback/fb-1')
      .set('Authorization', `Bearer ${token()}`)
      .send({ fix_verified_at: 'not-a-date' })
      .expect(400);

    expect(query).not.toHaveBeenCalled();
  });
});
