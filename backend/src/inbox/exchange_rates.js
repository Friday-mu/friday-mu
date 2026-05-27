'use strict';

const DEFAULT_EXCHANGE_RATE_BASE_URL = process.env.EXCHANGE_RATE_BASE_URL || 'https://open.er-api.com/v6/latest';
const EXCHANGE_RATE_TIMEOUT_MS = Number(process.env.EXCHANGE_RATE_TIMEOUT_MS) || 4_000;
const EXCHANGE_RATE_CACHE_TTL_MS = Number(process.env.EXCHANGE_RATE_CACHE_TTL_MS) || 10 * 60 * 1000;

const CURRENCY_ALIASES = new Map([
  ['EUR', 'EUR'], ['EURO', 'EUR'], ['EUROS', 'EUR'], ['€', 'EUR'],
  ['USD', 'USD'], ['DOLLAR', 'USD'], ['DOLLARS', 'USD'], ['US DOLLAR', 'USD'], ['US DOLLARS', 'USD'], ['$', 'USD'],
  ['MUR', 'MUR'], ['MAURITIAN RUPEE', 'MUR'], ['MAURITIAN RUPEES', 'MUR'], ['RUPEE', 'MUR'], ['RUPEES', 'MUR'], ['RS', 'MUR'], ['₨', 'MUR'],
  ['GBP', 'GBP'], ['POUND', 'GBP'], ['POUNDS', 'GBP'], ['STERLING', 'GBP'], ['£', 'GBP'],
  ['ZAR', 'ZAR'], ['RAND', 'ZAR'], ['RANDS', 'ZAR'],
]);

const CURRENCY_PATTERN = /\b(?:EUR|EUROS?|USD|US DOLLARS?|DOLLARS?|MUR|MAURITIAN RUPEES?|RUPEES?|RS|GBP|POUNDS?|STERLING|ZAR|RANDS?)\b|[€$£₨]/gi;
const EXCHANGE_REQUEST_PATTERN = /\b(?:exchange\s*rate|currency\s*rate|conversion\s*rate|convert|conversion|today'?s?\s+rate|live\s+rate|fx|forex|rate\s+(?:for|of|between))\b/i;
const PAIR_HINT_PATTERN = /\b(?:to|into|in|against|versus|vs)\b/i;

const cache = new Map();

function normalizeCurrencyToken(token) {
  const key = String(token || '').trim().toUpperCase().replace(/\s+/g, ' ');
  return CURRENCY_ALIASES.get(key) || null;
}

function extractCurrencyCodes(text) {
  const seen = new Set();
  const codes = [];
  const raw = String(text || '');
  for (const match of raw.matchAll(CURRENCY_PATTERN)) {
    const code = normalizeCurrencyToken(match[0]);
    if (code && !seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  }
  return codes;
}

function detectExchangeRateRequest(text) {
  const raw = String(text || '');
  const codes = extractCurrencyCodes(raw);
  if (EXCHANGE_REQUEST_PATTERN.test(raw)) return true;
  return codes.length >= 2 && PAIR_HINT_PATTERN.test(raw);
}

function selectCurrencyPair(text) {
  const codes = extractCurrencyCodes(text);
  const base = codes[0] || 'EUR';
  let targets = codes.slice(1).filter((code) => code !== base);
  if (targets.length === 0) {
    targets = ['MUR', 'EUR', 'USD', 'GBP'].filter((code) => code !== base);
  }
  return { base, targets: targets.slice(0, 6) };
}

function formatRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n >= 100) return n.toFixed(2);
  if (n >= 10) return n.toFixed(4);
  if (n >= 1) return n.toFixed(5);
  return n.toFixed(6);
}

async function fetchJsonWithTimeout(url, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXCHANGE_RATE_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchExchangeRates({ base, targets, fetchImpl, now = Date.now() }) {
  const cleanBase = String(base || 'EUR').toUpperCase();
  const cleanTargets = [...new Set((targets || []).map((t) => String(t || '').toUpperCase()).filter(Boolean))]
    .filter((t) => t !== cleanBase);
  const cacheKey = cleanBase;
  const cached = cache.get(cacheKey);
  if (cached && now - cached.fetchedAt < EXCHANGE_RATE_CACHE_TTL_MS) {
    return {
      ...cached.payload,
      rates: Object.fromEntries(cleanTargets.map((t) => [t, cached.payload.rates[t]]).filter(([, v]) => v != null)),
      fromCache: true,
    };
  }

  const url = `${DEFAULT_EXCHANGE_RATE_BASE_URL.replace(/\/$/, '')}/${encodeURIComponent(cleanBase)}`;
  const data = await fetchJsonWithTimeout(url, fetchImpl);
  if (data?.result && data.result !== 'success') {
    throw new Error(data['error-type'] || data.result);
  }
  if (!data?.rates || typeof data.rates !== 'object') {
    throw new Error('rates missing');
  }

  const payload = {
    base: String(data.base_code || cleanBase).toUpperCase(),
    date: data.time_last_update_utc || data.date || null,
    provider: data.provider || DEFAULT_EXCHANGE_RATE_BASE_URL,
    rates: data.rates,
  };
  cache.set(cacheKey, { fetchedAt: now, payload });
  return {
    ...payload,
    rates: Object.fromEntries(cleanTargets.map((t) => [t, payload.rates[t]]).filter(([, v]) => v != null)),
    fromCache: false,
  };
}

function buildUnavailableBlock(error) {
  return `[Live exchange-rate context unavailable]
The operator appears to be asking for a current currency/exchange rate, but the live rate lookup failed (${String(error?.message || error || 'unknown error').slice(0, 160)}).
Do not answer exchange-rate questions from memorized or historical rates. Tell the operator the live lookup failed and ask them to verify the current rate manually or try again.`;
}

async function buildLiveExchangeRateBlock({ instruction, draftBody, messages, fetchImpl } = {}) {
  const recentThread = Array.isArray(messages)
    ? messages.slice(-8).map((m) => `${m.body || ''}\n${m.translated_body || ''}`).join('\n\n')
    : '';
  const text = [instruction, draftBody, recentThread].filter(Boolean).join('\n\n');
  if (!detectExchangeRateRequest(text)) return '';

  const pair = selectCurrencyPair(text);
  try {
    const result = await fetchExchangeRates({ ...pair, fetchImpl });
    const rateLines = Object.entries(result.rates || {})
      .map(([code, value]) => {
        const formatted = formatRate(value);
        return formatted ? `- 1 ${result.base} = ${formatted} ${code}` : null;
      })
      .filter(Boolean);
    if (rateLines.length === 0) throw new Error(`no rates returned for ${pair.targets.join(', ')}`);
    return `[Live exchange-rate context]
Fetched: ${new Date().toISOString()}.
Provider/source: ${result.provider}${result.date ? `; provider update: ${result.date}` : ''}${result.fromCache ? '; cached inside FAD for this request window' : ''}.
${rateLines.join('\n')}

Rules:
- If answering an exchange-rate question, use only the live rates above.
- Do not use memorized, training-data, or historical currency rates.
- Frame rates as indicative because banks, payment processors, and card networks may apply their own spread or fee.`;
  } catch (error) {
    return buildUnavailableBlock(error);
  }
}

module.exports = {
  buildLiveExchangeRateBlock,
  detectExchangeRateRequest,
  extractCurrencyCodes,
  selectCurrencyPair,
  fetchExchangeRates,
  _test: {
    cache,
    formatRate,
    normalizeCurrencyToken,
  },
};
