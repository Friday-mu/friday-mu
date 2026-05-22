'use strict';

const { inferReservationFinancials, majorToMinor } = require('./financials');

describe('reservation financial inference', () => {
  test('uses guest-facing total before host payout fields', () => {
    const financials = inferReservationFinancials({
      money: {
        totalPrice: 1480,
        hostPayout: 890,
        totalPaid: 1480,
        paymentStatus: 'paid',
        currency: 'EUR',
      },
    });

    expect(financials.total).toBe(1480);
    expect(majorToMinor(financials.total)).toBe(148000);
    expect(financials.amountPaid).toBe(1480);
    expect(financials.paymentStatus).toBe('paid');
    expect(financials.currency).toBe('EUR');
  });

  test('does not treat host payout as the guest booking total', () => {
    const financials = inferReservationFinancials({
      money: {
        hostPayout: 890,
        fareAccommodation: 1200,
        currency: 'EUR',
      },
    });

    expect(financials.total).toBeNull();
    expect(majorToMinor(financials.total)).toBeNull();
    expect(financials.currency).toBe('EUR');
  });

  test('derives total from successful payments plus balance due', () => {
    const financials = inferReservationFinancials({
      payments: [
        { amount: 500, status: 'succeeded' },
        { amount: 120, status: 'failed' },
      ],
      paymentInfo: {
        balanceDue: 250,
        status: 'partially_paid',
      },
    });

    expect(financials.amountPaid).toBe(500);
    expect(financials.balanceDue).toBe(250);
    expect(financials.total).toBe(750);
    expect(financials.paymentStatus).toBe('partially_paid');
  });
});
