'use client';

import { useEffect, useMemo, useState } from 'react';
import { designClient, type DesignProject } from '../../../fad/_data/design';
import { PortalContent } from '../../../fad/_components/modules/design/portal/PortalContent';

interface Props {
  slug: string;
}

interface PortalSession {
  projectSlug: string;
  ownerId: string;
  portalSession: string;
  expiresAt: string;
}

type SessionState =
  | { phase: 'loading' }
  | { phase: 'redirecting'; reason: string }
  | { phase: 'ready'; project: DesignProject; session: PortalSession };

/**
 * Owner-side standalone portal route.
 *
 * @demo:auth — session validation is localStorage-only, written by /portal/auth
 * after the magic-link JWT validates. Tag: PROD-DESIGN-PORTAL-AUTH.
 */
export function PortalProjectClient({ slug }: Props) {
  const project = useMemo(() => designClient.projects.getBySlug(slug), [slug]);
  const [state, setState] = useState<SessionState>({ phase: 'loading' });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!project) {
      setState({ phase: 'redirecting', reason: 'unknown_project' });
      return;
    }
    const raw = window.localStorage.getItem(sessionKey(slug));
    if (!raw) {
      setState({ phase: 'redirecting', reason: 'session_required' });
      window.location.replace(
        `/portal/auth?error=session_required&slug=${encodeURIComponent(slug)}`,
      );
      return;
    }
    let parsed: Partial<PortalSession> | null = null;
    try {
      parsed = JSON.parse(raw) as Partial<PortalSession>;
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
      setState({ phase: 'redirecting', reason: 'scope_mismatch' });
      window.location.replace(
        `/portal/auth?error=scope_mismatch&slug=${encodeURIComponent(slug)}`,
      );
      return;
    }
    if (new Date(parsed.expiresAt).getTime() < Date.now()) {
      window.localStorage.removeItem(sessionKey(slug));
      setState({ phase: 'redirecting', reason: 'expired' });
      window.location.replace(
        `/portal/auth?error=expired&slug=${encodeURIComponent(slug)}`,
      );
      return;
    }
    setState({ phase: 'ready', project, session: parsed as PortalSession });
  }, [project, slug]);

  if (state.phase === 'loading') {
    return (
      <div className="portal-state">
        <p>Loading your project…</p>
      </div>
    );
  }

  if (state.phase === 'redirecting') {
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
    <PortalContent project={state.project} portalSession={state.session.portalSession} />
  );
}

export function sessionKey(slug: string): string {
  return `portal:session:${slug}`;
}
