'use strict';

jest.mock('../database/client', () => ({
  query: jest.fn(),
}));

const { query } = require('../database/client');
const {
  withConsultConversationLease,
  _test: {
    normalizeLockKey,
    tryAcquire,
    ttlSeconds,
  },
} = require('./consult_lock');

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

describe('Consult conversation DB lease locks', () => {
  beforeEach(() => {
    query.mockReset();
  });

  test('normalizes lock keys and clamps lease TTL', () => {
    expect(normalizeLockKey('')).toBe('__global__');
    expect(normalizeLockKey('conversation-1')).toBe('conversation-1');
    expect(ttlSeconds(1000)).toBe(30);
    expect(ttlSeconds(65_000)).toBe(65);
  });

  test('tryAcquire returns true only when a lease row is acquired', async () => {
    query.mockResolvedValueOnce({ rows: [{ holder_token: 'tok' }] });
    await expect(tryAcquire({
      tenantId: TENANT_ID,
      lockKey: 'conv-1',
      scope: 'consult_turn',
      holderToken: 'tok',
      holderRef: 'test',
      ttlMs: 60_000,
    })).resolves.toBe(true);

    query.mockResolvedValueOnce({ rows: [] });
    await expect(tryAcquire({
      tenantId: TENANT_ID,
      lockKey: 'conv-1',
      scope: 'consult_turn',
      holderToken: 'tok-2',
      holderRef: 'test',
      ttlMs: 60_000,
    })).resolves.toBe(false);
  });

  test('runs the critical section and releases the lease', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ holder_token: 'tok' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await withConsultConversationLease({
      tenantId: TENANT_ID,
      conversationId: 'conv-1',
      waitMs: 100,
      pollMs: 1,
      ttlMs: 60_000,
      metadata: { context: 'revision' },
    }, async () => 'done');

    expect(result).toBe('done');
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('INSERT INTO consult_conversation_locks');
    expect(query.mock.calls[1][0]).toContain('DELETE FROM consult_conversation_locks');
  });
});
