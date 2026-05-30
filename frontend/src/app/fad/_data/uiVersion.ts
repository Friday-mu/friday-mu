'use client';
// @demo:state — UI-version preference (Legacy `v1` ↔ V2 `v2`). Persisted to
// localStorage on this device for now. Production should mirror this onto a
// per-user/per-tenant column (exactly like `preferred_language` in
// backend/src/auth/session.js) and hydrate it via /api/auth/me, so a user's
// chosen interface follows them across devices. Tag: PROD-STATE-8.
//
// This is the seam for a future "pick your UI from a library of templates"
// capability: today it's a 2-value enum (Legacy ↔ V2). When real demand for
// more templates appears, widen `UiVersion` to a template id and turn the
// FadApp V2 renderer map into a multi-template registry — no call-site changes.
import { useEffect, useState } from 'react';

export type UiVersion = 'v1' | 'v2';

const KEY = 'fad:ui_version';
// Legacy is the default during the V2 build; flip to 'v2' once V2 is QA-complete.
const DEFAULT: UiVersion = 'v1';
const EVENT = 'fad:ui_version_change';

export function getUiVersion(): UiVersion {
  if (typeof window === 'undefined') return DEFAULT;
  return window.localStorage.getItem(KEY) === 'v2' ? 'v2' : 'v1';
}

export function setUiVersion(v: UiVersion): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, v);
  // Same-tab listeners (the native `storage` event only fires cross-tab).
  window.dispatchEvent(new CustomEvent(EVENT, { detail: v }));
}

/**
 * Reactive UI-version hook. Returns `[value, setter]`. Re-renders on change in
 * this tab (custom event) and other tabs (storage event). Hydrates after mount
 * so server/static render and first client render agree (no hydration mismatch).
 */
export function useUiVersion(): [UiVersion, (v: UiVersion) => void] {
  const [v, setV] = useState<UiVersion>(DEFAULT);
  useEffect(() => {
    setV(getUiVersion());
    const onCustom = (e: Event) => setV(((e as CustomEvent).detail as UiVersion) ?? getUiVersion());
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) setV(getUiVersion()); };
    window.addEventListener(EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return [v, setUiVersion];
}
