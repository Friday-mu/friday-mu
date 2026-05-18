'use client';

import { useMemo, useState } from 'react';
import {
  RESERVATIONS,
  CHANNEL_LABEL,
  STATUS_LABEL,
  formatMoney,
  type Reservation,
  type ReservationChannel,
  type ReservationStatus,
} from '../../../_data/reservations';
import { useLiveReservations } from '../../../_data/reservationsClient';
import { FilterBar, FilterPill } from '../../FilterBar';
import { IconSearch } from '../../icons';

type SortKey = 'checkIn' | 'checkOut' | 'confirmationCode' | 'guestName' | 'totalAmount' | 'balanceDue';
type SortDir = 'asc' | 'desc';

interface Props {
  onOpen: (reservationId: string) => void;
}

const TODAY_ISO = new Date().toISOString().slice(0, 10);

function statusToneClass(s: ReservationStatus): string {
  switch (s) {
    case 'checked_in':
    case 'confirmed':
      return 'info';
    case 'hold':
      return 'warn';
    case 'cancelled':
      return 'warn';
    case 'checked_out':
      return '';
    default:
      return '';
  }
}

function isInScope(r: Reservation): boolean {
  // Default scope per scoping pack §7: active + future 90 days + past 12 months. Older → archived.
  const today = new Date(TODAY_ISO);
  const checkIn = new Date(r.checkIn.slice(0, 10));
  const checkOut = new Date(r.checkOut.slice(0, 10));
  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(today.getFullYear() - 1);
  const ninetyDaysOut = new Date(today);
  ninetyDaysOut.setDate(today.getDate() + 90);
  return checkOut >= oneYearAgo && checkIn <= ninetyDaysOut;
}

export function AllReservationsPage({ onOpen }: Props) {
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | 'all'>('all');
  const [channelFilter, setChannelFilter] = useState<ReservationChannel | 'all'>('all');
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [balanceDueOnly, setBalanceDueOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey>('checkIn');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Live reservations from /api/reservations (guesty_reservations cache);
  // falls back to fixture during loading / on backend failure so the page
  // never blanks out. Per Phase-1 wiring 2026-05-17 (queue item R).
  const { reservations: liveReservations } = useLiveReservations();
  const sourceReservations = liveReservations ?? RESERVATIONS;
  const allInScope = useMemo(() => sourceReservations.filter(isInScope), [sourceReservations]);
  const properties = useMemo(
    () => Array.from(new Set(allInScope.map((r) => r.propertyCode))).sort(),
    [allInScope],
  );
  const channels = useMemo(
    () => Array.from(new Set(allInScope.map((r) => r.channel))) as ReservationChannel[],
    [allInScope],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allInScope.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (channelFilter !== 'all' && r.channel !== channelFilter) return false;
      if (propertyFilter !== 'all' && r.propertyCode !== propertyFilter) return false;
      if (balanceDueOnly && r.balanceDue <= 0) return false;
      // Date range filter applies to check-in date.
      if (dateFrom && r.checkIn.slice(0, 10) < dateFrom) return false;
      if (dateTo && r.checkIn.slice(0, 10) > dateTo) return false;
      if (q) {
        const hay = `${r.guestName} ${r.confirmationCode} ${r.propertyCode}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allInScope, statusFilter, channelFilter, propertyFilter, search, balanceDueOnly, dateFrom, dateTo]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortInd = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

  const filtersDirty =
    statusFilter !== 'all' ||
    channelFilter !== 'all' ||
    propertyFilter !== 'all' ||
    balanceDueOnly ||
    search.trim() !== '' ||
    dateFrom !== '' ||
    dateTo !== '';
  const clearAll = () => {
    setStatusFilter('all');
    setChannelFilter('all');
    setPropertyFilter('all');
    setBalanceDueOnly(false);
    setSearch('');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="fad-module-body" style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div
          style={{
            flex: 1,
            minWidth: 200,
            maxWidth: 360,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            border: '0.5px solid var(--color-border-tertiary)',
            borderRadius: 6,
            background: 'var(--color-background-secondary)',
            fontSize: 13,
          }}
        >
          <IconSearch size={12} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search guest, conf code, property…"
            style={{ flex: 1, border: 0, background: 'transparent', outline: 'none', fontSize: 13 }}
          />
        </div>
        <button
          className={'btn sm' + (balanceDueOnly ? ' active' : '')}
          onClick={() => setBalanceDueOnly((v) => !v)}
          title="Show only reservations with outstanding balance"
        >
          Balance due
        </button>
      </div>

      <FilterBar
        count={`${sorted.length} of ${allInScope.length}`}
        onClear={filtersDirty ? clearAll : undefined}
      >
        <FilterPill
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as ReservationStatus | 'all')}
          options={[
            { value: 'all', label: 'All statuses' },
            ...(['confirmed', 'checked_in', 'checked_out', 'hold', 'cancelled'] as ReservationStatus[]).map((s) => ({
              value: s,
              label: STATUS_LABEL[s],
            })),
          ]}
        />
        <FilterPill
          label="Channel"
          value={channelFilter}
          onChange={(v) => setChannelFilter(v as ReservationChannel | 'all')}
          options={[
            { value: 'all', label: 'All channels' },
            ...channels.map((c) => ({ value: c, label: CHANNEL_LABEL[c] })),
          ]}
        />
        <FilterPill
          label="Property"
          value={propertyFilter}
          onChange={setPropertyFilter}
          options={[
            { value: 'all', label: 'All properties' },
            ...properties.map((p) => ({ value: p, label: p })),
          ]}
        />
        <DateRangePill
          label="Date range"
          from={dateFrom}
          to={dateTo}
          onChange={(f, t) => {
            setDateFrom(f);
            setDateTo(t);
          }}
        />
      </FilterBar>

      <div className="card fad-rsv-table">
        <div className="fad-rsv-head">
          <button className="fad-rsv-th" onClick={() => toggleSort('checkIn')}>Check-in{sortInd('checkIn')}</button>
          <button className="fad-rsv-th" onClick={() => toggleSort('checkOut')}>Check-out{sortInd('checkOut')}</button>
          <button className="fad-rsv-th" onClick={() => toggleSort('confirmationCode')}>Conf{sortInd('confirmationCode')}</button>
          <span className="fad-rsv-th">Listing</span>
          <button className="fad-rsv-th" onClick={() => toggleSort('guestName')}>Guest{sortInd('guestName')}</button>
          <span className="fad-rsv-th">Channel</span>
          <span className="fad-rsv-th">Status</span>
          <button className="fad-rsv-th" style={{ textAlign: 'right' }} onClick={() => toggleSort('balanceDue')}>
            Balance{sortInd('balanceDue')}
          </button>
        </div>
        {sorted.map((r) => (
          <div key={r.id} className="fad-rsv-row" onClick={() => onOpen(r.id)}>
            <span className="fad-rsv-cell mono" data-mlabel="Check-in">{r.checkIn.slice(5, 10)}</span>
            <span className="fad-rsv-cell mono" data-mlabel="Check-out">{r.checkOut.slice(5, 10)}</span>
            <span className="fad-rsv-cell mono fad-rsv-conf" data-mlabel="Conf">{r.confirmationCode}</span>
            <span className="fad-rsv-cell mono" data-mlabel="Listing">{r.propertyCode}</span>
            <span className="fad-rsv-cell fad-rsv-guest" data-mlabel="Guest">{r.guestName}</span>
            <span className="fad-rsv-cell fad-rsv-muted" data-mlabel="Channel">{CHANNEL_LABEL[r.channel]}</span>
            <span className="fad-rsv-cell">
              <span className={'chip sm ' + statusToneClass(r.status)}>{STATUS_LABEL[r.status]}</span>
            </span>
            <span
              className="fad-rsv-cell mono fad-rsv-balance"
              data-mlabel="Balance"
              style={{
                color: r.balanceDue > 0 ? 'var(--color-text-warning)' : 'var(--color-text-tertiary)',
                fontWeight: r.balanceDue > 0 ? 500 : 400,
              }}
            >
              {r.balanceDue > 0 ? formatMoney(r.balanceDue, r.currency) : '—'}
            </span>
          </div>
        ))}
        {sorted.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            No reservations match these filters.
          </div>
        )}
      </div>
    </div>
  );
}

function DateRangePill({
  label,
  from,
  to,
  onChange,
}: {
  label: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const display = from && to ? `${from} → ${to}` : from ? `from ${from}` : to ? `until ${to}` : 'Any';
  const dirty = from !== '' || to !== '';
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 999,
        fontSize: 11,
        background: dirty ? 'var(--color-brand-accent-soft)' : 'transparent',
      }}
    >
      <span style={{ color: 'var(--color-text-tertiary)' }}>{label}</span>
      <input
        type="date"
        value={from}
        onChange={(e) => onChange(e.target.value, to)}
        style={{ ...miniInputStyle, width: 110 }}
        title="From"
      />
      <span style={{ color: 'var(--color-text-tertiary)' }}>→</span>
      <input
        type="date"
        value={to}
        onChange={(e) => onChange(from, e.target.value)}
        style={{ ...miniInputStyle, width: 110 }}
        title="To"
      />
      {dirty && (
        <button
          onClick={() => onChange('', '')}
          aria-label="Clear date range"
          style={{
            background: 'transparent',
            border: 0,
            color: 'var(--color-text-tertiary)',
            cursor: 'pointer',
            padding: '0 2px',
            fontSize: 12,
          }}
        >
          ×
        </button>
      )}
      <span className="sr-only">{display}</span>
    </div>
  );
}

const miniInputStyle: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  fontSize: 11,
  fontFamily: 'inherit',
  color: 'inherit',
  outline: 'none',
  padding: 0,
};
