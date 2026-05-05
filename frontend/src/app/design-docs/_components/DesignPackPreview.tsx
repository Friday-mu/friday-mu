// Design pack preview — owner-facing room-by-room design.
//
// Comes after the moodboard, before the final procurement budget. Each room
// gets its own page with layout + render images + designer notes; the cover
// page summarises the project, palette inheritance, and approval state.

import {
  designClient,
  type DesignProject,
  type DesignPackVersion,
} from '../../fad/_data/design';
import { DocumentLayout, DocumentPage } from './DocumentLayout';

export function DesignPackPreview({ project }: { project: DesignProject }) {
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);
  const all = designClient.designPacks.list(project.id);
  const sorted = [...all].sort((a, b) => b.version - a.version);
  const latest: DesignPackVersion | null = sorted[0] ?? null;
  const rooms = designClient.rooms.list(project.id);
  const roomById = new Map(rooms.map((r) => [r.id, r]));

  const meta = {
    title: 'Design pack',
    version: latest ? `v${latest.version} · ${formatState(latest.state)}` : 'pending',
  };

  return (
    <DocumentLayout meta={meta} project={project}>
      <DocumentPage project={project} meta={meta} pageLabel={`Design pack ${latest ? `v${latest.version}` : 'pending'}`}>
        <h2>Design pack — {project.name}</h2>

        {!latest ? (
          <div className="doc-callout">
            <strong>Design pack not yet shared.</strong> The design pack
            comes after the approved moodboard and translates the direction
            into per-room plans, renders, and the lighting layout. It is
            shared with the Owner for sign-off before the final procurement
            budget is built.
          </div>
        ) : (
          <>
            <p>{latest.narrative}</p>

            <table>
              <tbody>
                <tr><td style={{ width: '30%' }}>Owner</td><td>{counterparty?.fullName ?? '—'}</td></tr>
                <tr><td>Property</td><td>{property?.name ?? '—'}</td></tr>
                <tr><td>Project</td><td>{project.name} ({project.id})</td></tr>
                <tr><td>Status</td><td>{formatState(latest.state)}</td></tr>
                <tr><td>Sent to owner</td><td>{latest.sentAt?.slice(0, 10) ?? '—'}</td></tr>
                <tr><td>Approved on</td><td>{latest.approvedAt?.slice(0, 10) ?? '—'}</td></tr>
                {latest.ownerComments && <tr><td>Owner comments</td><td>"{latest.ownerComments}"</td></tr>}
              </tbody>
            </table>

            <div style={{ margin: '12pt 0', textAlign: 'center' }}>
              <img
                src={latest.coverImageUrl}
                alt={`${project.name} design pack cover`}
                style={{ maxWidth: '100%', maxHeight: '90mm', border: '0.5pt solid #c8c2b3' }}
              />
            </div>

            <h3>Index</h3>
            <ul>
              {latest.rooms.map((r, i) => {
                const room = roomById.get(r.roomId);
                return <li key={r.roomId}>Page {i + 2} — {room?.name ?? r.roomId}</li>;
              })}
            </ul>

            <p style={{ fontSize: '9pt', color: '#5b6776' }}>
              Each room page following includes a planned layout and a render
              where available. Notes capture material specifications, fixed
              fittings, and any owner-specific call-outs.
            </p>
          </>
        )}
      </DocumentPage>

      {latest?.rooms.map((r) => {
        const room = roomById.get(r.roomId);
        const roomName = room?.name ?? r.roomId;
        return (
          <DocumentPage key={r.roomId} project={project} meta={meta} pageLabel={`Design pack · ${roomName}`}>
            <h2>{roomName}</h2>
            {room && (
              <p style={{ color: '#5b6776', fontSize: '9pt' }}>
                {room.lengthM && room.widthM && (
                  <>Dimensions: {room.lengthM} × {room.widthM} m{room.heightM ? ` × ${room.heightM} m` : ''}.{' '}</>
                )}
                {room.windows !== null && <>{room.windows} window{room.windows === 1 ? '' : 's'}.{' '}</>}
                {room.doors !== null && <>{room.doors} door{room.doors === 1 ? '' : 's'}.</>}
              </p>
            )}

            <h3>Layout</h3>
            <div style={{ textAlign: 'center', margin: '6pt 0' }}>
              <img
                src={r.layoutImageUrl}
                alt={`${roomName} layout`}
                style={{ maxWidth: '100%', maxHeight: '90mm', border: '0.5pt solid #c8c2b3' }}
              />
            </div>

            {r.renderImageUrl && (
              <>
                <h3>Render</h3>
                <div style={{ textAlign: 'center', margin: '6pt 0' }}>
                  <img
                    src={r.renderImageUrl}
                    alt={`${roomName} render`}
                    style={{ maxWidth: '100%', maxHeight: '90mm', border: '0.5pt solid #c8c2b3' }}
                  />
                </div>
              </>
            )}

            {r.notes && (
              <>
                <h3>Notes</h3>
                <p>{r.notes}</p>
              </>
            )}

            {room?.designOpportunity && (
              <>
                <h3>Design opportunity</h3>
                <p style={{ fontStyle: 'italic', color: '#5b6776' }}>{room.designOpportunity}</p>
              </>
            )}
          </DocumentPage>
        );
      })}
    </DocumentLayout>
  );
}

function formatState(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
