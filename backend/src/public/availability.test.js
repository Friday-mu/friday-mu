'use strict';

const { _test } = require('./availability');

describe('public availability helpers', () => {
  test('normalizes common Guesty calendar shapes', () => {
    const result = _test.normalizeCalendar({
      data: {
        days: [
          { date: '2026-06-01', available: true, price: 120 },
          { date: '2026-06-02', status: 'booked', price: 130 },
          { date: '2026-06-03T00:00:00.000Z', isBaseAvailable: false, pricing: { price: 140 } },
        ],
      },
    });

    expect(result).toEqual({
      blockedDates: ['2026-06-02', '2026-06-03'],
      pricesByDate: {
        '2026-06-01': 120,
        '2026-06-02': 130,
        '2026-06-03': 140,
      },
    });
  });

  test('generates hospitality nights excluding checkout', () => {
    expect(_test.eachDateBetween('2026-06-01', '2026-06-04')).toEqual([
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
    ]);
  });
});
