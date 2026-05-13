'use client';

// @demo:data + @demo:auth — Tag: PROD-DATA-20 — see frontend/DEMO_CRUFT.md
// SettingsModule has multiple inline demo blocks:
//   - Hardcoded user "Ishant Sagoo" / "ishant@friday.mu" (replace with auth context)
//   - Inline team roster of 6 names (lines ~131-136) → GET /api/users/team
//   - Hardcoded integrations list (lines ~171-178) → GET /api/integrations
//   - Hardcoded bug reports (lines ~207-210) → GET /api/bug-reports
//   - Billing info "Friday Internal · unmetered" (lines ~233-238) → GET /api/billing
// Each block gets its own backend endpoint when wired.

import { useEffect, useState } from 'react';
import { ModuleHeader } from '../ModuleHeader';
import { useCurrentRole } from '../usePermissions';
import { SavedRepliesImport } from './properties/SavedRepliesImport';
import { apiFetch } from '../../../../components/types';

interface Props {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

const SECTIONS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'account', label: 'Account' },
  { id: 'team', label: 'Team' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'feedback', label: 'Feedback inbox' },
  { id: 'billing', label: 'Billing' },
];

// Field staff get a slimmed Settings — only personal-scope sections.
const FIELD_SECTION_IDS = new Set(['appearance', 'account']);

export function SettingsModule({ theme, onToggleTheme }: Props) {
  const role = useCurrentRole();
  const sections = role === 'field' ? SECTIONS.filter((s) => FIELD_SECTION_IDS.has(s.id)) : SECTIONS;
  const [section, setSection] = useState(sections[0]?.id ?? 'appearance');
  return (
    <>
      <ModuleHeader title="Settings" subtitle="Your profile, team, GMS, and system preferences" />
      <div className="fad-module-body">
        <div className="settings-layout">
          <div className="settings-nav">
            {sections.map((s) => (
              <button
                key={s.id}
                className={'settings-nav-item' + (section === s.id ? ' active' : '')}
                onClick={() => setSection(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div>
            {section === 'appearance' && <Appearance theme={theme} onToggleTheme={onToggleTheme} />}
            {section === 'account' && <Account />}
            {section === 'team' && <Team />}
            {section === 'integrations' && <Integrations />}
            {section === 'feedback' && <FeedbackInbox />}
            {section === 'billing' && <Billing />}
          </div>
        </div>
      </div>
    </>
  );
}

function Appearance({ theme, onToggleTheme }: Props) {
  return (
    <div className="card settings-section">
      <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 500 }}>Appearance</h3>
      <p style={{ margin: '0 0 16px', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
        Light, dark, or follow your system.
      </p>
      <div className="settings-row">
        <div>
          <h5>Dark mode</h5>
          <p>Currently: {theme}. FAD follows your OS preference by default.</p>
        </div>
        <div className={'toggle' + (theme === 'dark' ? ' on' : '')} onClick={onToggleTheme} />
      </div>
      <div className="settings-row">
        <div>
          <h5>Density</h5>
          <p>Dense is standard for Inbox; comfy on large displays.</p>
        </div>
        <span className="settings-value">Dense</span>
      </div>
      <div className="settings-row">
        <div>
          <h5>Sidebar</h5>
          <p>Remembered per device.</p>
        </div>
        <span className="settings-value">Expanded</span>
      </div>
    </div>
  );
}

function Account() {
  return (
    <div className="card settings-section">
      <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 500 }}>Account</h3>
      <p style={{ margin: '0 0 16px', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
        How Friday addresses you.
      </p>
      <div className="settings-row">
        <div>
          <h5>Name</h5>
          <p>Shown on messages and threads.</p>
        </div>
        <span className="settings-value">Ishant Sagoo</span>
      </div>
      <div className="settings-row">
        <div>
          <h5>Email</h5>
          <p>Login + notifications.</p>
        </div>
        <span className="settings-value">ishant@friday.mu</span>
      </div>
      <div className="settings-row">
        <div>
          <h5>Role</h5>
          <p>Admin sees all, writes all.</p>
        </div>
        <span className="chip info">Admin</span>
      </div>
    </div>
  );
}

function Team() {
  return (
    <div className="card settings-section">
      <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 500 }}>Team & roles</h3>
      <p style={{ margin: '0 0 16px', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
        Role-scoped visibility, multi-team membership.
      </p>
      {[
        { name: 'Ishant Sagoo', role: 'Admin', teams: ['all'] },
        { name: 'Franny Reyes', role: 'Manager', teams: ['ops', 'gs'] },
        { name: 'Mathias Chen', role: 'Manager', teams: ['gs', 'ops'] },
        { name: 'Mary Nunes', role: 'Manager · until May', teams: ['admin'] },
        { name: 'Bryan Patel', role: 'Contributor', teams: ['ops'] },
        { name: 'Alex Rivera', role: 'Contributor', teams: ['ops'] },
      ].map((p, i) => (
        <div key={i} className="settings-row">
          <div>
            <h5>{p.name}</h5>
            <p>{p.teams.join(' · ')}</p>
          </div>
          <span className="chip">{p.role}</span>
        </div>
      ))}
    </div>
  );
}

function Integrations() {
  const [importOpen, setImportOpen] = useState(false);
  return (
    <div className="card settings-section">
      <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 500 }}>Integrations</h3>
      <p style={{ margin: '0 0 16px', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
        Connected services. Google is per-user — each teammate links their own account.
      </p>

      <div className="settings-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 8, paddingBottom: 16, borderBottom: '0.5px solid var(--color-border-tertiary)', marginBottom: 12 }}>
        <div>
          <h5>Guesty saved replies → Property Cards</h5>
          <p>One-time portfolio-wide migration · imports every per-listing + cross-listing reply as a Property Card. Per-property imports also live in each property's Operational tab.</p>
        </div>
        <button className="btn ghost sm" onClick={() => setImportOpen(true)}>
          ↓ Run portfolio import
        </button>
      </div>
      {importOpen && <SavedRepliesImport onClose={() => setImportOpen(false)} />}

      {[
        { name: 'Google (Gmail · Drive · Calendar)', status: 'Connected · Ishant', meta: 'Per-user · attribution preserved' },
        { name: 'Guesty', status: 'Connected', meta: 'Channel manager · reservations + threads' },
        { name: 'Breezeway', status: 'Connected', meta: 'Housekeeping + maintenance · two-way task sync' },
        { name: 'WhatsApp Business API', status: 'Blocked', meta: 'Waiting on Guesty MFA + Meta BM admin access' },
        { name: 'Stripe', status: 'Connected', meta: 'Direct bookings · refund automation' },
        { name: 'Xero', status: 'Not connected', meta: 'Ships with Finance Apr' },
        { name: 'Slack', status: 'Connected', meta: 'Bidirectional approvals · ops channel' },
        { name: 'Airbnb (direct)', status: 'Via Guesty', meta: 'Direct integration later' },
        { name: 'Twilio (SMS fallback)', status: 'Not connected', meta: 'Low priority — WhatsApp covers' },
      ].map((it, i) => (
        <div key={i} className="settings-row">
          <div>
            <h5>{it.name}</h5>
            <p>{it.meta}</p>
          </div>
          <span
            className={
              'chip ' +
              (it.status.startsWith('Connected') ? 'info' : it.status === 'Blocked' ? 'warn' : '')
            }
          >
            {it.status}
          </span>
        </div>
      ))}
    </div>
  );
}

// Feedback inbox — backed by the `feedback` table (migration 029).
// Submissions land here from the global "Send feedback" FAB. Admins
// triage by changing status + recording a resolution note.

type FeedbackType = 'bug' | 'feature' | 'suggestion';
type FeedbackStatus = 'new' | 'triaged' | 'in_progress' | 'resolved' | 'wontfix' | 'duplicate';

interface FeedbackEntry {
  id: string;
  type: FeedbackType;
  title: string | null;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  route_url: string | null;
  module_label: string | null;
  user_username: string | null;
  user_display_name: string | null;
  status: FeedbackStatus;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

const TYPE_LABEL: Record<FeedbackType, string> = { bug: 'Bug', feature: 'Feature', suggestion: 'Suggestion' };
const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: 'New',
  triaged: 'Triaged',
  in_progress: 'In progress',
  resolved: 'Resolved',
  wontfix: 'Won’t fix',
  duplicate: 'Duplicate',
};
const STATUS_TONE: Record<FeedbackStatus, 'warn' | 'info' | ''> = {
  new: 'warn',
  triaged: 'warn',
  in_progress: 'info',
  resolved: 'info',
  wontfix: '',
  duplicate: '',
};

function FeedbackInbox() {
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<FeedbackType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refetch = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (typeFilter !== 'all') qs.set('type', typeFilter);
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      const path = qs.toString() ? `/api/feedback?${qs}` : '/api/feedback';
      const res = (await apiFetch(path)) as { results: FeedbackEntry[] };
      setEntries(res.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, statusFilter]);

  const selected = entries.find((e) => e.id === selectedId) || null;

  const updateEntry = async (id: string, patch: { status?: FeedbackStatus; resolution_note?: string | null }) => {
    try {
      await apiFetch(`/api/feedback/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="card settings-section">
      <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 500 }}>Feedback inbox</h3>
      <p style={{ margin: '0 0 16px', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
        Admin-only triage view. Bug reports, feature requests, and suggestions submitted via the global
        ✦ Send feedback FAB land here. Filter, open one, then update status / add a resolution note.
      </p>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {(['all', 'bug', 'feature', 'suggestion'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={'chip' + (typeFilter === t ? ' info' : '')}
            style={{ cursor: 'pointer' }}
            onClick={() => setTypeFilter(t)}
          >
            {t === 'all' ? 'All types' : TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {(['all', 'new', 'triaged', 'in_progress', 'resolved', 'wontfix', 'duplicate'] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={'chip' + (statusFilter === s ? ' info' : '')}
            style={{ cursor: 'pointer' }}
            onClick={() => setStatusFilter(s)}
          >
            {s === 'all' ? 'All statuses' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {loading && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading…</div>}
      {error && (
        <div role="alert" style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--color-bg-danger)', color: 'var(--color-text-danger)', fontSize: 12, marginBottom: 8 }}>
          {error}
        </div>
      )}
      {!loading && entries.length === 0 && !error && (
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', padding: '24px 0', textAlign: 'center' }}>
          No feedback yet matching this filter.
        </div>
      )}

      {entries.map((e) => (
        <div
          key={e.id}
          className="settings-row"
          style={{ alignItems: 'flex-start', cursor: 'pointer' }}
          onClick={() => setSelectedId(selectedId === e.id ? null : e.id)}
        >
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 2 }}>
              <span className="chip">{TYPE_LABEL[e.type]}</span>
              {e.severity && <span className="chip warn">{e.severity}</span>}
              <h5 style={{ margin: 0 }}>{e.title || e.description.slice(0, 80)}</h5>
            </div>
            <p style={{ margin: 0 }}>
              {e.user_display_name || e.user_username || 'unknown'} · {new Date(e.created_at).toLocaleString()}
              {e.module_label && <> · on <em>{e.module_label}</em></>}
              {e.route_url && <> · <code style={{ fontSize: 10 }}>{e.route_url}</code></>}
            </p>
          </div>
          <span className={'chip ' + STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</span>
        </div>
      ))}

      {selected && (
        <FeedbackDetail
          entry={selected}
          onUpdate={(patch) => updateEntry(selected.id, patch)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function FeedbackDetail({
  entry,
  onUpdate,
  onClose,
}: {
  entry: FeedbackEntry;
  onUpdate: (patch: { status?: FeedbackStatus; resolution_note?: string | null }) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<FeedbackStatus>(entry.status);
  const [note, setNote] = useState(entry.resolution_note ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStatus(entry.status);
    setNote(entry.resolution_note ?? '');
  }, [entry.id, entry.status, entry.resolution_note]);

  const save = async () => {
    setSaving(true);
    try {
      await onUpdate({ status, resolution_note: note.trim() || null });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 12,
        padding: 14,
        border: '0.5px solid var(--color-border-secondary)',
        borderRadius: 8,
        background: 'var(--color-background-tertiary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong style={{ fontSize: 14 }}>{entry.title || TYPE_LABEL[entry.type] + ' detail'}</strong>
        <button type="button" className="fad-util-btn" onClick={onClose} aria-label="Collapse" style={{ fontSize: 11 }}>
          Collapse
        </button>
      </div>
      <p style={{ margin: '0 0 12px', whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
        {entry.description}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, fontSize: 12, marginBottom: 12 }}>
        <Meta label="Reporter" value={entry.user_display_name || entry.user_username || '—'} />
        <Meta label="Submitted" value={new Date(entry.created_at).toLocaleString()} />
        <Meta label="Last update" value={new Date(entry.updated_at).toLocaleString()} />
        <Meta label="Route" value={entry.route_url || '—'} mono />
        <Meta label="Module" value={entry.module_label || '—'} />
        {entry.severity && <Meta label="Severity" value={entry.severity} />}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as FeedbackStatus)}
            style={{ width: '100%', padding: '6px 8px', fontSize: 13, borderRadius: 4, border: '0.5px solid var(--color-border-secondary)' }}
          >
            {(Object.keys(STATUS_LABEL) as FeedbackStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Resolution note</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Optional note explaining the triage decision — what was fixed, why it was a dupe, what we'll consider for next sprint."
            style={{ width: '100%', padding: '6px 8px', fontSize: 13, borderRadius: 4, border: '0.5px solid var(--color-border-secondary)', resize: 'vertical' }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn primary"
          onClick={save}
          disabled={saving || (status === entry.status && note === (entry.resolution_note ?? ''))}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 12, fontFamily: mono ? 'var(--font-mono-fad)' : undefined, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

function Billing() {
  return (
    <div className="card settings-section">
      <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 500 }}>Billing</h3>
      <p style={{ margin: '0 0 16px', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
        Admin-only view. FridayOS + integration subscriptions.
      </p>
      <div className="settings-row">
        <div>
          <h5>Plan</h5>
          <p>Friday Internal · unmetered</p>
        </div>
        <span className="chip info">Active</span>
      </div>
      <div className="settings-row">
        <div>
          <h5>Next invoice</h5>
          <p>May 1, 2026</p>
        </div>
        <span className="settings-value">€ 0 — internal</span>
      </div>
    </div>
  );
}
