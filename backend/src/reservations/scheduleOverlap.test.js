'use strict';

const reservationsRouter = require('./index');

describe('reservation schedule overlap filters', () => {
  test('dedupes same-stay Guesty rows before falling back to confirmation id', () => {
    const sql = reservationsRouter._test.reservationDedupePartitionSql;

    expect(sql).toContain('r.listing_guesty_id');
    expect(sql).toContain('l.nickname');
    expect(sql).toContain('r.check_in_date::text');
    expect(sql).toContain('r.check_out_date::text');
    expect(sql).toContain('r.guest_email');
    expect(sql).toContain('r.confirmation_code');
    expect(sql.indexOf('r.check_in_date::text')).toBeLessThan(sql.indexOf('r.confirmation_code'));
  });

  test('keeps legacy check-in range semantics by default', () => {
    const filters = ['r.tenant_id = $1'];
    const params = ['tenant-1'];

    const nextIndex = reservationsRouter._test.appendReservationDateFilters({
      from: '2026-05-18',
      to: '2026-05-24',
    }, filters, params, 2);

    expect(nextIndex).toBe(4);
    expect(filters).toEqual([
      'r.tenant_id = $1',
      'r.check_in_date >= $2',
      'r.check_in_date <= $3',
    ]);
    expect(params).toEqual(['tenant-1', '2026-05-18', '2026-05-24']);
  });

  test('uses stay-overlap semantics when requested for schedule overlays', () => {
    const filters = ['r.tenant_id = $1'];
    const params = ['tenant-1'];

    const nextIndex = reservationsRouter._test.appendReservationDateFilters({
      date_mode: 'overlap',
      from: '2026-05-18',
      to: '2026-05-24',
    }, filters, params, 2);

    expect(nextIndex).toBe(4);
    expect(filters).toEqual([
      'r.tenant_id = $1',
      'r.check_out_date >= $2',
      'r.check_in_date <= $3',
    ]);
    expect(params).toEqual(['tenant-1', '2026-05-18', '2026-05-24']);
  });
});
