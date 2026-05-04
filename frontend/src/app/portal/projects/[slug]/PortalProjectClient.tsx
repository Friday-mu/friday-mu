'use client';

import { useEffect, useMemo, useState } from 'react';
import { designClient, type DesignProject } from '../../../fad/_data/design';
import { PortalContent } from '../../../fad/_components/modules/design/portal/PortalContent';

interface Props {
  slug: string;
}

type SessionState =
  | { phase: 'loading' }
  | { phase: 'redirecting'; reason: string }
  | { phase: 'ready'; project: DesignProject };

/**
 * Owner-side standalone portal route.
 *
 * @demo:auth — session check is localStorage-only, written by /portal/auth
 * after a magic-link validates. Tag: PROD-DESIGN-PORTAL-AUTH.
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
      // No session yet — redirect to /portal/auth so the magic-link handler can
      // either pick a fresh token from the URL or ask the owner to request one.
      setState({ phase: 'redirecting', reason: 'session_required' });
      window.location.replace(`/portal/auth?error=session_required&slug=${encodeURIComponent(slug)}`);
      return;
    }
    // Phase 4: any value passes. Phase 5 swaps this for JWT signature + scope
    // (`pid` claim must match this slug, `exp` must be in the future).
    let parsed: { projectSlug?: string } | null = null;
    try {
      parsed = JSON.parse(raw) as { projectSlug?: string };
    } catch {
      parsed = null;
    }
    if (!parsed || parsed.projectSlug !== slug) {
      setState({ phase: 'redirecting', reason: 'scope_mismatch' });
      window.location.replace(`/portal/auth?error=scope_mismatch&slug=${encodeURIComponent(slug)}`);
      return;
    }
    setState({ phase: 'ready', project });
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
          Your session has expired or the link doesn't match this project. We're sending you back
          so Friday can issue a new one.
        </p>
      </div>
    );
  }

  return <PortalContent project={state.project} />;
}

export function sessionKey(slug: string): string {
  return `portal:session:${slug}`;
}
