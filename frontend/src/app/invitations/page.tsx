'use client';

// Public invitation-accept page. The recipient lands here from the
// invitation email with `?token=<token>` in the URL. We fetch the
// invitation summary, render a "set password" form, then POST to the
// accept endpoint and stash the returned JWT — drops the new user
// straight into the dashboard at /fad?m=design, mirroring signup.
//
// We use a query-string `?token=...` rather than a dynamic
// /invitations/[token] route because the frontend is statically
// exported (output: 'export' in next.config.js) — arbitrary tokens
// can't be pre-rendered at build time, so the path has to be static
// and the runtime value lives in the query string.

import { useEffect, useMemo, useState } from 'react';
import { setToken, API_BASE } from '../../components/types';

interface InvitationSummary {
  email: string;
  role: 'admin' | 'agent';
  tenant_name: string;
  expires_at: string;
}

export default function InvitationAcceptPage() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [token, setTokenValue] = useState<string | null>(null);
  const [summary, setSummary] = useState<InvitationSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Mirror system theme — same as signup / reset-password
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.matches) setTheme('dark');
  }, []);

  // Read the token off the URL on mount. Static export means we can't
  // use the next/navigation `useSearchParams` hook without a Suspense
  // boundary, and parsing the raw URL is simpler + has no SSR concerns.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (!t) {
      setLoadError('Missing invitation token. Use the link from your invitation email.');
      setLoading(false);
      return;
    }
    setTokenValue(t);
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/tenants/invitations/${encodeURIComponent(t)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || 'This invitation is invalid or has expired.');
        }
        setSummary(data as InvitationSummary);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'Failed to load invitation');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const palette = useMemo(() => (theme === 'dark' ? darkPalette : lightPalette), [theme]);
  const passwordValid = password.length >= 8;
  const formValid = !!summary && !!token && passwordValid;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${API_BASE}/api/tenants/invitations/${encodeURIComponent(token!)}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          display_name: displayName.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.token) {
        throw new Error(data?.error || `Failed to accept (${res.status})`);
      }
      setToken(data.token);
      if (data.user?.display_name) {
        try { localStorage.setItem('gms_display_name', data.user.display_name); } catch {}
      }
      if (data.user?.role) {
        try { localStorage.setItem('gms_role', data.user.role); } catch {}
      }
      window.location.href = '/fad?m=design';
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to accept invitation');
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      background: palette.bgPage,
      color: palette.textPrimary,
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      padding: '24px 16px',
    }}>
      <div style={{
        background: palette.bgCard,
        border: `0.5px solid ${palette.border}`,
        borderRadius: 12,
        padding: 32,
        width: '100%',
        maxWidth: 480,
        boxShadow: theme === 'light'
          ? '0 1px 2px rgba(15, 24, 54, 0.04), 0 8px 24px rgba(15, 24, 54, 0.04)'
          : '0 1px 2px rgba(0, 0, 0, 0.30), 0 8px 24px rgba(0, 0, 0, 0.30)',
      }}>
        {loading && (
          <p style={{ fontSize: 13, color: palette.textSecondary, margin: 0 }}>Loading invitation…</p>
        )}

        {!loading && loadError && (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 500, margin: 0, marginBottom: 8 }}>Invitation unavailable</h1>
            <p style={{ fontSize: 13, color: palette.textSecondary, margin: 0, marginBottom: 16 }}>
              {loadError}
            </p>
            <p style={{ fontSize: 12, color: palette.textTertiary, margin: 0 }}>
              Ask the person who invited you to send a new invitation.
            </p>
          </>
        )}

        {!loading && summary && (
          <>
            <h1 style={{
              fontSize: 24,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              margin: 0,
              marginBottom: 4,
            }}>
              Join {summary.tenant_name}
            </h1>
            <p style={{ fontSize: 13, color: palette.textSecondary, margin: 0, marginBottom: 20 }}>
              You've been invited to {summary.tenant_name} on FridayOS Design as{' '}
              <strong>{summary.role === 'admin' ? 'an admin' : 'a teammate'}</strong>.
            </p>

            <form onSubmit={submit}>
              <Field label="Email" hint="From your invitation. You can't change this here.">
                <input type="email" value={summary.email} disabled style={{ ...inputStyle(palette), opacity: 0.7 }} />
              </Field>

              <Field label="Your name" hint="Shown to your teammates.">
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoFocus
                  style={inputStyle(palette)}
                />
              </Field>

              <Field label="Password" hint="At least 8 characters.">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  style={inputStyle(palette)}
                />
              </Field>

              {submitError && (
                <div role="alert" style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: palette.bgDanger,
                  color: palette.textDanger,
                  fontSize: 12,
                  marginTop: 4,
                  marginBottom: 12,
                }}>
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={!formValid || submitting}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  fontSize: 14,
                  fontWeight: 500,
                  background: palette.brandAccent,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: formValid && !submitting ? 'pointer' : 'not-allowed',
                  opacity: formValid && !submitting ? 1 : 0.6,
                  marginTop: 8,
                }}
              >
                {submitting ? 'Joining…' : 'Accept invitation'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'inherit', opacity: 0.75, marginBottom: 4 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function inputStyle(p: typeof lightPalette): React.CSSProperties {
  return {
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    fontFamily: 'inherit',
    background: p.bgCard,
    border: `0.5px solid ${p.border}`,
    borderRadius: 6,
    color: p.textPrimary,
    outline: 'none',
    boxSizing: 'border-box',
  };
}

const lightPalette = {
  bgPage: '#fafafa',
  bgCard: '#ffffff',
  border: '#e5e7eb',
  textPrimary: '#0f1729',
  textSecondary: '#475569',
  textTertiary: '#94a3b8',
  brandAccent: '#2B4A93',
  bgDanger: '#fef2f2',
  textDanger: '#991b1b',
};

const darkPalette = {
  bgPage: '#0b0d14',
  bgCard: '#13161f',
  border: '#1f2333',
  textPrimary: '#fafafa',
  textSecondary: '#a1a1aa',
  textTertiary: '#71717a',
  brandAccent: '#5680CA',
  bgDanger: '#3f1d1d',
  textDanger: '#fca5a5',
};
