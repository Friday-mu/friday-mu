'use strict';

const { _test } = require('./team_presence');

describe('public team presence', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    delete process.env.FAD_PUBLIC_TEAM_PRESENCE_STATUS;
    delete process.env.FAD_PUBLIC_TEAM_PRESENCE_ETA_MINUTES;
    delete process.env.FAD_PUBLIC_TEAM_PRESENCE_MESSAGE;
    delete process.env.FAD_PUBLIC_TEAM_PRESENCE_TENANT_ID;
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('defaults to public-safe status without private staff fields', () => {
    const payload = _test.payload(new Date('2026-05-22T08:00:00.000Z'));
    expect(payload).toEqual(expect.objectContaining({
      available: expect.any(Boolean),
      status: expect.stringMatching(/available|limited|offline/),
      etaMinutes: null,
      message: expect.any(String),
    }));
    expect(Object.keys(payload).sort()).toEqual(['available', 'etaMinutes', 'message', 'status']);
    expect(JSON.stringify(payload)).not.toMatch(/mary|judith|staff|schedule|workload/i);
  });

  test('allows explicit public availability without exposing staff identity', () => {
    process.env.FAD_PUBLIC_TEAM_PRESENCE_STATUS = 'available';
    process.env.FAD_PUBLIC_TEAM_PRESENCE_ETA_MINUTES = '15';
    const payload = _test.payload();
    expect(payload).toMatchObject({
      available: true,
      status: 'available',
      etaMinutes: 15,
    });
  });

  test('promotes team-hours status to available when FAD has active presence', () => {
    const payload = _test.payload(new Date('2026-05-22T08:00:00.000Z'), {
      presence: { activeConnectionCount: 2, activeUserCount: 1, userIds: ['user-a'] },
    });
    expect(payload).toEqual({
      available: true,
      status: 'available',
      etaMinutes: null,
      message: 'The Friday team is available to review this.',
    });
    expect(JSON.stringify(payload)).not.toMatch(/user-a|activeConnectionCount|activeUserCount|userIds/i);
  });

  test('env status override wins over active FAD presence', () => {
    process.env.FAD_PUBLIC_TEAM_PRESENCE_STATUS = 'offline';
    const payload = _test.payload(new Date('2026-05-22T08:00:00.000Z'), {
      presence: { activeConnectionCount: 2, activeUserCount: 1 },
    });
    expect(payload).toMatchObject({
      available: false,
      status: 'offline',
    });
  });
});
