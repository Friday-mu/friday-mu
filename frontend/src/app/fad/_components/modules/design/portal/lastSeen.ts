// Per-tab "what's new since you last visited" tracking for the owner portal.
//
// Stored as ISO timestamps in localStorage under
// `portal:lastSeen:<slug>:<tab>`. Each tab is independently tracked so an
// owner who reads Approvals doesn't dismiss new items in Documents.
//
// Pure client-side. v0.2 backend equivalent: per-token last-seen state on
// the portal session record, keyed off magic-link clicks.
//
// @demo:state — Replace with backend session storage. Tag:
// PROD-DESIGN-PORTAL-LASTSEEN.

import type { PortalTab } from './types';

function key(slug: string, tab: PortalTab): string {
  return `portal:lastSeen:${slug}:${tab}`;
}

export function getLastSeen(slug: string, tab: PortalTab): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key(slug, tab));
  } catch {
    return null;
  }
}

export function markSeen(slug: string, tab: PortalTab, at: string = new Date().toISOString()): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key(slug, tab), at);
  } catch {
    // localStorage can fail in private mode — ignore.
  }
}

/** Helper for the count callers. Treats `null` lastSeen as "first visit ever
 *  — count everything." Returns true when the candidate timestamp is strictly
 *  newer than what the owner has seen. */
export function isNewSince(candidate: string | null, lastSeen: string | null): boolean {
  if (!candidate) return false;
  if (!lastSeen) return true;
  return candidate > lastSeen;
}
