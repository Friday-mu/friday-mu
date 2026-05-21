'use client';

// Tenant currency + locale lookup — fetches /api/tenants/me once per
// session and caches `currency_code` + `locale`. Used by the
// `useFormatMoney()` hook to render money in the SaaS tenant's
// currency rather than Friday Retreats' hardcoded MUR.
//
// Currency lives on the tenant row (mig 035 added currency_code to
// design_annex_a; tenants table has it directly from mig 036). The
// JWT doesn't carry it, so we have to fetch. Modelled on
// `useTenantCountry.ts` — same single-fetch + module-cache pattern.

import { useEffect, useState } from 'react';
import { apiFetch } from '../../../components/types';
import { formatMoney } from './finance';
import {
  DEFAULT_CURRENCY,
  getCachedTenantCurrency,
  isCurrencyCacheLoaded,
  setCachedTenantCurrency,
  subscribeToCurrency,
  type CurrencyConfig,
} from './currencyCache';

interface TenantMeRow {
  id: string;
  // The tenants table calls it `locale`; per-project currency lives
  // in `design_annex_a.currency_code`. For the live tenant-default
  // money formatter we want the TENANT-level setting — `currency_code`
  // doesn't yet exist on the tenants row (mig 035 put it on annex_a),
  // so we read annex_a's currency for now and fall back to MUR.
  locale: string | null;
}

interface AnnexARow {
  currency_code: string | null;
  date_format: string | null;
}

let inFlight: Promise<void> | null = null;

async function load(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      // annex_a holds currency_code (mig 035). Fetch both in parallel
      // — tenants/me for locale, annex_a for currency. Either failing
      // falls back to MUR / en-MU.
      const [tenantRow, annexARow] = await Promise.all([
        apiFetch('/api/tenants/me').catch(() => null) as Promise<TenantMeRow | null>,
        apiFetch('/api/design/annex_a').catch(() => null) as Promise<AnnexARow | null>,
      ]);
      setCachedTenantCurrency({
        currency: annexARow?.currency_code || DEFAULT_CURRENCY.currency,
        locale: tenantRow?.locale || DEFAULT_CURRENCY.locale,
      });
    } catch {
      setCachedTenantCurrency(DEFAULT_CURRENCY);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Mount this once near the top of the app tree (FadApp + each
 * standalone SaaS page like /signup, /onboarding, /reset-password).
 * Kicks off the lazy fetch and subscribes the calling component so
 * the first render after the cache fills re-runs — which propagates
 * to every child via React reconciliation, so the legacy `formatMUR`
 * call sites (now backed by `currencyCache`) flip from "Rs" to the
 * tenant's currency without per-call hook plumbing.
 */
export function useTenantCurrency(): CurrencyConfig {
  const [cfg, setCfg] = useState<CurrencyConfig>(getCachedTenantCurrency());

  useEffect(() => {
    const unsubscribe = subscribeToCurrency(() => {
      setCfg(getCachedTenantCurrency());
    });
    if (!isCurrencyCacheLoaded() && !inFlight) {
      void load();
    } else {
      setCfg(getCachedTenantCurrency());
    }
    return unsubscribe;
  }, []);

  return cfg;
}

/**
 * Returns a `(minor) => string` formatter bound to the current
 * tenant's currency + locale. New code should prefer this hook over
 * the legacy `formatMUR` shim — type-safer, no module-state leak,
 * and makes the intent explicit.
 */
export function useFormatMoney(): (minor: number | null) => string {
  const { currency, locale } = useTenantCurrency();
  return (minor) => formatMoney(minor, currency, locale);
}

// Re-export the cache reader for convenience (e.g., signup flow).
export { getCachedTenantCurrency };
