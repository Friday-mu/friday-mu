'use client';

import {
  designClient,
  type DesignProject,
  type Photo,
} from '../../../../_data/design';

interface Props {
  project: DesignProject;
  photos: Photo[];
}

export function ProgressTab({ project, photos }: Props) {
  const activity = designClient.activity.list(project.id).filter((a) => a.kind !== 'override');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Recent updates</div>
        {activity.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            No updates yet.
          </div>
        ) : (
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {activity.slice(0, 8).map((a) => (
              <li
                key={a.id}
                style={{
                  padding: 8,
                  background: 'var(--color-background-primary)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12,
                }}
              >
                <div>{a.summary}</div>
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--color-text-tertiary)',
                    marginTop: 2,
                    fontFamily: 'var(--font-mono-fad)',
                  }}
                >
                  {a.at.slice(0, 10)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Photo gallery</div>
        {photos.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            No photos shared yet.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: 8,
            }}
          >
            {photos.slice(0, 24).map((p) => (
              <div
                key={p.id}
                style={{
                  aspectRatio: '4 / 3',
                  background: 'var(--color-background-primary)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-text-tertiary)',
                  fontSize: 10,
                }}
              >
                {p.kind}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
