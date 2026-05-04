'use client';

import { useMemo, useState } from 'react';
import {
  designClient,
  formatMUR,
  STAGES,
  stageDef,
  type DesignProject,
  type OwnerBudgetItem,
} from '../../../_data/design';

interface Props {
  project: DesignProject;
  onClose: () => void;
}

type Tab = 'overview' | 'documents' | 'approvals' | 'budget' | 'progress' | 'handover';

export function OwnerPortalPreview({ project, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);
  const approvals = designClient.approvals.list(project.id);
  const docs = designClient.documents.list(project.id).filter((d) => d.audience === 'owner' && d.status !== 'not_yet');
  const photos = designClient.photos.list(project.id).filter((p) => p.ownerVisible);
  const items = designClient.budgetItems.listForOwner(project.id);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div
        style={{
          background: 'var(--color-background-tertiary)',
          width: '100%',
          maxWidth: 1080,
          maxHeight: '92vh',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Banner / preview marker */}
        <div style={{ background: 'var(--color-brand-accent)', color: '#fff', padding: '8px 16px', fontSize: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span><strong>OWNER PORTAL PREVIEW</strong> — what {counterparty?.fullName ?? 'the owner'} sees. Internal columns stripped.</span>
          <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', padding: '3px 10px', borderRadius: 'var(--radius-sm)', fontSize: 11 }}>Close preview</button>
        </div>

        {/* Header */}
        <div style={{ padding: '20px 24px', background: 'var(--color-background-primary)', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-friday-fad)', fontSize: 22, fontWeight: 500 }}>{project.name}</h2>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>
            {property?.name} · Design lead: {project.designLeadUserId?.replace('u-', '').replace('-ext', ' (Friday partner)') ?? 'TBD'}
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--color-text-secondary)' }}>
            <strong>What's happening now:</strong> {project.nextAction ?? 'On track.'}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, padding: '8px 16px', background: 'var(--color-background-primary)', borderBottom: '0.5px solid var(--color-border-tertiary)', overflowX: 'auto' }}>
          {(['overview','documents','approvals','budget','progress','handover'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                padding: '6px 14px',
                fontSize: 12,
                borderRadius: 'var(--radius-sm)',
                background: tab === t ? 'var(--color-brand-accent-soft)' : 'transparent',
                color: tab === t ? 'var(--color-brand-accent)' : 'var(--color-text-secondary)',
                fontWeight: tab === t ? 600 : 500,
                whiteSpace: 'nowrap',
              }}
            >
              {t === 'overview' ? 'Overview' :
               t === 'documents' ? `Documents (${docs.length})` :
               t === 'approvals' ? `Approvals (${approvals.filter((a) => a.state === 'sent').length})` :
               t === 'budget' ? 'Budget' :
               t === 'progress' ? 'Progress' :
               'Final handover'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {tab === 'overview' && <OverviewTab project={project} approvals={approvals} docs={docs} />}
          {tab === 'documents' && <DocsTab docs={docs} />}
          {tab === 'approvals' && <ApprovalsTab approvals={approvals} />}
          {tab === 'budget' && <BudgetTab items={items} />}
          {tab === 'progress' && <ProgressTab project={project} photos={photos} />}
          {tab === 'handover' && <HandoverTab project={project} />}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ project, approvals, docs }: { project: DesignProject; approvals: ReturnType<typeof designClient.approvals.list>; docs: ReturnType<typeof designClient.documents.list> }) {
  const pending = approvals.filter((a) => a.state === 'sent');
  const currentIndex = stageDef(project.currentStage).index;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Stage progress</div>
        <div style={{ display: 'flex', height: 8, background: 'var(--color-background-tertiary)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
          <div style={{ width: `${(currentIndex / STAGES.length) * 100}%`, background: 'var(--color-brand-accent)' }} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
          Stage {currentIndex} of {STAGES.length} · {STAGES[currentIndex - 1]?.label}
        </div>
      </div>

      {pending.length > 0 && (
        <div style={{ background: 'var(--color-bg-warning)', borderLeft: '3px solid var(--color-text-warning)', padding: 12, borderRadius: 'var(--radius-sm)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-warning)', marginBottom: 6 }}>Action needed from you</div>
          {pending.map((a) => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 6, fontSize: 12 }}>
              <span>{a.artifactType.replace(/_/g, ' ')}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" style={{ padding: '4px 10px', fontSize: 11, borderRadius: 'var(--radius-sm)', background: 'var(--color-text-success)', color: '#fff' }}>Approve</button>
                <button type="button" style={{ padding: '4px 10px', fontSize: 11, borderRadius: 'var(--radius-sm)', background: 'var(--color-background-primary)', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border-secondary)' }}>Request revision</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: 'var(--color-background-primary)', padding: 14, borderRadius: 'var(--radius-md)', border: '0.5px solid var(--color-border-tertiary)' }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Latest update</div>
        {docs.find((d) => d.type === 'weekly_update') ? (
          <div style={{ fontSize: 13 }}>
            Weekly update v{docs.find((d) => d.type === 'weekly_update')?.version} sent {docs.find((d) => d.type === 'weekly_update')?.generatedAt?.slice(0, 10)}.
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No updates yet.</div>
        )}
      </div>
    </div>
  );
}

function DocsTab({ docs }: { docs: ReturnType<typeof designClient.documents.list> }) {
  if (docs.length === 0) return <div style={{ color: 'var(--color-text-tertiary)' }}>No owner-shared documents yet.</div>;
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {docs.map((d) => (
        <li key={d.id} style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 12, display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 13 }}>{d.type.replace(/_/g, ' ')}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>v{d.version} · {d.generatedAt?.slice(0, 10) ?? '—'} · {d.status}</div>
          </div>
          {d.pdfUrl && <a href={d.pdfUrl} style={{ padding: '6px 12px', fontSize: 12, borderRadius: 'var(--radius-sm)', background: 'var(--color-brand-accent-soft)', color: 'var(--color-brand-accent)', textDecoration: 'none' }}>View</a>}
        </li>
      ))}
    </ul>
  );
}

function ApprovalsTab({ approvals }: { approvals: ReturnType<typeof designClient.approvals.list> }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {approvals.map((a) => (
        <li key={a.id} style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{a.artifactType.replace(/_/g, ' ')}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                {a.sentAt && `Sent ${a.sentAt.slice(0, 10)}`}{a.decidedAt && ` · Decided ${a.decidedAt.slice(0, 10)}`}{a.decisionMethod && ` via ${a.decisionMethod}`}
              </div>
            </div>
            <span style={{
              padding: '2px 10px', borderRadius: 'var(--radius-full)', fontSize: 10, fontWeight: 500,
              background: a.state === 'approved' ? 'var(--color-bg-success)' :
                          a.state === 'sent' ? 'var(--color-bg-warning)' :
                          'var(--color-background-tertiary)',
              color: a.state === 'approved' ? 'var(--color-text-success)' :
                     a.state === 'sent' ? 'var(--color-text-warning)' :
                     'var(--color-text-secondary)',
            }}>{a.state}</span>
          </div>
          {a.comments && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>"{a.comments}"</div>}
        </li>
      ))}
    </ul>
  );
}

function BudgetTab({ items }: { items: OwnerBudgetItem[] }) {
  const total = items.filter((i) => i.status === 'approved').reduce((s, i) => s + (i.finalApprovedCostMinor ?? 0), 0);
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
        ⓘ Internal cost columns (retail, negotiated, internal margin) intentionally hidden in your view.
      </div>
      <div style={{ background: 'var(--color-background-primary)', padding: 14, borderRadius: 'var(--radius-md)', marginBottom: 12, fontSize: 13 }}>
        <strong>Approved total:</strong> {formatMUR(total)}
      </div>
      <div style={{ overflowX: 'auto', background: 'var(--color-background-primary)', borderRadius: 'var(--radius-md)' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--color-text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              <th style={{ padding: '8px 10px', textAlign: 'left' }}>Item</th>
              <th style={{ padding: '8px 10px', textAlign: 'left' }}>Category</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Qty</th>
              <th style={{ padding: '8px 10px', textAlign: 'left' }}>Vendor</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Approved</th>
              <th style={{ padding: '8px 10px', textAlign: 'left' }}>Status</th>
              <th style={{ padding: '8px 10px', textAlign: 'left' }}>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                <td style={{ padding: '8px 10px' }}>{i.itemName}</td>
                <td style={{ padding: '8px 10px', color: 'var(--color-text-tertiary)' }}>{i.category}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono-fad)' }}>{i.qty}</td>
                <td style={{ padding: '8px 10px' }}>{i.vendorName ?? '—'}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono-fad)' }}>{formatMUR(i.finalApprovedCostMinor)}</td>
                <td style={{ padding: '8px 10px' }}>{i.status}</td>
                <td style={{ padding: '8px 10px' }}>{i.receiptUrl ? <a href={i.receiptUrl} style={{ color: 'var(--color-text-info)' }}>📄</a> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProgressTab({ project, photos }: { project: DesignProject; photos: ReturnType<typeof designClient.photos.list> }) {
  const activity = designClient.activity.list(project.id).filter((a) => a.kind !== 'override');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Recent updates</div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {activity.slice(0, 8).map((a) => (
            <li key={a.id} style={{ padding: 8, background: 'var(--color-background-primary)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
              <div>{a.summary}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2, fontFamily: 'var(--font-mono-fad)' }}>{a.at.slice(0, 10)}</div>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Photo gallery</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
          {photos.slice(0, 24).map((p) => (
            <div key={p.id} style={{ aspectRatio: '4 / 3', background: 'var(--color-background-primary)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 10 }}>
              {p.kind}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HandoverTab({ project }: { project: DesignProject }) {
  if (project.currentStage !== 'reconciliation' && !['done'].includes(project.stageStatus)) {
    return <div style={{ color: 'var(--color-text-tertiary)' }}>Available once project is complete. Currently at {project.currentStage}.</div>;
  }
  const items = designClient.budgetItems.list(project.id);
  const approved = items.filter((i) => i.status === 'approved').reduce((s, i) => s + (i.finalApprovedCostMinor ?? 0), 0);
  const paid = items.reduce((s, i) => s + (i.actualPaidMinor ?? 0), 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: 'var(--color-background-primary)', padding: 14, borderRadius: 'var(--radius-md)', fontSize: 13 }}>
        <strong>Project closed</strong>. Final handover bundle available below.
      </div>
      <div style={{ background: 'var(--color-background-primary)', padding: 14, borderRadius: 'var(--radius-md)', fontSize: 12 }}>
        <table style={{ width: '100%', fontSize: 12 }}>
          <tbody>
            <tr><td>Approved total</td><td style={{ textAlign: 'right', fontFamily: 'var(--font-mono-fad)' }}>{formatMUR(approved)}</td></tr>
            <tr><td>Actual spent</td><td style={{ textAlign: 'right', fontFamily: 'var(--font-mono-fad)' }}>{formatMUR(paid)}</td></tr>
            <tr style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}><td><strong>Variance</strong></td><td style={{ textAlign: 'right', fontFamily: 'var(--font-mono-fad)', fontWeight: 600 }}>{(() => { const v = paid - approved; if (v === 0) return formatMUR(0); return `${v > 0 ? '+' : '−'}${formatMUR(Math.abs(v))}`; })()}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
