'use client';

// Ask Friday Review — staff queue for approving / rejecting KB candidates
// proposed by the Core analyzer AND for browsing / drafting / publishing
// context packs that surfaces consume. Backend at /api/ask-friday/core/*.
//
// Two sub-pages, toggleable via the segmented control at the top:
//  - candidates : KB candidate review queue (T2.7 / Core Slice 2)
//  - packs      : Context-pack admin (T3.1 / Core Slice 3)
//
// V1 audience: director only (gated via MODULE_RESOURCE['ask-friday-review']
// → 'admin_analytics' resource). Per the Ask Friday Core handover, "Ishant
// is the V1 reviewer." Widen to ops_manager when the queue workflow stabilises.

import { useMemo, useState } from 'react';
import { ModuleHeader } from '../ModuleHeader';
import {
  publishContextPack,
  reviewKbCandidate,
  upsertContextPack,
  useContextPacks,
  useKbCandidates,
  type ContextPack,
  type ContextPackStatus,
  type KbCandidate,
  type KbCandidateReviewStatus,
} from '../../_data/askFridayCoreClient';
import { fireToast } from '../Toaster';
import { IconAI, IconCheck, IconClose, IconClock, IconPlus, IconSparkle } from '../icons';

interface Props {
  subPage: string;
  onChangeSubPage?: (sub: string) => void;
}

type ModeKey = 'candidates' | 'packs';
type TabKey = 'pending' | 'needs_info' | 'approved' | 'rejected' | 'all';

const TABS: Array<{ id: TabKey; label: string; status: KbCandidateReviewStatus | 'all' }> = [
  { id: 'pending',    label: 'Pending',    status: 'pending' },
  { id: 'needs_info', label: 'Needs info', status: 'needs_info' },
  { id: 'approved',   label: 'Approved',   status: 'approved' },
  { id: 'rejected',   label: 'Rejected',   status: 'rejected' },
  { id: 'all',        label: 'All',        status: 'all' },
];

function fmtRelative(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function riskColor(risk: string | null): string {
  if (risk === 'high') return 'red';
  if (risk === 'review') return 'amber';
  if (risk === 'safe') return 'green';
  return 'neutral';
}

function trustColor(trust: string | null): string {
  if (trust === 'verified') return 'green';
  if (trust === 'corroborated') return 'amber';
  return 'neutral';
}

export function AskFridayReviewModule({ subPage, onChangeSubPage }: Props) {
  const mode: ModeKey = subPage === 'packs' ? 'packs' : 'candidates';
  const setMode = (next: ModeKey) => onChangeSubPage?.(next);
  const [tab, setTab] = useState<TabKey>('pending');
  const [selected, setSelected] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const statusFilter = TABS.find((t) => t.id === tab)?.status || 'pending';
  const { candidates, loading, isRevalidating, error, refetch } = useKbCandidates({
    status: statusFilter,
    limit: 200,
  });

  const sortedCandidates = useMemo(() => {
    if (!candidates) return null;
    // Pending first, then by createdAt desc.
    return [...candidates].sort((a, b) => {
      if (a.reviewStatus !== b.reviewStatus) {
        if (a.reviewStatus === 'pending') return -1;
        if (b.reviewStatus === 'pending') return 1;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [candidates]);

  const counts = useMemo(() => {
    const c: Record<KbCandidateReviewStatus, number> = {
      pending: 0, needs_info: 0, approved: 0, rejected: 0, expired: 0,
    };
    (candidates || []).forEach((k) => { c[k.reviewStatus] = (c[k.reviewStatus] || 0) + 1; });
    return c;
  }, [candidates]);

  const selectedCandidate = useMemo(
    () => (selected ? sortedCandidates?.find((c) => c.candidateId === selected) : null) || null,
    [selected, sortedCandidates],
  );

  const review = async (candidateId: string, next: KbCandidateReviewStatus, note?: string) => {
    setBusyId(candidateId);
    try {
      await reviewKbCandidate(candidateId, { reviewStatus: next, reviewNote: note });
      fireToast(
        next === 'approved' ? 'Candidate approved.'
        : next === 'rejected' ? 'Candidate rejected.'
        : 'Candidate marked needs-info.',
      );
      refetch();
      // Stay on the selected row even after status change so the operator
      // can see the audit fields populate. The list filter will hide it
      // from the current tab on the next render if status moved out.
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Review failed');
    } finally {
      setBusyId(null);
    }
  };

  const headerActions = (
    <>
      <button className="btn ghost sm" onClick={refetch} disabled={isRevalidating} title="Reload from Core">
        <IconClock size={12} /> {isRevalidating ? 'Refreshing…' : 'Refresh'}
      </button>
    </>
  );

  return (
    <>
      <ModuleHeader
        title="Ask Friday review"
        subtitle={
          mode === 'candidates'
            ? 'Approve, reject, or send-back KB candidates. V1 reviewer is Ishant.'
            : 'Draft + publish context packs each surface reads from. Approved candidates auto-flip on publish.'
        }
        actions={headerActions}
      />
      <div className="fad-module-body" style={{ flex: 1, overflowY: 'auto' }}>
        {/* Mode toggle — Candidates ↔ Packs. URL-backed via subPage so the
            view deep-links. Default mode is 'candidates'. */}
        <div className="fad-tabs" role="tablist" aria-label="Section">
          <button
            role="tab"
            aria-selected={mode === 'candidates'}
            className={'fad-tab' + (mode === 'candidates' ? ' active' : '')}
            onClick={() => setMode('candidates')}
          >
            KB candidates
          </button>
          <button
            role="tab"
            aria-selected={mode === 'packs'}
            className={'fad-tab' + (mode === 'packs' ? ' active' : '')}
            onClick={() => setMode('packs')}
          >
            Context packs
          </button>
        </div>

        {mode === 'packs' ? (
          <ContextPacksPanel />
        ) : (
        <>
        <div className="fad-tabs" role="tablist" aria-label="Review status filters" style={{ marginTop: 8 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={'fad-tab' + (tab === t.id ? ' active' : '')}
              onClick={() => { setTab(t.id); setSelected(null); }}
            >
              {t.label}
              {t.id !== 'all' && (
                <span className="count">{counts[t.id as KbCandidateReviewStatus] || 0}</span>
              )}
            </button>
          ))}
        </div>

        {error && (
          <div className="ops-form-alert failed" style={{ marginTop: 12 }}>
            Failed to load: {error}
          </div>
        )}

        <div className="afr-split" style={{ display: 'flex', gap: 16, marginTop: 16, alignItems: 'flex-start' }}>
          <div className="afr-list" style={{ flex: 1, minWidth: 0 }}>
            {loading && !candidates && (
              <div style={{ padding: 24, color: 'var(--color-text-tertiary)', fontSize: 13 }}>Loading candidates…</div>
            )}
            {!loading && sortedCandidates && sortedCandidates.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
                <IconSparkle size={24} />
                <div style={{ marginTop: 8 }}>No {tab === 'all' ? '' : tab} candidates.</div>
                {tab === 'pending' && (
                  <div style={{ marginTop: 4, fontSize: 11 }}>
                    The Core analyzer hasn&apos;t produced any candidates yet, or all have been actioned.
                  </div>
                )}
              </div>
            )}
            {sortedCandidates && sortedCandidates.map((c) => (
              <button
                key={c.candidateId}
                type="button"
                className={'afr-card' + (selected === c.candidateId ? ' active' : '')}
                onClick={() => setSelected(c.candidateId)}
              >
                <div className="afr-card-row">
                  <span className={'chip afr-type'}>{c.candidateType || 'fact'}</span>
                  <span className="afr-target mono">{c.targetLayer || '—'}</span>
                  <span className={`chip afr-tier afr-tier-${riskColor(c.riskClass)}`}>
                    risk · {c.riskClass || '—'}
                  </span>
                  <span className={`chip afr-tier afr-tier-${trustColor(c.trustTier)}`}>
                    trust · {c.trustTier || '—'}
                  </span>
                  <span className={`afr-status afr-status-${c.reviewStatus}`}>{c.reviewStatus}</span>
                  <span className="afr-time">{fmtRelative(c.createdAt)}</span>
                </div>
                <div className="afr-card-summary">{c.evidenceSummary || <em style={{ opacity: 0.6 }}>(no summary)</em>}</div>
                {c.reviewer && (
                  <div className="afr-card-meta">
                    Reviewed by {c.reviewer} {c.reviewedAt ? `· ${fmtRelative(c.reviewedAt)}` : ''}
                    {c.reviewNote ? ` — “${c.reviewNote}”` : ''}
                  </div>
                )}
              </button>
            ))}
          </div>

          {selectedCandidate && (
            <aside className="afr-detail" style={{ width: 380, flex: '0 0 380px' }}>
              <div className="afr-detail-head">
                <div className="afr-detail-title">{selectedCandidate.candidateType || 'candidate'} · <span className="mono">{selectedCandidate.targetLayer}</span></div>
                <button className="btn ghost sm" onClick={() => setSelected(null)} aria-label="Close" title="Close" style={{ marginLeft: 'auto' }}>
                  <IconClose size={12} />
                </button>
              </div>
              <div className="afr-detail-body">
                <div className="afr-detail-section">
                  <h5>Evidence</h5>
                  <p>{selectedCandidate.evidenceSummary || <em style={{ opacity: 0.6 }}>(no summary)</em>}</p>
                </div>
                <div className="afr-detail-section">
                  <h5>Proposed change</h5>
                  <pre className="afr-json">{JSON.stringify(selectedCandidate.proposedChange, null, 2)}</pre>
                </div>
                {selectedCandidate.sourceEventIds.length > 0 && (
                  <div className="afr-detail-section">
                    <h5>Source events ({selectedCandidate.sourceEventIds.length})</h5>
                    <ul className="afr-events">
                      {selectedCandidate.sourceEventIds.slice(0, 10).map((id) => (
                        <li key={id} className="mono" style={{ fontSize: 11 }}>{id}</li>
                      ))}
                      {selectedCandidate.sourceEventIds.length > 10 && (
                        <li style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                          + {selectedCandidate.sourceEventIds.length - 10} more
                        </li>
                      )}
                    </ul>
                  </div>
                )}
                {selectedCandidate.reviewer && (
                  <div className="afr-detail-section">
                    <h5>Review history</h5>
                    <div style={{ fontSize: 12 }}>
                      <strong>Status:</strong> {selectedCandidate.reviewStatus}<br />
                      <strong>Reviewer:</strong> {selectedCandidate.reviewer}<br />
                      <strong>When:</strong> {fmtRelative(selectedCandidate.reviewedAt)}
                      {selectedCandidate.reviewNote && (
                        <>
                          <br />
                          <strong>Note:</strong> {selectedCandidate.reviewNote}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {selectedCandidate.reviewStatus !== 'approved' && selectedCandidate.reviewStatus !== 'rejected' && (
                <div className="afr-detail-actions">
                  <button
                    className="btn primary sm"
                    disabled={busyId === selectedCandidate.candidateId}
                    onClick={() => review(selectedCandidate.candidateId, 'approved')}
                  >
                    <IconCheck size={12} /> Approve
                  </button>
                  <button
                    className="btn ghost sm"
                    disabled={busyId === selectedCandidate.candidateId}
                    onClick={() => {
                      const note = window.prompt('What info do you need from the analyzer? (sent back as needs_info)') || '';
                      if (note.trim()) review(selectedCandidate.candidateId, 'needs_info', note.trim());
                    }}
                  >
                    <IconClock size={12} /> Needs info
                  </button>
                  <button
                    className="btn danger sm"
                    disabled={busyId === selectedCandidate.candidateId}
                    onClick={() => {
                      const note = window.prompt('Why reject? (optional, audited)') || '';
                      review(selectedCandidate.candidateId, 'rejected', note.trim() || undefined);
                    }}
                  >
                    <IconClose size={12} /> Reject
                  </button>
                </div>
              )}
            </aside>
          )}
        </div>
        </>
        )}
      </div>
    </>
  );
}

// ───────────────────────────── Context Packs panel ─────────────────────────────

function ContextPacksPanel() {
  const [filter, setFilter] = useState<ContextPackStatus | 'all'>('all');
  const { packs, loading, error, refetch } = useContextPacks({ status: filter, limit: 200 });
  const [busy, setBusy] = useState(false);

  const grouped = useMemo(() => {
    if (!packs) return null;
    const map = new Map<string, ContextPack[]>();
    for (const p of packs) {
      const list = map.get(p.surfaceId) || [];
      list.push(p);
      map.set(p.surfaceId, list);
    }
    // versions desc within surface
    for (const list of map.values()) list.sort((a, b) => b.version - a.version);
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [packs]);

  const createDraft = async () => {
    const surfaceId = window.prompt('Surface id (e.g. fad_consult, website_guest_hero):')?.trim();
    if (!surfaceId) return;
    const versionStr = window.prompt(`Version number for ${surfaceId}? (integer, e.g. 1):`, '1')?.trim();
    const version = Number(versionStr);
    if (!Number.isFinite(version) || version < 1) {
      fireToast('Version must be a positive integer.');
      return;
    }
    const packId = `${surfaceId}-v${version}`;
    setBusy(true);
    try {
      await upsertContextPack({
        packId,
        surfaceId,
        version,
        status: 'draft',
        knowledgeScopes: [],
        behaviorRules: [],
        toolPolicy: {},
        memoryPolicy: {},
        sourceSnapshotRefs: [],
        packPayload: {},
      });
      fireToast(`Draft created: ${packId}`);
      refetch();
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Failed to create draft');
    } finally {
      setBusy(false);
    }
  };

  const publish = async (pack: ContextPack) => {
    const confirm = window.confirm(
      `Publish ${pack.packId} (v${pack.version}) for surface "${pack.surfaceId}"?\n\nThis becomes the live context surfaces read from. Drafts at lower versions stay drafts.`,
    );
    if (!confirm) return;
    setBusy(true);
    try {
      const res = await publishContextPack({
        packId: pack.packId,
        surfaceId: pack.surfaceId,
        version: pack.version,
        knowledgeScopes: pack.knowledgeScopes,
        behaviorRules: pack.behaviorRules,
        toolPolicy: pack.toolPolicy,
        memoryPolicy: pack.memoryPolicy,
        sourceSnapshotRefs: pack.sourceSnapshotRefs,
        packPayload: pack.packPayload,
        manualApproval: true,
        manualApprovalRationale: 'Published from the Ask Friday review module after staff confirmation.',
      });
      fireToast(`Published v${res.pack.version}${res.approvedCount ? ` · ${res.approvedCount} candidate(s) approved` : ''}`);
      refetch();
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setBusy(false);
    }
  };

  const fmtRel = (iso: string | null) => iso ? fmtRelative(iso) : '—';

  return (
    <>
      <div className="fad-tabs" role="tablist" aria-label="Context pack status" style={{ marginTop: 8 }}>
        {(['all', 'draft', 'published', 'retired'] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={filter === s}
            className={'fad-tab' + (filter === s ? ' active' : '')}
            onClick={() => setFilter(s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <button
          className="btn primary sm"
          style={{ marginLeft: 'auto' }}
          onClick={createDraft}
          disabled={busy}
        >
          <IconPlus size={12} /> New draft
        </button>
      </div>

      {error && <div className="ops-form-alert failed" style={{ marginTop: 12 }}>Failed to load: {error}</div>}

      <div style={{ marginTop: 16 }}>
        {loading && !packs && (
          <div style={{ padding: 24, color: 'var(--color-text-tertiary)', fontSize: 13 }}>Loading packs…</div>
        )}
        {!loading && grouped && grouped.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            <IconSparkle size={24} />
            <div style={{ marginTop: 8 }}>No context packs yet for &quot;{filter}&quot;.</div>
            <div style={{ marginTop: 4, fontSize: 11 }}>
              Click <strong>New draft</strong> to create the first one for a surface — typically <code>fad_consult</code> as a v1 starting point.
            </div>
          </div>
        )}
        {grouped && grouped.map(([surfaceId, packsForSurface]) => (
          <div key={surfaceId} style={{ marginBottom: 20 }}>
            <h4 className="afr-pack-surface-head">
              <IconAI size={12} />
              <span className="mono">{surfaceId}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                {packsForSurface.length} pack{packsForSurface.length === 1 ? '' : 's'}
              </span>
            </h4>
            {packsForSurface.map((p) => (
              <div key={`${p.packId}-${p.version}`} className="afr-pack-row">
                <div className="afr-pack-row-main">
                  <span className="mono" style={{ fontSize: 12 }}>{p.packId}</span>
                  <span className="afr-pack-version">v{p.version}</span>
                  <span className={`afr-status afr-status-${p.status === 'draft' ? 'pending' : p.status === 'published' ? 'approved' : p.status === 'retired' ? 'expired' : 'needs_info'}`}>{p.status}</span>
                </div>
                <div className="afr-pack-row-meta">
                  {p.publishedAt && <span>Published {fmtRel(p.publishedAt)}{p.approvedBy ? ` by ${p.approvedBy}` : ''}</span>}
                  {!p.publishedAt && p.updatedAt && <span>Updated {fmtRel(p.updatedAt)}</span>}
                </div>
                {p.status === 'draft' && (
                  <button className="btn primary sm" disabled={busy} onClick={() => publish(p)}>
                    <IconCheck size={12} /> Publish
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
