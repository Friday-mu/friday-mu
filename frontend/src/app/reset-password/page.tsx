'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { API_BASE } from '../../components/types'

type Theme = 'light' | 'dark'

const TOKENS: Record<Theme, {
  bgPage: string; bgCard: string; border: string;
  textPrimary: string; textSecondary: string; textTertiary: string;
  brandAccent: string; brandAccentText: string;
}> = {
  light: {
    bgPage: '#efede8',
    bgCard: '#ffffff',
    border: 'rgba(15, 24, 54, 0.08)',
    textPrimary: '#1a1917',
    textSecondary: '#55534d',
    textTertiary: '#8a8780',
    brandAccent: '#2B4A93',
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
    brandAccentText: '#0b0d14',
  },
}

function useFadTheme(): Theme {
  const [theme, setTheme] = useState<Theme>('light')
  useEffect(() => {
    const saved = localStorage.getItem('fad:theme')
    if (saved === 'light' || saved === 'dark') setTheme(saved)
    else if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) setTheme('dark')
  }, [])
  return theme
}

export default function ResetPasswordPage() {
  const theme = useFadTheme()
  const t = TOKENS[theme]
  const [token, setToken] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setToken(params.get('token') || '')
  }, [])

  const title = token ? 'Reset password' : 'Request password reset'
  const subtitle = token
    ? 'Set a new password for your Friday Admin account.'
    : 'Enter your approved Friday account email. The reset link is sent only to that address.'

  const cardStyle = useMemo<CSSProperties>(() => ({
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
  }), [t, theme])

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    fontFamily: 'inherit',
    background: t.bgCard,
    border: `0.5px solid ${t.border}`,
    borderRadius: 6,
    color: t.textPrimary,
    outline: 'none',
    marginBottom: 12,
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      if (token) {
        if (password.length < 8) throw new Error('Password must be at least 8 characters')
        if (password !== confirm) throw new Error('Passwords do not match')
        const res = await fetch(`${API_BASE}/api/auth/password-reset/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, new_password: password }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Reset failed')
      } else {
        const res = await fetch(`${API_BASE}/api/auth/password-reset/request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        })
        if (!res.ok) throw new Error('Could not request reset')
      }
      setDone(true)
    } catch (err: any) {
      setError(err?.message || 'Reset failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main style={{
      background: t.bgPage,
      color: t.textPrimary,
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'env(safe-area-inset-top, 0px) 0 env(safe-area-inset-bottom, 0px)',
    }}>
      <section style={cardStyle}>
        <h1 style={{
          fontFamily: 'Fraunces, "Iowan Old Style", Georgia, serif',
          fontSize: 28,
          fontWeight: 500,
          margin: 0,
          marginBottom: 6,
        }}>
          {done ? 'Check your email' : title}
        </h1>
        <p style={{ color: t.textSecondary, fontSize: 13, marginTop: 0, marginBottom: 20, lineHeight: 1.5 }}>
          {done
            ? (token ? 'Your password was changed. You can now sign in.' : 'If the account is active, the reset email has been sent.')
            : subtitle}
        </p>

        {done ? (
          <a
            href="/"
            style={{
              display: 'block',
              textAlign: 'center',
              textDecoration: 'none',
              padding: '10px 14px',
              fontSize: 14,
              fontWeight: 500,
              background: t.brandAccent,
              color: t.brandAccentText,
              borderRadius: 6,
            }}
          >
            Back to sign in
          </a>
        ) : (
          <form onSubmit={submit}>
            {error && (
              <div role="alert" style={{
                color: '#b91c1c',
                background: 'rgba(185, 28, 28, 0.08)',
                border: '0.5px solid rgba(185, 28, 28, 0.18)',
                borderRadius: 6,
                padding: '8px 10px',
                fontSize: 12,
                marginBottom: 12,
              }}>
                {error}
              </div>
            )}
            {token ? (
              <>
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={inputStyle}
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Confirm new password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 16 }}
                />
              </>
            ) : (
              <input
                type="text"
                inputMode="email"
                autoComplete="username"
                placeholder="you@friday.mu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ ...inputStyle, marginBottom: 16 }}
              />
            )}
            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: 14,
                fontWeight: 500,
                fontFamily: 'inherit',
                background: t.brandAccent,
                color: t.brandAccentText,
                border: `0.5px solid ${t.brandAccent}`,
                borderRadius: 6,
                cursor: submitting ? 'wait' : 'pointer',
                opacity: submitting ? 0.65 : 1,
              }}
            >
              {submitting ? 'Working...' : token ? 'Change password' : 'Send reset link'}
            </button>
          </form>
        )}
        <p style={{ marginTop: 18, marginBottom: 0, color: t.textTertiary, fontSize: 12 }}>
          Your email address is managed by Friday and cannot be changed here.
        </p>
      </section>
    </main>
  )
}
