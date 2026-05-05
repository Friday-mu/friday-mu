// Project summary — kickoff briefing / status sheet for any project.

import {
  formatMUR,
  type DesignProject,
  designClient,
  stageDef,
} from '../../fad/_data/design';
import { DocumentLayout, DocumentPage } from './DocumentLayout';
import { FRIDAY, deriveInitials, fridayDocNumber, formatDocDate } from './fridayParticulars';

export function ProjectSummaryPreview({ project }: { project: DesignProject }) {
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);
  const stage = stageDef(project.currentStage);
  const initials = deriveInitials(counterparty?.fullName);
  const docNumber = fridayDocNumber(initials, 1, { service: 'PS' });

  return (
    <DocumentLayout meta={{ title: docNumber }} project={project}>
      <DocumentPage>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4mm' }}>
          <div>
            <h1 style={{ marginBottom: '2pt' }}>Project Summary</h1>
            <div style={{ fontSize: '10pt', color: '#5b6776' }}>{project.name}</div>
          </div>
          <div style={{ fontSize: '10pt', textAlign: 'right' }}>
            <div><span style={{ fontWeight: 600 }}>REF:</span> <span style={{ fontFamily: 'var(--font-mono-fad), monospace' }}>{docNumber}</span></div>
            <div><span style={{ fontWeight: 600 }}>DATE:</span> {formatDocDate(new Date().toISOString())}</div>
            <div><span style={{ fontWeight: 600 }}>STAGE:</span> {stage.shortLabel}</div>
          </div>
        </div>

        <p>
          Friday Retreats engagement summary, generated live from the
          current project state. The Agreement (Annex A + B) governs all
          binding terms; this sheet is informational.
        </p>

        <h2>Parties</h2>
        <table className="doc-table-bare">
          <tbody>
            <tr><td style={{ width: '32%', fontWeight: 600 }}>Client</td><td>{counterparty?.fullName ?? '—'}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Property</td><td>{property?.name ?? '—'}{property?.address ? ` · ${property.address}` : ''}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Region / bedrooms</td><td>{property?.region ?? '—'}{property?.bedrooms ? ` · ${property.bedrooms} BR` : ''}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Service Provider</td><td>{FRIDAY.legalName} (entity {project.entityId})</td></tr>
          </tbody>
        </table>

        <h2>Engagement</h2>
        <table>
          <tbody>
            <tr><td style={{ width: '50%' }}>Classification</td><td style={{ textTransform: 'capitalize' }}>{project.classification}</td></tr>
            <tr><td>Tier</td><td>{project.tier ? `Tier ${project.tier}` : '—'}</td></tr>
            <tr><td>Estimated Project Cost (EPC)</td><td className="num">{formatMUR(project.epcMinor)}</td></tr>
            <tr><td>Design Fee</td><td className="num">{formatMUR(project.designFeeMinor)}</td></tr>
            <tr><td>Procurement &amp; Execution Fee</td><td className="num">{formatMUR(project.procurementFeeMinor)}</td></tr>
            <tr><td>Goals</td><td style={{ textTransform: 'capitalize' }}>{project.goals.map((g) => g.replace(/_/g, ' ')).join(', ') || '—'}</td></tr>
            <tr><td>Target outcomes</td><td style={{ textTransform: 'capitalize' }}>{project.outcomes.map((o) => o.replace(/_/g, ' ')).join(', ') || '—'}</td></tr>
          </tbody>
        </table>
        <p style={{ fontSize: '9pt', color: '#5b6776' }}>All fees exclusive of VAT (15%).</p>

        <h2>Status</h2>
        <table>
          <tbody>
            <tr><td style={{ width: '50%' }}>Current stage</td><td>{stage.label} ({stage.index} / 17)</td></tr>
            <tr><td>Stage status</td><td style={{ textTransform: 'capitalize' }}>{project.stageStatus.replace(/-/g, ' ')}</td></tr>
            <tr><td>Lifecycle</td><td style={{ textTransform: 'capitalize' }}>{project.lifecycleStatus}</td></tr>
            <tr><td>Start date</td><td>{project.startDate ?? '—'}</td></tr>
            <tr><td>Estimated completion</td><td>{project.estimatedCompletion ?? '—'}</td></tr>
            {project.urgency && <tr><td>Client urgency</td><td>{project.urgency}</td></tr>}
          </tbody>
        </table>

        {project.blocker && (
          <div className="doc-callout">
            <strong>Active blocker:</strong> {project.blocker}
          </div>
        )}

        {project.nextAction && (
          <>
            <h2>Next action</h2>
            <p>{project.nextAction}</p>
          </>
        )}

        <hr className="doc-divider" />
        <div style={{ fontSize: '9pt', color: '#5b6776' }}>
          <div>Prepared by {FRIDAY.legalName}</div>
          <div>{FRIDAY.address.line1}, {FRIDAY.address.city} · {FRIDAY.phone} · {FRIDAY.emails.general}</div>
          <div>BRN: {FRIDAY.brn} · VAT Reg. No: {FRIDAY.vatNumber}</div>
        </div>
      </DocumentPage>
    </DocumentLayout>
  );
}
