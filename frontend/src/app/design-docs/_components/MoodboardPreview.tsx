// Moodboard — owner-facing design direction.

import {
  designClient,
  type DesignProject,
  type MoodboardVersion,
} from '../../fad/_data/design';
import { DocumentLayout, DocumentPage } from './DocumentLayout';
import { FRIDAY, deriveInitials, fridayDocNumber, formatDocDate } from './fridayParticulars';

export function MoodboardPreview({ project }: { project: DesignProject }) {
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);
  const all = designClient.moodboards.list(project.id);
  const sorted = [...all].sort((a, b) => b.version - a.version);
  const latest: MoodboardVersion | null = sorted[0] ?? null;
  const history = sorted.slice(1);
  const initials = deriveInitials(counterparty?.fullName);
  const docNumber = fridayDocNumber(initials, latest?.version ?? 1, { service: 'MB' });

  return (
    <DocumentLayout meta={{ title: docNumber }} project={project}>
      <DocumentPage>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4mm' }}>
          <div>
            <h1 style={{ marginBottom: '2pt' }}>Moodboard</h1>
            <div style={{ fontSize: '10pt', color: '#5b6776' }}>{project.name}</div>
          </div>
          <div style={{ fontSize: '10pt', textAlign: 'right' }}>
            <div><span style={{ fontWeight: 600 }}>REF:</span> <span style={{ fontFamily: 'var(--font-mono-fad), monospace' }}>{docNumber}</span></div>
            <div><span style={{ fontWeight: 600 }}>DATE:</span> {formatDocDate(latest?.sentAt ?? latest?.createdAt ?? new Date().toISOString())}</div>
            {latest && <div><span style={{ fontWeight: 600 }}>VERSION:</span> v{latest.version} · {formatState(latest.state)}</div>}
          </div>
        </div>

        {!latest ? (
          <div className="doc-callout">
            <strong>Moodboard pending.</strong> Friday Retreats sends the
            moodboard at the moodboard stage; it captures the design
            direction (palette, materials, narrative) for Client approval
            before any room-level work begins.
          </div>
        ) : (
          <>
            <p>{latest.narrative}</p>

            <div style={{ margin: '12pt 0', textAlign: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={latest.coverImageUrl}
                alt={`${project.name} moodboard cover`}
                style={{ maxWidth: '100%', maxHeight: '110mm', border: '0.5pt solid #c8c2b3' }}
              />
            </div>

            <h2>Prepared for</h2>
            <table className="doc-table-bare">
              <tbody>
                <tr><td style={{ width: '32%', fontWeight: 600 }}>Client</td><td>{counterparty?.fullName ?? '—'}</td></tr>
                <tr><td style={{ fontWeight: 600 }}>Property</td><td>{property?.name ?? '—'}</td></tr>
                {latest.sentAt && <tr><td style={{ fontWeight: 600 }}>Sent</td><td>{formatDocDate(latest.sentAt)}</td></tr>}
                {latest.approvedAt && <tr><td style={{ fontWeight: 600 }}>Approved</td><td>{formatDocDate(latest.approvedAt)}</td></tr>}
                {latest.ownerComments && <tr><td style={{ fontWeight: 600 }}>Client comment</td><td>&ldquo;{latest.ownerComments}&rdquo;</td></tr>}
              </tbody>
            </table>

            <h2>Palette</h2>
            <div style={{ display: 'flex', gap: '10pt', flexWrap: 'wrap', margin: '6pt 0' }}>
              {latest.palette.map((c) => (
                <div key={c} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4pt' }}>
                  <div style={{ width: '40pt', height: '40pt', background: c, border: '0.5pt solid #c8c8c8' }} />
                  <span style={{ fontFamily: 'var(--font-mono-fad), monospace', fontSize: '8.5pt', color: '#5b6776' }}>{c}</span>
                </div>
              ))}
            </div>

            <h2>Materials</h2>
            <p style={{ textTransform: 'capitalize' }}>{latest.materials.join(' · ')}</p>

            {latest.inspiration.length > 0 && (
              <>
                <h2>Inspiration</h2>
                <ul>
                  {latest.inspiration.map((ins, i) => (
                    <li key={i}>
                      <strong>{ins.sourceLabel}</strong>
                      <br />
                      <span style={{ fontFamily: 'var(--font-mono-fad), monospace', fontSize: '9pt', color: '#5b6776' }}>{ins.url}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {latest.designerNotes && (
              <>
                <h2>Designer notes</h2>
                <p style={{ fontStyle: 'italic', color: '#5b6776' }}>{latest.designerNotes}</p>
              </>
            )}

            {history.length > 0 && (
              <>
                <hr className="doc-divider" />
                <h2>Previous versions</h2>
                <table>
                  <thead>
                    <tr><th>Version</th><th>Sent</th><th>State</th><th>Comments</th></tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td>v{h.version}</td>
                        <td>{h.sentAt ? formatDocDate(h.sentAt) : '—'}</td>
                        <td>{formatState(h.state)}</td>
                        <td style={{ color: '#5b6776' }}>{h.ownerComments ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <hr className="doc-divider" />
            <div style={{ fontSize: '9pt', color: '#5b6776' }}>
              <div>Prepared by {FRIDAY.legalName}</div>
              <div>{FRIDAY.address.line1}, {FRIDAY.address.city} · {FRIDAY.phone} · {FRIDAY.emails.general}</div>
            </div>
          </>
        )}
      </DocumentPage>
    </DocumentLayout>
  );
}

function formatState(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
