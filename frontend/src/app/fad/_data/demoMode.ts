// Default FAD to live-only data. Demo data can still be re-enabled for
// frontend QA by setting NEXT_PUBLIC_FAD_DEMO_DATA=1 or localStorage
// fad:demo-data=1 in a dev browser.
export function demoDataEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_FAD_DEMO_DATA === '1') return true;
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage?.getItem?.('fad:demo-data') === '1';
  } catch {
    return false;
  }
}

export function liveOnlyMode(): boolean {
  return !demoDataEnabled();
}

export const LIVE_WIRED_MODULE_IDS = new Set([
  'inbox',
  'operations',
  'calendar',
  'properties',
  'reservations',
  'reviews',
  'hr',
  'design',
  'tenant-settings',
  'billing',
  'admin-analytics',
  'notifications',
  'settings',
  // Teaser modules have no row-level demo data; keep them visible in live-only
  // mode so FR can see the product surface without re-enabling fixtures.
  'syndic',
  'agency',
]);
