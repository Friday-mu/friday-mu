'use client';

import {
  designClient,
  formatMUR,
  type DesignProject,
} from '../../../../_data/design';

interface Props {
  project: DesignProject;
}

export function HandoverTab({ project }: Props) {
  const isClosed =
    project.currentStage === 'reconciliation' && project.stageStatus === 'done';

  if (!isClosed) {
    return (
      <div style={{ color: 'var(--color-text-tertiary)' }}>
        Available once the project is complete. Currently at{' '}
        <strong>{project.currentStage}</strong>.
      </div>
    );
  }

  const items = designClient.budgetItems.list(project.id);
  const approved = items
    .filter((i) => i.status === 'approved')
    .reduce((s, i) => s + (i.finalApprovedCostMinor ?? 0), 0);
  const paid = items.reduce((s, i) => s + (i.actualPaidMinor ?? 0), 0);
  const variance = paid - approved;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          background: 'var(--color-bg-success)',
          color: 'var(--color-text-success)',
          padding: 14,
          borderRadius: 'var(--radius-md)',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Project closed. Final handover bundle below.
      </div>
      <div
        style={{
          background: 'var(--color-background-primary)',
          padding: 14,
          borderRadius: 'var(--radius-md)',
          fontSize: 12,
        }}
      >
        <table style={{ width: '100%', fontSize: 12 }}>
          <tbody>
            <tr>
              <td>Approved total</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono-fad)' }}>
                {formatMUR(approved)}
              </td>
            </tr>
            <tr>
              <td>Actual spent</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono-fad)' }}>
                {formatMUR(paid)}
              </td>
            </tr>
            <tr style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
              <td>
                <strong>Variance</strong>
              </td>
              <td
                style={{
                  textAlign: 'right',
                  fontFamily: 'var(--font-mono-fad)',
                  fontWeight: 600,
                }}
              >
                {variance === 0
                  ? formatMUR(0)
                  : `${variance > 0 ? '+' : '−'}${formatMUR(Math.abs(variance))}`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
