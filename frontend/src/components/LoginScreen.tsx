'use client'

import React, { useState, useEffect } from 'react'
import { API_BASE, setToken } from './types'

type Theme = 'light' | 'dark'

// ─────────────────────────────── Team roster ───────────────────────────────
// Fallback only. The login screen prefers /api/auth/login-roster so the chips
// match active Friday accounts on the shared auth database.
const FALLBACK_TEAM = [
  { firstName: 'Ishant',    email: 'ishant@friday.mu' },
  { firstName: 'Mathias',   email: 'mathias@friday.mu' },
  { firstName: 'Franny',    email: 'franny@friday.mu' },
  { firstName: 'Mary',      email: 'mary@friday.mu' },
  { firstName: 'Bryan',     email: 'bryan@friday.mu' },
  { firstName: 'Catherine', email: 'catherine@friday.mu' },
] as const

type LoginRosterMember = {
  firstName: string
  email: string
}

const LOGIN_SUBTITLE = 'Sign in with your approved Friday account.'
const LOGIN_NOTE = 'Use your Friday email. Password reset links are sent only to that address.'

// ─────────────────────────────── Design tokens ─────────────────────────────
// Mirrors src/app/fad/fad.css :root + html.fad-dark blocks. Inlined here
// because login lives at / outside the FAD route.
const TOKENS: Record<Theme, {
  bgPage: string; bgCard: string; border: string;
  textPrimary: string; textSecondary: string; textTertiary: string;
  brandAccent: string; brandAccentSoft: string; brandAccentText: string;
}> = {
  light: {
    bgPage: '#efede8',
    bgCard: '#ffffff',
    border: 'rgba(15, 24, 54, 0.08)',
    textPrimary: '#1a1917',
    textSecondary: '#55534d',
    textTertiary: '#8a8780',
    brandAccent: '#2B4A93',
    brandAccentSoft: 'rgba(43, 74, 147, 0.08)',
    brandAccentText: '#ffffff',
  },
  dark: {
    bgPage: '#141620',
    bgCard: '#1a1d28',
    border: 'rgba(255, 255, 255, 0.08)',
    textPrimary: '#e8e9ec',
    textSecondary: '#a8abb6',
    textTertiary: '#6b6e7a',
    brandAccent: '#5680CA',
    brandAccentSoft: 'rgba(86, 128, 202, 0.14)',
    brandAccentText: '#0b0d14',
  },
}

const FONT_SANS = 'Inter, system-ui, -apple-system, sans-serif'
const FONT_FRIDAY = 'Fraunces, "Iowan Old Style", Georgia, serif'

const FAD_DESTINATION = '/fad'

// ─────────────────────────────── Helpers ───────────────────────────────────

function useFadTheme(): Theme {
  const [theme, setTheme] = useState<Theme>('light')
  useEffect(() => {
    const saved = localStorage.getItem('fad:theme')
    if (saved === 'light' || saved === 'dark') {
      setTheme(saved)
    } else if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      setTheme('dark')
    }
  }, [])
  return theme
}

// ─────────────────────────────── Component ─────────────────────────────────

function mapAuthRoleToFadRole(role: string | null | undefined): string | null {
  switch ((role || '').toLowerCase()) {
    case 'admin':
    case 'director':
      return 'director'
    case 'manager':
    case 'ops_manager':
    case 'operations':
    case 'agent':
      return 'ops_manager'
    case 'commercial':
    case 'commercial_marketing':
    case 'marketing':
      return 'commercial_marketing'
    case 'field':
    case 'staff':
      return 'field'
    case 'external':
    case 'vendor':
      return 'external'
    default:
      return null
  }
}

type LoginResponse = {
  token?: string
  user_id?: string
  username?: string
  display_name?: string
  role?: string
  fad_role?: string
  must_change_password?: boolean
  error?: string
}

export default function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
  const theme = useFadTheme()
  const t = TOKENS[theme]

  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Form state.
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [welcomeName, setWelcomeName] = useState<string | null>(null)
  const [lastEmail, setLastEmail] = useState<string | null>(null)
  const [team, setTeam] = useState<readonly LoginRosterMember[]>(FALLBACK_TEAM)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resetSending, setResetSending] = useState(false)

  useEffect(() => {
    setLastEmail(localStorage.getItem('fad:last-email'))
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/auth/login-roster`)
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('roster unavailable')))
      .then((data) => {
        if (cancelled || !Array.isArray(data?.users) || data.users.length === 0) return
        setTeam(data.users)
      })
      .catch(() => {
        // Non-critical. Manual login still works if the roster is unavailable.
      })
    return () => { cancelled = true }
  }, [])

  const finishLogin = (data: LoginResponse, emailUsed: string) => {
    if (!data.token) throw new Error('Login did not return a token')
    const displayName = data.display_name || emailUsed.split('@')[0] || 'Friday'
    const firstName = displayName.split(/\s+/)[0] || 'Friday'
    // Prefer the backend's exact fad_role (now returned by /api/auth/login); fall
    // back to the coarse role→fad_role map only when it's absent. The stored
    // fad:real-role is just a fallback (the JWT's fad_role claim wins in
    // usePermissions), but keep it precise. (Bugfix 2026-05-30.)
    const fadRole = data.fad_role || mapAuthRoleToFadRole(data.role)

    setToken(data.token)
    try {
      localStorage.setItem('gms_display_name', displayName)
      localStorage.setItem('gms_username', data.username || emailUsed)
      localStorage.setItem('gms_role', data.role || '')
      if (data.user_id) localStorage.setItem('gms_user_id', data.user_id)
      if (fadRole) localStorage.setItem('fad:real-role', fadRole)
      localStorage.removeItem('fad:dev-role')
      localStorage.removeItem('fad:dev-user')
      localStorage.setItem('fad:last-email', emailUsed)
    } catch {}

    onLogin(data.token)
    setWelcomeName(firstName)
    setTimeout(() => {
      window.location.href = FAD_DESTINATION
    }, 700)
  }

  // Click a chip → fill email, focus password (mirrors the production flow
  // where the OS password manager would now pop in the saved password).
  const pickMember = (m: LoginRosterMember) => {
    setEmail(m.email)
    setTimeout(() => {
      const pw = document.querySelector('input[name="password"]') as HTMLInputElement | null
      pw?.focus()
    }, 30)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !password) {
      setError('Email and password are required')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmed, password }),
      })
      const data: LoginResponse = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Login failed')
      if (data.must_change_password) {
        await fetch(`${API_BASE}/api/auth/password-reset/request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: trimmed }),
        }).catch(() => undefined)
        throw new Error('Password change is required. We sent a reset link to your Friday email.')
      }
      finishLogin(data, trimmed)
    } catch (err: any) {
      setError(err?.message || 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleForgotPassword = async () => {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) {
      setError('Enter your Friday email first')
      return
    }
    setResetSending(true)
    setError('')
    setNotice('')
    try {
      await fetch(`${API_BASE}/api/auth/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      setNotice('If that account is active, a reset link has been sent to its Friday email.')
    } catch {
      setNotice('If that account is active, a reset link has been sent to its Friday email.')
    } finally {
      setResetSending(false)
    }
  }

  // ─────────────────────── Style objects ───────────────────────

  const pageStyle: React.CSSProperties = {
    background: t.bgPage,
    color: t.textPrimary,
    fontFamily: FONT_SANS,
    minHeight: '100dvh',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    paddingTop: 'env(safe-area-inset-top, 0px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  const cardStyle: React.CSSProperties = {
    background: t.bgCard,
    border: `0.5px solid ${t.border}`,
    borderRadius: 12,
    padding: 32,
    width: '100%',
    maxWidth: 420,
    margin: '0 16px',
    boxShadow: theme === 'light'
      ? '0 1px 2px rgba(15, 24, 54, 0.04), 0 8px 24px rgba(15, 24, 54, 0.04)'
      : '0 1px 2px rgba(0, 0, 0, 0.30), 0 8px 24px rgba(0, 0, 0, 0.30)',
  }

  const titleStyle: React.CSSProperties = {
    fontFamily: FONT_FRIDAY,
    fontSize: 28,
    fontWeight: 500,
    letterSpacing: 0,
    color: t.textPrimary,
    margin: 0,
    marginBottom: 4,
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0)' : 'translateY(6px)',
    transition: 'opacity 700ms cubic-bezier(0.4, 0, 0.2, 1), transform 700ms cubic-bezier(0.4, 0, 0.2, 1)',
  }

  const subtitleStyle: React.CSSProperties = {
    fontSize: 13,
    color: t.textSecondary,
    margin: 0,
    marginBottom: 20,
    minHeight: 18,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    fontFamily: 'inherit',
    background: t.bgCard,
    border: `0.5px solid ${t.border}`,
    borderRadius: 6,
    color: t.textPrimary,
    outline: 'none',
    transition: 'border-color 100ms cubic-bezier(0.4, 0, 0.2, 1)',
  }

  const primaryBtnStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    fontSize: 14,
    fontWeight: 500,
    fontFamily: 'inherit',
    background: t.brandAccent,
    color: t.brandAccentText,
    border: `0.5px solid ${t.brandAccent}`,
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'opacity 100ms cubic-bezier(0.4, 0, 0.2, 1)',
  }

  const chipsRowStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  }

  const chipStyle = (highlighted: boolean): React.CSSProperties => ({
    padding: '8px 14px',
    fontSize: 13,
    fontFamily: 'inherit',
    fontWeight: 500,
    background: highlighted ? t.brandAccentSoft : t.bgCard,
    color: highlighted ? t.brandAccent : t.textPrimary,
    border: `0.5px solid ${highlighted ? t.brandAccent : t.border}`,
    borderRadius: 999,
    cursor: 'pointer',
    transition: 'background 100ms ease, border-color 100ms ease, transform 60ms ease',
  })

  const tipStyle: React.CSSProperties = {
    fontSize: 12,
    color: t.textTertiary,
    lineHeight: 1.5,
    marginTop: 22,
    marginBottom: 0,
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
  }

  const demoPillStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '2px 8px',
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: t.textTertiary,
    background: t.brandAccentSoft,
    border: `0.5px solid ${t.border}`,
    borderRadius: 999,
    marginBottom: 12,
  }

  // ─────────────────────── Welcome flash ───────────────────────

  if (welcomeName) {
    return (
      <div style={pageStyle}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: FONT_FRIDAY, fontSize: 24, fontWeight: 500, color: t.textPrimary, marginBottom: 6 }}>
            Welcome, {welcomeName}.
          </div>
          <div style={{ fontSize: 13, color: t.textSecondary }}>Setting things up…</div>
        </div>
      </div>
    )
  }

  // ─────────────────────── Default: sign-in screen ───────────────────────

  return (
    <div data-testid="container-login-screen" style={pageStyle}>
      <div style={cardStyle}>
        {/* @demo:ui — Tag: PROD-UI-1 — see frontend/DEMO_CRUFT.md
            Kept as a small environment label, no demo auth behavior remains. */}
        <span style={demoPillStyle}>Secure sign-in</span>
        <h1 style={titleStyle}>Friday Admin</h1>
        <p style={subtitleStyle}>{LOGIN_SUBTITLE}</p>

        <div style={chipsRowStyle}>
          {team.map((m) => {
            // Prefer "picked now" over "last-used"; only fall back to last-used
            // when no email is currently set.
            const isPicked = m.email === email
            const isLast = !email && m.email === lastEmail
            return (
              <button
                key={m.email}
                type="button"
                onClick={() => pickMember(m)}
                style={chipStyle(isPicked || isLast)}
                title={m.email}
                data-testid={`chip-login-${m.firstName.toLowerCase()}`}
              >
                {m.firstName}
              </button>
            )
          })}
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {error && (
            <div
              role="alert"
              style={{
                color: '#b91c1c',
                background: 'rgba(185, 28, 28, 0.08)',
                border: '0.5px solid rgba(185, 28, 28, 0.18)',
                borderRadius: 6,
                padding: '8px 10px',
                fontSize: 12,
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}
          {notice && (
            <div
              role="status"
              style={{
                color: '#166534',
                background: 'rgba(22, 101, 52, 0.08)',
                border: '0.5px solid rgba(22, 101, 52, 0.18)',
                borderRadius: 6,
                padding: '8px 10px',
                fontSize: 12,
                marginBottom: 12,
              }}
            >
              {notice}
            </div>
          )}
          <input
            type="text"
            name="email"
            inputMode="email"
            autoComplete="username"
            placeholder="you@friday.mu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ ...inputStyle, marginBottom: 12 }}
          />
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="input-login-password"
            style={{ ...inputStyle, marginBottom: 16 }}
          />
          <button
            type="submit"
            data-testid="btn-login"
            disabled={submitting}
            style={{ ...primaryBtnStyle, opacity: submitting ? 0.65 : 1, cursor: submitting ? 'wait' : 'pointer' }}
          >
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={resetSending}
            style={{
              marginTop: 10,
              width: '100%',
              border: 'none',
              background: 'transparent',
              color: t.brandAccent,
              fontSize: 12,
              fontFamily: 'inherit',
              cursor: resetSending ? 'wait' : 'pointer',
            }}
          >
            {resetSending ? 'Sending reset link...' : 'Forgot password?'}
          </button>
        </form>

        <p style={tipStyle}>
          <span aria-hidden="true" style={{ color: t.brandAccent, fontSize: 11, lineHeight: '18px' }}>✦</span>
          <span>{LOGIN_NOTE}</span>
        </p>
      </div>
    </div>
  )
}
