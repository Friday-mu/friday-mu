'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PROPERTY_BY_CODE,
  PROPERTY_BY_ID,
  lifecycleBadge,
  checklistProgress,
  isOnboardingComplete,
  LISTING_CHANNEL_LABEL,
  PROPERTY_CARD_CATEGORY_LABEL,
  cardsForProperty,
  activityForProperty,
  ownersOfProperty,
  getContract,
  type Property,
  type PropertyCard,
  type PropertyCardCategory,
  type CardSurface,
  type CardSource,
} from '../../../_data/properties';
import { COHORT_LABEL } from '../../../_data/reviews';
import { FIN_OWNERS } from '../../../_data/finance';
import { RESERVATIONS, type Reservation } from '../../../_data/reservations';
import { useLiveReservations } from '../../../_data/reservationsClient';
import { usePropertyCards, updatePropertyTranslations, type PropertyTranslations } from '../../../_data/propertiesClient';
import { useCalendarGrid, blockDates, unblockDates } from '../../../_data/calendarGridClient';
import { BLOCK_REASON_LABEL, MultiCalendarGrid, type BlockReason, type CellPrice } from './../calendar/MultiCalendarGrid';
import { useApiTasks } from '../../../_data/useApiTasks';
import { useOwnersByGuestyId } from '../../../_data/ownersClient';
import { usePropertySummary, formatMinor } from '../../../_data/financeClient';
import { liveOnlyMode } from '../../../_data/demoMode';
import { useCurrentRole } from '../../usePermissions';
import { fireToast } from '../../Toaster';
import { PhotoGallery } from './PhotoGallery';
import { AmenityMatrix } from './AmenityMatrix';
import { ListingPushFlow } from './ListingPushFlow';
import { PropertyTasksTab } from './PropertyTasksTab';
import { SavedRepliesImport } from './SavedRepliesImport';
import { setBaseDescription, setChannelDescription, listingRecommendations, type ListingChannel } from '../../../_data/properties';

interface Props {
  propertyCode: string;
  onClose: () => void;
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'identity', label: 'Identity & Layout' },
  { id: 'owner', label: 'Owner' },
  { id: 'operational', label: 'Operational' },
  { id: 'financial', label: 'Financial' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'listings', label: 'Listings' },
  { id: 'reservations', label: 'Reservations' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'activity', label: 'Activity' },
];

/** Role-based tab gating per scoping pack §6. */
function visibleTabsFor(role: string): string[] {
  if (role === 'field') {
    return ['overview', 'identity', 'operational', 'calendar', 'reservations', 'tasks', 'activity'];
  }
  return TABS.map((t) => t.id);
}

export function PropertyDetail({ propertyCode, onClose }: Props) {
  const role = useCurrentRole();
  const visibleTabIds = useMemo(() => visibleTabsFor(role), [role]);
  const visibleTabs = TABS.filter((t) => visibleTabIds.includes(t.id));

  // Honor ?tab=<id> deep link (e.g. from Calendar module's property
  // click → Calendar tab pre-selected) but only if the tab is visible
  // to the current role. Falls through to the first visible tab.
  const initialTab = useMemo(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const requested = params.get('tab');
      if (requested && visibleTabIds.includes(requested)) return requested;
    }
    return visibleTabs[0]?.id ?? 'overview';
  }, [visibleTabIds, visibleTabs]);
  const [tab, setTab] = useState<string>(initialTab);
  const property = PROPERTY_BY_CODE[propertyCode];

  if (!property) {
    return (
      <>
        <div onClick={onClose} style={overlayStyle} />
        <aside className="task-detail-pane open" style={{ width: 720, maxWidth: '95vw' }}>
          <div style={{ padding: 24 }}>
            <button className="btn ghost sm" onClick={onClose}>← Close</button>
            <p style={{ marginTop: 16, color: 'var(--color-text-tertiary)' }}>Property <span className="mono">{propertyCode}</span> not found.</p>
          </div>
        </aside>
      </>
    );
  }

  return (
    <>
    <div onClick={onClose} style={overlayStyle} />
    <aside className="task-detail-pane open" style={{ width: 760, maxWidth: '95vw' }}>
      <PropertyDetailHeader property={property} onClose={onClose} />
      <div className="fad-tabs" style={{ padding: '0 20px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            className={'fad-tab' + (tab === t.id ? ' active' : '')}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {tab === 'overview' && <OverviewTab property={property} />}
        {tab === 'identity' && <IdentityTab property={property} />}
        {tab === 'owner' && <OwnerTab property={property} role={role} />}
        {tab === 'operational' && <OperationalTab property={property} role={role} />}
        {tab === 'financial' && <FinancialTab property={property} role={role} />}
        {tab === 'calendar' && <PropertyCalendarTab property={property} />}
        {tab === 'pricing' && <PricingTab property={property} />}
        {tab === 'listings' && <ListingsTab property={property} />}
        {tab === 'reservations' && <ReservationsTab property={property} />}
        {tab === 'tasks' && <PropertyTasksTab property={property} />}
        {tab === 'activity' && <ActivityTab property={property} />}
      </div>
    </aside>
    </>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: '48px 0 0 0',
  background: 'rgba(15, 24, 54, 0.12)',
  zIndex: 44,
};

function PropertyDetailHeader({ property, onClose }: { property: Property; onClose: () => void }) {
  const badge = lifecycleBadge(property);
  // Phase 2 (T3.12): prefer the live owner name from fad_owners. Fall
  // back to the FIN_OWNERS fixture lookup, then to the raw ID.
  const ownerName = property.primaryOwnerName
    ?? FIN_OWNERS.find((o) => o.id === property.primaryOwnerId)?.name
    ?? property.primaryOwnerId;
  const { done, total } = checklistProgress(property);
  const showProgress = property.lifecycleStatus === 'onboarding' || (property.lifecycleStatus === 'live' && !isOnboardingComplete(property));

  return (
    <div style={{ padding: 20, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button className="btn ghost sm" onClick={onClose}>← Back</button>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Last activity: {property.lastActivityAt}
        </span>
      </div>

      <div style={{
        aspectRatio: '16 / 5',
        background: 'radial-gradient(ellipse at 30% 30%, rgba(86,128,202,0.3), transparent 60%), linear-gradient(135deg, var(--color-brand-navy), #1a2855)',
        borderRadius: 'var(--radius-md)',
        position: 'relative',
        marginBottom: 12,
      }}>
        <span className="mono" style={{ position: 'absolute', top: 12, left: 12, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>{property.code}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>{property.name}</h2>
        <span className={`chip ${badge.tone === 'success' ? 'info' : badge.tone === 'warning' ? 'warn' : ''}`}>{badge.label}</span>
        {property.isCombo && <span className="chip">Combo · {property.componentPropertyIds?.length ?? 0} units</span>}
        {property.parentPropertyId && (
          <span className="chip">
            Part of: <span className="mono" style={{ marginLeft: 4 }}>{PROPERTY_BY_ID[property.parentPropertyId]?.code ?? property.parentPropertyId}</span>
          </span>
        )}
        {property.isSyndicManaged && <span className="chip">Friday-as-syndic</span>}
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
        {property.address} · {COHORT_LABEL[property.region]} · {ownerName}
      </div>

      {showProgress && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          Onboarding checklist: <strong style={{ color: 'var(--color-text-primary)' }}>{done} / {total}</strong>
        </div>
      )}
    </div>
  );
}

// ───────────────── Tab: Overview ─────────────────

function OverviewTab({ property }: { property: Property }) {
  const recs = listingRecommendations(property);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {recs.length > 0 && (
        <Section title="Recommendations">
          <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            AI-flagged listing-quality signals · Phase 2 augments with photo analysis + LLM description scoring.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recs.map((rec) => (
              <div
                key={rec.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px',
                  background: rec.severity === 'high' ? 'rgba(220, 80, 80, 0.08)' : rec.severity === 'medium' ? 'rgba(220, 160, 60, 0.08)' : 'var(--color-background-secondary)',
                  border: `0.5px solid ${rec.severity === 'high' ? 'rgba(220, 80, 80, 0.4)' : rec.severity === 'medium' ? 'rgba(220, 160, 60, 0.4)' : 'var(--color-border-tertiary)'}`,
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <span style={{ fontSize: 11, marginTop: 1 }}>
                  {rec.severity === 'high' ? '🔴' : rec.severity === 'medium' ? '🟡' : '⚪'}
                </span>
                <span style={{ flex: 1, fontSize: 12 }}>{rec.message}</span>
                {rec.actionLabel && (
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>· {rec.actionLabel}</span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
      <Section title="Quick stats">
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <Stat label="Occupancy YTD" value={property.occupancyYTD > 0 ? `${Math.round(property.occupancyYTD * 100)}%` : '—'} />
          <Stat label="Occupancy 90d" value={property.occupancy90d > 0 ? `${Math.round(property.occupancy90d * 100)}%` : '—'} />
          <Stat label="ADR" value={property.adr > 0 ? `€${property.adr}` : '—'} />
          <Stat label="Rating" value={property.rating > 0 ? `★ ${property.rating.toFixed(2)} (${property.ratingCount})` : '—'} />
          <Stat label="Base rate" value={property.baseRateMUR > 0 ? `Rs ${(property.baseRateMUR / 100).toLocaleString()}` : '—'} />
        </div>
      </Section>

      <Section title="Layout">
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', fontSize: 13 }}>
          <span><strong>{property.bedrooms === 0 ? 'Studio' : `${property.bedrooms} BR`}</strong></span>
          {property.bathrooms !== undefined && <span><strong>{property.bathrooms}</strong> bath</span>}
          <span>Sleeps <strong>{property.maxOccupancy}</strong></span>
          {property.sqm !== undefined && <span><strong>{property.sqm}</strong> m²</span>}
          <span style={{ textTransform: 'capitalize' }}>{property.listingType}</span>
        </div>
      </Section>

      <Section title="Channels">
        {property.listings.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0 }}>No active listings yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {property.listings.map((l) => (
              <div key={l.channel + l.externalId} style={{ display: 'flex', gap: 12, fontSize: 12, alignItems: 'center' }}>
                <span style={{ width: 96 }}>{LISTING_CHANNEL_LABEL[l.channel]}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{l.externalId}</span>
                <span className={`chip sm ${l.status === 'active' ? 'info' : l.status === 'paused' ? 'warn' : ''}`}>{l.status}</span>
                {l.commissionPct !== undefined && <span style={{ color: 'var(--color-text-tertiary)' }}>· {l.commissionPct}% commission</span>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {property.tags.length > 0 && (
        <Section title="Tags">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {property.tags.map((t) => <span key={t} className="chip">{t}</span>)}
          </div>
        </Section>
      )}

      {property.pausedReason && (
        <Section title="Paused">
          <p style={{ margin: 0, fontSize: 13 }}>{property.pausedReason}</p>
          {property.pauseReturnBy && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>Return by {property.pauseReturnBy}</p>}
        </Section>
      )}
    </div>
  );
}

// ───────────────── Tab: Identity & Layout ─────────────────

function IdentityTab({ property }: { property: Property }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Section title="Public copy (EN / FR)">
        <TranslationsEditor property={property} />
      </Section>

      {property.heroPhotoUrl && (
        <div
          style={{
            aspectRatio: '16 / 9',
            background: `linear-gradient(180deg, rgba(0,0,0,0.0) 50%, rgba(0,0,0,0.35) 100%), url(${property.heroPhotoUrl}) center/cover no-repeat`,
            borderRadius: 'var(--radius-md)',
            border: '0.5px solid var(--color-border-tertiary)',
          }}
          aria-label={`${property.name} hero photo (from Guesty)`}
        />
      )}

      <Section title="Photo gallery">
        <PhotoGallery property={property} />
      </Section>

      <Section title="Layout">
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, fontSize: 13 }}>
          <Label>Type</Label><div style={{ textTransform: 'capitalize' }}>{property.listingType}</div>
          <Label>Bedrooms</Label><div>{property.bedrooms === 0 ? 'Studio' : property.bedrooms}</div>
          {property.bathrooms !== undefined && <><Label>Bathrooms</Label><div>{property.bathrooms}</div></>}
          <Label>Max occupancy</Label><div>{property.maxOccupancy}</div>
          {property.sqm !== undefined && <><Label>Floor area</Label><div>{property.sqm} m²</div></>}
          {property.buildingName && <><Label>Building</Label><div>{property.buildingName}</div></>}
        </div>
      </Section>

      <Section title="Address">
        <div style={{ fontSize: 13 }}>{property.address}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
          Region: {COHORT_LABEL[property.region]} · Sub-region: {property.area}
        </div>
        {property.geo && (
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }} className="mono">
            {property.geo.lat.toFixed(4)}, {property.geo.lng.toFixed(4)}
          </div>
        )}
      </Section>

      {/* #34 — Amenities split into two surfaces:
       *  - Guesty amenities (read-only, source of truth for OTAs;
       *    pulled from guesty_listings.raw.amenities at /api/properties)
       *  - FAD tagged amenities (overlay, for Quote-builder + filters)
       *  Empty states are explicit so ops can see what's missing.
       */}
      <Section title="Amenities">
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
          Guesty (live, read-only) · {property.guestyAmenities?.length || 0} listed
        </div>
        {property.guestyAmenities && property.guestyAmenities.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
            {property.guestyAmenities.map((a) => (
              <span
                key={a}
                className="chip"
                style={{ fontSize: 11, padding: '2px 8px' }}
              >
                {a}
              </span>
            ))}
          </div>
        ) : (
          <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
            None on Guesty yet — add via Guesty Listings → Amenities.
          </p>
        )}

        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8, paddingTop: 8, borderTop: '0.5px solid var(--color-border-tertiary)' }}>
          FAD overlay (editable, used by Quote builder + filters) · {property.amenities?.length || 0} tagged
        </div>
        {property.amenities && property.amenities.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {property.amenities.map((a) => (
              <span
                key={a}
                className="chip info"
                style={{ fontSize: 11, padding: '2px 8px' }}
              >
                {a}
              </span>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
            No FAD tags yet — Phase 2 wires the editable matrix.
          </p>
        )}
      </Section>

      {(property.parentPropertyId || property.isCombo) && (
        <Section title="Multi-unit group">
          {property.parentPropertyId && (
            <div style={{ fontSize: 13 }}>
              Part of: <span className="mono">{PROPERTY_BY_ID[property.parentPropertyId]?.code}</span> · {PROPERTY_BY_ID[property.parentPropertyId]?.name}
            </div>
          )}
          {property.isCombo && property.componentPropertyIds && (
            <div style={{ fontSize: 13 }}>
              Combo of: {property.componentPropertyIds.map((cid) => (
                <span key={cid} className="mono" style={{ marginRight: 8 }}>{PROPERTY_BY_ID[cid]?.code}</span>
              ))}
              <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                Calendar dependency managed via Guesty Smart Calendar Rules. FAD reads.
              </p>
            </div>
          )}
        </Section>
      )}

      <Section title="Amenities">
        <AmenityMatrix property={property} />
      </Section>
    </div>
  );
}

// ───────────────── Tab: Owner ─────────────────

function OwnerTab({ property, role }: { property: Property; role: string }) {
  const fixtureOwners = ownersOfProperty(property.id);
  const contract = getContract(property);
  const showSensitive = role === 'director';
  const showCapPresence = role === 'commercial_marketing' || role === 'ops_manager' || role === 'director';
  // Phase 2 (T3.12): resolve the live primary owner via Guesty owner_id
  // → fad_owners.guesty_owner_id. When the live name is available we
  // render it; otherwise fall back to the FIN_OWNERS fixture lookup.
  const { byGuestyId } = useOwnersByGuestyId();
  const liveOwner = property.primaryOwnerId
    ? byGuestyId.get(property.primaryOwnerId)
    : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Section title="Owners">
        {liveOwner && (
          <div className="card" style={{ padding: 14, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <strong style={{ fontSize: 14 }}>{liveOwner.display_name}</strong>
              <span className="chip sm info">Primary</span>
              <span style={{ marginLeft: 'auto', fontSize: 13 }}><strong>100%</strong> ownership</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {liveOwner.language && <span>Language: {liveOwner.language.toUpperCase()}</span>}
              {liveOwner.contact_email && <span>{liveOwner.contact_email}</span>}
              {liveOwner.contact_phone && <span className="mono">{liveOwner.contact_phone}</span>}
              {liveOwner.country && <span>· {liveOwner.country}</span>}
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button
                className="btn ghost sm"
                onClick={() => { window.location.href = `/fad?m=owners&id=${liveOwner.id}`; }}
              >
                Open in Owners →
              </button>
              {!liveOwner.contact_email && (
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', alignSelf: 'center' }}>
                  Placeholder name — edit to fill in real owner details.
                </span>
              )}
            </div>
          </div>
        )}
        {!liveOwner && fixtureOwners.map((po) => {
          const owner = FIN_OWNERS.find((o) => o.id === po.ownerId);
          if (!owner) return null;
          return (
            <div key={po.ownerId} className="card" style={{ padding: 14, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <strong style={{ fontSize: 14 }}>{owner.name}</strong>
                {po.isPrimary && <span className="chip sm info">Primary</span>}
                <span style={{ marginLeft: 'auto', fontSize: 13 }}><strong>{po.ownershipPct}%</strong> ownership</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span>Language: {owner.language.toUpperCase()}</span>
                <span className="mono">{owner.whatsapp}</span>
              </div>
              <button
                className="btn ghost sm"
                style={{ marginTop: 8 }}
                onClick={() => { window.location.href = `/fad?m=owners`; }}
              >
                Open in Owners →
              </button>
            </div>
          );
        })}
        {!liveOwner && fixtureOwners.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            No owner linked yet · seed via the Owners module
          </div>
        )}
      </Section>

      <Section title="Contract">
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, fontSize: 13 }}>
          <Label>Status</Label>
          <div>
            <span className={`chip sm ${contract.status === 'active' ? 'info' : contract.status === 'renewal_due' ? 'warn' : ''}`}>{contract.status.replace('_', ' ')}</span>
          </div>
          {showSensitive ? (
            <>
              <Label>Commission</Label><div><strong>{contract.commissionPct}%</strong></div>
              <Label>Payment day</Label><div>Day {contract.paymentDay} of month</div>
              {'endsAt' in contract && contract.endsAt && contract.endsAt !== '—' && <><Label>Renewal</Label><div>{contract.endsAt}</div></>}
              {'xodoEnvelopeId' in contract && contract.xodoEnvelopeId && contract.xodoEnvelopeId !== '—' && (
                <>
                  <Label>Xodo envelope</Label>
                  <div className="mono" style={{ fontSize: 11 }}>{contract.xodoEnvelopeId}</div>
                </>
              )}
            </>
          ) : (
            <>
              <Label>Commission</Label><div style={{ color: 'var(--color-text-tertiary)' }}>· hidden ·</div>
              <Label>Payment day</Label><div style={{ color: 'var(--color-text-tertiary)' }}>· hidden ·</div>
            </>
          )}
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Contract document lives in Legal/Admin (Xodo Sign envelope). Phase 2: deep-link to Xodo viewer.
        </p>
      </Section>

      {showCapPresence && (
        <Section title="Maintenance spend cap">
          {showSensitive ? (
            <p style={{ margin: 0, fontSize: 13 }}>
              <strong>Rs 2,500 OR 10% of booking</strong>, whichever applies per Owner contract terms (T&Cs).
              {property.maintenanceCapOverrideMinor !== undefined && (
                <> Override: <strong>Rs {(property.maintenanceCapOverrideMinor / 100).toLocaleString()}</strong>.</>
              )}
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
              Cap configured · amount visible to Director only.
            </p>
          )}
          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            Properties surfaces this read-only · Finance / Owner contract owns enforcement.
          </p>
        </Section>
      )}
    </div>
  );
}

// ───────────────── Tab: Operational ─────────────────

function OperationalTab({ property, role }: { property: Property; role: string }) {
  const [, setRev] = useState(0);
  const bump = () => setRev((n) => n + 1);
  const [importOpen, setImportOpen] = useState(false);
  // Pull real Property Cards from the backend (mig 077 + 2026-05-24 wiring).
  // Falls back to fixture-only cards in demo mode or when the backend errors
  // — keeps the UI useful in both contexts.
  const { cards: liveCardRecords, loading: cardsLoading, refetch: refetchCards } = usePropertyCards(property.id);
  const liveCards = useMemo<PropertyCard[]>(
    () => liveCardRecords.map((r) => ({
      id: r.id,
      propertyId: (r.property_id || 'global') as string | 'global',
      category: r.category as PropertyCardCategory,
      title: r.title,
      body: r.body,
      surface: r.surface as CardSurface,
      source: r.source as CardSource,
      aiExtractionMetadata: r.ai_thread_id && r.ai_confidence != null
        ? { threadId: r.ai_thread_id, confidence: r.ai_confidence }
        : undefined,
      lastUpdated: r.updated_at,
      lastUpdatedByUserId: r.last_updated_by_user_id ?? '',
    })),
    [liveCardRecords],
  );
  const fixtureCards = useMemo(() => cardsForProperty(property.id, { includeGlobal: true }), [property.id]);
  // Live data wins; only fall back to fixtures when liveOnlyMode is off AND
  // backend returned no cards (avoids showing demo cards in prod-FR alongside
  // empty real state).
  const cards = liveCards.length > 0
    ? liveCards
    : (!liveOnlyMode() ? fixtureCards : []);
  const cardsByCategory = useMemo(() => {
    const map: Partial<Record<PropertyCardCategory, PropertyCard[]>> = {};
    cards.forEach((c) => { (map[c.category] = map[c.category] ?? []).push(c); });
    return map;
  }, [cards]);
  // Refetch when the import drawer closes (a newly-imported card should appear).
  const wasImportOpen = useRef(importOpen);
  useEffect(() => {
    if (wasImportOpen.current && !importOpen) refetchCards();
    wasImportOpen.current = importOpen;
  }, [importOpen, refetchCards]);

  const isFieldRole = role === 'field';
  // Time-gated access codes: if Field, would only show on day-of-task-at-property in real product.
  // For Phase 1 mock, show with a notice.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Section title="Property Cards · AI-knowledge surface">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)', flex: 1 }}>
            {cards.length} card{cards.length === 1 ? '' : 's'} · 8 categories · consumed by Ask Friday for guest / cleaner / team queries.
          </p>
          {role !== 'field' && (
            <button
              className="btn ghost sm"
              onClick={() => setImportOpen(true)}
              title={`Import this property's Guesty saved replies as Property Cards`}
              style={{ flexShrink: 0 }}
            >
              ↓ Import Guesty replies
            </button>
          )}
        </div>
        <AiCardSuggestion property={property} />
        {importOpen && (
          <SavedRepliesImport
            propertyCode={property.code}
            onClose={() => { setImportOpen(false); bump(); }}
          />
        )}

        {Object.entries(PROPERTY_CARD_CATEGORY_LABEL).map(([cat, catLabel]) => {
          const items = cardsByCategory[cat as PropertyCardCategory] ?? [];
          if (items.length === 0) return null;
          return (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-tertiary)', marginBottom: 6 }}>
                {catLabel}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map((c) => (
                  <CardRow key={c.id} card={c} accessTimeGated={isFieldRole && c.category === 'access'} />
                ))}
              </div>
            </div>
          );
        })}
        {cards.length === 0 && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
            No Property Cards yet. Add one to bootstrap AI knowledge.
          </p>
        )}
      </Section>

      <Section title="Defaults from Breezeway">
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, fontSize: 13 }}>
          <Label>Cleaner</Label><div style={{ color: 'var(--color-text-tertiary)' }}>· read-from Breezeway · Phase 2 ·</div>
          <Label>Inspector</Label><div style={{ color: 'var(--color-text-tertiary)' }}>· read-from Breezeway · Phase 2 ·</div>
          <Label>Maintenance</Label><div style={{ color: 'var(--color-text-tertiary)' }}>· read-from Breezeway · Phase 2 ·</div>
        </div>
      </Section>

      {property.isSyndicManaged && (
        <Section title="Syndic">
          <p style={{ margin: 0, fontSize: 13 }}>
            Friday Retreats acts as the syndicate for this building.
          </p>
          <button
            className="btn ghost sm"
            style={{ marginTop: 8 }}
            onClick={() => { window.location.href = `/fad?m=syndic`; }}
          >
            Open in Syndic →
          </button>
        </Section>
      )}
    </div>
  );
}

/** Phase 1 visual placeholder for the AI extraction loop (pack §8). Hardcoded
 *  fixture for the demo; Phase 2 wires real Inbox + task-comment scanning. */
function AiCardSuggestion({ property }: { property: Property }) {
  const [dismissed, setDismissed] = useState(false);
  // Pick a property-specific suggestion to make the demo land. Defaults
  // gracefully when none is configured.
  const suggestion = AI_SUGGESTIONS_BY_CODE[property.code];
  if (!suggestion || dismissed) return null;
  return (
    <div
      style={{
        marginBottom: 14, padding: '10px 12px',
        background: 'rgba(var(--color-brand-accent-rgb, 86, 128, 202), 0.08)',
        border: '0.5px solid var(--color-brand-accent)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 13 }}>✨</span>
        <div style={{ flex: 1, fontSize: 12, lineHeight: 1.5 }}>
          <strong>AI noticed</strong> · {suggestion.message}
        </div>
        <button className="btn primary sm" onClick={() => { fireToast('Property Card draft would open · Phase 2 AI extraction loop'); setDismissed(true); }}>Add</button>
        <button className="btn ghost sm" onClick={() => setDismissed(true)}>Dismiss</button>
      </div>
    </div>
  );
}

// @demo:data — Tag: PROD-DATA-17 — see frontend/DEMO_CRUFT.md
// Hardcoded AI suggestions keyed by property code. Replace with:
// GET /api/properties/:code/ai-suggestions (server-side LLM-derived).
const AI_SUGGESTIONS_BY_CODE: Record<string, { message: string }> = {
  'BS-1': { message: 'BS-1 doesn\'t have a Card entry for water shutoff — Mathias mentioned it in thread #1234. Add to Property Cards?' },
  'VV-47': { message: 'Two recent guest threads asked about pool heating. Add a Pool / Outdoor Card to capture the answer once?' },
  'BL-12': { message: 'Maintenance task t-006 referenced an A/C compressor model — propose adding it to the Wifi & Tech / Utilities Card?' },
};

function CardRow({ card, accessTimeGated }: { card: PropertyCard; accessTimeGated: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card" style={{ padding: 10 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', width: '100%', textAlign: 'left' }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{card.title}</span>
        <span className={`chip sm ${card.surface === 'guest_facing' ? 'info' : ''}`} style={{ marginLeft: 'auto' }}>
          {card.surface === 'guest_facing' ? 'Guest' : card.surface === 'internal_only' ? 'Internal' : 'Both'}
        </span>
        {card.source !== 'manual' && <span className="chip sm">{card.source.replace('_', ' ')}</span>}
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 8, padding: '8px 0', borderTop: '0.5px solid var(--color-border-tertiary)', fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>
          {accessTimeGated ? (
            <span style={{ color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
              · access details visible only on day of task at this property ·
            </span>
          ) : (
            card.body
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────── Tab: Financial ─────────────────

function FinancialTab({ property, role }: { property: Property; role: string }) {
  // T1.11 + Phase 3: live 90-day summary from /api/finance/property/:code/summary.
  // Aggregates revenue from guesty_reservations + expenses from the expenses
  // table. Channel fees + Friday margin land in Finance Phase 2.
  const { summary, loading, error } = usePropertySummary(property.code, 90);
  const showOwnerBalance = role === 'director';

  if (property.lifecycleStatus === 'onboarding') {
    return (
      <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
        Property is in onboarding · no revenue yet. Gap-analysis purchases will surface here once Finance integration is complete.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Section title="Last 90 days">
        {loading && (
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0 }}>Loading…</p>
        )}
        {error && (
          <p style={{ fontSize: 12, color: 'var(--color-text-warning)', margin: 0 }}>
            Failed to load: {error}
          </p>
        )}
        {summary && (
          <>
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              <Stat label="Revenue" value={formatMinor(summary.revenue_minor, summary.currency)} />
              <Stat label="Reservations" value={String(summary.reservation_count)} />
              <Stat label="Occupancy" value={`${summary.occupancy_pct}%`} />
              <Stat label="ADR" value={summary.adr_minor != null ? formatMinor(summary.adr_minor, summary.currency) : '—'} />
              <Stat label="Expenses" value={formatMinor(summary.expenses_minor, summary.currency)} />
              {showOwnerBalance && <Stat label="Net to owner" value={formatMinor(summary.net_to_owner_minor, summary.currency)} />}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Live · {summary.booked_nights} booked / {summary.window_nights} nights · {summary.window_from} → {summary.window_to}.
              Channel fees + Friday margin land in Finance Phase 2.
            </p>
          </>
        )}
      </Section>

      <Section title="Recent transactions">
        <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: 0 }}>
          Channel payouts + owner statements + tourist-tax remittances surface here when Finance Phase 2 lands the ledger entries (T3.10).
          For now, see [Finance → Transactions] for cross-property activity.
        </p>
        <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={() => { window.location.href = `/fad?m=finance&sub=transactions`; }}>
          Open in Finance →
        </button>
      </Section>
    </div>
  );
}

// ───────────────── Tab: Calendar (per-property) ─────────────────
//
// Per-property timeline showing reservations + tasks + blocks + prices
// in one view. Reuses MultiCalendarGrid with a single-property array
// so the band/chip/cell rendering matches the cross-property surface
// in CalendarModule exactly. The 90-day window matches Reservations
// scope locked in §5.3 (active + future 90 days + past 12 months
// searchable; default window = active + 90d).
//
// Cross-link: clicking a property in CalendarModule's MultiCalendarGrid
// opens PropertyDetail with `?tab=calendar` so users land here directly.
function PropertyCalendarTab({ property }: { property: Property }) {
  const windowStart = useMemo(() => new Date(), []);
  const windowDays = 90;
  const from = windowStart.toISOString().slice(0, 10);
  const toDate = useMemo(
    () => new Date(windowStart.getTime() + (windowDays - 1) * 86400000),
    [windowStart],
  );
  const to = toDate.toISOString().slice(0, 10);
  const todayIso = windowStart.toISOString().slice(0, 10);

  const { pricesByListing, refetch: refetchGrid } = useCalendarGrid(from, to);

  // Live reservations scoped to this property's code, filtered
  // client-side to drop cancelled (the calendar filter pattern from
  // CalendarModule). Inquiries default-off; the toggle below reveals.
  const [showInquiries, setShowInquiries] = useState(false);
  const { reservations: liveRsv } = useLiveReservations();
  const reservations = useMemo(() => {
    if (!liveRsv) return [];
    return liveRsv.filter((r) => {
      if (r.propertyCode !== property.code) return false;
      if (r.status === 'cancelled') return false;
      if (!showInquiries && (r.status === 'inquiry' || r.status === 'hold')) return false;
      return true;
    });
  }, [liveRsv, property.code, showInquiries]);

  // Live tasks for this property, in-window.
  const taskFilter = useMemo(() => ({ property: property.code, from, to }), [property.code, from, to]);
  const { tasks: liveTasks } = useApiTasks(taskFilter);
  const tasksByPropertyCode = useMemo(() => {
    const map = new Map<string, typeof liveTasks>();
    if (liveTasks) map.set(property.code, liveTasks);
    return map;
  }, [liveTasks, property.code]);

  // MultiCalendarGrid expects a Property[]-shaped list. Pass a one-item
  // array sourced from the PropertyDetail's loaded property. The shape
  // already matches (lifecycleStatus / code / name / heroPhotoUrl /
  // id = guestyId).
  const singleProperty = useMemo(() => [{
    id: property.id, // guesty_id when present (the listing key)
    code: property.code,
    name: property.name,
    lifecycleStatus: property.lifecycleStatus,
    heroPhotoUrl: property.heroPhotoUrl,
  }], [property]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
        <span>{windowDays}-day window · {from} → {to}</span>
        <span style={{ flex: 1 }} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showInquiries}
            onChange={(e) => setShowInquiries(e.target.checked)}
          />
          Show inquiries
        </label>
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        Reservations (bands) · tasks (chips) · blocks (overlay) · prices in empty cells. Tap a date to block; tap a reservation to open.
      </div>
      <MultiCalendarGrid
        properties={singleProperty as never}
        reservations={reservations}
        pricesByListing={pricesByListing}
        tasksByPropertyCode={tasksByPropertyCode}
        windowStart={windowStart}
        windowDays={windowDays}
        todayIso={todayIso}
        onBlocksChanged={refetchGrid}
        onReservationClick={(rsv) => {
          if (typeof window !== 'undefined') {
            window.location.href = `/fad?m=reservations&sub=overview&rsv=${rsv.id}`;
          }
        }}
        onTaskClick={(task) => {
          if (typeof window !== 'undefined') {
            window.location.href = `/fad?m=operations&sub=all&task=${task.id}`;
          }
        }}
      />
    </div>
  );
}

// ───────────────── Tab: Pricing (Calendar v0.5) ─────────────────
//
// Per-property pricing view. Reads /api/calendar/grid for the next 60
// days and lets staff block / unblock dates inline. Editing the price
// itself is gated to Phase 2 (write-through to Guesty's pricing API);
// blocks are FAD-local via fad_calendar_blocks (mig 090).

function PricingTab({ property }: { property: Property }) {
  const listingId = property.id;
  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const toDate = new Date(today.getTime() + 60 * 86400000);
  const to = toDate.toISOString().slice(0, 10);
  const { pricesByListing, loading, error, refetch } = useCalendarGrid(from, to);
  const cells = pricesByListing.get(listingId) || {};
  // #36 — view toggle. List was shipped first; calendar grid is the
  // "month-on-a-page" view that maps to operator intuition (Sundays
  // line up vertically, weekends visible at a glance).
  const [view, setView] = useState<'list' | 'calendar'>('calendar');

  // Build a stable list of date rows for the window, even if the
  // backend has no entry for some days. Missing days render as "—".
  const days = useMemo(() => {
    const out: Array<{ iso: string; cell: CellPrice | null }> = [];
    for (let i = 0; i < 60; i++) {
      const d = new Date(today.getTime() + i * 86400000);
      const iso = d.toISOString().slice(0, 10);
      out.push({ iso, cell: cells[iso] || null });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, pricesByListing]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Section title={`Pricing · next 60 days · ${property.code}`}>
        {loading && <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0 }}>Loading…</p>}
        {error && <p style={{ fontSize: 12, color: 'var(--color-text-warning)', margin: 0 }}>{error}</p>}
        {!loading && !error && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ display: 'inline-flex', borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--color-border-tertiary)', overflow: 'hidden' }}>
                <button
                  type="button"
                  className={'btn ghost sm' + (view === 'calendar' ? ' active' : '')}
                  onClick={() => setView('calendar')}
                  style={{ borderRadius: 0, border: 0, background: view === 'calendar' ? 'var(--color-background-tertiary)' : 'transparent', fontSize: 11, padding: '4px 10px' }}
                >
                  Calendar
                </button>
                <button
                  type="button"
                  className={'btn ghost sm' + (view === 'list' ? ' active' : '')}
                  onClick={() => setView('list')}
                  style={{ borderRadius: 0, border: 0, background: view === 'list' ? 'var(--color-background-tertiary)' : 'transparent', fontSize: 11, padding: '4px 10px' }}
                >
                  List
                </button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: 0, flex: 1 }}>
                Prices read from Guesty cache · blocks are FAD-local (Phase 1).
              </p>
            </div>
            {view === 'list' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {days.map(({ iso, cell }) => (
                  <PricingRow
                    key={iso}
                    iso={iso}
                    cell={cell}
                    listingGuestyId={listingId}
                    onChanged={refetch}
                  />
                ))}
              </div>
            )}
            {view === 'calendar' && (
              <PricingCalendarGrid
                days={days}
                listingGuestyId={listingId}
                onChanged={refetch}
              />
            )}
          </>
        )}
      </Section>
    </div>
  );
}

// #36 — month-on-a-page calendar grid for the per-property pricing
// view. 7-column layout (Mon-Sun, week starting Monday to match
// Mauritius convention). Each cell shows price + block badge; click
// opens the same per-row Block/Unblock UI used by the list view.
function PricingCalendarGrid({
  days,
  listingGuestyId,
  onChanged,
}: {
  days: Array<{ iso: string; cell: CellPrice | null }>;
  listingGuestyId: string;
  onChanged: () => void;
}) {
  // Pad to align the first day to Monday (getDay: 0=Sun, 1=Mon,...).
  const first = days[0];
  if (!first) return null;
  const firstDate = new Date(`${first.iso}T12:00:00`);
  const firstDow = firstDate.getDay(); // 0..6
  const padStart = (firstDow + 6) % 7; // monday-first
  const cells: Array<{ iso: string; cell: CellPrice | null } | null> = [
    ...Array(padStart).fill(null),
    ...days,
  ];
  // Group by month for headers.
  const monthLabel = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };
  const months: Array<{ label: string; weeks: Array<Array<{ iso: string; cell: CellPrice | null } | null>> }> = [];
  let currentMonth = '';
  let currentMonthEntry: { label: string; weeks: Array<Array<{ iso: string; cell: CellPrice | null } | null>> } | null = null;
  let week: Array<{ iso: string; cell: CellPrice | null } | null> = [];
  for (let i = 0; i < cells.length; i++) {
    const entry = cells[i];
    const iso = entry?.iso;
    const m = iso ? monthLabel(iso) : currentMonth;
    if (m && m !== currentMonth) {
      if (currentMonthEntry && week.length > 0) {
        // pad current week to 7 then push
        while (week.length < 7) week.push(null);
        currentMonthEntry.weeks.push(week);
        week = [];
      }
      currentMonth = m;
      currentMonthEntry = { label: m, weeks: [] };
      months.push(currentMonthEntry);
    }
    week.push(entry);
    if (week.length === 7) {
      currentMonthEntry?.weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0 && currentMonthEntry) {
    while (week.length < 7) week.push(null);
    currentMonthEntry.weeks.push(week);
  }

  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {months.map((m) => (
        <div key={m.label}>
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-text-tertiary)',
            marginBottom: 8,
          }}>{m.label}</div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 4,
            marginBottom: 4,
          }}>
            {DOW.map((d) => (
              <div key={d} style={{ fontSize: 10, textAlign: 'center', color: 'var(--color-text-tertiary)', padding: '2px 0' }}>{d}</div>
            ))}
          </div>
          {m.weeks.map((wk, wi) => (
            <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
              {wk.map((entry, di) => (
                <PricingCalendarCell
                  key={di}
                  entry={entry}
                  listingGuestyId={listingGuestyId}
                  onChanged={onChanged}
                />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function PricingCalendarCell({
  entry,
  listingGuestyId,
  onChanged,
}: {
  entry: { iso: string; cell: CellPrice | null } | null;
  listingGuestyId: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!entry) {
    return <div style={{ minHeight: 56, background: 'transparent' }} />;
  }
  const { iso, cell } = entry;
  const date = new Date(`${iso}T12:00:00`);
  const day = date.getDate();
  const dow = date.getDay(); // 0=Sun, 6=Sat
  const isWeekend = dow === 0 || dow === 6;
  const today = new Date().toISOString().slice(0, 10);
  const isToday = iso === today;
  const isBlocked = !!cell?.blocked;
  const priceText = cell?.price_minor != null
    ? `${cell.currency === 'EUR' ? '€' : cell.currency === 'MUR' ? 'Rs' : cell.currency === 'USD' ? '$' : ''}${Math.round(cell.price_minor / 100)}`
    : null;
  const handleClick = async () => {
    if (busy) return;
    if (isBlocked) {
      setBusy(true);
      try {
        await unblockDates(listingGuestyId, [iso]);
        onChanged();
      } catch (e) {
        fireToast(e instanceof Error ? e.message : 'Unblock failed');
      } finally {
        setBusy(false);
      }
    } else {
      // Quick-block with default reason. List view has the full
      // reason + notes form; calendar tap is the fast path.
      setBusy(true);
      try {
        await blockDates({ listingGuestyId, dates: [iso], reason: 'maintenance' });
        onChanged();
      } catch (e) {
        fireToast(e instanceof Error ? e.message : 'Block failed');
      } finally {
        setBusy(false);
      }
    }
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title={
        isBlocked
          ? `${iso} · Blocked${cell?.block_reason ? ` · ${cell.block_reason}` : ''} · tap to unblock`
          : `${iso} · ${priceText || 'no price'} · tap to block`
      }
      style={{
        minHeight: 56,
        padding: '4px 6px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        background: isBlocked
          ? 'var(--color-bg-warning, rgba(245, 158, 11, 0.12))'
          : isWeekend
            ? 'rgba(150, 150, 150, 0.05)'
            : 'var(--color-background-primary)',
        border: isToday ? '1px solid var(--color-brand-accent)' : '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-sm)',
        cursor: busy ? 'wait' : 'pointer',
        opacity: busy ? 0.6 : 1,
        textAlign: 'left',
        color: 'inherit',
        fontFamily: 'inherit',
      }}
    >
      <span className="mono" style={{ fontSize: 11, color: isToday ? 'var(--color-brand-accent)' : 'var(--color-text-tertiary)', fontWeight: isToday ? 600 : 400 }}>{day}</span>
      <span className="mono" style={{ fontSize: 12, fontWeight: 500 }}>{priceText || '—'}</span>
      {isBlocked && (
        <span style={{ fontSize: 9, color: 'var(--color-text-warning)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>blocked</span>
      )}
    </button>
  );
}

function PricingRow({
  iso,
  cell,
  listingGuestyId,
  onChanged,
}: {
  iso: string;
  cell: CellPrice | null;
  listingGuestyId: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState<BlockReason>('owner_stay');
  const [notes, setNotes] = useState('');
  const isBlocked = !!cell?.blocked;
  const date = new Date(`${iso}T12:00:00`);
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const priceText = cell?.price_minor != null
    ? `${cell.currency === 'EUR' ? '€' : cell.currency === 'MUR' ? 'Rs' : cell.currency === 'USD' ? '$' : ''}${Math.round(cell.price_minor / 100)}`
    : '—';

  const handleBlock = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await blockDates({ listingGuestyId, dates: [iso], reason, notes: notes.trim() || undefined });
      setExpanded(false);
      onChanged();
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Block failed');
    } finally {
      setBusy(false);
    }
  };

  const handleUnblock = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await unblockDates(listingGuestyId, [iso]);
      onChanged();
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Unblock failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '8px 10px',
        borderBottom: '0.5px solid var(--color-border-tertiary)',
        background: isBlocked ? 'var(--color-bg-warning, rgba(245, 158, 11, 0.06))' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
        <span className="mono" style={{ width: 28, color: 'var(--color-text-tertiary)' }}>{weekday}</span>
        <span className="mono" style={{ width: 70 }}>{monthDay}</span>
        <span className="mono" style={{ flex: 1, fontWeight: 500 }}>{priceText}</span>
        {isBlocked ? (
          <>
            <span className="chip sm warn">{cell?.block_reason ? BLOCK_REASON_LABEL[cell.block_reason as BlockReason] || cell.block_reason : 'Blocked'}</span>
            {cell?.block_notes && (
              <span style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--color-text-tertiary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {cell.block_notes}
              </span>
            )}
            <button className="btn ghost sm" onClick={handleUnblock} disabled={busy} style={{ color: 'var(--color-text-danger)' }}>
              {busy ? '…' : 'Unblock'}
            </button>
          </>
        ) : (
          <>
            {cell?.available === false && <span className="chip sm">Unavailable</span>}
            <button className="btn ghost sm" onClick={() => setExpanded((v) => !v)} disabled={busy}>
              {expanded ? 'Cancel' : 'Block'}
            </button>
          </>
        )}
      </div>
      {expanded && !isBlocked && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, paddingLeft: 38 }}>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as BlockReason)}
            disabled={busy}
            style={{ padding: 4, fontSize: 11, borderRadius: 4, border: '0.5px solid var(--color-border-tertiary)' }}
          >
            {(['owner_stay', 'maintenance', 'private_use', 'channel_block', 'other'] as BlockReason[]).map((r) => (
              <option key={r} value={r}>{BLOCK_REASON_LABEL[r]}</option>
            ))}
          </select>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            disabled={busy}
            style={{ flex: 1, padding: 4, fontSize: 11, borderRadius: 4, border: '0.5px solid var(--color-border-tertiary)' }}
          />
          <button className="btn primary sm" onClick={handleBlock} disabled={busy}>
            {busy ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      )}
    </div>
  );
}

function TxRow({ desc, amount, date }: { desc: string; amount: string; date: string }) {
  const isPositive = amount.startsWith('+');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, padding: '6px 0', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
      <span style={{ flex: 1 }}>{desc}</span>
      <span className="mono" style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>{date}</span>
      <span className="mono" style={{ width: 110, textAlign: 'right', color: isPositive ? 'var(--color-text-success)' : 'var(--color-text-primary)' }}>{amount}</span>
    </div>
  );
}

// ───────────────── Tab: Listings ─────────────────

function ListingsTab({ property }: { property: Property }) {
  const [, setRev] = useState(0);
  const bump = () => setRev((n) => n + 1);
  const [pushing, setPushing] = useState<{ channel: ListingChannel; isCreateNew: boolean } | null>(null);

  const allChannels: ListingChannel[] = ['airbnb', 'booking', 'vrbo', 'friday_mu'];
  const connectedChannels = new Set(property.listings.map((l) => l.channel));
  const unconnected = allChannels.filter((c) => !connectedChannels.has(c));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Section title="Base description">
        <DescriptionEditor
          value={property.description ?? ''}
          placeholder="A short master description for this property — 2-3 paragraphs · channel descriptions inherit unless overridden."
          onSave={(v) => { setBaseDescription(property.id, v); bump(); fireToast('Description saved'); }}
        />
      </Section>

      <Section title="Per-channel listings">
        <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Phase 2 write-through to Guesty · push button simulates the API call.
        </p>
        {property.listings.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No active listings yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {property.listings.map((l) => (
              <div key={l.channel + l.externalId} className="card" style={{ padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <strong style={{ fontSize: 13 }}>{LISTING_CHANNEL_LABEL[l.channel]}</strong>
                  <span className={`chip sm ${l.status === 'active' ? 'info' : l.status === 'paused' ? 'warn' : ''}`}>{l.status}</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>{l.externalId}</span>
                  {l.commissionPct !== undefined && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>· {l.commissionPct}% commission</span>}
                  <span style={{ flex: 1 }} />
                  <button
                    className="btn ghost sm"
                    onClick={() => setPushing({ channel: l.channel, isCreateNew: false })}
                  >
                    Push update ↑
                  </button>
                </div>
                <DescriptionEditor
                  value={l.description ?? ''}
                  placeholder={`${LISTING_CHANNEL_LABEL[l.channel]}-specific description (leave blank to inherit base description)`}
                  onSave={(v) => { setChannelDescription(property.id, l.channel, v); bump(); fireToast(`${LISTING_CHANNEL_LABEL[l.channel]} description saved`); }}
                />
                {l.lastPushedAt && (
                  <p style={{ margin: '8px 0 0', fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                    Last pushed: {l.lastPushedAt.slice(0, 16).replace('T', ' ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {unconnected.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Not yet listed on:
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {unconnected.map((ch) => (
                <button
                  key={ch}
                  className="btn ghost sm"
                  onClick={() => setPushing({ channel: ch, isCreateNew: true })}
                >
                  + Push to {LISTING_CHANNEL_LABEL[ch]}
                </button>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section title="Base price">
        <p style={{ margin: 0, fontSize: 13 }}>
          {property.baseRateMUR > 0 ? `Rs ${(property.baseRateMUR / 100).toLocaleString()} / night` : 'Not set'}
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Source-of-truth: Guesty pricing rules. Properties surfaces current rate.
        </p>
      </Section>

      <Section title="Guesty Accounting Dimensions">
        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
          Read-from Guesty · Phase 2 surfaces dimension assignments here.
        </p>
      </Section>

      {pushing && (
        <ListingPushFlow
          property={property}
          channel={pushing.channel}
          isCreateNew={pushing.isCreateNew}
          onClose={() => setPushing(null)}
          onSuccess={() => { bump(); }}
        />
      )}
    </div>
  );
}

function DescriptionEditor({
  value, placeholder, onSave,
}: {
  value: string;
  placeholder: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, fontSize: 12, color: value ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)', whiteSpace: 'pre-wrap' }}>
          {value || <em>{placeholder}</em>}
        </div>
        <button className="btn ghost sm" onClick={() => { setDraft(value); setEditing(true); }}>Edit</button>
      </div>
    );
  }

  return (
    <div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={4}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '8px 10px', fontSize: 12,
          border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)',
          background: 'var(--color-background-primary)', color: 'var(--color-text-primary)',
          resize: 'vertical', fontFamily: 'inherit',
        }}
      />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
        <button className="btn ghost sm" onClick={() => setEditing(false)}>Cancel</button>
        <button className="btn primary sm" onClick={() => { onSave(draft); setEditing(false); }}>Save</button>
      </div>
    </div>
  );
}

// ───────────────── Tab: Reservations ─────────────────

function ReservationsTab({ property }: { property: Property }) {
  const { reservations: liveReservations } = useLiveReservations();
  const sourceReservations = liveReservations ?? (liveOnlyMode() ? [] : RESERVATIONS);
  const reservations = useMemo(
    () => sourceReservations.filter((r) => r.propertyCode === property.code).slice(0, 20),
    [property.code, sourceReservations],
  );

  if (reservations.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
        No reservations on file for this property.
      </p>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = reservations.filter((r) => r.checkIn.slice(0, 10) >= today);
  const past = reservations.filter((r) => r.checkIn.slice(0, 10) < today);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {upcoming.length > 0 && (
        <Section title={`Upcoming (${upcoming.length})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {upcoming.map((r) => <RsvRow key={r.id} reservation={r} />)}
          </div>
        </Section>
      )}
      {past.length > 0 && (
        <Section title={`Past (${past.length})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {past.map((r) => <RsvRow key={r.id} reservation={r} />)}
          </div>
        </Section>
      )}
    </div>
  );
}

function RsvRow({ reservation }: { reservation: Reservation }) {
  return (
    <button
      onClick={() => { window.location.href = `/fad?m=reservations&sub=overview&rsv=${reservation.id}`; }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
        background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left', width: '100%', color: 'var(--color-text-primary)',
      }}
    >
      <span className="mono" style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{reservation.checkIn.slice(5)}</span>
      <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>→ {reservation.checkOut.slice(5)}</span>
      <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{reservation.guestName}</span>
      <span className="chip sm">{reservation.channel}</span>
      <span className={`chip sm ${reservation.status === 'confirmed' ? 'info' : reservation.status === 'cancelled' ? 'warn' : ''}`}>{reservation.status}</span>
    </button>
  );
}

// ───────────────── Tab: Activity ─────────────────

function ActivityTab({ property }: { property: Property }) {
  const events = useMemo(() => activityForProperty(property.id), [property.id]);
  if (events.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No activity recorded.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {events.map((e) => (
        <div key={e.id} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 90, flexShrink: 0 }}>{e.ts.slice(0, 10)}</span>
          <span className="chip sm" style={{ flexShrink: 0 }}>{e.kind.replace(/_/g, ' ')}</span>
          <span style={{ fontSize: 12 }}>{e.detail}</span>
        </div>
      ))}
    </div>
  );
}

// ───────────────── Helpers ─────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-tertiary)' }}>{title}</h4>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{children}</div>
  );
}

// ───────────────── Translations editor (mig 088 / FR rollout) ─────────────────
//
// Side-by-side EN / FR inputs for name + description. Saves via
// PATCH /api/properties/:id/translations. Top-level name + description
// from Guesty are shown as placeholders so the team knows what FR will
// fall back to when blank.
//
// Per the website session brief: humans author FR. No LLM auto-translate.
// Empty FR is a "needs human" queue, not a TODO for AI.
function TranslationsEditor({ property }: { property: Property }) {
  const incoming = property.translations || {};
  const [enName, setEnName] = useState<string>(incoming.en?.name ?? '');
  const [enDesc, setEnDesc] = useState<string>(incoming.en?.description ?? '');
  const [frName, setFrName] = useState<string>(incoming.fr?.name ?? '');
  const [frDesc, setFrDesc] = useState<string>(incoming.fr?.description ?? '');
  const [saving, setSaving] = useState(false);

  // Re-sync local state when the underlying property prop changes
  // (e.g. after a refetch).
  useEffect(() => {
    setEnName(incoming.en?.name ?? '');
    setEnDesc(incoming.en?.description ?? '');
    setFrName(incoming.fr?.name ?? '');
    setFrDesc(incoming.fr?.description ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.id, incoming.en?.name, incoming.en?.description, incoming.fr?.name, incoming.fr?.description]);

  const dirty =
    enName !== (incoming.en?.name ?? '') ||
    enDesc !== (incoming.en?.description ?? '') ||
    frName !== (incoming.fr?.name ?? '') ||
    frDesc !== (incoming.fr?.description ?? '');

  const save = async () => {
    setSaving(true);
    try {
      const payload: PropertyTranslations = {
        en: { name: enName.trim() || null, description: enDesc.trim() || null },
        fr: { name: frName.trim() || null, description: frDesc.trim() || null },
      };
      const id = property.id;
      await updatePropertyTranslations(id, payload);
      fireToast('Translations saved');
    } catch (err) {
      fireToast(err instanceof Error ? `Failed: ${err.message}` : 'Failed to save translations');
    } finally {
      setSaving(false);
    }
  };

  const guestyName = property.name; // top-level (Guesty-sourced) display name
  const guestyDesc = ''; // FAD frontend doesn't expose Guesty description directly

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
        Authored EN/FR copy the public website renders. Leave a field blank to fall back to the
        Guesty-sourced top-level name/description. No machine translation — humans author both
        sides so guests get our voice, not a translator's.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <Label>Name · EN</Label>
          <input
            type="text"
            value={enName}
            onChange={(e) => setEnName(e.target.value)}
            placeholder={guestyName ? `(Guesty: ${guestyName})` : 'e.g. Beachfront Apt with Pool'}
            maxLength={200}
            style={{
              width: '100%',
              marginTop: 4,
              padding: '8px 10px',
              fontSize: 13,
              background: 'var(--color-background-primary)',
              color: 'var(--color-text-primary)',
              border: '0.5px solid var(--color-border-secondary)',
              borderRadius: 'var(--radius-sm)',
            }}
          />
        </div>
        <div>
          <Label>Nom · FR</Label>
          <input
            type="text"
            value={frName}
            onChange={(e) => setFrName(e.target.value)}
            placeholder="(non traduit — laisse vide pour utiliser l'EN)"
            maxLength={200}
            style={{
              width: '100%',
              marginTop: 4,
              padding: '8px 10px',
              fontSize: 13,
              background: 'var(--color-background-primary)',
              color: 'var(--color-text-primary)',
              border: '0.5px solid var(--color-border-secondary)',
              borderRadius: 'var(--radius-sm)',
            }}
          />
        </div>

        <div>
          <Label>Description · EN</Label>
          <textarea
            value={enDesc}
            onChange={(e) => setEnDesc(e.target.value)}
            placeholder={guestyDesc || 'Long-form description shown on the public listing page'}
            maxLength={4000}
            rows={6}
            style={{
              width: '100%',
              marginTop: 4,
              padding: '8px 10px',
              fontSize: 13,
              background: 'var(--color-background-primary)',
              color: 'var(--color-text-primary)',
              border: '0.5px solid var(--color-border-secondary)',
              borderRadius: 'var(--radius-sm)',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
        </div>
        <div>
          <Label>Description · FR</Label>
          <textarea
            value={frDesc}
            onChange={(e) => setFrDesc(e.target.value)}
            placeholder="(non traduit — laisse vide pour utiliser l'EN)"
            maxLength={4000}
            rows={6}
            style={{
              width: '100%',
              marginTop: 4,
              padding: '8px 10px',
              fontSize: 13,
              background: 'var(--color-background-primary)',
              color: 'var(--color-text-primary)',
              border: '0.5px solid var(--color-border-secondary)',
              borderRadius: 'var(--radius-sm)',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {dirty && (
          <span style={{ alignSelf: 'center', fontSize: 11, color: 'var(--color-text-warning)' }}>
            Unsaved changes
          </span>
        )}
        <button
          type="button"
          className="btn primary sm"
          onClick={save}
          disabled={!dirty || saving}
          style={{ opacity: !dirty || saving ? 0.6 : 1 }}
        >
          {saving ? 'Saving…' : 'Save translations'}
        </button>
      </div>
    </div>
  );
}
