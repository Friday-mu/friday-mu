'use strict';

const {
  buildLiveExchangeRateBlock,
  detectExchangeRateRequest,
  extractCurrencyCodes,
  selectCurrencyPair,
  fetchExchangeRates,
  _test,
} = require('./exchange_rates');

describe('inbox consult live exchange-rate context', () => {
  beforeEach(() => {
    _test.cache.clear();
  });

  test('detects exchange-rate requests and currency aliases', () => {
    expect(detectExchangeRateRequest('What is today\'s EUR to MUR exchange rate?')).toBe(true);
    expect(detectExchangeRateRequest('Can you convert euros into rupees?')).toBe(true);
    expect(detectExchangeRateRequest('Guest asks about pool towels')).toBe(false);
    expect(extractCurrencyCodes('€ to Rs and USD')).toEqual(['EUR', 'MUR', 'USD']);
    expect(selectCurrencyPair('EUR to MUR today')).toEqual({ base: 'EUR', targets: ['MUR'] });
  });

  test('fetches requested rates with a bounded payload', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: 'success',
        provider: 'test-provider',
        time_last_update_utc: 'Wed, 27 May 2026 00:02:31 +0000',
        base_code: 'EUR',
        rates: { MUR: 54.989944, USD: 1.163265 },
      }),
    });

    const result = await fetchExchangeRates({ base: 'EUR', targets: ['MUR'], fetchImpl, now: 1000 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.base).toBe('EUR');
    expect(result.rates).toEqual({ MUR: 54.989944 });

    const cached = await fetchExchangeRates({ base: 'EUR', targets: ['USD'], fetchImpl, now: 2000 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(cached.fromCache).toBe(true);
    expect(cached.rates).toEqual({ USD: 1.163265 });
  });

  test('builds a prompt block that blocks historical rate guessing', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: 'success',
        provider: 'test-provider',
        time_last_update_utc: 'Wed, 27 May 2026 00:02:31 +0000',
        base_code: 'EUR',
        rates: { MUR: 54.989944 },
      }),
    });

    const block = await buildLiveExchangeRateBlock({
      instruction: 'What is the live EUR to MUR rate?',
      fetchImpl,
    });

    expect(block).toContain('[Live exchange-rate context]');
    expect(block).toContain('1 EUR = 54.9899 MUR');
    expect(block).toContain('Do not use memorized, training-data, or historical currency rates.');
  });

  test('falls back safely when live lookup fails', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    const block = await buildLiveExchangeRateBlock({
      instruction: 'What is the exchange rate USD to MUR?',
      fetchImpl,
    });

    expect(block).toContain('[Live exchange-rate context unavailable]');
    expect(block).toContain('Do not answer exchange-rate questions from memorized or historical rates.');
  });
});
