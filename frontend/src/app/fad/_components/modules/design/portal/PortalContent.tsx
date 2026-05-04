'use client';

import { useState } from 'react';
import { designClient, type DesignProject } from '../../../../_data/design';
import { OverviewTab } from './OverviewTab';
import { DocsTab } from './DocsTab';
import { ApprovalsTab } from './ApprovalsTab';
import { BudgetTab } from './BudgetTab';
import { ProgressTab } from './ProgressTab';
import { HandoverTab } from './HandoverTab';
import { PORTAL_TABS, type PortalTab } from './types';

interface Props {
  project: DesignProject;
  /** Optional initial tab (e.g. ?tab=approvals deep link). Defaults to 'overview'. */
  initialTab?: PortalTab;
}

export function PortalContent({ project, initialTab = 'overview' }: Props) {
  const [tab, setTab] = useState<PortalTab>(initialTab);

  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);
  const approvals = designClient.approvals.list(project.id);
  const docs = designClient.documents
    .list(project.id)
    .filter((d) => d.audience === 'owner' && d.status !== 'not_yet');
  const photos = designClient.photos.list(project.id).filter((p) => p.ownerVisible);
  const items = designClient.budgetItems.listForOwner(project.id);

  const firstName = counterparty?.fullName?.split(' ')[0] ?? '';
  const designLeadLabel = friendlyDesignLead(project.designLeadUserId);
  const pendingApprovalCount = approvals.filter((a) => a.state === 'sent').length;

  const tabLabels: Record<PortalTab, string> = {
    overview: 'Overview',
    documents: docs.length > 0 ? `Documents (${docs.length})` : 'Documents',
    approvals:
      pendingApprovalCount > 0 ? `Approvals (${pendingApprovalCount})` : 'Approvals',
    budget: 'Budget',
    progress: 'Progress',
    handover: 'Final handover',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          padding: '20px 24px',
          background: 'var(--color-background-primary)',
          borderBottom: '0.5px solid var(--color-border-tertiary)',
        }}
      >
        {firstName && (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>
            Hi {firstName} —
          </div>
        )}
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--font-friday-fad)',
            fontSize: 22,
            fontWeight: 500,
          }}
        >
          {project.name}
        </h2>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>
          {property?.name}
          {designLeadLabel && (
            <>
              {' · '}Your Friday lead: <strong>{designLeadLabel}</strong>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Owner portal sections"
        style={{
          display: 'flex',
          gap: 8,
          padding: '8px 16px',
          background: 'var(--color-background-primary)',
          borderBottom: '0.5px solid var(--color-border-tertiary)',
          overflowX: 'auto',
        }}
      >
        {PORTAL_TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            data-portal-tab={t}
            onClick={() => setTab(t)}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              borderRadius: 'var(--radius-sm)',
              background: tab === t ? 'var(--color-brand-accent-soft)' : 'transparent',
              color: tab === t ? 'var(--color-brand-accent)' : 'var(--color-text-secondary)',
              fontWeight: tab === t ? 600 : 500,
              whiteSpace: 'nowrap',
            }}
          >
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {tab === 'overview' && (
          <OverviewTab project={project} approvals={approvals} docs={docs} />
        )}
        {tab === 'documents' && <DocsTab docs={docs} />}
        {tab === 'approvals' && <ApprovalsTab approvals={approvals} />}
        {tab === 'budget' && <BudgetTab items={items} />}
        {tab === 'progress' && <ProgressTab project={project} photos={photos} />}
        {tab === 'handover' && <HandoverTab project={project} />}
      </div>
    </div>
  );
}

/** Maps internal user IDs to a humane label for the owner-facing portal. */
function friendlyDesignLead(userId: string | null): string | null {
  if (!userId) return null;
  // Drop the `u-` prefix and `-ext` suffix; capitalise.
  const base = userId.replace(/^u-/, '').replace(/-ext$/, '');
  return base.charAt(0).toUpperCase() + base.slice(1);
}
