'use client';

// 3-step onboarding wizard, fired immediately after /signup.
//
// We land here with a fresh JWT in localStorage (gms_token) and a tenant
// row that already exists but is empty of design entities. The wizard
// primes it with:
//   Step 1 — first property      → POST /api/design/properties
//   Step 2 — first project       → POST /api/design/counterparties
//                                  POST /api/design/projects
//   Step 3 — invite team         → POST /api/tenants/me/invitations (per row)
//
// Every step is skippable. The wizard CAN finish empty — we don't gate
// access to the design module on this. The point is just to avoid the
// "what do I do now?" moment after signup.
//
// State persists across reloads via localStorage.onboarding_state so a
// page refresh between steps doesn't lose progress. We clear the key on
// final completion (or on "Open the design module" exit).
//
// Visual: matches /signup — same single-column card, palette, typography.
// Progress dots at the top track 1/3 → 2/3 → 3/3.

import { useEffect, useMemo, useState } from 'react';
import { API_BASE, apiFetch, getToken } from '../../components/types';

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

const CONSTRUCTION_TYPES = ['house', 'apartment', 'villa', 'commercial'] as const;
type ConstructionType = (typeof CONSTRUCTION_TYPES)[number];

const TIERS = ['T1', 'T2', 'T3'] as const;
type Tier = (typeof TIERS)[number];

type StepNum = 1 | 2 | 3 | 4; // 4 = success screen

type PersistedState = {
  step: StepNum;
  propertyId?: string;
  projectId?: string;
  invitedEmails?: string[];
};

const STORAGE_KEY = 'onboarding_state';

function loadState(): PersistedState {
  if (typeof window === 'undefined') return { step: 1 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { step: 1 };
    const parsed = JSON.parse(raw);
    // Sanity: step must be 1..4.
    if (![1, 2, 3, 4].includes(parsed.step)) return { step: 1 };
    return parsed;
  } catch {
    return { step: 1 };
  }
}

function saveState(s: PersistedState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

function clearState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function OnboardingPage() {
  const [step, setStep] = useState<StepNum>(1);
  const [propertyId, setPropertyId] = useState<string | undefined>(undefined);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [authed, setAuthed] = useState<boolean | null>(null);

  // System-theme mirror — same as /signup.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.matches) setTheme('dark');
  }, []);

  // Resume persisted state + verify auth on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = getToken();
    if (!token) {
      setAuthed(false);
      return;
    }
    setAuthed(true);
    const s = loadState();
    setStep(s.step);
    setPropertyId(s.propertyId);
    setProjectId(s.projectId);
    setInvitedEmails(s.invitedEmails || []);
  }, []);

  // Persist whenever progress changes.
  useEffect(() => {
    if (authed !== true) return;
    saveState({ step, propertyId, projectId, invitedEmails });
  }, [authed, step, propertyId, projectId, invitedEmails]);

  const palette = useMemo(() => (theme === 'dark' ? darkPalette : lightPalette), [theme]);

  // No token → bounce to /signup. We don't render the wizard for anons.
  if (authed === false) {
    if (typeof window !== 'undefined') window.location.href = '/signup';
    return null;
  }
  if (authed === null) return null;

  const handleFinish = () => {
    clearState();
    window.location.href = '/fad?m=design';
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
        maxWidth: 560,
        boxShadow: theme === 'light'
          ? '0 1px 2px rgba(15, 24, 54, 0.04), 0 8px 24px rgba(15, 24, 54, 0.04)'
          : '0 1px 2px rgba(0, 0, 0, 0.30), 0 8px 24px rgba(0, 0, 0, 0.30)',
      }}>
        <ProgressDots step={step} palette={palette} />

        {step === 1 && (
          <StepProperty
            palette={palette}
            onCreated={(id) => { setPropertyId(id); setStep(2); }}
            onSkip={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <StepProject
            palette={palette}
            propertyId={propertyId}
            onCreated={(id) => { setProjectId(id); setStep(3); }}
            onSkip={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <StepInvites
            palette={palette}
            onSent={(emails) => { setInvitedEmails(emails); setStep(4); }}
            onSkip={() => setStep(4)}
          />
        )}
        {step === 4 && (
          <StepDone
            palette={palette}
            propertyCreated={!!propertyId}
            projectCreated={!!projectId}
            invitedCount={invitedEmails.length}
            onFinish={handleFinish}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────── Step 1 — first property ───────────────────────────

function StepProperty({
  palette,
  onCreated,
  onSkip,
}: {
  palette: Palette;
  onCreated: (id: string) => void;
  onSkip: () => void;
}) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState<string>(() => {
    if (typeof window === 'undefined') return 'MU';
    try { return localStorage.getItem('onboarding_country') || 'MU'; } catch { return 'MU'; }
  });
  const [constructionType, setConstructionType] = useState<ConstructionType>('house');
  const [sqft, setSqft] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = name.trim().length >= 2;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // Country isn't a column on design_properties (see backend
      // WRITABLE_FIELDS in properties.js) — we stash it in notes so it's
      // recoverable later. Mauritius is the default in v0.
      const body: Record<string, unknown> = {
        name: name.trim(),
        construction_type: constructionType,
      };
      if (address.trim()) body.address = address.trim();
      if (city.trim()) body.city = city.trim();
      if (sqft.trim()) {
        const n = parseInt(sqft.trim(), 10);
        if (Number.isFinite(n)) body.sqft = n;
      }
      const noteParts: string[] = [];
      if (notes.trim()) noteParts.push(notes.trim());
      if (country) noteParts.push(`country: ${country}`);
      if (noteParts.length > 0) body.notes = noteParts.join('\n');
      const created = await apiFetch('/api/design/properties', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!created?.id) throw new Error('Property creation returned no id');
      onCreated(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create property');
      setSubmitting(false);
    }
  };

  return (
    <>
      <StepHeading palette={palette} title="Add your first property" subtitle="The physical site you'll design. You can add more later." />
      <form onSubmit={submit}>
        <Field palette={palette} label="Name">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus style={inputStyle(palette)} />
        </Field>
        <Field palette={palette} label="Address">
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} style={inputStyle(palette)} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field palette={palette} label="City">
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle(palette)} />
          </Field>
          <Field palette={palette} label="Country">
            <select value={country} onChange={(e) => setCountry(e.target.value)} style={inputStyle(palette)}>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field palette={palette} label="Type">
            <select value={constructionType} onChange={(e) => setConstructionType(e.target.value as ConstructionType)} style={inputStyle(palette)}>
              {CONSTRUCTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field palette={palette} label="sqft" hint="Optional.">
            <input type="number" inputMode="numeric" value={sqft} onChange={(e) => setSqft(e.target.value)} style={inputStyle(palette)} />
          </Field>
        </div>
        <Field palette={palette} label="Notes" hint="Optional.">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inputStyle(palette), resize: 'vertical' }} />
        </Field>

        {error && <ErrorBox palette={palette}>{error}</ErrorBox>}

        <PrimaryAction palette={palette} disabled={!valid || submitting} submitting={submitting}>
          {submitting ? 'Creating…' : 'Create property'}
        </PrimaryAction>
      </form>
      <SkipLink palette={palette} onClick={onSkip}>Skip — I'll add it later</SkipLink>
    </>
  );
}

// ─────────────────── Step 2 — first project ───────────────────────────

function StepProject({
  palette,
  propertyId,
  onCreated,
  onSkip,
}: {
  palette: Palette;
  propertyId: string | undefined;
  onCreated: (id: string) => void;
  onSkip: () => void;
}) {
  const [name, setName] = useState('');
  const [linkProperty, setLinkProperty] = useState<boolean>(!!propertyId);
  const [tier, setTier] = useState<Tier>('T2');
  const [goal, setGoal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = name.trim().length >= 2;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // Auto-create a placeholder counterparty named "Owner" for the
      // project so projects.js's required FK isn't a blocker. Real owner
      // info gets added in the Counterparties UI later.
      const counterparty = await apiFetch('/api/design/counterparties', {
        method: 'POST',
        body: JSON.stringify({ name: 'Owner' }),
      });
      if (!counterparty?.id) throw new Error('Could not create placeholder owner');

      const body: Record<string, unknown> = {
        name: name.trim(),
        slug: deriveSlug(name) || `project-${Date.now()}`,
        counterparty_id: counterparty.id,
        tier,
      };
      if (linkProperty && propertyId) body.property_id = propertyId;
      if (goal.trim()) body.goals = goal.trim();

      const created = await apiFetch('/api/design/projects', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!created?.id) throw new Error('Project creation returned no id');
      onCreated(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
      setSubmitting(false);
    }
  };

  return (
    <>
      <StepHeading palette={palette} title="Start your first project" subtitle="A design engagement — a renovation, a new build, a refresh." />
      <form onSubmit={submit}>
        <Field palette={palette} label="Project name">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus style={inputStyle(palette)} />
        </Field>
        <Field palette={palette} label="Property">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: palette.textSecondary, padding: '6px 0' }}>
            <input
              type="checkbox"
              checked={linkProperty}
              disabled={!propertyId}
              onChange={(e) => setLinkProperty(e.target.checked)}
            />
            {propertyId ? 'Link to the property I just created' : 'No property yet'}
          </label>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
          <Field palette={palette} label="Tier">
            <select value={tier} onChange={(e) => setTier(e.target.value as Tier)} style={inputStyle(palette)}>
              {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field palette={palette} label="Goal" hint="What does success look like?">
            <input type="text" value={goal} onChange={(e) => setGoal(e.target.value)} style={inputStyle(palette)} />
          </Field>
        </div>

        {error && <ErrorBox palette={palette}>{error}</ErrorBox>}

        <PrimaryAction palette={palette} disabled={!valid || submitting} submitting={submitting}>
          {submitting ? 'Creating…' : 'Create project'}
        </PrimaryAction>
      </form>
      <SkipLink palette={palette} onClick={onSkip}>Skip — I'll start one later</SkipLink>
    </>
  );
}

// ─────────────────── Step 3 — invites ──────────────────────────────────

type InviteRow = { email: string; role: 'admin' | 'agent' };

function StepInvites({
  palette,
  onSent,
  onSkip,
}: {
  palette: Palette;
  onSent: (emails: string[]) => void;
  onSkip: () => void;
}) {
  const [rows, setRows] = useState<InviteRow[]>([{ email: '', role: 'agent' }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateRow = (i: number, patch: Partial<InviteRow>) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));
  const addRow = () => setRows((rs) => [...rs, { email: '', role: 'agent' }]);

  const filledRows = rows.filter((r) => r.email.trim().length > 0);
  const valid = filledRows.length > 0 && filledRows.every((r) => /.+@.+\..+/.test(r.email.trim()));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    const sent: string[] = [];
    const failed: string[] = [];
    for (const r of filledRows) {
      try {
        await apiFetch('/api/tenants/me/invitations', {
          method: 'POST',
          body: JSON.stringify({ email: r.email.trim().toLowerCase(), role: r.role }),
        });
        sent.push(r.email.trim().toLowerCase());
      } catch (err) {
        // Don't halt the whole loop — record and move on. Email
        // collisions (409) will surface as failures in the summary.
        failed.push(`${r.email.trim()}: ${err instanceof Error ? err.message : 'failed'}`);
      }
    }
    if (failed.length === filledRows.length) {
      setError(`All invitations failed. ${failed[0]}`);
      setSubmitting(false);
      return;
    }
    if (failed.length > 0) {
      setError(`Some invitations failed: ${failed.join('; ')}. Continuing.`);
    }
    onSent(sent);
  };

  return (
    <>
      <StepHeading palette={palette} title="Invite your team" subtitle="Admins can manage settings, billing, and invitations. Agents can run projects." />
      <form onSubmit={submit}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 32px', gap: 8, marginBottom: 10 }}>
            <input
              type="email"
              placeholder="teammate@example.com"
              value={r.email}
              onChange={(e) => updateRow(i, { email: e.target.value })}
              style={inputStyle(palette)}
            />
            <select value={r.role} onChange={(e) => updateRow(i, { role: e.target.value as 'admin' | 'agent' })} style={inputStyle(palette)}>
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="button"
              onClick={() => removeRow(i)}
              disabled={rows.length === 1}
              aria-label="Remove invite row"
              style={{
                background: 'transparent',
                border: `0.5px solid ${palette.border}`,
                borderRadius: 6,
                color: palette.textTertiary,
                cursor: rows.length === 1 ? 'not-allowed' : 'pointer',
                fontSize: 16,
                lineHeight: 1,
              }}
            >×</button>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          style={{
            background: 'transparent',
            border: 'none',
            color: palette.brandAccent,
            cursor: 'pointer',
            fontSize: 13,
            padding: '4px 0',
            marginBottom: 12,
          }}
        >+ Add another</button>

        {error && <ErrorBox palette={palette}>{error}</ErrorBox>}

        <PrimaryAction palette={palette} disabled={!valid || submitting} submitting={submitting}>
          {submitting ? 'Sending invites…' : `Send ${filledRows.length || ''} invite${filledRows.length === 1 ? '' : 's'}`.trim()}
        </PrimaryAction>
      </form>
      <SkipLink palette={palette} onClick={onSkip}>Skip — I'll invite people later</SkipLink>
    </>
  );
}

// ─────────────────── Step 4 — done ─────────────────────────────────────

function StepDone({
  palette,
  propertyCreated,
  projectCreated,
  invitedCount,
  onFinish,
}: {
  palette: Palette;
  propertyCreated: boolean;
  projectCreated: boolean;
  invitedCount: number;
  onFinish: () => void;
}) {
  return (
    <>
      <h1 style={{ fontSize: 24, fontWeight: 500, letterSpacing: '-0.01em', margin: 0, marginBottom: 4 }}>
        All set!
      </h1>
      <p style={{ fontSize: 13, color: palette.textSecondary, margin: 0, marginBottom: 20 }}>
        Your workspace is ready. You can always add more from inside the dashboard.
      </p>

      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px 0', fontSize: 14 }}>
        <ChecklistItem palette={palette} done={propertyCreated}>
          {propertyCreated ? 'First property added' : 'First property — skipped'}
        </ChecklistItem>
        <ChecklistItem palette={palette} done={projectCreated}>
          {projectCreated ? 'First project started' : 'First project — skipped'}
        </ChecklistItem>
        <ChecklistItem palette={palette} done={invitedCount > 0}>
          {invitedCount > 0 ? `${invitedCount} teammate${invitedCount === 1 ? '' : 's'} invited` : 'Team invites — skipped'}
        </ChecklistItem>
      </ul>

      <button
        onClick={onFinish}
        style={{
          width: '100%',
          padding: '12px 14px',
          fontSize: 14,
          fontWeight: 500,
          background: palette.brandAccent,
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        Open the design module
      </button>
    </>
  );
}

// ─────────────────── shared bits ───────────────────────────────────────

function ProgressDots({ step, palette }: { step: StepNum; palette: Palette }) {
  // Step 4 is the done screen — render all three dots filled.
  const filled = step === 4 ? 3 : step;
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          aria-label={n <= filled ? `Step ${n} done` : `Step ${n} pending`}
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: n <= filled ? palette.brandAccent : 'transparent',
            border: `1px solid ${n <= filled ? palette.brandAccent : palette.border}`,
            display: 'inline-block',
          }}
        />
      ))}
    </div>
  );
}

function StepHeading({ palette, title, subtitle }: { palette: Palette; title: string; subtitle: string }) {
  return (
    <>
      <h1 style={{ fontSize: 24, fontWeight: 500, letterSpacing: '-0.01em', margin: 0, marginBottom: 4 }}>{title}</h1>
      <p style={{ fontSize: 13, color: palette.textSecondary, margin: 0, marginBottom: 20 }}>{subtitle}</p>
    </>
  );
}

function Field({ palette, label, hint, children }: { palette: Palette; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, color: palette.textSecondary, marginBottom: 4 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: palette.textTertiary, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function PrimaryAction({
  palette,
  disabled,
  submitting,
  children,
}: {
  palette: Palette;
  disabled: boolean;
  submitting: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      style={{
        width: '100%',
        padding: '10px 14px',
        fontSize: 14,
        fontWeight: 500,
        background: palette.brandAccent,
        color: '#fff',
        border: 'none',
        borderRadius: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        marginTop: 4,
      }}
    >
      {children}
    </button>
  );
}

function SkipLink({ palette, onClick, children }: { palette: Palette; onClick: () => void; children: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center', marginTop: 16 }}>
      <button
        type="button"
        onClick={onClick}
        style={{
          background: 'transparent',
          border: 'none',
          color: palette.textTertiary,
          cursor: 'pointer',
          fontSize: 12,
          textDecoration: 'underline',
        }}
      >{children}</button>
    </div>
  );
}

function ErrorBox({ palette, children }: { palette: Palette; children: React.ReactNode }) {
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

function ChecklistItem({ palette, done, children }: { palette: Palette; done: boolean; children: React.ReactNode }) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', color: done ? palette.textPrimary : palette.textTertiary }}>
      <span
        aria-hidden
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: done ? palette.brandAccent : 'transparent',
          border: `1px solid ${done ? palette.brandAccent : palette.border}`,
          color: '#fff',
          fontSize: 11,
        }}
      >{done ? '✓' : ''}</span>
      {children}
    </li>
  );
}

function inputStyle(p: Palette): React.CSSProperties {
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

type Palette = typeof lightPalette;

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

const darkPalette: typeof lightPalette = {
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
