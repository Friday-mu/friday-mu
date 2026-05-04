'use client';

import { formatMUR, type OwnerBudgetItem } from '../../../../_data/design';

interface Props {
  items: OwnerBudgetItem[];
}

export function BudgetTab({ items }: Props) {
  const approvedTotal = items
    .filter((i) => i.status === 'approved')
    .reduce((s, i) => s + (i.finalApprovedCostMinor ?? 0), 0);
  const totalSaved = items.reduce((s, i) => s + (i.savedMinor ?? 0), 0);

  return (
    <div data-portal-budget-table>
      <div
        style={{
          fontSize: 11,
          color: 'var(--color-text-tertiary)',
          marginBottom: 12,
          lineHeight: 1.5,
        }}
      >
        ⓘ B3.1 disclosure — you see the supplier's retail price, the price Friday negotiated for
        you, and the savings passed through. Internal cost columns (margin, supplier negotiation
        history) are intentionally hidden.
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            background: 'var(--color-background-primary)',
            padding: 14,
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}
          >
            Approved total
          </div>
          <div
            style={{
              marginTop: 4,
              fontFamily: 'var(--font-mono-fad)',
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            {formatMUR(approvedTotal)}
          </div>
        </div>
        {totalSaved > 0 && (
          <div
            style={{
              background: 'var(--color-bg-success)',
              padding: 14,
              borderRadius: 'var(--radius-md)',
              fontSize: 13,
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: 'var(--color-text-success)',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}
            >
              Saved by Friday
            </div>
            <div
              style={{
                marginTop: 4,
                fontFamily: 'var(--font-mono-fad)',
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--color-text-success)',
              }}
            >
              {formatMUR(totalSaved)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-text-success)', marginTop: 2 }}>
              Pass-through to you
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          overflowX: 'auto',
          background: 'var(--color-background-primary)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr
              style={{
                color: 'var(--color-text-tertiary)',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}
            >
              <th style={th('left')}>Item</th>
              <th style={th('left')}>Category</th>
              <th style={th('right')}>Qty</th>
              <th style={th('left')}>Vendor</th>
              <th style={th('right')}>Retail</th>
              <th style={th('right')}>Friday-negotiated</th>
              <th style={th('right')}>Saved</th>
              <th style={th('right')}>Approved</th>
              <th style={th('left')}>Status</th>
              <th style={th('left')}>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                <td style={td('left')}>{i.itemName}</td>
                <td style={{ ...td('left'), color: 'var(--color-text-tertiary)' }}>{i.category}</td>
                <td style={td('right', true)}>{i.qty}</td>
                <td style={td('left')}>{i.vendorName ?? '—'}</td>
                <td
                  style={{
                    ...td('right', true),
                    color: 'var(--color-text-tertiary)',
                    textDecoration: i.retailCostMinor && i.negotiatedCostMinor && i.retailCostMinor > i.negotiatedCostMinor ? 'line-through' : 'none',
                  }}
                >
                  {i.retailCostMinor !== null ? formatMUR(i.retailCostMinor) : '—'}
                </td>
                <td style={{ ...td('right', true), fontWeight: 600 }}>
                  {i.negotiatedCostMinor !== null ? formatMUR(i.negotiatedCostMinor) : '—'}
                </td>
                <td style={{ ...td('right', true), color: i.savedMinor && i.savedMinor > 0 ? 'var(--color-text-success)' : 'var(--color-text-tertiary)' }}>
                  {i.savedMinor && i.savedMinor > 0 ? `−${formatMUR(i.savedMinor)}` : '—'}
                </td>
                <td style={td('right', true)}>{formatMUR(i.finalApprovedCostMinor)}</td>
                <td style={td('left')}>{i.status}</td>
                <td style={td('left')}>
                  {i.receiptUrl ? (
                    <a href={i.receiptUrl} style={{ color: 'var(--color-text-info)' }}>
                      📄
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function th(align: 'left' | 'right'): React.CSSProperties {
  return { padding: '8px 10px', textAlign: align };
}
function td(align: 'left' | 'right', mono = false): React.CSSProperties {
  return {
    padding: '8px 10px',
    textAlign: align,
    fontFamily: mono ? 'var(--font-mono-fad)' : undefined,
  };
}
