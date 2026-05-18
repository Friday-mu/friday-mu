'use client';

import { useMemo, useState } from 'react';
import {
  INQUIRIES,
  INQUIRY_STATUS_LABEL,
  formatMoney,
  type Inquiry,
  type InquiryStatus,
} from '../../../_data/reservations';
import { fireToast } from '../../Toaster';

interface Props {
  onOpenReservation: (reservationId: string) => void;
}

const ACTIVE_STATUSES: InquiryStatus[] = ['pending_quote', 'quote_sent', 'guest_reviewing'];

function statusToneClass(s: InquiryStatus): string {
  switch (s) {
    case 'pending_quote':
      return 'warn';
    case 'quote_sent':
    case 'guest_reviewing':
      return 'info';
    case 'converted':
      return '';
    case 'abandoned':
      return '';
  }
}

function daysSince(iso: string): number {
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  return Math.max(0, Math.round(days));
}

export function InquiriesPage({ onOpenReservation }: Props) {
  const [statusFilter, setStatusFilter] = useState<'active' | InquiryStatus | 'all'>('active');

  const filtered = useMemo(() => {
    let list = [...INQUIRIES];
    if (statusFilter === 'active') {
      list = list.filter((i) => ACTIVE_STATUSES.includes(i.status));
    } else if (statusFilter !== 'all') {
      list = list.filter((i) => i.status === statusFilter);
    }
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { active: 0 };
    for (const i of INQUIRIES) {
      c[i.status] = (c[i.status] || 0) + 1;
      if (ACTIVE_STATUSES.includes(i.status)) c.active = (c.active || 0) + 1;
    }
    return c;
  }, []);

  // Conversion rate metric — funnel signal per scoping pack §9.
  const conversionRate = useMemo(() => {
    const settled = INQUIRIES.filter((i) => i.status === 'converted' || i.status === 'abandoned');
    if (settled.length === 0) return null;
    const converted = settled.filter((i) => i.status === 'converted').length;
    return Math.round((converted / settled.length) * 100);
  }, []);

  const handleConvert = (inq: Inquiry) => {
    if (inq.status === 'converted' && inq.convertedToReservationId) {
      onOpenReservation(inq.convertedToReservationId);
      return;
    }
    fireToast('Convert to reservation — Phase 2 triggers Guesty confirmation + creates Reservation (per scoping pack §9).');
  };

  const handleSendQuote = (inq: Inquiry) => {
    fireToast(`Send quote — opens Calendar Find-availability with ${inq.propertyCodes.length} property pre-selected. Phase 2 generates friday.mu link via Guesty quote-builder.`);
  };

  return (
    <div className="fad-module-body" style={{ flex: 1, overflowY: 'auto' }}>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Active inquiries</div>
          <div className="kpi-value">{counts.active}</div>
          <div className="kpi-sub">awaiting response or conversion</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Converted</div>
          <div className="kpi-value">{counts.converted || 0}</div>
          <div className="kpi-sub">linked reservations</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Abandoned</div>
          <div className="kpi-value">{counts.abandoned || 0}</div>
          <div className="kpi-sub">→ Leads/CRM-lite when that ships</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Conversion rate</div>
          <div className="kpi-value">{conversionRate !== null ? `${conversionRate}%` : '—'}</div>
          <div className="kpi-sub">of settled inquiries</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        {(['active', 'pending_quote', 'quote_sent', 'guest_reviewing', 'converted', 'abandoned', 'all'] as const).map((s) => (
          <button
            key={s}
            className={'btn ghost sm' + (statusFilter === s ? ' active' : '')}
            onClick={() => setStatusFilter(s)}
          >
            {s === 'active' ? 'Active' : s === 'all' ? 'All' : INQUIRY_STATUS_LABEL[s]}
            {s === 'active' && counts.active > 0 ? ` · ${counts.active}` : ''}
            {s !== 'active' && s !== 'all' && counts[s] ? ` · ${counts[s]}` : ''}
          </button>
        ))}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            No inquiries match this filter.
          </div>
        )}
        {filtered.map((inq, i) => (
          <div
            key={inq.id}
            style={{
              padding: '14px 16px',
              borderBottom: i < filtered.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 0,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontWeight: 500 }}>{inq.guestName}</span>
                  <span className={'chip sm ' + statusToneClass(inq.status)}>{INQUIRY_STATUS_LABEL[inq.status]}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                    via {inq.source}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  {inq.propertyCodes.length === 1 ? '1 property' : `${inq.propertyCodes.length} properties`} · {' '}
                  <span className="mono">{inq.propertyCodes.join(' · ')}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                  {inq.checkIn.slice(5, 10)} → {inq.checkOut.slice(5, 10)} · {' '}
                  {inq.partySize.adults}A
                  {inq.partySize.children ? `+${inq.partySize.children}C` : ''}
                  {inq.partySize.infants ? `+${inq.partySize.infants}I` : ''}
                </div>
                {inq.notes && (
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
                    {inq.notes}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', minWidth: 110 }}>
                {inq.quoteAmount && (
                  <div className="mono" style={{ fontSize: 13, fontWeight: 500 }}>
                    {formatMoney(inq.quoteAmount, inq.currency)}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                  {daysSince(inq.updatedAt)}d ago
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {inq.status === 'pending_quote' && (
                <button className="btn primary sm" onClick={() => handleSendQuote(inq)}>
                  Send quote
                </button>
              )}
              {(inq.status === 'quote_sent' || inq.status === 'guest_reviewing') && (
                <>
                  <button className="btn primary sm" onClick={() => handleConvert(inq)}>
                    Convert to reservation
                  </button>
                  <button className="btn ghost sm" onClick={() => fireToast(`Re-send quote link — ${inq.quoteLink || 'No link yet'}`)}>
                    Re-send link
                  </button>
                </>
              )}
              {inq.status === 'converted' && inq.convertedToReservationId && (
                <button className="btn sm" onClick={() => onOpenReservation(inq.convertedToReservationId!)}>
                  View reservation →
                </button>
              )}
              {inq.status === 'abandoned' && (
                <button
                  className="btn ghost sm"
                  onClick={() => fireToast('Re-engage — wires to Leads/CRM-lite when that module ships (parking-lot per decisions log §7).')}
                >
                  Re-engage
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
