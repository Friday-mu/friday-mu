'use client'

// Login screen wired to FAD backend (/api/auth/login → proxies to GMS).
// Stores JWT in localStorage on success; the FAD shell guards itself on mount.
// UI keeps the team-chip pre-fill + cycling greeting tone — that's Friday's voice,
// not a demo crutch.

import React, { useState, useEffect, useMemo } from 'react'
import { setToken } from './types'

type Theme = 'light' | 'dark'

// ─────────────────────────────── Team roster ───────────────────────────────
// Drives the chip selector. Edit when team membership changes.
const TEAM = [
  { firstName: 'Ishant',    email: 'ishant@friday.mu' },
  { firstName: 'Mathias',   email: 'mathias@friday.mu' },
  { firstName: 'Franny',    email: 'franny@friday.mu' },
  { firstName: 'Mary',      email: 'mary@friday.mu' },
  { firstName: 'Bryan',     email: 'bryan@friday.mu' },
  { firstName: 'Alexandra', email: 'alexandra@friday.mu' },
  { firstName: 'Catherine', email: 'catherine@friday.mu' },
] as const

// ─────────────────────────────── Greetings ─────────────────────────────────
// One pulled at random per page load. Friday's voice trends curious + dry.
const FUNNY_GREETINGS = [
  "Wait a second… who are you? 0.0",
  "Hark, traveler. Identify thyself.",
  "Friday squints. Who goes there?",
  "🤨 Suspicious. Name?",
  "Beep boop. Authentication required.",
  "Knock knock. Who's there?",
  "Hello hello. Which one of you is it?",
  "Halt! Whomst arrives?",
  "*peers over glasses* And you are?",
  "Ahem. Speak, mortal.",
  "Friday wakes up. Mumbles. Who's this?",
  "Identify yourself or the AI gets it.",
  "Right then. Which one of you scallywags is it?",
  "Knockety knock. State your business.",
]

// ─────────────────────────────── Tip pool ──────────────────────────────────
// One shown below the form, in tertiary text. Random per page load.
// 'admin' = FAD product knowledge (✦), 'str' = hospitality stats (💡).
const TIPS = [
  { kind: 'admin', text: "Cmd+K opens the command palette anywhere in the FAD." },
  { kind: 'admin', text: "Sub-pages keep their filter state when you deep-link." },
  { kind: 'admin', text: "Sidebar badges are role-aware — what you see is what's actionable for you." },
  { kind: 'admin', text: "Bell icon → AI priority toggle reorders by what'll bite next." },
  { kind: 'admin', text: "Notifications can be snoozed per-item — 1h / 4h / Tomorrow." },
  { kind: 'admin', text: "Property chips are clickable everywhere — quick-view popover, no nav reset." },
  { kind: 'str',   text: "First-reply under 1 hour lifts review scores ~0.3 stars." },
  { kind: 'str',   text: "Listings with 30+ reviews convert ~2× better than fewer." },
  { kind: 'str',   text: "Cleaning-fee transparency cuts booking abandonment by ~8%." },
  { kind: 'str',   text: "Saturday check-ins outperform on stays longer than 5 nights." },
  { kind: 'str',   text: "Video tours raise click-through ~10%." },
  { kind: 'str',   text: "Same-day bookings tend to be your highest-margin segment." },
] as const

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

function pickOnce<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)]
}

// ─────────────────────────────── Component ─────────────────────────────────

// Prop kept for backward compatibility with app/page.tsx — never invoked in
// demo mode (we navigate away instead of upgrading the parent's auth state).
export default function LoginScreen({ onLogin: _onLogin }: { onLogin: (token: string) => void }) {
  const theme = useFadTheme()
  const t = TOKENS[theme]

  const greeting = useMemo(() => pickOnce(FUNNY_GREETINGS), [])
  const tip = useMemo(() => pickOnce(TIPS), [])

  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [welcomeName, setWelcomeName] = useState<string | null>(null)
  const [lastEmail, setLastEmail] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLastEmail(localStorage.getItem('fad:last-email'))
  }, [])

  // Resolve a friendly name for the welcome flash. Prefers the backend-returned
  // user.name; falls back to TEAM-by-email or email-prefix.
  const resolveDisplayName = (apiName: string | undefined, emailUsed: string): string => {
    if (apiName && apiName.trim()) return apiName.trim().split(/\s+/)[0]
    const matched = TEAM.find((m) => m.email === emailUsed)
    if (matched) return matched.firstName
    const stub = emailUsed.includes('@') ? emailUsed.split('@')[0] : emailUsed
    return stub ? stub.charAt(0).toUpperCase() + stub.slice(1) : 'There'
  }

  const enterAs = (firstName: string, emailUsed: string) => {
    try { localStorage.setItem('fad:last-email', emailUsed) } catch {}
    setWelcomeName(firstName)
    setTimeout(() => {
      window.location.href = FAD_DESTINATION
    }, 700)
  }

  // Click a chip → fill email, focus password (matches OS-password-manager UX).
  const pickMember = (m: typeof TEAM[number]) => {
    setEmail(m.email)
    setTimeout(() => {
      const pw = document.querySelector('input[name="password"]') as HTMLInputElement | null
      pw?.focus()
    }, 30)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    const trimmed = email.trim()
    if (!trimmed || !password) {
      setError('Email and password required')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || ''
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.token) {
        throw new Error(data?.error || `Sign-in failed (${res.status})`)
      }
      setToken(data.token)
      const displayName = data.user?.name || data.user?.email || trimmed
      try {
        localStorage.setItem('gms_display_name', displayName)
        if (data.user?.role) localStorage.setItem('gms_role', data.user.role)
      } catch {}
      const niceName = resolveDisplayName(data.user?.name, trimmed)
      enterAs(niceName, trimmed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
      setSubmitting(false)
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
    letterSpacing: '-0.01em',
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

  const tipIcon = tip.kind === 'admin' ? '✦' : '💡'

  return (
    <div data-testid="container-login-screen" style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Friday Admin</h1>
        <p style={subtitleStyle}>{greeting}</p>

        <div style={chipsRowStyle}>
          {TEAM.map((m) => {
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
            style={{ ...primaryBtnStyle, opacity: submitting ? 0.5 : 1, cursor: submitting ? 'wait' : 'pointer' }}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
          {error && (
            <p
              data-testid="login-error"
              role="alert"
              style={{ fontSize: 12, color: '#c0392b', marginTop: 10, marginBottom: 0, textAlign: 'center' }}
            >
              {error}
            </p>
          )}
        </form>

        <p style={tipStyle}>
          <span aria-hidden="true" style={{ color: t.brandAccent, fontSize: 11, lineHeight: '18px' }}>{tipIcon}</span>
          <span>{tip.text}</span>
        </p>
      </div>
    </div>
  )
}
