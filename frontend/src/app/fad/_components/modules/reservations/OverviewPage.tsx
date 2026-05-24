'use client';

import { useMemo } from 'react';
import { useT } from '../../../_i18n/useT';
import {
  RESERVATIONS,
  CHANNEL_LABEL,
  formatMoney,
  type Reservation,
} from '../../../_data/reservations';
import { useLiveReservations } from '../../../_data/reservationsClient';
import { liveOnlyMode } from '../../../_data/demoMode';

interface Props {
  onOpen: (reservationId: string) => void;
}

const TODAY_ISO = new Date().toISOString().slice(0, 10);

interface UrgentFlag {
  reservationId: string;
  label: string;
  detail: string;
  tone: 'warn' | 'info';
}

function dayOffsetISO(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoDay(iso: string): string {
  return iso.slice(0, 10);
}

export function OverviewPage({ onOpen }: Props) {
  const { t } = useT();
  const today = TODAY_ISO;
  const sevenDaysOut = dayOffsetISO(today, 7);
  const thirtyDaysOut = dayOffsetISO(today, 30);

  const { reservations: liveReservations } = useLiveReservations();
  const sourceReservations = liveReservations ?? (liveOnlyMode() ? [] : RESERVATIONS);

  const arrivingToday = useMemo(
    () => sourceReservations.filter((r) => r.status !== 'cancelled' && isoDay(r.checkIn) === today),
    [today, sourceReservations],
  );
  const departingToday = useMemo(
    () => sourceReservations.filter((r) => r.status !== 'cancelled' && isoDay(r.checkOut) === today),
    [today, sourceReservations],
  );
  const inHouse = useMemo(
    () => sourceReservations.filter((r) => r.status === 'checked_in'),
    [sourceReservations],
  );
  const next7d = useMemo(
    () =>
      sourceReservations
        .filter((r) => r.status !== 'cancelled' && r.status !== 'checked_in')
        .filter((r) => isoDay(r.checkIn) > today && isoDay(r.checkIn) <= sevenDaysOut)
        .sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    [today, sevenDaysOut, sourceReservations],
  );
  const next30d = useMemo(
    () =>
      sourceReservations
        .filter((r) => r.status !== 'cancelled')
        .filter((r) => isoDay(r.checkIn) > sevenDaysOut && isoDay(r.checkIn) <= thirtyDaysOut)
        .sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    [sevenDaysOut, thirtyDaysOut, sourceReservations],
  );

  // Urgent flags per scoping pack §2: no-access-info-sent (within 24h), no-driver-assigned,
  // payment-incomplete, balance-due (already covered by balanceDue > 0).
  const urgent: UrgentFlag[] = useMemo(() => {
    const flags: UrgentFlag[] = [];
    const within24h = (iso: string) => {
      const diffH = (new Date(iso).getTime() - new Date(`${today}T12:00:00`).getTime()) / 3_600_000;
      return diffH >= 0 && diffH <= 24;
    };
    for (const r of sourceReservations) {
      if (r.status === 'cancelled' || r.status === 'checked_out') continue;
      if (within24h(r.checkIn) && !r.accessInfoSentAt) {
        flags.push({
          reservationId: r.id,
          label: 'Access info not sent',
          detail: `${r.propertyCode} · ${r.guestName} arrives ${r.checkIn.slice(5, 10)}`,
          tone: 'warn',
        });
      }
      if (within24h(r.checkIn) && r.specialRequests?.categories.includes('transport') && !r.driverAssigneeId) {
        flags.push({
          reservationId: r.id,
          label: 'No driver assigned',
          detail: `${r.propertyCode} · ${r.guestName} requested transport`,
          tone: 'warn',
        });
      }
      if (r.balanceDue > 0 && isoDay(r.checkIn) <= sevenDaysOut) {
        flags.push({
          reservationId: r.id,
          label: t('reservations.overview.flag.balanceDue', 'Balance due before check-in'),
          detail: `${r.propertyCode} · ${r.guestName} · ${formatMoney(r.balanceDue, r.currency)}`,
          tone: 'warn',
        });
      }
    }
    return flags;
  }, [today, sevenDaysOut, sourceReservations]);

  return (
    <div className="fad-module-body" style={{ flex: 1, overflowY: 'auto' }}>
      {/* KPI strip */}
      <div className="kpi-grid">
        <KPI label={t('reservations.overview.kpi.arrivingToday', 'Arriving today')} value={arrivingToday.length} sub={arrivingToday.map((r) => r.propertyCode).join(' · ') || '—'} />
        <KPI label={t('reservations.overview.kpi.departingToday', 'Departing today')} value={departingToday.length} sub={departingToday.map((r) => r.propertyCode).join(' · ') || '—'} />
        <KPI label={t('reservations.overview.kpi.inHouse', 'In-house')} value={inHouse.length} sub={inHouse.map((r) => r.propertyCode).slice(0, 4).join(' · ') || '—'} />
        <KPI label={t('reservations.overview.kpi.next7Days', 'Next 7 days')} value={next7d.length} sub={t('reservations.overview.kpi.arrivalsBooked', '{n} arrivals booked').replace('{n}', String(next7d.length))} />
      </div>

      {/* Urgent flags */}
      {urgent.length > 0 && (
        <section style={{ marginTop: 16 }}>
          <SectionHeading>{t('reservations.overview.needsAttention', 'Needs attention')} · {urgent.length}</SectionHeading>
          <div className="card">
            {urgent.map((f, i) => (
              <button
                key={`${f.reservationId}-${f.label}-${i}`}
                type="button"
                onClick={() => onOpen(f.reservationId)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderBottom: i < urgent.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 0,
                  background: 'transparent',
                  border: 0,
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer',
                  flexWrap: 'wrap',
                }}
              >
                <span className={'chip sm ' + (f.tone === 'warn' ? 'warn' : 'info')} style={{ flexShrink: 0 }}>
                  {f.label}
                </span>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', flex: 1, minWidth: 0 }}>
                  {f.detail}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Today */}
      <section style={{ marginTop: 16 }}>
        <SectionHeading>Today · {arrivingToday.length + departingToday.length}</SectionHeading>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          <DayBlock title="Arrivals" rows={arrivingToday} onOpen={onOpen} emptyText="No arrivals today." />
          <DayBlock title="Departures" rows={departingToday} onOpen={onOpen} emptyText="No departures today." />
        </div>
      </section>

      {/* Next 7 days */}
      <section style={{ marginTop: 16 }}>
        <SectionHeading>Next 7 days · {next7d.length}</SectionHeading>
        <ReservationList rows={next7d} onOpen={onOpen} />
      </section>

      {/* Next 30 days */}
      <section style={{ marginTop: 16 }}>
        <SectionHeading>8–30 days out · {next30d.length}</SectionHeading>
        <ReservationList rows={next30d} onOpen={onOpen} />
      </section>
    </div>
  );
}

function KPI({ label, value, sub }: { label: string; value: number | string; sub: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--color-text-tertiary)',
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function DayBlock({
  title,
  rows,
  onOpen,
  emptyText,
}: {
  title: string;
  rows: Reservation[];
  onOpen: (id: string) => void;
  emptyText: string;
}) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>{title}</div>
      {rows.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{emptyText}</div>
      )}
      {rows.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onOpen(r.id)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            padding: '6px 0',
            background: 'transparent',
            border: 0,
            width: '100%',
            textAlign: 'left',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          <span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              {r.propertyCode}
            </span>
            <span style={{ marginLeft: 8 }}>{r.guestName}</span>
          </span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            {(r.checkIn || r.checkOut).slice(11, 16)}
          </span>
        </button>
      ))}
    </div>
  );
}

function ReservationList({ rows, onOpen }: { rows: Reservation[]; onOpen: (id: string) => void }) {
  if (rows.length === 0) {
    return (
      <div className="card" style={{ padding: 16, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
        Nothing in this window.
      </div>
    );
  }
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {rows.map((r, i) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onOpen(r.id)}
          style={{
            display: 'grid',
            gridTemplateColumns: '0.6fr 1.4fr 0.6fr 0.7fr 1fr',
            gap: 12,
            padding: '10px 14px',
            borderBottom: i < rows.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 0,
            background: 'transparent',
            border: 0,
            width: '100%',
            textAlign: 'left',
            cursor: 'pointer',
            alignItems: 'center',
            fontSize: 13,
          }}
        >
          <span className="mono" style={{ fontSize: 12 }}>{r.checkIn.slice(5, 10)}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.guestName}
          </span>
          <span className="mono" style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {r.propertyCode}
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {CHANNEL_LABEL[r.channel]}
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'right' }}>
            {r.nights} nts · {r.partySize.adults}A{r.partySize.children ? `+${r.partySize.children}C` : ''}
          </span>
        </button>
      ))}
    </div>
  );
}
