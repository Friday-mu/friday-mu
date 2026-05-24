'use client';

// @demo:data + @demo:auth — Tag: PROD-DATA-20 — see frontend/DEMO_CRUFT.md
// SettingsModule has multiple inline demo blocks:
//   - Hardcoded user "Ishant Sagoo" / "ishant@friday.mu" (replace with auth context)
//   - Inline team roster of 6 names (lines ~131-136) → GET /api/users/team
//   - Hardcoded integrations list (lines ~171-178) → GET /api/integrations
//   - Feedback inbox is live; screenshots + fix evidence load from /api/feedback
//   - Billing info "Friday Internal · unmetered" (lines ~233-238) → GET /api/billing
// Each block gets its own backend endpoint when wired.

import { useEffect, useState } from 'react';
import { ModuleHeader } from '../ModuleHeader';
import { useCurrentRole, usePermissions } from '../usePermissions';
import { SavedRepliesImport } from './properties/SavedRepliesImport';
import { apiFetch } from '../../../../components/types';
import { ChangePasswordModal } from '../ChangePasswordModal';
import { fireToast } from '../Toaster';
import { TASK_USER_BY_ID } from '../../_data/tasks';
import { ROLE_LABEL } from '../../_data/permissions';
import { useT } from '../../_i18n/useT';

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
  const { t } = useT();
  const sections = role === 'field' ? SECTIONS.filter((s) => FIELD_SECTION_IDS.has(s.id)) : SECTIONS;
  const [section, setSection] = useState(sections[0]?.id ?? 'appearance');
  return (
    <>
      <ModuleHeader
        title={t('settings.title', 'Settings')}
        subtitle={role === 'field' ? 'Your profile and device preferences' : 'Your profile, team, GMS, and system preferences'}
      />
      <div className="fad-module-body">
        <div className="settings-layout">
          <div className="settings-nav">
            {sections.map((s) => (
              <button
                key={s.id}
                className={'settings-nav-item' + (section === s.id ? ' active' : '')}
                onClick={() => setSection(s.id)}
              >
                {t(`settings.sections.${s.id}`, s.label)}
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
  const { t, lang, setLang } = useT();
  return (
    <div className="card settings-section">
      <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 500 }}>{t('settings.sections.appearance', 'Appearance')}</h3>
      <p style={{ margin: '0 0 16px', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
        {t('settings.appearance.subtitle', 'Light, dark, or follow your system.')}
      </p>
      <div className="settings-row">
        <div>
          <h5>{t('settings.appearance.darkMode', 'Dark mode')}</h5>
          <p>
            {t('settings.appearance.currentlyLabel', 'Currently:')} {t(`settings.theme.${theme}`, theme)}.{' '}
            {t('settings.appearance.darkModeHelp', 'FAD follows your OS preference by default.')}
          </p>
        </div>
        <div className={'toggle' + (theme === 'dark' ? ' on' : '')} onClick={onToggleTheme} />
      </div>
      {/* T3.15 — language toggle (lives in Appearance because Settings
          for field staff is restricted to appearance + account only). */}
      <div className="settings-row">
        <div>
          <h5>{t('settings.language.label', 'Language')}</h5>
          <p>{t('settings.language.help', 'Choose the language used for buttons, menus and labels across modules you can access.')}</p>
        </div>
        <div role="radiogroup" aria-label={t('settings.language.label', 'Language')} style={{ display: 'inline-flex', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          {(['en', 'fr'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={lang === opt}
              onClick={() => { void setLang(opt); }}
              style={{
                padding: '6px 14px',
                fontSize: 13,
                background: lang === opt ? 'var(--color-brand-accent)' : 'transparent',
                color: lang === opt ? '#fff' : 'var(--color-text-secondary)',
                border: 'none',
                cursor: 'pointer',
                fontWeight: lang === opt ? 500 : 400,
                fontFamily: 'inherit',
              }}
            >
              {opt === 'en' ? t('settings.language.en', 'English') : t('settings.language.fr', 'Français')}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-row">
        <div>
          <h5>{t('settings.appearance.density', 'Density')}</h5>
          <p>{t('settings.appearance.densityHelp', 'Dense is standard for Inbox; comfy on large displays.')}</p>
        </div>
        <span className="settings-value">{t('settings.appearance.densityValue', 'Dense')}</span>
      </div>
      <div className="settings-row">
        <div>
          <h5>{t('settings.appearance.sidebar', 'Sidebar')}</h5>
          <p>{t('settings.appearance.sidebarHelp', 'Remembered per device.')}</p>
        </div>
        <span className="settings-value">{t('settings.appearance.sidebarValue', 'Expanded')}</span>
      </div>
    </div>
  );
}

function Account() {
  const { role, currentUserId } = usePermissions();
  const fixtureUser = TASK_USER_BY_ID[currentUserId];
  const [displayName, setDisplayName] = useState(fixtureUser?.name ?? 'Current user');
  const [pwOpen, setPwOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('gms_display_name');
    setDisplayName(stored || fixtureUser?.name || 'Current user');
  }, [fixtureUser?.name]);

  const email = fixtureUser?.email ?? 'Not set';
  const roleLabel = ROLE_LABEL[role] ?? role;

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
        <span className="settings-value">{displayName}</span>
      </div>
      <div className="settings-row">
        <div>
          <h5>Email</h5>
          <p>Login + notifications.</p>
        </div>
        <span className="settings-value">{email}</span>
      </div>
      <div className="settings-row">
        <div>
          <h5>Role</h5>
          <p>{role === 'field' ? 'Personal access for assigned work.' : 'Access is scoped by role.'}</p>
        </div>
        <span className="chip info">{roleLabel}</span>
      </div>
      <div className="settings-row">
        <div>
          <h5>Password</h5>
          <p>Change your sign-in password.</p>
        </div>
        <button className="btn ghost sm" onClick={() => setPwOpen(true)}>
          Change password
        </button>
      </div>
      {pwOpen && (
        <ChangePasswordModal
          mode="optional"
          onChanged={() => {
            setPwOpen(false);
            fireToast('Password updated');
          }}
          onCancel={() => setPwOpen(false)}
        />
      )}
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
  source: string | null;
  has_screenshot?: boolean;
  screenshot_data_url?: string | null;
  triaged_at: string | null;
  fixed_commit: string | null;
  fixed_branch: string | null;
  fix_deployed_at: string | null;
  fix_verified_at: string | null;
  fix_verification_note: string | null;
  root_cause: string | null;
  created_at: string;
  updated_at: string;
}

type FeedbackPatch = {
  status?: FeedbackStatus;
  resolution_note?: string | null;
  root_cause?: string | null;
  fixed_commit?: string | null;
  fixed_branch?: string | null;
  fix_deployed_at?: string | null;
  fix_verified_at?: string | null;
  fix_verification_note?: string | null;
};

type FeedbackTurn = {
  role: 'You' | 'Friday' | 'Report';
  text: string;
};

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

function fixStateLabel(entry: FeedbackEntry): string | null {
  if (entry.fix_verified_at) return 'Verified';
  if (entry.fix_deployed_at) return 'Deployed';
  if (entry.fixed_commit) return 'Fixed';
  if (entry.triaged_at) return 'Triaged';
  return null;
}

function parseFeedbackTurns(description: string): FeedbackTurn[] {
  const chunks = description
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return chunks.map((chunk) => {
    const you = chunk.match(/^\*\*You:\*\*\s*([\s\S]*)$/);
    if (you) return { role: 'You', text: you[1].trim() };
    const friday = chunk.match(/^\*\*Friday:\*\*\s*([\s\S]*)$/);
    if (friday) return { role: 'Friday', text: friday[1].trim() };
    return { role: 'Report', text: chunk };
  });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function FeedbackInbox() {
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<FeedbackType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<FeedbackEntry | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    apiFetch(`/api/feedback/${selectedId}`)
      .then((res) => {
        if (!cancelled) setSelectedDetail((res as { feedback: FeedbackEntry }).feedback);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedId]);

  const updateEntry = async (id: string, patch: FeedbackPatch) => {
    try {
      const updated = (await apiFetch(`/api/feedback/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })) as FeedbackEntry;
      setSelectedDetail(updated);
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

      {entries.map((e) => {
        // Count `**You:**` markers to derive the turn count. The
        // bug-report FAB persists the full chat transcript as
        // markdown (one **You:** per user message, one **Friday:**
        // per assistant reply). Old single-textarea reports have 0
        // user markers — those render without the turn chip.
        const userTurns = (e.description.match(/\*\*You:\*\*/g) || []).length;
        return (
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
	                {userTurns > 0 && (
	                  <span
                    title={`${userTurns} user turn${userTurns === 1 ? '' : 's'} in the chat — open to read the full transcript`}
                    style={{
                      fontSize: 10,
                      padding: '1px 7px',
                      borderRadius: 999,
                      background: 'var(--color-brand-accent-soft)',
                      color: 'var(--color-brand-accent)',
                      fontWeight: 500,
                    }}
                  >
                    💬 {userTurns}
                  </span>
	                )}
	                {e.has_screenshot && <span className="chip">Screenshot</span>}
	              </div>
              <p style={{ margin: 0 }}>
                {e.user_display_name || e.user_username || 'unknown'} · {new Date(e.created_at).toLocaleString()}
                {e.module_label && <> · on <em>{e.module_label}</em></>}
                {e.route_url && <> · <code style={{ fontSize: 10 }}>{e.route_url}</code></>}
              </p>
	            </div>
	            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
	              {fixStateLabel(e) && <span className="chip info">{fixStateLabel(e)}</span>}
	              <span className={'chip ' + STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</span>
	            </div>
	          </div>
	        );
	      })}

	      {selected && (
	        <FeedbackDetail
	          entry={selectedDetail || selected}
	          loadingDetail={detailLoading}
	          onUpdate={(patch) => updateEntry(selected.id, patch)}
	          onClose={() => setSelectedId(null)}
	        />
      )}
    </div>
  );
}

function FeedbackDetail({
  entry,
  loadingDetail = false,
  onUpdate,
  onClose,
}: {
  entry: FeedbackEntry;
  loadingDetail?: boolean;
  onUpdate: (patch: FeedbackPatch) => void | Promise<void>;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<FeedbackStatus>(entry.status);
  const [note, setNote] = useState(entry.resolution_note ?? '');
  const [rootCause, setRootCause] = useState(entry.root_cause ?? '');
  const [fixedCommit, setFixedCommit] = useState(entry.fixed_commit ?? '');
  const [fixedBranch, setFixedBranch] = useState(entry.fixed_branch ?? '');
  const [deployedAt, setDeployedAt] = useState(entry.fix_deployed_at ?? '');
  const [verifiedAt, setVerifiedAt] = useState(entry.fix_verified_at ?? '');
  const [verificationNote, setVerificationNote] = useState(entry.fix_verification_note ?? '');
  const [saving, setSaving] = useState(false);
  const turns = parseFeedbackTurns(entry.description);

  useEffect(() => {
    setStatus(entry.status);
    setNote(entry.resolution_note ?? '');
    setRootCause(entry.root_cause ?? '');
    setFixedCommit(entry.fixed_commit ?? '');
    setFixedBranch(entry.fixed_branch ?? '');
    setDeployedAt(entry.fix_deployed_at ?? '');
    setVerifiedAt(entry.fix_verified_at ?? '');
    setVerificationNote(entry.fix_verification_note ?? '');
  }, [
    entry.id,
    entry.status,
    entry.resolution_note,
    entry.root_cause,
    entry.fixed_commit,
    entry.fixed_branch,
    entry.fix_deployed_at,
    entry.fix_verified_at,
    entry.fix_verification_note,
  ]);

  const save = async () => {
    setSaving(true);
    try {
      await onUpdate({
        status,
        resolution_note: note.trim() || null,
        root_cause: rootCause.trim() || null,
        fixed_commit: fixedCommit.trim() || null,
        fixed_branch: fixedBranch.trim() || null,
        fix_deployed_at: deployedAt.trim() || null,
        fix_verified_at: verifiedAt.trim() || null,
        fix_verification_note: verificationNote.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  };

  const stampLiveVersion = async () => {
    try {
      const res = await fetch('/version.json', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as { version?: string; gitCommit?: string; branch?: string; builtAt?: string };
        setFixedCommit(data.gitCommit || data.version || fixedCommit);
        setFixedBranch(data.branch || fixedBranch);
        setDeployedAt(data.builtAt || new Date().toISOString());
        return;
      }
    } catch {
      // Fall through to a local timestamp. Version metadata is helpful,
      // but the operator still needs a quick deployed-at stamp.
    }
    setDeployedAt(new Date().toISOString());
  };

  const markVerifiedNow = () => {
    setVerifiedAt(new Date().toISOString());
    if (!status || status === 'new' || status === 'triaged' || status === 'in_progress') {
      setStatus('resolved');
    }
  };

  const dirty =
    status !== entry.status ||
    note !== (entry.resolution_note ?? '') ||
    rootCause !== (entry.root_cause ?? '') ||
    fixedCommit !== (entry.fixed_commit ?? '') ||
    fixedBranch !== (entry.fixed_branch ?? '') ||
    deployedAt !== (entry.fix_deployed_at ?? '') ||
    verifiedAt !== (entry.fix_verified_at ?? '') ||
    verificationNote !== (entry.fix_verification_note ?? '');

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
      {loadingDetail && (
        <div style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          Loading screenshot and full report…
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, fontSize: 12, marginBottom: 12 }}>
        <Meta label="Reporter" value={entry.user_display_name || entry.user_username || '—'} />
        <Meta label="Submitted" value={formatDateTime(entry.created_at)} />
        <Meta label="Last update" value={formatDateTime(entry.updated_at)} />
        <Meta label="Route" value={entry.route_url || '—'} mono />
        <Meta label="Module" value={entry.module_label || '—'} />
        {entry.severity && <Meta label="Severity" value={entry.severity} />}
        <Meta label="Fix state" value={fixStateLabel(entry) || STATUS_LABEL[entry.status]} />
        <Meta label="Fixed commit" value={entry.fixed_commit || '—'} mono />
        <Meta label="Deployed" value={formatDateTime(entry.fix_deployed_at)} />
        <Meta label="Verified" value={formatDateTime(entry.fix_verified_at)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, marginBottom: 12 }}>
        <section>
          <h4 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600 }}>Report thread</h4>
          <div style={{ display: 'grid', gap: 8 }}>
            {turns.map((turn, index) => (
              <div
                key={`${turn.role}-${index}`}
                style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '0.5px solid var(--color-border-tertiary)',
                  background: turn.role === 'Friday' ? 'var(--color-background-secondary)' : 'var(--color-background-primary)',
                }}
              >
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>
                  {turn.role}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.45, color: 'var(--color-text-primary)' }}>
                  {turn.text}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h4 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600 }}>Screenshot</h4>
          {entry.screenshot_data_url ? (
            <a href={entry.screenshot_data_url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
              <img
                src={entry.screenshot_data_url}
                alt="Attached bug report screenshot"
                style={{
                  display: 'block',
                  width: '100%',
                  maxHeight: 520,
                  objectFit: 'contain',
                  borderRadius: 6,
                  border: '0.5px solid var(--color-border-secondary)',
                  background: 'var(--color-background-primary)',
                }}
              />
            </a>
          ) : (
            <div style={{ padding: '12px 10px', borderRadius: 6, border: '0.5px dashed var(--color-border-secondary)', color: 'var(--color-text-tertiary)', fontSize: 12 }}>
              {entry.has_screenshot ? 'Screenshot metadata exists, but the full image is still loading.' : 'No screenshot was attached.'}
            </div>
          )}
        </section>
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
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Fixed commit / version</label>
          <input
            value={fixedCommit}
            onChange={(e) => setFixedCommit(e.target.value)}
            placeholder="Commit hash or deployed version"
            style={{ width: '100%', padding: '6px 8px', fontSize: 13, borderRadius: 4, border: '0.5px solid var(--color-border-secondary)' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Fixed branch</label>
          <input
            value={fixedBranch}
            onChange={(e) => setFixedBranch(e.target.value)}
            placeholder="Branch or PR"
            style={{ width: '100%', padding: '6px 8px', fontSize: 13, borderRadius: 4, border: '0.5px solid var(--color-border-secondary)' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Deployed at</label>
          <input
            value={deployedAt}
            onChange={(e) => setDeployedAt(e.target.value)}
            placeholder="ISO date or use live version"
            style={{ width: '100%', padding: '6px 8px', fontSize: 13, borderRadius: 4, border: '0.5px solid var(--color-border-secondary)' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Verified at</label>
          <input
            value={verifiedAt}
            onChange={(e) => setVerifiedAt(e.target.value)}
            placeholder="ISO date after screenshot/repro check"
            style={{ width: '100%', padding: '6px 8px', fontSize: 13, borderRadius: 4, border: '0.5px solid var(--color-border-secondary)' }}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Root cause</label>
          <textarea
            value={rootCause}
            onChange={(e) => setRootCause(e.target.value)}
            rows={2}
            placeholder="What actually caused the report?"
            style={{ width: '100%', padding: '6px 8px', fontSize: 13, borderRadius: 4, border: '0.5px solid var(--color-border-secondary)', resize: 'vertical' }}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Verification note</label>
          <textarea
            value={verificationNote}
            onChange={(e) => setVerificationNote(e.target.value)}
            rows={2}
            placeholder="Screenshot/repro checked, test run, live route checked, remaining risk."
            style={{ width: '100%', padding: '6px 8px', fontSize: 13, borderRadius: 4, border: '0.5px solid var(--color-border-secondary)', resize: 'vertical' }}
          />
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
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn ghost sm" onClick={stampLiveVersion}>
            Use live version
          </button>
          <button type="button" className="btn ghost sm" onClick={markVerifiedNow}>
            Verified now
          </button>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={save}
          disabled={saving || !dirty}
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
