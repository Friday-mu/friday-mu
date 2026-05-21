'use client';

import { useEffect, useMemo, useState } from 'react';
import { designClient, type DesignProject } from '../../../fad/_data/design';
import { PortalContent } from '../../../fad/_components/modules/design/portal/PortalContent';
import {
  clearPortalToken,
  getPortalToken,
  useHydratePortal,
} from '../../../../lib/portalClient';

interface Props {
  slug: string;
}

interface DemoPortalSession {
  projectSlug: string;
  ownerId: string;
  portalSession: string;
  expiresAt: string;
}

type DemoState =
  | { phase: 'checking' }
  | { phase: 'no_demo' }
  | { phase: 'redirecting'; reason: string }
  | { phase: 'ready'; project: DesignProject; session: DemoPortalSession };

/**
 * Owner-side standalone portal route.
 *
 * Two auth paths supported:
 *
 *   1. Live magic link (design-be-6d): the portal token is in
 *      `localStorage.portal_token`, written by /portal/auth after the
 *      backend validated it via /api/design/portal/me. useHydratePortal
 *      fetches the project + per-resource artifacts and splices them
 *      into the global fixture arrays so PortalContent renders live data.
 *
 *   2. Mock demo session (@demo:ui): the in-FAD sample-portal CTA mints
 *      a mock JWT and writes a `portal:session:<slug>` entry. This is
 *      preserved for the staff preview surface only and is removed in
 *      v0.2.  Tag: PROD-DESIGN-PORTAL-AUTH.
 *
 * The live path takes precedence — if a portal_token exists we always go
 * through useHydratePortal regardless of any stale demo entry. The demo
 * branch only activates when no live token is present.
 */
export function PortalProjectClient({ slug }: Props) {
  // Snapshot whether a live token is present at first render. We re-read
  // on retry / refetch, but switching to the demo branch mid-mount would
  // race with hydration.
  const [hasLiveToken, setHasLiveToken] = useState<boolean>(() =>
    typeof window === 'undefined' ? false : Boolean(getPortalToken()),
  );
  const live = useHydratePortal();

  // ─── live path ────────────────────────────────────────────────────────
  // useHydratePortal always runs the effect; we only act on its output if
  // a token was present. On a 401 the wrapper clears storage, error fires
  // here, and we bounce to /portal/auth.
  useEffect(() => {
    if (!hasLiveToken || typeof window === 'undefined') return;
    if (!live.error) return;
    if (live.error === 'Unauthorized') {
      // Token was bad — wrapper already cleared it. Send the owner back so
      // staff can mint a fresh link.
      window.location.replace(
        `/portal/auth?error=session_required&slug=${encodeURIComponent(slug)}`,
      );
    }
  }, [hasLiveToken, live.error, slug]);

  // Once live hydration finishes, sanity-check the slug matches. If the
  // token is bound to a different project, send them through auth to
  // surface the scope_mismatch message.
  useEffect(() => {
    if (!hasLiveToken || typeof window === 'undefined') return;
    if (!live.project) return;
    if (live.project.slug && live.project.slug !== slug) {
      window.location.replace(`/portal/projects/${live.project.slug}`);
    }
  }, [hasLiveToken, live.project, slug]);

  // ─── demo path (legacy, preserved behind no-live-token branch) ────────
  const demoProject = useMemo(
    () => designClient.projects.getBySlug(slug),
    [slug],
  );
  const [demoState, setDemoState] = useState<DemoState>({ phase: 'checking' });

  useEffect(() => {
    if (hasLiveToken) return;
    if (typeof window === 'undefined') return;
    if (!demoProject) {
      setDemoState({ phase: 'redirecting', reason: 'unknown_project' });
      return;
    }
    const raw = window.localStorage.getItem(demoSessionKey(slug));
    if (!raw) {
      setDemoState({ phase: 'redirecting', reason: 'session_required' });
      window.location.replace(
        `/portal/auth?error=session_required&slug=${encodeURIComponent(slug)}`,
      );
      return;
    }
    let parsed: Partial<DemoPortalSession> | null = null;
    try {
      parsed = JSON.parse(raw) as Partial<DemoPortalSession>;
    } catch {
      parsed = null;
    }
    if (
      !parsed ||
      parsed.projectSlug !== slug ||
      !parsed.ownerId ||
      !parsed.portalSession ||
      !parsed.expiresAt
    ) {
      setDemoState({ phase: 'redirecting', reason: 'scope_mismatch' });
      window.location.replace(
        `/portal/auth?error=scope_mismatch&slug=${encodeURIComponent(slug)}`,
      );
      return;
    }
    if (new Date(parsed.expiresAt).getTime() < Date.now()) {
      window.localStorage.removeItem(demoSessionKey(slug));
      setDemoState({ phase: 'redirecting', reason: 'expired' });
      window.location.replace(
        `/portal/auth?error=expired&slug=${encodeURIComponent(slug)}`,
      );
      return;
    }
    setDemoState({
      phase: 'ready',
      project: demoProject,
      session: parsed as DemoPortalSession,
    });
  }, [hasLiveToken, demoProject, slug]);

  const handleBackToLogin = () => {
    clearPortalToken();
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(demoSessionKey(slug));
      setHasLiveToken(false);
      window.location.replace('/portal/auth');
    }
  };

  // ─── render ───────────────────────────────────────────────────────────
  if (hasLiveToken) {
    if (live.loading) {
      return (
        <div className="portal-state">
          <p>Loading your project…</p>
        </div>
      );
    }
    if (live.error) {
      // Non-401 error from the backend. Show inline so the owner has a
      // path forward without losing the token (which might still be valid).
      return (
        <div className="portal-state">
          <h1>We couldn't load your project.</h1>
          <p>Please try again. If this keeps happening, ask Friday for a fresh link.</p>
          <button type="button" className="portal-cta" onClick={live.refetch}>
            Try again
          </button>
          <button
            type="button"
            className="portal-cta-secondary"
            onClick={handleBackToLogin}
            style={{ marginTop: 12 }}
          >
            Back to login
          </button>
        </div>
      );
    }
    if (!live.project) {
      return (
        <div className="portal-state">
          <p>Loading your project…</p>
        </div>
      );
    }
    return (
      <PortalContent
        project={live.project}
        portalSession="portal-token"
        onBackToLogin={handleBackToLogin}
      />
    );
  }

  // Demo / legacy mock-session branch.
  if (demoState.phase === 'checking') {
    return (
      <div className="portal-state">
        <p>Loading your project…</p>
      </div>
    );
  }
  if (demoState.phase === 'no_demo' || demoState.phase === 'redirecting') {
    return (
      <div className="portal-state">
        <h1>You'll need a fresh link.</h1>
        <p>
          Your session has expired or doesn't match this project. We're sending you back so Friday
          can issue a new one.
        </p>
      </div>
    );
  }
  return (
    <PortalContent
      project={demoState.project}
      portalSession={demoState.session.portalSession}
      onBackToLogin={handleBackToLogin}
    />
  );
}

/** @demo:ui — legacy mock-session storage key. Retained for the in-FAD
 *  sample-portal CTA. Tag: PROD-DESIGN-PORTAL-AUTH. */
export function sessionKey(slug: string): string {
  return demoSessionKey(slug);
}

function demoSessionKey(slug: string): string {
  return `portal:session:${slug}`;
}
