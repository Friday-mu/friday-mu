// Closeout binder — handover document delivered after reconciliation.
//
// Three sections: warranties (per-item, vendor + duration), maintenance
// schedule (per-area, frequency + instructions), and snag list (per-room,
// status + sign-off). Plus owner sign-off block.

import {
  designClient,
  type DesignProject,
  type WarrantyRecord,
  type MaintenanceGuide,
  type SnagItem,
} from '../../fad/_data/design';
import { DocumentLayout, DocumentPage } from './DocumentLayout';

export function CloseoutBinderPreview({ project }: { project: DesignProject }) {
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);
  const binder = designClient.binder.get(project.id);

  const meta = {
    title: 'Closeout binder',
    version: !binder ? 'pending' : binder.state === 'signed_off' ? 'signed off' : binder.state === 'sent' ? 'sent' : 'draft',
  };

  if (!binder) {
    return (
      <DocumentLayout meta={meta} project={project}>
        <DocumentPage project={project} meta={meta} pageLabel="Closeout binder">
          <h2>Closeout binder — {project.name}</h2>
          <p>
            The closeout binder is assembled at the reconciliation stage. It
            comprises warranties on every installed item, a maintenance
            schedule grouped by area, and the final snag list with status
            per item. This project has not yet reached closeout — the binder
            will populate once execution wraps and reconciliation begins.
          </p>
          <div className="doc-callout">
            <strong>Binder not yet drafted.</strong> A draft binder is
            created automatically at the reconciliation stage; warranties,
            maintenance entries, and snags are added by the operations
            team during the closeout walkthrough.
          </div>
        </DocumentPage>
      </DocumentLayout>
    );
  }

  return (
    <DocumentLayout meta={meta} project={project}>
      <DocumentPage project={project} meta={meta} pageLabel="Closeout binder · Cover">
        <h2>Closeout binder — {project.name}</h2>
        <p>
          Handover document delivered at project close. Contains every
          warranty, the recommended maintenance schedule, and the snag list
          recorded during the closeout walkthrough. Keep alongside the
          property's records — vendors will ask to see the warranty entries
          if anything fails inside the cover period.
        </p>

        <table>
          <tbody>
            <tr><td style={{ width: '30%' }}>Owner</td><td>{counterparty?.fullName ?? '—'}</td></tr>
            <tr><td>Property</td><td>{property?.name ?? '—'}{property?.address ? ` · ${property.address}` : ''}</td></tr>
            <tr><td>Project</td><td>{project.name} ({project.id})</td></tr>
            <tr><td>Binder created</td><td>{binder.createdAt.slice(0, 10)}</td></tr>
            {binder.sentAt && <tr><td>Sent to owner</td><td>{binder.sentAt.slice(0, 10)}</td></tr>}
            {binder.signedOffAt && <tr><td>Signed off</td><td>{binder.signedOffAt.slice(0, 10)}</td></tr>}
          </tbody>
        </table>

        <h3>Index</h3>
        <ul>
          <li>Section 1 — Warranties ({binder.warranties.length} items)</li>
          <li>Section 2 — Maintenance schedule ({binder.maintenance.length} entries)</li>
          <li>Section 3 — Snag list ({binder.snags.length} item{binder.snags.length === 1 ? '' : 's'})</li>
          <li>Section 4 — Owner sign-off</li>
        </ul>
      </DocumentPage>

      {binder.warranties.length > 0 && (
        <DocumentPage project={project} meta={meta} pageLabel="Closeout binder · Warranties">
          <h2>1. Warranties</h2>
          <p style={{ fontSize: '9pt', color: '#5b6776' }}>
            Cover periods start from the purchase date. Vendor names below
            are the parties to contact for warranty service; Friday Retreats
            can re-issue copies of any certificate by request.
          </p>
          <table>
            <thead>
              <tr><th>Item</th><th>Vendor</th><th style={{ textAlign: 'right' }}>Cover</th><th>Purchased</th></tr>
            </thead>
            <tbody>
              {binder.warranties.map((w: WarrantyRecord) => (
                <tr key={w.id}>
                  <td>
                    <strong>{w.itemName}</strong>
                    {w.notes && <><br /><span style={{ color: '#5b6776', fontSize: '9pt' }}>{w.notes}</span></>}
                    {w.certificateUrl && (
                      <><br /><span style={{ color: '#5b6776', fontSize: '9pt' }}>Cert: <code style={{ fontFamily: 'var(--font-mono-fad)' }}>{w.certificateUrl}</code></span></>
                    )}
                  </td>
                  <td>{w.vendorName}</td>
                  <td className="num">{w.durationMonths}m</td>
                  <td>{w.purchaseDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DocumentPage>
      )}

      {binder.maintenance.length > 0 && (
        <DocumentPage project={project} meta={meta} pageLabel="Closeout binder · Maintenance">
          <h2>2. Maintenance schedule</h2>
          <p style={{ fontSize: '9pt', color: '#5b6776' }}>
            Frequencies are recommendations based on Friday Retreats'
            vendor-network experience with similar installations in the
            Mauritian climate. Adjust as the property's usage dictates.
          </p>
          {binder.maintenance.map((m: MaintenanceGuide) => (
            <div key={m.id} style={{ marginTop: '8pt' }}>
              <h3 style={{ marginTop: 0 }}>
                {m.title}
                <span style={{ marginLeft: '8pt', fontSize: '9pt', color: '#5b6776', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 400 }}>
                  · {m.area} · {m.frequency}
                </span>
              </h3>
              <p>{m.instructions}</p>
            </div>
          ))}
        </DocumentPage>
      )}

      {binder.snags.length > 0 && (
        <DocumentPage project={project} meta={meta} pageLabel="Closeout binder · Snag list">
          <h2>3. Snag list</h2>
          <p style={{ fontSize: '9pt', color: '#5b6776' }}>
            Items recorded during the closeout walkthrough. Status reflects
            the latest disposition; any "Open" item is queued for follow-up
            and will close before the binder is signed off.
          </p>
          <table>
            <thead>
              <tr><th>Item</th><th>Severity</th><th>Status</th><th>Reported</th><th>Fixed</th></tr>
            </thead>
            <tbody>
              {binder.snags.map((s: SnagItem) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.title}</strong>
                    {s.description && <><br /><span style={{ color: '#5b6776', fontSize: '9pt' }}>{s.description}</span></>}
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{s.severity}</td>
                  <td style={{ textTransform: 'capitalize', color: s.status === 'open' ? '#a83232' : '#2a7a3a' }}>{s.status}</td>
                  <td>{s.reportedAt.slice(0, 10)}</td>
                  <td>{s.fixedAt?.slice(0, 10) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DocumentPage>
      )}

      <DocumentPage project={project} meta={meta} pageLabel="Closeout binder · Sign-off">
        <h2>4. Owner sign-off</h2>
        <p>
          By signing below, the Owner accepts handover of the project as
          reflected in the warranties, maintenance schedule, and snag list
          above. Any new defects discovered after sign-off remain covered
          by the individual vendor warranties for their stated durations.
        </p>

        <div className="doc-signatures">
          <div className="doc-sig-block">
            <div className="doc-sig-name">{counterparty?.fullName ?? '[ Owner name ]'}</div>
            <div>For and on behalf of the Client</div>
            <div>Date: ___________________</div>
            {binder.signedOffAt && (
              <div style={{ marginTop: '4pt', fontStyle: 'italic' }}>
                Accepted {binder.signedOffAt.slice(0, 10)}.
                {binder.signOffComment && <> "{binder.signOffComment}"</>}
              </div>
            )}
          </div>
          <div className="doc-sig-block">
            <div className="doc-sig-name">Ishant Gangaram</div>
            <div>Director, Friday Retreats Ltd</div>
            <div>Date: ___________________</div>
          </div>
        </div>

        <hr className="doc-divider" />

        <p style={{ fontSize: '9pt', color: '#5b6776' }}>
          This binder is the final document of the engagement. Keep it
          accessible — the warranty entries are the contractual basis for
          any remedial vendor work over the cover periods listed above.
        </p>
      </DocumentPage>
    </DocumentLayout>
  );
}
