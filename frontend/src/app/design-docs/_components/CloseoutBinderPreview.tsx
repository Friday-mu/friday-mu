// Closeout binder — handover document delivered after reconciliation.

import {
  designClient,
  type DesignProject,
  type WarrantyRecord,
  type MaintenanceGuide,
  type SnagItem,
} from '../../fad/_data/design';
import { DocumentLayout, DocumentPage } from './DocumentLayout';
import { FRIDAY, deriveInitials, fridayDocNumber, formatDocDate } from './fridayParticulars';

export function CloseoutBinderPreview({ project }: { project: DesignProject }) {
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);
  const binder = designClient.binder.get(project.id);
  const initials = deriveInitials(counterparty?.fullName);
  const docNumber = fridayDocNumber(initials, 1, { service: 'CB' });
  const status = !binder ? 'pending' : binder.state === 'signed_off' ? 'signed off' : binder.state === 'sent' ? 'sent' : 'draft';

  if (!binder) {
    return (
      <DocumentLayout meta={{ title: docNumber }} project={project}>
        <DocumentPage>
          <Header docNumber={docNumber} status={status} project={project} />
          <p>
            The closeout binder is assembled at the reconciliation stage. It
            comprises warranties on every installed item, a maintenance
            schedule grouped by area, and the final snag list with status
            per item. This project has not yet reached closeout.
          </p>
          <div className="doc-callout">
            <strong>Binder pending.</strong> A draft binder is created
            automatically at reconciliation; warranties, maintenance
            entries, and snags are added by the operations team during the
            closeout walkthrough.
          </div>
        </DocumentPage>
      </DocumentLayout>
    );
  }

  return (
    <DocumentLayout meta={{ title: docNumber }} project={project}>
      <DocumentPage>
        <Header docNumber={docNumber} status={status} project={project} />
        <p>
          Handover document delivered at project close. Contains every
          warranty, the recommended maintenance schedule, and the snag list
          recorded during the closeout walkthrough. Keep alongside the
          property&rsquo;s records &mdash; vendors will ask to see the
          warranty entries if anything fails inside the cover period.
        </p>

        <h2>Prepared for</h2>
        <table className="doc-table-bare">
          <tbody>
            <tr><td style={{ width: '32%', fontWeight: 600 }}>Client</td><td>{counterparty?.fullName ?? '—'}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Property</td><td>{property?.name ?? '—'}{property?.address ? ` · ${property.address}` : ''}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Binder issued</td><td>{formatDocDate(binder.createdAt)}</td></tr>
            {binder.sentAt && <tr><td style={{ fontWeight: 600 }}>Sent to Client</td><td>{formatDocDate(binder.sentAt)}</td></tr>}
            {binder.signedOffAt && <tr><td style={{ fontWeight: 600 }}>Accepted</td><td>{formatDocDate(binder.signedOffAt)}</td></tr>}
          </tbody>
        </table>

        <h2>Index</h2>
        <ul>
          <li>Section 1 &mdash; Warranties ({binder.warranties.length} items)</li>
          <li>Section 2 &mdash; Maintenance schedule ({binder.maintenance.length} entries)</li>
          <li>Section 3 &mdash; Snag list ({binder.snags.length} item{binder.snags.length === 1 ? '' : 's'})</li>
          <li>Section 4 &mdash; Client sign-off</li>
        </ul>
      </DocumentPage>

      {binder.warranties.length > 0 && (
        <DocumentPage>
          <h1>1. Warranties</h1>
          <p style={{ fontSize: '9pt', color: '#5b6776' }}>
            Cover periods start from the purchase date. Vendor names below
            are the parties to contact for warranty service; Friday Retreats
            can re-issue copies of any certificate by request.
          </p>
          <table>
            <thead>
              <tr><th>Item</th><th>Vendor</th><th className="num">Cover</th><th>Purchased</th></tr>
            </thead>
            <tbody>
              {binder.warranties.map((w: WarrantyRecord) => (
                <tr key={w.id}>
                  <td>
                    <strong>{w.itemName}</strong>
                    {w.notes && <><br /><span style={{ color: '#5b6776', fontSize: '9pt' }}>{w.notes}</span></>}
                  </td>
                  <td>{w.vendorName}</td>
                  <td className="num">{w.durationMonths} months</td>
                  <td>{w.purchaseDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DocumentPage>
      )}

      {binder.maintenance.length > 0 && (
        <DocumentPage>
          <h1>2. Maintenance schedule</h1>
          <p style={{ fontSize: '9pt', color: '#5b6776' }}>
            Frequencies are recommendations based on Friday Retreats&rsquo;
            vendor-network experience with similar installations in the
            Mauritian climate. Adjust as the property&rsquo;s usage
            dictates.
          </p>
          {binder.maintenance.map((m: MaintenanceGuide) => (
            <div key={m.id} style={{ marginTop: '8pt' }}>
              <h2 style={{ marginTop: 0 }}>
                {m.title}
                <span style={{ marginLeft: '8pt', fontSize: '9pt', color: '#5b6776', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 400 }}>
                  · {m.area} · {m.frequency}
                </span>
              </h2>
              <p>{m.instructions}</p>
            </div>
          ))}
        </DocumentPage>
      )}

      {binder.snags.length > 0 && (
        <DocumentPage>
          <h1>3. Snag list</h1>
          <p style={{ fontSize: '9pt', color: '#5b6776' }}>
            Items recorded during the closeout walkthrough. Status reflects
            the latest disposition; any &ldquo;Open&rdquo; item is queued for
            follow-up and will close before the binder is signed off.
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

      <DocumentPage>
        <h1>4. Client sign-off</h1>
        <p>
          By signing below, the Client accepts handover of the project as
          reflected in the warranties, maintenance schedule, and snag list
          above. Any new defects discovered after sign-off remain covered
          by the individual vendor warranties for their stated durations.
        </p>

        <div className="doc-signatures">
          <div className="doc-sig-block">
            <div>{FRIDAY.legalName}</div>
            <div>Representative: {FRIDAY.signatories.director.name}</div>
            <div className="doc-sig-line">Signature</div>
            <div style={{ marginTop: '8pt' }}>Date: <span className="doc-fill" style={{ minWidth: '80pt' }} /></div>
          </div>
          <div className="doc-sig-block">
            <div>Client</div>
            <div>Client Name: <span className="doc-fill" style={{ minWidth: '120pt' }}>{counterparty?.fullName ?? ''}</span></div>
            <div className="doc-sig-line">Signature</div>
            <div style={{ marginTop: '8pt' }}>
              Date: <span className="doc-fill" style={{ minWidth: '80pt' }}>{binder.signedOffAt ? formatDocDate(binder.signedOffAt) : ''}</span>
            </div>
            {binder.signOffComment && <div style={{ marginTop: '4pt', fontStyle: 'italic' }}>&ldquo;{binder.signOffComment}&rdquo;</div>}
          </div>
        </div>

        <hr className="doc-divider" />
        <p style={{ fontSize: '9pt', color: '#5b6776' }}>
          This binder is the final document of the engagement. Keep it
          accessible &mdash; the warranty entries are the contractual basis
          for any remedial vendor work over the cover periods listed above.
          Friday Retreats can be reached at {FRIDAY.emails.general} for any
          handover-related question.
        </p>
      </DocumentPage>
    </DocumentLayout>
  );
}

function Header({ docNumber, status, project }: { docNumber: string; status: string; project: DesignProject }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4mm' }}>
      <div>
        <h1 style={{ marginBottom: '2pt' }}>Closeout Binder</h1>
        <div style={{ fontSize: '10pt', color: '#5b6776' }}>{project.name}</div>
      </div>
      <div style={{ fontSize: '10pt', textAlign: 'right' }}>
        <div><span style={{ fontWeight: 600 }}>REF:</span> <span style={{ fontFamily: 'var(--font-mono-fad), monospace' }}>{docNumber}</span></div>
        <div><span style={{ fontWeight: 600 }}>DATE:</span> {formatDocDate(new Date().toISOString())}</div>
        <div><span style={{ fontWeight: 600 }}>STATUS:</span> {status}</div>
      </div>
    </div>
  );
}
