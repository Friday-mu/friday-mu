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

describe('reservation status normalization', () => {
  test('treats missing Guesty cache status as inquiry instead of confirmed', () => {
    const normalize = reservationsRouter._test.normalizeReservationStatus;

    expect(normalize(null)).toBe('inquiry');
    expect(normalize(undefined)).toBe('inquiry');
    expect(normalize('')).toBe('inquiry');
  });

  test('maps stale inquiry placeholders out of the confirmed calendar path', () => {
    const normalize = reservationsRouter._test.normalizeReservationStatus;

    expect(normalize('expired')).toBe('cancelled');
    expect(normalize('closed')).toBe('cancelled');
    expect(normalize('denied')).toBe('cancelled');
    expect(normalize('voided')).toBe('cancelled');
    expect(normalize('pending_quote')).toBe('inquiry');
    expect(normalize('requested')).toBe('inquiry');
  });

  test('ignores passive guesty_pull overlay status when cache status is newer or empty', () => {
    const effective = reservationsRouter._test.effectiveReservationStatus;

    expect(effective({
      guesty_id: 'guesty-1',
      status: null,
      overlay_id: 'overlay-1',
      overlay_status: 'confirmed',
      overlay_source_kind: 'guesty_pull',
    })).toBe('inquiry');

    expect(effective({
      guesty_id: 'guesty-1',
      status: 'cancelled',
      overlay_id: 'overlay-1',
      overlay_status: 'confirmed',
      overlay_source_kind: 'guesty_pull',
    })).toBe('cancelled');
  });

  test('keeps intentional FAD overlay status overrides', () => {
    const effective = reservationsRouter._test.effectiveReservationStatus;

    expect(effective({
      guesty_id: 'guesty-1',
      status: 'confirmed',
      overlay_id: 'overlay-1',
      overlay_status: 'cancelled',
      overlay_source_kind: 'guesty_pull',
      overlay_cancelled_at: '2026-05-26T08:00:00.000Z',
    })).toBe('cancelled');

    expect(effective({
      guesty_id: null,
      status: null,
      overlay_id: 'overlay-1',
      overlay_status: 'confirmed',
      overlay_source_kind: 'manual',
    })).toBe('confirmed');
  });
});
