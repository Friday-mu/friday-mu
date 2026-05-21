'use client';

import type { DesignDocument } from '../../../../_data/design';

interface Props {
  docs: DesignDocument[];
}

export function DocsTab({ docs }: Props) {
  if (docs.length === 0) {
    return (
      <div style={{ color: 'var(--color-text-tertiary)' }}>
        No documents shared yet. Anything Friday sends you will appear here.
      </div>
    );
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
      {docs.map((d) => (
        <li
          key={d.id}
          style={{
            background: 'var(--color-background-primary)',
            border: '0.5px solid var(--color-border-tertiary)',
            borderRadius: 'var(--radius-md)',
            padding: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontWeight: 500, fontSize: 13 }}>{d.type.replace(/_/g, ' ')}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
              v{d.version} · {d.generatedAt?.slice(0, 10) ?? '—'} · {d.status}
            </div>
          </div>
          {d.pdfUrl && (
            <a
              href={d.pdfUrl}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-brand-accent-soft)',
                color: 'var(--color-brand-accent)',
                textDecoration: 'none',
              }}
            >
              View
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
