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

import { useMemo, useState } from 'react';
import type { Property } from '../../../_data/properties';
import type { Reservation, ReservationChannel } from '../../../_data/reservations';
import type { Task } from '../../../_data/tasks';

export interface CellPrice {
  price_minor: number | null;
  available: boolean | null;
  currency: string | null;
  /** v0.5 — true when blocked via fad_calendar_blocks overlay (mig 090). */
  blocked?: boolean;
  block_reason?: string | null;
  block_notes?: string | null;
}

export type BlockReason =
  | 'owner_stay'
  | 'maintenance'
  | 'private_use'
  | 'channel_block'
  | 'other';

export const BLOCK_REASON_LABEL: Record<BlockReason, string> = {
  owner_stay: 'Owner stay',
  maintenance: 'Maintenance',
  private_use: 'Private use',
  channel_block: 'Channel block',
  other: 'Other',
};

interface Props {
  properties: Property[];
  reservations: Reservation[];
  /** Optional: per-(listing_guesty_id) per-(YYYY-MM-DD) price + availability.
   *  Renders €PRICE in empty cells when present. v0.2 addition. */
  pricesByListing?: Map<string, Record<string, CellPrice>>;
  /** Optional: tasks grouped by propertyCode for in-cell chip overlay. v0.2. */
  tasksByPropertyCode?: Map<string, Task[]>;
  /** Calendar v0.6 (Ishant 2026-05-25): cleaning state per propertyCode.
   *  Renders a colored dot next to the property name + tooltip.
   *  Derived from in-stay + last cleaning/inspection ops tasks. */
  cleaningStatusByProperty?: Map<string, 'clean' | 'awaiting_inspection' | 'dirty' | 'needs_refresh' | 'idle'>;
  windowStart: Date;       // inclusive
  windowDays: number;      // number of date columns
  todayIso: string;
  onReservationClick?: (rsv: Reservation, x: number, y: number) => void;
  onPropertyClick?: (property: Property) => void;
  onCellClick?: (property: Property, dateIso: string) => void;
  onTaskClick?: (task: Task) => void;
  /** v0.5 — fired when staff blocks or unblocks dates via the popover.
   *  Parent should refetch the grid data so the new state shows. */
  onBlocksChanged?: () => void;
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
  /** v0.4 — vertical lane index when reservations overlap on the same
   *  property. Lane 0 = topmost; bands at lane>0 are pushed down via
   *  marginTop so they stack instead of obscuring each other. */
  lane: number;
}

/** v0.4 lane-assignment helper. Given a property's reservations sorted
 *  by startCol, pick the lowest lane index whose previous band has
 *  already ended (lastUsedEndCol[lane] < startCol). Returns the lane
 *  number (0-indexed); extends the lane array if none fit. */
function assignLane(startCol: number, lastUsedEndCol: number[]): number {
  for (let lane = 0; lane < lastUsedEndCol.length; lane++) {
    if (lastUsedEndCol[lane] < startCol) return lane;
  }
  lastUsedEndCol.push(0);
  return lastUsedEndCol.length - 1;
}

function positionByProperty(
  reservations: Reservation[],
  columns: DateColumn[],
  windowEnd: Date,
): { byProperty: Map<string, PositionedReservation[]>; maxLanesByProperty: Map<string, number> } {
  const byProperty = new Map<string, PositionedReservation[]>();
  const maxLanesByProperty = new Map<string, number>();
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
      lane: 0, // filled in after sort below
    });
    byProperty.set(r.propertyCode, arr);
  }

  // Second pass: per-property lane assignment. Sort by startCol so the
  // greedy lane picker is deterministic + minimal.
  for (const [propertyCode, positions] of byProperty.entries()) {
    positions.sort((a, b) => a.startCol - b.startCol);
    const lastUsedEndCol: number[] = [];
    for (const pos of positions) {
      const lane = assignLane(pos.startCol, lastUsedEndCol);
      pos.lane = lane;
      lastUsedEndCol[lane] = pos.startCol + pos.spanCols - 1;
    }
    maxLanesByProperty.set(propertyCode, lastUsedEndCol.length);
  }

  return { byProperty, maxLanesByProperty };
}

export function MultiCalendarGrid({
  properties,
  reservations,
  pricesByListing,
  tasksByPropertyCode,
  cleaningStatusByProperty,
  windowStart,
  windowDays,
  todayIso,
  onReservationClick,
  onPropertyClick,
  onCellClick,
  onTaskClick,
  onBlocksChanged,
}: Props) {
  const columns = useMemo(() => buildDateColumns(windowStart, windowDays), [windowStart, windowDays]);
  const windowEnd = useMemo(
    () => new Date(windowStart.getTime() + (windowDays - 1) * DAY_MS),
    [windowStart, windowDays],
  );
  const { byProperty: positioned, maxLanesByProperty } = useMemo(
    () => positionByProperty(reservations, columns, windowEnd),
    [reservations, columns, windowEnd],
  );
  const todayColIdx = columns.findIndex((c) => c.iso === todayIso);

  // v0.4 — hover task preview popover. Anchored near the task chip,
  // shows title + due + assignee + truncated description. Replaces the
  // slow + plain browser `title=` tooltip.
  const [hoveredTask, setHoveredTask] = useState<{ task: Task; x: number; y: number } | null>(null);

  // v0.5 — block-cell popover state. Anchored at the click point with
  // viewport clamping in the popover JSX.
  const [blockingCell, setBlockingCell] = useState<{
    property: Property;
    listingGuestyId: string;
    dateIso: string;
    cell: CellPrice | null;
    x: number;
    y: number;
  } | null>(null);

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
          // v0.4 — row height grows with lane stack (28px per lane).
          const lanes = Math.max(1, maxLanesByProperty.get(p.code) ?? 1);
          const rowHeight = Math.max(56, 16 + lanes * 30);
          return (
            <div
              key={p.id}
              className="mcal-property-row"
              style={{ gridTemplateColumns, gridAutoRows: `${rowHeight}px` }}
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
                {(() => {
                  // Cleaning-state dot (v0.6) takes priority over the
                  // lifecycle dot for live properties — operationally
                  // it's more actionable. Paused/onboarding properties
                  // still show their lifecycle dot since cleaning state
                  // isn't meaningful for them.
                  const clean = cleaningStatusByProperty?.get(p.code);
                  if (p.lifecycleStatus !== 'live' || !clean) {
                    return (
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
                    );
                  }
                  const cleaningTitle = {
                    clean: 'Clean · ready for guest',
                    awaiting_inspection: 'Cleaned · awaiting inspection',
                    dirty: 'Needs cleaning',
                    needs_refresh: 'Idle > 3 days · needs refresh',
                    idle: 'No recent activity',
                  }[clean];
                  return (
                    <div
                      className={'mcal-lifecycle-dot mcal-clean-dot mcal-clean-' + clean}
                      title={cleaningTitle}
                    />
                  );
                })()}
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
                    onClick={(e) => {
                      // Reservation cells shouldn't trigger block popover —
                      // they have their own click handler on the band.
                      if (hasReservation) return;
                      // External handler wins (if a parent wires onCellClick
                      // for a different surface). Otherwise open the block
                      // popover.
                      if (onCellClick) {
                        onCellClick(p, c.iso);
                        return;
                      }
                      if (!p.id) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      setBlockingCell({
                        property: p,
                        listingGuestyId: p.id,
                        dateIso: c.iso,
                        cell: cell || null,
                        x: rect.left + rect.width / 2,
                        y: rect.bottom + 6,
                      });
                    }}
                    title={
                      isBlocked && cell?.block_reason
                        ? `Blocked · ${cell.block_reason}${cell.block_notes ? ' · ' + cell.block_notes : ''}`
                        : isBlocked
                          ? 'Blocked'
                          : showPrice && cell
                            ? `${formatCellPrice(cell)} · ${c.iso}`
                            : c.iso
                    }
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
                        onMouseEnter={(e) => {
                          // v0.4 — open hover preview anchored just
                          // below the chip; small +6px y-offset so the
                          // popover doesn't immediately re-trigger a
                          // mouseLeave when it appears under the cursor.
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setHoveredTask({ task: t, x: rect.left, y: rect.bottom + 6 });
                        }}
                        onMouseLeave={() => setHoveredTask(null)}
                      >
                        {t.title.slice(0, 12)}
                      </button>
                    );
                  })
                  .filter(Boolean);
              })()}

              {/* Reservation bars overlay — same grid row, higher z.
                  v0.3: color encodes STATUS (confirmed/reserved/inquiry/owner),
                  channel is shown as a glyph at the start of the band.
                  v0.4: lane dedup — overlapping reservations stack via
                  marginTop + alignSelf:start so they no longer obscure
                  each other. */}
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
                    alignSelf: 'start',
                    marginTop: 8 + pos.lane * 30,
                    marginBottom: 0,
                    minHeight: 26,
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

      {/* v0.4 — hover task preview popover. Position fixed so it
          escapes any scroll-container clipping. */}
      {hoveredTask && (
        <div
          className="mcal-task-hover-preview"
          style={{
            position: 'fixed',
            left: Math.min(hoveredTask.x, window.innerWidth - 280),
            top: hoveredTask.y,
            zIndex: 50,
            width: 260,
            background: 'var(--color-background-primary)',
            border: '0.5px solid var(--color-border-secondary)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 16px rgba(15, 24, 54, 0.18)',
            padding: 10,
            fontSize: 12,
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 4, color: 'var(--color-text-primary)' }}>
            {hoveredTask.task.title}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            {hoveredTask.task.department && <span>{hoveredTask.task.department}</span>}
            {hoveredTask.task.priority && (
              <>
                <span>·</span>
                <span style={{ textTransform: 'capitalize' }}>{hoveredTask.task.priority}</span>
              </>
            )}
            {hoveredTask.task.dueDate && (
              <>
                <span>·</span>
                <span>Due {String(hoveredTask.task.dueDate).slice(0, 10)}</span>
              </>
            )}
          </div>
          {hoveredTask.task.assigneeNames && hoveredTask.task.assigneeNames.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              Assigned: {hoveredTask.task.assigneeNames.slice(0, 3).join(', ')}
              {hoveredTask.task.assigneeNames.length > 3 && ` +${hoveredTask.task.assigneeNames.length - 3}`}
            </div>
          )}
          {hoveredTask.task.description && (
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
              {hoveredTask.task.description.slice(0, 140)}
              {hoveredTask.task.description.length > 140 && '…'}
            </div>
          )}
        </div>
      )}

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

      {/* v0.5 — block-cell popover. Click a free cell to block or
          unblock that date for a property. Phase 1: FAD-local; Phase 2
          will write through to Guesty. */}
      {blockingCell && (
        <BlockCellPopover
          property={blockingCell.property}
          listingGuestyId={blockingCell.listingGuestyId}
          dateIso={blockingCell.dateIso}
          cell={blockingCell.cell}
          anchorX={blockingCell.x}
          anchorY={blockingCell.y}
          onClose={() => setBlockingCell(null)}
          onChanged={() => {
            setBlockingCell(null);
            onBlocksChanged?.();
          }}
        />
      )}
    </div>
  );
}

// ───────────────── Block / unblock popover (v0.5) ─────────────────

function BlockCellPopover({
  property,
  listingGuestyId,
  dateIso,
  cell,
  anchorX,
  anchorY,
  onClose,
  onChanged,
}: {
  property: Property;
  listingGuestyId: string;
  dateIso: string;
  cell: CellPrice | null;
  anchorX: number;
  anchorY: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  // Dynamic import — keeps the network client out of the grid module's
  // first-paint critical path. Imported eagerly here since the popover
  // is already rendered.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { blockDates, unblockDates } = require('../../../_data/calendarGridClient') as typeof import('../../../_data/calendarGridClient');
  const isBlocked = !!cell?.blocked;
  const initialReason: BlockReason = (cell?.block_reason as BlockReason) || 'owner_stay';
  const [reason, setReason] = useState<BlockReason>(initialReason);
  const [notes, setNotes] = useState(cell?.block_notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBlock = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await blockDates({ listingGuestyId, dates: [dateIso], reason, notes: notes.trim() || undefined });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to block date');
    } finally {
      setBusy(false);
    }
  };

  const handleUnblock = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await unblockDates(listingGuestyId, [dateIso]);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unblock date');
    } finally {
      setBusy(false);
    }
  };

  const popoverWidth = 280;
  const left = typeof window !== 'undefined'
    ? Math.min(Math.max(anchorX - popoverWidth / 2, 8), window.innerWidth - popoverWidth - 8)
    : anchorX;
  const top = anchorY;

  return (
    <>
      {/* Click-outside scrim */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 49, background: 'transparent',
        }}
      />
      <div
        style={{
          position: 'fixed',
          left,
          top,
          zIndex: 50,
          width: popoverWidth,
          background: 'var(--color-background-primary)',
          border: '0.5px solid var(--color-border-secondary)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 8px 24px rgba(15, 24, 54, 0.18)',
          padding: 12,
          fontSize: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <strong>{property.code} · {dateIso.slice(5)}</strong>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {isBlocked ? (
          <>
            <div style={{ color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              Currently blocked{cell?.block_reason ? ` · ${BLOCK_REASON_LABEL[cell.block_reason as BlockReason] || cell.block_reason}` : ''}
              {cell?.block_notes && <div style={{ fontStyle: 'italic', marginTop: 4 }}>&ldquo;{cell.block_notes}&rdquo;</div>}
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button className="btn ghost sm" onClick={onClose} disabled={busy}>Close</button>
              <button className="btn sm" onClick={handleUnblock} disabled={busy} style={{ color: 'var(--color-text-danger)' }}>
                {busy ? 'Unblocking…' : 'Unblock'}
              </button>
            </div>
          </>
        ) : (
          <>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 11, color: 'var(--color-text-tertiary)' }}>Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as BlockReason)}
              disabled={busy}
              style={{ width: '100%', padding: 6, marginBottom: 8, fontSize: 12, borderRadius: 4, border: '0.5px solid var(--color-border-tertiary)' }}
            >
              {(['owner_stay', 'maintenance', 'private_use', 'channel_block', 'other'] as BlockReason[]).map((r) => (
                <option key={r} value={r}>{BLOCK_REASON_LABEL[r]}</option>
              ))}
            </select>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 11, color: 'var(--color-text-tertiary)' }}>Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
              placeholder="e.g. Mary &amp; Pierre · annual visit"
              style={{ width: '100%', padding: 6, marginBottom: 8, fontSize: 12, borderRadius: 4, border: '0.5px solid var(--color-border-tertiary)' }}
            />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button className="btn ghost sm" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="btn primary sm" onClick={handleBlock} disabled={busy}>
                {busy ? 'Blocking…' : 'Block date'}
              </button>
            </div>
          </>
        )}
        {error && (
          <div style={{ marginTop: 8, color: 'var(--color-text-danger)', fontSize: 11 }}>{error}</div>
        )}
      </div>
    </>
  );
}
