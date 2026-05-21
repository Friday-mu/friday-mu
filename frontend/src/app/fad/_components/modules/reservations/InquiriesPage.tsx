'use client';

import { useMemo, useState } from 'react';
import { useWebsiteInquiryThreads, type WebsiteThreadStatus } from '../../../_data/websiteInboxClient';
import { fireToast } from '../../Toaster';

interface Props {
  onOpenReservation: (reservationId: string) => void;
}

const STATUS_LABEL: Record<WebsiteThreadStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  paid: 'Paid',
  closed: 'Closed',
};

function statusToneClass(s: WebsiteThreadStatus): string {
  switch (s) {
    case 'open':
      return 'warn';
    case 'in_progress':
      return 'info';
    case 'paid':
    case 'closed':
      return '';
  }
}

function daysSince(iso: string): number {
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  return Math.max(0, Math.round(days));
}

export function InquiriesPage({ onOpenReservation }: Props) {
  const [statusFilter, setStatusFilter] = useState<'active' | WebsiteThreadStatus | 'all'>('active');
  const { threads, loading, error, refetch } = useWebsiteInquiryThreads();
  const rows = threads ?? [];

  const filtered = useMemo(() => {
    let list = [...rows];
    if (statusFilter === 'active') {
      list = list.filter((i) => i.status === 'open' || i.status === 'in_progress');
    } else if (statusFilter !== 'all') {
      list = list.filter((i) => i.status === statusFilter);
    }
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [rows, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { active: 0 };
    for (const i of rows) {
      c[i.status] = (c[i.status] || 0) + 1;
      if (i.status === 'open' || i.status === 'in_progress') c.active = (c.active || 0) + 1;
    }
    return c;
  }, [rows]);

  const conversionRate = useMemo(() => {
    const settled = rows.filter((i) => i.status === 'paid' || i.status === 'closed');
    if (settled.length === 0) return null;
    const converted = settled.filter((i) => i.status === 'paid').length;
    return Math.round((converted / settled.length) * 100);
  }, [rows]);

  const handleOpenReservation = (reservationId?: string) => {
    if (reservationId) {
      onOpenReservation(reservationId);
      return;
    }
    fireToast('No Guesty reservation is linked to this website inquiry yet.');
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
          <div className="kpi-value">{counts.paid || 0}</div>
          <div className="kpi-sub">paid website threads</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Closed</div>
          <div className="kpi-value">{counts.closed || 0}</div>
          <div className="kpi-sub">archived website inquiries</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Conversion rate</div>
          <div className="kpi-value">{conversionRate !== null ? `${conversionRate}%` : '—'}</div>
          <div className="kpi-sub">of settled inquiries</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        {(['active', 'open', 'in_progress', 'paid', 'closed', 'all'] as const).map((s) => (
          <button
            key={s}
            className={'btn ghost sm' + (statusFilter === s ? ' active' : '')}
            onClick={() => setStatusFilter(s)}
          >
            {s === 'active' ? 'Active' : s === 'all' ? 'All' : STATUS_LABEL[s]}
            {s === 'active' && counts.active > 0 ? ` · ${counts.active}` : ''}
            {s !== 'active' && s !== 'all' && counts[s] ? ` · ${counts[s]}` : ''}
          </button>
        ))}
        <button className="btn sm" onClick={refetch} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {error && (
          <div style={{ padding: 16, color: 'var(--color-status-error)', fontSize: 13 }}>
            Failed to load website inquiries: {error}
          </div>
        )}
        {loading && rows.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            Loading website inquiries…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            No live website inquiries match this filter.
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
                  <span className={'chip sm ' + statusToneClass(inq.status)}>{STATUS_LABEL[inq.status]}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                    via website
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  {inq.guestEmail || 'No email captured'}
                  {inq.guestPhone ? ` · ${inq.guestPhone}` : ''}
                  {inq.propertyCode ? <> · <span className="mono">{inq.propertyCode}</span></> : null}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                  {inq.lastEventType || 'website inquiry'} · {inq.eventCount} event{inq.eventCount === 1 ? '' : 's'}
                </div>
                {inq.notes || inq.subject ? (
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
                    {inq.notes || inq.subject}
                  </div>
                ) : null}
              </div>
              <div style={{ textAlign: 'right', minWidth: 110 }}>
                {inq.reservationId && <div className="mono" style={{ fontSize: 11 }}>{inq.reservationId.slice(-8)}</div>}
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                  {daysSince(inq.updatedAt)}d ago
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button className="btn primary sm" onClick={() => fireToast('Open this inquiry from the unified Inbox to continue by email or link it to Guesty.')}>
                Continue in Inbox
              </button>
              <button className="btn ghost sm" onClick={() => handleOpenReservation(inq.reservationId)}>
                View reservation
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
