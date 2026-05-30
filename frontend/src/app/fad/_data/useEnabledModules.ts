'use client';

// SaaS module gating — fetches `GET /api/tenants/me/modules` once per session
// and exposes the enabled-module set to the Sidebar + FadApp. Module-scoped
// cache prevents refetch on every consumer mount; call `refetch()` after
// admin actions that toggle modules.
//
// During the initial load (cache empty) we return `enabledSet = null` and
// `loading = true` — callers should render the FULL module list until the
// fetch settles, so the sidebar doesn't flash empty.

import { useEffect, useState } from 'react';
import { apiFetch } from '../../../components/types';

export interface AvailableModule {
  key: string;
  name: string;
  description: string;
  saleable: boolean;
  monthly_price_usd: number | null;
  enabled: boolean;
}

interface ModulesResponse {
  enabled: string[];
  available: AvailableModule[];
}

interface CacheState {
  enabledSet: Set<string> | null;
  available: AvailableModule[] | null;
  loading: boolean;
  error: string | null;
}

// Module-scoped cache — survives component remounts within a session.
let cache: CacheState = {
  enabledSet: null,
  available: null,
  loading: false,
  error: null,
};
let inFlight: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((fn) => fn());
}

async function load(): Promise<void> {
  if (inFlight) return inFlight;
  cache = { ...cache, loading: true, error: null };
  notify();
  inFlight = (async () => {
    try {
      const res = (await apiFetch('/api/tenants/me/modules')) as ModulesResponse;
      cache = {
        enabledSet: new Set(res.enabled || []),
        available: res.available || [],
        loading: false,
        error: null,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 401: apiFetch already cleared the token. Redirect to /, same pattern
      // as FadApp's auth guard. Reset cache so the next mount retries.
      if (msg === 'Unauthorized') {
        if (typeof window !== 'undefined') {
          window.location.href = '/';
        }
        cache = { enabledSet: null, available: null, loading: false, error: msg };
      } else {
        cache = { ...cache, loading: false, error: msg };
      }
    } finally {
      inFlight = null;
      notify();
    }
  })();
  return inFlight;
}

export interface UseEnabledModulesResult {
  /** null until the first fetch settles. Sidebar should render full list while null. */
  enabledSet: Set<string> | null;
  available: AvailableModule[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useEnabledModules(): UseEnabledModulesResult {
  const [, force] = useState(0);

  useEffect(() => {
    const sub = () => force((v) => v + 1);
    subscribers.add(sub);
    // Kick off the load if we haven't yet
    if (cache.enabledSet === null && !cache.loading && !cache.error) {
      void load();
    }
    return () => {
      subscribers.delete(sub);
    };
  }, []);

  return {
    enabledSet: cache.enabledSet,
    available: cache.available,
    loading: cache.loading,
    error: cache.error,
    refetch: () => {
      // Force re-fetch: clear cache + trigger
      cache = { enabledSet: null, available: null, loading: false, error: null };
      void load();
    },
  };
}

/** Test/SSR escape hatch. Not used in production. */
export function _resetEnabledModulesCacheForTests() {
  cache = { enabledSet: null, available: null, loading: false, error: null };
  inFlight = null;
}
