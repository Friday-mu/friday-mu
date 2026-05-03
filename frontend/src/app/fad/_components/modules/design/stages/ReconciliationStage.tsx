'use client';

import { Fragment, useMemo, useState } from 'react';
import {
  designClient,
  formatMUR,
  type BudgetCategory,
  type BudgetItem,
  type DesignProject,
} from '../../../../_data/design';
import { useCurrentRole } from '../../../usePermissions';
import { fireToast } from '../../../Toaster';
import { AIPlaceholder } from '../AIPlaceholder';

interface Props {
  project: DesignProject;
}

export function ReconciliationStage({ project }: Props) {
  const items = designClient.budgetItems.list(project.id);
  const role = useCurrentRole();
  const canSeeProfitability = role === 'director';
  const [openCat, setOpenCat] = useState<BudgetCategory | null>(null);

  const totals = useMemo(() => {
    const approved = items.filter((i) => i.status === 'approved').reduce((s, i) => s + (i.finalApprovedCostMinor ?? 0), 0);
    const paid = items.reduce((s, i) => s + (i.actualPaidMinor ?? 0), 0);
    const variance = paid - approved;
    return { approved, paid, variance };
  }, [items]);

  const byCategory = useMemo(() => {
    const cats: BudgetCategory[] = ['furniture','appliance','decor','lighting','linen','contractor','labour','transport','cleaning'];
    return cats.map((c) => {
      const arr = items.filter((i) => i.category === c);
      const approved = arr.filter((i) => i.status === 'approved').reduce((s, i) => s + (i.finalApprovedCostMinor ?? 0), 0);
      const paid = arr.reduce((s, i) => s + (i.actualPaidMinor ?? 0), 0);
      const variance = paid - approved;
      return { category: c, count: arr.length, approved, paid, variance, items: arr };
    }).filter((r) => r.count > 0);
  }, [items]);

  const profitability = useMemo(() => {
    const designFee = project.designFeeMinor ?? 0;
    const procurementFee = project.procurementFeeMinor ?? 0;
    const fridayRevenue = designFee + procurementFee;
    const internalCost = items.filter((i) => i.internalWork).reduce((s, i) => s + (i.finalApprovedCostMinor ?? 0), 0);
    const netMargin = fridayRevenue - internalCost;
    const marginPct = fridayRevenue > 0 ? (netMargin / fridayRevenue) * 100 : 0;
    return { designFee, procurementFee, fridayRevenue, internalCost, netMargin, marginPct };
  }, [project, items]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Reconciliation</h3>
          <AIPlaceholder feature="reconciliation-variance" label="Detect variances" size="sm" />
        </div>
      </Card>

      {/* Project totals */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <MetricCard label="Total approved" value={formatMUR(totals.approved)} />
        <MetricCard label="Total spent" value={formatMUR(totals.paid)} tone="info" />
        <MetricCard
          label="Variance"
          value={signedMUR(totals.variance)}
          tone={totals.variance > 0 ? 'warning' : totals.variance < 0 ? 'success' : 'neutral'}
        />
        <MetricCard
          label="Variance %"
          value={signedPct(totals.variance, totals.approved)}
          tone={Math.abs((totals.variance / Math.max(1, totals.approved)) * 100) > 5 ? 'warning' : 'neutral'}
        />
      </div>

      {/* By-category drilldown */}
      <Card>
        <h4 style={subhead()}>By category</h4>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--color-text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              <th style={cell('left')}>Category</th>
              <th style={cell('right')}>Items</th>
              <th style={cell('right')}>Approved</th>
              <th style={cell('right')}>Paid</th>
              <th style={cell('right')}>Variance</th>
              <th style={cell('right')}>%</th>
            </tr>
          </thead>
          <tbody>
            {byCategory.map((r) => {
              const variancePct = r.approved > 0 ? (r.variance / r.approved) * 100 : 0;
              const flagged = Math.abs(variancePct) > 5;
              return (
                <Fragment key={r.category}>
                  <tr
                    onClick={() => setOpenCat(openCat === r.category ? null : r.category)}
                    style={{ borderTop: '0.5px solid var(--color-border-tertiary)', cursor: 'pointer' }}
                  >
                    <td style={cell('left')}><strong>{r.category}</strong> {openCat === r.category ? '▾' : '▸'}</td>
                    <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{r.count}</td>
                    <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{formatMUR(r.approved)}</td>
                    <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{formatMUR(r.paid)}</td>
                    <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)', color: flagged ? 'var(--color-text-warning)' : 'var(--color-text-tertiary)' }}>
                      {signedMUR(r.variance)}
                    </td>
                    <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)', color: flagged ? 'var(--color-text-warning)' : 'var(--color-text-tertiary)' }}>
                      {variancePct >= 0 ? '+' : ''}{variancePct.toFixed(1)}%
                    </td>
                  </tr>
                  {openCat === r.category && (
                    <tr>
                      <td colSpan={6} style={{ padding: 0 }}>
                        <CategoryDrilldown items={r.items} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Variance explanations placeholder */}
      <Card>
        <h4 style={subhead()}>Variance explanations <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)' }}>· auto-prompted on items &gt;5%</span></h4>
        <textarea
          rows={3}
          placeholder="Owner-facing notes explaining material variances. v0.2: AI auto-drafts."
          style={{ width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', resize: 'vertical' }}
        />
      </Card>

      {/* Internal profitability — admin only */}
      {canSeeProfitability && (
        <Card>
          <h4 style={subhead()}>Internal profitability <span style={{ fontWeight: 400, color: 'var(--color-text-warning)' }}>· admin only · NEVER shown to owner</span></h4>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={cell('left')}>Design fee revenue</td><td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{formatMUR(profitability.designFee)}</td></tr>
              <tr><td style={cell('left')}>Procurement fee revenue</td><td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{formatMUR(profitability.procurementFee)}</td></tr>
              <tr style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}><td style={cell('left')}><strong>Total Friday revenue</strong></td><td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)', fontWeight: 600 }}>{formatMUR(profitability.fridayRevenue)}</td></tr>
              <tr><td style={cell('left')}>Internal work costs</td><td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{formatMUR(profitability.internalCost)}</td></tr>
              <tr style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                <td style={cell('left')}><strong>Net margin</strong></td>
                <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)', fontWeight: 700, color: 'var(--color-text-success)' }}>{formatMUR(profitability.netMargin)}</td>
              </tr>
              <tr><td style={cell('left')}>Margin %</td><td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{profitability.marginPct.toFixed(1)}%</td></tr>
            </tbody>
          </table>
        </Card>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={() => fireToast('Reconciliation report generated (mock)')} style={secondaryBtn()}>Generate reconciliation report</button>
        {canSeeProfitability && <button type="button" onClick={() => fireToast('Internal profitability report generated — admin only PDF')} style={primaryBtn()}>Generate profitability report</button>}
      </div>
    </div>
  );
}

function CategoryDrilldown({ items }: { items: BudgetItem[] }) {
  return (
    <div style={{ background: 'var(--color-background-tertiary)', padding: 8 }}>
      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: 'var(--color-text-tertiary)', fontSize: 10 }}>
            <th style={cell('left')}>Item</th>
            <th style={cell('right')}>Approved</th>
            <th style={cell('right')}>Paid</th>
            <th style={cell('right')}>Δ</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const v = (i.actualPaidMinor ?? 0) - (i.finalApprovedCostMinor ?? 0);
            return (
              <tr key={i.id} style={{ borderTop: '0.5px dashed var(--color-border-tertiary)' }}>
                <td style={cell('left')}>{i.itemName}</td>
                <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{formatMUR(i.finalApprovedCostMinor)}</td>
                <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{formatMUR(i.actualPaidMinor)}</td>
                <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)', color: v > 0 ? 'var(--color-text-warning)' : v < 0 ? 'var(--color-text-success)' : 'var(--color-text-tertiary)' }}>
                  {signedMUR(v)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function signedMUR(minor: number): string {
  if (minor === 0) return formatMUR(0);
  const sign = minor > 0 ? '+' : '−';
  return `${sign}${formatMUR(Math.abs(minor)).replace('Rs ', 'Rs ')}`;
}

function signedPct(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0%';
  const pct = (numerator / denominator) * 100;
  if (pct === 0) return '0%';
  const sign = pct > 0 ? '+' : '−';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone?: 'info' | 'warning' | 'success' | 'neutral' | 'accent' }) {
  const color =
    tone === 'info'    ? 'var(--color-text-info)' :
    tone === 'warning' ? 'var(--color-text-warning)' :
    tone === 'success' ? 'var(--color-text-success)' :
    tone === 'accent'  ? 'var(--color-brand-accent)' :
                          'var(--color-text-primary)';
  return (
    <div style={{ padding: 12, background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color, marginTop: 4, fontFamily: 'var(--font-mono-fad)' }}>{value}</div>
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
