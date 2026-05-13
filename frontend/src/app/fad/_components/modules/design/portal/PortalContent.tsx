'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  designClient,
  type ChangeOrder,
  type DesignApproval,
  type DesignProject,
  type DesignSelection,
} from '../../../../_data/design';
import { OverviewTab } from './OverviewTab';
import { AgreementTab } from './AgreementTab';
import { DocsTab } from './DocsTab';
import { ApprovalsTab } from './ApprovalsTab';
import { ActivityTab } from './ActivityTab';
import { BudgetTab } from './BudgetTab';
import { ProgressTab } from './ProgressTab';
import { HandoverTab } from './HandoverTab';
import { MoodboardVariantsCard } from './MoodboardVariantsCard';
import { RequestChangesModal } from './RequestChangesModal';
import { getLastSeen, isNewSince, markSeen } from './lastSeen';
import { PORTAL_TABS, type PortalTab } from './types';

interface Props {
  project: DesignProject;
  /** Optional initial tab (e.g. ?tab=approvals deep link). Defaults to 'overview'. */
  initialTab?: PortalTab;
  /**
   * Magic-link session id (jti claim). Forwarded to approvals.respond() so the
   * audit trail ties decisions back to the link the owner clicked.
   * Defaults to a `preview-session` sentinel for the in-FAD modal preview.
   */
  portalSession?: string;
  /**
   * When set, renders a "Back to login" affordance in the project header.
   * The standalone /portal/projects/[slug] route wires this to clear the
   * portal token and bounce to /portal/auth; the in-FAD preview omits it.
   */
  onBackToLogin?: () => void;
}

export function PortalContent({
  project,
  initialTab = 'overview',
  portalSession = 'preview-session',
  onBackToLogin,
}: Props) {
  const [tab, setTab] = useState<PortalTab>(initialTab);

  // Local mirror so optimistic responds re-render immediately without bouncing
  // off a fetched list. APPROVALS is module-state in v0.1; v0.2 swaps for a
  // refetch.
  const [approvals, setApprovals] = useState<DesignApproval[]>(() =>
    designClient.approvals.list(project.id),
  );
  const [selections, setSelections] = useState<DesignSelection[]>(() =>
    designClient.selections.list(project.id),
  );
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>(() =>
    designClient.changeOrders.list(project.id),
  );
  const [pendingChanges, setPendingChanges] = useState<DesignApproval | null>(null);
  const [pendingCoReject, setPendingCoReject] = useState<ChangeOrder | null>(null);
  // W9 — moodboards aren't otherwise loaded in this scope; we need
  // them to render the variant picker when there's a pending group.
  const [moodboardsRev, setMoodboardsRev] = useState(0);
  const moodboards = (() => { void moodboardsRev; return designClient.moodboards.list(project.id); })();

  const refreshApprovals = () => {
    setApprovals(designClient.approvals.list(project.id));
  };
  const refreshSelections = () => {
    setSelections(designClient.selections.list(project.id));
  };
  const refreshChangeOrders = () => {
    setChangeOrders(designClient.changeOrders.list(project.id));
  };

  const handlePickSelectionOption = (selectionId: string, optionId: string) => {
    designClient.selections.pick(selectionId, { optionId });
    refreshSelections();
  };

  const handleApproveChangeOrder = (coId: string) => {
    designClient.changeOrders.approve(coId, {});
    refreshChangeOrders();
  };

  const handleRejectChangeOrderSubmit = (comment: string) => {
    if (!pendingCoReject) return;
    designClient.changeOrders.reject(pendingCoReject.id, comment);
    setPendingCoReject(null);
    refreshChangeOrders();
  };

  const handleApprove = (approvalId: string) => {
    designClient.approvals.respond(approvalId, {
      decision: 'approved',
      comment: null,
      portalSession,
    });
    refreshApprovals();
  };

  const handleRequestChangesSubmit = (comment: string) => {
    if (!pendingChanges) return;
    designClient.approvals.respond(pendingChanges.id, {
      decision: 'revision_requested',
      comment,
      portalSession,
    });
    setPendingChanges(null);
    refreshApprovals();
  };

  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);
  const docs = designClient.documents
    .list(project.id)
    .filter((d) => d.audience === 'owner' && d.status !== 'not_yet');
  const photos = designClient.photos.list(project.id).filter((p) => p.ownerVisible);
  const items = designClient.budgetItems.listForOwner(project.id);

  const firstName = counterparty?.fullName?.split(' ')[0] ?? '';
  const designLeadLabel = friendlyDesignLead(project.designLeadUserId);
  const pendingApprovalCount = approvals.filter((a) => a.state === 'sent').length;
  const pendingSelectionCount = selections.filter((s) => s.state === 'sent').length;
  const pendingChangeOrderCount = changeOrders.filter((c) => c.state === 'sent').length;
  const totalPendingActions = pendingApprovalCount + pendingSelectionCount + pendingChangeOrderCount;

  // Pull the agreement so the Agreement tab can highlight "ready to sign"
  // in its label without the tab having to fetch its own.
  const agreement = designClient.agreement.get(project.id);
  const agreementNeedsAction = agreement && (agreement.status === 'sent' || agreement.status === 'viewed_by_client');

  const tabLabels: Record<PortalTab, string> = {
    overview: 'Overview',
    agreement: agreementNeedsAction ? 'Agreement · sign' : agreement?.status === 'signed_by_client' || agreement?.status === 'completed' ? 'Agreement ✓' : 'Agreement',
    documents: docs.length > 0 ? `Documents (${docs.length})` : 'Documents',
    approvals:
      totalPendingActions > 0 ? `Approvals (${totalPendingActions})` : 'Approvals',
    budget: 'Budget',
    progress: 'Progress',
    activity: 'Activity',
    handover: 'Final handover',
  };

  const activityEntries = designClient.activity.listForOwner(project.id);

  // ─── what's new since last visit (cont-22, moat #5) ─────────────────────
  // Compute per-tab "newness" against the persisted last-seen timestamp
  // for each tab. The currently-active tab is always treated as seen so
  // the badge for it doesn't flash on entry.
  const newCounts = useMemo<Record<PortalTab, number>>(() => {
    const since = (t: PortalTab) => (t === tab ? new Date().toISOString() : getLastSeen(project.slug, t));
    const binder = designClient.binder.get(project.id);
    return {
      overview: 0,
      agreement: agreementNeedsAction ? 1 : 0,
      documents: docs.filter((d) => isNewSince(d.generatedAt, since('documents'))).length,
      approvals:
        approvals.filter((a) => isNewSince(a.sentAt, since('approvals'))).length +
        selections.filter((s) => isNewSince(s.sentAt, since('approvals'))).length +
        changeOrders.filter((c) => isNewSince(c.sentAt, since('approvals'))).length,
      budget: 0,
      progress: photos.filter((p) => isNewSince(p.uploadedAt, since('progress'))).length,
      activity: activityEntries.filter((a) => isNewSince(a.at, since('activity'))).length,
      handover: binder && isNewSince(binder.sentAt, since('handover')) ? 1 : 0,
    };
  }, [project.id, project.slug, tab, approvals, selections, changeOrders, docs, photos, activityEntries]);

  // Mark the active tab as seen on mount + whenever it changes. Persists
  // the timestamp for the next visit; the active tab itself reads as 0
  // via the active-tab branch in `since()` above.
  useEffect(() => {
    markSeen(project.slug, tab);
  }, [project.slug, tab]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '20px 24px',
          background: 'var(--color-background-primary)',
          borderBottom: '0.5px solid var(--color-border-tertiary)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
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
        {onBackToLogin && (
          <button
            type="button"
            data-portal-back-to-login
            onClick={onBackToLogin}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              borderRadius: 'var(--radius-sm)',
              border: '0.5px solid var(--color-border-tertiary)',
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Back to login
          </button>
        )}
      </div>

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
        {PORTAL_TABS.map((t) => {
          const newCount = newCounts[t];
          const showDot = newCount > 0;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              data-portal-tab={t}
              data-portal-tab-new={showDot ? newCount : undefined}
              onClick={() => setTab(t)}
              style={{
                padding: '6px 14px',
                fontSize: 12,
                borderRadius: 'var(--radius-sm)',
                background: tab === t ? 'var(--color-brand-accent-soft)' : 'transparent',
                color: tab === t ? 'var(--color-brand-accent)' : 'var(--color-text-secondary)',
                fontWeight: tab === t ? 600 : 500,
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
              aria-label={showDot ? `${tabLabels[t]} (${newCount} new since last visit)` : tabLabels[t]}
            >
              {tabLabels[t]}
              {showDot && (
                <span
                  aria-hidden
                  title={`${newCount} new since your last visit`}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--color-text-success)',
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {tab === 'overview' && (
          <OverviewTab
            project={project}
            approvals={approvals}
            docs={docs}
            onApprove={handleApprove}
            onRequestChanges={setPendingChanges}
          />
        )}
        {tab === 'agreement' && (
          <AgreementTab
            project={project}
            agreement={agreement}
            onSigned={() => {
              // Force the fixture re-read so the label flips to "Agreement ✓"
              // on the next render. The signed agreement row is pushed by
              // hydration on the next project load; for in-session UX we
              // just bump the seen-state cache so the badge clears.
              markSeen(project.slug, 'agreement');
            }}
          />
        )}
        {tab === 'documents' && <DocsTab docs={docs} />}
        {tab === 'approvals' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* W9 — variant picker, shown above other approvals when
                a moodboard variant group is pending. After picking,
                the staff side gets a 'moodboard.variant.picked.by_owner'
                activity event; we bump the local rev so this card
                refreshes (and disappears once all groups are decided). */}
            <MoodboardVariantsCard
              moodboards={moodboards}
              onPicked={() => setMoodboardsRev((r) => r + 1)}
            />
            <ApprovalsTab
              approvals={approvals}
              selections={selections}
              changeOrders={changeOrders}
              onApprove={handleApprove}
              onRequestChanges={setPendingChanges}
              onPickSelectionOption={handlePickSelectionOption}
              onApproveChangeOrder={handleApproveChangeOrder}
              onRejectChangeOrder={setPendingCoReject}
            />
          </div>
        )}
        {tab === 'budget' && <BudgetTab items={items} />}
        {tab === 'progress' && <ProgressTab project={project} photos={photos} />}
        {tab === 'activity' && <ActivityTab project={project} />}
        {tab === 'handover' && <HandoverTab project={project} />}
      </div>

      {pendingChanges && (
        <RequestChangesModal
          approvalLabel={pendingChanges.artifactType.replace(/_/g, ' ')}
          onCancel={() => setPendingChanges(null)}
          onSubmit={handleRequestChangesSubmit}
        />
      )}

      {pendingCoReject && (
        <RequestChangesModal
          approvalLabel={`change order ${pendingCoReject.number}`}
          onCancel={() => setPendingCoReject(null)}
          onSubmit={handleRejectChangeOrderSubmit}
        />
      )}
    </div>
  );
}

function friendlyDesignLead(userId: string | null): string | null {
  if (!userId) return null;
  const base = userId.replace(/^u-/, '').replace(/-ext$/, '');
  return base.charAt(0).toUpperCase() + base.slice(1);
}
