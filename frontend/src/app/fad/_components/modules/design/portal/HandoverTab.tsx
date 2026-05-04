'use client';

import { useState } from 'react';
import {
  designClient,
  formatMUR,
  type CloseoutBinder,
  type DesignProject,
  type MaintenanceGuide,
  type SnagItem,
  type WarrantyRecord,
} from '../../../../_data/design';

interface Props {
  project: DesignProject;
}

export function HandoverTab({ project }: Props) {
  const [, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);
  const isClosed =
    project.currentStage === 'reconciliation' || project.stageStatus === 'done';

  const binder = designClient.binder.get(project.id);

  if (!isClosed && (!binder || binder.state === 'draft')) {
    return (
      <div style={{ color: 'var(--color-text-tertiary)' }}>
        Available once the project is complete. Currently at{' '}
        <strong>{project.currentStage}</strong>.
      </div>
    );
  }

  const items = designClient.budgetItems.list(project.id);
  const approved = items
    .filter((i) => i.status === 'approved')
    .reduce((s, i) => s + (i.finalApprovedCostMinor ?? 0), 0);
  const paid = items.reduce((s, i) => s + (i.actualPaidMinor ?? 0), 0);
  const variance = paid - approved;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          background: binder?.state === 'signed_off' ? 'var(--color-bg-success)' : 'var(--color-background-primary)',
          color: binder?.state === 'signed_off' ? 'var(--color-text-success)' : 'var(--color-text-primary)',
          padding: 14,
          borderRadius: 'var(--radius-md)',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {binder?.state === 'signed_off'
          ? `Project closed and binder signed off ${binder.signedOffAt?.slice(0, 10)}.`
          : 'Project closed. Final handover bundle below.'}
      </div>

      <SummaryCard approved={approved} paid={paid} variance={variance} />

      {binder && binder.state !== 'draft' && (
        <BinderView binder={binder} onChanged={bump} />
      )}
    </div>
  );
}

function SummaryCard({ approved, paid, variance }: { approved: number; paid: number; variance: number }) {
  return (
    <div
      style={{
        background: 'var(--color-background-primary)',
        padding: 14,
        borderRadius: 'var(--radius-md)',
        fontSize: 12,
      }}
    >
      <div style={sectionHeading()}>Final reconciliation</div>
      <table style={{ width: '100%', fontSize: 12 }}>
        <tbody>
          <tr>
            <td>Approved total</td>
            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono-fad)' }}>{formatMUR(approved)}</td>
          </tr>
          <tr>
            <td>Actual spent</td>
            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono-fad)' }}>{formatMUR(paid)}</td>
          </tr>
          <tr style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
            <td><strong>Variance</strong></td>
            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono-fad)', fontWeight: 600 }}>
              {variance === 0
                ? formatMUR(0)
                : `${variance > 0 ? '+' : '−'}${formatMUR(Math.abs(variance))}`}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BinderView({ binder, onChanged }: { binder: CloseoutBinder; onChanged: () => void }) {
  const [showSignOff, setShowSignOff] = useState(false);
  const [comment, setComment] = useState('');
  const isSigned = binder.state === 'signed_off';
  const allSnagsResolved = binder.snags.every((s) => s.status === 'accepted' || s.status === 'fixed');

  return (
    <div data-portal-binder style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <WarrantiesPanel warranties={binder.warranties} />
      <MaintenancePanel maintenance={binder.maintenance} />
      <SnagsPanel binder={binder} onChanged={onChanged} locked={isSigned} />

      {!isSigned && (
        <div
          style={{
            background: 'var(--color-background-primary)',
            border: '0.5px solid var(--color-border-tertiary)',
            borderRadius: 'var(--radius-md)',
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            Once you've reviewed each section and accepted the snag-list items, sign off below to close the project formally. Friday keeps this binder available for reference.
          </div>
          {!allSnagsResolved && (
            <div style={{ fontSize: 11, color: 'var(--color-text-warning)' }}>
              Note: there are open snag items. You can still sign off, but Friday will follow up to clear them.
            </div>
          )}
          {showSignOff ? (
            <>
              <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                Optional comment
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  placeholder='e.g. "All good. Thanks team."'
                  style={{
                    padding: '8px 10px',
                    fontSize: 12,
                    border: '0.5px solid var(--color-border-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-background-primary)',
                    color: 'var(--color-text-primary)',
                    resize: 'vertical',
                  }}
                />
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  data-portal-binder-confirm-signoff
                  onClick={() => {
                    if (designClient.binder.signOff(binder.id, comment.trim() === '' ? null : comment.trim())) {
                      onChanged();
                    }
                  }}
                  style={{
                    padding: '8px 14px',
                    fontSize: 12,
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-text-success)',
                    color: '#fff',
                    fontWeight: 500,
                  }}
                >
                  Sign off — close project
                </button>
                <button
                  type="button"
                  onClick={() => { setShowSignOff(false); setComment(''); }}
                  style={{
                    padding: '8px 14px',
                    fontSize: 12,
                    borderRadius: 'var(--radius-sm)',
                    background: 'transparent',
                    color: 'var(--color-text-secondary)',
                    border: '0.5px solid var(--color-border-secondary)',
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              data-portal-binder-signoff
              onClick={() => setShowSignOff(true)}
              style={{
                padding: '8px 14px',
                fontSize: 12,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-text-success)',
                color: '#fff',
                fontWeight: 500,
                alignSelf: 'flex-start',
              }}
            >
              Sign off binder
            </button>
          )}
        </div>
      )}

      {isSigned && binder.signOffComment && (
        <div style={{ background: 'var(--color-background-tertiary)', padding: 12, borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
          "{binder.signOffComment}"
        </div>
      )}
    </div>
  );
}

function WarrantiesPanel({ warranties }: { warranties: WarrantyRecord[] }) {
  if (warranties.length === 0) return null;
  return (
    <div data-portal-binder-warranties style={panelStyle()}>
      <div style={sectionHeading()}>Warranties ({warranties.length})</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', minWidth: 460 }}>
          <thead>
            <tr style={{ color: 'var(--color-text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              <th style={th('left')}>Item</th>
              <th style={th('left')}>Vendor</th>
              <th style={th('right')}>Duration</th>
              <th style={th('right')}>Expires</th>
            </tr>
          </thead>
          <tbody>
            {warranties.map((w) => {
              const start = new Date(w.purchaseDate);
              const exp = new Date(start);
              exp.setMonth(exp.getMonth() + w.durationMonths);
              return (
                <tr key={w.id} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                  <td style={td('left')}>
                    <div style={{ fontWeight: 500 }}>{w.itemName}</div>
                    {w.notes && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{w.notes}</div>}
                  </td>
                  <td style={td('left')}>{w.vendorName}</td>
                  <td style={{ ...td('right'), fontFamily: 'var(--font-mono-fad)' }}>{w.durationMonths} mo</td>
                  <td style={{ ...td('right'), fontFamily: 'var(--font-mono-fad)' }}>{exp.toISOString().slice(0, 10)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MaintenancePanel({ maintenance }: { maintenance: MaintenanceGuide[] }) {
  if (maintenance.length === 0) return null;
  return (
    <div data-portal-binder-maintenance style={panelStyle()}>
      <div style={sectionHeading()}>Care &amp; maintenance ({maintenance.length})</div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {maintenance.map((m) => (
          <li key={m.id} style={{ background: 'var(--color-background-tertiary)', borderRadius: 'var(--radius-sm)', padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <div style={{ fontWeight: 500, fontSize: 12 }}>{m.area} — {m.title}</div>
              <span style={{ fontSize: 10, padding: '2px 8px', background: 'var(--color-background-primary)', color: 'var(--color-text-tertiary)', borderRadius: 'var(--radius-full)', textTransform: 'capitalize' }}>{m.frequency.replace(/_/g, ' ')}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 6, lineHeight: 1.5 }}>{m.instructions}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SnagsPanel({ binder, onChanged, locked }: { binder: CloseoutBinder; onChanged: () => void; locked: boolean }) {
  if (binder.snags.length === 0) return null;
  return (
    <div data-portal-binder-snags style={panelStyle()}>
      <div style={sectionHeading()}>Snag list ({binder.snags.length})</div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {binder.snags.map((s) => (
          <SnagRow
            key={s.id}
            snag={s}
            locked={locked}
            onAccept={() => {
              if (designClient.binder.acceptSnag(binder.id, s.id)) onChanged();
            }}
          />
        ))}
      </ul>
    </div>
  );
}

function SnagRow({ snag, locked, onAccept }: { snag: SnagItem; locked: boolean; onAccept: () => void }) {
  const isAccepted = snag.status === 'accepted' || snag.ownerSignOff === 'accepted';
  return (
    <li
      data-portal-snag={snag.id}
      style={{
        background: isAccepted ? 'var(--color-bg-success)' : 'var(--color-background-tertiary)',
        borderRadius: 'var(--radius-sm)',
        padding: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 12 }}>{snag.title}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4, lineHeight: 1.5 }}>{snag.description}</div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            Reported {snag.reportedAt.slice(0, 10)}
            {snag.fixedAt && ` · fixed ${snag.fixedAt.slice(0, 10)}`}
          </div>
        </div>
        <span
          style={{
            padding: '2px 10px',
            borderRadius: 'var(--radius-full)',
            fontSize: 10,
            fontWeight: 500,
            alignSelf: 'flex-start',
            background: isAccepted ? 'var(--color-text-success)' : snag.status === 'fixed' ? 'var(--color-bg-info)' : 'var(--color-bg-warning)',
            color: isAccepted ? '#fff' : snag.status === 'fixed' ? 'var(--color-text-info)' : 'var(--color-text-warning)',
          }}
        >
          {isAccepted ? 'Accepted' : snag.status === 'fixed' ? 'Fixed · review' : 'Open'}
        </span>
      </div>
      {!locked && !isAccepted && snag.status === 'fixed' && (
        <button
          type="button"
          data-portal-snag-accept={snag.id}
          onClick={onAccept}
          style={{
            marginTop: 8,
            padding: '6px 12px',
            fontSize: 11,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-text-success)',
            color: '#fff',
            fontWeight: 500,
          }}
        >
          Accept fix
        </button>
      )}
    </li>
  );
}

function panelStyle(): React.CSSProperties {
  return {
    background: 'var(--color-background-primary)',
    padding: 14,
    borderRadius: 'var(--radius-md)',
  };
}
function sectionHeading(): React.CSSProperties {
  return {
    fontSize: 11,
    color: 'var(--color-text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 10,
    fontWeight: 600,
  };
}
function th(align: 'left' | 'right'): React.CSSProperties {
  return { padding: '6px 8px', textAlign: align };
}
function td(align: 'left' | 'right'): React.CSSProperties {
  return { padding: '6px 8px', textAlign: align };
}
