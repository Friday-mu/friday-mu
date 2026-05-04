'use client';

import { useEffect, useState } from 'react';
import {
  designClient,
  signMockToken,
  type MockJwtClaims,
} from '../../fad/_data/design';

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
  | { phase: 'expired'; reason: string; slug: string | null }
  | { phase: 'no_token'; reason: string | null; slug: string | null };

/**
 * Handles `/portal/auth?token=<jwt>` magic-link redemption. On a valid token:
 * persists a session in localStorage and bounces to `/portal/projects/<slug>`.
 * On an invalid/expired/missing token: shows a clear "ask Friday for a fresh
 * link" screen with WhatsApp + email CTAs.
 *
 * @demo:auth — token validation is an in-memory mock, not a real HMAC. The
 * shape of the validator is the same one the wiring sprint plugs into.
 * Tag: PROD-DESIGN-PORTAL-AUTH.
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
    const result = designClient.magicLinks.validate(token);
    if (!result.valid) {
      setState({ phase: 'expired', reason: result.error, slug: slugHint });
      return;
    }
    persistSession(result.claims);
    setState({ phase: 'redirecting', slug: result.claims.slug });
    // Bounce after a beat so the "Verifying" copy isn't a flash.
    window.setTimeout(() => {
      window.location.replace(`/portal/projects/${result.claims.slug}`);
    }, 250);
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
      ? 'This link has expired.'
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
 * @demo:ui — Skips the magic-link round-trip by minting + persisting a
 * session directly. Same code path the real handler uses, just without
 * the URL hop.
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
  persistSession(claims);
  window.location.replace(`/portal/projects/${slug}`);
}

function persistSession(claims: MockJwtClaims) {
  const key = `portal:session:${claims.slug}`;
  const value = JSON.stringify({
    projectSlug: claims.slug,
    ownerId: claims.sub,
    portalSession: claims.jti,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
  });
  window.localStorage.setItem(key, value);
}
