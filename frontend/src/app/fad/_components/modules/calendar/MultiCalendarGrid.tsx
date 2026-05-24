'use client';

// Multi-calendar v0.1 — Property × Date grid per the 2026-05-24 Guesty
// screenshot. Read-only: hover for popovers, click reservation bars to
// open the existing ReservationDetail drawer.
//
// Phase 5 of the overnight autonomous plan (T4.38). v0.2 will add
// drag-to-create, price tooltips per cell, task-chip overlays, and
// the "Find availability" + quote-builder integrations.
//
// Layout shape: each property is its own per-row grid container so
// reservation bars can overlay day-cells via shared grid-row + z-index
// instead of fighting `display: contents` on a single mega-grid.

import { useMemo } from 'react';
import type { Property } from '../../../_data/properties';
import type { Reservation, ReservationChannel } from '../../../_data/reservations';

interface Props {
  properties: Property[];
  reservations: Reservation[];
  windowStart: Date;       // inclusive
  windowDays: number;      // number of date columns
  todayIso: string;
  onReservationClick?: (rsv: Reservation, x: number, y: number) => void;
  onPropertyClick?: (property: Property) => void;
  onCellClick?: (property: Property, dateIso: string) => void;
}

const DAY_MS = 86400000;
const PROPERTY_COL_PX = 240;
const DAY_COL_PX = 56;

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface DateColumn {
  iso: string;
  date: Date;
  isMonthStart: boolean;
  weekendish: boolean;
}

function buildDateColumns(start: Date, days: number): DateColumn[] {
  const out: DateColumn[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * DAY_MS);
    out.push({
      iso: isoDateOnly(d),
      date: d,
      isMonthStart: d.getDate() === 1,
      weekendish: d.getDay() === 0 || d.getDay() === 6,
    });
  }
  return out;
}

const channelColorClass: Record<ReservationChannel, string> = {
  airbnb: 'mcal-band-airbnb',
  booking: 'mcal-band-booking',
  vrbo: 'mcal-band-vrbo',
  direct: 'mcal-band-direct',
  owner: 'mcal-band-owner',
  email: 'mcal-band-email',
};

const channelShort: Record<ReservationChannel, string> = {
  airbnb: 'AIR',
  booking: 'BDC',
  vrbo: 'VRB',
  direct: 'DIR',
  owner: 'OWN',
  email: 'EML',
};

interface PositionedReservation {
  rsv: Reservation;
  startCol: number; // 1-based grid-column-start INSIDE the per-row grid
  spanCols: number;
  clippedLeft: boolean;
  clippedRight: boolean;
}

function positionByProperty(
  reservations: Reservation[],
  columns: DateColumn[],
  windowEnd: Date,
): Map<string, PositionedReservation[]> {
  const byProperty = new Map<string, PositionedReservation[]>();
  const colByIso = new Map(columns.map((c, i) => [c.iso, i]));
  for (const r of reservations) {
    if (r.status === 'cancelled') continue;
    const checkIn = new Date(r.checkIn);
    const checkOut = new Date(r.checkOut);
    if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) continue;
    if (checkOut < columns[0].date || checkIn > windowEnd) continue;

    const startIso = isoDateOnly(checkIn);
    const lastNightIso = isoDateOnly(new Date(checkOut.getTime() - DAY_MS));
    const visibleStart = colByIso.has(startIso)
      ? colByIso.get(startIso)!
      : 0;
    const visibleEnd = colByIso.has(lastNightIso)
      ? colByIso.get(lastNightIso)!
      : columns.length - 1;
    const spanCols = Math.max(1, visibleEnd - visibleStart + 1);

    const clippedLeft = checkIn < columns[0].date;
    const clippedRight = checkOut > new Date(windowEnd.getTime() + DAY_MS);

    const arr = byProperty.get(r.propertyCode) || [];
    arr.push({
      rsv: r,
      // +2 = 1-based grid + sticky property column
      startCol: visibleStart + 2,
      spanCols,
      clippedLeft,
      clippedRight,
    });
    byProperty.set(r.propertyCode, arr);
  }
  return byProperty;
}

export function MultiCalendarGrid({
  properties,
  reservations,
  windowStart,
  windowDays,
  todayIso,
  onReservationClick,
  onPropertyClick,
  onCellClick,
}: Props) {
  const columns = useMemo(() => buildDateColumns(windowStart, windowDays), [windowStart, windowDays]);
  const windowEnd = useMemo(
    () => new Date(windowStart.getTime() + (windowDays - 1) * DAY_MS),
    [windowStart, windowDays],
  );
  const positioned = useMemo(
    () => positionByProperty(reservations, columns, windowEnd),
    [reservations, columns, windowEnd],
  );
  const todayColIdx = columns.findIndex((c) => c.iso === todayIso);

  const gridTemplateColumns = `${PROPERTY_COL_PX}px repeat(${windowDays}, minmax(${DAY_COL_PX}px, 1fr))`;

  const sortedProperties = useMemo(() => {
    const liveOrder = (p: Property) =>
      p.lifecycleStatus === 'live' ? 0 : p.lifecycleStatus === 'onboarding' ? 1 : 2;
    return properties.slice().sort((a, b) => {
      const o = liveOrder(a) - liveOrder(b);
      if (o !== 0) return o;
      return a.code.localeCompare(b.code);
    });
  }, [properties]);

  return (
    <div className="mcal-root">
      <div className="mcal-scroller">
        {/* Header row */}
        <div className="mcal-header-row" style={{ gridTemplateColumns }}>
          <div className="mcal-header-property">
            <span>Property</span>
            <span className="mcal-header-count">{sortedProperties.length}</span>
          </div>
          {columns.map((c) => (
            <div
              key={c.iso}
              className={
                'mcal-header-day' +
                (c.weekendish ? ' mcal-weekend' : '') +
                (c.iso === todayIso ? ' mcal-today' : '') +
                (c.isMonthStart ? ' mcal-month-start' : '')
              }
            >
              <span className="mcal-date-dow">
                {c.date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1)}
              </span>
              <span className="mcal-date-num">{c.date.getDate()}</span>
              {c.isMonthStart && (
                <span className="mcal-date-month">
                  {c.date.toLocaleDateString('en-US', { month: 'short' })}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Property rows */}
        {sortedProperties.map((p) => {
          const positions = positioned.get(p.code) || [];
          return (
            <div
              key={p.id}
              className="mcal-property-row"
              style={{ gridTemplateColumns }}
            >
              <button
                type="button"
                className="mcal-property-cell"
                onClick={() => onPropertyClick?.(p)}
                title={p.name}
              >
                {p.heroPhotoUrl ? (
                  <div
                    className="mcal-thumb"
                    style={{ backgroundImage: `url(${p.heroPhotoUrl})` }}
                  />
                ) : (
                  <div className="mcal-thumb mcal-thumb-placeholder" />
                )}
                <div className="mcal-property-info">
                  <div className="mcal-property-code mono">{p.code}</div>
                  <div className="mcal-property-name">{p.name}</div>
                </div>
                <div
                  className={
                    'mcal-lifecycle-dot ' +
                    (p.lifecycleStatus === 'live'
                      ? 'mcal-dot-live'
                      : p.lifecycleStatus === 'onboarding'
                      ? 'mcal-dot-onboarding'
                      : 'mcal-dot-paused')
                  }
                  title={p.lifecycleStatus}
                />
              </button>

              {/* Day cells (background grid) */}
              {columns.map((c, idx) => (
                <div
                  key={`${p.id}-${c.iso}`}
                  className={
                    'mcal-day-cell' +
                    (c.weekendish ? ' mcal-weekend' : '') +
                    (c.iso === todayIso ? ' mcal-today' : '')
                  }
                  style={{ gridColumn: idx + 2, gridRow: 1 }}
                  onClick={() => onCellClick?.(p, c.iso)}
                />
              ))}

              {/* Reservation bars overlay — same grid row, higher z */}
              {positions.map((pos, i) => (
                <button
                  key={`${p.id}-rsv-${i}`}
                  type="button"
                  className={
                    'mcal-band ' +
                    channelColorClass[pos.rsv.channel] +
                    (pos.clippedLeft ? ' mcal-band-clip-left' : '') +
                    (pos.clippedRight ? ' mcal-band-clip-right' : '')
                  }
                  style={{
                    gridColumn: `${pos.startCol} / span ${pos.spanCols}`,
                    gridRow: 1,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    onReservationClick?.(pos.rsv, rect.left + rect.width / 2, rect.bottom);
                  }}
                  title={`${pos.rsv.guestName} · ${pos.rsv.nights}n · ${pos.rsv.channel.toUpperCase()}`}
                >
                  <span className="mcal-band-channel mono">{channelShort[pos.rsv.channel]}</span>
                  <span className="mcal-band-guest">{pos.rsv.guestName}</span>
                </button>
              ))}

              {/* Today vertical line — one per row so it scrolls with the grid */}
              {todayColIdx >= 0 && (
                <div
                  className="mcal-today-line"
                  style={{
                    gridColumn: todayColIdx + 2,
                    gridRow: 1,
                  }}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mcal-footer">
        <span className="mono">
          {windowDays} days · {sortedProperties.length} properties · {reservations.length} reservations in window
        </span>
        <span style={{ flex: 1 }} />
        <span className="mcal-legend">
          <span className="mcal-legend-dot mcal-band-airbnb" /> Airbnb
          <span className="mcal-legend-dot mcal-band-booking" /> BDC
          <span className="mcal-legend-dot mcal-band-direct" /> Direct
          <span className="mcal-legend-dot mcal-band-vrbo" /> VRBO
          <span className="mcal-legend-dot mcal-band-owner" /> Owner
        </span>
      </div>
    </div>
  );
}
