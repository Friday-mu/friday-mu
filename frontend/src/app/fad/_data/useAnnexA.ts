'use client';

// useAnnexA — fetch /api/design/annex_a once per session and hot-patch
// ANNEX_A_DEFAULT with any per-tenant overrides (VAT rate, date format,
// currency, etc.) so downstream code that reads
// `designClient.settings.annexA()` picks up the live values.
//
// Lighter version chosen (per the tier-2 handover):
//   The hardcode `vatRate: 0.15` sits in a non-React export
//   (ANNEX_A_DEFAULT) that's read by ~10 pure helper functions
//   (withVAT, vatOf, tierForEpc, designFeeForTier, …). Refactoring
//   every helper to receive an injected config would balloon the
//   blast radius. Instead we hot-patch the in-memory ANNEX_A_DEFAULT
//   on first successful fetch — the same pattern the existing
//   localStorage `loadAnnexAOverrides()` uses.
//
// React components mount the hook to trigger the fetch; non-React
// helpers keep reading ANNEX_A_DEFAULT.vatRate which is now the
// tenant's live rate after first paint.
//
// Caching:
//   Module-scope promise — every component that mounts the hook
//   awaits the same in-flight request. A re-mount after success
//   short-circuits via `cachedData`. There's no TTL: the user
//   navigating to Tenant Settings → Brand and saving a change
//   should call refetch() explicitly (see TenantSettingsModule).

import { useEffect, useState, useCallback } from 'react';
import { loadAnnexA, type ApiAnnexA } from './designClient';
import { ANNEX_A_DEFAULT } from './design';

interface UseAnnexAResult {
  data: ApiAnnexA | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

let cachedData: ApiAnnexA | null = null;
let cachedError: string | null = null;
let inFlight: Promise<void> | null = null;
let patchApplied = false;

// Pull the VAT rate out of the response. Mig 015 stores it inside the
// JSONB `annex_a` blob as `vatRate` (camelCase). If a future migration
// promotes it to a top-level column, accept either shape.
function extractVatRate(payload: ApiAnnexA): number | null {
  const anyP = payload as unknown as { vat_rate?: number; annex_a?: Record<string, unknown> };
  if (typeof anyP.vat_rate === 'number' && Number.isFinite(anyP.vat_rate)) return anyP.vat_rate;
  const fromJsonb = anyP.annex_a?.vatRate;
  if (typeof fromJsonb === 'number' && Number.isFinite(fromJsonb)) return fromJsonb;
  return null;
}

function applyPatch(payload: ApiAnnexA): void {
  if (patchApplied) return;
  const vr = extractVatRate(payload);
  if (vr != null) {
    ANNEX_A_DEFAULT.vatRate = vr;
  }
  patchApplied = true;
}

async function doFetch(): Promise<void> {
  try {
    const r = await loadAnnexA();
    cachedData = r;
    cachedError = null;
    applyPatch(r);
  } catch (e) {
    cachedError = e instanceof Error ? e.message : String(e);
  } finally {
    inFlight = null;
  }
}

/**
 * Subscribe to the tenant's Annex A row. Triggers a fetch on first
 * mount; subsequent mounts reuse the cached payload. Side-effect:
 * on first success, mutates ANNEX_A_DEFAULT.vatRate to the tenant's
 * live VAT rate so non-React helpers (withVAT / vatOf / …) read
 * the right value.
 */
export function useAnnexA(): UseAnnexAResult {
  const [, forceRender] = useState(0);

  const refetch = useCallback(async () => {
    // Allow the patch to re-apply after an explicit refetch — Tenant
    // Settings → Brand saves a new vat_rate, we want it to land.
    patchApplied = false;
    inFlight = doFetch();
    await inFlight;
    forceRender((n) => n + 1);
  }, []);

  useEffect(() => {
    if (cachedData || cachedError) return;
    if (!inFlight) inFlight = doFetch();
    let cancelled = false;
    inFlight.then(() => { if (!cancelled) forceRender((n) => n + 1); });
    return () => { cancelled = true; };
  }, []);

  return {
    data: cachedData,
    loading: !cachedData && !cachedError,
    error: cachedError,
    refetch,
  };
}

/** Test/SSR escape hatch — reset module state. Not used in app code. */
export function __resetAnnexACache(): void {
  cachedData = null;
  cachedError = null;
  inFlight = null;
  patchApplied = false;
}
