'use client';

import { Fragment, useMemo, useState } from 'react';
import {
  designClient,
  formatMUR,
  type BudgetCategory,
  type BudgetItem,
  type CloseoutBinder,
  type DesignProject,
  type MaintenanceFrequency,
  type SnagSeverity,
  type SnagStatus,
  type WarrantyDuration,
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

      <CloseoutBinderSection project={project} />

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

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
        <a
          href={`/design-docs/${project.slug}/reconciliation`}
          target="_blank"
          rel="noopener"
          data-doc-link="reconciliation"
          style={{ ...secondaryBtn(), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
        >
          Open reconciliation print preview ↗
        </a>
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

// ─────────────────────────── CLOSEOUT BINDER (cont-18, audit B6) ───────────────────────────

const FREQUENCIES: MaintenanceFrequency[] = ['weekly', 'monthly', 'quarterly', 'biannually', 'annually', 'as_needed'];
const SEVERITIES: SnagSeverity[] = ['cosmetic', 'functional', 'critical'];
const DURATIONS: WarrantyDuration[] = [12, 24, 36, 60, 120];

function CloseoutBinderSection({ project }: { project: DesignProject }) {
  const [, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);
  const binder = designClient.binder.ensure(project.id);
  const [tab, setBTab] = useState<'warranties' | 'maintenance' | 'snags'>('warranties');
  const isLocked = binder.state === 'signed_off';
  const openSnags = binder.snags.filter((s) => s.status === 'open').length;

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div>
          <h4 style={subhead()}>Closeout binder</h4>
          <p style={{ margin: '0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            Owner-facing handover deliverable. Warranties indexed per item, maintenance schedule, snag list with sign-off.
            {' · '}
            <strong>{binder.warranties.length}</strong> warranties · <strong>{binder.maintenance.length}</strong> maintenance · <strong>{binder.snags.length}</strong> snags
            {openSnags > 0 && <span style={{ color: 'var(--color-text-warning)' }}> · {openSnags} open snag{openSnags === 1 ? '' : 's'}</span>}
          </p>
        </div>
        <BinderStateChip state={binder.state} />
      </div>

      <div role="tablist" aria-label="Closeout binder sections" style={{ display: 'flex', gap: 4, borderBottom: '0.5px solid var(--color-border-tertiary)', marginBottom: 12 }}>
        {(['warranties', 'maintenance', 'snags'] as const).map((id) => {
          const count = id === 'warranties' ? binder.warranties.length : id === 'maintenance' ? binder.maintenance.length : binder.snags.length;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setBTab(id)}
              data-design-binder-tab={id}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: tab === id ? 600 : 500,
                color: tab === id ? 'var(--color-brand-accent)' : 'var(--color-text-secondary)',
                borderBottom: tab === id ? '2px solid var(--color-brand-accent)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {id === 'warranties' ? 'Warranties' : id === 'maintenance' ? 'Maintenance' : 'Snag list'} ({count})
            </button>
          );
        })}
      </div>

      {tab === 'warranties' && <WarrantiesTab binder={binder} locked={isLocked} onChanged={bump} />}
      {tab === 'maintenance' && <MaintenanceTab binder={binder} locked={isLocked} onChanged={bump} />}
      {tab === 'snags' && <SnagsTab binder={binder} project={project} locked={isLocked} onChanged={bump} />}

      <BinderFooter binder={binder} onChanged={bump} />
    </Card>
  );
}

function BinderFooter({ binder, onChanged }: { binder: CloseoutBinder; onChanged: () => void }) {
  if (binder.state === 'signed_off') {
    return (
      <div style={{ marginTop: 12, padding: 10, background: 'var(--color-bg-success)', color: 'var(--color-text-success)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
        ✓ Owner signed off {binder.signedOffAt?.slice(0, 10)}
        {binder.signOffComment && <div style={{ marginTop: 4, fontStyle: 'italic' }}>"{binder.signOffComment}"</div>}
      </div>
    );
  }
  if (binder.state === 'sent') {
    return (
      <div style={{ marginTop: 12, padding: 10, background: 'var(--color-bg-info)', color: 'var(--color-text-info)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
        Sent to owner {binder.sentAt?.slice(0, 10)}. Edits locked until they sign off or request changes.
      </div>
    );
  }
  // draft
  const canSend = binder.warranties.length > 0 && binder.maintenance.length > 0;
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        {canSend ? 'Ready to send' : 'Add at least 1 warranty and 1 maintenance entry to send'}
      </span>
      <button
        type="button"
        disabled={!canSend}
        onClick={() => {
          if (designClient.binder.send(binder.id)) {
            fireToast('Closeout binder sent to owner — visible in their Final handover tab.');
            onChanged();
          }
        }}
        data-design-binder-send
        style={canSend ? primaryBtn() : { ...primaryBtn(), opacity: 0.5, cursor: 'not-allowed' }}
      >
        Send to owner
      </button>
    </div>
  );
}

function BinderStateChip({ state }: { state: CloseoutBinder['state'] }) {
  const c =
    state === 'draft'      ? { bg: 'var(--color-background-tertiary)', fg: 'var(--color-text-tertiary)', label: 'draft' } :
    state === 'sent'       ? { bg: 'var(--color-bg-info)',             fg: 'var(--color-text-info)',     label: 'awaiting owner' } :
                              { bg: 'var(--color-bg-success)',         fg: 'var(--color-text-success)',  label: 'signed off' };
  return <span style={{ padding: '2px 10px', background: c.bg, color: c.fg, borderRadius: 'var(--radius-full)', fontSize: 10, fontWeight: 500, alignSelf: 'flex-start' }}>{c.label}</span>;
}

// ─────────────────── Warranties ───────────────────

function WarrantiesTab({ binder, locked, onChanged }: { binder: CloseoutBinder; locked: boolean; onChanged: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {binder.warranties.length === 0 ? (
        <EmptyHint text="No warranties yet. Index every covered item — appliances, custom joinery, electrical workmanship — so the owner has one place to look when something fails." />
      ) : (
        <div style={{ overflowX: 'auto', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)' }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', minWidth: 540 }}>
            <thead>
              <tr style={{ color: 'var(--color-text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, background: 'var(--color-background-tertiary)' }}>
                <th style={cell('left')}>Item</th>
                <th style={cell('left')}>Vendor</th>
                <th style={cell('right')}>Duration</th>
                <th style={cell('right')}>From</th>
                <th style={cell('right')}>Expires</th>
                {!locked && <th style={cell('right')}> </th>}
              </tr>
            </thead>
            <tbody>
              {binder.warranties.map((w) => {
                const start = new Date(w.purchaseDate);
                const exp = new Date(start);
                exp.setMonth(exp.getMonth() + w.durationMonths);
                return (
                  <tr key={w.id} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                    <td style={cell('left')}>
                      <div style={{ fontWeight: 500 }}>{w.itemName}</div>
                      {w.notes && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{w.notes}</div>}
                    </td>
                    <td style={cell('left')}>{w.vendorName}</td>
                    <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{w.durationMonths} mo</td>
                    <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{w.purchaseDate}</td>
                    <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{exp.toISOString().slice(0, 10)}</td>
                    {!locked && (
                      <td style={cell('right')}>
                        <button
                          type="button"
                          onClick={() => {
                            if (designClient.binder.removeWarranty(binder.id, w.id)) {
                              fireToast('Warranty removed.');
                              onChanged();
                            }
                          }}
                          style={dangerLinkBtn()}
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!locked && (
        showAdd ? (
          <AddWarrantyForm
            onCancel={() => setShowAdd(false)}
            onSubmit={(input) => {
              if (designClient.binder.addWarranty(binder.id, input)) {
                fireToast('Warranty added.');
                setShowAdd(false);
                onChanged();
              }
            }}
          />
        ) : (
          <button type="button" onClick={() => setShowAdd(true)} style={secondaryBtnSmall()} data-design-binder-add-warranty>+ Add warranty</button>
        )
      )}
    </div>
  );
}

function AddWarrantyForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (input: { itemName: string; vendorName: string; vendorId: string | null; durationMonths: WarrantyDuration; purchaseDate: string; certificateUrl: string | null; notes: string | null }) => void }) {
  const [itemName, setItemName] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [duration, setDuration] = useState<WarrantyDuration>(24);
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const canSubmit = itemName.trim().length > 0 && vendorName.trim().length > 0;
  return (
    <div data-design-binder-add-warranty-form style={addFormStyle()}>
      <label style={fieldLabel()}>
        Item
        <input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder='e.g. "Bosch dishwasher SMS6ZCI42E"' style={inputStyle()} />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <label style={fieldLabel()}>
          Vendor
          <input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Vendor or installer" style={inputStyle()} />
        </label>
        <label style={fieldLabel()}>
          Duration
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value) as WarrantyDuration)} style={inputStyle()}>
            {DURATIONS.map((d) => <option key={d} value={d}>{d} months</option>)}
          </select>
        </label>
        <label style={fieldLabel()}>
          Purchase date
          <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} style={inputStyle()} />
        </label>
      </div>
      <label style={fieldLabel()}>
        Notes (optional)
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder='e.g. "Receipt required for service."' style={inputStyle()} />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onSubmit({ itemName: itemName.trim(), vendorName: vendorName.trim(), vendorId: null, durationMonths: duration, purchaseDate, certificateUrl: null, notes: notes.trim() === '' ? null : notes.trim() })}
          style={canSubmit ? primaryBtn() : { ...primaryBtn(), opacity: 0.5, cursor: 'not-allowed' }}
          data-design-binder-add-warranty-submit
        >
          Add warranty
        </button>
        <button type="button" onClick={onCancel} style={secondaryBtnSmall()}>Cancel</button>
      </div>
    </div>
  );
}

// ─────────────────── Maintenance ───────────────────

function MaintenanceTab({ binder, locked, onChanged }: { binder: CloseoutBinder; locked: boolean; onChanged: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {binder.maintenance.length === 0 ? (
        <EmptyHint text="No maintenance entries yet. Add scheduled care for anything Friday installed — sealing, regrouting, filter cleans, hardware checks. Owners forget; the binder reminds." />
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {binder.maintenance.map((m) => (
            <li key={m.id} style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 12 }}>{m.area} — {m.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4, lineHeight: 1.5 }}>{m.instructions}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, padding: '2px 8px', background: 'var(--color-background-tertiary)', color: 'var(--color-text-tertiary)', borderRadius: 'var(--radius-full)', textTransform: 'capitalize' }}>{m.frequency.replace(/_/g, ' ')}</span>
                  {!locked && (
                    <button
                      type="button"
                      onClick={() => {
                        if (designClient.binder.removeMaintenance(binder.id, m.id)) {
                          fireToast('Entry removed.');
                          onChanged();
                        }
                      }}
                      style={dangerLinkBtn()}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!locked && (
        showAdd ? (
          <AddMaintenanceForm
            onCancel={() => setShowAdd(false)}
            onSubmit={(input) => {
              if (designClient.binder.addMaintenance(binder.id, input)) {
                fireToast('Entry added.');
                setShowAdd(false);
                onChanged();
              }
            }}
          />
        ) : (
          <button type="button" onClick={() => setShowAdd(true)} style={secondaryBtnSmall()} data-design-binder-add-maintenance>+ Add maintenance entry</button>
        )
      )}
    </div>
  );
}

function AddMaintenanceForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (input: { area: string; title: string; frequency: MaintenanceFrequency; instructions: string }) => void }) {
  const [area, setArea] = useState('');
  const [title, setTitle] = useState('');
  const [frequency, setFrequency] = useState<MaintenanceFrequency>('annually');
  const [instructions, setInstructions] = useState('');
  const canSubmit = area.trim().length > 0 && title.trim().length > 0 && instructions.trim().length > 0;
  return (
    <div data-design-binder-add-maintenance-form style={addFormStyle()}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <label style={fieldLabel()}>
          Area
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder='e.g. "Kitchen worktop"' style={inputStyle()} />
        </label>
        <label style={fieldLabel()}>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder='e.g. "Re-seal granite edges"' style={inputStyle()} />
        </label>
        <label style={fieldLabel()}>
          Frequency
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as MaintenanceFrequency)} style={inputStyle()}>
            {FREQUENCIES.map((f) => <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
      </div>
      <label style={fieldLabel()}>
        Instructions
        <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} placeholder="Step-by-step what the owner (or their handyperson) should do." style={{ ...inputStyle(), resize: 'vertical', minHeight: 70 }} />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onSubmit({ area: area.trim(), title: title.trim(), frequency, instructions: instructions.trim() })}
          style={canSubmit ? primaryBtn() : { ...primaryBtn(), opacity: 0.5, cursor: 'not-allowed' }}
          data-design-binder-add-maintenance-submit
        >
          Add entry
        </button>
        <button type="button" onClick={onCancel} style={secondaryBtnSmall()}>Cancel</button>
      </div>
    </div>
  );
}

// ─────────────────── Snags ───────────────────

function SnagsTab({ binder, project, locked, onChanged }: { binder: CloseoutBinder; project: DesignProject; locked: boolean; onChanged: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const rooms = designClient.rooms.list(project.id);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {binder.snags.length === 0 ? (
        <EmptyHint text="No snags yet. Log every defect found during walk-through. Owner signs off each one — that's the audit trail when something resurfaces 6 months in." />
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {binder.snags.map((s) => {
            const room = rooms.find((r) => r.id === s.roomId);
            return (
              <li key={s.id} style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 12 }}>{s.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4, lineHeight: 1.5 }}>{s.description}</div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                      {room && `${room.name} · `}reported {s.reportedAt.slice(0, 10)}
                      {s.fixedAt && ` · fixed ${s.fixedAt.slice(0, 10)}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap' }}>
                    <SeverityChip severity={s.severity} />
                    <SnagStatusChip status={s.status} ownerSignOff={s.ownerSignOff} />
                  </div>
                </div>
                {!locked && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    {s.status === 'open' && (
                      <button
                        type="button"
                        onClick={() => {
                          if (designClient.binder.markSnagFixed(binder.id, s.id)) {
                            fireToast('Marked fixed.');
                            onChanged();
                          }
                        }}
                        style={secondaryBtnSmall()}
                      >
                        Mark fixed
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (designClient.binder.removeSnag(binder.id, s.id)) {
                          fireToast('Snag removed.');
                          onChanged();
                        }
                      }}
                      style={dangerLinkBtn()}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!locked && (
        showAdd ? (
          <AddSnagForm
            rooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
            onCancel={() => setShowAdd(false)}
            onSubmit={(input) => {
              if (designClient.binder.addSnag(binder.id, input)) {
                fireToast('Snag added.');
                setShowAdd(false);
                onChanged();
              }
            }}
          />
        ) : (
          <button type="button" onClick={() => setShowAdd(true)} style={secondaryBtnSmall()} data-design-binder-add-snag>+ Log snag</button>
        )
      )}
    </div>
  );
}

function AddSnagForm({ rooms, onCancel, onSubmit }: { rooms: { id: string; name: string }[]; onCancel: () => void; onSubmit: (input: { roomId: string | null; title: string; description: string; severity: SnagSeverity }) => void }) {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<SnagSeverity>('cosmetic');
  const canSubmit = title.trim().length > 0 && description.trim().length > 0;
  return (
    <div data-design-binder-add-snag-form style={addFormStyle()}>
      <label style={fieldLabel()}>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder='e.g. "Touch-up paint — living room west wall"' style={inputStyle()} />
      </label>
      <label style={fieldLabel()}>
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What's wrong, where, and what's the fix." style={{ ...inputStyle(), resize: 'vertical', minHeight: 50 }} />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <label style={fieldLabel()}>
          Room
          <select value={roomId ?? ''} onChange={(e) => setRoomId(e.target.value || null)} style={inputStyle()}>
            <option value="">— project-wide —</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label style={fieldLabel()}>
          Severity
          <select value={severity} onChange={(e) => setSeverity(e.target.value as SnagSeverity)} style={inputStyle()}>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onSubmit({ roomId, title: title.trim(), description: description.trim(), severity })}
          style={canSubmit ? primaryBtn() : { ...primaryBtn(), opacity: 0.5, cursor: 'not-allowed' }}
          data-design-binder-add-snag-submit
        >
          Log snag
        </button>
        <button type="button" onClick={onCancel} style={secondaryBtnSmall()}>Cancel</button>
      </div>
    </div>
  );
}

function SeverityChip({ severity }: { severity: SnagSeverity }) {
  const c =
    severity === 'critical'   ? { bg: 'var(--color-bg-danger)',  fg: 'var(--color-text-danger)' } :
    severity === 'functional' ? { bg: 'var(--color-bg-warning)', fg: 'var(--color-text-warning)' } :
                                 { bg: 'var(--color-background-tertiary)', fg: 'var(--color-text-tertiary)' };
  return <span style={{ padding: '2px 8px', background: c.bg, color: c.fg, borderRadius: 'var(--radius-full)', fontSize: 10, fontWeight: 500 }}>{severity}</span>;
}

function SnagStatusChip({ status, ownerSignOff }: { status: SnagStatus; ownerSignOff: 'pending' | 'accepted' | 'rejected' }) {
  if (status === 'accepted' || ownerSignOff === 'accepted') {
    return <span style={{ padding: '2px 8px', background: 'var(--color-bg-success)', color: 'var(--color-text-success)', borderRadius: 'var(--radius-full)', fontSize: 10, fontWeight: 500 }}>accepted</span>;
  }
  if (status === 'fixed') {
    return <span style={{ padding: '2px 8px', background: 'var(--color-bg-info)', color: 'var(--color-text-info)', borderRadius: 'var(--radius-full)', fontSize: 10, fontWeight: 500 }}>fixed · awaiting owner</span>;
  }
  return <span style={{ padding: '2px 8px', background: 'var(--color-bg-warning)', color: 'var(--color-text-warning)', borderRadius: 'var(--radius-full)', fontSize: 10, fontWeight: 500 }}>open</span>;
}

function EmptyHint({ text }: { text: string }) {
  return <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '8px 4px', lineHeight: 1.5 }}>{text}</div>;
}

// Local style helpers shared by the binder forms.
function fieldLabel(): React.CSSProperties { return { fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', flexDirection: 'column', gap: 4 }; }
function inputStyle(): React.CSSProperties { return { padding: '6px 8px', fontSize: 12, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }; }
function dangerLinkBtn(): React.CSSProperties { return { padding: '4px 0', fontSize: 11, color: 'var(--color-text-danger)', background: 'transparent', textDecoration: 'underline', fontWeight: 500 }; }
function secondaryBtnSmall(): React.CSSProperties { return { padding: '6px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)', fontSize: 12, fontWeight: 500, border: '0.5px solid var(--color-border-tertiary)' }; }
function addFormStyle(): React.CSSProperties { return { background: 'var(--color-background-tertiary)', border: '0.5px dashed var(--color-border-secondary)', borderRadius: 'var(--radius-sm)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }; }

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
