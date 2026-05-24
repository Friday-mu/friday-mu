'use strict';

function asObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function getPath(obj, path) {
  return String(path).split('.').reduce((acc, key) => {
    if (acc && typeof acc === 'object' && Object.prototype.hasOwnProperty.call(acc, key)) return acc[key];
    return undefined;
  }, obj);
}

function firstValue(obj, paths) {
  for (const path of paths) {
    const value = getPath(obj, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function numberValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return numberValue(
      value.amount
      ?? value.value
      ?? value.total
      ?? value.gross
      ?? value.net
      ?? value.guestAmount
      ?? value.amountPaid
      ?? value.totalPaid
      ?? value.amountDue
      ?? value.balanceDue,
    );
  }
  const normalized = typeof value === 'string' ? value.replace(/,/g, '').trim() : value;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function moneyValue(obj, paths) {
  return numberValue(firstValue(obj, paths));
}

function paymentArrays(raw, money) {
  return [
    raw.payments,
    raw.payment?.payments,
    raw.paymentInfo?.payments,
    raw.invoice?.payments,
    raw.financials?.payments,
    money.payments,
  ].find(Array.isArray) || [];
}

const GUEST_TOTAL_PATHS = [
  'totalPrice',
  'totalAmount',
  'guestTotal',
  'guestTotalPrice',
  'money.totalPrice',
  'money.total',
  'money.totalAmount',
  'money.guestTotal',
  'money.guestTotalPrice',
  'money.invoiceTotal',
  'invoice.total',
  'invoice.totalAmount',
  'invoice.totalPrice',
  'paymentInfo.total',
  'paymentInfo.totalAmount',
  'paymentInfo.totalPrice',
  'financials.total',
  'financials.totalPrice',
  'financials.guestTotal',
  'financials.guestTotalPrice',
];

const AMOUNT_PAID_PATHS = [
  'amountPaid',
  'paidAmount',
  'totalPaid',
  'money.totalPaid',
  'money.paid',
  'money.paidAmount',
  'money.amountPaid',
  'money.paymentsTotal',
  'payment.amountPaid',
  'payment.totalPaid',
  'payment.paidAmount',
  'paymentInfo.amountPaid',
  'paymentInfo.totalPaid',
  'paymentInfo.paidAmount',
  'invoice.totalPaid',
  'invoice.paidAmount',
  'financials.amountPaid',
  'financials.totalPaid',
  'financials.paid',
];

const BALANCE_DUE_PATHS = [
  'balanceDue',
  'outstandingBalance',
  'remainingBalance',
  'amountDue',
  'money.balanceDue',
  'money.remainingBalance',
  'money.outstandingBalance',
  'money.balance',
  'money.amountDue',
  'payment.balanceDue',
  'payment.outstandingBalance',
  'payment.amountDue',
  'paymentInfo.balanceDue',
  'paymentInfo.outstandingBalance',
  'paymentInfo.remainingBalance',
  'invoice.balanceDue',
  'invoice.outstandingBalance',
  'financials.balanceDue',
  'financials.outstandingBalance',
  'financials.remainingBalance',
];

// Industry-standard revenue breakdown for hospitality analytics.
// Room revenue = accommodation rent only (excludes cleaning + taxes).
// Cleaning is a pass-through; taxes aren't revenue.
const SUBTOTAL_PATHS = [
  'money.subTotalPrice',
  'subTotalPrice',
  'money.subTotal',
  'subTotal',
];
const CLEANING_FEE_PATHS = [
  'money.fareCleaning',
  'fareCleaning',
  'money.cleaningFee',
  'cleaningFee',
];
const TAXES_PATHS = [
  'money.totalTaxes',
  'totalTaxes',
  'money.taxes',
];
const HOST_PAYOUT_PATHS = [
  'money.hostPayout',
  'hostPayout',
  'money.hostPayoutUsd',
];
const HOST_SERVICE_FEE_PATHS = [
  'money.hostServiceFee',
  'hostServiceFee',
  'money.hostServiceFeeIncTax',
];

function inferReservationFinancials(rawReservation) {
  const raw = asObject(rawReservation);
  const money = asObject(raw.money);
  const payments = paymentArrays(raw, money);
  const paidFromPayments = payments.reduce((sum, payment) => {
    const amount = numberValue(
      payment?.amount
      ?? payment?.value
      ?? payment?.paidAmount
      ?? payment?.totalPaid
      ?? payment?.amountPaid,
    );
    const status = String(payment?.status || '').toLowerCase();
    if (amount == null || ['failed', 'cancelled', 'canceled', 'void', 'refunded'].includes(status)) return sum;
    return sum + amount;
  }, 0);

  const amountPaid = moneyValue(raw, AMOUNT_PAID_PATHS);
  const balanceDue = moneyValue(raw, BALANCE_DUE_PATHS);
  const guestTotal = moneyValue(raw, GUEST_TOTAL_PATHS);
  const paid = amountPaid != null ? amountPaid : (paidFromPayments > 0 ? paidFromPayments : null);
  const subTotal = moneyValue(raw, SUBTOTAL_PATHS);
  const cleaningFee = moneyValue(raw, CLEANING_FEE_PATHS);
  const taxes = moneyValue(raw, TAXES_PATHS);
  const hostPayout = moneyValue(raw, HOST_PAYOUT_PATHS);
  const hostServiceFee = moneyValue(raw, HOST_SERVICE_FEE_PATHS);

  // Room revenue: industry standard excludes cleaning + taxes.
  // Best estimate when we have subTotal: subTotal - cleaningFee (subTotal
  // is pre-tax but still includes cleaning). Fallback: total - cleaning
  // - taxes. Final fallback: total (less accurate but better than null).
  let roomRevenue = null;
  if (subTotal != null) {
    roomRevenue = subTotal - (cleaningFee != null ? cleaningFee : 0);
  } else if (guestTotal != null) {
    roomRevenue = guestTotal - (cleaningFee != null ? cleaningFee : 0) - (taxes != null ? taxes : 0);
  }
  if (roomRevenue != null && roomRevenue < 0) roomRevenue = null;

  return {
    total: guestTotal != null ? guestTotal : (paid != null && balanceDue != null ? paid + balanceDue : null),
    subTotal,
    roomRevenue,
    cleaningFee,
    taxes,
    hostPayout,
    hostServiceFee,
    amountPaid: paid,
    balanceDue,
    paymentStatus: firstValue(raw, [
      'paymentStatus',
      'payment.status',
      'paymentInfo.status',
      'invoice.paymentStatus',
      'invoice.status',
      'money.paymentStatus',
      'money.status',
      'financialStatus',
      'financials.paymentStatus',
      'financials.status',
    ]),
    currency: firstValue(raw, [
      'currency',
      'currencyCode',
      'money.currency',
      'money.currencyCode',
      'payment.currency',
      'paymentInfo.currency',
      'invoice.currency',
      'financials.currency',
    ]),
  };
}

function majorToMinor(value) {
  const major = numberValue(value);
  return major == null ? null : Math.round(major * 100);
}

module.exports = {
  inferReservationFinancials,
  majorToMinor,
  _test: {
    asObject,
    firstValue,
    numberValue,
    moneyValue,
  },
};
