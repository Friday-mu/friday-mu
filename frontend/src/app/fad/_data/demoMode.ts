// Default FAD to live-only data. Demo data can still be re-enabled for
// frontend QA by setting NEXT_PUBLIC_FAD_DEMO_DATA=1, or by using the
// localStorage override on local/dev hosts only.
function localDemoOverrideAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || host.endsWith('.local');
}

export function demoDataEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_FAD_DEMO_DATA === '1') return true;
  if (typeof window === 'undefined') return false;
  if (!localDemoOverrideAllowed()) return false;
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
  'training',
  // Teaser modules have no row-level demo data; keep them visible in live-only
  // mode so FR can see the product surface without re-enabling fixtures.
  'syndic',
  'agency',
]);
