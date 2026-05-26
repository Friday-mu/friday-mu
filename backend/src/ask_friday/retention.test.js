'use strict';

jest.mock('../database/client', () => ({
  query: jest.fn(),
}));

const { query } = require('../database/client');
const { runRetention, _test } = require('./retention');

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

describe('Ask Friday retention worker', () => {
  beforeEach(() => {
    query.mockReset();
  });

  test('defaults to dry-run counts only', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ count: 3 }] })
      .mockResolvedValueOnce({ rows: [{ count: 4 }] });

    const result = await runRetention({ tenantId: TENANT_ID });

    expect(result).toMatchObject({
      dryRun: true,
      tenantId: TENANT_ID,
      deleted: {
        expiredEvidenceRefs: 2,
        rejectedCandidates: 3,
        expiredCandidates: 4,
      },
      candidates: {
        rejectedRetentionDays: 180,
        expiredRetentionDays: 30,
      },
    });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0][0]).toContain('SELECT COUNT(*)::int AS count');
  });

  test('deletes only expired evidence refs and old rejected or expired candidates when enabled', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ deleted_count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ deleted_count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ deleted_count: 3 }] });

    const result = await runRetention({
      tenantId: TENANT_ID,
      dryRun: false,
      rejectedCandidateRetentionDays: 90,
      expiredCandidateRetentionDays: 14,
    });

    expect(result).toMatchObject({
      dryRun: false,
      deleted: {
        expiredEvidenceRefs: 1,
        rejectedCandidates: 2,
        expiredCandidates: 3,
      },
      candidates: {
        rejectedRetentionDays: 90,
        expiredRetentionDays: 14,
      },
    });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0][0]).toContain('DELETE FROM ask_friday_evidence_refs');
    expect(query.mock.calls[1][1]).toEqual([TENANT_ID, 'rejected', 90]);
    expect(query.mock.calls[2][1]).toEqual([TENANT_ID, 'expired', 14]);
  });

  test('requires tenant id and clamps retention windows', async () => {
    await expect(runRetention({})).rejects.toThrow('tenantId is required');
    expect(_test.positiveInt('0', 180)).toBe(1);
    expect(_test.positiveInt('99999', 180)).toBe(3650);
    expect(_test.positiveInt('abc', 180)).toBe(180);
  });
});
