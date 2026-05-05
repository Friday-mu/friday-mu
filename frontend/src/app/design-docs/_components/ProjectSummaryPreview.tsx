// Project summary sheet — one-pager for any project, useful as a kickoff
// briefing or status sheet pulled at any stage. Backbone reused by other
// previews via DocumentLayout.

import {
  formatMUR,
  type DesignProject,
  designClient,
  stageDef,
} from '../../fad/_data/design';
import { DocumentLayout, DocumentPage } from './DocumentLayout';

export function ProjectSummaryPreview({ project }: { project: DesignProject }) {
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);
  const stage = stageDef(project.currentStage);
  return (
    <DocumentLayout meta={{ title: 'Project summary', version: 'live' }} project={project}>
      <DocumentPage project={project} meta={{ title: 'Project summary' }}>
        <h2>{project.name}</h2>
        <p>
          Friday Retreats engagement summary, generated live from current
          project state. Refer to the agreement and Annex B for binding terms;
          this sheet is informational.
        </p>

        <h3>Parties</h3>
        <table>
          <tbody>
            <tr><td>Owner</td><td>{counterparty?.fullName ?? '—'}</td></tr>
            <tr><td>Property</td><td>{property?.name ?? '—'}{property?.address ? ` · ${property.address}` : ''}</td></tr>
            <tr><td>Region / bedrooms</td><td>{property?.region ?? '—'}{property?.bedrooms ? ` · ${property.bedrooms} BR` : ''}</td></tr>
            <tr><td>Friday entity</td><td>{project.entityId}</td></tr>
            <tr><td>Project ID</td><td>{project.id}</td></tr>
          </tbody>
        </table>

        <h3>Engagement</h3>
        <table>
          <tbody>
            <tr><td>Classification</td><td style={{ textTransform: 'capitalize' }}>{project.classification}</td></tr>
            <tr><td>Tier</td><td>{project.tier ? `Tier ${project.tier}` : '—'}</td></tr>
            <tr><td>EPC (estimated project cost)</td><td className="num">{formatMUR(project.epcMinor)}</td></tr>
            <tr><td>Design fee</td><td className="num">{formatMUR(project.designFeeMinor)}</td></tr>
            <tr><td>Procurement &amp; execution fee</td><td className="num">{formatMUR(project.procurementFeeMinor)}</td></tr>
            <tr><td>Goals</td><td>{project.goals.map((g) => g.replace(/_/g, ' ')).join(', ') || '—'}</td></tr>
            <tr><td>Target outcomes</td><td>{project.outcomes.map((o) => o.replace(/_/g, ' ')).join(', ') || '—'}</td></tr>
          </tbody>
        </table>

        <h3>Status</h3>
        <table>
          <tbody>
            <tr><td>Current stage</td><td>{stage.label} ({stage.index} / 17)</td></tr>
            <tr><td>Stage status</td><td style={{ textTransform: 'capitalize' }}>{project.stageStatus.replace(/-/g, ' ')}</td></tr>
            <tr><td>Lifecycle</td><td style={{ textTransform: 'capitalize' }}>{project.lifecycleStatus}</td></tr>
            <tr><td>Start date</td><td>{project.startDate ?? '—'}</td></tr>
            <tr><td>Estimated completion</td><td>{project.estimatedCompletion ?? '—'}</td></tr>
            {project.urgency && <tr><td>Owner urgency</td><td>{project.urgency}</td></tr>}
          </tbody>
        </table>

        {project.blocker && (
          <div className="doc-callout">
            <strong>Active blocker:</strong> {project.blocker}
          </div>
        )}

        <h3>Next action</h3>
        <p>{project.nextAction || 'No next action recorded.'}</p>

        <hr className="doc-divider" />
        <p style={{ fontSize: '9pt', color: '#5b6776' }}>
          Schedule and fees are subject to the Annex A pricing schedule in
          force at agreement signature, with any per-project overrides
          captured in Annex B. This summary is generated live and reflects
          the project state at the timestamp printed on each page footer.
        </p>
      </DocumentPage>
    </DocumentLayout>
  );
}
