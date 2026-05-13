'use client';

// LeadIntakeDrawer — proper form drawer for new-lead creation.
// Replaces the previous chained window.prompt() flow which broke
// visual rhythm with the rest of the FAD design module. Matches the
// ProjectEditDrawer pattern (overlay + slide-in right-side drawer,
// Escape closes, scroll body, footer Save/Cancel).

import { useEffect, useState } from 'react';
import type { LeadSource } from '../../../_data/design';
import { createLead, type ApiLead } from '../../../_data/designClient';
import { fireToast } from '../../Toaster';

interface Props {
  onCreated: (lead: ApiLead) => void;
  onClose: () => void;
}

// Mirrors LEAD_SOURCES + LEAD_SOURCE_LABEL in DesignModule.tsx. Kept
// local so the drawer doesn't need a circular import.
const SOURCE_OPTIONS: { id: LeadSource; label: string }[] = [
  { id: 'friday_outreach',         label: 'Friday outreach' },
  { id: 'owner_referral',          label: 'Owner referral' },
  { id: 'existing_owner',          label: 'Existing Friday owner' },
  { id: 'repeat_customer',         label: 'Repeat customer' },
  { id: 'industry_referral',       label: 'Industry referral (agent / notary / contractor)' },
  { id: 'press_media',             label: 'Press / media' },
  { id: 'trade_show_event',        label: 'Trade show / event' },
  { id: 'website',                 label: 'Website' },
  { id: 'whatsapp',                label: 'WhatsApp' },
  { id: 'email_campaign',          label: 'Email campaign' },
  { id: 'social_media',            label: 'Social media' },
  { id: 'social_media_influencer', label: 'Social media — influencer campaign' },
  { id: 'social_media_ad',         label: 'Social media — ad campaign' },
  { id: 'walk_in',                 label: 'Walk-in' },
  { id: 'other',                   label: 'Other' },
];

export function LeadIntakeDrawer({ onCreated, onClose }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState<LeadSource>('website');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Escape closes (unless saving).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = 'Name is required';
    // Basic email shape check — don't be too strict here; the lead might
    // come from a phone-only intake.
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = 'Not a valid email format';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const created = await createLead({
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        source,
        notes: notes.trim() || null,
      });
      fireToast(`Lead "${created.name}" created.`);
      onCreated(created);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrors({ submit: `Failed to create lead: ${msg}` });
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 100,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: 'min(540px, 100%)',
          height: '100%',
          background: 'var(--color-background-primary)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.35)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>New lead</h3>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Capture name + how they reached you. Everything else can be filled in later from the lead detail.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            style={{
              padding: '4px 10px',
              fontSize: 18,
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-tertiary)',
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Name" required error={errors.name}>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Davisen Nursoo"
              style={inputStyle()}
              data-lead-form-name
            />
          </Field>

          <Field label="Email" hint="Optional — but useful for follow-up + auto-emails later." error={errors.email}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@example.com"
              style={inputStyle()}
              data-lead-form-email
            />
          </Field>

          <Field label="Phone" hint="Optional. Mauritius format: +230 5XXX XXXX">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+230 5XXX XXXX"
              style={inputStyle()}
              data-lead-form-phone
            />
          </Field>

          <Field label="How did they find us?" required>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as LeadSource)}
              style={inputStyle()}
              data-lead-form-source
            >
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Notes" hint="Anything useful for the next conversation — property location, urgency, scope hints, etc.">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="e.g. Owns a 3-bedroom villa in Albion. Wants to convert to STR after refresh. Looking to start in June."
              style={{ ...inputStyle(), resize: 'vertical', minHeight: 90 }}
              data-lead-form-notes
            />
          </Field>

          {errors.submit && (
            <div
              role="alert"
              style={{
                padding: 10,
                fontSize: 12,
                background: 'var(--color-bg-warning)',
                color: 'var(--color-text-warning)',
                borderLeft: '2px solid var(--color-text-warning)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {errors.submit}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: '0.5px solid var(--color-border-tertiary)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-background-tertiary)',
              color: 'var(--color-text-primary)',
              fontSize: 13,
              border: '0.5px solid var(--color-border-secondary)',
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            data-lead-form-submit
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              background: (saving || !name.trim()) ? 'var(--color-border-secondary)' : 'var(--color-brand-accent)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 500,
              border: 'none',
              cursor: (saving || !name.trim()) ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Creating…' : 'Create lead'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────── form helpers ───────────────────────────

function Field({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
        {label}{required && <span style={{ color: 'var(--color-text-warning)', marginLeft: 4 }}>*</span>}
      </label>
      {hint && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>{hint}</div>}
      {children}
      {error && <div style={{ fontSize: 10, color: 'var(--color-text-warning)', marginTop: 4 }}>{error}</div>}
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%',
    padding: '8px 10px',
    fontSize: 13,
    borderRadius: 'var(--radius-sm)',
    border: '0.5px solid var(--color-border-secondary)',
    background: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
  };
}
