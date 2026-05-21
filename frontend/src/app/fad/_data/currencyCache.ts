// Module-level cache for tenant currency + locale. Lives separately
// from `useTenantCurrency.ts` (the React hook) so legacy formatters
// in `finance.ts` and `design.ts` can read the latest value without
// triggering a circular import — finance.ts is a leaf util, can't
// depend on a hook file that imports it back.
//
// `useTenantCurrency.ts` is the canonical writer; this module just
// holds the state + the subscriber set.

export interface CurrencyConfig {
  currency: string;
  locale: string;
}

export const DEFAULT_CURRENCY: CurrencyConfig = { currency: 'MUR', locale: 'en-MU' };

let cached: CurrencyConfig | undefined; // undefined = not yet loaded
const subscribers = new Set<() => void>();

/** Sync read — returns the cached value or the MUR default. */
export function getCachedTenantCurrency(): CurrencyConfig {
  return cached ?? DEFAULT_CURRENCY;
}

/** `true` once the cache has been populated (even with a default). */
export function isCurrencyCacheLoaded(): boolean {
  return cached !== undefined;
}

/** Writes the cache + fires every subscriber. */
export function setCachedTenantCurrency(next: CurrencyConfig): void {
  cached = next;
  subscribers.forEach((fn) => fn());
}

/** Subscribe to cache updates. Returns an unsubscribe. */
export function subscribeToCurrency(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/** Test/SSR escape hatch. */
export function _resetCurrencyCacheForTests(): void {
  cached = undefined;
}
