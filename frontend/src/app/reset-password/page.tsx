'use client';

// Password reset flow for FAD tenant users.
//
// Two modes, branched on presence of ?token=<...> in the query string:
//
//   No token  → "Enter your email" form. POSTs to /api/auth/password-reset/request.
//               Server returns 200 regardless of whether the email exists,
//               so we show a generic "check your email" screen on success.
//
//   With token → "New password" form. POSTs to /api/auth/password-reset/confirm.
//                On success, redirects to /signup so the user can sign in
//                (existing sign-in lives at /).
//
// Token is read from the URL only — never stored in localStorage. The
// link the user clicks IS the secret material; once the new password is
// set, the server clears reset_token + reset_token_expires.

import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../../components/types';

export default function ResetPasswordPage() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [token, setTokenState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.matches) setTheme('dark');
    const params = new URLSearchParams(window.location.search);
    setTokenState(params.get('token'));
    setHydrated(true);
  }, []);

  const palette = useMemo(() => (theme === 'dark' ? darkPalette : lightPalette), [theme]);

  // SSR / pre-hydration: render an empty shell so static export doesn't
  // commit to a mode based on URL — we only know the token after mount.
  if (!hydrated) {
    return <Shell palette={palette} theme={theme}><div style={{ minHeight: 120 }} /></Shell>;
  }

  return (
    <Shell palette={palette} theme={theme}>
      {token ? <ConfirmForm palette={palette} token={token} /> : <RequestForm palette={palette} />}
    </Shell>
  );
}

// ─────────────────────────── request flow ───────────────────────────

function RequestForm({ palette }: { palette: typeof lightPalette }) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = /.+@.+\..+/.test(email);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      // The endpoint always returns 200, but guard anyway.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <>
        <h1 style={headingStyle}>Check your email</h1>
        <p style={{ fontSize: 13, color: palette.textSecondary, margin: 0, marginBottom: 20 }}>
          If an account exists for that email, we&apos;ve sent a reset link. It&apos;s valid for 1 hour.
        </p>
        <p style={{ fontSize: 12, color: palette.textTertiary, marginTop: 16, marginBottom: 0 }}>
          Didn&apos;t get it? Check spam, or{' '}
          <button
            type="button"
            onClick={() => { setSent(false); setEmail(''); }}
            style={linkButtonStyle(palette)}
          >
            try a different email
          </button>
          .
        </p>
      </>
    );
  }

  return (
    <>
      <h1 style={headingStyle}>Reset your password</h1>
      <p style={{ fontSize: 13, color: palette.textSecondary, margin: 0, marginBottom: 20 }}>
        Enter your email and we&apos;ll send you a link to set a new password.
      </p>

      <form onSubmit={submit}>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            style={inputStyle(palette)}
          />
        </Field>

        {error && <ErrorBox palette={palette}>{error}</ErrorBox>}

        <button
          type="submit"
          disabled={!emailValid || submitting}
          style={submitButtonStyle(palette, emailValid && !submitting)}
        >
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <p style={{
        fontSize: 12,
        color: palette.textTertiary,
        textAlign: 'center',
        marginTop: 20,
        marginBottom: 0,
      }}>
        Remembered your password?{' '}
        <a href="/" style={{ color: palette.brandAccent, textDecoration: 'none' }}>Sign in</a>.
      </p>
    </>
  );
}

// ─────────────────────────── confirm flow ───────────────────────────

function ConfirmForm({ palette, token }: { palette: typeof lightPalette; token: string }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const passwordValid = newPassword.length >= 8;
  const passwordsMatch = newPassword === confirmPassword;
  const formValid = passwordValid && passwordsMatch;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `Reset failed (${res.status})`);
      }
      setDone(true);
      // Brief pause so the user sees the confirmation, then redirect
      // to /signup (login lives at /, /signup is the public entry point
      // per the brief; user can navigate from there).
      setTimeout(() => { window.location.href = '/signup'; }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <>
        <h1 style={headingStyle}>Password updated</h1>
        <p style={{ fontSize: 13, color: palette.textSecondary, margin: 0, marginBottom: 20 }}>
          Redirecting you to sign in…
        </p>
      </>
    );
  }

  return (
    <>
      <h1 style={headingStyle}>Set a new password</h1>
      <p style={{ fontSize: 13, color: palette.textSecondary, margin: 0, marginBottom: 20 }}>
        Choose a new password for your FridayOS Design account.
      </p>

      <form onSubmit={submit}>
        <Field label="New password" hint="At least 8 characters.">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoFocus
            style={inputStyle(palette)}
          />
        </Field>

        <Field label="Confirm password">
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            style={inputStyle(palette)}
          />
        </Field>

        {confirmPassword.length > 0 && !passwordsMatch && (
          <div style={{ fontSize: 11, color: palette.textDanger, marginTop: -8, marginBottom: 12 }}>
            Passwords don&apos;t match.
          </div>
        )}

        {error && <ErrorBox palette={palette}>{error}</ErrorBox>}

        <button
          type="submit"
          disabled={!formValid || submitting}
          style={submitButtonStyle(palette, formValid && !submitting)}
        >
          {submitting ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </>
  );
}

// ─────────────────────────── shared chrome ───────────────────────────

function Shell({
  palette,
  theme,
  children,
}: {
  palette: typeof lightPalette;
  theme: 'light' | 'dark';
  children: React.ReactNode;
}) {
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
        {children}
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

function ErrorBox({ palette, children }: { palette: typeof lightPalette; children: React.ReactNode }) {
  return (
    <div role="alert" style={{
      padding: '8px 10px',
      borderRadius: 6,
      background: palette.bgDanger,
      color: palette.textDanger,
      fontSize: 12,
      marginTop: 4,
      marginBottom: 12,
    }}>
      {children}
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

function submitButtonStyle(p: typeof lightPalette, enabled: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '10px 14px',
    fontSize: 14,
    fontWeight: 500,
    background: p.brandAccent,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.6,
    marginTop: 8,
  };
}

function linkButtonStyle(p: typeof lightPalette): React.CSSProperties {
  return {
    background: 'none',
    border: 'none',
    padding: 0,
    color: p.brandAccent,
    cursor: 'pointer',
    fontSize: 'inherit',
    fontFamily: 'inherit',
    textDecoration: 'none',
  };
}

const headingStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 500,
  letterSpacing: '-0.01em',
  margin: 0,
  marginBottom: 4,
};

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
