'use client';

// FAD V2 — Properties module (THE SPINE) · SPEC-Remaining-Modules.md §6.
//
// Pattern-setter for all V2 module migrations. Built as a NEW parallel view over
// the SAME data the legacy PropertiesModule uses — it does NOT touch any legacy
// file. Rendered through GmShell (V2 `.dwrap` skin + header + tabs), exactly like
// AgencyModule.tsx (the reference V2 module).
//
// Spine concept: a Property record converges Guesty (commercial truth) + Breezeway
// (ops/condition truth) + FAD-native data + modeled forecasts + Finance + Reviews +
// guest history + per-module Ask Friday context. Every field declares provenance via
// <SourceTag>/<Field>. This is the canonical detail record other modules link into.
//
// Data: 100% reused from the legacy stack —
//   • useHydratePropertiesFromGuesty() → live PROPERTIES (Guesty cache + FAD overlay)
//   • PROPERTY_BY_CODE / lifecycleBadge / checklistProgress / getContract / portfolioInsights
//   • usePropertyCards()         → Condition/Ops (Breezeway-sourced + FAD cards)
//   • usePropertySummary()       → Finance (revenue/expenses/payout + data_quality source hints)
//   • RESERVATIONS (by code)     → Guests history
//   • contractFor('properties')  → Ask Friday contract (staff_private surface)
// No new business fixtures are introduced (the demo SourceTag freshness strings below
// are presentational only; see notes in DEMO_CRUFT.md PROD-PROPV2-1 if extended).
//
// ── FIELD PRIVACY (Ishant sign-off gate) ──────────────────────────────────────
// Per-field provenance respects privacy classes. Access codes / wifi / lockbox /
// gate codes are RESTRICTED / guest_scoped and are NEVER rendered as public here.
// The Condition/Ops tab masks every Property Card whose category === 'access'
// (and any card NOT surfaced 'guest_facing' is treated as staff-only). The "Ask
// Friday" tab is staff_private. NOTHING on this screen is a public surface. Any
// field whose PUBLIC exposure is ever desired must get Ishant's explicit sign-off
// FIRST — see the FLAGGED note on the access mask below. When unsure → staff-only.

import { useMemo, useState } from 'react';
import { GmShell, type GmTab } from '../../gm/kit';
import { DI } from '../../gm/icons';
import { SourceTag, Field } from '../../ai/SourceTag';
import { AITrustStrip } from '../../ai/TrustStates';
import { DataState, PermissionState, type DataStatus } from '../../v2/States';
import {
  PROPERTY_BY_CODE,
  LISTING_CHANNEL_LABEL,
  lifecycleBadge,
  checklistProgress,
  getContract,
  portfolioInsights,
  listingRecommendations,
  type Property,
  type LifecycleStatus,
} from '../../../_data/properties';
import { useHydratePropertiesFromGuesty } from '../../../_data/propertiesClient';
import { usePropertyCards } from '../../../_data/propertiesClient';
import { usePropertySummary, formatMinor } from '../../../_data/financeClient';
import { PROPERTIES } from '../../../_data/properties';
import { COHORT_LABEL, type Cohort } from '../../../_data/reviews';
import { FIN_OWNERS } from '../../../_data/finance';
import { RESERVATIONS } from '../../../_data/reservations';
import { contractFor } from '../../../_data/askFridayContracts';

interface Props {
  subPage?: string;
  onChangeSubPage?: (s: string) => void;
}

// ── helpers ──
const pct = (n: number) => (n > 0 ? `${Math.round(n * 100)}%` : '—');
const euro = (n: number) => (n > 0 ? `€${n.toLocaleString('en-US')}` : '—');
const ownerName = (p: Property) =>
  p.primaryOwnerName ?? FIN_OWNERS.find((o) => o.id === p.primaryOwnerId)?.name ?? p.primaryOwnerId;
const layout = (p: Property) => {
  const beds = p.bedrooms === 0 ? 'Studio' : `${p.bedrooms} bd`;
  const baths = typeof p.bathrooms === 'number' ? `${p.bathrooms} ba` : '— ba';
  return `${beds} · ${baths} · ${p.maxOccupancy} pax`;
};
const lifecycleBadgeClass = (tone: string) =>
  tone === 'success' ? 'green dot' : tone === 'warning' ? 'amber dot' : tone === 'info' ? 'indigo dot' : 'gray';

// Detail tabs — the spine (SPEC §6 order).
type DetailTab = 'overview' | 'commercial' | 'condition' | 'finance' | 'reviews' | 'guests' | 'documents' | 'ask';
const DETAIL_TABS: Array<[DetailTab, string]> = [
  ['overview', 'Overview'],
  ['commercial', 'Commercial'],
  ['condition', 'Condition / Ops'],
  ['finance', 'Finance'],
  ['reviews', 'Reviews'],
  ['guests', 'Guests'],
  ['documents', 'Documents'],
  ['ask', 'Ask Friday'],
];

export function PropertiesModuleV2({ subPage, onChangeSubPage }: Props) {
  // Live hydration — same hook the legacy module uses. PROPERTIES mutates in
  // place; `rev` re-triggers this component so the list re-reads fresh data.
  const { loading, error, rev, refetch } = useHydratePropertiesFromGuesty();
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((c) => (c === m ? null : c)), 2200);
  };

  // Module-level tabs mirror the legacy list/overview split, but the V2 spine
  // collapses to a single "All properties" spine list (Overview KPIs sit atop it).
  const sub = subPage || 'overview';
  const tabDefs: Array<[string, string]> = [
    ['overview', 'Overview'],
    ['all', 'All properties'],
    ['onboarding', 'Onboarding'],
    ['insights', 'Insights'],
  ];
  const tabs: GmTab[] = tabDefs.map(([k, l]) => ({
    l,
    on: sub === k,
    onClick: () => onChangeSubPage?.(k),
  }));

  const open = openCode ? PROPERTY_BY_CODE[openCode] : null;

  // Module data status for the spine list.
  const status: DataStatus = error
    ? 'error'
    : loading
      ? 'loading'
      : PROPERTIES.length === 0
        ? 'empty'
        : 'ready';

  return (
    <GmShell
      eyebrow={<><DI n="home" s={1.6} style={{ color: 'var(--indigo-bright)' }} /> PROPERTIES · THE SPINE</>}
      title="Properties"
      sub="Unification layer · Guesty (commercial) × Breezeway (operational) · canonical record everything property-anchored links into"
      tabs={tabs}
      actions={
        <>
          <button className="dbtn ghost" onClick={() => { refetch(); flash('Re-syncing from Guesty…'); }}>
            <DI n="clock" s={1.8} /> Sync
          </button>
          <button className="dbtn primary" onClick={() => flash('New property — onboarding wizard (Phase 2)')}>
            <DI n="plus" s={2} /> New property
          </button>
        </>
      }
    >
      {/* rev is read so the component re-renders after in-place hydration. */}
      <span hidden aria-hidden data-rev={rev} />

      {open ? (
        <PropertyDetailSpine property={open} onBack={() => setOpenCode(null)} flash={flash} />
      ) : sub === 'overview' ? (
        <OverviewView status={status} onOpen={setOpenCode} onRetry={refetch} go={onChangeSubPage} />
      ) : sub === 'insights' ? (
        <InsightsView status={status} onOpen={setOpenCode} onRetry={refetch} />
      ) : (
        <SpineList
          status={status}
          scope={sub === 'onboarding' ? 'onboarding' : 'all'}
          onOpen={setOpenCode}
          onRetry={refetch}
        />
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: 'var(--card-2)', border: '1px solid var(--line-3)', color: 'var(--tx)', borderRadius: 9, padding: '9px 14px', fontSize: 12.5, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
          {toast}
        </div>
      )}
    </GmShell>
  );
}

// ───────────────────────── Overview (KPIs + Friday + spine list) ─────────────────────────

function OverviewView({ status, onOpen, onRetry, go }: {
  status: DataStatus;
  onOpen: (code: string) => void;
  onRetry: () => void;
  go?: (s: string) => void;
}) {
  const live = PROPERTIES.filter((p) => p.lifecycleStatus === 'live').length;
  const onboarding = PROPERTIES.filter((p) => p.lifecycleStatus === 'onboarding').length;
  const paused = PROPERTIES.filter((p) => p.lifecycleStatus === 'paused').length;
  const insights = useMemo(() => portfolioInsights(), [status]);
  const highInsights = insights.filter((i) => i.severity === 'high').length;

  return (
    <>
      <div className="grid4">
        <div className="statc"><div className="n">{PROPERTIES.length}</div><div className="l">Properties</div></div>
        <div className="statc green"><div className="n">{live}</div><div className="l">Live</div></div>
        <div className="statc amber"><div className="n">{onboarding}</div><div className="l">Onboarding</div></div>
        <div className="statc"><div className="n">{paused}</div><div className="l">Paused</div></div>
      </div>

      <div className="fai" style={{ marginTop: 14 }}>
        <div className="fh"><span className="bdg indigo"><DI n="spark" s={1.6} /> Friday</span><span className="srctag friday" style={{ marginLeft: 6 }}><span className="srctag-dot" />FAD</span></div>
        <p>
          {PROPERTIES.length} properties across the portfolio. {highInsights > 0
            ? <><b>{highInsights} need attention</b> — see Insights.</>
            : <>No high-severity portfolio flags right now.</>} Each property record unifies Guesty commercial truth with Breezeway condition + Finance, Reviews and guest history.
        </p>
        <div className="acts">
          <button className="dbtn primary sm" onClick={() => go?.('insights')}><DI n="chart" s={1.8} /> Review insights</button>
          <button className="dbtn ghost sm" onClick={() => go?.('all')}>All properties</button>
        </div>
      </div>

      <div className="dml" style={{ marginTop: 16 }}>All properties <span className="rule" /></div>
      <PropertyTable status={status} rows={PROPERTIES.slice(0, 8)} onOpen={onOpen} onRetry={onRetry} />
      {status === 'ready' && PROPERTIES.length > 8 && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
          <button className="dbtn ghost sm" onClick={() => go?.('all')}>View all {PROPERTIES.length} →</button>
        </div>
      )}
    </>
  );
}

// ───────────────────────── Spine list (All / Onboarding) ─────────────────────────

type SortKey = 'code' | 'lifecycle' | 'region' | 'occ' | 'adr';

function SpineList({ status, scope, onOpen, onRetry }: {
  status: DataStatus;
  scope: 'all' | 'onboarding';
  onOpen: (code: string) => void;
  onRetry: () => void;
}) {
  const [search, setSearch] = useState('');
  const [lifecycle, setLifecycle] = useState<'all' | LifecycleStatus>('all');
  const [region, setRegion] = useState<'all' | Cohort>('all');

  const rows = useMemo(() => {
    let r: Property[] = PROPERTIES.slice();
    if (scope === 'onboarding') {
      r = r.filter((p) => p.lifecycleStatus === 'onboarding');
    } else {
      r = r.filter((p) => p.lifecycleStatus !== 'off_boarded');
      if (lifecycle !== 'all') r = r.filter((p) => p.lifecycleStatus === lifecycle);
    }
    if (region !== 'all') r = r.filter((p) => p.region === region);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.area.toLowerCase().includes(q));
    }
    return r;
  }, [scope, lifecycle, region, search, status]);

  const filteredStatus: DataStatus = status === 'ready' && rows.length === 0 ? 'empty' : status;

  return (
    <>
      <div className="row between" style={{ margin: '2px 0 10px', gap: 8, flexWrap: 'wrap' }}>
        <span className="vseg" style={{ flexWrap: 'wrap' }}>
          {scope === 'all' && ([['all', 'All active'], ['live', 'Live'], ['onboarding', 'Onboarding'], ['paused', 'Paused']] as Array<[string, string]>).map(([k, l]) => (
            <span key={k} className={'vs' + (lifecycle === (k as LifecycleStatus | 'all') ? ' on' : '')} onClick={() => setLifecycle(k as LifecycleStatus | 'all')}>{l}</span>
          ))}
        </span>
        <span className="row" style={{ gap: 8, flexWrap: 'wrap', minWidth: 0, flex: 1, justifyContent: 'flex-end' }}>
          <input
            placeholder="Search code, name, area…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, flex: '1 1 160px', minWidth: 120 }}
          />
          <select value={region} onChange={(e) => setRegion(e.target.value as 'all' | Cohort)} style={{ ...inputStyle, flex: '0 1 auto', maxWidth: '100%' }}>
            <option value="all">All regions</option>
            {Object.entries(COHORT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <span className="faint mono" style={{ fontSize: 10 }}>{rows.length} {rows.length === 1 ? 'property' : 'properties'}</span>
        </span>
      </div>
      <PropertyTable status={filteredStatus} rows={rows} onOpen={onOpen} onRetry={onRetry} scope={scope} />
    </>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', fontSize: 12, borderRadius: 7,
  border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--tx)',
};

// Shared spine table — Guesty-sourced columns carry <SourceTag kind="guesty">.
function PropertyTable({ status, rows, onOpen, onRetry, scope = 'all' }: {
  status: DataStatus;
  rows: Property[];
  onOpen: (code: string) => void;
  onRetry: () => void;
  scope?: 'all' | 'onboarding';
}) {
  return (
    <div className="panel" style={{ padding: '10px 6px' }}>
      <DataState
        status={status}
        rows={6}
        surface="property portfolio"
        onRetry={onRetry}
        empty={{
          title: scope === 'onboarding' ? 'No properties onboarding' : 'No properties match',
          hint: scope === 'onboarding'
            ? 'Properties in the onboarding lifecycle will appear here.'
            : 'Adjust the filters above, or add your first property.',
          icon: <DI n="home" s={2.2} />,
        }}
      >
        <div className="prop-v2-scroll" style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Property</th>
                <th>Status</th>
                <th>Region</th>
                <th>Layout <SourceTag kind="guesty" /></th>
                <th>Owner</th>
                <th>Channels <SourceTag kind="guesty" /></th>
                <th style={{ textAlign: 'right' }}>Occ 90d</th>
                <th style={{ textAlign: 'right' }}>ADR</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const badge = lifecycleBadge(p);
                const channels = p.listings.map((l) => l.channel).map((c) => LISTING_CHANNEL_LABEL[c] ?? c);
                return (
                  <tr key={p.code} className="tdrow" onClick={() => onOpen(p.code)}>
                    <td>
                      <span className="row" style={{ gap: 8 }}>
                        <span className="pcodeD">{p.code}</span>
                        <span className="tt" style={{ maxWidth: 210, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                        {p.isCombo && <span className="bdg gray">combo</span>}
                        {p.parentPropertyId && <span className="bdg gray">unit</span>}
                      </span>
                    </td>
                    <td><span className={'bdg ' + lifecycleBadgeClass(badge.tone)}>{badge.label}</span></td>
                    <td className="faint">{COHORT_LABEL[p.region]}</td>
                    <td className="faint">{layout(p)}</td>
                    <td className="faint">{ownerName(p)}</td>
                    <td className="faint" style={{ fontSize: 11 }}>{channels.length ? channels.join(' · ') : '—'}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{pct(p.occupancy90d)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{euro(p.adr)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DataState>
    </div>
  );
}

// ───────────────────────── Insights ─────────────────────────

function InsightsView({ status, onOpen, onRetry }: {
  status: DataStatus;
  onOpen: (code: string) => void;
  onRetry: () => void;
}) {
  const insights = useMemo(() => portfolioInsights(), [status]);
  const tone: Record<string, string> = { high: 'red', medium: 'amber', low: 'gray' };
  const listStatus: DataStatus = status === 'ready' && insights.length === 0 ? 'empty' : status;

  return (
    <>
      <div className="fai" style={{ marginTop: 6 }}>
        <div className="fh"><span className="bdg indigo"><DI n="spark" s={1.6} /> Friday · portfolio insights</span><span className="srctag modeled" style={{ marginLeft: 6 }}><span className="srctag-dot" />modeled</span></div>
        <p>Cross-property patterns derived from occupancy, channel coverage, photos, descriptions and onboarding state. These are modeled signals — confirm before acting.</p>
      </div>
      <div className="panel" style={{ marginTop: 14, padding: '2px 14px' }}>
        <DataState
          status={listStatus}
          rows={4}
          surface="portfolio insights"
          onRetry={onRetry}
          empty={{ title: 'No portfolio flags', hint: 'Nothing needs attention across the portfolio right now.', icon: <DI n="check" s={2.2} /> }}
        >
          {insights.map((ins) => (
            <div key={ins.id} className="synalert" style={{ cursor: ins.propertyCodes[0] ? 'pointer' : 'default' }} onClick={() => ins.propertyCodes[0] && onOpen(ins.propertyCodes[0])}>
              <span className={'bdg ' + (tone[ins.severity] || 'gray')} style={{ flex: '0 0 auto' }}>{ins.severity}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{ins.title}</div>
                <div className="faint" style={{ fontSize: 11, marginTop: 2, lineHeight: 1.45 }}>{ins.message}</div>
                <div className="row" style={{ gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                  {ins.propertyCodes.slice(0, 6).map((c) => <span key={c} className="pcodeD">{c}</span>)}
                  {ins.propertyCodes.length > 6 && <span className="faint mono" style={{ fontSize: 10 }}>+{ins.propertyCodes.length - 6}</span>}
                </div>
              </div>
              {ins.actionLabel && <span className="faint" style={{ fontSize: 11, flex: '0 0 auto' }}>{ins.actionLabel} →</span>}
            </div>
          ))}
        </DataState>
      </div>
    </>
  );
}

// ───────────────────────── Detail spine (8 tabs) ─────────────────────────

function PropertyDetailSpine({ property, onBack, flash }: {
  property: Property;
  onBack: () => void;
  flash: (m: string) => void;
}) {
  const [tab, setTab] = useState<DetailTab>('overview');
  const badge = lifecycleBadge(property);

  return (
    <>
      {/* Detail header — back + identity + lifecycle */}
      <div className="row between" style={{ marginBottom: 12 }}>
        <button className="dbtn ghost sm" onClick={onBack}><DI n="chevL" s={2} /> Back to portfolio</button>
        <span className="faint mono" style={{ fontSize: 10 }}>Last activity · {property.lastActivityAt || '—'}</span>
      </div>
      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="row between" style={{ alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 9, flexWrap: 'wrap' }}>
              <span className="pcodeD">{property.code}</span>
              <span style={{ fontSize: 17, fontWeight: 600 }}>{property.name}</span>
              <span className={'bdg ' + lifecycleBadgeClass(badge.tone)}>{badge.label}</span>
              {property.isCombo && <span className="bdg gray">combo · {property.componentPropertyIds?.length ?? 0}</span>}
              {property.isSyndicManaged && <span className="bdg violet">Friday-as-syndic</span>}
            </div>
            <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>
              {property.address} · {COHORT_LABEL[property.region]} · {ownerName(property)}
            </div>
          </div>
          <span className="srctag guesty" title="Listing facts from Guesty"><span className="srctag-dot" />Guesty</span>
        </div>
      </div>

      {/* Spine tabs */}
      <div className="vseg" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        {DETAIL_TABS.map(([k, l]) => (
          <span key={k} className={'vs' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</span>
        ))}
      </div>

      {tab === 'overview' && <TabOverview property={property} go={setTab} flash={flash} />}
      {tab === 'commercial' && <TabCommercial property={property} flash={flash} />}
      {tab === 'condition' && <TabCondition property={property} flash={flash} />}
      {tab === 'finance' && <TabFinance property={property} />}
      {tab === 'reviews' && <TabReviews property={property} />}
      {tab === 'guests' && <TabGuests property={property} onOpen={() => flash('Opens in Reservations')} />}
      {tab === 'documents' && <TabDocuments property={property} flash={flash} />}
      {tab === 'ask' && <TabAskFriday property={property} flash={flash} />}
    </>
  );
}

// ── Overview tab — converged summary + Friday recs ──
function TabOverview({ property, go, flash }: { property: Property; go: (t: DetailTab) => void; flash: (m: string) => void }) {
  const { done, total, pct: cl } = checklistProgress(property);
  const recs = listingRecommendations(property);
  return (
    <>
      <div className="grid4">
        <div className="statc"><div className="n">{pct(property.occupancy90d)}</div><div className="l">Occ 90d</div></div>
        <div className="statc"><div className="n">{euro(property.adr)}</div><div className="l">ADR</div></div>
        <div className="statc"><div className="n">{property.rating > 0 ? property.rating.toFixed(2) : '—'}</div><div className="l">Rating</div></div>
        <div className="statc"><div className="n">{property.bedrooms === 0 ? 'Studio' : property.bedrooms}</div><div className="l">Bedrooms</div></div>
      </div>

      <div className="dml" style={{ marginTop: 16 }}>Where this property's truth lives <span className="rule" /></div>
      <div className="grid2">
        <div className="panel"><Field label="Commercial (listing, pricing, channels)" value="Guesty" source="guesty" syncedAt="12m ago" /></div>
        <div className="panel"><Field label="Condition / ops (tasks, access, evidence)" value="Breezeway" source="breezeway" syncedAt="34m ago" /></div>
        <div className="panel"><Field label="Onboarding, cards, contract, tags" value="FAD-native" source="friday" /></div>
        <div className="panel"><Field label="Occupancy / ADR forecast" value="Modeled" source="modeled" confidence={68} /></div>
      </div>

      {property.lifecycleStatus !== 'live' || done < total ? (
        <>
          <div className="dml" style={{ marginTop: 16 }}>Onboarding <span className="rule" /></div>
          <div className="panel">
            <div className="row between">
              <span style={{ fontSize: 13 }}>Checklist <span className="faint mono" style={{ fontSize: 11 }}>{done} / {total}</span></span>
              <span className="srctag friday"><span className="srctag-dot" />FAD</span>
            </div>
            <div className="lq-conf" style={{ marginTop: 8 }}><i style={{ width: cl + '%', background: cl >= 80 ? 'var(--green)' : 'var(--amber)' }} /></div>
            <button className="dbtn ghost sm" style={{ marginTop: 10 }} onClick={() => go('documents')}>View documents & artifacts →</button>
          </div>
        </>
      ) : null}

      {recs.length > 0 && (
        <>
          <div className="dml" style={{ marginTop: 16 }}>Friday suggestions <span className="rule" /></div>
          <div className="fai">
            <div className="fh"><span className="bdg indigo"><DI n="spark" s={1.6} /> Friday</span></div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {recs.slice(0, 4).map((r) => <span key={r.id} className={'synflag ' + (r.severity === 'high' ? 'amber' : 'green')}>{r.actionLabel ?? r.message}</span>)}
            </div>
            <div className="acts">
              <button className="dbtn ghost sm" onClick={() => flash('Channel push flow (Phase 2)')}>Review listing health</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ── Commercial tab — Guesty commercial truth ──
function TabCommercial({ property, flash }: { property: Property; flash: (m: string) => void }) {
  const c = getContract(property);
  return (
    <>
      <div className="dml">Listing <span className="srctag guesty" style={{ marginLeft: 8 }}><span className="srctag-dot" />Guesty</span><span className="rule" /></div>
      <div className="panel grid2">
        <Field label="Listing type" value={property.listingType} source="guesty" syncedAt="12m ago" />
        <Field label="Layout" value={layout(property)} source="guesty" syncedAt="12m ago" />
        <Field label="Base rate / night" value={property.baseRateMUR > 0 ? `Rs ${property.baseRateMUR.toLocaleString('en-US')}` : '—'} source="guesty" syncedAt="12m ago" />
        <Field label="Area" value={property.area} source="guesty" />
        <Field label="Occupancy 90d" value={pct(property.occupancy90d)} source="modeled" confidence={68} />
        <Field label="ADR" value={euro(property.adr)} source="modeled" confidence={62} />
      </div>

      <div className="dml" style={{ marginTop: 16 }}>Channels <span className="rule" /></div>
      <div className="panel" style={{ padding: '10px 6px' }}>
        <table className="tbl">
          <thead><tr><th>Channel</th><th>Status</th><th>External ID</th><th>Source</th></tr></thead>
          <tbody>
            {property.listings.map((l, i) => (
              <tr key={i} className="tdrow" onClick={() => flash(`Open ${LISTING_CHANNEL_LABEL[l.channel] ?? l.channel} listing`)}>
                <td className="tt">{LISTING_CHANNEL_LABEL[l.channel] ?? l.channel}</td>
                <td><span className={'bdg ' + (l.status === 'active' ? 'green dot' : l.status === 'pending' ? 'amber dot' : 'gray')}>{l.status}</span></td>
                <td className="mono faint" style={{ fontSize: 11 }}>{l.externalId}</td>
                <td><SourceTag kind="guesty" /></td>
              </tr>
            ))}
            {property.listings.length === 0 && <tr><td colSpan={4} className="faint" style={{ textAlign: 'center', padding: 16 }}>No channels connected.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="dml" style={{ marginTop: 16 }}>Contract <span className="srctag friday" style={{ marginLeft: 8 }}><span className="srctag-dot" />FAD</span><span className="rule" /></div>
      <div className="panel grid2">
        <Field label="Status" value={c.status} source="friday" />
        <Field label="Commission" value={`${c.commissionPct}%`} source="friday" />
        <Field label="Payment day" value={c.paymentDay ? `Day ${c.paymentDay}` : '—'} source="friday" />
        <Field label="Renewal" value={'endsAt' in c ? (c.endsAt ?? '—') : '—'} source="friday" />
      </div>
      <div className="gate" style={{ borderStyle: 'solid', marginTop: 12 }}>
        <span style={{ color: 'var(--indigo-bright)' }}><DI n="shield" s={1.7} /></span>
        <span>Listing &amp; pricing fields are <b>read-from Guesty</b> in Phase 1 — edits sync back to Guesty when write-through ships (Phase 2). Contract terms are FAD-owned.</span>
      </div>
    </>
  );
}

// ── Condition / Ops tab — Breezeway truth + Property Cards (PRIVACY-MASKED) ──
function TabCondition({ property, flash }: { property: Property; flash: (m: string) => void }) {
  const { cards, loading, error, refetch } = usePropertyCards(property.id);

  // ── FIELD PRIVACY GATE (Ishant sign-off required to ever relax) ──────────────
  // Access codes / wifi / lockbox / gate codes are restricted/guest_scoped. We
  // NEVER render their bodies on this staff cockpit as if public, and we never
  // expose them on any public surface. Policy applied here:
  //   • credential cards (access, wifi_tech) → body MASKED ("· restricted ·")
  //   • surface !== 'guest_facing' card        → treated staff-only (badge "Internal")
  // Per Ishant (2026-05-30): hard-mask ALL credentials — access codes, lockbox/gate
  // codes AND wifi/router/gate credentials — not just 'access'. To EXPOSE any
  // credential publicly (e.g. a guest-portal pre-arrival reveal) requires Ishant's
  // explicit sign-off FIRST. Until then: masked everywhere on this cockpit. (Future
  // modules with credential cards should reuse this predicate — extract to a shared
  // helper when the second consumer lands.)
  const CREDENTIAL_CATEGORIES = new Set(['access', 'wifi_tech']);
  const isRestricted = (cat: string) => CREDENTIAL_CATEGORIES.has(cat);

  const status: DataStatus = error ? 'error' : loading ? 'loading' : cards.length === 0 ? 'empty' : 'ready';

  return (
    <>
      <div className="dml">Property Cards <span className="srctag breezeway" style={{ marginLeft: 8 }}><span className="srctag-dot" />Breezeway</span><span className="srctag friday" style={{ marginLeft: 6 }}><span className="srctag-dot" />FAD</span><span className="rule" /></div>
      <div className="gate" style={{ borderStyle: 'solid', marginBottom: 10 }}>
        <DI n="shield" s={1.7} style={{ color: 'var(--amber)', flex: '0 0 auto' }} />
        <span><b>Access, wifi &amp; lockbox details are restricted.</b> Bodies are masked here and never exposed publicly. Public reveal requires Ishant sign-off.</span>
      </div>
      <div className="panel" style={{ padding: '10px 6px' }}>
        <DataState
          status={status}
          rows={4}
          surface="property cards"
          onRetry={refetch}
          empty={{ title: 'No Property Cards yet', hint: 'Cards capture access, wifi, quirks and local context for Ask Friday. Add one to bootstrap AI knowledge.', icon: <DI n="doc" s={2.2} /> }}
        >
          <table className="tbl">
            <thead><tr><th>Card</th><th>Category</th><th>Visibility</th><th>Source</th></tr></thead>
            <tbody>
              {cards.map((card) => {
                const restricted = isRestricted(card.category);
                // Non-guest-facing → staff-only label; never surface restricted bodies.
                const surf = card.surface === 'guest_facing' ? 'Guest' : card.surface === 'internal_only' ? 'Internal' : 'Both';
                const src = card.source === 'breezeway_imported' ? 'breezeway' : card.source === 'guesty_imported' ? 'guesty' : 'friday';
                return (
                  <tr key={card.id} className="tdrow" onClick={() => flash(restricted ? 'Credentials are staff-restricted (sign-off to reveal)' : `Open card · ${card.title}`)}>
                    <td>
                      <div className="tt">{card.title}</div>
                      <div className="faint" style={{ fontSize: 11, marginTop: 2, maxWidth: 360, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {restricted ? <em>· restricted — staff-only ·</em> : card.body}
                      </div>
                    </td>
                    <td className="faint" style={{ textTransform: 'capitalize' }}>{card.category.replace(/_/g, ' ')}</td>
                    <td><span className={'bdg ' + (restricted ? 'red dot' : surf === 'Guest' ? 'indigo' : 'gray')}>{restricted ? 'Restricted' : surf}</span></td>
                    <td><SourceTag kind={src as 'breezeway' | 'guesty' | 'friday'} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DataState>
      </div>

      <div className="dml" style={{ marginTop: 16 }}>Service defaults <span className="srctag breezeway" style={{ marginLeft: 8 }}><span className="srctag-dot" />Breezeway</span><span className="rule" /></div>
      <div className="panel grid3">
        <Field label="Cleaner" value="— Phase 2 —" source="breezeway" />
        <Field label="Inspector" value="— Phase 2 —" source="breezeway" />
        <Field label="Maintenance" value="— Phase 2 —" source="breezeway" />
      </div>
    </>
  );
}

// ── Finance tab — revenue/expenses/payout, with live data_quality provenance ──
function TabFinance({ property }: { property: Property }) {
  const { summary, loading, error, refetch } = usePropertySummary(property.code, 90);

  if (property.lifecycleStatus === 'onboarding') {
    return (
      <DataState status="empty" empty={{ title: 'No finance data yet', hint: 'Financials appear once the property goes live and starts taking bookings.', icon: <DI n="coin" s={2.2} /> }} />
    );
  }
  const status: DataStatus = error ? 'error' : loading ? 'loading' : !summary ? 'empty' : 'ready';
  // Map backend data_quality source strings → SourceTag kinds.
  const srcKind = (s: string | undefined): 'guesty' | 'friday' | 'modeled' =>
    s === 'guesty' || s === 'guesty_accounting' ? 'guesty' : s === 'modeled' || s === 'estimated' ? 'modeled' : 'friday';

  return (
    <>
      <div className="dml">90-day summary <span className="rule" /></div>
      <div className="panel">
        <DataState
          status={status}
          rows={3}
          surface="property finance"
          onRetry={refetch}
          empty={{ title: 'No finance summary', hint: 'No revenue or expenses recorded for this window.', icon: <DI n="coin" s={2.2} /> }}
        >
          {summary && (
            <>
              <div className="grid3">
                <Field label="Revenue (90d)" value={formatMinor(summary.revenue_minor, summary.currency)} source={srcKind(summary.data_quality?.revenue_source)} />
                <Field label="Expenses (90d)" value={formatMinor(summary.expenses_minor, summary.currency)} source={srcKind(summary.data_quality?.expenses_source)} />
                <Field label="Net to owner" value={formatMinor(summary.net_to_owner_minor, summary.currency)} source="friday" />
              </div>
              <div className="grid3" style={{ marginTop: 10 }}>
                <Field label="Occupancy" value={summary.occupancy_pct != null ? `${Math.round(summary.occupancy_pct)}%` : '—'} source="guesty" />
                <Field label="ADR" value={formatMinor(summary.adr_minor, summary.currency)} source="guesty" />
                <Field label="RevPAR" value={formatMinor(summary.revpar_minor, summary.currency)} source="modeled" confidence={70} />
              </div>
            </>
          )}
        </DataState>
      </div>
      <div className="gate" style={{ borderStyle: 'solid', marginTop: 12 }}>
        <DI n="coin" s={1.7} style={{ color: 'var(--indigo-bright)', flex: '0 0 auto' }} />
        <span>Owner statements + ledger live in <b>Finance</b> &amp; <b>Owners</b>. This is the property-anchored read-only roll-up — open Finance for the period close.</span>
      </div>
    </>
  );
}

// ── Reviews tab — no synced data yet (REVIEWS fixture empty by design) ──
function TabReviews({ property }: { property: Property }) {
  const hasRating = property.rating > 0 && property.ratingCount > 0;
  return (
    <>
      <div className="dml">Reviews <span className="rule" /></div>
      {hasRating ? (
        <div className="panel grid3">
          <Field label="Rating" value={`★ ${property.rating.toFixed(2)}`} source="friday" />
          <Field label="Reviews" value={property.ratingCount} source="friday" />
          <Field label="Cohort" value={COHORT_LABEL[property.region]} source="friday" />
        </div>
      ) : (
        <div className="panel" style={{ padding: 0 }}>
          <DataState
            status="empty"
            empty={{
              title: 'No synced reviews yet',
              hint: 'Channel reviews (Airbnb, Booking, Reva) sync into this tab once the review connector is live for this property.',
              icon: <DI n="star" s={2.2} />,
            }}
          />
        </div>
      )}
    </>
  );
}

// ── Guests tab — guest history derived from reservations (Guesty) ──
function TabGuests({ property, onOpen }: { property: Property; onOpen: () => void }) {
  const stays = useMemo(
    () => RESERVATIONS
      .filter((r) => r.propertyCode === property.code && r.channel !== 'owner')
      .sort((a, b) => b.checkIn.localeCompare(a.checkIn)),
    [property.code],
  );
  const status: DataStatus = stays.length === 0 ? 'empty' : 'ready';
  const statusBadge: Record<string, string> = {
    confirmed: 'green dot', checked_in: 'green dot', checked_out: 'gray', cancelled: 'red', hold: 'amber dot', inquiry: 'indigo',
  };
  return (
    <>
      <div className="dml">Guest history <span className="srctag guesty" style={{ marginLeft: 8 }}><span className="srctag-dot" />Guesty</span><span className="rule" /></div>
      <div className="panel" style={{ padding: '10px 6px' }}>
        <DataState
          status={status}
          empty={{ title: 'No guest stays yet', hint: 'Reservations for this property will appear here.', icon: <DI n="users" s={2.2} /> }}
        >
          <table className="tbl">
            <thead><tr><th>Guest</th><th>Check-in</th><th>Nights</th><th>Channel</th><th>Status</th></tr></thead>
            <tbody>
              {stays.slice(0, 12).map((r) => (
                <tr key={r.id} className="tdrow" onClick={onOpen}>
                  <td className="tt">{r.guestName}</td>
                  <td className="mono faint" style={{ fontSize: 11 }}>{r.checkIn.slice(0, 10)}</td>
                  <td className="mono">{r.nights}</td>
                  <td className="faint" style={{ textTransform: 'capitalize' }}>{r.channel}</td>
                  <td><span className={'bdg ' + (statusBadge[r.status] || 'gray')}>{r.status.replace(/_/g, ' ')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataState>
      </div>
    </>
  );
}

// ── Documents tab — contract + onboarding artifacts (FAD/Xodo) ──
function TabDocuments({ property, flash }: { property: Property; flash: (m: string) => void }) {
  const c = getContract(property);
  const { done, total } = checklistProgress(property);
  const xodo = 'xodoEnvelopeId' in c ? c.xodoEnvelopeId : undefined;
  return (
    <>
      <div className="dml">Documents <span className="srctag friday" style={{ marginLeft: 8 }}><span className="srctag-dot" />FAD</span><span className="rule" /></div>
      <div className="panel" style={{ padding: '10px 6px' }}>
        <table className="tbl">
          <thead><tr><th>Document</th><th>State</th><th>Source</th></tr></thead>
          <tbody>
            <tr className="tdrow" onClick={() => flash(xodo && xodo !== '—' ? `Open Xodo envelope ${xodo}` : 'Owner agreement (Legal & Admin)')}>
              <td className="tt">Owner agreement</td>
              <td><span className={'bdg ' + (c.status === 'active' ? 'green dot' : 'amber dot')}>{c.status}</span></td>
              <td><SourceTag kind="friday" /></td>
            </tr>
            <tr className="tdrow" onClick={() => flash('Onboarding checklist (artifacts)')}>
              <td className="tt">Onboarding checklist</td>
              <td><span className={'bdg ' + (done >= total ? 'green dot' : 'amber dot')}>{done} / {total}</span></td>
              <td><SourceTag kind="friday" /></td>
            </tr>
            <tr className="tdrow" onClick={() => flash('Standards book (Legal & Admin)')}>
              <td className="tt">Standards book</td>
              <td><span className="bdg gray">on file</span></td>
              <td><SourceTag kind="friday" /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="gate" style={{ borderStyle: 'solid', marginTop: 12 }}>
        <DI n="doc" s={1.7} style={{ color: 'var(--indigo-bright)', flex: '0 0 auto' }} />
        <span>E-signature &amp; the full document vault live in <b>Legal &amp; Admin</b> (Xodo Sign). This tab cross-links the property's key documents — it does not duplicate them.</span>
      </div>
    </>
  );
}

// ── Ask Friday tab — per-module contract (staff_private surface) ──
function TabAskFriday({ property, flash }: { property: Property; flash: (m: string) => void }) {
  const contract = contractFor('properties');
  if (!contract) {
    return <DataState status="empty" empty={{ title: 'Ask Friday unavailable', hint: 'No Ask Friday contract is registered for Properties.', icon: <DI n="spark" s={2.2} /> }} />;
  }
  return (
    <>
      <div className="row between" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div className="dml" style={{ margin: 0 }}>Ask Friday · {property.code}</div>
        {/* staff_private: this surface is never guest-visible. */}
        <PermissionState label="Staff-private surface" />
      </div>

      <div className="fai">
        <div className="fh"><span className="bdg indigo"><DI n="spark" s={1.6} /> Friday · Properties</span></div>
        <p>Ask about this property — grounded in its Guesty facts, Breezeway condition, reviews and guest history. Friday can draft a property summary; it never commits changes without your approval.</p>

        {/* Honest AI trust strip — healthy when the surface pack is published. */}
        <AITrustStrip
          health={contract.surfaceId ? 'healthy' : 'fallback'}
          source="Friday"
          confidence={contract.surfaceId ? 78 : null}
          provenance={contract.groundsIn.map((g) => ({ label: g }))}
        />
      </div>

      <div className="dml" style={{ marginTop: 16 }}>What this surface can do <span className="rule" /></div>
      <div className="grid3">
        <div className="panel">
          <div className="field-label">Grounds in</div>
          <div className="row" style={{ gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
            {contract.groundsIn.map((g) => <span key={g} className="synflag green">{g}</span>)}
          </div>
        </div>
        <div className="panel">
          <div className="field-label">Can draft</div>
          <div className="row" style={{ gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
            {contract.canDraft.length ? contract.canDraft.map((d) => <span key={d} className="synflag">{d}</span>) : <span className="faint" style={{ fontSize: 12 }}>—</span>}
          </div>
        </div>
        <div className="panel">
          <div className="field-label">Approval-gated</div>
          <div className="row" style={{ gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
            {contract.gatedActions.length
              ? contract.gatedActions.map((a) => <span key={a} className="synflag amber">{a}</span>)
              : <span className="faint" style={{ fontSize: 12 }}>No mutating actions</span>}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="afp-in" onClick={() => flash('Ask Friday opens here (wired by the Ask-Friday session)')} style={{ cursor: 'pointer' }}>
          <DI n="spark" s={1.6} style={{ color: 'var(--tx-3)' }} /> <span>Ask Friday about {property.code}…</span>
          <span className="snd"><DI n="chevR" s={2.2} /></span>
        </div>
        {contract.citations && <div className="faint" style={{ fontSize: 11, marginTop: 8 }}>Answers cite their sources.</div>}
      </div>
    </>
  );
}
