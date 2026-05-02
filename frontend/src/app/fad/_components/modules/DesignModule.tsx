'use client';

import { useEffect, useMemo, useState } from 'react';
import { ModuleHeader } from '../ModuleHeader';
import { useCanSee } from '../usePermissions';
import {
  designClient,
  formatMUR,
  stageDef,
  type DesignProject,
  type StageId,
} from '../../_data/design';
import { ProjectContextBar } from './design/ProjectContextBar';
import { StageTracker, stageStatusLabel } from './design/StageTracker';
import { AIPlaceholder } from './design/AIPlaceholder';
import { ProjectIntake } from './design/ProjectIntake';
import { fireToast } from '../Toaster';

interface Props {
  subPage: string;
  onChangeSubPage: (id: string) => void;
}

function syncDrillDownToUrl(pid: string | null, screen: string) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  let changed = false;
  if (pid) {
    if (url.searchParams.get('pid') !== pid) { url.searchParams.set('pid', pid); changed = true; }
    if (url.searchParams.get('stage') !== screen) { url.searchParams.set('stage', screen); changed = true; }
  } else {
    if (url.searchParams.has('pid')) { url.searchParams.delete('pid'); changed = true; }
    if (url.searchParams.has('stage')) { url.searchParams.delete('stage'); changed = true; }
  }
  if (changed) window.history.replaceState(null, '', url);
}

type ProjectScreen =
  | 'overview'
  | 'site-visit'
  | 'preferences'
  | 'rough-budget'
  | 'agreement'
  | 'payments'
  | 'moodboard'
  | 'design-pack'
  | 'final-budget'
  | 'procurement'
  | 'execution'
  | 'reconciliation'
  | 'handover'
  | 'documents';

// ─────────────────────────── Module shell ───────────────────────────

export function DesignModule({ subPage, onChangeSubPage }: Props) {
  const canSeeSettings = useCanSee('settings');

  const tabs = [
    { id: 'overview',  label: 'Overview' },
    { id: 'projects',  label: 'Projects' },
    { id: 'leads',     label: 'Leads' },
    { id: 'vendors',   label: 'Vendors' },
    canSeeSettings && { id: 'settings', label: 'Settings' },
  ].filter((t): t is { id: string; label: string } => Boolean(t));

  const active = tabs.find((t) => t.id === subPage)?.id ?? 'overview';

  // Project drill-down — URL param pid, stage param for inner screen.
  // Initial values read directly from URL during state init so the URL-sync
  // effect doesn't race-strip them on mount.
  const [pid, setPid] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('pid');
  });
  const [screen, setScreen] = useState<ProjectScreen>(() => {
    if (typeof window === 'undefined') return 'overview';
    return (new URLSearchParams(window.location.search).get('stage') as ProjectScreen | null) ?? 'overview';
  });

  useEffect(() => {
    syncDrillDownToUrl(pid, screen);
  }, [pid, screen]);

  // Wrappers that update both local state AND URL synchronously, so the parent's
  // sub-page change (which remounts this component via <main key=…>) sees a URL
  // we can rehydrate from on the next mount.
  const setPidAndUrl = (next: string | null) => { setPid(next); syncDrillDownToUrl(next, screen); };
  const setScreenAndUrl = (next: ProjectScreen) => { setScreen(next); syncDrillDownToUrl(pid, next); };


  const project = pid && pid !== '__new' ? designClient.projects.get(pid) : null;

  // Intake mode (pid === '__new') renders the new-project form.
  if (pid === '__new') {
    return (
      <div className="fad-module-body" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
        <ProjectIntake onClose={(newId) => setPidAndUrl(newId ?? null)} />
      </div>
    );
  }

  // If we're inside a project, render the project shell instead of the tab content.
  if (project) {
    return (
      <ProjectShell
        project={project}
        screen={screen}
        onChangeScreen={setScreenAndUrl}
        onClose={() => setPidAndUrl(null)}
      />
    );
  }

  return (
    <div className="fad-module-body" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ModuleHeader
        title="Design"
        subtitle="Friday Design OS — interior design projects (FD entity)"
        tabs={tabs}
        activeTab={active}
        onTabChange={(id) => { setPidAndUrl(null); onChangeSubPage(id); }}
        actions={
          active === 'projects' || active === 'overview' ? (
            <button
              type="button"
              onClick={() => { setScreenAndUrl('overview'); setPidAndUrl('__new'); }}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-brand-accent)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              + New project
            </button>
          ) : null
        }
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {active === 'overview' && <DesignDashboard onOpenProject={(id) => { setScreenAndUrl('overview'); setPidAndUrl(id); }} />}
        {active === 'projects' && <ProjectsList onOpenProject={(id) => { setScreenAndUrl('overview'); setPidAndUrl(id); }} />}
        {active === 'leads' && <LeadsList />}
        {active === 'vendors' && <VendorsList />}
        {active === 'settings' && <DesignSettings />}
      </div>
    </div>
  );
}

// ─────────────────────────── Dashboard (Phase 2) ───────────────────────────

type MetricFilter = 'all' | 'pending_approval' | 'procurement_open' | 'margin_exposure';

function DesignDashboard({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const metrics = designClient.projects.metrics();
  const allProjects = designClient.projects.list();

  const [stageFilter, setStageFilter] = useState<StageId | 'all'>('all');
  const [tierFilter, setTierFilter] = useState<'all' | 1 | 2 | 3>('all');
  const [classFilter, setClassFilter] = useState<'all' | 'renovation' | 'furnishing' | 'mixed'>('all');
  const [metricFilter, setMetricFilter] = useState<MetricFilter>('all');
  const [search, setSearch] = useState('');

  const projects = useMemo(() => {
    let arr = allProjects;
    if (stageFilter !== 'all') arr = arr.filter((p) => p.currentStage === stageFilter);
    if (tierFilter !== 'all')  arr = arr.filter((p) => p.tier === tierFilter);
    if (classFilter !== 'all') arr = arr.filter((p) => p.classification === classFilter);
    if (metricFilter === 'pending_approval') {
      const pendingProjectIds = new Set(
        allProjects
          .flatMap((p) => designClient.approvals.list(p.id))
          .filter((a) => a.state === 'sent')
          .map((a) => a.projectId),
      );
      arr = arr.filter((p) => pendingProjectIds.has(p.id));
    }
    if (metricFilter === 'procurement_open') {
      const openProjectIds = new Set(allProjects.flatMap((p) => designClient.budgetItems.list(p.id))
        .filter((i) => i.status === 'approved' && !['installed','qa_passed'].includes(i.procurement))
        .map((i) => i.projectId));
      arr = arr.filter((p) => openProjectIds.has(p.id));
    }
    if (metricFilter === 'margin_exposure') {
      const expProjectIds = new Set(allProjects.flatMap((p) => designClient.budgetItems.list(p.id))
        .filter((i) => i.status === 'approved' && i.actualPaidMinor === null)
        .map((i) => i.projectId));
      arr = arr.filter((p) => expProjectIds.has(p.id));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter((p) => p.name.toLowerCase().includes(q));
    }
    return arr;
  }, [allProjects, stageFilter, tierFilter, classFilter, metricFilter, search]);

  const blockers = useMemo(() => allProjects.filter((p) => p.blocker), [allProjects]);

  const myTodayTasks = useMemo(() => {
    // @demo:logic — Tag: PROD-DESIGN-2. Real version pulls from §7.SS MyTasks API
    // filtered to (a) tasks assigned to current user, (b) tagged with the Design module.
    const all = allProjects.flatMap((p) => designClient.tasks.list(p.id));
    return all.filter((t) => t.assignedUserId === 'u-bryan' && t.status !== 'completed').slice(0, 6);
  }, [allProjects]);

  const stageOptions = useMemo(() => {
    const set = new Set(allProjects.map((p) => p.currentStage));
    return Array.from(set);
  }, [allProjects]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <MetricCard label="Active projects" value={String(metrics.activeProjects)} active={metricFilter === 'all'} onClick={() => setMetricFilter('all')} />
        <MetricCard label="Pending owner approvals" value={String(metrics.pendingOwnerApprovals)} tone="warning" active={metricFilter === 'pending_approval'} onClick={() => setMetricFilter(metricFilter === 'pending_approval' ? 'all' : 'pending_approval')} />
        <MetricCard label="Procurement open" value={String(metrics.procurementOpen)} tone="info" active={metricFilter === 'procurement_open'} onClick={() => setMetricFilter(metricFilter === 'procurement_open' ? 'all' : 'procurement_open')} />
        <MetricCard label="Margin exposure" value={formatMUR(metrics.marginExposureMinor)} tone="accent" active={metricFilter === 'margin_exposure'} onClick={() => setMetricFilter(metricFilter === 'margin_exposure' ? 'all' : 'margin_exposure')} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 12, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>All projects</h3>
            <input
              type="search"
              placeholder="Search projects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                background: 'var(--color-background-tertiary)',
                border: '0.5px solid var(--color-border-tertiary)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text-primary)',
                minWidth: 180,
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <FilterChip label="All stages" active={stageFilter === 'all'} onClick={() => setStageFilter('all')} />
            {stageOptions.map((s) => (
              <FilterChip key={s} label={s} active={stageFilter === s} onClick={() => setStageFilter(s)} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <FilterChip label="All tiers" active={tierFilter === 'all'} onClick={() => setTierFilter('all')} />
            <FilterChip label="Tier 1" active={tierFilter === 1} onClick={() => setTierFilter(1)} />
            <FilterChip label="Tier 2" active={tierFilter === 2} onClick={() => setTierFilter(2)} />
            <FilterChip label="Tier 3" active={tierFilter === 3} onClick={() => setTierFilter(3)} />
            <span style={{ width: 8 }} />
            <FilterChip label="All classes" active={classFilter === 'all'} onClick={() => setClassFilter('all')} />
            <FilterChip label="Renovation" active={classFilter === 'renovation'} onClick={() => setClassFilter('renovation')} />
            <FilterChip label="Furnishing" active={classFilter === 'furnishing'} onClick={() => setClassFilter('furnishing')} />
            <FilterChip label="Mixed" active={classFilter === 'mixed'} onClick={() => setClassFilter('mixed')} />
          </div>
          <ProjectsTable projects={projects} onOpenProject={onOpenProject} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 12 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>My Today</h3>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>Design-related tasks for you (mock §7.SS)</div>
            {myTodayTasks.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '12px 0', textAlign: 'center' }}>Nothing on your plate.</div>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {myTodayTasks.map((t) => {
                  const proj = designClient.projects.get(t.projectId);
                  return (
                    <li
                      key={t.id}
                      style={{ padding: 8, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                      onClick={() => proj && onOpenProject(proj.id)}
                    >
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{t.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                        {proj?.name} · due {t.dueDate ?? '—'}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 12 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--color-text-danger)' }}>Blockers</h3>
            {blockers.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '12px 0', textAlign: 'center' }}>No active blockers.</div>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {blockers.map((p) => {
                  const ageDays = Math.max(0, Math.round((Date.now() - new Date(p.updatedAt).getTime()) / 86_400_000));
                  return (
                    <li
                      key={p.id}
                      style={{ padding: 8, border: '0.5px solid var(--color-bg-danger)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-danger)', cursor: 'pointer' }}
                      onClick={() => onOpenProject(p.id)}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-danger)' }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>{p.blocker}</div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4, fontFamily: 'var(--font-mono-fad)' }}>
                        {ageDays}d old · owner: {p.designLeadUserId?.replace('u-', '') ?? 'unassigned'}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '3px 10px',
        fontSize: 11,
        borderRadius: 'var(--radius-full)',
        border: '0.5px solid var(--color-border-tertiary)',
        background: active ? 'var(--color-brand-accent)' : 'var(--color-background-tertiary)',
        color: active ? '#fff' : 'var(--color-text-secondary)',
        fontWeight: active ? 600 : 500,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

function MetricCard({ label, value, tone, active, onClick }: { label: string; value: string; tone?: 'info' | 'warning' | 'accent'; active?: boolean; onClick?: () => void }) {
  const color =
    tone === 'info'    ? 'var(--color-text-info)' :
    tone === 'warning' ? 'var(--color-text-warning)' :
    tone === 'accent'  ? 'var(--color-brand-accent)' :
                          'var(--color-text-primary)';
  const Component: any = onClick ? 'button' : 'div';
  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      style={{
        padding: 14,
        background: 'var(--color-background-primary)',
        border: active ? '1px solid var(--color-brand-accent)' : '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-md)',
        cursor: onClick ? 'pointer' : 'default',
        textAlign: 'left',
        width: '100%',
      }}
      aria-pressed={onClick ? !!active : undefined}
    >
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 500 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color, marginTop: 4, fontFamily: 'var(--font-mono-fad)' }}>
        {value}
      </div>
    </Component>
  );
}

// ─────────────────────────── Projects table ───────────────────────────

function ProjectsList({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const projects = designClient.projects.list();
  return <ProjectsTable projects={projects} onOpenProject={onOpenProject} />;
}

function ProjectsTable({ projects, onOpenProject }: { projects: DesignProject[]; onOpenProject: (id: string) => void }) {
  if (projects.length === 0) {
    return (
      <div style={{ padding: 24, color: 'var(--color-text-tertiary)', fontSize: 13, textAlign: 'center' }}>
        No projects yet. Create one with <strong style={{ color: 'var(--color-text-primary)' }}>+ New project</strong>.
      </div>
    );
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: 'var(--color-text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            <th style={cellStyle('left')}>Project</th>
            <th style={cellStyle('left')}>Counterparty</th>
            <th style={cellStyle('left')}>Property</th>
            <th style={cellStyle('left')}>Class.</th>
            <th style={cellStyle('left')}>Tier</th>
            <th style={cellStyle('left')}>Stage</th>
            <th style={cellStyle('left')}>Next action</th>
            <th style={cellStyle('right')}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const cp = designClient.counterparties.get(p.counterpartyId);
            const prop = designClient.properties.get(p.propertyId);
            return (
              <tr
                key={p.id}
                onClick={() => onOpenProject(p.id)}
                style={{ cursor: 'pointer', borderTop: '0.5px solid var(--color-border-tertiary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-brand-accent-softer)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={cellStyle('left')}><strong>{p.name}</strong></td>
                <td style={cellStyle('left')}>{cp?.fullName ?? '—'}</td>
                <td style={cellStyle('left')}>{prop?.name ?? '—'}</td>
                <td style={cellStyle('left')}>{p.classification}</td>
                <td style={cellStyle('left')}>{p.tier ? `T${p.tier}` : '—'}</td>
                <td style={cellStyle('left')}>
                  <span style={{ color: 'var(--color-text-info)', fontWeight: 500 }}>{p.currentStage}</span>{' '}
                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>({stageStatusLabel(p.stageStatus)})</span>
                </td>
                <td style={cellStyle('left')}>{p.nextAction ?? '—'}</td>
                <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)', color: 'var(--color-text-tertiary)' }}>
                  {p.updatedAt.slice(0, 10)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function cellStyle(align: 'left' | 'right'): React.CSSProperties {
  return { padding: '8px 10px', textAlign: align, verticalAlign: 'top', whiteSpace: 'nowrap' };
}

// ─────────────────────────── Leads / Vendors / Settings (Phase 1 stubs) ───────────────────────────

function LeadsList() {
  const leads = designClient.leads.list();
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'sent' | 'accepted' | 'declined' | 'not_needed'>('all');
  const filtered = statusFilter === 'all' ? leads : leads.filter((l) => l.status === statusFilter);

  return (
    <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Leads <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>· pre-project pipeline</span></h3>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['all', 'draft', 'sent', 'accepted', 'declined'] as const).map((s) => (
            <FilterChip key={s} label={s === 'all' ? 'All' : s} active={statusFilter === s} onClick={() => setStatusFilter(s)} />
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 13, padding: 12, textAlign: 'center' }}>
          No leads in this status.
        </div>
      ) : (
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--color-text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              <th style={cellStyle('left')}>Lead</th>
              <th style={cellStyle('left')}>Property hint</th>
              <th style={cellStyle('left')}>Budget</th>
              <th style={cellStyle('left')}>Source</th>
              <th style={cellStyle('left')}>Status</th>
              <th style={cellStyle('right')}>Created</th>
              <th style={cellStyle('right')}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                <td style={cellStyle('left')}>
                  <div style={{ fontWeight: 500 }}>{l.counterpartyName}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{l.counterpartyPhone ?? l.counterpartyEmail ?? '—'}</div>
                </td>
                <td style={cellStyle('left')}>{l.propertyHint ?? '—'}</td>
                <td style={cellStyle('left')}>{l.budgetHint ?? '—'}</td>
                <td style={cellStyle('left')}>{l.source.replace(/_/g, ' ')}</td>
                <td style={cellStyle('left')}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    background: l.status === 'accepted' ? 'var(--color-bg-success)' :
                                l.status === 'sent'     ? 'var(--color-bg-info)' :
                                l.status === 'declined' ? 'var(--color-bg-danger)' :
                                                          'var(--color-background-tertiary)',
                    color: l.status === 'accepted' ? 'var(--color-text-success)' :
                           l.status === 'sent'     ? 'var(--color-text-info)' :
                           l.status === 'declined' ? 'var(--color-text-danger)' :
                                                     'var(--color-text-secondary)',
                    fontSize: 10,
                  }}>
                    {l.status}
                  </span>
                </td>
                <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)', color: 'var(--color-text-tertiary)' }}>
                  {l.createdAt.slice(0, 10)}
                </td>
                <td style={cellStyle('right')}>
                  <button
                    type="button"
                    style={{
                      padding: '4px 10px',
                      fontSize: 11,
                      borderRadius: 'var(--radius-sm)',
                      background: l.status === 'accepted' ? 'var(--color-brand-accent)' : 'var(--color-background-tertiary)',
                      color: l.status === 'accepted' ? '#fff' : 'var(--color-text-secondary)',
                      border: '0.5px solid var(--color-border-tertiary)',
                    }}
                    title={l.status === 'accepted' ? 'Convert this lead to a Project' : 'Convert (typically after acceptance)'}
                    onClick={() => fireToast(`Convert ${l.counterpartyName}'s lead → Project (mock; v0.2 wires to backend)`)}
                  >
                    {l.status === 'accepted' ? 'Convert →' : 'Open'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function VendorsList() {
  const vendors = designClient.vendors.list();
  return (
    <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 12 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600 }}>Vendor register (§7.YY)</h3>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: 'var(--color-text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            <th style={cellStyle('left')}>Name</th>
            <th style={cellStyle('left')}>Company</th>
            <th style={cellStyle('left')}>Category</th>
            <th style={cellStyle('left')}>Phone</th>
            <th style={cellStyle('left')}>Engagements</th>
          </tr>
        </thead>
        <tbody>
          {vendors.map((v) => (
            <tr key={v.id} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
              <td style={cellStyle('left')}>{v.name}</td>
              <td style={cellStyle('left')}>{v.company ?? '—'}</td>
              <td style={cellStyle('left')}>{v.category.replace(/_/g, ' ')}</td>
              <td style={cellStyle('left')}>{v.phone ?? '—'}</td>
              <td style={cellStyle('left')}>{v.engagements.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DesignSettings() {
  const cfg = designClient.settings.annexA();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600 }}>Annex A — Pricing schedule</h3>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
          Default pricing tiers used when generating new agreements. Annex B in each project carries the negotiated overrides.
        </p>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td style={cellStyle('left')}>Tier 3 design fee (EPC &lt; Rs 500K)</td><td style={cellStyle('right')}>{formatMUR(cfg.designFee.tier3FlatMinor)} flat</td></tr>
            <tr><td style={cellStyle('left')}>Tier 2 design fee (Rs 500K–1.5M)</td><td style={cellStyle('right')}>{formatMUR(cfg.designFee.tier2FlatMinor)} flat</td></tr>
            <tr><td style={cellStyle('left')}>Tier 1 design fee (EPC &gt; Rs 1.5M)</td><td style={cellStyle('right')}>{(cfg.designFee.tier1PercentOfEpc * 100).toFixed(1)}% of EPC</td></tr>
            <tr><td style={cellStyle('left')}>P&amp;E Furnishing</td><td style={cellStyle('right')}>{(cfg.procurementFurnishing.tier3Pct * 100).toFixed(1)}% / {(cfg.procurementFurnishing.tier2Pct * 100).toFixed(1)}% / {(cfg.procurementFurnishing.tier1Pct * 100).toFixed(1)}%</td></tr>
            <tr><td style={cellStyle('left')}>P&amp;E Renovation</td><td style={cellStyle('right')}>{(cfg.procurementRenovation.tier3Pct * 100).toFixed(1)}% / {(cfg.procurementRenovation.tier2Pct * 100).toFixed(1)}% / {(cfg.procurementRenovation.tier1Pct * 100).toFixed(1)}%</td></tr>
            <tr><td style={cellStyle('left')}>Agreement template</td><td style={cellStyle('right')}>{cfg.agreementTemplateVersion}</td></tr>
          </tbody>
        </table>
      </div>
      <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 16 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>ID Standards Book</h3>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>Coming in v0.2 — central library of approved palettes, materials, vendors, and per-room defaults.</p>
      </div>
    </div>
  );
}

// ─────────────────────────── Project shell (drill-down) ───────────────────────────

function ProjectShell({
  project,
  screen,
  onChangeScreen,
  onClose,
}: {
  project: DesignProject;
  screen: ProjectScreen;
  onChangeScreen: (s: ProjectScreen) => void;
  onClose: () => void;
}) {
  const screens: { id: ProjectScreen; label: string }[] = useMemo(
    () => [
      { id: 'overview',       label: 'Overview' },
      { id: 'site-visit',     label: 'Site visit' },
      { id: 'preferences',    label: 'Preferences' },
      { id: 'rough-budget',   label: 'Rough budget' },
      { id: 'agreement',      label: 'Agreement' },
      { id: 'payments',       label: 'Payments' },
      { id: 'moodboard',      label: 'Moodboard' },
      { id: 'design-pack',    label: 'Design pack' },
      { id: 'final-budget',   label: 'Final budget' },
      { id: 'procurement',    label: 'Procurement' },
      { id: 'execution',      label: 'Execution' },
      { id: 'reconciliation', label: 'Reconciliation' },
      { id: 'handover',       label: 'Handover' },
      { id: 'documents',      label: 'Documents' },
    ],
    [],
  );

  const stageRouteToScreen = (stageId: StageId): ProjectScreen => stageDef(stageId).route as ProjectScreen;

  return (
    <div className="fad-module-body" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ProjectContextBar project={project} onBack={onClose} />
      <div style={{ padding: '8px 16px', background: 'var(--color-background-primary)', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        <StageTracker
          currentStage={project.currentStage}
          status={project.stageStatus}
          onStageSelect={(stageId) => onChangeScreen(stageRouteToScreen(stageId))}
        />
      </div>
      <ModuleHeader
        title=""
        tabs={screens}
        activeTab={screen}
        onTabChange={(id) => onChangeScreen(id as ProjectScreen)}
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <ProjectScreenContent project={project} screen={screen} />
      </div>
    </div>
  );
}

function ProjectScreenContent({ project, screen }: { project: DesignProject; screen: ProjectScreen }) {
  switch (screen) {
    case 'overview':
      return <ProjectOverview project={project} />;
    default:
      return (
        <div style={{ padding: 24, background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 500 }}>{screen.replace(/-/g, ' ')}</h3>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
            Screen scaffolded. Phase {phaseForScreen(screen)} ships full implementation.
          </p>
          <div style={{ marginTop: 12 }}>
            <AIPlaceholder feature={aiFeatureForScreen(screen)} label={aiLabelForScreen(screen)} />
          </div>
        </div>
      );
  }
}

function ProjectOverview({ project }: { project: DesignProject }) {
  const cp = designClient.counterparties.get(project.counterpartyId);
  const prop = designClient.properties.get(project.propertyId);
  const activity = designClient.activity.list(project.id);
  const docs = designClient.documents.list(project.id).filter((d) => d.status !== 'not_yet');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600 }}>Summary</h3>
          <SummaryRow label="Counterparty"  value={cp?.fullName ?? '—'} />
          <SummaryRow label="Property"      value={prop?.name ?? '—'} />
          <SummaryRow label="Classification" value={project.classification} />
          <SummaryRow label="Tier"          value={project.tier ? `Tier ${project.tier}` : '—'} />
          <SummaryRow label="EPC"           value={formatMUR(project.epcMinor)} />
          <SummaryRow label="Design fee"    value={formatMUR(project.designFeeMinor)} />
          <SummaryRow label="Procurement fee" value={formatMUR(project.procurementFeeMinor)} />
          <SummaryRow label="Start"         value={project.startDate ?? '—'} />
          <SummaryRow label="Est. completion" value={project.estimatedCompletion ?? '—'} />
          <SummaryRow label="Design lead"   value={project.designLeadUserId?.replace('u-', '') ?? '—'} />
          <SummaryRow label="Blocker"       value={project.blocker ?? '—'} tone={project.blocker ? 'danger' : undefined} />
          <SummaryRow label="Next action"   value={project.nextAction ?? '—'} />
        </div>
        <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600 }}>Documents</h3>
          {docs.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No documents yet.</div>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {docs.map((d) => (
                <li key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span>{d.type.replace(/_/g, ' ')} <span style={{ color: 'var(--color-text-tertiary)' }}>v{d.version}</span></span>
                  <span style={{ color: 'var(--color-text-info)' }}>{d.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600 }}>Activity</h3>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activity.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No activity yet.</div>
          ) : activity.slice(0, 10).map((a) => (
            <li key={a.id} style={{ fontSize: 12, paddingBottom: 8, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
              <div style={{ color: 'var(--color-text-primary)' }}>{a.summary}</div>
              <div style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono-fad)', fontSize: 11, marginTop: 2 }}>
                {a.at.slice(0, 16).replace('T', ' ')} · {a.userId ?? 'system'}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, borderBottom: '0.5px dashed var(--color-border-tertiary)' }}>
      <span style={{ color: 'var(--color-text-tertiary)' }}>{label}</span>
      <span style={{ color: tone === 'danger' ? 'var(--color-text-danger)' : 'var(--color-text-primary)', textAlign: 'right', maxWidth: '60%' }}>
        {value}
      </span>
    </div>
  );
}

function phaseForScreen(s: ProjectScreen): number {
  if (s === 'site-visit' || s === 'preferences') return 4;
  if (s === 'rough-budget' || s === 'agreement') return 5;
  if (s === 'payments' || s === 'moodboard' || s === 'design-pack') return 6;
  if (s === 'final-budget' || s === 'procurement') return 7;
  if (s === 'execution' || s === 'reconciliation' || s === 'handover') return 8;
  if (s === 'documents') return 9;
  return 1;
}

function aiFeatureForScreen(s: ProjectScreen) {
  switch (s) {
    case 'site-visit':     return 'site-visit-audit';
    case 'preferences':    return 'preference-brief';
    case 'rough-budget':   return 'rough-budget-estimate';
    case 'agreement':      return 'agreement-autofill';
    case 'moodboard':      return 'moodboard-narrative';
    case 'design-pack':    return 'design-pack-copy';
    case 'final-budget':   return 'final-budget-suggest';
    case 'execution':      return 'receipt-scan';
    case 'reconciliation': return 'reconciliation-variance';
    case 'handover':       return 'handover-report';
    default:               return 'owner-update';
  }
}

function aiLabelForScreen(s: ProjectScreen): string {
  switch (s) {
    case 'site-visit':     return 'Run AI audit';
    case 'preferences':    return 'Generate brief';
    case 'rough-budget':   return 'Generate estimate';
    case 'agreement':      return 'Auto-fill from project';
    case 'moodboard':      return 'Generate narrative';
    case 'design-pack':    return 'Generate copy';
    case 'final-budget':   return 'Suggest items';
    case 'execution':      return 'Scan receipt';
    case 'reconciliation': return 'Detect variances';
    case 'handover':       return 'Generate report';
    default:               return 'Generate update';
  }
}
