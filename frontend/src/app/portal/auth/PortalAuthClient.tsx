'use client';

import { useEffect, useState } from 'react';
import { designClient, type MockJwtClaims } from '../../fad/_data/design';

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
        Ask Friday to send you a new one — they'll WhatsApp it over. Magic links
        expire after 14 days for your security.
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
    </div>
  );
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
