'use strict';

const {
  _test: {
    chooseCurrentReservationCandidate,
    shapeReservationForInbox,
  },
} = require('./reservation_context');

describe('inbox reservation context resolver helpers', () => {
  test('chooses the one current reservation even when API and scraper rows duplicate it', () => {
    const now = new Date('2026-05-21T12:00:00Z');
    const candidate = chooseCurrentReservationCandidate([
      {
        id: 'api-row',
        guesty_id: '69d8e093770918458c54bf60',
        confirmation_code: 'GY-mFedW8Am',
        listing_guesty_id: '674d62ad81a8a00014b9594a',
        listing_nickname: 'LV-10',
        guest_first_name: 'Volodymyr',
        guest_last_name: ' ',
        status: null,
        check_in_date: '2026-04-19',
        check_out_date: '2026-05-31',
      },
      {
        id: 'scrape-row',
        guesty_id: 'scrape:GY-mFedW8Am',
        confirmation_code: 'GY-mFedW8Am',
        listing_guesty_id: 'LV-10',
        guest_first_name: 'Volodymyr',
        guest_last_name: null,
        status: 'confirmed',
        source: 'scrape-l3',
        check_in_date: '2026-04-19',
        check_out_date: '2026-05-31',
      },
    ], { guest_name: 'Volodymyr  ' }, now);

    expect(candidate.id).toBe('scrape-row');
  });

  test('does not override by first name when there are multiple current reservations', () => {
    const now = new Date('2026-05-21T12:00:00Z');
    const candidate = chooseCurrentReservationCandidate([
      {
        id: 'row-1',
        confirmation_code: 'A',
        guest_first_name: 'Maria',
        check_in_date: '2026-05-10',
        check_out_date: '2026-05-28',
      },
      {
        id: 'row-2',
        confirmation_code: 'B',
        guest_first_name: 'Maria',
        check_in_date: '2026-05-12',
        check_out_date: '2026-05-29',
      },
    ], { guest_name: 'Maria' }, now);

    expect(candidate).toBeNull();
  });

  test('shapes Guesty reservation rows into the Inbox legacy contract', () => {
    const shaped = shapeReservationForInbox({
      id: 'live-id',
      guesty_id: 'g-1',
      listing_nickname: 'LV-10',
      status: 'confirmed',
      check_in_date: '2026-04-19',
      check_out_date: '2026-05-31',
      nights: 42,
      guests_count: 2,
      guest_first_name: 'Volodymyr',
      guest_last_name: '',
      total_amount_minor: 123400,
      currency_code: 'EUR',
    }, 'guesty_reservations_current');

    expect(shaped.guesty_reservation_id).toBe('g-1');
    expect(shaped.listing_name).toBe('LV-10');
    expect(shaped.check_in).toBe('2026-04-19');
    expect(shaped.total_price).toBe(1234);
    expect(shaped.operational_context_source).toBe('guesty_reservations_current');
  });
});
