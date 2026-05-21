'use client';

import { useEffect, useState } from 'react';
import {
  designClient,
  signMockToken,
  type MockJwtClaims,
} from '../../fad/_data/design';
import {
  clearPortalToken,
  loadPortalProject,
  setPortalToken,
} from '../../../lib/portalClient';

/**
 * v0.1 demo entry — slug for the project we promote on the sample portal CTA.
 *
 * @demo:ui — Remove this CTA when v0.2 ships and only owners with real
 * magic links should reach `/portal/...`. Tag: PROD-DESIGN-PORTAL-DEMO.
 */
const DEMO_PROJECT_SLUG = 'ohana-house';

type AuthState =
  | { phase: 'verifying' }
  | { phase: 'redirecting'; slug: string }
  | { phase: 'expired'; reason: string | null; slug: string | null }
  | { phase: 'no_token'; reason: string | null; slug: string | null };

/**
 * Handles `/portal/auth?token=<jwt>` magic-link redemption.
 *
 * Live wiring (design-be-6d):
 *   1. Read `?token=` from URL.
 *   2. Persist it in `localStorage.portal_token` via portalClient.
 *   3. Fetch `/api/design/portal/me` — this both validates the token
 *      (the backend checks signature, expiry, revoked_at, tenant) and
 *      returns the project so we know which slug to redirect to.
 *   4. On success: replace location with `/portal/projects/<slug>`.
 *   5. On failure: clear the bad token and show the "ask Friday for a
 *      fresh link" screen.
 *
 * The mock-token sample-portal CTA below is kept behind the @demo:ui tag
 * for the in-FAD preview flow; remove it when staff-side minting ships.
 */
export function PortalAuthClient() {
  const [state, setState] = useState<AuthState>({ phase: 'verifying' });
  const [linkRequested, setLinkRequested] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const errorParam = params.get('error');
    const slugHint = params.get('slug');

    if (!token) {
      setState({ phase: 'no_token', reason: errorParam, slug: slugHint });
      return;
    }

    // Persist immediately so portalFetch picks it up.
    setPortalToken(token);
    let cancelled = false;
    loadPortalProject()
      .then(({ project }) => {
        if (cancelled) return;
        setState({ phase: 'redirecting', slug: project.slug });
        // Bounce after a beat so the "Verifying" copy isn't a flash.
        window.setTimeout(() => {
          window.location.replace(`/portal/projects/${project.slug}`);
        }, 250);
      })
      .catch((err) => {
        if (cancelled) return;
        // Live validation failed (signature bad / revoked / expired /
        // tenant mismatch). portalFetch already cleared the token on 401;
        // make sure storage is clean regardless so a partially-set token
        // can't poison a follow-up attempt.
        clearPortalToken();
        setState({
          phase: 'expired',
          reason: err instanceof Error ? err.message : String(err),
          slug: slugHint,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.phase === 'verifying') {
    return (
      <div className="portal-state">
        <h1>Verifying your link…</h1>
        <p>Hang on, this only takes a second.</p>
      </div>
    );
  }

  if (state.phase === 'redirecting') {
    return (
      <div className="portal-state">
        <h1>Welcome back to your project.</h1>
        <p>
          Taking you to <strong>{state.slug}</strong>…
        </p>
      </div>
    );
  }

  // Both `expired` and `no_token` show the same shape — they only differ in
  // headline copy.
  const headline =
    state.phase === 'expired'
      ? 'This link has expired or been revoked.'
      : state.phase === 'no_token' && state.reason === 'session_required'
      ? 'You need a fresh link to continue.'
      : state.phase === 'no_token' && state.reason === 'scope_mismatch'
      ? 'That link is for a different project.'
      : 'This link isn’t valid.';
  return (
    <div className="portal-state">
      <h1>{headline}</h1>
      <p>
        Ask Friday to send you a new one — they'll WhatsApp or email it over.
        Your project link stays valid for the life of the project; if it stops
        working it's because Friday revoked it.
      </p>
      {linkRequested ? (
        <div
          style={{
            background: 'var(--color-bg-success)',
            color: 'var(--color-text-success)',
            padding: '8px 14px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
          }}
        >
          Got it — Friday will send a new link shortly.
        </div>
      ) : (
        <button
          type="button"
          className="portal-cta"
          onClick={() => setLinkRequested(true)}
        >
          Request a new link
        </button>
      )}
      <a className="portal-cta-secondary" href="https://wa.me/2305712XXXX">
        Or message Friday on WhatsApp
      </a>
      {/* @demo:ui — sample-portal CTA. Remove in v0.2. Tag: PROD-DESIGN-PORTAL-DEMO. */}
      <button
        type="button"
        className="portal-cta-secondary"
        data-portal-demo-entry
        onClick={() => enterDemoPortal(DEMO_PROJECT_SLUG)}
        style={{ marginTop: 18, opacity: 0.85 }}
      >
        View sample portal (Ohana House)
      </button>
    </div>
  );
}

/**
 * @demo:ui — Skips the magic-link round-trip by minting + persisting a mock
 * session directly. Bypasses the live /api/design/portal/me validation —
 * only used for the in-FAD preview surface where staff are demo'ing the
 * owner experience without a live token in hand.
 */
function enterDemoPortal(slug: string) {
  const project = designClient.projects.getBySlug(slug);
  if (!project) {
    window.alert(`Demo project ${slug} not found.`);
    return;
  }
  const { claims } = signMockToken({
    projectId: project.id,
    ownerId: project.counterpartyId,
    slug,
  });
  persistMockSession(claims);
  window.location.replace(`/portal/projects/${slug}`);
}

function persistMockSession(claims: MockJwtClaims) {
  const key = `portal:session:${claims.slug}`;
  const value = JSON.stringify({
    projectSlug: claims.slug,
    ownerId: claims.sub,
    portalSession: claims.jti,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
  });
  window.localStorage.setItem(key, value);
}
