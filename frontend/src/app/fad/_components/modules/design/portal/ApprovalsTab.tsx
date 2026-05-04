'use client';

import { useMemo, useState } from 'react';
import {
  formatMUR,
  type DesignApproval,
  type DesignSelection,
} from '../../../../_data/design';

interface Props {
  approvals: DesignApproval[];
  selections: DesignSelection[];
  onApprove: (approvalId: string) => void;
  onRequestChanges: (approval: DesignApproval) => void;
  onPickSelectionOption: (selectionId: string, optionId: string) => void;
}

const PAST_DECISION_DAYS = 14;
const PAST_DECISION_MS = PAST_DECISION_DAYS * 24 * 60 * 60 * 1000;

export function ApprovalsTab({ approvals, selections, onApprove, onRequestChanges, onPickSelectionOption }: Props) {
  const [showPast, setShowPast] = useState(false);
  const groups = useMemo(() => groupApprovals(approvals), [approvals]);
  const pendingSelections = useMemo(() => selections.filter((s) => s.state === 'sent'), [selections]);
  const decidedSelections = useMemo(() => selections.filter((s) => s.state === 'picked' || s.state === 'changes_requested'), [selections]);

  if (approvals.length === 0 && selections.length === 0) {
    return (
      <div style={{ color: 'var(--color-text-tertiary)' }}>
        Nothing waiting on you right now.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {pendingSelections.length > 0 && (
        <Section heading={`Pick options (${pendingSelections.length})`}>
          {pendingSelections.map((s) => (
            <SelectionPickerCard
              key={s.id}
              selection={s}
              onPick={(optionId) => onPickSelectionOption(s.id, optionId)}
            />
          ))}
        </Section>
      )}

      {groups.pending.length > 0 && (
        <Section heading="Awaiting your decision">
          {groups.pending.map((a) => (
            <PendingRow
              key={a.id}
              approval={a}
              onApprove={() => onApprove(a.id)}
              onRequestChanges={() => onRequestChanges(a)}
            />
          ))}
        </Section>
      )}

      {decidedSelections.length > 0 && (
        <Section heading="Recent picks">
          {decidedSelections.map((s) => (
            <SelectionPickedRow key={s.id} selection={s} />
          ))}
        </Section>
      )}

      {groups.recent.length > 0 && (
        <Section heading="Recent decisions">
          {groups.recent.map((a) => (
            <DecidedRow key={a.id} approval={a} />
          ))}
        </Section>
      )}

      {groups.past.length > 0 && (
        <details
          open={showPast}
          onToggle={(e) => setShowPast((e.target as HTMLDetailsElement).open)}
          style={{
            background: 'var(--color-background-primary)',
            border: '0.5px solid var(--color-border-tertiary)',
            borderRadius: 'var(--radius-md)',
            padding: 12,
          }}
        >
          <summary
            data-portal-past-decisions
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            Past decisions ({groups.past.length})
          </summary>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              marginTop: 10,
            }}
          >
            {groups.past.map((a) => (
              <DecidedRow key={a.id} approval={a} muted />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--color-text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          marginBottom: 8,
        }}
      >
        {heading}
      </div>
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {children}
      </ul>
    </div>
  );
}

function PendingRow({
  approval,
  onApprove,
  onRequestChanges,
}: {
  approval: DesignApproval;
  onApprove: () => void;
  onRequestChanges: () => void;
}) {
  return (
    <li
      data-portal-action-card={approval.id}
      style={{
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-md)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{labelFor(approval)}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
            Sent {approval.sentAt?.slice(0, 10) ?? '—'}
          </div>
        </div>
        <span
          style={{
            padding: '2px 10px',
            borderRadius: 'var(--radius-full)',
            fontSize: 10,
            fontWeight: 500,
            background: 'var(--color-bg-warning)',
            color: 'var(--color-text-warning)',
            alignSelf: 'flex-start',
          }}
        >
          Awaiting you
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          data-portal-approve={approval.id}
          onClick={onApprove}
          style={{
            padding: '6px 14px',
            fontSize: 12,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-text-success)',
            color: '#fff',
            fontWeight: 500,
          }}
        >
          Approve
        </button>
        <button
          type="button"
          data-portal-request-changes={approval.id}
          onClick={onRequestChanges}
          style={{
            padding: '6px 14px',
            fontSize: 12,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-background-primary)',
            color: 'var(--color-text-secondary)',
            border: '0.5px solid var(--color-border-secondary)',
            fontWeight: 500,
          }}
        >
          Request changes
        </button>
      </div>
    </li>
  );
}

function DecidedRow({ approval, muted = false }: { approval: DesignApproval; muted?: boolean }) {
  return (
    <li
      style={{
        background: muted ? 'transparent' : 'var(--color-background-primary)',
        border: muted ? 'none' : '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-md)',
        padding: muted ? '4px 0' : 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{labelFor(approval)}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
            {approval.decidedAt
              ? `Decided ${approval.decidedAt.slice(0, 10)}`
              : 'No decision yet'}
            {approval.decisionMethod && ` via ${approval.decisionMethod}`}
          </div>
        </div>
        <span
          style={{
            padding: '2px 10px',
            borderRadius: 'var(--radius-full)',
            fontSize: 10,
            fontWeight: 500,
            background:
              approval.state === 'approved'
                ? 'var(--color-bg-success)'
                : approval.state === 'revision_requested'
                ? 'var(--color-bg-warning)'
                : 'var(--color-background-tertiary)',
            color:
              approval.state === 'approved'
                ? 'var(--color-text-success)'
                : approval.state === 'revision_requested'
                ? 'var(--color-text-warning)'
                : 'var(--color-text-secondary)',
            alignSelf: 'flex-start',
          }}
        >
          {approval.state === 'revision_requested' ? 'changes requested' : approval.state}
        </span>
      </div>
      {approval.comments && (
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            fontStyle: 'italic',
          }}
        >
          "{approval.comments}"
        </div>
      )}
    </li>
  );
}

function SelectionPickerCard({
  selection,
  onPick,
}: {
  selection: DesignSelection;
  onPick: (optionId: string) => void;
}) {
  return (
    <li
      data-portal-selection-card={selection.id}
      style={{
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-md)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{selection.prompt}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
          Pick the one you'd like. We'll order what you choose and update the budget.
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {selection.options.map((opt) => (
          <div
            key={opt.id}
            data-portal-option={opt.id}
            style={{
              background: 'var(--color-background-tertiary)',
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 'var(--radius-md)',
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ fontWeight: 500, fontSize: 13 }}>{opt.label}</div>
            {opt.description && (
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                {opt.description}
              </div>
            )}
            <div style={{ fontFamily: 'var(--font-mono-fad)', fontSize: 13, fontWeight: 600 }}>
              {formatMUR(opt.priceMinor)}
              {opt.retailMinor !== null && opt.retailMinor > opt.priceMinor && (
                <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--color-text-success)', fontWeight: 500 }}>
                  saves {formatMUR(opt.retailMinor - opt.priceMinor)}
                </span>
              )}
            </div>
            <button
              type="button"
              data-portal-pick={opt.id}
              onClick={() => onPick(opt.id)}
              style={{
                marginTop: 'auto',
                padding: '6px 12px',
                fontSize: 12,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-brand-accent)',
                color: '#fff',
                fontWeight: 500,
              }}
            >
              Pick this
            </button>
          </div>
        ))}
      </div>
    </li>
  );
}

function SelectionPickedRow({ selection }: { selection: DesignSelection }) {
  const picked = selection.options.find((o) => o.id === selection.pickedOptionId);
  return (
    <li
      style={{
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-md)',
        padding: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{selection.prompt}</div>
          {picked && (
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
              You picked: <strong>{picked.label}</strong> · {formatMUR(picked.priceMinor)}
            </div>
          )}
          {selection.pickedAt && (
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
              {selection.pickedAt.slice(0, 10)}
            </div>
          )}
        </div>
        <span
          style={{
            padding: '2px 10px',
            borderRadius: 'var(--radius-full)',
            fontSize: 10,
            fontWeight: 500,
            background:
              selection.state === 'picked'
                ? 'var(--color-bg-success)'
                : 'var(--color-bg-warning)',
            color:
              selection.state === 'picked'
                ? 'var(--color-text-success)'
                : 'var(--color-text-warning)',
            alignSelf: 'flex-start',
          }}
        >
          {selection.state === 'picked' ? 'Picked' : 'Changes requested'}
        </span>
      </div>
      {selection.comment && (
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
          "{selection.comment}"
        </div>
      )}
    </li>
  );
}

function labelFor(a: DesignApproval): string {
  return a.artifactType.replace(/_/g, ' ');
}

interface Groups {
  pending: DesignApproval[];
  recent: DesignApproval[];
  past: DesignApproval[];
}

function groupApprovals(approvals: DesignApproval[]): Groups {
  const now = Date.now();
  const pending: DesignApproval[] = [];
  const recent: DesignApproval[] = [];
  const past: DesignApproval[] = [];
  for (const a of approvals) {
    if (a.state === 'sent') {
      pending.push(a);
      continue;
    }
    if (!a.decidedAt) {
      // Decided-but-no-timestamp — treat as recent (not past).
      recent.push(a);
      continue;
    }
    const ageMs = now - new Date(a.decidedAt).getTime();
    if (ageMs <= PAST_DECISION_MS) recent.push(a);
    else past.push(a);
  }
  // Sort recent + past newest-first for predictable rendering.
  const byDecided = (a: DesignApproval, b: DesignApproval) =>
    (b.decidedAt ?? '').localeCompare(a.decidedAt ?? '');
  recent.sort(byDecided);
  past.sort(byDecided);
  return { pending, recent, past };
}
