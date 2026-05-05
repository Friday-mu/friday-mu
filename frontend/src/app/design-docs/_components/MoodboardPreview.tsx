// Moodboard preview — owner-facing design direction.
//
// Renders the latest version (highest .version) of the project's moodboard.
// Includes cover image, narrative, palette swatches, materials, inspiration
// links, and the approval state. Earlier versions fold into a small history
// summary at the bottom rather than getting their own pages.

import {
  designClient,
  type DesignProject,
  type MoodboardVersion,
} from '../../fad/_data/design';
import { DocumentLayout, DocumentPage } from './DocumentLayout';

export function MoodboardPreview({ project }: { project: DesignProject }) {
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);
  const all = designClient.moodboards.list(project.id);
  // designClient already sorts desc by version; defensively re-sort.
  const sorted = [...all].sort((a, b) => b.version - a.version);
  const latest: MoodboardVersion | null = sorted[0] ?? null;
  const history = sorted.slice(1);
  const meta = {
    title: 'Moodboard',
    version: latest ? `v${latest.version} · ${formatState(latest.state)}` : 'pending',
  };

  return (
    <DocumentLayout meta={meta} project={project}>
      <DocumentPage project={project} meta={meta} pageLabel={`Moodboard ${latest ? `v${latest.version}` : 'pending'}`}>
        <h2>Moodboard — {project.name}</h2>

        {!latest ? (
          <div className="doc-callout">
            <strong>Moodboard not yet shared.</strong> Friday Retreats sends
            the moodboard at the moodboard stage; it captures the design
            direction (palette, materials, narrative) for owner approval
            before any room-level work begins.
          </div>
        ) : (
          <>
            <p>{latest.narrative}</p>

            <div style={{ margin: '12pt 0', textAlign: 'center' }}>
              <img
                src={latest.coverImageUrl}
                alt={`${project.name} moodboard cover`}
                style={{ maxWidth: '100%', maxHeight: '110mm', border: '0.5pt solid #c8c2b3' }}
              />
            </div>

            <h3>Palette</h3>
            <div style={{ display: 'flex', gap: '8pt', flexWrap: 'wrap', margin: '6pt 0' }}>
              {latest.palette.map((c) => (
                <div key={c} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4pt' }}>
                  <div style={{ width: '36pt', height: '36pt', background: c, border: '0.5pt solid #14233d' }} />
                  <span style={{ fontFamily: 'var(--font-mono-fad)', fontSize: '8.5pt', color: '#5b6776' }}>{c}</span>
                </div>
              ))}
            </div>

            <h3>Materials</h3>
            <p style={{ textTransform: 'capitalize' }}>{latest.materials.join(' · ')}</p>

            {latest.inspiration.length > 0 && (
              <>
                <h3>Inspiration</h3>
                <ul>
                  {latest.inspiration.map((ins, i) => (
                    <li key={i}>
                      <strong>{ins.sourceLabel}</strong>
                      <br />
                      <span style={{ fontFamily: 'var(--font-mono-fad)', fontSize: '9pt', color: '#5b6776' }}>{ins.url}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {latest.designerNotes && (
              <>
                <h3>Designer notes</h3>
                <p style={{ fontStyle: 'italic', color: '#5b6776' }}>{latest.designerNotes}</p>
              </>
            )}

            <h3>Approval state</h3>
            <table>
              <tbody>
                <tr><td style={{ width: '30%' }}>Status</td><td>{formatState(latest.state)}</td></tr>
                <tr><td>Sent to owner</td><td>{latest.sentAt?.slice(0, 10) ?? '—'}</td></tr>
                <tr><td>Approved on</td><td>{latest.approvedAt?.slice(0, 10) ?? '—'}</td></tr>
                {latest.ownerComments && <tr><td>Owner comments</td><td>"{latest.ownerComments}"</td></tr>}
              </tbody>
            </table>

            {history.length > 0 && (
              <>
                <hr className="doc-divider" />
                <h3>Earlier versions</h3>
                <table>
                  <thead>
                    <tr><th>Version</th><th>Sent</th><th>State</th><th>Comments</th></tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td>v{h.version}</td>
                        <td>{h.sentAt?.slice(0, 10) ?? '—'}</td>
                        <td>{formatState(h.state)}</td>
                        <td style={{ color: '#5b6776' }}>{h.ownerComments ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <p style={{ fontSize: '9pt', color: '#5b6776', marginTop: '12pt' }}>
              Prepared for {counterparty?.fullName ?? 'the Owner'} ·{' '}
              {property?.name ?? project.name} ({project.entityId})
            </p>
          </>
        )}
      </DocumentPage>
    </DocumentLayout>
  );
}

function formatState(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
