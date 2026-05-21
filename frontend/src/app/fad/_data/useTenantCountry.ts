'use client';

// Tenant country lookup — fetches /api/tenants/me once per session and
// caches the ISO-2 country code. Used to gate region-specific UI
// (e.g., the CIA Mauritius compliance panel renders only when
// tenant.country === 'MU').
//
// Country lives on the tenant row (migration 036 saas_scaffolding) and
// isn't in the JWT, so we have to fetch it. Kept separate from
// useTenantIdentity (which decodes JWT-only fields) so the JWT helper
// stays sync-friendly.

import { useEffect, useState } from 'react';
import { apiFetch } from '../../../components/types';

let cached: string | null | undefined = undefined; // undefined = not loaded yet

interface TenantMeRow {
  id: string;
  country: string | null;
}

export function _resetTenantCountryCacheForTests(): void {
  cached = undefined;
}

/**
 * Returns the tenant's ISO-2 country code, or `null` if still loading
 * or the tenant has no country set. Components can render unconditionally
 * and bail out (return null / hide section) when this is null.
 */
export function useTenantCountry(): string | null {
  const [country, setCountry] = useState<string | null>(cached ?? null);

  useEffect(() => {
    if (cached !== undefined) {
      setCountry(cached);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const row = (await apiFetch('/api/tenants/me')) as TenantMeRow;
        cached = row?.country ?? null;
        if (!cancelled) setCountry(cached);
      } catch {
        cached = null;
        if (!cancelled) setCountry(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return country;
}
