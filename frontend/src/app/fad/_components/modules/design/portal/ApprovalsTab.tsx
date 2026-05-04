'use client';

import type { DesignApproval } from '../../../../_data/design';

interface Props {
  approvals: DesignApproval[];
}

export function ApprovalsTab({ approvals }: Props) {
  if (approvals.length === 0) {
    return <div style={{ color: 'var(--color-text-tertiary)' }}>Nothing waiting on you right now.</div>;
  }
  return (
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
      {approvals.map((a) => (
        <li
          key={a.id}
          style={{
            background: 'var(--color-background-primary)',
            border: '0.5px solid var(--color-border-tertiary)',
            borderRadius: 'var(--radius-md)',
            padding: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{a.artifactType.replace(/_/g, ' ')}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                {a.sentAt && `Sent ${a.sentAt.slice(0, 10)}`}
                {a.decidedAt && ` · Decided ${a.decidedAt.slice(0, 10)}`}
                {a.decisionMethod && ` via ${a.decisionMethod}`}
              </div>
            </div>
            <span
              style={{
                padding: '2px 10px',
                borderRadius: 'var(--radius-full)',
                fontSize: 10,
                fontWeight: 500,
                background:
                  a.state === 'approved'
                    ? 'var(--color-bg-success)'
                    : a.state === 'sent'
                    ? 'var(--color-bg-warning)'
                    : 'var(--color-background-tertiary)',
                color:
                  a.state === 'approved'
                    ? 'var(--color-text-success)'
                    : a.state === 'sent'
                    ? 'var(--color-text-warning)'
                    : 'var(--color-text-secondary)',
                alignSelf: 'flex-start',
              }}
            >
              {a.state}
            </span>
          </div>
          {a.comments && (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: 'var(--color-text-secondary)',
                fontStyle: 'italic',
              }}
            >
              "{a.comments}"
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
