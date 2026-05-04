'use client';

import { useMemo } from 'react';
import {
  designClient,
  formatMUR,
  stageDef,
  type DesignProject,
} from '../../../_data/design';

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
 * Composes the Overview side panels: a one-line portfolio summary + the
 * role-aware Needs Attention queue. The earlier "Pipeline by stage" chart
 * was dropped (cont-9 audit) — with 6 projects across 17 stages the chart
 * was almost entirely empty bars. The All Projects table covers the same
 * information density without the dead pixels.
 */
export function OverviewExtras({ projects, role, onOpenProject }: Props) {
  return (
    <NeedsAttentionQueue
      projects={projects}
      role={role}
      onOpenProject={onOpenProject}
    />
  );
}

// ─────────────────────────── Portfolio summary ───────────────────────────

/**
 * Plain one-liner summary of the active portfolio. No card, no AI framing —
 * just the data sentence. Cont-9 audit: the previous "Friday's read on the
 * portfolio" card padded the page with meta-copy ("AI summary — refreshes
 * when projects change…") that wasn't itself information. Drop the framing,
 * keep the line.
 *
 * @demo:ai — when v0.2 lands, swap this useMemo for an LLM-rendered narrative
 * pulled from the activity log. Tag: PROD-DESIGN-AI / overview-analysis.
 */
export function OverviewSummaryLine({ projects }: { projects: DesignProject[] }) {
  const summary = useMemo(() => {
    const active = projects.filter((p) => p.lifecycleStatus === 'active');
    if (active.length === 0) return 'No active projects.';
    const totalEpc = active.reduce((s, p) => s + (p.epcMinor ?? 0), 0);
    const blocked = active.filter((p) => p.blocker).length;
    const tier1 = active.filter((p) => p.tier === 1).length;
    const tail = blocked > 0 ? `${blocked} blocked, owner action needed` : 'pipeline healthy';
    return `${active.length} active project${active.length === 1 ? '' : 's'} · ${formatMUR(totalEpc)} EPC · ${tier1} at Tier 1 · ${tail}.`;
  }, [projects]);

  return (
    <p
      data-ai-feature="overview-analysis"
      style={{
        margin: 0,
        fontSize: 13,
        color: 'var(--color-text-secondary)',
        lineHeight: 1.5,
      }}
    >
      {summary}
    </p>
  );
}

// ─────────────────────────── Needs attention queue ───────────────────────────

export function NeedsAttentionQueue({
  projects,
  role,
  onOpenProject,
}: {
  projects: DesignProject[];
  role: string;
  onOpenProject: (id: string, screen?: string) => void;
}) {
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
        Filtered to your role. Click any row to open the project.
      </p>
      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          Nothing waiting on you. Pipeline clean.
        </p>
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
              <div style={{ fontSize: 12, fontWeight: 600, color: textForTone(it.tone) }}>
                {it.label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                {it.projectName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                {it.hint}
              </div>
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
