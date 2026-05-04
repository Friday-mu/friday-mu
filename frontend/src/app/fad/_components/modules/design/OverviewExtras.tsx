'use client';

import { useMemo } from 'react';
import {
  designClient,
  formatMUR,
  STAGES,
  stageDef,
  type DesignProject,
  type StageId,
} from '../../../_data/design';
import { AIPlaceholder } from './AIPlaceholder';

interface NeedsAttentionItem {
  id: string;
  projectId: string;
  projectName: string;
  label: string;
  hint: string;
  tone: 'warning' | 'danger' | 'info' | 'accent';
}

interface Props {
  projects: DesignProject[];
  role: string;
  onOpenProject: (id: string, screen?: string) => void;
}

/**
 * Three additions to the Design module Overview, requested 2026-05-04.
 *
 *  1. StagePipelineChart — pure-SVG stacked bar showing how many active
 *     projects sit at each stage. Visual at-a-glance pipeline health.
 *  2. AIAnalysisCard — placeholder for the v0.2 LLM-backed portfolio summary
 *     ("Friday's read on the portfolio"). Carries data-ai-feature for the
 *     wiring sprint to attach.
 *  3. NeedsAttentionQueue — role-aware list of actions Friday should take
 *     today (pending sends, awaiting payments, blockers). Computed from
 *     real project state so it's accurate without a server fan-out.
 */
export function OverviewExtras({ projects, role, onOpenProject }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AIAnalysisCard projects={projects} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 16, alignItems: 'start' }}>
        <StagePipelineChart projects={projects} />
        <NeedsAttentionQueue projects={projects} role={role} onOpenProject={onOpenProject} />
      </div>
    </div>
  );
}

// ─────────────────────────── AI analysis ───────────────────────────

function AIAnalysisCard({ projects }: { projects: DesignProject[] }) {
  const active = projects.filter((p) => p.lifecycleStatus === 'active');
  const totalEpc = active.reduce((s, p) => s + (p.epcMinor ?? 0), 0);
  const blocked = active.filter((p) => p.blocker).length;
  const tier1Count = active.filter((p) => p.tier === 1).length;
  // @demo:ai — Tag: PROD-DESIGN-AI / overview-analysis. v0.2 swaps this with
  // an LLM call whose prompt anchors are in build doc §5.2.
  const summary = active.length === 0
    ? 'No active projects to analyse yet.'
    : `${active.length} active project${active.length === 1 ? '' : 's'} representing ${formatMUR(totalEpc)} EPC. ${tier1Count} at Tier 1${blocked ? ` · ${blocked} blocked, owner action needed` : ' · pipeline healthy'}.`;
  return (
    <div style={cardStyle()} data-ai-feature="overview-analysis">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Friday&apos;s read on the portfolio</h3>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            AI summary — refreshes when projects change. The wiring sprint connects this to a live LLM run.
          </p>
        </div>
        <AIPlaceholder feature="overview-analysis" label="Refresh analysis" size="sm" />
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
        {summary}
      </p>
    </div>
  );
}

// ─────────────────────────── Stage pipeline chart ───────────────────────────

function StagePipelineChart({ projects }: { projects: DesignProject[] }) {
  const counts = useMemo(() => {
    const active = projects.filter((p) => p.lifecycleStatus === 'active');
    const map = new Map<StageId, number>();
    for (const s of STAGES) map.set(s.id, 0);
    for (const p of active) map.set(p.currentStage, (map.get(p.currentStage) ?? 0) + 1);
    return STAGES.map((s) => ({ stage: s, count: map.get(s.id) ?? 0 }));
  }, [projects]);

  const maxCount = Math.max(1, ...counts.map((c) => c.count));
  const width = 340;
  const height = 160;
  const barWidth = width / counts.length;

  return (
    <div style={cardStyle()}>
      <h3 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600 }}>Pipeline by stage</h3>
      <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        Active projects at each of the 17 stages. Hover or tap a bar for stage label.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <svg
          role="img"
          aria-label="Stage pipeline chart"
          width={width}
          height={height + 28}
          style={{ display: 'block', minWidth: width }}
        >
          {counts.map((c, i) => {
            const barH = c.count === 0 ? 2 : (c.count / maxCount) * height;
            const x = i * barWidth + 2;
            const y = height - barH;
            const w = barWidth - 4;
            const fill = c.count === 0
              ? 'var(--color-background-tertiary)'
              : 'var(--color-brand-accent)';
            return (
              <g key={c.stage.id}>
                <title>{`${c.stage.index}. ${c.stage.label} — ${c.count} project${c.count === 1 ? '' : 's'}`}</title>
                <rect x={x} y={y} width={w} height={barH} fill={fill} rx={2} />
                {c.count > 0 && (
                  <text
                    x={x + w / 2}
                    y={y - 4}
                    textAnchor="middle"
                    fill="var(--color-text-secondary)"
                    fontSize={10}
                    fontFamily="var(--font-mono-fad)"
                  >
                    {c.count}
                  </text>
                )}
                <text
                  x={x + w / 2}
                  y={height + 14}
                  textAnchor="middle"
                  fill="var(--color-text-tertiary)"
                  fontSize={9}
                  fontFamily="var(--font-mono-fad)"
                >
                  {c.stage.index}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ─────────────────────────── Needs attention queue ───────────────────────────

function NeedsAttentionQueue({ projects, role, onOpenProject }: { projects: DesignProject[]; role: string; onOpenProject: (id: string, screen?: string) => void }) {
  const items = useMemo(() => {
    const active = projects.filter((p) => p.lifecycleStatus === 'active');
    const out: NeedsAttentionItem[] = [];

    // 1. Blockers — visible to all roles; the director and design-leads usually act on these.
    for (const p of active) {
      if (p.blocker) {
        out.push({
          id: `block-${p.id}`,
          projectId: p.id,
          projectName: p.name,
          label: 'Blocker — needs unblock',
          hint: p.blocker,
          tone: 'danger',
        });
      }
    }

    // 2. Awaiting payment gates — director only (B3.11 single approver).
    if (role === 'director') {
      for (const p of active) {
        const gates = designClient.payments.list(p.id);
        for (const g of gates) {
          if (g.status === 'awaiting') {
            out.push({
              id: `pay-${g.id}-${p.id}`,
              projectId: p.id,
              projectName: p.name,
              label: `Mark received — ${g.label}`,
              hint: g.amountMinor ? `Bank transfer · ${formatMUR(g.amountMinor)}` : 'Confirm receipt',
              tone: 'warning',
            });
          }
        }
      }
    }

    // 3. Sent agreements awaiting client signature — director.
    if (role === 'director') {
      for (const p of active) {
        const ag = designClient.agreement.get(p.id);
        if (ag && (ag.status === 'sent' || ag.status === 'viewed_by_client')) {
          const ageDays = ag.sentAt ? Math.floor((Date.now() - new Date(ag.sentAt).getTime()) / 86_400_000) : 0;
          if (ageDays >= 7) {
            out.push({
              id: `sig-${p.id}`,
              projectId: p.id,
              projectName: p.name,
              label: 'Agreement signature overdue',
              hint: `Sent ${ageDays} days ago, not yet signed.`,
              tone: 'warning',
            });
          }
        }
      }
    }

    // 4. Pending owner approvals — visible to design leads (they push for resolution).
    if (role === 'director' || role === 'design_lead_internal' || role === 'design_lead_external') {
      for (const p of active) {
        const apps = designClient.approvals.list(p.id);
        const pendingCount = apps.filter((a) => a.state === 'sent').length;
        if (pendingCount > 0) {
          out.push({
            id: `app-${p.id}`,
            projectId: p.id,
            projectName: p.name,
            label: `${pendingCount} owner approval${pendingCount === 1 ? '' : 's'} awaiting`,
            hint: 'Owner has not yet decided.',
            tone: 'info',
          });
        }
      }
    }

    // 5. Stage waiting-on-owner — universal hint.
    for (const p of active) {
      if (p.stageStatus === 'waiting-on-owner') {
        const next = p.nextAction ? `Next: ${p.nextAction}` : 'Owner action pending.';
        out.push({
          id: `wait-${p.id}`,
          projectId: p.id,
          projectName: p.name,
          label: `${stageDef(p.currentStage).label} — waiting on owner`,
          hint: next,
          tone: 'accent',
        });
      }
    }

    return out.slice(0, 8);
  }, [projects, role]);

  return (
    <div style={cardStyle()}>
      <h3 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600 }}>Needs attention</h3>
      <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        Items derived from current project state. Filtered to your role.
      </p>
      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>Nothing waiting on you. Pipeline clean.</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((it) => (
            <li
              key={it.id}
              style={{
                padding: 8,
                border: `0.5px solid ${borderForTone(it.tone)}`,
                background: bgForTone(it.tone),
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
              }}
              onClick={() => onOpenProject(it.projectId)}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: textForTone(it.tone) }}>{it.label}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>{it.projectName}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{it.hint}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────── style helpers ───────────────────────────

function cardStyle(): React.CSSProperties {
  return {
    background: 'var(--color-background-primary)',
    border: '0.5px solid var(--color-border-tertiary)',
    borderRadius: 'var(--radius-md)',
    padding: 14,
    minWidth: 0,
  };
}
function bgForTone(t: NeedsAttentionItem['tone']): string {
  return t === 'danger' ? 'var(--color-bg-danger)'
    : t === 'warning' ? 'var(--color-bg-warning)'
    : t === 'info' ? 'var(--color-bg-info)'
    : 'var(--color-brand-accent-soft)';
}
function borderForTone(t: NeedsAttentionItem['tone']): string {
  return t === 'danger' ? 'var(--color-bg-danger)'
    : t === 'warning' ? 'var(--color-bg-warning)'
    : t === 'info' ? 'var(--color-bg-info)'
    : 'var(--color-brand-accent-soft)';
}
function textForTone(t: NeedsAttentionItem['tone']): string {
  return t === 'danger' ? 'var(--color-text-danger)'
    : t === 'warning' ? 'var(--color-text-warning)'
    : t === 'info' ? 'var(--color-text-info)'
    : 'var(--color-brand-accent)';
}
