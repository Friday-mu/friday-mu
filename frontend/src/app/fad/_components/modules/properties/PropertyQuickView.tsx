'use client';

import { useEffect, useRef, useState } from 'react';
import {
  PROPERTY_BY_CODE,
  lifecycleBadge,
  LISTING_CHANNEL_LABEL,
  type Property,
} from '../../../_data/properties';
import { COHORT_LABEL } from '../../../_data/reviews';
import { FIN_OWNERS } from '../../../_data/finance';

interface ChipProps {
  code: string;
  /** Display content — defaults to the code in mono. Use to wrap existing
   *  cross-link styling (e.g. "Beachfront Loft 12 · BL-12"). */
  children?: React.ReactNode;
  className?: string;
  /** Override style for the trigger (the chip / link itself). */
  style?: React.CSSProperties;
}

/** Click target that opens an inline PropertyQuickView popover. Use anywhere
 *  a property cross-reference appears (Reservation detail / Operations
 *  TaskDetail / Reviews row / etc.). The popover anchors near the trigger
 *  on desktop, becomes a centered modal on mobile. */
export function PropertyChip({ code, children, className, style }: ChipProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (ref.current && !isMobile) {
      const r = ref.current.getBoundingClientRect();
      setAnchor({ x: r.left, y: r.bottom + 4 });
    } else {
      setAnchor(null);
    }
    setOpen(true);
  };

  return (
    <>
      <button
        ref={ref}
        onClick={handleClick}
        className={className}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: 'var(--color-brand-accent)',
          textDecoration: 'underline',
          font: 'inherit',
          ...style,
        }}
        title="Property quick view"
      >
        {children ?? <span className="mono">{code}</span>}
      </button>
      {open && (
        anchor
          ? <PropertyQuickView code={code} x={anchor.x} y={anchor.y} onClose={() => setOpen(false)} />
          : <PropertyQuickViewModal code={code} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/** Centered-modal variant for mobile (no x/y anchor — viewport-centered). */
function PropertyQuickViewModal({ code, onClose }: { code: string; onClose: () => void }) {
  const property = PROPERTY_BY_CODE[code];

  if (!property) {
    return (
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 320, padding: 16 }}>
          Property <span className="mono">{code}</span> not found.
        </div>
      </div>
    );
  }

  const badge = lifecycleBadge(property);
  const ownerName = property.primaryOwnerName ?? FIN_OWNERS.find((o) => o.id === property.primaryOwnerId)?.name ?? property.primaryOwnerId;
  const openFull = () => { window.location.href = `/fad?m=properties&sub=overview&p=${property.code}`; };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 360, maxWidth: '95vw',
          background: 'var(--color-background-primary)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          aspectRatio: '16 / 6',
          background: 'radial-gradient(ellipse at 30% 30%, rgba(86,128,202,0.3), transparent 60%), linear-gradient(135deg, var(--color-brand-navy), #1a2855)',
          position: 'relative',
        }}>
          <span className="mono" style={{ position: 'absolute', top: 8, left: 10, fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>{property.code}</span>
          <span className={`chip sm ${badge.tone === 'success' ? 'info' : badge.tone === 'warning' ? 'warn' : ''}`}
            style={{ position: 'absolute', top: 6, right: 6, fontSize: 9 }}>
            {badge.label}
          </span>
        </div>
        <div style={{ padding: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{property.name}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
            {COHORT_LABEL[property.region]} · {ownerName}
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 11, marginBottom: 12, flexWrap: 'wrap' }}>
            <Stat label="Occ 90d" value={property.occupancy90d > 0 ? `${Math.round(property.occupancy90d * 100)}%` : '—'} />
            <Stat label="ADR" value={property.adr > 0 ? `€${property.adr}` : '—'} />
            {property.rating > 0 && <Stat label="Rating" value={`★ ${property.rating.toFixed(2)}`} />}
            <Stat label="Beds" value={property.bedrooms === 0 ? 'Studio' : property.bedrooms.toString()} />
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button className="btn ghost sm" onClick={onClose}>Close</button>
            <button className="btn primary sm" onClick={openFull}>Open full →</button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface QuickViewProps {
  code: string;
  x: number;
  y: number;
  onClose: () => void;
}

export function PropertyQuickView({ code, x, y, onClose }: QuickViewProps) {
  const [adjustedY, setAdjustedY] = useState(y);
  const popoverRef = useRef<HTMLDivElement>(null);
  const property = PROPERTY_BY_CODE[code];

  // Keep popover within viewport
  useEffect(() => {
    if (!popoverRef.current) return;
    const r = popoverRef.current.getBoundingClientRect();
    const viewportH = window.innerHeight;
    if (r.bottom > viewportH - 12) {
      const overflow = r.bottom - (viewportH - 12);
      setAdjustedY(y - overflow);
    }
  }, [y]);

  if (!property) {
    return (
      <>
        <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={onClose} />
        <div
          ref={popoverRef}
          style={{
            position: 'fixed', left: x, top: y, zIndex: 100,
            width: 280, padding: 12,
            background: 'var(--color-background-primary)',
            border: '0.5px solid var(--color-border-tertiary)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.16)',
            fontSize: 12, color: 'var(--color-text-tertiary)',
          }}
        >
          Property <span className="mono">{code}</span> not found.
        </div>
      </>
    );
  }

  const badge = lifecycleBadge(property);
  const ownerName = property.primaryOwnerName ?? FIN_OWNERS.find((o) => o.id === property.primaryOwnerId)?.name ?? property.primaryOwnerId;

  const openFull = () => {
    window.location.href = `/fad?m=properties&sub=overview&p=${property.code}`;
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={onClose} />
      <div
        ref={popoverRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', left: x, top: adjustedY, zIndex: 100,
          width: 320,
          background: 'var(--color-background-primary)',
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.16)',
          overflow: 'hidden',
        }}
      >
        {/* Hero strip */}
        <div style={{
          aspectRatio: '16 / 6',
          background: 'radial-gradient(ellipse at 30% 30%, rgba(86,128,202,0.3), transparent 60%), linear-gradient(135deg, var(--color-brand-navy), #1a2855)',
          position: 'relative',
        }}>
          <span className="mono" style={{ position: 'absolute', top: 8, left: 10, fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>{property.code}</span>
          <span
            className={`chip sm ${badge.tone === 'success' ? 'info' : badge.tone === 'warning' ? 'warn' : ''}`}
            style={{ position: 'absolute', top: 6, right: 6, fontSize: 9 }}
          >
            {badge.label}
          </span>
        </div>

        <div style={{ padding: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{property.name}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
            {COHORT_LABEL[property.region]} · {ownerName}
          </div>

          <div style={{ display: 'flex', gap: 14, fontSize: 11, marginBottom: 10 }}>
            <Stat label="Occ 90d" value={property.occupancy90d > 0 ? `${Math.round(property.occupancy90d * 100)}%` : '—'} />
            <Stat label="ADR" value={property.adr > 0 ? `€${property.adr}` : '—'} />
            {property.rating > 0 && <Stat label="Rating" value={`★ ${property.rating.toFixed(2)}`} />}
            <Stat label="Beds" value={property.bedrooms === 0 ? 'Studio' : property.bedrooms.toString()} />
          </div>

          {property.listings.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
              {property.listings.map((l) => (
                <span key={l.channel} className="chip sm" style={{ fontSize: 9 }}>
                  {LISTING_CHANNEL_LABEL[l.channel]}
                </span>
              ))}
            </div>
          )}

          {property.lifecycleStatus === 'paused' && property.pausedReason && (
            <div style={{ padding: 8, background: 'rgba(220, 160, 60, 0.08)', borderRadius: 'var(--radius-sm)', fontSize: 11, marginBottom: 10 }}>
              ⚠ {property.pausedReason}
              {property.pauseReturnBy && <> · return {property.pauseReturnBy}</>}
            </div>
          )}

          {property.lifecycleStatus === 'onboarding' && (
            <div style={{ padding: 8, background: 'rgba(86, 128, 202, 0.08)', borderRadius: 'var(--radius-sm)', fontSize: 11, marginBottom: 10 }}>
              🛠 Onboarding in progress · see Onboarding sub-page for artifacts
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button className="btn ghost sm" onClick={onClose}>Close</button>
            <button className="btn primary sm" onClick={openFull}>Open full property →</button>
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

interface PropertyQuickViewWrapperProps {
  code: string;
  property?: Property;
}

/** Inline view (no popover) — for fitting inside an existing surface (e.g.
 *  reservation detail Property card). Renders the same compact data without
 *  the popover chrome. */
export function PropertyMiniCard({ code }: PropertyQuickViewWrapperProps) {
  const property = PROPERTY_BY_CODE[code];
  if (!property) {
    return <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Property {code} not found.</div>;
  }
  const badge = lifecycleBadge(property);
  const ownerName = property.primaryOwnerName ?? FIN_OWNERS.find((o) => o.id === property.primaryOwnerId)?.name ?? property.primaryOwnerId;
  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span className="mono" style={{ fontSize: 11 }}>{property.code}</span>
        <strong style={{ fontSize: 13 }}>{property.name}</strong>
        <span className={`chip sm ${badge.tone === 'success' ? 'info' : badge.tone === 'warning' ? 'warn' : ''}`}>{badge.label}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
        {COHORT_LABEL[property.region]} · {ownerName}
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: 11 }}>
        <Stat label="Occ 90d" value={property.occupancy90d > 0 ? `${Math.round(property.occupancy90d * 100)}%` : '—'} />
        <Stat label="ADR" value={property.adr > 0 ? `€${property.adr}` : '—'} />
        {property.rating > 0 && <Stat label="Rating" value={`★ ${property.rating.toFixed(2)}`} />}
      </div>
    </div>
  );
}
