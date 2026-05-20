'use strict';

const {
  extractListingCalendars,
  normalizeCalendar,
  normalizeCalendarRows,
  cacheCoversRange,
} = require('./index');

describe('guesty calendar helpers', () => {
  test('extracts a requested listing calendar from Guesty multi-listing response shapes', () => {
    const calendars = extractListingCalendars({
      data: [
        {
          listingId: 'listing-a',
          days: [
            { date: '2026-06-01', available: true, price: 100 },
          ],
        },
      ],
    }, ['listing-a']);

    expect(normalizeCalendar(calendars.get('listing-a'))).toEqual({
      blockedDates: [],
      pricesByDate: { '2026-06-01': 100 },
    });
  });

  test('turns cached rows into website availability and fills missing prices from listing base price', () => {
    const availability = normalizeCalendarRows([
      { date: '2026-06-01', is_available: true, price_minor: 12500 },
      { date: '2026-06-02', is_available: false, price_minor: null },
    ], {
      base_price_minor: 11000,
      raw: {},
    }, '2026-06-01', '2026-06-03');

    expect(availability).toEqual({
      blockedDates: ['2026-06-02'],
      pricesByDate: {
        '2026-06-01': 125,
        '2026-06-02': 110,
      },
    });
  });

  test('range coverage follows check-in inclusive and checkout exclusive nights', () => {
    expect(cacheCoversRange([
      { date: '2026-06-01' },
      { date: '2026-06-02' },
    ], '2026-06-01', '2026-06-03')).toBe(true);
    expect(cacheCoversRange([
      { date: '2026-06-01' },
    ], '2026-06-01', '2026-06-03')).toBe(false);
  });

  test('treats multi-unit allotment as the availability source when present', () => {
    expect(normalizeCalendar({
      days: [
        { date: '2026-06-01', status: 'available', allotment: 0, price: 100 },
        { date: '2026-06-02', status: 'blocked', allotment: 2, price: 110 },
      ],
    })).toEqual({
      blockedDates: ['2026-06-01'],
      pricesByDate: {
        '2026-06-01': 100,
        '2026-06-02': 110,
      },
    });
  });
});
