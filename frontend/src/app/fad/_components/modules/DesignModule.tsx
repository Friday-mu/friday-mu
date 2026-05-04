'use client';

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
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
import { ProjectIntake } from './design/ProjectIntake';
import { AIPlaceholder } from './design/AIPlaceholder';
import { OwnerPortalPreview } from './design/OwnerPortalPreview';
import {
  NeedsAttentionQueue,
  OverviewSummaryLine,
} from './design/OverviewExtras';
import { fireToast } from '../Toaster';
import { useCurrentRole } from '../usePermissions';

// Lazy-load each stage screen so the initial Design bundle only ships the
// shell + dashboard. Each stage chunk loads on first navigation.
const SiteVisitStage      = lazy(() => import('./design/stages/SiteVisitStage').then((m) => ({ default: m.SiteVisitStage })));
const PreferencesStage    = lazy(() => import('./design/stages/PreferencesStage').then((m) => ({ default: m.PreferencesStage })));
const RoughBudgetStage    = lazy(() => import('./design/stages/RoughBudgetStage').then((m) => ({ default: m.RoughBudgetStage })));
const AgreementStage      = lazy(() => import('./design/stages/AgreementStage').then((m) => ({ default: m.AgreementStage })));
const PaymentsStage       = lazy(() => import('./design/stages/PaymentsStage').then((m) => ({ default: m.PaymentsStage })));
const MoodboardStage      = lazy(() => import('./design/stages/MoodboardStage').then((m) => ({ default: m.MoodboardStage })));
const DesignPackStage     = lazy(() => import('./design/stages/DesignPackStage').then((m) => ({ default: m.DesignPackStage })));
const FinalBudgetStage    = lazy(() => import('./design/stages/FinalBudgetStage').then((m) => ({ default: m.FinalBudgetStage })));
const ProcurementStage    = lazy(() => import('./design/stages/ProcurementStage').then((m) => ({ default: m.ProcurementStage })));
const ExecutionStage      = lazy(() => import('./design/stages/ExecutionStage').then((m) => ({ default: m.ExecutionStage })));
const ReconciliationStage = lazy(() => import('./design/stages/ReconciliationStage').then((m) => ({ default: m.ReconciliationStage })));
const HandoverStage       = lazy(() => import('./design/stages/HandoverStage').then((m) => ({ default: m.HandoverStage })));
const DocumentsStage      = lazy(() => import('./design/stages/DocumentsStage').then((m) => ({ default: m.DocumentsStage })));

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

// ─────────────────────────── Phase model ───────────────────────────
//
// Cont-10 audit fix. The 17-stage state machine drove a 17-pill clickable
// tracker AND a 14-tab strip below it. Two parallel navs, several stages
// without a screen → confusing, didn't feel like a workflow. Industry
// research (Programa / Mydoma / JobTread) shows 5–7 phases at the top with
// per-phase task lists is the dominant pattern.
//
// We fold the 14 sections into 5 phases + a permanent Brief. Stages remain in
// the data model — only the IA changes. URL stays `?stage=<screen>` for
// backward compat; the active phase tab is derived.

type PhaseId =
  | 'brief'
  | 'discovery'
  | 'design'
  | 'procurement'
  | 'execution'
  | 'closeout'
  | 'all-docs';

interface PhaseDef {
  id: PhaseId;
  label: string;
  /** UI sections (existing ProjectScreen IDs) shown in this phase, in order. */
  sections: ProjectScreen[];
  /** State-machine stages whose presence as `currentStage` selects this phase. */
  stages: StageId[];
}

const PHASES: PhaseDef[] = [
  {
    id: 'brief',
    label: 'Brief',
    sections: ['overview'],
    stages: [],
  },
  {
    id: 'discovery',
    label: 'Discovery',
    sections: ['site-visit', 'preferences', 'rough-budget', 'agreement', 'payments'],
    stages: ['lead', 'proposal', 'doc-request', 'site-visit', 'preferences', 'rough-budget', 'agreement', 'signature', 'payment-gate'],
  },
  {
    id: 'design',
    label: 'Design',
    sections: ['moodboard', 'design-pack', 'final-budget'],
    stages: ['moodboard', 'design-pack', 'design-review', 'final-budget'],
  },
  {
    id: 'procurement',
    label: 'Procurement',
    sections: ['procurement'],
    stages: ['funding-gate'],
  },
  {
    id: 'execution',
    label: 'Execution',
    sections: ['execution'],
    stages: ['execution', 'expense-capture'],
  },
  {
    id: 'closeout',
    label: 'Closeout',
    sections: ['reconciliation', 'handover'],
    stages: ['reconciliation'],
  },
  {
    id: 'all-docs',
    label: 'Documents',
    sections: ['documents'],
    stages: [],
  },
];

const SECTION_LABELS: Record<ProjectScreen, string> = {
  'overview':       'Brief',
  'site-visit':     'Site visit',
  'preferences':    'Preferences',
  'rough-budget':   'Rough budget',
  'agreement':      'Agreement',
  'payments':       'Payments',
  'moodboard':      'Moodboard',
  'design-pack':    'Design pack',
  'final-budget':   'Final budget',
  'procurement':    'Procurement',
  'execution':      'Execution',
  'reconciliation': 'Reconciliation',
  'handover':       'Handover',
  'documents':      'All documents',
};

function phaseForSection(sec: ProjectScreen): PhaseId {
  const found = PHASES.find((p) => p.sections.includes(sec));
  return found?.id ?? 'brief';
}

function phaseForCurrentStage(stageId: StageId): PhaseId {
  const found = PHASES.find((p) => p.stages.includes(stageId));
  return found?.id ?? 'brief';
}

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
  const role = useCurrentRole();

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
        designClient.approvals.allPending().map((a) => a.projectId),
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
      {/* Metric strip — clickable cards filter the project list below. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <MetricCard label="Active projects" value={String(metrics.activeProjects)} active={metricFilter === 'all'} onClick={() => setMetricFilter('all')} />
        <MetricCard label="Pending owner approvals" value={String(metrics.pendingOwnerApprovals)} tone="warning" active={metricFilter === 'pending_approval'} onClick={() => setMetricFilter(metricFilter === 'pending_approval' ? 'all' : 'pending_approval')} />
        <MetricCard label="Procurement open" value={String(metrics.procurementOpen)} tone="info" active={metricFilter === 'procurement_open'} onClick={() => setMetricFilter(metricFilter === 'procurement_open' ? 'all' : 'procurement_open')} />
        <MetricCard label="Margin exposure" value={formatMUR(metrics.marginExposureMinor)} tone="accent" active={metricFilter === 'margin_exposure'} onClick={() => setMetricFilter(metricFilter === 'margin_exposure' ? 'all' : 'margin_exposure')} />
      </div>

      {/* Plain summary sentence — no card chrome, no AI framing. */}
      <OverviewSummaryLine projects={allProjects} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 16, alignItems: 'start' }}>
        {/* All projects (primary work surface) */}
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

        {/* Action sidebar — Needs Attention (folds in old "Blockers" panel as
            "danger"-toned rows) on top, My Today below. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <NeedsAttentionQueue projects={allProjects} role={role} onOpenProject={onOpenProject} />
          <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 12 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>My Today</h3>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>Design-related tasks assigned to you.</div>
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
        <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>Per-tier stage matrix</h3>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
          B3.9 lock — stages flagged optional may be skipped without blocking workflow progress. Tier 1 (EPC &gt; Rs 1.5M) runs all 17 stages mandatory.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 360 }}>
            <thead>
              <tr style={{ color: 'var(--color-text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                <th style={cellStyle('left')}>Tier</th>
                <th style={cellStyle('left')}>Optional stages</th>
              </tr>
            </thead>
            <tbody>
              {([1, 2, 3] as const).map((tier) => {
                const opt = cfg.tierStageRules[tier].optionalStages;
                return (
                  <tr key={tier} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                    <td style={cellStyle('left')}><strong>Tier {tier}</strong></td>
                    <td style={cellStyle('left')}>
                      {opt.length === 0
                        ? <span style={{ color: 'var(--color-text-tertiary)' }}>All 17 stages mandatory.</span>
                        : opt.map((s) => stageDef(s).label).join(', ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 16 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>Internal service rate sheet</h3>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
          Demo rates — real rates lock during the post-build training-module work. Pass-through categories carry no markup.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 480 }}>
            <thead>
              <tr style={{ color: 'var(--color-text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                <th style={cellStyle('left')}>Category</th>
                <th style={cellStyle('left')}>Unit</th>
                <th style={cellStyle('right')}>Rate</th>
                <th style={cellStyle('left')}>Bills owner?</th>
              </tr>
            </thead>
            <tbody>
              {cfg.internalServiceRates.map((r, i) => {
                const rateText = r.rateMinor != null
                  ? formatMUR(r.rateMinor) + (r.rangeMinMinor != null && r.rangeMaxMinor != null ? ` (${formatMUR(r.rangeMinMinor)}–${formatMUR(r.rangeMaxMinor)})` : '')
                  : r.passThrough
                  ? 'pass-through'
                  : '—';
                const billed = r.billed === 'billed' ? 'Yes'
                  : r.billed === 'covered_by_pe' ? 'Covered by P&E fee'
                  : r.billed === 'no_charge' ? 'No charge'
                  : 'Conditional';
                return (
                  <tr key={i} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                    <td style={cellStyle('left')}>{r.category}</td>
                    <td style={{ ...cellStyle('left'), color: 'var(--color-text-tertiary)' }}>{r.unit}</td>
                    <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)' }}>{rateText}</td>
                    <td style={cellStyle('left')}>
                      {billed}
                      {r.note && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{r.note}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 12, padding: 12, borderLeft: '2px solid var(--color-text-warning)', background: 'var(--color-bg-warning)', borderRadius: 'var(--radius-sm)' }}>
          <strong style={{ fontSize: 11, color: 'var(--color-text-warning)' }}>Cleaning hard-stop rule</strong>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-secondary)' }}>{cfg.cleaningHardStopRule}</p>
        </div>
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
  project: incomingProject,
  screen,
  onChangeScreen,
  onClose,
}: {
  project: DesignProject;
  screen: ProjectScreen;
  onChangeScreen: (s: ProjectScreen) => void;
  onClose: () => void;
}) {
  const [portalOpen, setPortalOpen] = useState(false);
  const [lifecycleTick, setLifecycleTick] = useState(0);
  const project = designClient.projects.get(incomingProject.id) ?? incomingProject;
  void lifecycleTick;

  // Phase tab is derived from the active section so the URL (`?stage=...`)
  // stays the source of truth and old links keep working.
  const activePhase = phaseForSection(screen);
  // Cont-10 — current-stage indicator inside the phase tabs.
  const currentPhase = phaseForCurrentStage(project.currentStage);

  const setPhase = (phaseId: PhaseId) => {
    const phase = PHASES.find((p) => p.id === phaseId);
    if (!phase) return;
    // Pick the most-relevant landing section for this phase:
    //   1. if the project's currentStage is in this phase, the section that
    //      maps to it (so users land on "where they are");
    //   2. otherwise, the first section in the phase.
    const matchingForCurrent =
      currentPhase === phaseId
        ? phase.sections.find((s) => stageDef(project.currentStage).route === s) ?? phase.sections[0]
        : phase.sections[0];
    onChangeScreen(matchingForCurrent);
  };

  const phaseTabs = useMemo(
    () => PHASES.map((p) => ({ id: p.id, label: p.label })),
    [],
  );

  return (
    <div className="fad-module-body" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ProjectContextBar
        project={project}
        onBack={onClose}
        onOpenOwnerPortal={() => setPortalOpen(true)}
        onLifecycleChange={() => setLifecycleTick((t) => t + 1)}
      />
      {portalOpen && <OwnerPortalPreview project={project} onClose={() => setPortalOpen(false)} />}

      {/* Phase progress strip + 6 phase tabs. The earlier 17-pill stage tracker
          + 14-tab strip is replaced by this single nav. */}
      <PhaseNav
        project={project}
        activePhase={activePhase}
        currentPhase={currentPhase}
        tabs={phaseTabs}
        onSelectPhase={setPhase}
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <PhaseView
          project={project}
          activePhase={activePhase}
          activeSection={screen}
          onChangeSection={onChangeScreen}
        />
      </div>
    </div>
  );
}

// ─────────────────────────── Phase nav ───────────────────────────

function PhaseNav({
  project,
  activePhase,
  currentPhase,
  tabs,
  onSelectPhase,
}: {
  project: DesignProject;
  activePhase: PhaseId;
  currentPhase: PhaseId;
  tabs: { id: PhaseId; label: string }[];
  onSelectPhase: (id: PhaseId) => void;
}) {
  // Workflow progress = Discovery → Closeout. Brief and Documents are nav
  // tabs but not workflow stages; exclude both from the progress math.
  const workflowPhases: PhaseId[] = ['discovery', 'design', 'procurement', 'execution', 'closeout'];
  const currentWorkflowIdx = workflowPhases.indexOf(currentPhase);
  const phaseDef = PHASES.find((p) => p.id === currentPhase);
  const progressPct =
    currentWorkflowIdx < 0 ? 0 : Math.min(100, ((currentWorkflowIdx + 1) / workflowPhases.length) * 100);

  return (
    <div style={{ background: 'var(--color-background-primary)', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
      {/* Thin progress indicator */}
      <div style={{ padding: '10px 16px 6px' }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <span>
            {currentPhase === 'brief'
              ? `Stage ${stageDef(project.currentStage).index} of 17 · ${stageDef(project.currentStage).label}`
              : `Currently in ${phaseDef?.label} · ${stageDef(project.currentStage).label} (${stageStatusLabel(project.stageStatus)})`}
          </span>
          {project.lifecycleStatus !== 'active' && (
            <span style={{ color: project.lifecycleStatus === 'paused' ? 'var(--color-text-warning)' : 'var(--color-text-danger)', fontWeight: 500 }}>
              {project.lifecycleStatus.toUpperCase()}
            </span>
          )}
        </div>
        <div style={{ height: 4, background: 'var(--color-background-tertiary)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
          <div
            style={{
              width: `${progressPct}%`,
              height: '100%',
              background: 'var(--color-brand-accent)',
              transition: 'width var(--dur-2) var(--ease)',
            }}
          />
        </div>
      </div>

      {/* Phase tabs */}
      <div role="tablist" aria-label="Project phase" style={{ display: 'flex', gap: 4, padding: '4px 8px 6px', overflowX: 'auto' }}>
        {tabs.map((t) => {
          const isActive = t.id === activePhase;
          const isCurrent = t.id === currentPhase;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-phase-tab={t.id}
              onClick={() => onSelectPhase(t.id)}
              style={{
                padding: '6px 14px',
                fontSize: 12,
                whiteSpace: 'nowrap',
                borderRadius: 'var(--radius-sm)',
                background: isActive ? 'var(--color-brand-accent-soft)' : 'transparent',
                color: isActive
                  ? 'var(--color-brand-accent)'
                  : isCurrent
                  ? 'var(--color-text-primary)'
                  : 'var(--color-text-secondary)',
                fontWeight: isActive || isCurrent ? 600 : 500,
                position: 'relative',
              }}
            >
              {t.label}
              {isCurrent && !isActive && (
                <span
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--color-brand-accent)',
                  }}
                  aria-label="current phase"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────── Phase view (accordion) ───────────────────────────

function PhaseView({
  project,
  activePhase,
  activeSection,
  onChangeSection,
}: {
  project: DesignProject;
  activePhase: PhaseId;
  activeSection: ProjectScreen;
  onChangeSection: (s: ProjectScreen) => void;
}) {
  const phase = PHASES.find((p) => p.id === activePhase);
  if (!phase) return null;

  // Brief is a single section view; render it directly without accordion chrome.
  if (activePhase === 'brief') {
    return (
      <Suspense fallback={<StageSkeleton />}>
        <ProjectScreenContent project={project} screen="overview" />
      </Suspense>
    );
  }

  const sections = phase.sections;
  // Default-open: the active section. Other sections collapsed.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {sections.map((sec) => {
        const isOpen = sec === activeSection;
        return (
          <SectionAccordion
            key={sec}
            project={project}
            section={sec}
            isOpen={isOpen}
            onToggle={() => onChangeSection(sec)}
          >
            <Suspense fallback={<StageSkeleton compact />}>
              <ProjectScreenContent project={project} screen={sec} />
            </Suspense>
          </SectionAccordion>
        );
      })}
    </div>
  );
}

function SectionAccordion({
  project,
  section,
  isOpen,
  onToggle,
  children,
}: {
  project: DesignProject;
  section: ProjectScreen;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const status = sectionStatus(project, section);
  return (
    <div
      style={{
        background: 'var(--color-background-primary)',
        border: `0.5px solid ${isOpen ? 'var(--color-brand-accent)' : 'var(--color-border-tertiary)'}`,
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        data-section-toggle={section}
        onClick={onToggle}
        aria-expanded={isOpen}
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          textAlign: 'left',
          background: 'transparent',
          borderBottom: isOpen ? '0.5px solid var(--color-border-tertiary)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{SECTION_LABELS[section]}</span>
          {status && (
            <span
              style={{
                padding: '1px 8px',
                fontSize: 10,
                fontWeight: 500,
                borderRadius: 'var(--radius-full)',
                background: status.bg,
                color: status.color,
              }}
            >
              {status.label}
            </span>
          )}
        </div>
        <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
          {isOpen ? '▾' : '▸'}
        </span>
      </button>
      {isOpen && <div style={{ padding: 14 }}>{children}</div>}
    </div>
  );
}

interface SectionStatusBadge {
  label: string;
  bg: string;
  color: string;
}

/**
 * Compute a status pill for a section header from project state. Drives the
 * accordion's "checklist" feel — at a glance the user sees what's done, what's
 * in progress, what's blocked.
 */
function sectionStatus(project: DesignProject, section: ProjectScreen): SectionStatusBadge | null {
  // Documents is a cross-phase record store, not a workflow stage — no badge.
  if (section === 'documents') return null;
  const phase = phaseForSection(section);
  const currentPhase = phaseForCurrentStage(project.currentStage);
  const phaseOrder: PhaseId[] = ['brief', 'discovery', 'design', 'procurement', 'execution', 'closeout', 'all-docs'];
  const phaseIdx = phaseOrder.indexOf(phase);
  const currentIdx = phaseOrder.indexOf(currentPhase);

  if (phaseIdx < currentIdx) {
    return { label: 'Done', bg: 'var(--color-bg-success)', color: 'var(--color-text-success)' };
  }
  if (phaseIdx > currentIdx) {
    return { label: 'Upcoming', bg: 'var(--color-background-tertiary)', color: 'var(--color-text-tertiary)' };
  }

  // Same phase — fine-grained status. If the section maps directly to the
  // current stage's route, it's the active one; everything before is done,
  // everything after is upcoming inside this phase.
  const phaseDef = PHASES.find((p) => p.id === phase);
  if (!phaseDef) return null;
  const currentRoute = stageDef(project.currentStage).route as ProjectScreen;
  const currentSectionIdx = phaseDef.sections.indexOf(currentRoute);
  const sectionIdx = phaseDef.sections.indexOf(section);
  if (currentSectionIdx === -1) return null;
  if (sectionIdx < currentSectionIdx) {
    return { label: 'Done', bg: 'var(--color-bg-success)', color: 'var(--color-text-success)' };
  }
  if (sectionIdx > currentSectionIdx) {
    return { label: 'Upcoming', bg: 'var(--color-background-tertiary)', color: 'var(--color-text-tertiary)' };
  }
  // Active section — reflect stageStatus.
  switch (project.stageStatus) {
    case 'done':
      return { label: 'Done', bg: 'var(--color-bg-success)', color: 'var(--color-text-success)' };
    case 'blocked':
      return { label: 'Blocked', bg: 'var(--color-bg-danger)', color: 'var(--color-text-danger)' };
    case 'waiting-on-owner':
      return { label: 'Waiting on owner', bg: 'var(--color-bg-warning)', color: 'var(--color-text-warning)' };
    case 'in-progress':
      return { label: 'In progress', bg: 'var(--color-bg-info)', color: 'var(--color-text-info)' };
    case 'skipped':
      return { label: 'Skipped', bg: 'var(--color-background-tertiary)', color: 'var(--color-text-tertiary)' };
    default:
      return { label: 'Pending', bg: 'var(--color-background-tertiary)', color: 'var(--color-text-tertiary)' };
  }
}

function StageSkeleton({ compact }: { compact?: boolean } = {}) {
  const rows = compact ? [0] : [0, 1, 2];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map((i) => (
        <div
          key={i}
          style={{
            background: 'var(--color-background-primary)',
            border: compact ? 'none' : '0.5px solid var(--color-border-tertiary)',
            borderRadius: 'var(--radius-md)',
            padding: compact ? 8 : 14,
            height: compact ? 60 : i === 0 ? 80 : 140,
            opacity: 0.6,
          }}
        >
          <div
            style={{
              width: '40%', height: 12,
              background: 'var(--color-background-tertiary)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 10,
            }}
          />
          <div style={{ width: '70%', height: 10, background: 'var(--color-background-tertiary)', borderRadius: 'var(--radius-sm)' }} />
        </div>
      ))}
    </div>
  );
}

function ProjectScreenContent({ project, screen }: { project: DesignProject; screen: ProjectScreen }) {
  switch (screen) {
    case 'overview':
      return <ProjectOverview project={project} />;
    case 'site-visit':
      return <SiteVisitStage project={project} />;
    case 'preferences':
      return <PreferencesStage project={project} />;
    case 'rough-budget':
      return <RoughBudgetStage project={project} />;
    case 'agreement':
      return <AgreementStage project={project} />;
    case 'payments':
      return <PaymentsStage project={project} />;
    case 'moodboard':
      return <MoodboardStage project={project} />;
    case 'design-pack':
      return <DesignPackStage project={project} />;
    case 'final-budget':
      return <FinalBudgetStage project={project} />;
    case 'procurement':
      return <ProcurementStage project={project} />;
    case 'execution':
      return <ExecutionStage project={project} />;
    case 'reconciliation':
      return <ReconciliationStage project={project} />;
    case 'handover':
      return <HandoverStage project={project} />;
    case 'documents':
      return <DocumentsStage project={project} />;
  }
  // Exhaustive — TS narrows `screen` to never here.
  return null;
}

function ProjectOverview({ project }: { project: DesignProject }) {
  const cp = designClient.counterparties.get(project.counterpartyId);
  const prop = designClient.properties.get(project.propertyId);
  const activity = designClient.activity.list(project.id);
  const docs = designClient.documents.list(project.id).filter((d) => d.status !== 'not_yet');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 16 }}>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Activity</h3>
          <AIPlaceholder feature="owner-update" label="Generate owner update" size="sm" />
        </div>
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

