'use strict';

jest.mock('../database/client', () => ({
  pool: { connect: jest.fn() },
  query: jest.fn(),
}));

jest.mock('./push', () => ({
  sendPushToUsers: jest.fn(() => Promise.resolve()),
}));

jest.mock('../website_inbox/resend', () => ({
  sendEmail: jest.fn(() => Promise.resolve()),
}));

const { query } = require('../database/client');
const { sendEmail } = require('../website_inbox/resend');
const realtime = require('./index');

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_TENANT_ID = '10000000-0000-0000-0000-000000000001';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const USER_TWO_ID = '22222222-2222-4222-8222-222222222222';

describe('FAD realtime presence', () => {
  beforeEach(() => {
    realtime._test.clients.clear();
    realtime._test.resetEmailNotificationBackoff();
    query.mockReset();
    sendEmail.mockClear();
    delete process.env.FAD_EMAIL_NOTIFY_ONLINE_USERS;
    delete process.env.FAD_EMAIL_NOTIFICATIONS_DISABLED;
  });

  test('summarizes active connections by tenant without cross-tenant leakage', () => {
    realtime._test.clients.set('a', {
      tenantId: TENANT_ID,
      userId: USER_ID,
      connectedAt: '2026-05-22T08:00:00.000Z',
    });
    realtime._test.clients.set('b', {
      tenantId: TENANT_ID,
      userId: USER_ID,
      connectedAt: '2026-05-22T08:05:00.000Z',
    });
    realtime._test.clients.set('c', {
      tenantId: OTHER_TENANT_ID,
      userId: USER_TWO_ID,
      connectedAt: '2026-05-22T08:10:00.000Z',
    });

    expect(realtime.activePresenceForTenant(TENANT_ID, new Date('2026-05-22T08:30:00.000Z'))).toEqual({
      activeConnectionCount: 2,
      activeUserCount: 1,
      userIds: [USER_ID],
      checkedAt: '2026-05-22T08:30:00.000Z',
    });
  });

  test('returns FAD-authenticated staff presence without email or workload fields', async () => {
    realtime._test.clients.set('a', {
      tenantId: TENANT_ID,
      userId: USER_ID,
      connectedAt: '2026-05-22T08:00:00.000Z',
    });
    query.mockResolvedValueOnce({
      rows: [{ id: USER_ID, display_name: 'Mary', username: 'mary@friday.mu', role: 'manager' }],
    });

    const out = await realtime.activePresenceUsersForTenant(TENANT_ID, new Date('2026-05-22T08:30:00.000Z'));

    expect(out).toMatchObject({
      activeConnectionCount: 1,
      activeUserCount: 1,
      users: [{
        id: USER_ID,
        displayName: 'Mary',
        role: 'manager',
        status: 'online',
        connectionCount: 1,
        connectedAt: '2026-05-22T08:00:00.000Z',
      }],
    });
    expect(JSON.stringify(out)).not.toMatch(/mary@friday\.mu|workload|capacity/i);
  });
});

describe('FAD realtime email notifications', () => {
  beforeEach(() => {
    realtime._test.clients.clear();
    realtime._test.resetEmailNotificationBackoff();
    query.mockReset();
    sendEmail.mockReset();
    delete process.env.FAD_EMAIL_NOTIFY_ONLINE_USERS;
    delete process.env.FAD_EMAIL_NOTIFICATIONS_DISABLED;
  });

  test('does not email users who are currently online in FAD', async () => {
    realtime._test.clients.set('online', {
      tenantId: TENANT_ID,
      userId: USER_ID,
      connectedAt: '2026-05-22T08:00:00.000Z',
    });
    query.mockResolvedValueOnce({
      rows: [
        { id: USER_ID, email: 'online@friday.mu', display_name: 'Online' },
        { id: USER_TWO_ID, email: 'offline@friday.mu', display_name: 'Offline' },
      ],
    });
    sendEmail.mockResolvedValue({ id: 'email-1' });

    const result = await realtime._test.sendEmailNotifications({
      tenantId: TENANT_ID,
      userIds: [USER_ID, USER_TWO_ID],
      type: 'team_channel_mention',
      title: 'Mentioned you',
      body: 'Can you check this?',
      url: '/fad?m=inbox',
    });

    expect(result).toMatchObject({ sent: 1, skippedOnline: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'offline@friday.mu' }));
  });

  test('backs off email fan-out after provider rate limits', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    query.mockResolvedValueOnce({
      rows: [
        { id: USER_ID, email: 'one@friday.mu', display_name: 'One' },
        { id: USER_TWO_ID, email: 'two@friday.mu', display_name: 'Two' },
      ],
    });
    const err = new Error('Request failed with status code 429');
    err.response = { status: 429 };
    sendEmail.mockRejectedValueOnce(err);

    const result = await realtime._test.sendEmailNotifications({
      tenantId: TENANT_ID,
      userIds: [USER_ID, USER_TWO_ID],
      type: 'inbox_new_message',
      title: 'New message',
      body: 'Guest wrote in',
      url: '/fad?m=inbox',
    });

    expect(result.sent).toBe(0);
    expect(result.backoffUntil).toBeTruthy();
    expect(realtime._test.emailNotificationBackoffSnapshot()).toBeGreaterThan(Date.now());
    expect(sendEmail).toHaveBeenCalledTimes(1);

    query.mockClear();
    sendEmail.mockClear();
    const skipped = await realtime._test.sendEmailNotifications({
      tenantId: TENANT_ID,
      userIds: [USER_ID],
      type: 'inbox_new_message',
      title: 'New message',
    });

    expect(skipped).toMatchObject({ sent: 0, skipped: true, reason: 'provider_backoff' });
    expect(query).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
