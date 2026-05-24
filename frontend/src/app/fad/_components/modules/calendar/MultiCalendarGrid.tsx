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
import type { Task } from '../../../_data/tasks';

export interface CellPrice {
  price_minor: number | null;
  available: boolean | null;
  currency: string | null;
}

interface Props {
  properties: Property[];
  reservations: Reservation[];
  /** Optional: per-(listing_guesty_id) per-(YYYY-MM-DD) price + availability.
   *  Renders €PRICE in empty cells when present. v0.2 addition. */
  pricesByListing?: Map<string, Record<string, CellPrice>>;
  /** Optional: tasks grouped by propertyCode for in-cell chip overlay. v0.2. */
  tasksByPropertyCode?: Map<string, Task[]>;
  windowStart: Date;       // inclusive
  windowDays: number;      // number of date columns
  todayIso: string;
  onReservationClick?: (rsv: Reservation, x: number, y: number) => void;
  onPropertyClick?: (property: Property) => void;
  onCellClick?: (property: Property, dateIso: string) => void;
  onTaskClick?: (task: Task) => void;
}

const DAY_MS = 86400000;
const PROPERTY_COL_PX = 240;
const DAY_COL_PX = 56;

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatCellPrice(cell: CellPrice): string {
  if (cell.price_minor == null) return '';
  const major = Math.round(cell.price_minor / 100);
  const sym = cell.currency === 'EUR' ? '€' : cell.currency === 'MUR' ? 'Rs' : cell.currency === 'USD' ? '$' : '';
  return `${sym}${major}`;
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

// v0.3 (bug #0887d756) — Ishant wanted color to encode the status
// (confirmed / reserved-but-not-yet-paid / inquiry), not the booking
// platform. Channel is now communicated by an icon at the start of the
// band (Airbnb / Booking.com / Friday-logo-for-direct etc.) — see
// channelGlyph below.
type BandStatus = 'confirmed' | 'reserved' | 'inquiry' | 'owner' | 'other';

function statusColorClass(rsv: { status?: string; channel: ReservationChannel }): string {
  const s = String(rsv.status || '').toLowerCase();
  if (rsv.channel === 'owner') return 'mcal-band-status-owner';
  if (s === 'confirmed' || s === 'checked_in' || s === 'checked_out' || s === 'booked') return 'mcal-band-status-confirmed';
  if (s === 'reserved' || s === 'awaiting_payment' || s === 'pending') return 'mcal-band-status-reserved';
  if (s === 'inquiry' || s === 'request' || s === '') return 'mcal-band-status-inquiry';
  return 'mcal-band-status-other';
}

// Short channel codes still used for the title= tooltip on the band.
const channelShort: Record<ReservationChannel, string> = {
  airbnb: 'AIR',
  booking: 'BDC',
  vrbo: 'VRB',
  direct: 'DIR',
  owner: 'OWN',
  email: 'EML',
};

// Icon glyph at the start of each band — disambiguates the booking
// platform without consuming color. Single-character placeholders that
// the CSS can substitute with proper SVGs later (mcal-channel-glyph-*).
const channelGlyph: Record<ReservationChannel, string> = {
  airbnb: 'Ⓐ',     // Airbnb (round A)
  booking: 'Ⓑ',    // Booking.com (round B)
  vrbo: 'Ⓥ',       // VRBO
  direct: 'F',     // Friday direct — uppercase F stands in for the logo
  owner: 'Ⓞ',      // Owner stay
  email: '✉',      // Email
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
  pricesByListing,
  tasksByPropertyCode,
  windowStart,
  windowDays,
  todayIso,
  onReservationClick,
  onPropertyClick,
  onCellClick,
  onTaskClick,
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

              {/* Day cells (background grid) — show €PRICE when no
                  reservation covers this cell + we have price data. */}
              {columns.map((c, idx) => {
                const priceMap = p.id && pricesByListing ? pricesByListing.get(p.id) : undefined;
                const cell = priceMap?.[c.iso];
                const hasReservation = positions.some((pos) => {
                  // The reservation positions are 1-based with +2 offset
                  // (sticky col + grid-base). idx+2 = this cell's startCol.
                  const cellCol = idx + 2;
                  return cellCol >= pos.startCol && cellCol < pos.startCol + pos.spanCols;
                });
                const showPrice = !hasReservation && cell && cell.available !== false && cell.price_minor != null && cell.price_minor > 0;
                const isBlocked = !hasReservation && cell && cell.available === false;
                return (
                  <button
                    key={`${p.id}-${c.iso}`}
                    type="button"
                    className={
                      'mcal-day-cell' +
                      (c.weekendish ? ' mcal-weekend' : '') +
                      (c.iso === todayIso ? ' mcal-today' : '') +
                      (isBlocked ? ' mcal-day-blocked' : '')
                    }
                    style={{ gridColumn: idx + 2, gridRow: 1 }}
                    onClick={() => onCellClick?.(p, c.iso)}
                    title={isBlocked ? 'Blocked' : showPrice && cell ? `${formatCellPrice(cell)} · ${c.iso}` : c.iso}
                  >
                    {showPrice && cell && (
                      <span className="mcal-cell-price mono">{formatCellPrice(cell)}</span>
                    )}
                  </button>
                );
              })}

              {/* Task chips overlay (v0.2) — per-cell + property */}
              {tasksByPropertyCode && (() => {
                const tasks = tasksByPropertyCode.get(p.code) || [];
                return tasks
                  .filter((t) => t.dueDate)
                  .map((t) => {
                    const dueIso = String(t.dueDate).slice(0, 10);
                    const colIdx = columns.findIndex((c) => c.iso === dueIso);
                    if (colIdx < 0) return null;
                    const hasReservation = positions.some((pos) => {
                      const cellCol = colIdx + 2;
                      return cellCol >= pos.startCol && cellCol < pos.startCol + pos.spanCols;
                    });
                    return (
                      <button
                        key={`${p.id}-task-${t.id}`}
                        type="button"
                        className={'mcal-task-chip mcal-task-prio-' + (t.priority || 'medium')}
                        style={{
                          gridColumn: colIdx + 2,
                          gridRow: 1,
                          alignSelf: hasReservation ? 'flex-start' : 'flex-end',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onTaskClick?.(t);
                        }}
                        title={`${t.title} · ${t.department || '—'} · ${(t.assigneeNames?.[0] || '').slice(0, 20)}`}
                      >
                        {t.title.slice(0, 12)}
                      </button>
                    );
                  })
                  .filter(Boolean);
              })()}

              {/* Reservation bars overlay — same grid row, higher z.
                  v0.3: color encodes STATUS (confirmed/reserved/inquiry/owner),
                  channel is shown as a glyph at the start of the band. */}
              {positions.map((pos, i) => (
                <button
                  key={`${p.id}-rsv-${i}`}
                  type="button"
                  className={
                    'mcal-band ' +
                    statusColorClass(pos.rsv) +
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
                  title={`${pos.rsv.guestName} · ${pos.rsv.nights}n · ${pos.rsv.channel.toUpperCase()} · ${pos.rsv.status || 'inquiry'}`}
                >
                  <span className={'mcal-band-channel-glyph mcal-channel-' + pos.rsv.channel} aria-label={channelShort[pos.rsv.channel]}>
                    {channelGlyph[pos.rsv.channel]}
                  </span>
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
          <span className="mcal-legend-dot mcal-band-status-confirmed" /> Confirmed
          <span className="mcal-legend-dot mcal-band-status-reserved" /> Reserved
          <span className="mcal-legend-dot mcal-band-status-inquiry" /> Inquiry
          <span className="mcal-legend-dot mcal-band-status-owner" /> Owner stay
          <span style={{ width: 1, height: 14, background: 'var(--color-border-tertiary)', margin: '0 6px' }} />
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
            Channels: Ⓐ Airbnb · Ⓑ Booking · Ⓥ VRBO · F Direct · Ⓞ Owner · ✉ Email
          </span>
        </span>
      </div>
    </div>
  );
}
