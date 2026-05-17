'use client';

// Returns the user identity to render in the topbar avatar + dropdown.
// Two modes:
//
//   1. Friday Retreats staff — keyed off the FAD dev role-switcher
//      (TASK_USERS fixture in `_data/tasks.ts`). Keeps the demo
//      affordances working (View as · Director swaps the avatar).
//
//   2. SaaS tenants — derived from the JWT (display_name + username),
//      which the signup endpoint mints with the real user's email.
//      Initials computed deterministically from the display name.
//
// Why a single hook: the topbar avatar (Header.tsx:155) and the
// AvatarDropdown both needed the same identity but were each calling
// `TASK_USER_BY_ID[currentUserId]` directly — so non-FR tenants saw
// "Judith Friday" / "JF" because Judith is the first director in
// the fixture and `currentUserId` defaults to 'u-ishant' which
// resolves to her in the look-up. This hook centralises the resolver.

import { TASK_USER_BY_ID } from './tasks';
import { useCurrentUserId } from '../_components/usePermissions';
import { useTenantIdentity, FR_TENANT_ID } from './useTenantIdentity';

export interface DisplayedUser {
  /** Full display name — "Mathias Sercu" or "user@example.com". */
  name: string;
  /** 1–2 character initials for the avatar circle. */
  initials: string;
  /** Email address for the dropdown header. Empty string if unknown. */
  email: string;
  /** Hex colour for the avatar background. Deterministic from name. */
  avatarColor: string;
}

const FALLBACK: DisplayedUser = {
  name: 'Unknown user',
  initials: '?',
  email: '',
  avatarColor: '#64748b', // slate-500
};

// Pleasant, distinguishable palette for SaaS-tenant avatars. Index
// derived from a stable hash of the display name so each user keeps
// the same colour across sessions.
const AVATAR_PALETTE: string[] = [
  '#7c3aed', // violet
  '#0ea5e9', // sky
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ec4899', // pink
  '#ef4444', // red
  '#6366f1', // indigo
  '#14b8a6', // teal
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function initialsFor(nameOrEmail: string): string {
  if (!nameOrEmail) return '?';
  const localPart = nameOrEmail.includes('@') ? nameOrEmail.split('@')[0] : nameOrEmail;
  // Split on whitespace, dashes, dots, underscores — common name +
  // email-localpart separators.
  const parts = localPart.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(name: string): string {
  return AVATAR_PALETTE[hashString(name) % AVATAR_PALETTE.length];
}

export function useDisplayedUser(): DisplayedUser {
  const fadUserId = useCurrentUserId();
  const { tenantId, displayName, username } = useTenantIdentity();

  // Friday Retreats path — keep the dev-affordance behaviour where
  // the role-switcher changes which fixture user the topbar shows.
  if (tenantId === FR_TENANT_ID || tenantId === null) {
    const u = TASK_USER_BY_ID[fadUserId];
    if (u) {
      return {
        name: u.name,
        initials: u.initials,
        email: u.email ?? '',
        avatarColor: u.avatarColor,
      };
    }
  }

  // SaaS tenant — derive from JWT. Display name falls back to the
  // username (which is the email for tenant-signup users). Email is
  // username when it looks like an email, otherwise empty.
  const name = displayName || username || FALLBACK.name;
  const email = username && username.includes('@') ? username : '';
  return {
    name,
    initials: initialsFor(displayName || username || ''),
    email,
    avatarColor: colorFor(name),
  };
}
