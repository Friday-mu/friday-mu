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
const realtime = require('./index');

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_TENANT_ID = '10000000-0000-0000-0000-000000000001';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const USER_TWO_ID = '22222222-2222-4222-8222-222222222222';

describe('FAD realtime presence', () => {
  beforeEach(() => {
    realtime._test.clients.clear();
    query.mockReset();
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
