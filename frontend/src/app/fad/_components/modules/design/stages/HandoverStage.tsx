'use client';

import { useMemo, useState } from 'react';
import {
  designClient,
  formatMUR,
  type DesignProject,
} from '../../../../_data/design';
import { fireToast } from '../../../Toaster';
import { AIPlaceholder } from '../AIPlaceholder';

interface Props {
  project: DesignProject;
}

export function HandoverStage({ project }: Props) {
  const photos = designClient.photos.list(project.id);
  const items = designClient.budgetItems.list(project.id);
  const payments = designClient.payments.list(project.id);
  const [recommendations, setRecommendations] = useState('');
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(() => new Set(photos.slice(0, 6).map((p) => p.id)));

  const balance = useMemo(() => {
    const approved = items.filter((i) => i.status === 'approved').reduce((s, i) => s + (i.finalApprovedCostMinor ?? 0), 0);
    const paid = items.reduce((s, i) => s + (i.actualPaidMinor ?? 0), 0);
    const fundsReceived = payments.filter((g) => g.id === 'project_funds' && g.status === 'received').reduce((s, g) => s + (g.amountMinor ?? 0), 0);
    const surplus = fundsReceived - paid;
    return { approved, paid, fundsReceived, surplus };
  }, [items, payments]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Final handover bundle</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Builds a single PDF: design pack + final budget + reconciliation + before/after photos + recommendations.
            </p>
          </div>
          <AIPlaceholder feature="handover-report" label="Generate report" size="sm" />
        </div>
      </Card>

      {/* Auto-included artifacts */}
      <Card>
        <h4 style={subhead()}>Auto-included</h4>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { label: 'Final design pack (latest approved)', source: designClient.designPacks.list(project.id)[0]?.id ?? null },
            { label: 'Final procurement budget (owner view)', source: 'final-budget' },
            { label: 'Reconciliation report', source: 'reconciliation' },
            { label: 'Owner balance summary', source: 'balance' },
          ].map((row, i) => (
            <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: 8, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
              <span>{row.label}</span>
              <span style={{ color: row.source ? 'var(--color-text-success)' : 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono-fad)', fontSize: 11 }}>
                {row.source ? '✓ available' : '— missing'}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Before/after photo selection */}
      <Card>
        <h4 style={subhead()}>Before/after photo selection <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)' }}>· {selectedPhotoIds.size} selected</span></h4>
        <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Curate from site visit + execution photos. Owner-shareable defaults pre-checked.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
          {photos.map((p) => {
            const sel = selectedPhotoIds.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPhotoIds((prev) => { const next = new Set(prev); next.has(p.id) ? next.delete(p.id) : next.add(p.id); return next; })}
                style={{
                  aspectRatio: '4 / 3',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-background-tertiary)',
                  border: sel ? '2px solid var(--color-brand-accent)' : '0.5px solid var(--color-border-tertiary)',
                  position: 'relative',
                  overflow: 'hidden',
                  padding: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-tertiary)', fontSize: 10 }}>
                  {p.kind} · {p.id.slice(-4)}
                </div>
                {sel && <span style={{ position: 'absolute', top: 4, right: 4, background: 'var(--color-brand-accent)', color: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>✓</span>}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Recommendations */}
      <Card>
        <h4 style={subhead()}>Remaining recommendations (owner-facing)</h4>
        <textarea
          value={recommendations}
          onChange={(e) => setRecommendations(e.target.value)}
          rows={4}
          placeholder="What we noted but did not execute — for owner's future plans."
          style={{ width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', resize: 'vertical' }}
        />
      </Card>

      {/* Owner balance */}
      <Card>
        <h4 style={subhead()}>Owner balance summary</h4>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td style={cell('left')}>Project funds received</td><td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{formatMUR(balance.fundsReceived)}</td></tr>
            <tr><td style={cell('left')}>Total approved spend</td><td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{formatMUR(balance.approved)}</td></tr>
            <tr><td style={cell('left')}>Actual paid</td><td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{formatMUR(balance.paid)}</td></tr>
            <tr style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
              <td style={cell('left')}><strong>Surplus / refund due</strong></td>
              <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)', fontWeight: 600, color: balance.surplus >= 0 ? 'var(--color-text-success)' : 'var(--color-text-danger)' }}>
                {balance.surplus === 0 ? formatMUR(0) : `${balance.surplus > 0 ? '+' : '−'}${formatMUR(Math.abs(balance.surplus))}`}
              </td>
            </tr>
          </tbody>
        </table>
        <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Per agreement §4.2: surplus refunded OR retained as STR working capital (per Annex B opt-in).
        </p>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
        <a
          href={`/design-docs/${project.slug}/closeout-binder`}
          target="_blank"
          rel="noopener"
          data-doc-link="closeout-binder"
          style={{ ...secondaryBtn(), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
        >
          Open closeout binder preview ↗
        </a>
        <button type="button" onClick={() => fireToast('Sent to owner via portal + email (mock)')} style={secondaryBtn()}>Send to owner</button>
        <button type="button" onClick={() => fireToast('Project marked complete (mock)')} style={primaryBtn()}>Mark project complete</button>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 14 }}>{children}</div>;
}
function subhead(): React.CSSProperties { return { margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }; }
function cell(align: 'left' | 'right'): React.CSSProperties { return { padding: '6px 8px', textAlign: align }; }
function primaryBtn(): React.CSSProperties { return { padding: '8px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--color-brand-accent)', color: '#fff', fontSize: 13, fontWeight: 500 }; }
function secondaryBtn(): React.CSSProperties { return { padding: '8px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)', fontSize: 13 }; }
