'use client';

// Public signup → FridayOS Design trial. Single-page form, no card required.
// Mirrors the visual minimalism of /reset-password (LoginScreen card layout)
// but stripped to a single-column form. On success: stashes the JWT under
// `gms_token` and redirects to /onboarding (a 3-step wizard that primes
// the tenant with their first property + project + team before they hit
// the empty design module).

import { useEffect, useMemo, useState } from 'react';
import { setToken, API_BASE } from '../../components/types';

// Top-10 hosting markets — enough for the v0 dropdown. Free-form country
// edits live in Tenant Settings.
const COUNTRIES = [
  { code: 'MU', name: 'Mauritius' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'PT', name: 'Portugal' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'ZA', name: 'South Africa' },
];

function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function SignupPage() {
  const [companyName, setCompanyName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [country, setCountry] = useState('MU');
  const [locale, setLocale] = useState('en-US');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Mirror system theme — same as the rest of the app
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.matches) setTheme('dark');
  }, []);

  // Auto-derive slug from name until the user edits the slug field
  useEffect(() => {
    if (!slugTouched) setSlug(deriveSlug(companyName));
  }, [companyName, slugTouched]);

  const palette = useMemo(() => (theme === 'dark' ? darkPalette : lightPalette), [theme]);

  const passwordValid = adminPassword.length >= 8;
  const slugValid = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length >= 3;
  const emailValid = /.+@.+\..+/.test(adminEmail);
  const formValid = companyName.trim().length >= 2 && slugValid && emailValid && passwordValid;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // Public endpoint — no Authorization header needed. We hit fetch
      // directly rather than apiFetch so we don't even attempt to read
      // localStorage for a stale token from a prior session.
      const res = await fetch(`${API_BASE}/api/tenants/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName.trim(),
          slug,
          admin_email: adminEmail.trim().toLowerCase(),
          admin_password: adminPassword,
          country,
          locale,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.token) {
        throw new Error(data?.error || `Signup failed (${res.status})`);
      }
      setToken(data.token);
      if (data.user?.name) {
        try { localStorage.setItem('gms_display_name', data.user.name); } catch {}
      }
      if (data.user?.role) {
        try { localStorage.setItem('gms_role', data.user.role); } catch {}
      }
      // Stash the country we just picked so the onboarding wizard can
      // pre-fill the first-property form with it.
      try { localStorage.setItem('onboarding_country', country); } catch {}
      window.location.href = '/onboarding';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
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
        <h1 style={{
          fontSize: 24,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          margin: 0,
          marginBottom: 4,
        }}>
          Start your FridayOS Design trial
        </h1>
        <p style={{ fontSize: 13, color: palette.textSecondary, margin: 0, marginBottom: 20 }}>
          14-day free trial. No card required.
        </p>

        <form onSubmit={submit}>
          <Field label="Company name">
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              autoFocus
              style={inputStyle(palette)}
            />
          </Field>

          <Field label="Slug" hint="Lowercase letters, numbers, and dashes. Used in URLs.">
            <input
              type="text"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
              required
              minLength={3}
              pattern="^[a-z0-9]+(-[a-z0-9]+)*$"
              style={inputStyle(palette)}
            />
          </Field>

          <Field label="Admin email">
            <input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              required
              style={inputStyle(palette)}
            />
          </Field>

          <Field label="Password" hint="At least 8 characters.">
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              required
              minLength={8}
              style={inputStyle(palette)}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Country">
              <select value={country} onChange={(e) => setCountry(e.target.value)} style={inputStyle(palette)}>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Locale">
              <input
                type="text"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                style={inputStyle(palette)}
              />
            </Field>
          </div>

          {error && (
            <div role="alert" style={{
              padding: '8px 10px',
              borderRadius: 6,
              background: palette.bgDanger,
              color: palette.textDanger,
              fontSize: 12,
              marginTop: 4,
              marginBottom: 12,
            }}>
              {error}
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
            {submitting ? 'Creating your workspace…' : 'Start trial'}
          </button>
        </form>

        <p style={{
          fontSize: 12,
          color: palette.textTertiary,
          textAlign: 'center',
          marginTop: 20,
          marginBottom: 0,
        }}>
          Already have an account?{' '}
          <a href="/" style={{ color: palette.brandAccent, textDecoration: 'none' }}>Sign in</a>.
        </p>
        <p style={{
          fontSize: 12,
          color: palette.textTertiary,
          textAlign: 'center',
          marginTop: 8,
          marginBottom: 0,
        }}>
          <a href="/reset-password" style={{ color: palette.brandAccent, textDecoration: 'none' }}>
            Forgot password?
          </a>
        </p>
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
