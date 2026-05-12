'use client';

// Owner-portal client — live data from /api/design/portal/* backed by the
// magic-link-authenticated endpoints in backend/src/design/portal.js. Mirrors
// the staff-side designClient.ts pattern (fetchers + hydration into fixture
// arrays) but uses a magic-link token instead of the staff JWT.
//
// Auth: the owner lands on /portal/auth?token=<jwt>, the auth client stashes
// the token in localStorage under PORTAL_TOKEN_KEY, and every request below
// sends it as `Authorization: Bearer <token>`. A 401 clears the token and
// the caller is expected to bounce the user back to /portal/auth.
//
// Hydration strategy: the legacy PortalContent (in fad/_components/.../portal)
// reads from the synchronous designClient + global fixture arrays. Rather
// than rewrite each tab to async/Suspense, we splice live API rows into the
// fixture arrays on mount — same playbook as the staff useHydrateDesignProject
// hook. Synchronous consumers automatically see real data after the first
// hydration completes; the `rev` counter forces a re-render.

import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../components/types';
import {
  PROJECTS as FIXTURE_PROJECTS,
  MOODBOARDS as FIXTURE_MOODBOARDS,
  DESIGN_PACKS as FIXTURE_PACKS,
  AGREEMENTS as FIXTURE_AGREEMENTS,
  PAYMENT_GATES as FIXTURE_PAYMENT_GATES,
  SELECTIONS as FIXTURE_SELECTIONS,
  CHANGE_ORDERS as FIXTURE_CHANGE_ORDERS,
  BUDGET_ITEMS as FIXTURE_BUDGET_ITEMS,
  ACTIVITY as FIXTURE_ACTIVITY,
} from '../app/fad/_data/design';
import type { DesignProject as FixtureProject } from '../app/fad/_data/design';
import {
  apiProjectToFixture,
  apiActivityToFixture,
  apiMoodboardToFixture,
  apiPackToFixture,
  apiAgreementToFixture,
  apiPaymentToFixture,
  type ApiProject,
  type ApiActivity,
  type ApiMoodboard,
  type ApiPack,
  type ApiAgreement,
  type ApiPaymentGate,
  type ApiSelection,
  type ApiChangeOrder,
  type ApiBudgetItem,
  type ApiCloseoutBinder,
} from '../app/fad/_data/designClient';

// ════════════════════════════════════════════════════════════════════
// AUTH / FETCH WRAPPER
// ════════════════════════════════════════════════════════════════════

export const PORTAL_TOKEN_KEY = 'portal_token';

export function getPortalToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(PORTAL_TOKEN_KEY);
}

export function setPortalToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PORTAL_TOKEN_KEY, token);
}

export function clearPortalToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PORTAL_TOKEN_KEY);
}

/**
 * Magic-link-authenticated fetch wrapper. Mirrors apiFetch from
 * components/types.ts but uses the portal-specific storage key.
 *
 * On 401: clears the stored token and throws — callers are expected to
 * route the user back to /portal/auth so a fresh magic link can be
 * minted by staff.
 */
export async function portalFetch(path: string, opts: RequestInit = {}): Promise<unknown> {
  const token = getPortalToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((opts.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (res.status === 401) {
    clearPortalToken();
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json();
}

const unwrap = <T,>(r: { results: T[] }): T[] => r.results || [];

// ════════════════════════════════════════════════════════════════════
// LOADERS — one per /api/design/portal/* endpoint
// ════════════════════════════════════════════════════════════════════

export const loadPortalProject = (): Promise<{ project: ApiProject }> =>
  portalFetch('/api/design/portal/me') as Promise<{ project: ApiProject }>;

export const loadPortalActivities = async (): Promise<ApiActivity[]> =>
  unwrap((await portalFetch('/api/design/portal/activities')) as { results: ApiActivity[] });

export const loadPortalAgreement = (): Promise<ApiAgreement | null> =>
  portalFetch('/api/design/portal/agreement') as Promise<ApiAgreement | null>;

export const loadPortalPayments = async (): Promise<ApiPaymentGate[]> =>
  unwrap((await portalFetch('/api/design/portal/payments')) as { results: ApiPaymentGate[] });

export const loadPortalMoodboards = async (): Promise<ApiMoodboard[]> =>
  unwrap((await portalFetch('/api/design/portal/moodboards')) as { results: ApiMoodboard[] });

export const loadPortalPacks = async (): Promise<ApiPack[]> =>
  unwrap((await portalFetch('/api/design/portal/packs')) as { results: ApiPack[] });

export const loadPortalSelections = async (): Promise<ApiSelection[]> =>
  unwrap((await portalFetch('/api/design/portal/selections')) as { results: ApiSelection[] });

export const loadPortalChangeOrders = async (): Promise<ApiChangeOrder[]> =>
  unwrap((await portalFetch('/api/design/portal/change_orders')) as { results: ApiChangeOrder[] });

export const loadPortalBudget = async (): Promise<ApiBudgetItem[]> =>
  unwrap((await portalFetch('/api/design/portal/budget')) as { results: ApiBudgetItem[] });

export const loadPortalCloseout = (): Promise<ApiCloseoutBinder | null> =>
  portalFetch('/api/design/portal/closeout') as Promise<ApiCloseoutBinder | null>;

export interface ApiPortalLogEntry {
  id: string;
  project_id: string;
  magic_link_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  user_agent: string | null;
  created_at: string;
}

export const loadPortalLog = async (): Promise<ApiPortalLogEntry[]> =>
  unwrap((await portalFetch('/api/design/portal/log')) as { results: ApiPortalLogEntry[] });

// ════════════════════════════════════════════════════════════════════
// MUTATIONS — owner actions
// ════════════════════════════════════════════════════════════════════

export const pickSelection = (id: string, optionId: string): Promise<ApiSelection> =>
  portalFetch(`/api/design/portal/selections/${id}/pick`, {
    method: 'POST',
    body: JSON.stringify({ picked_option_id: optionId }),
  }) as Promise<ApiSelection>;

export const requestSelectionChanges = (id: string, comment?: string): Promise<ApiSelection> =>
  portalFetch(`/api/design/portal/selections/${id}/request-changes`, {
    method: 'POST',
    body: JSON.stringify({ comment }),
  }) as Promise<ApiSelection>;

export const respondToApproval = (
  approvalId: string,
  decision: 'approved' | 'rejected',
  comment?: string,
): Promise<{ approval_id: string; status: string; event_id: string }> =>
  portalFetch(`/api/design/portal/approvals/${approvalId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ decision, comment }),
  }) as Promise<{ approval_id: string; status: string; event_id: string }>;

// ════════════════════════════════════════════════════════════════════
// HYDRATION — splice portal API rows into the fixture arrays so the
// existing synchronous PortalContent + tab components see real data.
// ════════════════════════════════════════════════════════════════════

function removeMatching<T>(target: T[], pred: (row: T) => boolean): void {
  for (let i = target.length - 1; i >= 0; i--) {
    if (pred(target[i])) target.splice(i, 1);
  }
}

function upsertProject(target: FixtureProject[], next: FixtureProject): void {
  const idx = target.findIndex((p) => p.id === next.id);
  if (idx >= 0) target[idx] = next;
  else target.push(next);
}

/** One-shot hydration: fetches /me + every per-project resource and splices
 *  the global fixture arrays so PortalContent (and the OverviewTab, DocsTab,
 *  ApprovalsTab, BudgetTab, ProgressTab, ActivityTab, HandoverTab components
 *  that read through `designClient`) pick up live data on the next render. */
export async function hydratePortal(): Promise<{ project: FixtureProject }> {
  const { project: apiProject } = await loadPortalProject();
  const projectId = apiProject.id;
  const fixtureProject = apiProjectToFixture(apiProject);
  upsertProject(FIXTURE_PROJECTS, fixtureProject);

  const [
    activities,
    agreement,
    payments,
    moodboards,
    packs,
    selections,
    changeOrders,
    budgetItems,
  ] = await Promise.all([
    loadPortalActivities().catch(() => [] as ApiActivity[]),
    loadPortalAgreement().catch(() => null),
    loadPortalPayments().catch(() => [] as ApiPaymentGate[]),
    loadPortalMoodboards().catch(() => [] as ApiMoodboard[]),
    loadPortalPacks().catch(() => [] as ApiPack[]),
    loadPortalSelections().catch(() => [] as ApiSelection[]),
    loadPortalChangeOrders().catch(() => [] as ApiChangeOrder[]),
    loadPortalBudget().catch(() => [] as ApiBudgetItem[]),
  ]);

  removeMatching(FIXTURE_ACTIVITY, (a) => (a as { projectId: string }).projectId === projectId);
  FIXTURE_ACTIVITY.push(...activities.map(apiActivityToFixture));

  removeMatching(FIXTURE_MOODBOARDS, (m) => m.projectId === projectId);
  FIXTURE_MOODBOARDS.push(...moodboards.map(apiMoodboardToFixture));

  removeMatching(FIXTURE_PACKS, (p) => p.projectId === projectId);
  FIXTURE_PACKS.push(...packs.map(apiPackToFixture));

  removeMatching(FIXTURE_AGREEMENTS, (a) => (a as { projectId: string }).projectId === projectId);
  if (agreement) FIXTURE_AGREEMENTS.push(apiAgreementToFixture(agreement));

  removeMatching(FIXTURE_PAYMENT_GATES, (g) => (g as { projectId: string }).projectId === projectId);
  FIXTURE_PAYMENT_GATES.push(...payments.map(apiPaymentToFixture));

  // Selections / change orders / budget items: fixture shapes are richer than
  // the API payload and have no dedicated adapter yet — cast through unknown,
  // mirroring the staff-side hydrateDesignProject pattern. The portal /budget
  // endpoint already strips retail / negotiated / internal_work server-side,
  // so the sensitive fields are absent regardless.
  removeMatching(FIXTURE_SELECTIONS, (s) => (s as { projectId: string }).projectId === projectId);
  FIXTURE_SELECTIONS.push(...(selections as unknown as Array<(typeof FIXTURE_SELECTIONS)[number]>));

  removeMatching(FIXTURE_CHANGE_ORDERS, (c) => (c as { projectId: string }).projectId === projectId);
  FIXTURE_CHANGE_ORDERS.push(...(changeOrders as unknown as Array<(typeof FIXTURE_CHANGE_ORDERS)[number]>));

  removeMatching(FIXTURE_BUDGET_ITEMS, (b) => (b as { projectId: string }).projectId === projectId);
  FIXTURE_BUDGET_ITEMS.push(...(budgetItems as unknown as Array<(typeof FIXTURE_BUDGET_ITEMS)[number]>));

  return { project: fixtureProject };
}

// ════════════════════════════════════════════════════════════════════
// HOOK — useHydratePortal
// ════════════════════════════════════════════════════════════════════

export interface UseHydratePortalResult {
  project: FixtureProject | null;
  loading: boolean;
  error: string | null;
  rev: number;
  refetch: () => void;
}

/** Main entry hook for the portal. On mount: reads the magic-link token from
 *  storage (or `?token=` URL param as fallback, in which case it's persisted),
 *  fetches /me + every per-project resource, and hydrates the fixture arrays.
 *  Returns `{ project, loading, error, rev }`. Consumers that already render
 *  through the synchronous designClient simply re-render when `rev` ticks. */
export function useHydratePortal(): UseHydratePortalResult {
  const [project, setProject] = useState<FixtureProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);

  const refetch = useCallback(() => {
    // URL-param fallback: if no token in localStorage but `?token=` is set on
    // the current page, promote it. Lets a /portal/projects/[slug]?token=...
    // deep link bootstrap without a round-trip through /portal/auth.
    if (typeof window !== 'undefined' && !getPortalToken()) {
      const urlToken = new URLSearchParams(window.location.search).get('token');
      if (urlToken) setPortalToken(urlToken);
    }
    // If still no token, don't bother firing a request that will 401. Caller
    // is expected to route to /portal/auth based on the absence of a token.
    if (!getPortalToken()) {
      setLoading(false);
      setError('Missing portal token');
      return;
    }
    setLoading(true);
    setError(null);
    hydratePortal()
      .then(({ project: p }) => {
        setProject(p);
        setRev((r) => r + 1);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { project, loading, error, rev, refetch };
}
