'use strict';

const { _test } = require('./expenses');

describe('finance/expenses helpers', () => {
  describe('asAmountMinor', () => {
    test('converts decimal to minor units', () => {
      expect(_test.asAmountMinor('1234.50')).toBe(123450);
      expect(_test.asAmountMinor(99)).toBe(9900);
      expect(_test.asAmountMinor('0.01')).toBe(1);
    });
    test('rejects non-positive / non-finite', () => {
      expect(_test.asAmountMinor(0)).toBeNull();
      expect(_test.asAmountMinor(-5)).toBeNull();
      expect(_test.asAmountMinor('not a number')).toBeNull();
      expect(_test.asAmountMinor(null)).toBeNull();
    });
    test('rounds away floating-point fuzz', () => {
      // JS turns 0.1 + 0.2 into 0.30000000000000004
      expect(_test.asAmountMinor(0.1 + 0.2)).toBe(30);
    });
  });

  describe('asCurrency', () => {
    test('whitelists MUR/EUR/USD case-insensitive', () => {
      expect(_test.asCurrency('mur')).toBe('MUR');
      expect(_test.asCurrency(' EUR ')).toBe('EUR');
      expect(_test.asCurrency('usd')).toBe('USD');
    });
    test('rejects other codes', () => {
      expect(_test.asCurrency('GBP')).toBeNull();
      expect(_test.asCurrency('')).toBeNull();
      expect(_test.asCurrency(null)).toBeNull();
    });
  });

  describe('asPropertyCode', () => {
    test('uppercases and validates the FR code shape', () => {
      expect(_test.asPropertyCode('gbh-c8')).toBe('GBH-C8');
      expect(_test.asPropertyCode('RC-16')).toBe('RC-16');
      expect(_test.asPropertyCode('VV-A03')).toBe('VV-A03');
    });
    test('rejects out-of-shape codes', () => {
      expect(_test.asPropertyCode('not-a-code')).toBeNull();
      expect(_test.asPropertyCode('123')).toBeNull();
      expect(_test.asPropertyCode('')).toBeNull();
    });
  });

  describe('asBillTo', () => {
    test('accepts the internal_* and owner_* shapes', () => {
      expect(_test.asBillTo('internal_fr')).toBe('internal_fr');
      expect(_test.asBillTo('owner_arden-villa')).toBe('owner_arden-villa');
      expect(_test.asBillTo('INTERNAL_FI')).toBe('internal_fi');
    });
    test('rejects other shapes', () => {
      expect(_test.asBillTo('something_else')).toBeNull();
      expect(_test.asBillTo('')).toBeNull();
    });
  });

  describe('clean + cleanMultiline', () => {
    test('clean collapses whitespace and caps length', () => {
      expect(_test.clean('  hello  world  ')).toBe('hello world');
      expect(_test.clean('a'.repeat(600), 10)).toBe('a'.repeat(10));
    });
    test('cleanMultiline preserves newlines but trims', () => {
      expect(_test.cleanMultiline('line 1\nline 2\n')).toBe('line 1\nline 2');
    });
  });
});
