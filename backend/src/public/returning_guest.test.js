'use strict';

const { _test } = require('./returning_guest');

describe('public returning guest helpers', () => {
  test('validates basic email shape', () => {
    expect(_test.validEmail('guest@example.com')).toBe(true);
    expect(_test.validEmail('not-an-email')).toBe(false);
  });

  test('maps most recent stay into website shape', () => {
    expect(_test.mapReturningGuest([
      {
        guest_first_name: 'Asha',
        check_out_date: '2026-02-12',
        listing_nickname: 'MV-1',
        listing_title: 'Maison Villaze',
      },
      {
        guest_first_name: 'Asha',
        check_out_date: '2025-12-01',
        listing_nickname: 'TRR-4',
        listing_title: 'Tamarin River Residence',
      },
    ])).toEqual({
      firstName: 'Asha',
      lastCheckOut: '2026-02-12',
      lastListingName: 'MV-1',
      totalStays: 2,
    });
  });

  test('returns null when no historical reservations match', () => {
    expect(_test.mapReturningGuest([])).toBeNull();
  });
});
