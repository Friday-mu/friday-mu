'use client';

// Change-password modal — two modes:
//   - FORCED (mode 'forced', default): non-dismissible, triggered by
//     /api/auth/me returning must_change_password=true. Blocks the
//     shell until the user replaces their temp password.
//   - OPTIONAL (mode 'optional'): operator clicked Settings → Change
//     password. Dismissible via X / Cancel / Escape.
//
// Both modes POST /api/auth/change-password and call onChanged on
// success. The forced case also flips must_change_password=false on
// the server.

import { useEffect, useState } from 'react';
import { apiFetch } from '../../../components/types';
import { trackEvent } from '../../../lib/analytics';

interface Props {
  onChanged: () => void;
  mode?: 'forced' | 'optional';
  onCancel?: () => void;
}

export function ChangePasswordModal({ onChanged, mode = 'forced', onCancel }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape to dismiss in optional mode. Forced mode ignores it.
  useEffect(() => {
    if (mode !== 'optional' || !onCancel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, onCancel]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 8) { setError('New password must be at least 8 characters'); return; }
    if (next !== confirm) { setError('Confirmation does not match'); return; }
    if (next === current) { setError('New password must differ from current'); return; }
    setSubmitting(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      trackEvent('password_change_success');
      onChanged();
    } catch (e: unknown) {
      trackEvent('password_change_failure', {
        reason: e instanceof Error ? e.message : 'unknown',
      });
      setError(e instanceof Error ? e.message : 'Change failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 24, 54, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'var(--color-background-primary, #fff)',
          maxWidth: 420,
          width: '100%',
          borderRadius: 12,
          padding: 24,
          boxShadow: '0 12px 40px rgba(15, 24, 54, 0.25)',
          position: 'relative',
        }}
      >
        {mode === 'optional' && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              width: 28,
              height: 28,
              border: 'none',
              background: 'transparent',
              fontSize: 22,
              lineHeight: 1,
              cursor: 'pointer',
              color: 'var(--color-text-tertiary, #8a8780)',
            }}
          >
            ×
          </button>
        )}
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: 'var(--color-text-primary, #1a1917)' }}>
          {mode === 'forced' ? 'Set a new password' : 'Change your password'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary, #55534d)', marginBottom: 16, lineHeight: 1.4 }}>
          {mode === 'forced'
            ? "You're using a temporary password. Choose a new one before continuing."
            : 'Enter your current password and choose a new one.'}
        </div>
        <form onSubmit={submit}>
          <Field label={mode === 'forced' ? 'Current (temporary) password' : 'Current password'}>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
              autoFocus
            />
          </Field>
          <Field label="New password (min. 8 chars)">
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          <Field label="Confirm new password">
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          {error && (
            <div
              style={{
                fontSize: 13,
                color: '#b91c1c',
                background: 'rgba(185, 28, 28, 0.08)',
                padding: '8px 10px',
                borderRadius: 6,
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            {mode === 'optional' && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={submitting}
                style={{
                  flex: '0 0 auto',
                  padding: '10px 16px',
                  background: 'transparent',
                  color: 'var(--color-text-secondary, #55534d)',
                  border: '0.5px solid var(--color-border-tertiary, #d4d0c4)',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting || !current || !next || !confirm}
              style={{
                flex: 1,
                padding: '10px 16px',
                background: 'var(--color-brand-accent, #2B4A93)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                cursor: submitting ? 'wait' : 'pointer',
                opacity: submitting || !current || !next || !confirm ? 0.6 : 1,
              }}
            >
              {submitting
                ? 'Updating…'
                : mode === 'forced'
                  ? 'Update password and continue'
                  : 'Update password'}
            </button>
          </div>
        </form>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary, #8a8780)', marginTop: 12, textAlign: 'center' }}>
          Your new password is hashed and stored encrypted.
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #55534d)', marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          // Children = an <input>. Wrapper styles target the input via :first-child / *.
        }}
      >
        {/* Inputs are styled inline below via a sibling style block — using
            a CSS-in-JS-free approach to keep this component portable. */}
        <style>{`
          .fad-pw-modal input { width: 100%; padding: 8px 10px; border: 0.5px solid var(--color-border-tertiary, #d4d0c4); border-radius: 6px; font-size: 14px; box-sizing: border-box; }
          .fad-pw-modal input:focus { outline: none; border-color: var(--color-brand-accent, #2B4A93); box-shadow: 0 0 0 2px var(--color-background-accent-soft, rgba(43, 74, 147, 0.12)); }
        `}</style>
        <span className="fad-pw-modal">{children}</span>
      </div>
    </label>
  );
}
