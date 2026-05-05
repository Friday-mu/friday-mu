// Design pack — owner-facing room-by-room design.

import {
  designClient,
  type DesignProject,
  type DesignPackVersion,
} from '../../fad/_data/design';
import { DocumentLayout, DocumentPage } from './DocumentLayout';
import { FRIDAY, deriveInitials, fridayDocNumber, formatDocDate } from './fridayParticulars';

export function DesignPackPreview({ project }: { project: DesignProject }) {
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);
  const all = designClient.designPacks.list(project.id);
  const sorted = [...all].sort((a, b) => b.version - a.version);
  const latest: DesignPackVersion | null = sorted[0] ?? null;
  const rooms = designClient.rooms.list(project.id);
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const initials = deriveInitials(counterparty?.fullName);
  const docNumber = fridayDocNumber(initials, latest?.version ?? 1, { service: 'DP' });

  return (
    <DocumentLayout meta={{ title: docNumber }} project={project}>
      <DocumentPage>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4mm' }}>
          <div>
            <h1 style={{ marginBottom: '2pt' }}>Design Pack</h1>
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
            <strong>Design pack pending.</strong> The design pack comes after
            the approved moodboard and translates the direction into
            per-room plans, renders, and the lighting layout. It is shared
            with the Client for sign-off before the final procurement
            budget is built.
          </div>
        ) : (
          <>
            <p>{latest.narrative}</p>

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

            <div style={{ margin: '12pt 0', textAlign: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={latest.coverImageUrl}
                alt={`${project.name} design pack cover`}
                style={{ maxWidth: '100%', maxHeight: '90mm', border: '0.5pt solid #c8c2b3' }}
              />
            </div>

            <h2>Index</h2>
            <ul>
              {latest.rooms.map((r, i) => {
                const room = roomById.get(r.roomId);
                return <li key={r.roomId}>Page {i + 2} &mdash; {room?.name ?? r.roomId}</li>;
              })}
            </ul>

            <p style={{ fontSize: '9pt', color: '#5b6776' }}>
              Each room page following includes a planned layout and a
              render where available. Notes capture material specifications,
              fixed fittings, and any Client-specific call-outs.
            </p>
          </>
        )}
      </DocumentPage>

      {latest?.rooms.map((r) => {
        const room = roomById.get(r.roomId);
        const roomName = room?.name ?? r.roomId;
        return (
          <DocumentPage key={r.roomId}>
            <h1>{roomName}</h1>
            {room && (
              <p style={{ color: '#5b6776', fontSize: '9pt' }}>
                {room.lengthM && room.widthM && (
                  <>Dimensions: {room.lengthM} × {room.widthM} m{room.heightM ? ` × ${room.heightM} m` : ''}.{' '}</>
                )}
                {room.windows !== null && <>{room.windows} window{room.windows === 1 ? '' : 's'}.{' '}</>}
                {room.doors !== null && <>{room.doors} door{room.doors === 1 ? '' : 's'}.</>}
              </p>
            )}

            <h2>Layout</h2>
            <div style={{ textAlign: 'center', margin: '6pt 0' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={r.layoutImageUrl}
                alt={`${roomName} layout`}
                style={{ maxWidth: '100%', maxHeight: '90mm', border: '0.5pt solid #c8c2b3' }}
              />
            </div>

            {r.renderImageUrl && (
              <>
                <h2>Render</h2>
                <div style={{ textAlign: 'center', margin: '6pt 0' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
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
                <h2>Notes</h2>
                <p>{r.notes}</p>
              </>
            )}

            {room?.designOpportunity && (
              <>
                <h2>Design opportunity</h2>
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
