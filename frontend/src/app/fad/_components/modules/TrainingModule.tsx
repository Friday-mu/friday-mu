'use client';

// @demo:data — Tag: PROD-DATA-25 — see frontend/DEMO_CRUFT.md
// Training (Sources, Performance, Brand voice sub-pages)
// Entire module is inline demo JSX content (cards, tables, charts with
// hardcoded mock data). Replace with real backend-driven content when
// the module ships, or render a 'Coming soon' placeholder until then.

import { useEffect, useState } from 'react';
import {
  AUTOMATIONS,
  BRAND_VOICE,
  KNOWLEDGE,
  LEARNING_QUEUE,
  LEARNING_SOURCES,
  LEARNING_SOURCE_SUMMARY,
  PERFORMANCE_KPI,
  STAFF_PERFORMANCE,
  type Automation,
  type LearningCandidate,
  type LearningSource,
  type Teaching,
} from '../../_data/gms';
import { apiFetch } from '../../../../components/types';
import { liveOnlyMode } from '../../_data/demoMode';
import { FilterBar, FilterChip, FilterPill } from '../FilterBar';
import { IconAI, IconCheck, IconClose, IconPlus, IconSparkle } from '../icons';
import { ModuleHeader } from '../ModuleHeader';

const TAB_DEFS = [
  { id: 'teachings', label: 'Teachings', desc: 'Active rules Friday follows' },
  { id: 'queue', label: 'Learning Queue', desc: 'Candidates awaiting human approval' },
  { id: 'sources', label: 'Sources', desc: 'Where Friday is learning from, across every module' },
  { id: 'performance', label: 'Performance', desc: 'How teachings apply · per-staff quality metrics' },
  { id: 'knowledge', label: 'Knowledge base', desc: 'Property quirks, policies, brand facts' },
  { id: 'voice', label: 'Brand voice', desc: 'Tone guide + good/bad examples' },
  { id: 'automations', label: 'Automations', desc: 'Rule registry + audit log' },
];

export function TrainingModule() {
  const [tab, setTab] = useState('teachings');
  const liveOnly = liveOnlyMode();
  const visibleTabDefs = liveOnly ? TAB_DEFS.filter((t) => t.id === 'teachings') : TAB_DEFS;
  const tabs = visibleTabDefs.map((t) => ({ id: t.id, label: t.label }));
  const activeDef = TAB_DEFS.find((t) => t.id === tab);
  useEffect(() => {
    if (liveOnly && tab !== 'teachings') setTab('teachings');
  }, [liveOnly, tab]);
  return (
    <>
      <ModuleHeader
        title="Training"
        subtitle="Friday learns from every module · teachings · queue · sources · performance"
        tabs={tabs}
        activeTab={tab}
        onTabChange={setTab}
      />
      
      <div className="fad-module-body">
        {activeDef && (
          <div style={{ marginBottom: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {activeDef.desc}
          </div>
        )}
        {tab === 'teachings' && <TeachingsTab />}
        {liveOnly && tab !== 'teachings' && <TrainingTabPlaceholder label={activeDef?.label || 'This tab'} />}
        {!liveOnly && tab === 'queue' && <LearningQueueTab />}
        {!liveOnly && tab === 'sources' && <SourcesTab />}
        {!liveOnly && tab === 'performance' && <PerformanceTab />}
        {!liveOnly && tab === 'knowledge' && <KnowledgeTab />}
        {!liveOnly && tab === 'voice' && <VoiceTab />}
        {!liveOnly && tab === 'automations' && <AutomationsTab />}
      </div>
    </>
  );
}

function TrainingTabPlaceholder({ label }: { label: string }) {
  return (
    <div className="card" style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary)' }}>
      {label} is still demo-backed. It stays hidden while FAD is in live-only mode.
    </div>
  );
}

function sourceLabel(s: Teaching['source']) {
  return s === 'manual' ? 'Manual' : s === 'auto_pattern' ? 'Auto-pattern' : 'From approved reply';
}

type LiveTeachingRow = {
  id: string;
  instruction: string;
  scope: string | null;
  property_code: string | null;
  property_codes: string[] | null;
  source: string | null;
  status: string | null;
  taught_by: string | null;
  taught_at: string | null;
  evidence_count: number | null;
};

function relativeAge(value: string | null): string {
  if (!value) return '—';
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return '—';
  const diffMin = Math.max(0, Math.floor((Date.now() - ts) / 60_000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 45) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

function mapLiveTeaching(row: LiveTeachingRow): Teaching {
  const propertyCodes = Array.isArray(row.property_codes) ? row.property_codes.filter(Boolean) : [];
  const singleProperty = row.property_code || propertyCodes[0] || null;
  const source: Teaching['source'] =
    row.source === 'manual'
      ? 'manual'
      : row.source === 'approved_reply'
      ? 'approved_reply'
      : 'auto_pattern';
  const status: Teaching['status'] =
    row.status === 'active' ? 'active' : row.status === 'draft' ? 'draft' : 'retired';
  return {
    id: row.id,
    instruction: row.instruction,
    scope: row.scope === 'global'
      ? { kind: 'global' }
      : propertyCodes.length > 1
      ? { kind: 'property_group', targets: propertyCodes }
      : { kind: 'property', targets: singleProperty ? [singleProperty] : [] },
    channel: 'any',
    source,
    status,
    taughtBy: row.taught_by || 'Friday',
    age: relativeAge(row.taught_at),
    applications: Number(row.evidence_count) || 0,
  };
}

function TeachingsTab() {
  const [source, setSource] = useState<string>('all');
  const [status, setStatus] = useState<string>('active');
  const [teachings, setTeachings] = useState<Teaching[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Teaching | null>(null);
  const [newRuleOpen, setNewRuleOpen] = useState(false);
  const [newInstruction, setNewInstruction] = useState('');
  const [newScope, setNewScope] = useState<'global' | 'property'>('global');
  const [newPropertyCode, setNewPropertyCode] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch('/api/inbox/teachings?status=all')
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray((data as { teachings?: LiveTeachingRow[] }).teachings)
          ? (data as { teachings: LiveTeachingRow[] }).teachings
          : [];
        setTeachings(rows.map(mapLiveTeaching));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load teachings');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const filtered = teachings.filter((t) => {
    if (source !== 'all' && t.source !== source) return false;
    if (status !== 'all' && t.status !== status) return false;
    return true;
  });

  const createTeaching = async () => {
    const instruction = newInstruction.trim();
    if (!instruction) {
      setError('Instruction is required.');
      return;
    }
    if (newScope === 'property' && !newPropertyCode.trim()) {
      setError('Property code is required for property-scoped teachings.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await apiFetch('/api/inbox/teachings', {
        method: 'POST',
        body: JSON.stringify({
          instruction,
          scope: newScope,
          property_code: newScope === 'property' ? newPropertyCode.trim() : null,
          source: 'manual',
        }),
      }) as { teaching?: LiveTeachingRow };
      if (data.teaching) {
        const mapped = mapLiveTeaching(data.teaching);
        setTeachings((prev) => [mapped, ...prev.filter((t) => t.id !== mapped.id)]);
        setSel(mapped);
      }
      setNewInstruction('');
      setNewPropertyCode('');
      setNewScope('global');
      setNewRuleOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create teaching');
    } finally {
      setSaving(false);
    }
  };

  const updateTeaching = async (id: string, patch: { instruction?: string; status?: string }) => {
    setError(null);
    try {
      const data = await apiFetch(`/api/inbox/teachings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }) as { teaching?: LiveTeachingRow };
      if (!data.teaching) return;
      const mapped = mapLiveTeaching(data.teaching);
      setTeachings((prev) => prev.map((t) => t.id === mapped.id ? mapped : t));
      setSel(mapped);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update teaching');
    }
  };
  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <FilterBar count={loading ? 'Loading live teachings…' : `${filtered.length} of ${teachings.length}`}>
            <FilterPill
              label="Status"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: 'All statuses' },
                { value: 'active', label: 'Active' },
                { value: 'draft', label: 'Draft' },
                { value: 'retired', label: 'Retired' },
              ]}
            />
            <FilterPill
              label="Source"
              value={source}
              onChange={setSource}
              options={[
                { value: 'all', label: 'All sources' },
                { value: 'manual', label: 'Manual' },
                { value: 'auto_pattern', label: 'Auto-learned' },
                { value: 'approved_reply', label: 'From approved reply' },
              ]}
            />
          </FilterBar>
        </div>
        <button className="btn primary sm" onClick={() => setNewRuleOpen((v) => !v)}>
          <IconPlus size={12} /> New rule
        </button>
      </div>
      {newRuleOpen && (
        <div className="card" style={{ padding: 12, marginBottom: 12, display: 'grid', gap: 8 }}>
          <textarea
            value={newInstruction}
            onChange={(e) => setNewInstruction(e.target.value)}
            rows={3}
            className="fad-input"
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
            placeholder="Write the instruction Friday should follow."
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="fad-input" value={newScope} onChange={(e) => setNewScope(e.target.value as 'global' | 'property')} style={{ maxWidth: 180 }}>
              <option value="global">Global</option>
              <option value="property">Property</option>
            </select>
            {newScope === 'property' && (
              <input
                value={newPropertyCode}
                onChange={(e) => setNewPropertyCode(e.target.value)}
                className="fad-input"
                style={{ maxWidth: 180 }}
                placeholder="Property code"
              />
            )}
            <button className="btn primary sm" onClick={createTeaching} disabled={saving}>
              {saving ? 'Saving…' : 'Save teaching'}
            </button>
            <button className="btn ghost sm" onClick={() => setNewRuleOpen(false)} disabled={saving}>Cancel</button>
          </div>
        </div>
      )}
      {error && (
        <div role="alert" style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 6, background: 'var(--color-bg-danger)', color: 'var(--color-text-danger)', fontSize: 12 }}>
          Live teachings failed to load: {error}
        </div>
      )}
      <div className="card">
        {!loading && filtered.length === 0 && !error && (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary)' }}>
            No live teachings match this filter.
          </div>
        )}
        {filtered.map((t) => (
          <div key={t.id} className="row" onClick={() => setSel(t)} style={{ padding: '14px 16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, marginBottom: 4, lineHeight: 1.5 }}>{t.instruction}</div>
              <div className="row-meta">
                <span>
                  {t.scope.kind === 'global'
                    ? 'Global'
                    : t.scope.kind === 'property'
                    ? `Property · ${t.scope.targets?.[0]}`
                    : `${t.scope.targets?.length} properties`}
                </span>
                <span className="sep">·</span>
                <span>Channel: {t.channel}</span>
                <span className="sep">·</span>
                <span>{sourceLabel(t.source)} · {t.taughtBy} · {t.age}</span>
                <span className="sep">·</span>
                <span>{t.applications} applications</span>
              </div>
            </div>
            <span className={'chip ' + (t.status === 'active' ? 'info' : t.status === 'retired' ? '' : 'warn')} style={{ flexShrink: 0 }}>
              {t.status}
            </span>
          </div>
        ))}
      </div>
      {sel && <TeachingDetail teaching={sel} onClose={() => setSel(null)} onUpdate={updateTeaching} />}
    </>
  );
}

function TeachingDetail({
  teaching,
  onClose,
  onUpdate,
}: {
  teaching: Teaching;
  onClose: () => void;
  onUpdate: (id: string, patch: { instruction?: string; status?: string }) => Promise<void>;
}) {
  const editInstruction = () => {
    const next = window.prompt('Instruction', teaching.instruction);
    if (next && next.trim() && next.trim() !== teaching.instruction) {
      void onUpdate(teaching.id, { instruction: next.trim() });
    }
  };
  return (
    <>
      <div
        style={{ position: 'fixed', inset: '48px 0 0 0', background: 'rgba(15, 24, 54, 0.12)', zIndex: 44 }}
        onClick={onClose}
      />
      <aside className="task-detail-pane open" style={{ width: 520 }}>
        <div className="task-detail-header">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span className="avatar sm"><IconAI size={14} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
                Teaching · {teaching.id.toUpperCase()}
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4, lineHeight: 1.5 }}>
                {teaching.instruction}
              </div>
            </div>
            <button className="fad-util-btn" onClick={onClose} title="Close"><IconClose size={14} /></button>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className={'chip ' + (teaching.status === 'active' ? 'info' : '')}>{teaching.status}</span>
            <span className="chip">{sourceLabel(teaching.source)}</span>
            <span className="chip">Channel: {teaching.channel}</span>
          </div>
        </div>
        <div className="task-detail-body">
          <div className="task-detail-section">
            <h5>Scope</h5>
            <div style={{ fontSize: 13 }}>
              {teaching.scope.kind === 'global' ? (
                'Applies globally across all properties and channels.'
              ) : teaching.scope.kind === 'property' ? (
                <>Single property: {teaching.scope.targets?.[0]}</>
              ) : (
                <>
                  Property group · {teaching.scope.targets?.length} properties
                  <div className="mono" style={{ fontSize: 11, marginTop: 4, color: 'var(--color-text-tertiary)' }}>
                    {teaching.scope.targets?.join(' · ')}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="task-detail-section">
            <h5>Provenance</h5>
            <div className="row" style={{ padding: '6px 0', border: 0 }}>
              <span style={{ width: 90, fontSize: 11, color: 'var(--color-text-tertiary)' }}>Source</span>
              <span style={{ fontSize: 13 }}>{sourceLabel(teaching.source)}</span>
            </div>
            <div className="row" style={{ padding: '6px 0', border: 0 }}>
              <span style={{ width: 90, fontSize: 11, color: 'var(--color-text-tertiary)' }}>Taught by</span>
              <span style={{ fontSize: 13 }}>{teaching.taughtBy}</span>
            </div>
            <div className="row" style={{ padding: '6px 0', border: 0 }}>
              <span style={{ width: 90, fontSize: 11, color: 'var(--color-text-tertiary)' }}>Created</span>
              <span style={{ fontSize: 13 }}>{teaching.age}</span>
            </div>
            <div className="row" style={{ padding: '6px 0', border: 0 }}>
              <span style={{ width: 90, fontSize: 11, color: 'var(--color-text-tertiary)' }}>Applied</span>
              <span style={{ fontSize: 13 }}>{teaching.applications} times</span>
            </div>
          </div>
          <div className="task-detail-section">
            <h5>Actions</h5>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn sm" onClick={editInstruction}>Edit instruction</button>
              {teaching.status === 'active' ? (
                <button className="btn ghost sm" onClick={() => { void onUpdate(teaching.id, { status: 'retired' }); }}>Retire</button>
              ) : (
                <button className="btn ghost sm" onClick={() => { void onUpdate(teaching.id, { status: 'active' }); }}>Re-activate</button>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function LearningQueueTab() {
  const pending = LEARNING_QUEUE.filter((c) => c.status === 'pending');
  return (
    <div>
      <div style={{ marginBottom: 16, padding: 12, background: 'var(--color-bg-info)', border: '0.5px solid var(--color-border-info)', borderRadius: 8, fontSize: 13, color: 'var(--color-text-info)' }}>
        <strong style={{ fontWeight: 500 }}>Friday extracted {pending.length} candidate teachings</strong>{' '}
        from approved replies across Inbox, Tasks, Reviews, and Owner threads over the last 14 days. Approve to promote into active teachings.
      </div>
      <div className="card">
        {pending.map((c) => <CandidateRow key={c.id} c={c} />)}
      </div>
    </div>
  );
}

function CandidateRow({ c }: { c: LearningCandidate }) {
  const [expanded, setExpanded] = useState(false);
  const lowConf = c.confidence < 0.8;
  return (
    <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <span className="avatar sm"><IconAI size={14} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 6 }}>{c.summary}</div>
          <div className="row-meta">
            <span>{c.evidence.length} threads</span>
            <span className="sep">·</span>
            <span>{c.age}</span>
            <span className="sep">·</span>
            <span style={{ color: lowConf ? 'var(--color-text-warning)' : 'var(--color-text-tertiary)' }}>
              {lowConf && '⚠ '}{Math.round(c.confidence * 100)}% confidence
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexShrink: 0, flexWrap: 'wrap' }}>
          <button className="btn ghost sm" onClick={() => setExpanded((v) => !v)}>{expanded ? 'Hide evidence' : 'Evidence'}</button>
          <button className="btn sm"><IconCheck size={12} /> Approve</button>
          <button className="btn ghost sm">Reject</button>
        </div>
      </div>
      {expanded && (
        <div style={{ marginTop: 10, marginLeft: 42, padding: 10, background: 'var(--color-background-secondary)', borderRadius: 4 }}>
          {c.evidence.map((e, i) => (
            <div key={i} style={{ fontSize: 12, padding: '4px 0', color: 'var(--color-text-secondary)' }}>
              <span className="mono" style={{ color: 'var(--color-text-tertiary)' }}>{e.thread}</span> — {e.edit}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SourcesTab() {
  return (
    <>
      <div className="kpi-grid">
        {LEARNING_SOURCE_SUMMARY.map((s) => (
          <div className="kpi" key={s.origin}>
            <div className="kpi-label">{s.origin}</div>
            <div className="kpi-value">{s.count}</div>
            <div className="kpi-sub">{s.teachings} teachings created</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Learning activity · past 7 days</div>
          <div className="card-subtitle">{LEARNING_SOURCES.length} events</div>
        </div>
        {LEARNING_SOURCES.map((s) => <SourceRow key={s.id} s={s} />)}
      </div>
    </>
  );
}

function SourceRow({ s }: { s: LearningSource }) {
  return (
    <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <span className="chip" style={{ flexShrink: 0, width: 72, justifyContent: 'center' }}>{s.origin}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, lineHeight: 1.55 }}>{s.action}</div>
        {s.teachingCreated && (
          <div style={{ fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconAI size={11} />
            <span style={{ color: 'var(--color-brand-accent)' }}>{s.teachingCreated}</span>
          </div>
        )}
        <div className="row-meta" style={{ marginTop: 4 }}>
          {s.staff && <span>{s.staff}</span>}
          {s.staff && <span className="sep">·</span>}
          <span>{s.time}</span>
        </div>
      </div>
    </div>
  );
}

function PerformanceTab() {
  return (
    <>
      <div className="kpi-grid">
        {PERFORMANCE_KPI.map((k, i) => (
          <div className="kpi" key={i}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Per-staff performance</div>
          <div className="card-subtitle">trailing 30 days</div>
        </div>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr 0.8fr 1.2fr 1fr 1fr 0.8fr',
            minWidth: 720,
            gap: 12,
            padding: '10px 16px',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--color-text-tertiary)',
          }}
        >
          <span>Staff</span>
          <span>Role</span>
          <span>Conv.</span>
          <span>First-draft acc.</span>
          <span>Teachings</span>
          <span>Avg resp.</span>
          <span>Credits</span>
        </div>
        {STAFF_PERFORMANCE.map((p) => (
          <div
            key={p.name}
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 1fr 0.8fr 1.2fr 1fr 1fr 0.8fr',
            minWidth: 720,
              gap: 12,
              padding: '14px 16px',
              borderBottom: '0.5px solid var(--color-border-tertiary)',
              fontSize: 13,
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="avatar sm">{p.name[0]}</span>
              <span style={{ fontWeight: 500 }}>{p.name}</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{p.role}</span>
            <span className="mono">{p.conversations}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 60, height: 6, background: 'var(--color-background-secondary)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${p.firstDraftAcceptance * 100}%`, height: '100%', background: 'var(--color-brand-accent)' }} />
              </div>
              <span className="mono" style={{ fontSize: 12 }}>{Math.round(p.firstDraftAcceptance * 100)}%</span>
            </div>
            <span className="mono">{p.teachingsContributed}</span>
            <span className="mono" style={{ fontSize: 12 }}>{p.avgResponseTime}</span>
            <span className="mono" style={{ fontSize: 12 }}>€ {p.creditSpend.toFixed(2)}</span>
          </div>
        ))}
        </div>
      </div>
    </>
  );
}

function KnowledgeTab() {
  const [cat, setCat] = useState<string>('all');
  const cats = Array.from(new Set(KNOWLEDGE.map((k) => k.category)));
  const filtered = cat === 'all' ? KNOWLEDGE : KNOWLEDGE.filter((k) => k.category === cat);
  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <FilterBar>
            <FilterChip active={cat === 'all'} onClick={() => setCat('all')}>All</FilterChip>
            {cats.map((c) => (
              <FilterChip key={c} active={cat === c} onClick={() => setCat(c)}>{c}</FilterChip>
            ))}
          </FilterBar>
        </div>
        <button className="btn primary sm"><IconPlus size={12} /> New entry</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {filtered.map((k) => (
          <div key={k.id} className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span className="chip">{k.category}</span>
              <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-tertiary)' }}>{k.lastUpdated}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>{k.title}</div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>{k.body}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function VoiceTab() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-tertiary)', marginBottom: 12 }}>Principles</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {BRAND_VOICE.principles.map((p, i) => (
            <div key={i}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{p.title}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>{p.detail}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="two-col">
        <div className="card">
          <div className="card-header" style={{ color: 'var(--color-text-success)' }}>
            <div className="card-title">✓ Good examples</div>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {BRAND_VOICE.examples.good.map((e, i) => (
              <div key={i} style={{ padding: 10, background: 'var(--color-bg-success)', borderLeft: '2px solid var(--color-text-success)', fontSize: 13, lineHeight: 1.55 }}>{e}</div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header" style={{ color: 'var(--color-text-danger)' }}>
            <div className="card-title">✗ Avoid</div>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {BRAND_VOICE.examples.bad.map((e, i) => (
              <div key={i} style={{ padding: 10, background: 'var(--color-bg-danger)', borderLeft: '2px solid var(--color-text-danger)', fontSize: 13, lineHeight: 1.55 }}>{e}</div>
            ))}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">Tone by situation</div></div>
        {BRAND_VOICE.tones.map((t, i) => (
          <div key={i} className="row">
            <div style={{ flex: 1 }}><div style={{ fontSize: 13 }}>{t.situation}</div></div>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{t.tone}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AutomationsTab() {
  const [tierFilter, setTierFilter] = useState<string>('all');
  const filtered = tierFilter === 'all' ? AUTOMATIONS : AUTOMATIONS.filter((a) => a.tier === tierFilter);
  return (
    <>
      <div style={{ marginBottom: 16, padding: 12, background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 8, fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Auto · read + meta</div>
          <div>Tagging, classifying, summarizing, flagging, translation-for-reading.</div>
        </div>
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Internal · auto + logged</div>
          <div>Tasks, leads, internal records, Slack pings. All undoable 24h.</div>
        </div>
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-tertiary)', marginBottom: 2 }}>External · drafted</div>
          <div>Messages to guests / owners / vendors. Always approve before send.</div>
        </div>
      </div>
      <FilterBar count={`${filtered.length} rules`}>
        {['all', 'auto', 'internal', 'external'].map((t) => (
          <FilterChip key={t} active={tierFilter === t} onClick={() => setTierFilter(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </FilterChip>
        ))}
      </FilterBar>
      <div className="card">
        {filtered.map((a) => <AutomationRow key={a.id} a={a} />)}
      </div>
    </>
  );
}

function AutomationRow({ a }: { a: Automation }) {
  const [active, setActive] = useState(a.active);
  const lowConf = a.confidence < 0.8;
  return (
    <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span className="avatar sm"><IconSparkle size={14} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{a.trigger}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: 6 }}>→ {a.action}</div>
          <div className="row-meta">
            <span className={'chip ' + (a.tier === 'auto' ? 'info' : a.tier === 'internal' ? '' : 'warn')}>{a.tier}</span>
            <span className="sep">·</span>
            <span style={{ color: lowConf ? 'var(--color-text-warning)' : 'var(--color-text-tertiary)' }}>
              {lowConf && '⚠ '}{Math.round(a.confidence * 100)}% confidence
            </span>
            <span className="sep">·</span>
            <span>{a.fires30d} fires · 30d</span>
            <span className="sep">·</span>
            <span>last: {a.lastFired}</span>
          </div>
        </div>
        <div style={{ flexShrink: 0, alignSelf: 'flex-start', marginLeft: 8 }}>
          <div className={'toggle' + (active ? ' on' : '')} onClick={() => setActive((v) => !v)} title={active ? 'Disable rule' : 'Enable rule'} />
        </div>
      </div>
    </div>
  );
}
