'use client';

import {
  designClient,
  STAGES,
  stageDef,
  type DesignApproval,
  type DesignDocument,
  type DesignProject,
} from '../../../../_data/design';

interface Props {
  project: DesignProject;
  approvals: DesignApproval[];
  docs: DesignDocument[];
  onApprove: (approvalId: string) => void;
  onRequestChanges: (approval: DesignApproval) => void;
}

export function OverviewTab({ project, approvals, docs, onApprove, onRequestChanges }: Props) {
  const pending = approvals.filter((a) => a.state === 'sent');
  const currentIndex = stageDef(project.currentStage).index;
  const latestUpdate = docs.find((d) => d.type === 'weekly_update');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            marginBottom: 6,
          }}
        >
          Stage progress
        </div>
        <div
          style={{
            display: 'flex',
            height: 8,
            background: 'var(--color-background-tertiary)',
            borderRadius: 'var(--radius-full)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${(currentIndex / STAGES.length) * 100}%`,
              background: 'var(--color-brand-accent)',
            }}
          />
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
          Stage {currentIndex} of {STAGES.length} · {STAGES[currentIndex - 1]?.label}
        </div>
      </div>

      {pending.length > 0 && (
        <div
          style={{
            background: 'var(--color-bg-warning)',
            borderLeft: '3px solid var(--color-text-warning)',
            padding: 12,
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--color-text-warning)',
              marginBottom: 6,
            }}
          >
            Action needed from you
          </div>
          {pending.map((a) => (
            <div
              key={a.id}
              data-portal-action-card={a.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 6,
                fontSize: 12,
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <span>{a.artifactType.replace(/_/g, ' ')}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  data-portal-approve={a.id}
                  onClick={() => onApprove(a.id)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-text-success)',
                    color: '#fff',
                  }}
                >
                  Approve
                </button>
                <button
                  type="button"
                  data-portal-request-changes={a.id}
                  onClick={() => onRequestChanges(a)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-background-primary)',
                    color: 'var(--color-text-secondary)',
                    border: '0.5px solid var(--color-border-secondary)',
                  }}
                >
                  Request changes
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          background: 'var(--color-background-primary)',
          padding: 14,
          borderRadius: 'var(--radius-md)',
          border: '0.5px solid var(--color-border-tertiary)',
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            marginBottom: 8,
          }}
        >
          Latest update
        </div>
        {latestUpdate ? (
          <div style={{ fontSize: 13 }}>
            Weekly update v{latestUpdate.version} sent {latestUpdate.generatedAt?.slice(0, 10)}.
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No updates yet.</div>
        )}
      </div>

      {project.nextAction && (
        <div
          style={{
            background: 'var(--color-background-primary)',
            padding: 14,
            borderRadius: 'var(--radius-md)',
            border: '0.5px solid var(--color-border-tertiary)',
            fontSize: 13,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              marginBottom: 6,
            }}
          >
            What's happening now
          </div>
          {project.nextAction}
        </div>
      )}
    </div>
  );
}

// Re-export the designClient list type used by props consumers, so a future
// portal-route page can pass the same shape.
export type PortalApprovalList = ReturnType<typeof designClient.approvals.list>;
export type PortalDocList = ReturnType<typeof designClient.documents.list>;
