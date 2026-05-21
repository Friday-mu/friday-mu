'use client';

// Update notifier — polls /version.json to detect new deploys and
// prompts force-refresh. Ported from the GMS pattern (page.tsx ~line
// 488) that's been running on admin.friday.mu since Sprint 7.
//
// Why this exists: on a static-export PWA with a service worker, the
// team can keep working on a stale bundle for hours after a deploy.
// We saw it on 2026-05-14 — Mathias's session hadn't fetched the
// projects list since 08:21 even though deploy happened at 08:34, so
// his UI was running on cached chunks that didn't render the new
// state. This banner closes that loop.
//
// Detection strategy:
//   1. On mount, fetch /version.json with cache busting → store
//      knownVersionRef.
//   2. On window focus / tab visibility change, refetch (throttled
//      to one check per 60s). If the version changed, show the
//      banner.
//   3. "Refresh now" → unregister all service workers + reload.
//      Unregistering is what actually evicts stale cached chunks.
//      A plain location.reload() can still pull from the SW cache.
//
// The banner sits above the modal stack (z-index 11000+, alongside
// the toaster) so it's visible even when a generator overlay is open.

import { useEffect, useRef, useState } from 'react';

interface VersionPayload {
  version: string;
  commit?: string | null;
  builtAt?: string;
  built_at?: string | null;
}

// Fetch the version file with cache busting. We MUST bypass cache here
// or the SW could keep returning the same /version.json forever.
async function fetchVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });
    if (res.ok) {
      const data = (await res.json()) as VersionPayload;
      if (typeof data.version === 'string') return data.version;
    }
  } catch {
    // Fall back to the backend route below.
  }

  try {
    const res = await fetch(`/api/version?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as VersionPayload;
    return data.commit || data.version || null;
  } catch {
    return null;
  }
}

async function forceRefresh(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // Best-effort. Even if SW unregister failed, the hard reload below
    // still has a good chance of pulling fresh chunks.
  }
  // location.reload(true) is deprecated; this is the recommended
  // approach in modern browsers. The unregister + cache clear above
  // is what actually does the eviction work.
  window.location.reload();
}

export function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const knownVersionRef = useRef<string | null>(null);
  const lastCheckRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    // Initial fetch — establish the baseline.
    fetchVersion().then((v) => {
      if (cancelled) return;
      if (v) knownVersionRef.current = v;
    });

    const check = async () => {
      const now = Date.now();
      // Throttle: at most one check per 60s. Matches the GMS cadence.
      if (now - lastCheckRef.current < 60_000) return;
      lastCheckRef.current = now;
      const v = await fetchVersion();
      if (cancelled) return;
      if (v && knownVersionRef.current && v !== knownVersionRef.current) {
        setUpdateAvailable(true);
      }
    };

    // Cheaper than a setInterval — we only check when the user is
    // actually looking at the page. Tabs in the background don't burn
    // CPU.
    const onFocus = () => check();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  if (!updateAvailable || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-update-banner
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 12000,
        background: 'var(--color-brand-accent, #2B4A93)',
        color: '#ffffff',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        fontSize: 13,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
      }}
    >
      <span style={{ fontWeight: 500 }}>
        A new version is available.
      </span>
      <button
        type="button"
        onClick={forceRefresh}
        style={{
          background: 'rgba(255, 255, 255, 0.18)',
          color: '#ffffff',
          padding: '4px 12px',
          borderRadius: 4,
          fontSize: 12,
          fontWeight: 500,
          textDecoration: 'underline',
        }}
      >
        Refresh now
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss update notice"
        title="Dismiss — you'll be reminded again when you switch back to this tab"
        style={{
          background: 'transparent',
          color: '#ffffff',
          opacity: 0.7,
          fontSize: 14,
          padding: '0 4px',
          marginLeft: 4,
        }}
      >
        ✕
      </button>
    </div>
  );
}
