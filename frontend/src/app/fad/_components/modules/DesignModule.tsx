'use client';

import { Fragment, lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ModuleHeader } from '../ModuleHeader';
import { useCanSee, useCurrentUserId } from '../usePermissions';
import {
  combinedOptionalStages,
  designClient,
  designFeeForTier,
  formatMUR,
  procurementFeeForTier,
  stageDef,
  tierForEpc,
  withVAT,
  STAGES,
  type AnnexAConfig,
  type CreateVendorInput,
  type DesignProject,
  type DesignTier,
  type LeadSource,
  type ProjectClassification,
  type StageId,
  type Vendor,
  type VendorCategory,
} from '../../_data/design';
import {
  useHydrateDesignTopLevel,
  useHydrateDesignProject,
  convertLeadToProject as apiConvertLeadToProject,
  deleteLead as apiDeleteLead,
  deleteVendor,
  reopenStage as apiReopenStage,
  StageReopenLockedError,
  type ApiLead,
} from '../../_data/designClient';
import { VENDORS as FIXTURE_VENDORS } from '../../_data/design';
import { bumpFixtureRev } from '../../_data/fixtureRev';
import { LeadIntakeDrawer } from './design/LeadIntakeDrawer';
import { ProjectContextBar } from './design/ProjectContextBar';
import { StageTracker, stageStatusLabel } from './design/StageTracker';
import { ProjectIntake } from './design/ProjectIntake';
import { ProjectEditDrawer } from './design/ProjectEditDrawer';
import { AIPlaceholder } from './design/AIPlaceholder';
import { OwnerPortalPreview } from './design/OwnerPortalPreview';
import { ShareWithOwnerDrawer } from './design/ShareWithOwnerDrawer';
import { BlockersPanel } from './design/BlockersPanel';
import { CiaCompliancePanel, requiresCiaRegistration } from './design/CiaCompliancePanel';
import { useTenantCountry } from '../../_data/useTenantCountry';
import { NextActionsPanel } from './design/NextActionsPanel';
import {
  NeedsAttentionQueue,
  OverviewSummaryLine,
} from './design/OverviewExtras';
import { fireToast } from '../Toaster';
import { useCurrentRole } from '../usePermissions';

// Lazy-load each stage screen so the initial Design bundle only ships the
// shell + dashboard. Each stage chunk loads on first navigation.
const DocRequestStage     = lazy(() => import('./design/stages/DocRequestStage').then((m) => ({ default: m.DocRequestStage })));
const SiteVisitStage      = lazy(() => import('./design/stages/SiteVisitStage').then((m) => ({ default: m.SiteVisitStage })));
const PreferencesStage    = lazy(() => import('./design/stages/PreferencesStage').then((m) => ({ default: m.PreferencesStage })));
const RoughBudgetStage    = lazy(() => import('./design/stages/RoughBudgetStage').then((m) => ({ default: m.RoughBudgetStage })));
const AgreementStage      = lazy(() => import('./design/stages/AgreementStage').then((m) => ({ default: m.AgreementStage })));
const PaymentsStage       = lazy(() => import('./design/stages/PaymentsStage').then((m) => ({ default: m.PaymentsStage })));
const FloorPlanStage      = lazy(() => import('./design/stages/FloorPlanStage').then((m) => ({ default: m.FloorPlanStage })));
const MoodboardStage      = lazy(() => import('./design/stages/MoodboardStage').then((m) => ({ default: m.MoodboardStage })));
const DesignPackStage     = lazy(() => import('./design/stages/DesignPackStage').then((m) => ({ default: m.DesignPackStage })));
const FinalBudgetStage    = lazy(() => import('./design/stages/FinalBudgetStage').then((m) => ({ default: m.FinalBudgetStage })));
const ProcurementStage    = lazy(() => import('./design/stages/ProcurementStage').then((m) => ({ default: m.ProcurementStage })));
const ExecutionStage      = lazy(() => import('./design/stages/ExecutionStage').then((m) => ({ default: m.ExecutionStage })));
const ExpenseCaptureStage = lazy(() => import('./design/stages/ExpenseCaptureStage').then((m) => ({ default: m.ExpenseCaptureStage })));
const ReconciliationStage = lazy(() => import('./design/stages/ReconciliationStage').then((m) => ({ default: m.ReconciliationStage })));
const HandoverStage       = lazy(() => import('./design/stages/HandoverStage').then((m) => ({ default: m.HandoverStage })));
const DocumentsStage      = lazy(() => import('./design/stages/DocumentsStage').then((m) => ({ default: m.DocumentsStage })));

interface Props {
  subPage: string;
  onChangeSubPage: (id: string) => void;
  /** Opens the global header Ask Friday drawer with a per-project scope
   *  label. The drawer itself detects from the URL that we're on a
   *  design project and switches to the real Kimi-backed
   *  /api/design/ai/ask endpoint (rather than the scripted mock used
   *  in other modules). Threaded down to ProjectShell so the
   *  ProjectContextBar's "✨ Ask Friday" button hits the global
   *  drawer instead of the deprecated standalone project drawer. */
  openFriday?: (scope?: string) => void;
}

/** Format a date string (ISO or YYYY-MM-DD) for the Summary panel. Drops
 *  the time portion and adds a friendly relative suffix ("3 mo ago" /
 *  "in 4 mo"). Returns '—' when the input is null/undefined. */
function formatProjectDate(input: string | null | undefined): string {
  if (!input) return '—';
  const d = new Date(input);
  if (isNaN(d.getTime())) return input;
  const iso = d.toISOString().slice(0, 10);
  const diffDays = Math.round((d.getTime() - Date.now()) / 86400000);
  let rel = '';
  if (Math.abs(diffDays) < 1) rel = ' · today';
  else if (Math.abs(diffDays) < 60) rel = ` · ${diffDays > 0 ? 'in ' : ''}${Math.abs(diffDays)}d${diffDays < 0 ? ' ago' : ''}`;
  else rel = ` · ${diffDays > 0 ? 'in ' : ''}${Math.round(Math.abs(diffDays) / 30)} mo${diffDays < 0 ? ' ago' : ''}`;
  return `${iso}${rel}`;
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
  | 'doc-request'
  | 'site-visit'
  | 'preferences'
  | 'rough-budget'
  | 'agreement'
  | 'payments'
  | 'floor-plan'
  | 'moodboard'
  | 'design-pack'
  | 'final-budget'
  | 'procurement'
  | 'execution'
  | 'expense-capture'
  | 'reconciliation'
  | 'handover'
  | 'documents';

// ─────────────────────────── Phase model ───────────────────────────
//
// Cont-10 audit fix. The 17-stage state machine drove an 18-pill clickable
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
    sections: ['doc-request', 'site-visit', 'preferences', 'rough-budget', 'agreement', 'payments'],
    stages: ['lead', 'doc-request', 'site-visit', 'preferences', 'rough-budget', 'agreement', 'signature', 'payment-gate'],
  },
  {
    id: 'design',
    label: 'Design',
    // floor-plan slots before moodboard: it happens after payment-gate
    // clears but before the moodboard work begins. See design-be-13.
    sections: ['floor-plan', 'moodboard', 'design-pack', 'final-budget'],
    stages: ['floor-plan', 'moodboard', 'design-pack', 'design-review', 'final-budget'],
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
    sections: ['execution', 'expense-capture'],
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
  'doc-request':    'Document request',
  'site-visit':     'Site visit',
  'preferences':    'Preferences',
  'rough-budget':   'Rough budget',
  'agreement':      'Agreement',
  'payments':       'Payments',
  'floor-plan':     'Floor plan',
  'moodboard':      'Moodboard',
  'design-pack':    'Design pack',
  'final-budget':   'Final budget',
  'procurement':    'Procurement',
  'execution':      'Execution',
  'expense-capture':'Expense capture',
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

export function DesignModule({ subPage, onChangeSubPage, openFriday }: Props) {
  const canSeeSettings = useCanSee('settings');

  const tabs = [
    { id: 'overview',  label: 'Overview' },
    { id: 'projects',  label: 'Projects' },
    { id: 'leads',     label: 'Leads' },
    { id: 'vendors',   label: 'Vendors' },
    { id: 'analytics', label: 'Analytics' },
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

  // Live data hydration. Top-level runs on mount (projects, leads,
  // counterparties, properties, vendors). Per-project runs whenever a
  // pid is set. Both hooks splice the fixture arrays in place and bump
  // a rev counter; we feed `rev` into the dashboard subtree as a React
  // key so each tab remounts after hydration — that's the only reliable
  // way to invalidate downstream useMemo([allProjects, ...]) calls,
  // since mutating an array doesn't change its identity.
  const { rev: topRev, error: hydrateError } = useHydrateDesignTopLevel();
  const { rev: projectRev, refetch: refetchProject } = useHydrateDesignProject(pid && pid !== '__new' ? pid : null);
  if (typeof window !== 'undefined' && hydrateError) {
    console.warn('[design] top-level hydration error:', hydrateError);
  }

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
        onRefetch={refetchProject}
        projectRev={projectRev}
        openFriday={openFriday}
      />
    );
  }

  return (
    <div className="fad-module-body" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ModuleHeader
        title="Design"
        subtitle="Interior design projects — site visits, moodboards, floor plans, vendor quotes, owner approvals."
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
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }} key={`tab-${topRev}-${projectRev}`}>
        {active === 'overview' && <DesignDashboard onOpenProject={(id) => { setScreenAndUrl('overview'); setPidAndUrl(id); }} />}
        {active === 'projects' && <ProjectsList onOpenProject={(id) => { setScreenAndUrl('overview'); setPidAndUrl(id); }} />}
        {active === 'leads' && <LeadsList onOpenProject={(id) => { setScreenAndUrl('overview'); setPidAndUrl(id); }} />}
        {active === 'vendors' && <VendorsList />}
        {active === 'analytics' && <AnalyticsView />}
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
  const currentUserId = useCurrentUserId();

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
    // Cont-24: respect the View-as switcher — was hardcoded to u-bryan.
    const all = allProjects.flatMap((p) => designClient.tasks.list(p.id));
    return all.filter((t) => t.assignedUserId === currentUserId && t.status !== 'completed').slice(0, 6);
  }, [allProjects, currentUserId]);

  // QA-bug fix: render ALL 17 stages, not just the ones with ≥1
  // project. Empty stages were silently dropped, so users couldn't
  // filter to "what's blocked at Site Visit" if no project was there
  // yet. Counts surface inline so empty stages stay visible but
  // visually de-emphasised.
  const stageOptions = useMemo(() => {
    const counts = new Map<StageId, number>();
    for (const p of allProjects) {
      counts.set(p.currentStage, (counts.get(p.currentStage) ?? 0) + 1);
    }
    return STAGES.map((s) => ({ id: s.id, label: s.shortLabel, count: counts.get(s.id) ?? 0 }));
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
              <FilterChip
                key={s.id}
                label={s.count > 0 ? `${s.label} · ${s.count}` : s.label}
                active={stageFilter === s.id}
                onClick={() => setStageFilter(s.id)}
                dim={s.count === 0}
              />
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

function FilterChip({ label, active, onClick, dim }: { label: string; active: boolean; onClick: () => void; dim?: boolean }) {
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
        opacity: dim && !active ? 0.55 : 1,
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

type ProjectSortKey = 'name' | 'counterparty' | 'classification' | 'tier' | 'stage' | 'updated';
type SortDir = 'asc' | 'desc';

function ProjectsTable({ projects, onOpenProject }: { projects: DesignProject[]; onOpenProject: (id: string) => void }) {
  // Default sort: most-recently-updated first. Click a column header to
  // toggle (off → asc → desc → off).
  const [sort, setSort] = useState<{ key: ProjectSortKey; dir: SortDir } | null>({ key: 'updated', dir: 'desc' });

  const sorted = useMemo(() => {
    if (!sort) return projects;
    const out = [...projects];
    const dirMul = sort.dir === 'asc' ? 1 : -1;
    out.sort((a, b) => dirMul * compareProjects(a, b, sort.key));
    return out;
  }, [projects, sort]);

  const onHeader = (key: ProjectSortKey) => {
    setSort((current) => {
      if (!current || current.key !== key) return { key, dir: 'asc' };
      if (current.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  if (projects.length === 0) {
    return (
      <div style={{ padding: 24, color: 'var(--color-text-tertiary)', fontSize: 13, textAlign: 'center' }}>
        No projects yet. Create one with <strong style={{ color: 'var(--color-text-primary)' }}>+ New project</strong>.
      </div>
    );
  }
  return (
    <>
      <div className="design-projects-table-wrap" style={{ overflowX: 'auto' }}>
        <table className="design-projects-table" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--color-text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              <SortHeader label="Project" k="name" sort={sort} onClick={onHeader} />
              <SortHeader label="Counterparty" k="counterparty" sort={sort} onClick={onHeader} />
              <th style={cellStyle('left')}>Property</th>
              <SortHeader label="Class." k="classification" sort={sort} onClick={onHeader} />
              <SortHeader label="Tier" k="tier" sort={sort} onClick={onHeader} />
              <SortHeader label="Stage" k="stage" sort={sort} onClick={onHeader} />
              <th style={cellStyle('left')}>Next action</th>
              <th style={cellStyle('left')}>Signals</th>
              <SortHeader label="Updated" k="updated" sort={sort} onClick={onHeader} align="right" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const cp = designClient.counterparties.get(p.counterpartyId);
              const prop = designClient.properties.get(p.propertyId);
              const signals = computeProjectSignals(p);
              return (
                <tr
                  key={p.id}
                  onClick={() => onOpenProject(p.id)}
                  style={{ cursor: 'pointer', borderTop: '0.5px solid var(--color-border-tertiary)', opacity: p.lifecycleStatus === 'cancelled' ? 0.55 : 1 }}
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
                    <span style={{ color: signals.daysInStage > 14 ? 'var(--color-text-warning)' : 'var(--color-text-tertiary)', fontSize: 10, fontFamily: 'var(--font-mono-fad)', marginLeft: 6 }}>
                      · {signals.daysInStage}d
                    </span>
                  </td>
                  <td style={cellStyle('left')}>{p.nextAction ?? '—'}</td>
                  <td style={cellStyle('left')}>
                    <ProjectSignalChips project={p} signals={signals} />
                  </td>
                  <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)', color: 'var(--color-text-tertiary)' }}>
                    {p.updatedAt.slice(0, 10)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="design-project-mobile-list">
        {sorted.map((p) => {
          const cp = designClient.counterparties.get(p.counterpartyId);
          const prop = designClient.properties.get(p.propertyId);
          const signals = computeProjectSignals(p);
          return (
            <button
              type="button"
              key={p.id}
              className="design-project-mobile-card"
              onClick={() => onOpenProject(p.id)}
            >
              <span className="design-project-mobile-top">
                <strong>{p.name}</strong>
                <span>{p.updatedAt.slice(0, 10)}</span>
              </span>
              <span className="design-project-mobile-meta">
                <span>{cp?.fullName ?? 'No counterparty'}</span>
                <span>{prop?.name ?? 'No property'}</span>
              </span>
              <span className="design-project-mobile-stage">
                <span>{p.currentStage}</span>
                <span>{stageStatusLabel(p.stageStatus)} · {signals.daysInStage}d</span>
              </span>
              <span className="design-project-mobile-foot">
                <span>{p.nextAction ?? 'No next action'}</span>
                <span><ProjectSignalChips project={p} signals={signals} /></span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function cellStyle(align: 'left' | 'right'): React.CSSProperties {
  return { padding: '8px 10px', textAlign: align, verticalAlign: 'top', whiteSpace: 'nowrap' };
}

function SortHeader({
  label,
  k,
  sort,
  onClick,
  align = 'left',
}: {
  label: string;
  k: ProjectSortKey;
  sort: { key: ProjectSortKey; dir: SortDir } | null;
  onClick: (k: ProjectSortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = sort?.key === k;
  const indicator = active ? (sort!.dir === 'asc' ? ' ↑' : ' ↓') : '';
  return (
    <th
      style={{ ...cellStyle(align), cursor: 'pointer', userSelect: 'none', color: active ? 'var(--color-brand-accent)' : 'var(--color-text-tertiary)' }}
      onClick={() => onClick(k)}
      data-projects-sort={k}
      data-projects-sort-active={active ? sort!.dir : undefined}
    >
      {label}{indicator}
    </th>
  );
}

const STAGE_ORDER: Record<string, number> = Object.fromEntries(
  ['lead','doc-request','site-visit','preferences','rough-budget','agreement','signature','payment-gate','floor-plan','moodboard','design-pack','design-review','final-budget','funding-gate','execution','expense-capture','reconciliation'].map((s, i) => [s, i]),
);

function compareProjects(a: DesignProject, b: DesignProject, key: ProjectSortKey): number {
  switch (key) {
    case 'name':           return a.name.localeCompare(b.name);
    case 'counterparty': {
      const an = designClient.counterparties.get(a.counterpartyId)?.fullName ?? '';
      const bn = designClient.counterparties.get(b.counterpartyId)?.fullName ?? '';
      return an.localeCompare(bn);
    }
    case 'classification': return a.classification.localeCompare(b.classification);
    case 'tier':           return (a.tier ?? 99) - (b.tier ?? 99);
    case 'stage':          return (STAGE_ORDER[a.currentStage] ?? 99) - (STAGE_ORDER[b.currentStage] ?? 99);
    case 'updated':        return a.updatedAt.localeCompare(b.updatedAt);
  }
}

interface ProjectSignals {
  daysInStage: number;
  varianceFlagged: boolean;
  pendingOwnerActions: number;
  blocked: boolean;
}

/**
 * Cross-cuts a few accessors to surface what the row should warn about.
 * `daysInStage` uses `updatedAt` as a proxy — there's no `stageEnteredAt`
 * timestamp on DesignProject in v0.1. v0.2 backend should track stage
 * transitions properly.
 */
function computeProjectSignals(p: DesignProject): ProjectSignals {
  const daysInStage = Math.max(0, Math.floor((Date.now() - new Date(p.updatedAt).getTime()) / 86_400_000));
  const items = designClient.budgetItems.list(p.id);
  const varianceFlagged = items.some((i) => {
    const approved = i.finalApprovedCostMinor ?? 0;
    const paid = i.actualPaidMinor ?? 0;
    if (approved === 0 || paid === 0) return false;
    return Math.abs(paid - approved) / approved > 0.05;
  });
  const approvalsPending = designClient.approvals.list(p.id).filter((a) => a.state === 'sent').length;
  const selectionsPending = designClient.selections.listPending(p.id).length;
  const changeOrdersPending = designClient.changeOrders.listPending(p.id).length;
  return {
    daysInStage,
    varianceFlagged,
    pendingOwnerActions: approvalsPending + selectionsPending + changeOrdersPending,
    blocked: !!p.blocker,
  };
}

function ProjectSignalChips({ project, signals }: { project: DesignProject; signals: ProjectSignals }) {
  const chips: React.ReactNode[] = [];
  if (project.lifecycleStatus === 'paused') {
    chips.push(<SignalChip key="paused" label="paused" tone="warning" title={project.pausedReason ?? 'Project paused'} />);
  }
  if (project.lifecycleStatus === 'cancelled') {
    chips.push(<SignalChip key="cancelled" label="cancelled" tone="danger" title={project.cancelledReason ?? 'Project cancelled'} />);
  }
  if (signals.blocked) {
    chips.push(<SignalChip key="blocked" label="blocked" tone="danger" title={project.blocker ?? ''} />);
  }
  if (signals.pendingOwnerActions > 0) {
    chips.push(
      <SignalChip
        key="pending"
        label={`${signals.pendingOwnerActions} owner`}
        tone="info"
        title={`${signals.pendingOwnerActions} owner action${signals.pendingOwnerActions === 1 ? '' : 's'} awaiting`}
      />,
    );
  }
  if (signals.varianceFlagged) {
    chips.push(<SignalChip key="variance" label="Δ >5%" tone="warning" title="One or more items paid >5% over approved cost" />);
  }
  if (chips.length === 0) {
    return <span style={{ color: 'var(--color-text-tertiary)', fontSize: 10 }}>—</span>;
  }
  return <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{chips}</div>;
}

function SignalChip({ label, tone, title }: { label: string; tone: 'info' | 'warning' | 'danger' | 'success'; title?: string }) {
  const bg = { info: 'var(--color-bg-info)', warning: 'var(--color-bg-warning)', danger: 'var(--color-bg-danger)', success: 'var(--color-bg-success)' }[tone];
  const fg = { info: 'var(--color-text-info)', warning: 'var(--color-text-warning)', danger: 'var(--color-text-danger)', success: 'var(--color-text-success)' }[tone];
  return (
    <span
      title={title}
      style={{ padding: '1px 6px', fontSize: 10, fontWeight: 500, borderRadius: 'var(--radius-full)', background: bg, color: fg, whiteSpace: 'nowrap' }}
    >
      {label}
    </span>
  );
}

// ─────────────────────────── Leads / Vendors / Settings (Phase 1 stubs) ───────────────────────────

const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  outreach: 'Cold outreach',
  owner_referral: 'Owner referral',
  existing_owner: 'Existing owner',
  repeat_customer: 'Repeat customer',
  industry_referral: 'Industry referral',
  press_media: 'Press / media',
  trade_show_event: 'Trade show / event',
  website: 'Website',
  whatsapp: 'WhatsApp',
  email_campaign: 'Email campaign',
  social_media: 'Social media',
  social_media_influencer: 'Social — influencer',
  social_media_ad: 'Social — ad campaign',
  walk_in: 'Walk-in',
  other: 'Other',
};
const LEAD_SOURCES: LeadSource[] = [
  'outreach', 'owner_referral', 'existing_owner', 'repeat_customer',
  'industry_referral', 'press_media', 'trade_show_event',
  'website', 'whatsapp', 'email_campaign',
  'social_media', 'social_media_influencer', 'social_media_ad',
  'walk_in', 'other',
];

// Hydrated DesignLead — what's actually in `designClient.leads.list()` after
// hydration via apiLeadToFixture (designClient.ts). Mirrors the ApiLead shape
// because the LEADS fixture array is mutated in-place with API rows on mount.
// The legacy DesignLead fixture type (counterpartyName, propertyHint, etc.)
// is no longer used at runtime. Tracked field set: id, name, email, phone,
// source, status, staleness_days, owner_user_id, created_at, notes.
type LiveLeadStatus = 'lead' | 'qualified' | 'converted' | 'lost';

const LEAD_STATUS_COLUMNS: Array<{
  id: LiveLeadStatus;
  label: string;
  tone: 'info' | 'success' | 'neutral' | 'danger';
}> = [
  { id: 'lead',      label: 'Lead',       tone: 'neutral' },
  { id: 'qualified', label: 'Qualified',  tone: 'info' },
  { id: 'converted', label: 'Converted',  tone: 'success' },
  { id: 'lost',      label: 'Lost',       tone: 'danger' },
];

function LeadsList({ onOpenProject }: { onOpenProject: (projectId: string) => void }) {
  // Flat status-grouped list of live design leads from /api/design/leads
  // (hydrated into LEADS via designClient.useHydrateDesignTopLevel). Replaces
  // the prior kanban — kanban columns keyed off ProposalStatus
  // (draft/sent/accepted) which no longer matches the live API status set
  // (lead/qualified/converted/lost). Drops the legacy CRM "pre-qualification"
  // column sourced from fixtures-tier3 demo data.
  const [rev, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);
  const [sourceFilter, setSourceFilter] = useState<Set<LeadSource>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const allLeads = designClient.leads.list() as unknown as ApiLead[];
  const leads = sourceFilter.size === 0
    ? allLeads
    : allLeads.filter((l) => sourceFilter.has((l.source as LeadSource) ?? 'other'));

  // Lead creation now uses a proper form drawer (LeadIntakeDrawer) rather
  // than chained window.prompt()s — matches the rest of the FAD design
  // language (ProjectEditDrawer, ShareWithOwnerDrawer, etc.).
  const [showLeadDrawer, setShowLeadDrawer] = useState(false);
  const handleLeadCreated = (created: ApiLead) => {
    // Splice the new row into the local LEADS array so it shows up without
    // a full refetch. Hydrated leads are stored as API-shape.
    (designClient.leads.list() as unknown as ApiLead[]).push(created);
    bump();
  };

  const handleConvert = async (lead: ApiLead) => {
    setBusy(lead.id);
    try {
      const result = await apiConvertLeadToProject(lead.id, {});
      // Update local lead row (status → converted) and open the new project.
      const localLeads = designClient.leads.list() as unknown as ApiLead[];
      const idx = localLeads.findIndex((l) => l.id === lead.id);
      if (idx !== -1) localLeads[idx] = result.lead;
      fireToast(`Project "${result.project.name}" created from lead.`);
      onOpenProject(result.project.id);
    } catch (e) {
      fireToast(`Failed to convert lead: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteLead = async (lead: ApiLead) => {
    // eslint-disable-next-line no-alert
    const ok = window.confirm(`Delete lead "${lead.name}"? This is irreversible. (Converted leads can't be deleted — archive instead.)`);
    if (!ok) return;
    setBusy(lead.id);
    try {
      await apiDeleteLead(lead.id);
      const localLeads = designClient.leads.list() as unknown as ApiLead[];
      const idx = localLeads.findIndex((l) => l.id === lead.id);
      if (idx !== -1) localLeads.splice(idx, 1);
      bump();
      fireToast(`Lead "${lead.name}" deleted.`);
    } catch (e) {
      fireToast(`Failed to delete lead: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-design-leads data-rev={rev}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
            Leads <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>· {allLeads.length} live</span>
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            Live from <code style={{ fontFamily: 'var(--font-mono-fad)' }}>/api/design/leads</code>. Convert qualified leads to drill into a draft project.
          </p>
        </div>
        <button
          type="button"
          data-leads-new
          onClick={() => setShowLeadDrawer(true)}
          style={leadActionBtn('primary')}
        >
          + New lead
        </button>
      </div>

      {/* Source filter chips. Click to toggle each source on/off. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginRight: 4 }}>Source:</span>
        {LEAD_SOURCES.map((src) => {
          const active = sourceFilter.has(src);
          return (
            <button
              key={src}
              type="button"
              data-leads-source-chip={src}
              onClick={() => setSourceFilter((prev) => {
                const next = new Set(prev);
                if (next.has(src)) next.delete(src); else next.add(src);
                return next;
              })}
              style={{
                padding: '2px 10px',
                fontSize: 11,
                borderRadius: 'var(--radius-full)',
                border: '0.5px solid var(--color-border-tertiary)',
                background: active ? 'var(--color-brand-accent-soft)' : 'transparent',
                color: active ? 'var(--color-brand-accent)' : 'var(--color-text-secondary)',
                fontWeight: active ? 600 : 500,
              }}
            >
              {LEAD_SOURCE_LABEL[src]}
            </button>
          );
        })}
        {sourceFilter.size > 0 && (
          <button
            type="button"
            onClick={() => setSourceFilter(new Set())}
            style={{ padding: '2px 8px', fontSize: 10, background: 'transparent', color: 'var(--color-text-tertiary)', textDecoration: 'underline' }}
          >
            clear
          </button>
        )}
      </div>

      {allLeads.length === 0 && (
        <div
          data-leads-empty
          style={{
            padding: 24,
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--color-text-tertiary)',
            border: '0.5px dashed var(--color-border-tertiary)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          No leads yet. Click <strong>+ New lead</strong> to add the first one.
        </div>
      )}

      {/* Flat status-grouped sections. Each status renders inline rather than
          as a horizontal kanban lane — the live dataset is small enough that
          stacked sections read better than scrolling columns. */}
      {LEAD_STATUS_COLUMNS.map((col) => {
        const rows = leads.filter((l) => l.status === col.id);
        if (rows.length === 0 && sourceFilter.size > 0) return null;
        return (
          <section
            key={col.id}
            data-leads-section={col.id}
            style={{
              background: 'var(--color-background-primary)',
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 'var(--radius-md)',
              padding: 12,
            }}
          >
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${leadColumnTone(col.tone).border}` }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: leadColumnTone(col.tone).text, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {col.label}
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono-fad)' }}>
                {rows.length}
              </span>
            </header>
            {rows.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 12 }}>
                No leads in {col.label.toLowerCase()}.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rows.map((l) => (
                  <LeadCard
                    key={l.id}
                    lead={l}
                    busy={busy === l.id}
                    onConvert={() => handleConvert(l)}
                    onDelete={() => handleDeleteLead(l)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
      {showLeadDrawer && (
        <LeadIntakeDrawer
          onCreated={handleLeadCreated}
          onClose={() => setShowLeadDrawer(false)}
        />
      )}
    </div>
  );
}

function LeadCard({ lead, busy, onConvert, onDelete }: { lead: ApiLead; busy: boolean; onConvert: () => void; onDelete: () => void }) {
  const sourceLabel = LEAD_SOURCE_LABEL[(lead.source as LeadSource) ?? 'other'] ?? lead.source ?? 'Other';
  const contact = lead.email || lead.phone || null;
  const staleness = formatLeadStaleness(lead);
  const canConvert = lead.status === 'lead' || lead.status === 'qualified';
  return (
    <div
      data-lead-card={lead.id}
      data-lead-status={lead.status}
      style={{
        background: 'var(--color-background-tertiary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-sm)',
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{lead.name}</span>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono-fad)', whiteSpace: 'nowrap' }}>
          {staleness}
        </span>
      </div>
      {contact && (
        <div
          style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: lead.email ? 'inherit' : 'var(--font-mono-fad)' }}
          data-lead-contact={lead.email ? 'email' : 'phone'}
        >
          {contact}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <LeadStatusChip status={lead.status} />
        <span
          style={{
            fontSize: 10,
            padding: '1px 8px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-background-primary)',
            color: 'var(--color-text-tertiary)',
            border: '0.5px solid var(--color-border-tertiary)',
          }}
        >
          {sourceLabel}
        </span>
      </div>
      {lead.notes && (
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
          {lead.notes}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        {canConvert && (
          <button
            type="button"
            data-lead-action="convert"
            onClick={onConvert}
            disabled={busy}
            style={busy ? { ...leadActionBtn('primary'), opacity: 0.6, cursor: 'wait' } : leadActionBtn('primary')}
          >
            {busy ? 'Converting…' : 'Convert to project'}
          </button>
        )}
        {lead.status !== 'converted' && (
          <button
            type="button"
            data-lead-action="delete"
            onClick={onDelete}
            disabled={busy}
            title="Delete this lead (irreversible)"
            style={{
              padding: '4px 10px',
              fontSize: 11,
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              border: '0.5px solid var(--color-border-tertiary)',
              color: 'var(--color-text-tertiary)',
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function LeadStatusChip({ status }: { status: LiveLeadStatus }) {
  const tone =
    status === 'converted' ? 'success' :
    status === 'lost' ? 'danger' :
    status === 'qualified' ? 'info' :
    'neutral';
  const bg = { success: 'var(--color-bg-success)', danger: 'var(--color-bg-danger)', info: 'var(--color-bg-info)', neutral: 'var(--color-background-tertiary)' }[tone];
  const fg = { success: 'var(--color-text-success)', danger: 'var(--color-text-danger)', info: 'var(--color-text-info)', neutral: 'var(--color-text-tertiary)' }[tone];
  return <span style={{ padding: '2px 10px', fontSize: 10, fontWeight: 500, borderRadius: 'var(--radius-full)', background: bg, color: fg }}>{status}</span>;
}

/** "today" / "Nd ago" / "N mo ago" from staleness_days when present, else
 *  derived from created_at. Returns '—' if neither is parseable. */
function formatLeadStaleness(lead: ApiLead): string {
  const fromDays = (days: number): string => {
    if (days < 1) return 'today';
    if (days < 60) return `${days}d ago`;
    return `${Math.round(days / 30)} mo ago`;
  };
  if (typeof lead.staleness_days === 'number' && lead.staleness_days >= 0) {
    return fromDays(Math.floor(lead.staleness_days));
  }
  if (lead.created_at) {
    const t = new Date(lead.created_at).getTime();
    if (!isNaN(t)) {
      const days = Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
      return fromDays(days);
    }
  }
  return '—';
}

function leadColumnTone(tone: 'neutral' | 'info' | 'success' | 'danger') {
  switch (tone) {
    case 'info':    return { border: 'var(--color-text-info)', text: 'var(--color-text-info)' };
    case 'success': return { border: 'var(--color-text-success)', text: 'var(--color-text-success)' };
    case 'danger':  return { border: 'var(--color-text-danger)', text: 'var(--color-text-danger)' };
    default:        return { border: 'var(--color-border-secondary)', text: 'var(--color-text-tertiary)' };
  }
}

function leadActionBtn(variant: 'primary' | 'secondary'): React.CSSProperties {
  return {
    padding: '4px 10px',
    fontSize: 11,
    borderRadius: 'var(--radius-sm)',
    background: variant === 'primary' ? 'var(--color-brand-accent)' : 'var(--color-background-tertiary)',
    color: variant === 'primary' ? '#fff' : 'var(--color-text-secondary)',
    border: '0.5px solid var(--color-border-tertiary)',
    fontWeight: 500,
  };
}

// Shared form-row helpers (legacy names retained — also used by NewVendorForm
// and the DesignSettings tier-edit inputs).
function leadFieldLabel(): React.CSSProperties {
  return { fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', flexDirection: 'column', gap: 4 };
}

function leadInput(): React.CSSProperties {
  return { padding: '6px 8px', fontSize: 12, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' };
}

const VENDOR_CATEGORIES: VendorCategory[] = ['electrician', 'general_contractor', 'structural_engineer', 'mep_engineer', 'interior_designer', 'furniture_supplier', 'decor_supplier', 'lighting_supplier', 'transport', 'cleaning', 'other'];

function VendorsList() {
  const [, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);
  const [showCreate, setShowCreate] = useState(false);
  const allRows = designClient.vendors.listPerformance();
  const [openId, setOpenId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(() => new Set());
  // Per-row in-flight tracker for ✕-delete. Backend 409s if any
  // design_budget_items reference the vendor — we surface that
  // message directly to the toast (it names the count, more helpful
  // than guessing client-side).
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const handleDeleteVendor = async (vendorId: string, vendorName: string) => {
    if (!window.confirm(`Delete vendor "${vendorName}"? This cannot be undone.`)) return;
    setDeletingId(vendorId);
    const beforeIdx = FIXTURE_VENDORS.findIndex((v) => v.id === vendorId);
    const before = beforeIdx >= 0 ? FIXTURE_VENDORS[beforeIdx] : null;
    if (beforeIdx >= 0) {
      FIXTURE_VENDORS.splice(beforeIdx, 1);
      bumpFixtureRev();
    }
    try {
      await deleteVendor(vendorId);
      fireToast(`Vendor "${vendorName}" deleted.`);
      if (openId === vendorId) setOpenId(null);
      bump();
    } catch (err) {
      if (before && beforeIdx >= 0) {
        FIXTURE_VENDORS.splice(beforeIdx, 0, before);
        bumpFixtureRev();
      }
      const msg = err instanceof Error ? err.message : String(err);
      // Surface the backend message verbatim — for 409s it includes
      // the helpful "referenced by N budget item(s)" hint.
      fireToast(msg);
    } finally {
      setDeletingId(null);
    }
  };

  // Categories present in the data — only show chips for vendors that exist.
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const { vendor } of allRows) set.add(vendor.category);
    return Array.from(set).sort();
  }, [allRows]);

  const rows = categoryFilter.size === 0
    ? allRows
    : allRows.filter(({ vendor }) => categoryFilter.has(vendor.category));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600 }}>Vendor register</h3>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Cross-project performance — total spend, items shipped, variance vs. approved cost, and on-time completion rate. Click a row for the per-project breakdown.
              {' · '}<strong>{rows.length}</strong> shown · <strong>{allRows.filter((r) => r.perf.projectCount > 0).length}</strong> active
            </p>
          </div>
          <button
            type="button"
            data-vendors-new
            onClick={() => setShowCreate((v) => !v)}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-brand-accent)',
              color: '#fff',
              fontWeight: 500,
            }}
          >
            {showCreate ? 'Cancel' : '+ New vendor'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginRight: 4 }}>Category:</span>
          {categories.map((cat) => {
            const active = categoryFilter.has(cat);
            return (
              <button
                key={cat}
                type="button"
                data-vendors-cat-chip={cat}
                onClick={() => setCategoryFilter((prev) => {
                  const next = new Set(prev);
                  if (next.has(cat)) next.delete(cat); else next.add(cat);
                  return next;
                })}
                style={{
                  padding: '2px 10px',
                  fontSize: 11,
                  borderRadius: 'var(--radius-full)',
                  border: '0.5px solid var(--color-border-tertiary)',
                  background: active ? 'var(--color-brand-accent-soft)' : 'transparent',
                  color: active ? 'var(--color-brand-accent)' : 'var(--color-text-secondary)',
                  fontWeight: active ? 600 : 500,
                }}
              >
                {cat.replace(/_/g, ' ')}
              </button>
            );
          })}
          {categoryFilter.size > 0 && (
            <button
              type="button"
              onClick={() => setCategoryFilter(new Set())}
              style={{ padding: '2px 8px', fontSize: 10, background: 'transparent', color: 'var(--color-text-tertiary)', textDecoration: 'underline' }}
            >
              clear
            </button>
          )}
        </div>
      </div>

      {showCreate && (
        <NewVendorForm
          onCancel={() => setShowCreate(false)}
          onCreated={(v) => {
            setShowCreate(false);
            setOpenId(v.id);
            bump();
            fireToast(`Vendor "${v.name}" created.`);
          }}
        />
      )}

      <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ color: 'var(--color-text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, background: 'var(--color-background-tertiary)' }}>
                <th style={cellStyle('left')}>Vendor</th>
                <th style={cellStyle('left')}>Category</th>
                <th style={cellStyle('right')}>Projects</th>
                <th style={cellStyle('right')}>Items</th>
                <th style={cellStyle('right')}>Total spend</th>
                <th style={cellStyle('right')}>Variance</th>
                <th style={cellStyle('right')}>On-time</th>
                <th style={cellStyle('right')} aria-label="Actions"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ vendor, perf }) => {
                const isOpen = openId === vendor.id;
                const variancePctText = perf.variancePct === 0 ? '—' : `${perf.variancePct > 0 ? '+' : ''}${(perf.variancePct * 100).toFixed(1)}%`;
                const varianceFlagged = Math.abs(perf.variancePct) > 0.05;
                return (
                  <Fragment key={vendor.id}>
                    <tr
                      data-design-vendor-row={vendor.id}
                      onClick={() => setOpenId(isOpen ? null : vendor.id)}
                      style={{ borderTop: '0.5px solid var(--color-border-tertiary)', cursor: perf.projects.length > 0 ? 'pointer' : 'default' }}
                    >
                      <td style={cellStyle('left')}>
                        <div style={{ fontWeight: 500 }}>{vendor.name} {perf.projects.length > 0 && <span style={{ color: 'var(--color-text-tertiary)', fontSize: 10 }}>{isOpen ? '▾' : '▸'}</span>}</div>
                        {vendor.company && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{vendor.company}</div>}
                      </td>
                      <td style={{ ...cellStyle('left'), color: 'var(--color-text-tertiary)' }}>{vendor.category.replace(/_/g, ' ')}</td>
                      <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)' }}>{perf.projectCount}</td>
                      <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)' }}>{perf.itemCount}</td>
                      <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)', fontWeight: 500 }}>{perf.totalSpendMinor > 0 ? formatMUR(perf.totalSpendMinor) : '—'}</td>
                      <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)', color: varianceFlagged ? 'var(--color-text-warning)' : 'var(--color-text-tertiary)' }}>
                        {variancePctText}
                      </td>
                      <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)', color: perf.deliveryCompletionPct >= 0.8 ? 'var(--color-text-success)' : perf.deliveryCompletionPct < 0.5 && perf.itemCount > 0 ? 'var(--color-text-warning)' : 'var(--color-text-tertiary)' }}>
                        {perf.itemCount === 0 ? '—' : `${Math.round(perf.deliveryCompletionPct * 100)}%`}
                      </td>
                      <td style={{ ...cellStyle('right'), width: 32 }}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDeleteVendor(vendor.id, vendor.name); }}
                          disabled={deletingId === vendor.id}
                          aria-label={`Delete vendor ${vendor.name}`}
                          title="Delete vendor"
                          data-vendor-delete
                          style={{
                            width: 22, height: 22, padding: 0,
                            background: 'transparent',
                            border: '0.5px solid var(--color-border-tertiary)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--color-text-tertiary)',
                            fontSize: 12, lineHeight: 1,
                            cursor: deletingId === vendor.id ? 'not-allowed' : 'pointer',
                            opacity: deletingId === vendor.id ? 0.4 : 0.7,
                          }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                    {isOpen && perf.projects.length > 0 && (
                      <tr>
                        <td colSpan={8} style={{ padding: 0 }}>
                          <VendorProjectBreakdown projects={perf.projects} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function VendorProjectBreakdown({ projects }: { projects: Array<{ projectId: string; projectName: string; itemCount: number; spendMinor: number }> }) {
  return (
    <div style={{ background: 'var(--color-background-tertiary)', padding: 10 }} data-design-vendor-breakdown>
      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: 'var(--color-text-tertiary)', fontSize: 10 }}>
            <th style={cellStyle('left')}>Project</th>
            <th style={cellStyle('right')}>Items</th>
            <th style={cellStyle('right')}>Spend</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.projectId} style={{ borderTop: '0.5px dashed var(--color-border-tertiary)' }}>
              <td style={cellStyle('left')}>{p.projectName}</td>
              <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)' }}>{p.itemCount}</td>
              <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)' }}>{p.spendMinor > 0 ? formatMUR(p.spendMinor) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────── Analytics view (cont-29) ───────────────────────────

const ANALYTICS_RANGES: Array<{ id: 30 | 90 | 180 | 'all'; label: string }> = [
  { id: 30, label: 'Last 30d' },
  { id: 90, label: 'Last 90d' },
  { id: 180, label: 'Last 180d' },
  { id: 'all', label: 'All time' },
];

const FLOW_TIERS: DesignTier[] = [1, 2, 3];
const FLOW_CLASSIFICATIONS: ProjectClassification[] = ['renovation', 'furnishing', 'mixed'];

function AnalyticsView() {
  const [range, setRange] = useState<30 | 90 | 180 | 'all'>('all');
  const [flowTiers, setFlowTiers] = useState<DesignTier[]>([]);
  const [flowClasses, setFlowClasses] = useState<ProjectClassification[]>([]);
  const stages = designClient.analytics.timeInStage(range);
  const funnel = designClient.analytics.funnel(range);
  const flow = designClient.analytics.flowCurve(range, { tiers: flowTiers, classifications: flowClasses });
  // Pre-qualification count: design leads in the 'lead' status (not yet
  // qualified, not converted/lost). Hydrated from /api/design/leads.
  const crmInteriorPrequalCount = (designClient.leads.list() as unknown as ApiLead[])
    .filter((l) => l.status === 'lead').length;
  const toggleTier = (t: DesignTier) => setFlowTiers((s) => s.includes(t) ? s.filter((x) => x !== t) : [...s, t]);
  const toggleClass = (c: ProjectClassification) => setFlowClasses((s) => s.includes(c) ? s.filter((x) => x !== c) : [...s, c]);
  const clearFlowFilters = () => { setFlowTiers([]); setFlowClasses([]); };
  const flowFilterActive = flowTiers.length > 0 || flowClasses.length > 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} data-design-analytics>
      <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600 }}>Analytics</h3>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Cross-project rollups derived live from the same data the per-project tabs read. Three views: time-in-stage (where projects bottleneck), lead conversion funnel (Source → Won), and a P&amp;L flow chart (revenue, spend, net cash by month).
            </p>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {ANALYTICS_RANGES.map((r) => (
              <button
                key={String(r.id)}
                type="button"
                data-analytics-range={r.id}
                onClick={() => setRange(r.id)}
                style={{
                  padding: '4px 10px',
                  fontSize: 11,
                  borderRadius: 'var(--radius-sm)',
                  border: '0.5px solid var(--color-border-tertiary)',
                  background: range === r.id ? 'var(--color-brand-accent)' : 'transparent',
                  color: range === r.id ? '#fff' : 'var(--color-text-secondary)',
                  fontWeight: range === r.id ? 600 : 500,
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 16 }}>
        <h4 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600 }}>Time in stage</h4>
        <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Active projects, grouped by their current stage. Median + max days reveal which stages bottleneck. <em>Days are computed from <code style={{ fontFamily: 'var(--font-mono-fad)' }}>updatedAt</code> as a v0.1 proxy — v0.2 wires explicit per-stage entry timestamps.</em>
        </p>
        <TimeInStageChart buckets={stages} />
      </div>

      <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 16 }}>
        <h4 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600 }}>Lead conversion funnel</h4>
        <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Pre-qualification (CRM-lite interior leads) → Design pipeline. Conversion ratios annotate each step. <em>Won counts currently-active won projects, not true cohort conversion — v0.2 walks per-lead state transitions for real retention math.</em>
        </p>
        <FunnelChart preQualCount={crmInteriorPrequalCount} buckets={funnel} />
      </div>

      <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 16 }}>
        <h4 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600 }}>Project flow</h4>
        <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Cumulative monthly. Toggle series to compare. <strong>Net cash</strong> = revenue received − spend paid; useful as a project cash position, not gross margin (BUDGET_ITEMS spend is owner-funded working capital). Taxes (VAT pass-through, Mauritius corp tax) are out of scope at v0.1.
        </p>
        <div data-flow-filters style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12, fontSize: 11 }}>
          <span style={{ color: 'var(--color-text-tertiary)' }}>Tier:</span>
          {FLOW_TIERS.map((t) => {
            const on = flowTiers.includes(t);
            return (
              <button
                key={t}
                type="button"
                data-flow-tier={t}
                data-active={on}
                onClick={() => toggleTier(t)}
                style={flowFilterChip(on)}
              >
                Tier {t}
              </button>
            );
          })}
          <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 8 }}>Scope:</span>
          {FLOW_CLASSIFICATIONS.map((c) => {
            const on = flowClasses.includes(c);
            return (
              <button
                key={c}
                type="button"
                data-flow-class={c}
                data-active={on}
                onClick={() => toggleClass(c)}
                style={flowFilterChip(on)}
              >
                {c}
              </button>
            );
          })}
          {flowFilterActive && (
            <button
              type="button"
              data-flow-clear
              onClick={clearFlowFilters}
              style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-brand-accent)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              clear filters
            </button>
          )}
        </div>
        <FlowCurveChart points={flow} />
      </div>
    </div>
  );
}

function flowFilterChip(on: boolean): React.CSSProperties {
  return {
    padding: '3px 9px',
    fontSize: 11,
    borderRadius: 'var(--radius-full)',
    border: '0.5px solid ' + (on ? 'transparent' : 'var(--color-border-tertiary)'),
    background: on ? 'var(--color-brand-accent)' : 'transparent',
    color: on ? '#fff' : 'var(--color-text-secondary)',
    fontWeight: on ? 600 : 500,
    cursor: 'pointer',
    textTransform: 'capitalize' as const,
  };
}

function TimeInStageChart({ buckets }: { buckets: Array<{ stageId: string; stageLabel: string; count: number; medianDays: number; maxDays: number }> }) {
  if (buckets.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '12px 0', textAlign: 'center' }}>No active projects in this range.</div>;
  }
  const maxScale = Math.max(30, ...buckets.map((b) => b.maxDays));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {buckets.map((b) => {
        const medianPct = (b.medianDays / maxScale) * 100;
        const maxPct = (b.maxDays / maxScale) * 100;
        const flagged = b.medianDays > 14;
        return (
          <div key={b.stageId} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 80px', gap: 10, alignItems: 'center' }}>
            <div style={{ fontSize: 12 }}>
              <strong>{b.stageLabel}</strong>
              <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 4 }}>· {b.count}</span>
            </div>
            <div style={{ position: 'relative', height: 16, background: 'var(--color-background-tertiary)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${maxPct}%`, background: 'var(--color-bg-warning)', borderRadius: 'var(--radius-sm)', opacity: 0.4 }} />
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${medianPct}%`, background: flagged ? 'var(--color-text-warning)' : 'var(--color-brand-accent)', borderRadius: 'var(--radius-sm)' }} />
            </div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono-fad)', color: 'var(--color-text-tertiary)', textAlign: 'right' }}>
              {b.medianDays}d · {b.maxDays}d max
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 6, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--color-brand-accent)', borderRadius: 2, marginRight: 4 }} />median</span>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--color-bg-warning)', borderRadius: 2, marginRight: 4, opacity: 0.6 }} />max (worst-stuck)</span>
      </div>
    </div>
  );
}

function FunnelChart({ preQualCount, buckets }: { preQualCount: number; buckets: Array<{ label: string; count: number; conversionFromPrev: number | null }> }) {
  // Render pre-qualification + design buckets together, widest at the top.
  const all = [{ label: 'Pre-qualification (CRM)', count: preQualCount, conversionFromPrev: null }, ...buckets];
  const maxCount = Math.max(1, ...all.map((b) => b.count));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {all.map((b, i) => {
        const widthPct = (b.count / maxCount) * 100;
        const isPrequal = i === 0;
        return (
          <div key={b.label} style={{ display: 'grid', gridTemplateColumns: '170px 1fr 90px', gap: 10, alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: isPrequal ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)' }}>
              {b.label}
            </div>
            <div style={{ height: 22, background: 'var(--color-background-tertiary)', borderRadius: 'var(--radius-sm)', position: 'relative' }}>
              <div
                style={{
                  height: '100%',
                  width: `${widthPct}%`,
                  background: isPrequal ? 'var(--color-background-tertiary)' : 'var(--color-brand-accent)',
                  border: isPrequal ? '0.5px dashed var(--color-border-secondary)' : 'none',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 8,
                  fontSize: 11,
                  fontWeight: 600,
                  color: isPrequal ? 'var(--color-text-secondary)' : '#fff',
                }}
              >
                {b.count}
              </div>
            </div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono-fad)', color: 'var(--color-text-tertiary)', textAlign: 'right' }}>
              {b.conversionFromPrev !== null ? `${(b.conversionFromPrev * 100).toFixed(0)}%` : '—'}
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4, textAlign: 'right' }}>
        Right column = conversion from previous stage
      </div>
    </div>
  );
}

type FlowSeriesKey = 'revenue' | 'spendApproved' | 'spendPaid' | 'netCash';

interface FlowSeriesDef {
  key: FlowSeriesKey;
  label: string;
  pickMinor: (p: { revenueMinor: number; spendApprovedMinor: number; spendPaidMinor: number; netCashMinor: number }) => number;
  color: string;
  dashed: boolean;
}

const FLOW_SERIES: FlowSeriesDef[] = [
  { key: 'revenue',       label: 'Revenue',        pickMinor: (p) => p.revenueMinor,       color: 'var(--color-text-success)', dashed: false },
  { key: 'spendApproved', label: 'Spend approved', pickMinor: (p) => p.spendApprovedMinor, color: 'var(--color-brand-accent)', dashed: false },
  { key: 'spendPaid',     label: 'Spend paid',     pickMinor: (p) => p.spendPaidMinor,     color: 'var(--color-brand-accent)', dashed: true },
  { key: 'netCash',       label: 'Net cash',       pickMinor: (p) => p.netCashMinor,       color: 'var(--color-text-primary)', dashed: false },
];

function FlowCurveChart({ points }: { points: Array<{ month: string; revenueMinor: number; revenueDesignFeeMinor: number; revenueExecutionFeeMinor: number; revenueFinalBalanceMinor: number; spendApprovedMinor: number; spendPaidMinor: number; netCashMinor: number }> }) {
  const [active, setActive] = useState<Record<FlowSeriesKey, boolean>>({
    revenue: true,
    spendApproved: false,
    spendPaid: true,
    netCash: true,
  });
  const toggle = (k: FlowSeriesKey) => setActive((s) => ({ ...s, [k]: !s[k] }));

  if (points.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '12px 0', textAlign: 'center' }}>No data in this range.</div>;
  }

  const W = 600;
  const H = 200;
  const PAD = { top: 10, right: 10, bottom: 24, left: 60 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  // Scale across visible series only — and ALWAYS include 0 in the y-axis so net-cash dips render correctly.
  const visibleSeries = FLOW_SERIES.filter((s) => active[s.key]);
  const allValues = visibleSeries.length > 0
    ? points.flatMap((p) => visibleSeries.map((s) => s.pickMinor(p)))
    : [0];
  const yMax = Math.max(0, ...allValues);
  const yMin = Math.min(0, ...allValues);
  const yRange = yMax - yMin || 1;

  const xStep = points.length === 1 ? innerW : innerW / (points.length - 1);
  const xAt = (i: number) => PAD.left + i * xStep;
  const yAt = (v: number) => PAD.top + innerH - ((v - yMin) / yRange) * innerH;

  const linePath = (series: FlowSeriesDef) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(series.pickMinor(p))}`).join(' ');

  // Filled area only for revenue (lead series). Other series render line-only to avoid stacking ambiguity.
  const revenueAreaPath = () => {
    if (!active.revenue) return null;
    const rSeries = FLOW_SERIES.find((s) => s.key === 'revenue')!;
    return `${linePath(rSeries)} L ${xAt(points.length - 1)} ${yAt(0)} L ${xAt(0)} ${yAt(0)} Z`;
  };

  // y-axis ticks — 5 evenly spaced including zero baseline if visible
  const yTickVals = [0, 0.25, 0.5, 0.75, 1].map((f) => yMin + f * yRange);
  const last = points[points.length - 1];

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const hovered = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div data-design-analytics-flow style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Series toggles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} data-flow-toggles>
        {FLOW_SERIES.map((s) => {
          const on = active[s.key];
          return (
            <button
              key={s.key}
              type="button"
              data-flow-series={s.key}
              data-active={on}
              onClick={() => toggle(s.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: on ? 600 : 500,
                borderRadius: 'var(--radius-full)',
                border: '0.5px solid ' + (on ? 'transparent' : 'var(--color-border-tertiary)'),
                background: on ? 'var(--color-background-secondary)' : 'transparent',
                color: on ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                opacity: on ? 1 : 0.7,
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 14,
                  height: 0,
                  borderTop: `2px ${s.dashed ? 'dashed' : 'solid'} ${s.color}`,
                  verticalAlign: 'middle',
                }}
              />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* SVG chart */}
      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: 'auto', minWidth: 480, cursor: points.length > 0 ? 'crosshair' : 'default' }}
          onPointerMove={(e) => {
            const svg = e.currentTarget as SVGSVGElement;
            const rect = svg.getBoundingClientRect();
            // map clientX into the viewBox coordinate space
            const vbX = ((e.clientX - rect.left) / rect.width) * W;
            const i = Math.round((vbX - PAD.left) / xStep);
            if (i >= 0 && i < points.length) setHoverIdx(i);
            else setHoverIdx(null);
          }}
          onPointerLeave={() => setHoverIdx(null)}
        >
          {/* gridlines + y-axis labels */}
          {yTickVals.map((v, i) => {
            const y = yAt(v);
            return (
              <g key={i}>
                <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="var(--color-border-tertiary)" strokeDasharray="2 4" strokeWidth={0.5} />
                <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize={9} fontFamily="var(--font-mono-fad)" fill="var(--color-text-tertiary)">
                  {formatMURCompact(v)}
                </text>
              </g>
            );
          })}
          {/* zero baseline (slightly stronger) if 0 is inside the range */}
          {yMin < 0 && (
            <line x1={PAD.left} y1={yAt(0)} x2={W - PAD.right} y2={yAt(0)} stroke="var(--color-border-secondary)" strokeWidth={0.75} />
          )}
          {/* revenue filled area */}
          {active.revenue && (
            <path d={revenueAreaPath() ?? ''} fill="var(--color-text-success)" opacity={0.10} />
          )}
          {/* series lines */}
          {visibleSeries.map((s) => (
            <path
              key={s.key}
              d={linePath(s)}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? '6 3' : undefined}
            />
          ))}
          {/* x-axis labels */}
          {points.map((p, i) => (
            <text key={p.month} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize={9} fontFamily="var(--font-mono-fad)" fill="var(--color-text-tertiary)">
              {p.month}
            </text>
          ))}
          {/* hover guide + dots when a point is hovered */}
          {hoverIdx !== null && hovered && (
            <g pointerEvents="none">
              <line x1={xAt(hoverIdx)} y1={PAD.top} x2={xAt(hoverIdx)} y2={PAD.top + innerH} stroke="var(--color-border-secondary)" strokeWidth={0.75} strokeDasharray="3 3" />
              {visibleSeries.map((s) => (
                <circle key={s.key} cx={xAt(hoverIdx)} cy={yAt(s.pickMinor(hovered))} r={3.5} fill={s.color} stroke="var(--color-background-primary)" strokeWidth={1} />
              ))}
            </g>
          )}
        </svg>
      </div>
      {/* hover tooltip — renders below the chart so it never clips off the right edge */}
      {hovered && (
        <div data-flow-tooltip style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 12, fontSize: 11, padding: '6px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)' }}>
          <strong style={{ fontFamily: 'var(--font-mono-fad)' }}>{hovered.month}</strong>
          {visibleSeries.map((s) => (
            <span key={s.key}>
              <span style={{ color: s.color, fontWeight: 600 }}>{s.label}</span>
              <span style={{ marginLeft: 6, color: 'var(--color-text-secondary)' }}>{formatMUR(s.pickMinor(hovered))}</span>
            </span>
          ))}
        </div>
      )}

      {/* Footer totals — only for visible series */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        {visibleSeries.map((s) => (
          <span key={s.key}>
            <strong style={{ color: s.color, fontWeight: 600 }}>{s.label}</strong>
            <span style={{ marginLeft: 6 }}>{formatMUR(s.pickMinor(last))}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function formatMURCompact(minor: number): string {
  const major = minor / 100;
  const sign = major < 0 ? '-' : '';
  const abs = Math.abs(major);
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}k`;
  return `${sign}${abs.toFixed(0)}`;
}

function NewVendorForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (vendor: Vendor) => void }) {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [category, setCategory] = useState<VendorCategory>('general_contractor');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Per engagement');
  const [notes, setNotes] = useState('');
  const canSubmit = name.trim().length > 0;
  return (
    <div
      data-vendors-new-form
      style={{
        background: 'var(--color-background-tertiary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-md)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <label style={leadFieldLabel()}>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vendor / contact name" style={leadInput()} />
        </label>
        <label style={leadFieldLabel()}>
          Company (optional)
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name" style={leadInput()} />
        </label>
        <label style={leadFieldLabel()}>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value as VendorCategory)} style={leadInput()}>
            {VENDOR_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
        <label style={leadFieldLabel()}>
          Phone (optional)
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+230 …" style={leadInput()} />
        </label>
        <label style={leadFieldLabel()}>
          Email (optional)
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="…@example.com" style={leadInput()} />
        </label>
        <label style={leadFieldLabel()}>
          Payment terms
          <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. 50% deposit, milestone-based" style={leadInput()} />
        </label>
      </div>
      <label style={leadFieldLabel()}>
        Notes (optional)
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Engagement style, reliability, anything Friday should remember." style={{ ...leadInput(), resize: 'vertical', minHeight: 50 }} />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          disabled={!canSubmit}
          data-vendors-new-submit
          onClick={() => {
            const input: CreateVendorInput = {
              name: name.trim(),
              company: company.trim() === '' ? null : company.trim(),
              category,
              phone: phone.trim() === '' ? null : phone.trim(),
              email: email.trim() === '' ? null : email.trim(),
              paymentTerms: paymentTerms.trim() || 'Per engagement',
              notes: notes.trim() === '' ? null : notes.trim(),
            };
            onCreated(designClient.vendors.create(input));
          }}
          style={canSubmit ? leadActionBtn('primary') : { ...leadActionBtn('primary'), opacity: 0.5, cursor: 'not-allowed' }}
        >
          Create vendor
        </button>
        <button type="button" onClick={onCancel} style={leadActionBtn('secondary')}>Cancel</button>
      </div>
    </div>
  );
}

function DesignSettings() {
  const role = useCurrentRole();
  const userId = useCurrentUserId();
  const isDirector = role === 'director';
  const [editing, setEditing] = useState(false);
  const [, setRev] = useState(0);
  const bumpRev = () => setRev((r) => r + 1);

  const cfg = designClient.settings.annexA();
  const audit = designClient.settings.annexAAudit();

  // Working copy held in state. Reset whenever entering edit mode so cancel
  // truly reverts.
  const [draft, setDraft] = useState<AnnexAConfig>(() => cloneAnnexA(cfg));

  const startEdit = () => {
    setDraft(cloneAnnexA(cfg));
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
  };
  const saveEdit = () => {
    designClient.settings.updateAnnexA(draft, userId);
    setEditing(false);
    bumpRev();
    fireToast('Annex A schedule saved. Live projects recompute fees on next open.');
  };
  const reset = () => {
    if (!window.confirm('Reset Annex A to codebase defaults? This wipes saved overrides and reloads the page.')) return;
    designClient.settings.resetAnnexA();
    window.location.reload();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }} data-design-settings>
      <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600 }}>Annex A — Pricing schedule</h3>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>
              Default pricing tiers used when generating new agreements. Annex B in each project carries the negotiated overrides.
              {' '}<strong>Edits apply retroactively</strong> — every project's fees are derived live from this schedule.
            </p>
            {audit && (
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                Last changed by <strong>{audit.changedByUserId.replace(/^u-/, '')}</strong> on {audit.changedAt.slice(0, 10)} at {audit.changedAt.slice(11, 16)}
                {' · '}<button type="button" onClick={reset} style={{ background: 'transparent', color: 'var(--color-text-danger)', textDecoration: 'underline', fontSize: 11 }}>reset to defaults</button>
              </div>
            )}
          </div>
          {!editing ? (
            <button
              type="button"
              data-annex-edit-toggle
              disabled={!isDirector}
              title={isDirector ? '' : 'Director-only. View as Director to edit.'}
              onClick={startEdit}
              style={{
                padding: '6px 12px', fontSize: 12, borderRadius: 'var(--radius-sm)', fontWeight: 500,
                background: isDirector ? 'var(--color-brand-accent)' : 'var(--color-background-tertiary)',
                color: isDirector ? '#fff' : 'var(--color-text-tertiary)',
                cursor: isDirector ? 'pointer' : 'not-allowed',
                opacity: isDirector ? 1 : 0.6,
              }}
            >
              Edit
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" data-annex-save onClick={saveEdit} style={{ padding: '6px 12px', fontSize: 12, borderRadius: 'var(--radius-sm)', background: 'var(--color-text-success)', color: '#fff', fontWeight: 500 }}>Save</button>
              <button type="button" onClick={cancelEdit} style={{ padding: '6px 12px', fontSize: 12, borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border-tertiary)' }}>Cancel</button>
            </div>
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 420 }}>
          <tbody>
            <AnnexARow
              label="Tier 3 design fee (EPC < tier-3 ceiling)"
              editing={editing}
              renderView={() => `${formatMUR(cfg.designFee.tier3FlatMinor)} flat`}
              renderEdit={() => <MUInputCell value={draft.designFee.tier3FlatMinor} onChange={(v) => setDraft((d) => ({ ...d, designFee: { ...d.designFee, tier3FlatMinor: v } }))} />}
            />
            <AnnexARow
              label="Tier 2 design fee (between ceilings)"
              editing={editing}
              renderView={() => `${formatMUR(cfg.designFee.tier2FlatMinor)} flat`}
              renderEdit={() => <MUInputCell value={draft.designFee.tier2FlatMinor} onChange={(v) => setDraft((d) => ({ ...d, designFee: { ...d.designFee, tier2FlatMinor: v } }))} />}
            />
            <AnnexARow
              label="Tier 1 design fee (EPC > tier-2 ceiling)"
              editing={editing}
              renderView={() => `${(cfg.designFee.tier1PercentOfEpc * 100).toFixed(2)}% of EPC`}
              renderEdit={() => <PctInputCell value={cfg.designFee.tier1PercentOfEpc} onChange={(v) => setDraft((d) => ({ ...d, designFee: { ...d.designFee, tier1PercentOfEpc: v } }))} valueDraft={draft.designFee.tier1PercentOfEpc} />}
            />
            <AnnexARow
              label="P&E Furnishing — T3 / T2 / T1"
              editing={editing}
              renderView={() => `${(cfg.procurementFurnishing.tier3Pct * 100).toFixed(2)}% / ${(cfg.procurementFurnishing.tier2Pct * 100).toFixed(2)}% / ${(cfg.procurementFurnishing.tier1Pct * 100).toFixed(2)}%`}
              renderEdit={() => (
                <ThreeTierPctRow
                  value={draft.procurementFurnishing}
                  onChange={(v) => setDraft((d) => ({ ...d, procurementFurnishing: v }))}
                />
              )}
            />
            <AnnexARow
              label="P&E Renovation — T3 / T2 / T1"
              editing={editing}
              renderView={() => `${(cfg.procurementRenovation.tier3Pct * 100).toFixed(2)}% / ${(cfg.procurementRenovation.tier2Pct * 100).toFixed(2)}% / ${(cfg.procurementRenovation.tier1Pct * 100).toFixed(2)}%`}
              renderEdit={() => (
                <ThreeTierPctRow
                  value={draft.procurementRenovation}
                  onChange={(v) => setDraft((d) => ({ ...d, procurementRenovation: v }))}
                />
              )}
            />
            <AnnexARow
              label={(
                <>
                  <span style={{ color: 'var(--color-text-warning)' }}>⚠</span> Tier-3 ceiling (Rs)
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 400 }}>
                    Changing this re-tiers existing projects.
                  </div>
                </>
              )}
              editing={editing}
              renderView={() => `${formatMUR(cfg.tierThresholds.tier3MaxMinor)}`}
              renderEdit={() => <MUInputCell value={draft.tierThresholds.tier3MaxMinor} onChange={(v) => setDraft((d) => ({ ...d, tierThresholds: { ...d.tierThresholds, tier3MaxMinor: v } }))} />}
            />
            <AnnexARow
              label={(
                <>
                  <span style={{ color: 'var(--color-text-warning)' }}>⚠</span> Tier-2 ceiling (Rs)
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 400 }}>
                    Changing this re-tiers existing projects.
                  </div>
                </>
              )}
              editing={editing}
              renderView={() => `${formatMUR(cfg.tierThresholds.tier2MaxMinor)}`}
              renderEdit={() => <MUInputCell value={draft.tierThresholds.tier2MaxMinor} onChange={(v) => setDraft((d) => ({ ...d, tierThresholds: { ...d.tierThresholds, tier2MaxMinor: v } }))} />}
            />
            <AnnexARow
              label={(
                <>
                  VAT rate
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 400 }}>
                    Applied on top of all fees. Mauritius default = 15%.
                  </div>
                </>
              )}
              editing={editing}
              renderView={() => `${(cfg.vatRate * 100).toFixed(cfg.vatRate * 100 % 1 === 0 ? 0 : 2)}%`}
              renderEdit={() => (
                <PctInputCell
                  value={cfg.vatRate}
                  valueDraft={draft.vatRate}
                  onChange={(v) => setDraft((d) => ({ ...d, vatRate: v }))}
                />
              )}
            />
            <AnnexARow
              label="Agreement template version"
              editing={editing}
              renderView={() => cfg.agreementTemplateVersion}
              renderEdit={() => (
                <input
                  value={draft.agreementTemplateVersion}
                  onChange={(e) => setDraft((d) => ({ ...d, agreementTemplateVersion: e.target.value }))}
                  style={{ ...leadInput(), textAlign: 'right', fontFamily: 'var(--font-mono-fad)' }}
                />
              )}
            />
          </tbody>
        </table>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
          All rates above are VAT-exclusive. {(cfg.vatRate * 100).toFixed(cfg.vatRate * 100 % 1 === 0 ? 0 : 2)}% VAT is added on top per Mauritius regulations.
        </div>
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
              {(editing ? draft.internalServiceRates : cfg.internalServiceRates).map((r, i) => {
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
                    <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)' }}>
                      {editing && r.rateMinor != null ? (
                        <MUInputCell
                          value={r.rateMinor}
                          onChange={(v) => setDraft((d) => {
                            const rates = [...d.internalServiceRates];
                            rates[i] = { ...rates[i], rateMinor: v };
                            return { ...d, internalServiceRates: rates };
                          })}
                        />
                      ) : (
                        rateText
                      )}
                    </td>
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
      <TierChangeSimulator />
      <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 16 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>ID Standards Book</h3>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>Coming in v0.2 — central library of approved palettes, materials, vendors, and per-room defaults.</p>
      </div>
    </div>
  );
}

// ─────────────────────────── Annex A — edit helpers (cont-28) ───────────────────────────

function cloneAnnexA(cfg: AnnexAConfig): AnnexAConfig {
  // Structured clone — JSON round-trip is fine here since AnnexAConfig is
  // pure-data (no functions, no Dates).
  return JSON.parse(JSON.stringify(cfg)) as AnnexAConfig;
}

function AnnexARow({
  label,
  editing,
  renderView,
  renderEdit,
}: {
  label: React.ReactNode;
  editing: boolean;
  renderView: () => React.ReactNode;
  renderEdit: () => React.ReactNode;
}) {
  return (
    <tr style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
      <td style={cellStyle('left')}>{label}</td>
      <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)' }}>
        {editing ? renderEdit() : renderView()}
      </td>
    </tr>
  );
}

function MUInputCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  // value is in MUR cents; we render the integer-major value to keep edit
  // sane.
  return (
    <input
      inputMode="numeric"
      value={Math.round(value / 100).toString()}
      onChange={(e) => {
        const cleaned = e.target.value.replace(/[^\d]/g, '');
        onChange(cleaned === '' ? 0 : Number(cleaned) * 100);
      }}
      style={{ width: 140, padding: '4px 6px', textAlign: 'right', fontFamily: 'var(--font-mono-fad)', fontSize: 12, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)' }}
    />
  );
}

function PctInputCell({ value, onChange, valueDraft }: { value: number; onChange: (v: number) => void; valueDraft: number }) {
  // Stored as 0-1 fraction; rendered as percentage.
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <input
        inputMode="decimal"
        value={(valueDraft * 100).toFixed(2)}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n / 100);
        }}
        style={{ width: 70, padding: '4px 6px', textAlign: 'right', fontFamily: 'var(--font-mono-fad)', fontSize: 12, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)' }}
      />
      <span style={{ color: 'var(--color-text-tertiary)' }}>%</span>
    </span>
  );
}

function ThreeTierPctRow({ value, onChange }: { value: { tier3Pct: number; tier2Pct: number; tier1Pct: number }; onChange: (v: { tier3Pct: number; tier2Pct: number; tier1Pct: number }) => void }) {
  const pct = (n: number) => (n * 100).toFixed(2);
  const setN = (key: 'tier3Pct' | 'tier2Pct' | 'tier1Pct', n: number) => {
    onChange({ ...value, [key]: n });
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
      <input inputMode="decimal" value={pct(value.tier3Pct)} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) setN('tier3Pct', n / 100); }} style={threePctInput()} />
      <span>/</span>
      <input inputMode="decimal" value={pct(value.tier2Pct)} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) setN('tier2Pct', n / 100); }} style={threePctInput()} />
      <span>/</span>
      <input inputMode="decimal" value={pct(value.tier1Pct)} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) setN('tier1Pct', n / 100); }} style={threePctInput()} />
      <span style={{ color: 'var(--color-text-tertiary)' }}>%</span>
    </span>
  );
}

function threePctInput(): React.CSSProperties {
  return { width: 56, padding: '4px 6px', textAlign: 'right', fontFamily: 'var(--font-mono-fad)', fontSize: 12, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)' };
}

// ─────────────────────────── Tier-change simulator (cont-25 + design-be-20b) ───────────────────────────
//
// Internal demo / scoping aid: type an EPC, see exactly which tier it falls
// into and what Design + Execution fees Friday would charge — both exclusive
// AND inclusive of VAT, because Annex A rates are VAT-exclusive (Mauritius
// 15% added on top). Pure derivation from the published Annex A pricing
// schedule above — no new state, no decisions. Useful for the team when
// scoping a project that's borderline between tiers, and for showing an
// owner "your fee would be X at this EPC."
//
// design-be-20b: six columns instead of three. Each fee surfaces as
// (excl. VAT, incl. VAT) so an owner can read either figure. The combined
// "+ P&E Renovation / + P&E Furnishing" totals are replaced by three
// distinct numbers (Design / Execution / Total) for one selected
// classification — the simulator is a scoping aid, so pick which scope
// is being quoted rather than splaying both side-by-side.

function TierChangeSimulator() {
  const cfg = designClient.settings.annexA();
  const T3_MAX = cfg.tierThresholds.tier3MaxMinor;
  const T2_MAX = cfg.tierThresholds.tier2MaxMinor;
  // Default to the Tier 2 threshold so the simulator opens with a meaningful
  // preview ("at exactly the T2 boundary").
  const [epcMinor, setEpcMinor] = useState<number>(T3_MAX);
  // Renovation is the higher-fee (and more common) classification; default
  // here so the simulator opens with the worst-case quote.
  const [classification, setClassification] = useState<ProjectClassification>('renovation');

  const tier: DesignTier | null = epcMinor > 0 ? tierForEpc(epcMinor, cfg) : null;

  // Fees for the current resolved tier. 'mixed' is priced at the renovation
  // rate per Annex A; procurementFeeForTier handles that internally.
  const currentRow = scenarioRow(tier, epcMinor, classification, cfg);
  const neighbourRows = neighbourTiers(tier).map((nb) => scenarioRow(nb, epcMinor, classification, cfg));
  const vatPct = (cfg.vatRate * 100).toFixed(cfg.vatRate * 100 % 1 === 0 ? 0 : 2);

  return (
    <div
      data-design-tier-simulator
      style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 16 }}
    >
      <h3 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600 }}>Tier-change simulator</h3>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
        Preview Friday fees for any EPC. Useful when a project is borderline between tiers, or when an owner asks
        "what would the fee be at Rs X?" Live derivation from the Annex A schedule above.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          EPC (Rs)
          <input
            inputMode="numeric"
            value={epcMinor === 0 ? '' : Math.round(epcMinor / 100).toString()}
            onChange={(e) => {
              const cleaned = e.target.value.replace(/[^\d]/g, '');
              setEpcMinor(cleaned === '' ? 0 : Number(cleaned) * 100);
            }}
            data-tier-sim-epc
            style={{
              padding: '6px 8px',
              fontSize: 13,
              fontFamily: 'var(--font-mono-fad)',
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-background-tertiary)',
              color: 'var(--color-text-primary)',
            }}
          />
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
            Try: {Math.round(T3_MAX / 100).toLocaleString()} (T3 ceiling) · {Math.round(T2_MAX / 100).toLocaleString()} (T2 ceiling)
          </span>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Classification
          <select
            value={classification}
            onChange={(e) => setClassification(e.target.value as ProjectClassification)}
            data-tier-sim-classification
            style={{
              padding: '6px 8px',
              fontSize: 13,
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-background-tertiary)',
              color: 'var(--color-text-primary)',
            }}
          >
            <option value="renovation">Renovation</option>
            <option value="furnishing">Furnishing</option>
            <option value="mixed">Mixed (priced at renovation rate)</option>
          </select>
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
            Drives the execution-fee %. Mixed = renovation rate.
          </span>
        </label>
        <div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Resolved tier</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--color-brand-accent)', fontFamily: 'var(--font-mono-fad)' }}>
            {tier ? `Tier ${tier}` : '—'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
            {tier === 3 && 'EPC < T3 ceiling. Flat design fee.'}
            {tier === 2 && 'T3 ceiling ≤ EPC ≤ T2 ceiling. Flat design fee.'}
            {tier === 1 && 'EPC > T2 ceiling. Design fee = % of EPC.'}
          </div>
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)' }}>
        {/* minWidth=860 keeps all 7 columns readable (Scenario + 6 numeric × excl/incl
            for Design / Execution / Total). Below that, the parent overflowX:auto
            gives a horizontal scrollbar. Without the larger minWidth, the table
            tries to fit and clips Total + Total+VAT off-screen on standard widths. */}
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 860 }}>
          <thead>
            <tr style={{ color: 'var(--color-text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, background: 'var(--color-background-tertiary)' }}>
              <th style={cellStyle('left')}>Scenario</th>
              <th style={cellStyle('right')}>Design fee</th>
              <th style={cellStyle('right')}>Design +VAT</th>
              <th style={cellStyle('right')}>Execution fee</th>
              <th style={cellStyle('right')}>Execution +VAT</th>
              <th style={cellStyle('right')}>Total fee</th>
              <th style={cellStyle('right')}>Total +VAT</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderTop: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-brand-accent-softer)' }}>
              <td style={cellStyle('left')}>
                <strong>Current — Tier {tier ?? '—'}</strong>
              </td>
              <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)' }}>{formatMUR(currentRow.design)}</td>
              <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)', color: 'var(--color-text-secondary)' }}>{formatMUR(currentRow.designIncl)}</td>
              <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)' }}>{formatMUR(currentRow.execution)}</td>
              <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)', color: 'var(--color-text-secondary)' }}>{formatMUR(currentRow.executionIncl)}</td>
              <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)', fontWeight: 600 }}>{formatMUR(currentRow.total)}</td>
              <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{formatMUR(currentRow.totalIncl)}</td>
            </tr>
            {neighbourRows.map((nb) => (
              <tr key={nb.tier ?? 'unk'} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                <td style={cellStyle('left')}>
                  If reclassified to <strong>Tier {nb.tier}</strong>
                </td>
                <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)' }}>
                  {formatMUR(nb.design)} <DeltaSpan v={nb.design - currentRow.design} />
                </td>
                <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)', color: 'var(--color-text-secondary)' }}>
                  {formatMUR(nb.designIncl)}
                </td>
                <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)' }}>
                  {formatMUR(nb.execution)} <DeltaSpan v={nb.execution - currentRow.execution} />
                </td>
                <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)', color: 'var(--color-text-secondary)' }}>
                  {formatMUR(nb.executionIncl)}
                </td>
                <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)' }}>
                  {formatMUR(nb.total)} <DeltaSpan v={nb.total - currentRow.total} />
                </td>
                <td style={{ ...cellStyle('right'), fontFamily: 'var(--font-mono-fad)', color: 'var(--color-text-secondary)' }}>
                  {formatMUR(nb.totalIncl)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
        All Annex A rates are VAT-exclusive; {vatPct}% VAT added on top per Mauritius regulations.
      </div>
    </div>
  );
}

/** Pure: derive the six-number row for a single scenario (tier + classification + EPC). */
function scenarioRow(
  tier: DesignTier | null,
  epcMinor: number,
  classification: ProjectClassification,
  cfg: AnnexAConfig,
): {
  tier: DesignTier | null;
  design: number;
  designIncl: number;
  execution: number;
  executionIncl: number;
  total: number;
  totalIncl: number;
} {
  if (tier === null) {
    return { tier, design: 0, designIncl: 0, execution: 0, executionIncl: 0, total: 0, totalIncl: 0 };
  }
  const design = designFeeForTier(tier, epcMinor, cfg);
  const execution = procurementFeeForTier(tier, classification, epcMinor, cfg);
  const total = design + execution;
  return {
    tier,
    design,
    designIncl: withVAT(design, cfg),
    execution,
    executionIncl: withVAT(execution, cfg),
    total,
    totalIncl: withVAT(total, cfg),
  };
}

function neighbourTiers(current: DesignTier | null): DesignTier[] {
  if (current === null) return [];
  if (current === 1) return [2, 3];
  if (current === 2) return [1, 3];
  return [2, 1];
}

function DeltaSpan({ v }: { v: number }) {
  if (v === 0) return null;
  const positive = v > 0;
  return (
    <span style={{ marginLeft: 4, fontSize: 10, color: positive ? 'var(--color-text-warning)' : 'var(--color-text-success)' }}>
      ({positive ? '+' : '−'}{formatMUR(Math.abs(v))})
    </span>
  );
}

// ─────────────────────────── Project shell (drill-down) ───────────────────────────

function ProjectShell({
  project: incomingProject,
  screen,
  onChangeScreen,
  onClose,
  onRefetch,
  projectRev,
  openFriday,
}: {
  project: DesignProject;
  screen: ProjectScreen;
  onChangeScreen: (s: ProjectScreen) => void;
  onClose: () => void;
  onRefetch: () => void;
  projectRev: number;
  openFriday?: (scope?: string) => void;
}) {
  const [portalOpen, setPortalOpen] = useState(false);
  const [shareDrawerOpen, setShareDrawerOpen] = useState(false);
  const [lifecycleTick, setLifecycleTick] = useState(0);
  const [showEdit, setShowEdit] = useState(false);
  const role = useCurrentRole();

  // Refresh every per-project fixture (moodboards, payments, agreement,
  // activity, …) when the staff tab regains focus or visibility. This
  // catches asynchronous changes from the owner portal — e.g. a
  // moodboard variant was picked while the staff was in another tab,
  // a magic-link signature was captured — without paying for an
  // always-on poll. Cheap: one fetch per Promise.all per tab-switch.
  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'visible') onRefetch();
    };
    const handleFocus = () => onRefetch();
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handleFocus);
    };
  }, [onRefetch]);
  const isDirector = role === 'director';
  const project = designClient.projects.get(incomingProject.id) ?? incomingProject;
  void lifecycleTick;
  void projectRev;

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

  // design-be-10: stage rewind. Director-only. Surfaces an 18-pill admin
  // strip with reopen buttons on done stages. Lock checks are server-side;
  // a 409 here means a downstream document blocks the rewind.
  const handleReopenStage = async (stageId: StageId) => {
    try {
      await apiReopenStage(project.id, stageId);
      onRefetch();
      fireToast('Stage reopened');
    } catch (e) {
      if (e instanceof StageReopenLockedError) {
        const list = e.lockedBy
          .map((l) => `${l.type} (${l.status})`)
          .join(', ');
        fireToast(`Cannot reopen — locked by: ${list || 'downstream documents'}`);
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        fireToast(`Failed to reopen stage: ${msg}`);
      }
    }
  };

  return (
    <div className="fad-module-body" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ProjectContextBar
        project={project}
        onBack={onClose}
        onOpenOwnerPortal={() => setPortalOpen(true)}
        onOpenShareDrawer={() => setShareDrawerOpen(true)}
        onLifecycleChange={() => { setLifecycleTick((t) => t + 1); onRefetch(); }}
        onEditProject={isDirector ? () => setShowEdit(true) : undefined}
        // Ask Friday is now the global header drawer — it sees from
        // the URL (m=design + pid) that we're on a project shell and
        // automatically routes to the Kimi-backed
        // /api/design/ai/ask endpoint with citations. The previous
        // standalone ProjectAskFridayDrawer has been removed.
        onAskFriday={openFriday ? () => openFriday(`Project: ${project.name}`) : undefined}
      />
      {portalOpen && <OwnerPortalPreview project={project} onClose={() => setPortalOpen(false)} />}
      {shareDrawerOpen && (
        <ShareWithOwnerDrawer project={project} onClose={() => setShareDrawerOpen(false)} />
      )}
      {showEdit && (
        <ProjectEditDrawer
          project={project}
          onSaved={onRefetch}
          onClose={() => setShowEdit(false)}
        />
      )}

      {/* Phase progress strip + 6 phase tabs. The earlier 17-pill stage tracker
          + 14-tab strip is replaced by this single nav. */}
      <PhaseNav
        project={project}
        activePhase={activePhase}
        currentPhase={currentPhase}
        tabs={phaseTabs}
        onSelectPhase={setPhase}
      />

      {/* design-be-10: Director-only stage admin strip — the 18-pill
          StageTracker exposes ↶ reopen buttons on completed stages. */}
      {isDirector && (
        <div style={{ padding: '6px 16px 4px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Stage admin
            {project.engagementScope === 'design_only' && (
              <span
                data-engagement-scope-indicator="design_only"
                style={{ marginLeft: 6, color: 'var(--color-text-secondary)', fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 }}
              >
                · design only — stages 14-17 out of scope
              </span>
            )}
          </div>
          {/* design-be-23: union per-tier + per-engagement-scope optional
             stages so the StageTracker dims execution-phase pills when
             the project is design-only. */}
          <StageTracker
            currentStage={project.currentStage}
            status={project.stageStatus}
            onReopenStage={handleReopenStage}
            optionalStageIds={combinedOptionalStages(project.tier, project.engagementScope)}
          />
        </div>
      )}

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
  const progressPct =
    currentWorkflowIdx < 0 ? 0 : Math.min(100, ((currentWorkflowIdx + 1) / workflowPhases.length) * 100);

  return (
    <div style={{ background: 'var(--color-background-primary)', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
      {/* Thin progress indicator */}
      <div style={{ padding: '10px 16px 6px' }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <span>
            {/* Unified "Stage N of 17 · <label>" framing — the
                previous "Currently in <phase> · <stage>" wording read
                as the cluster name and got out of sync with the
                Procurement & Execution stage cluster (final-budget
                etc. live under the 'design' PHASE tab for navigational
                reasons but in the 'Procurement & Execution' cluster
                visually). Stage index + label is unambiguous. */}
            Stage {stageDef(project.currentStage).index} of 17 · {stageDef(project.currentStage).label}
            {currentPhase !== 'brief' && ` (${stageStatusLabel(project.stageStatus)})`}
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

      {/* Phase tabs — overflowX auto so all 6 fit on narrow mobile via
          horizontal scroll. Right-edge fade (fad-scroll-fade-right) signals
          there's more content. WebkitOverflowScrolling makes the scroll
          momentum-based on iOS. */}
      <div
        role="tablist"
        aria-label="Project phase"
        className="fad-design-phase-tabs"
        style={{ display: 'flex', gap: 4, padding: '4px 8px 6px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
      >
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

  // Local open-set, decoupled from the URL-driven `activeSection`. The URL
  // still drives which section is initially open + auto-opens the new
  // section when the user clicks a phase tab, but inside a phase each
  // section can be expanded/collapsed independently. Without this the
  // section header re-set the same `activeSection` and nothing happened —
  // the only way to "close" the open section was to open a different one.
  const [openSections, setOpenSections] = useState<Set<ProjectScreen>>(() => new Set([activeSection]));

  // When the active section changes externally (phase tab click, deep
  // link, Friday navigation), make sure it ends up open. We don't close
  // the previously-open ones — that matches "multiple can be open at
  // once" UX the user asked for.
  useEffect(() => {
    setOpenSections((prev) => {
      if (prev.has(activeSection)) return prev;
      const next = new Set(prev);
      next.add(activeSection);
      return next;
    });
  }, [activeSection]);

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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {sections.map((sec) => {
        const isOpen = openSections.has(sec);
        return (
          <SectionAccordion
            key={sec}
            project={project}
            section={sec}
            isOpen={isOpen}
            onToggle={() => {
              setOpenSections((prev) => {
                const next = new Set(prev);
                if (next.has(sec)) {
                  next.delete(sec);
                } else {
                  next.add(sec);
                  // Sync the URL when the user opens a section — keeps
                  // deep links + Ask Friday "open <stage>" working as
                  // before.
                  onChangeSection(sec);
                }
                return next;
              });
            }}
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
 * Doc-types from DOC_REQUEST_CHECKLIST that are marked required. Kept
 * in sync with the source list in DocRequestStage.tsx. Used by
 * sectionStatus() to surface "X gaps" on the Done pill when the
 * project is positionally past doc-request but required docs were
 * never collected.
 */
const DOC_REQUEST_REQUIRED_TYPES = ['owner-id', 'property-title', 'epc-certificate', 'floor-plan-as-built'];

function docRequestGapCount(project: DesignProject): number {
  const docs = designClient.documents.list(project.id);
  return DOC_REQUEST_REQUIRED_TYPES.filter((t) => !docs.some((d) => d.type === t)).length;
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

  // Helper: positionally past doc-request but required docs missing →
  // "Done · N gaps" in warning tone so the outer pill stops contradicting
  // the inner "X required missing" warning.
  const doneOrGap = (): SectionStatusBadge => {
    if (section === 'doc-request') {
      const gaps = docRequestGapCount(project);
      if (gaps > 0) {
        return { label: `Done · ${gaps} gap${gaps === 1 ? '' : 's'}`, bg: 'var(--color-bg-warning)', color: 'var(--color-text-warning)' };
      }
    }
    return { label: 'Done', bg: 'var(--color-bg-success)', color: 'var(--color-text-success)' };
  };

  if (phaseIdx < currentIdx) {
    return doneOrGap();
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
    return doneOrGap();
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
    case 'doc-request':
      return <DocRequestStage project={project} />;
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
    case 'floor-plan':
      return <FloorPlanStage project={project} />;
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
    case 'expense-capture':
      return <ExpenseCaptureStage project={project} />;
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
  // Wave C2: CIA panel is Mauritius-specific. Other tenants don't see it
  // even if a project's `cia_*` fields are populated (e.g., a project
  // migrated from another tenant); we'll add region-specific panels as
  // those compliance regimes come online.
  const tenantCountry = useTenantCountry();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* W6 — CIA Mauritius compliance check. Renders at the top of
         the overview when registration is required AND not yet
         confirmed; collapses to a muted "not required" tile otherwise.
         The team can update status / paste registration ref inline.
         Wave C2: gated on tenant.country === 'MU'. */}
      {tenantCountry === 'MU' && (requiresCiaRegistration(project).required ||
        ((project as DesignProject & { ciaRegistrationStatus?: string }).ciaRegistrationStatus &&
         (project as DesignProject & { ciaRegistrationStatus?: string }).ciaRegistrationStatus !== 'unknown')) && (
        <CiaCompliancePanel project={project} />
      )}

      {/* design-be-18: top-of-overview Blockers + Next actions panels.
         Replaces the single-line Blocker / Next action rows previously
         buried in the Summary card with proper multi-item task lists. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 12 }}>
        <BlockersPanel project={project} />
        <NextActionsPanel project={project} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600 }}>Summary</h3>
          <SummaryRow label="Counterparty"  value={cp?.fullName ?? '—'} />
          <SummaryRow label="Property"      value={prop?.name ?? '—'} />
          <SummaryRow label="Classification" value={project.classification} />
          <SummaryRow label="Tier"          value={project.tier ? `Tier ${project.tier}` : '—'} />
          <SummaryRow label="EPC"           value={formatMUR(project.epcMinor)} />
          <FeeSummaryRow label="Design fee"    minor={project.designFeeMinor} />
          {/* design-be-23: under design_only the execution fee is not
             charged (procurement out of scope). Render an em-dash row
             with a "(design only)" subtext instead of zero. */}
          {project.engagementScope === 'design_only' ? (
            <FeeSummaryRow
              label="Execution fee"
              minor={null}
              subtext="(design only)"
              testId="fee-execution-design-only"
            />
          ) : (
            <FeeSummaryRow label="Execution fee" minor={project.procurementFeeMinor} />
          )}
          <FeeSummaryRow
            label="Total fee"
            minor={(project.designFeeMinor == null && project.procurementFeeMinor == null)
              ? null
              : project.engagementScope === 'design_only'
                ? (project.designFeeMinor ?? 0)
                : (project.designFeeMinor ?? 0) + (project.procurementFeeMinor ?? 0)}
            strong
          />
          <div style={{ marginTop: 2, marginBottom: 4, fontSize: 10, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
            Annex A is VAT-exclusive; {(designClient.settings.annexA().vatRate * 100).toFixed(designClient.settings.annexA().vatRate * 100 % 1 === 0 ? 0 : 2)}% VAT added on top.
          </div>
          <SummaryRow label="Start"         value={formatProjectDate(project.startDate)} />
          <SummaryRow label="Est. completion" value={formatProjectDate(project.estimatedCompletion)} />
          <SummaryRow label="Design lead"   value={project.designLeadUserId?.replace('u-', '') ?? '—'} />
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

// design-be-20d: fee row that shows excl-VAT + incl-VAT amounts side-by-side.
// `null` minor renders as '—' on both columns.
// design-be-23: optional `subtext` shows below the label (e.g. "(design only)"
// when execution is out of scope and the minor is null).
function FeeSummaryRow({
  label,
  minor,
  strong,
  subtext,
  testId,
}: {
  label: string;
  minor: number | null;
  strong?: boolean;
  subtext?: string;
  testId?: string;
}) {
  const inclLabel = minor == null ? '—' : `${formatMUR(withVAT(minor))} incl. VAT`;
  return (
    <div
      data-testid={testId}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', fontSize: 12, borderBottom: '0.5px dashed var(--color-border-tertiary)', gap: 8 }}
    >
      <span style={{ color: 'var(--color-text-tertiary)' }}>
        {label}
        {subtext && (
          <span style={{ marginLeft: 6, color: 'var(--color-text-tertiary)', fontStyle: 'italic', fontSize: 11 }}>
            {subtext}
          </span>
        )}
      </span>
      <span style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
        <span style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono-fad)', fontWeight: strong ? 600 : 400 }}>
          {formatMUR(minor)}
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono-fad)' }}>
          {inclLabel}
        </span>
      </span>
    </div>
  );
}
