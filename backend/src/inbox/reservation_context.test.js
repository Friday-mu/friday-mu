'use strict';

const {
  _test: {
    chooseCurrentReservationCandidate,
    shapeReservationForInbox,
    formatReservationContextForPrompt,
    availabilityPromptLine,
    inferFinancialContext,
    inferPartyContext,
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

  test('uses exact email to choose one current reservation when names are ambiguous', () => {
    const now = new Date('2026-05-21T12:00:00Z');
    const candidate = chooseCurrentReservationCandidate([
      {
        id: 'row-1',
        confirmation_code: 'A',
        guest_first_name: 'Maria',
        guest_email: 'wrong@example.com',
        check_in_date: '2026-05-10',
        check_out_date: '2026-05-28',
      },
      {
        id: 'row-2',
        confirmation_code: 'B',
        guest_first_name: 'Maria',
        guest_email: 'guest@example.com',
        check_in_date: '2026-05-12',
        check_out_date: '2026-05-29',
      },
    ], { guest_name: 'Maria', guest_email: 'Guest@Example.com' }, now);

    expect(candidate.id).toBe('row-2');
  });

  test('uses phone digits to choose one current reservation when email is missing', () => {
    const now = new Date('2026-05-21T12:00:00Z');
    const candidate = chooseCurrentReservationCandidate([
      {
        id: 'row-1',
        confirmation_code: 'A',
        guest_first_name: 'Sam',
        guest_phone: '+230 5555 0000',
        check_in_date: '2026-05-10',
        check_out_date: '2026-05-28',
      },
      {
        id: 'row-2',
        confirmation_code: 'B',
        guest_first_name: 'Sam',
        guest_phone: '+230 5743 1122',
        check_in_date: '2026-05-12',
        check_out_date: '2026-05-29',
      },
    ], { guest_name: 'Sam', guest_phone: '57431122' }, now);

    expect(candidate.id).toBe('row-2');
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
      adults: 2,
      children: 0,
      infants: 0,
      guest_first_name: 'Volodymyr',
      guest_last_name: '',
      total_amount_minor: 123400,
      currency_code: 'EUR',
      raw: {
        money: {
          totalPaid: 900,
          balanceDue: 334,
          paymentStatus: 'partially_paid',
          cleaningFee: 95,
          nightlyRate: 27.12,
        },
      },
    }, 'guesty_reservations_current');

    expect(shaped.guesty_reservation_id).toBe('g-1');
    expect(shaped.listing_name).toBe('LV-10');
    expect(shaped.check_in).toBe('2026-04-19');
    expect(shaped.total_price).toBe(1234);
    expect(shaped.adults).toBe(2);
    expect(shaped.amount_paid).toBe(900);
    expect(shaped.outstanding_balance).toBe(334);
    expect(shaped.payment_status).toBe('partially_paid');
    expect(shaped.cleaning_fee).toBe(95);
    expect(shaped.operational_context_source).toBe('guesty_reservations_current');
  });

  test('prefers raw Guesty guest total over cached host payout when both are present', () => {
    const shaped = shapeReservationForInbox({
      id: 'live-id',
      guesty_id: 'g-1',
      total_amount_minor: 90000,
      currency_code: 'EUR',
      raw: {
        money: {
          totalPrice: 1200,
          totalPaid: 1200,
          paymentStatus: 'paid',
        },
      },
    }, 'guesty_reservations_current');

    expect(shaped.total_price).toBe(1200);
    expect(shaped.amount_paid).toBe(1200);
    expect(shaped.payment_status).toBe('paid');
  });

  test('infers payment totals from cached Guesty raw payloads', () => {
    const inferred = inferFinancialContext({
      raw: {
        money: {
          balanceDue: 125,
        },
        payments: [
          { amount: 300, status: 'succeeded' },
          { amount: 40, status: 'failed' },
        ],
        paymentStatus: 'partial',
      },
    });

    expect(inferred.amount_paid).toBe(300);
    expect(inferred.outstanding_balance).toBe(125);
    expect(inferred.payment_status).toBe('partial');
  });

  test('infers guests and financials from alternate Guesty raw shapes', () => {
    const row = {
      id: 'raw-shape',
      guesty_id: 'g-raw',
      status: 'confirmed',
      raw: {
        guests: {
          adults: 2,
          children: 1,
          infants: 1,
        },
        paymentInfo: {
          totalPaid: 820,
          balanceDue: 180,
          status: 'partially_paid',
          currency: 'EUR',
        },
        financials: {
          totalPrice: 1000,
          cleaningFee: 75,
        },
      },
    };

    const party = inferPartyContext(row);
    const financial = inferFinancialContext(row);
    const shaped = shapeReservationForInbox(row, 'guesty_reservations_current');

    expect(party).toMatchObject({
      num_guests: 4,
      adults: 2,
      children: 1,
      infants: 1,
    });
    expect(financial).toMatchObject({
      total_price: 1000,
      amount_paid: 820,
      outstanding_balance: 180,
      payment_status: 'partially_paid',
      currency: 'EUR',
      cleaning_fee: 75,
    });
    expect(shaped.num_guests).toBe(4);
    expect(shaped.total_price).toBe(1000);
    expect(shaped.currency).toBe('EUR');
  });

  test('derives total from paid plus outstanding when Guesty raw omits total', () => {
    const inferred = inferFinancialContext({
      raw: {
        invoice: {
          paidAmount: 700,
          outstandingBalance: 125,
        },
      },
    });

    expect(inferred.total_price).toBe(825);
    expect(inferred.amount_paid).toBe(700);
    expect(inferred.outstanding_balance).toBe(125);
  });

  test('formats reservation finance and availability context for AI prompts', () => {
    const block = formatReservationContextForPrompt({
      id: 'live-id',
      guesty_reservation_id: 'g-1',
      listing_name: 'LV-10',
      status: 'confirmed',
      channel: 'airbnb',
      check_in: '2026-04-19',
      check_out: '2026-05-31',
      number_of_nights: 42,
      num_guests: 2,
      guest_name: 'Volodymyr',
      total_price: 1234,
      amount_paid: 900,
      outstanding_balance: 334,
      payment_status: 'partially_paid',
      currency: 'EUR',
      cleaning_fee: 95,
      nightly_rate: 27.12,
      special_requests: 'Late check-in',
      operational_context_source: 'guesty_reservations_current',
      availability_context: {
        status: 'loaded',
        rows_cached: 42,
        nights_requested: 42,
        blocked_dates: ['2026-04-20'],
        min_price: 100,
        max_price: 120,
        currency: 'EUR',
      },
    });

    expect(block).toContain('Reservation / Financial / Availability Context');
    expect(block).toContain('Total: €1,234.00');
    expect(block).toContain('paid: €900.00');
    expect(block).toContain('outstanding: €334.00');
    expect(block).toContain('nightly');
    expect(block).toContain('blocked dates in cache: 2026-04-20');
    expect(block).toContain('Late check-in');
  });

  test('availability prompt line blocks invented rates when cache is missing', () => {
    expect(availabilityPromptLine({ status: 'missing', message: 'No cached rows' }))
      .toContain('do not invent rates or open dates');
  });
});
