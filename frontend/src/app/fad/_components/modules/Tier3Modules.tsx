'use client';

// @demo:data — Tag: PROD-DATA-29 — see frontend/DEMO_CRUFT.md
// Guests, Marketing, Leads, Intelligence — entire file is inline demo JSX
// Entire module is inline demo JSX content (cards, tables, charts with
// hardcoded mock data). Replace with real backend-driven content when
// the module ships, or render a 'Coming soon' placeholder until then.

import { useState } from 'react';
import {
  CAMPAIGNS,
  CHANNEL_MIX,
  GUESTS,
  GUESTS_KPI,
  INTEL_DIGEST,
  INTEL_INSIGHTS,
  INTEL_KPI,
  INTEL_PROMPT_LIBRARY,
  INTEL_WEEKLY_PULSE,
  type IntelInsight,
  type IntelInsightKind,
  LEAD_KPI,
  LEAD_PIPELINES,
  LEAD_STAGES,
  LEADS,
  LIFECYCLE_EMAILS,
  MKT_KPI,
  type Guest,
  type Lead,
  type LeadPipeline,
} from '../../_data/fixtures-tier3';
import { FilterBar, FilterChip, FilterPill } from '../FilterBar';
import { IconAI, IconDownload, IconMail, IconPlus, IconRefresh, IconSend, IconSparkle } from '../icons';
import { ModuleHeader } from '../ModuleHeader';

/* ───────────── GUESTS ───────────── */
export function GuestsModule() {
  const [tab, setTab] = useState('all');
  const [sel, setSel] = useState<string | null>(null);
  const tabs = [
    { id: 'all', label: 'All', count: GUESTS.length },
    { id: 'vip', label: 'VIP' },
    { id: 'returning', label: 'Returning' },
    { id: 'new', label: 'New · 90d' },
    { id: 'watch', label: 'Watchlist' },
  ];
  const filtered =
    tab === 'all'
      ? GUESTS
      : tab === 'watch'
      ? GUESTS.filter((g) => g.id === 'g9' || g.id === 'g5')
      : GUESTS.filter((g) => g.tier === tab);
  if (sel) {
    const guest = GUESTS.find((g) => g.id === sel)!;
    return <GuestDetail g={guest} onBack={() => setSel(null)} />;
  }
  return (
    <>
      <ModuleHeader
        title="Guests"
        subtitle="Unified profile across OTAs · 184 active · 21 VIP"
        tabs={tabs}
        activeTab={tab}
        onTabChange={setTab}
        actions={
          <button className="btn primary sm">
            <IconPlus size={12} /> Add guest
          </button>
        }
      />
      <div className="fad-module-body">
        <div className="kpi-grid">
          {GUESTS_KPI.map((k, i) => (
            <div className="kpi" key={i}>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value">{k.value}</div>
              <div className="kpi-sub">{k.sub}</div>
            </div>
          ))}
        </div>
        <div className="card">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 0.6fr 0.6fr 1fr 1fr 1fr 0.8fr',
              gap: 12,
              padding: '10px 16px',
              borderBottom: '0.5px solid var(--color-border-tertiary)',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--color-text-tertiary)',
            }}
          >
            <span>Guest</span>
            <span>Stays</span>
            <span>Lang</span>
            <span>Last</span>
            <span>Lifetime</span>
            <span>Tier</span>
            <span>Property</span>
          </div>
          {filtered.map((g) => (
            <div
              key={g.id}
              onClick={() => setSel(g.id)}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 0.6fr 0.6fr 1fr 1fr 1fr 0.8fr',
                gap: 12,
                padding: '14px 16px',
                borderBottom: '0.5px solid var(--color-border-tertiary)',
                alignItems: 'center',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="avatar sm">{g.initials}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{g.name}</div>
                  <div className="row-meta">{g.country}</div>
                </div>
              </div>
              <span className="mono">{g.stays}</span>
              <span className="mono" style={{ fontSize: 11 }}>
                {g.lang}
              </span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                {g.last}
              </span>
              <span className="mono">{g.lifetime}</span>
              <span>
                <span className={'chip ' + (g.tier === 'vip' ? 'info' : '')}>{g.tier}</span>
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                {g.props[0]}
                {g.props.length > 1 ? ' +' + (g.props.length - 1) : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function GuestDetail({ g, onBack }: { g: Guest; onBack: () => void }) {
  return (
    <>
      <div className="fad-module-header">
        <div className="fad-module-header-main">
          <button className="btn ghost sm" onClick={onBack} style={{ marginBottom: 8 }}>
            ← All guests
          </button>
          <h1 className="fad-module-title">{g.name}</h1>
          <div className="fad-module-subtitle">
            {g.country} · {g.lang} · {g.tier.toUpperCase()}
          </div>
        </div>
        <div className="fad-module-actions">
          <button className="btn primary sm">
            <IconMail size={12} /> Message
          </button>
        </div>
      </div>
      <div className="fad-module-body">
        <div className="kpi-grid">
          <div className="kpi">
            <div className="kpi-label">Stays with us</div>
            <div className="kpi-value">{g.stays}</div>
            <div className="kpi-sub">last {g.last}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Lifetime value</div>
            <div className="kpi-value">{g.lifetime}</div>
            <div className="kpi-sub">incl. extras</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Avg rating given</div>
            <div className="kpi-value">4.8</div>
            <div className="kpi-sub">out of 5</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Properties</div>
            <div className="kpi-value">{g.props.length}</div>
            <div className="kpi-sub">{g.props.join(', ')}</div>
          </div>
        </div>
        <div className="two-col">
          <div className="card">
            <div className="card-header">
              <div className="card-title">Preferences memory</div>
              <div className="card-subtitle">Friday-maintained</div>
            </div>
            <div className="card-body" style={{ fontSize: 13, lineHeight: 1.55 }}>
              {g.notes}
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Stay history</div>
            </div>
            <div className="row" style={{ padding: '12px 16px' }}>
              <div style={{ flex: 1 }}>
                <div className="row-primary">
                  {g.props[0]} · {g.last}
                </div>
                <div className="row-meta">7 nights · €4,200 · 5.0★</div>
              </div>
            </div>
            <div className="row" style={{ padding: '12px 16px' }}>
              <div style={{ flex: 1 }}>
                <div className="row-primary">{g.props[0]} · Nov 18</div>
                <div className="row-meta">10 nights · €6,800 · 4.9★</div>
              </div>
            </div>
            <div className="row" style={{ padding: '12px 16px' }}>
              <div style={{ flex: 1 }}>
                <div className="row-primary">{g.props[0]} · Feb 25</div>
                <div className="row-meta">5 nights · €3,100 · 5.0★</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ───────────── MARKETING ───────────── */
export function MarketingModule() {
  const [tab, setTab] = useState('campaigns');
  const tabs = [
    { id: 'campaigns', label: 'Campaigns' },
    { id: 'channels', label: 'Channel mix' },
    { id: 'lifecycle', label: 'Lifecycle emails' },
    { id: 'direct', label: 'Direct-booking' },
  ];
  return (
    <>
      <ModuleHeader
        title="Marketing"
        subtitle="Campaigns · attribution · lifecycle · direct-book growth"
        tabs={tabs}
        activeTab={tab}
        onTabChange={setTab}
        actions={
          <button className="btn primary sm">
            <IconPlus size={12} /> New campaign
          </button>
        }
      />
      <div className="fad-module-body">
        <div className="kpi-grid">
          {MKT_KPI.map((k, i) => (
            <div className="kpi" key={i}>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value">{k.value}</div>
              <div className="kpi-sub">{k.sub}</div>
            </div>
          ))}
        </div>
        {tab === 'campaigns' && <MktCampaigns />}
        {tab === 'channels' && <MktChannels />}
        {tab === 'lifecycle' && <MktLifecycle />}
        {tab === 'direct' && <MktDirect />}
      </div>
    </>
  );
}

function MktCampaigns() {
  return (
    <div className="card">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2.2fr 1.2fr 0.8fr 1fr 0.8fr 0.8fr 1fr',
          gap: 12,
          padding: '10px 16px',
          borderBottom: '0.5px solid var(--color-border-tertiary)',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--color-text-tertiary)',
        }}
      >
        <span>Campaign</span>
        <span>Channel</span>
        <span>Status</span>
        <span>Window</span>
        <span>Sent</span>
        <span>Opens</span>
        <span>Revenue</span>
      </div>
      {CAMPAIGNS.map((c) => (
        <div
          key={c.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '2.2fr 1.2fr 0.8fr 1fr 0.8fr 0.8fr 1fr',
            gap: 12,
            padding: '14px 16px',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            alignItems: 'center',
            fontSize: 13,
          }}
        >
          <span style={{ fontWeight: 500 }}>{c.name}</span>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{c.channel}</span>
          <span>
            <span
              className={
                'chip ' + (c.status === 'live' ? 'info' : c.status === 'scheduled' ? 'warn' : '')
              }
            >
              {c.status}
            </span>
          </span>
          <span className="mono" style={{ fontSize: 11 }}>
            {c.starts} → {c.ends}
          </span>
          <span className="mono">{c.sent || '—'}</span>
          <span className="mono">{c.opens}</span>
          <span className="mono" style={{ fontWeight: 500 }}>
            {c.revenue}
          </span>
        </div>
      ))}
    </div>
  );
}

function MktChannels() {
  const attribution = [
    { s: 'Direct site', b: 14, r: '€ 52,400' },
    { s: 'Airbnb', b: 9, r: '€ 38,200' },
    { s: 'Google (organic)', b: 5, r: '€ 22,800' },
    { s: 'Referral · past guest', b: 4, r: '€ 16,400' },
    { s: 'Instagram', b: 2, r: '€ 7,900' },
  ];
  return (
    <div className="two-col">
      <div className="card">
        <div className="card-header">
          <div className="card-title">Booking channel mix · YTD</div>
          <div className="card-subtitle">by revenue</div>
        </div>
        <div className="card-body">
          <div
            style={{ display: 'flex', height: 22, borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}
          >
            {CHANNEL_MIX.map((c, i) => (
              <div key={i} style={{ flex: c.share, background: c.color }} />
            ))}
          </div>
          {CHANNEL_MIX.map((c, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '6px 0',
                fontSize: 13,
                borderBottom: '0.5px solid var(--color-border-tertiary)',
              }}
            >
              <span style={{ width: 12, height: 12, background: c.color, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{c.channel}</span>
              <span className="mono" style={{ color: 'var(--color-text-tertiary)' }}>
                {Math.round(c.share * 100)}%
              </span>
              <span className="mono" style={{ width: 100, textAlign: 'right' }}>
                {c.revenue}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Attribution · last 30 days</div>
          <div className="card-subtitle">which source actually converted</div>
        </div>
        <div className="card-body" style={{ fontSize: 13 }}>
          {attribution.map((a, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                padding: '8px 0',
                borderBottom: '0.5px solid var(--color-border-tertiary)',
              }}
            >
              <span style={{ flex: 1 }}>{a.s}</span>
              <span
                className="mono"
                style={{ width: 50, textAlign: 'right', color: 'var(--color-text-tertiary)' }}
              >
                {a.b} book
              </span>
              <span className="mono" style={{ width: 90, textAlign: 'right', fontWeight: 500 }}>
                {a.r}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MktLifecycle() {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Lifecycle emails</div>
        <div className="card-subtitle">triggered on reservation events</div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 0.8fr 1fr 0.8fr 0.8fr',
          gap: 12,
          padding: '10px 16px',
          borderBottom: '0.5px solid var(--color-border-tertiary)',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--color-text-tertiary)',
        }}
      >
        <span>Trigger</span>
        <span>When</span>
        <span>Send</span>
        <span>Open rate</span>
        <span>Status</span>
      </div>
      {LIFECYCLE_EMAILS.map((l, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 0.8fr 1fr 0.8fr 0.8fr',
            gap: 12,
            padding: '14px 16px',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            fontSize: 13,
            alignItems: 'center',
          }}
        >
          <span style={{ fontWeight: 500 }}>{l.trigger}</span>
          <span className="mono" style={{ fontSize: 12 }}>
            {l.days}
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{l.send}</span>
          <span className="mono">{l.openRate}</span>
          <span>
            <span className={'chip ' + (l.status === 'live' ? 'info' : '')}>{l.status}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function MktDirect() {
  const growth = [
    { m: 'Nov', v: 18 },
    { m: 'Dec', v: 19 },
    { m: 'Jan', v: 20 },
    { m: 'Feb', v: 20 },
    { m: 'Mar', v: 21 },
    { m: 'Apr', v: 22 },
  ];
  return (
    <div className="two-col">
      <div className="card">
        <div className="card-header">
          <div className="card-title">Direct-booking growth</div>
          <div className="card-subtitle">goal: 25% of stays by Q4</div>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 140 }}>
            {growth.map((d, i) => (
              <div
                key={i}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%' }}
              >
                <div
                  style={{
                    flex: 1,
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                  }}
                >
                  <div
                    style={{
                      background: 'var(--color-brand-accent)',
                      height: `${(d.v / 25) * 100}%`,
                      opacity: i === 5 ? 1 : 0.5,
                    }}
                  />
                </div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  {d.m}
                </div>
                <div className="mono" style={{ fontSize: 11, fontWeight: i === 5 ? 500 : 400 }}>
                  {d.v}%
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--color-text-tertiary)',
              marginTop: 16,
              borderTop: '0.5px dashed var(--color-border-tertiary)',
              paddingTop: 10,
            }}
          >
            +4pp over 6 months · linear extrapolation hits 25% by Oct
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Direct-booking levers</div>
        </div>
        <div className="row" style={{ padding: '14px 16px' }}>
          <div style={{ flex: 1 }}>
            <div className="row-primary">15% off discount code — active</div>
            <div className="row-meta">7 bookings · €21.8k revenue · ROI 3.8×</div>
          </div>
          <span className="chip info">live</span>
        </div>
        <div className="row" style={{ padding: '14px 16px' }}>
          <div style={{ flex: 1 }}>
            <div className="row-primary">Past-guest winback email</div>
            <div className="row-meta">draft · pending Mary approval</div>
          </div>
          <span className="chip">draft</span>
        </div>
        <div className="row" style={{ padding: '14px 16px' }}>
          <div style={{ flex: 1 }}>
            <div className="row-primary">SEO: Villa Azur landing page</div>
            <div className="row-meta">#3 on Google for &quot;luxury villa Trou aux Biches&quot;</div>
          </div>
          <span className="chip info">ranking</span>
        </div>
      </div>
    </div>
  );
}

/* ───────────── LEADS ───────────── */
export function LeadsModule() {
  const [pipeline, setPipeline] = useState<LeadPipeline | 'all'>('all');
  const [view, setView] = useState<'board' | 'list'>('board');

  const tabs = [
    { id: 'all', label: 'All pipelines', count: LEADS.filter((l) => l.stage !== 'lost').length },
    ...LEAD_PIPELINES.map((p) => ({
      id: p.id,
      label: p.label,
      count: LEADS.filter((l) => l.pipeline === p.id && l.stage !== 'lost').length,
    })),
  ];

  const shown =
    pipeline === 'all' ? LEADS : LEADS.filter((l) => l.pipeline === pipeline);

  return (
    <>
      <ModuleHeader
        title="Leads"
        subtitle="Four pipelines · owners · syndic · interior · agency"
        tabs={tabs}
        activeTab={pipeline}
        onTabChange={(id) => setPipeline(id as LeadPipeline | 'all')}
        actions={
          <>
            <div
              style={{
                display: 'flex',
                border: '0.5px solid var(--color-border-secondary)',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              {(['board', 'list'] as const).map((v) => (
                <button
                  key={v}
                  className={'btn sm' + (view === v ? ' primary' : ' ghost')}
                  onClick={() => setView(v)}
                  style={{ borderRadius: 0, border: 0, textTransform: 'capitalize' }}
                >
                  {v}
                </button>
              ))}
            </div>
            <button className="btn primary sm">
              <IconPlus size={12} /> Add lead
            </button>
          </>
        }
      />
      <div className="fad-module-body">
        <div className="kpi-grid">
          {LEAD_KPI.map((k, i) => (
            <div className="kpi" key={i}>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value">{k.value}</div>
              <div className="kpi-sub">{k.sub}</div>
            </div>
          ))}
        </div>

        {pipeline !== 'all' && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              background: 'var(--color-background-secondary)',
              borderLeft: '2px solid var(--color-brand-accent)',
              borderRadius: 4,
              fontSize: 13,
              display: 'flex',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <strong style={{ fontWeight: 500 }}>
              {LEAD_PIPELINES.find((p) => p.id === pipeline)?.label} pipeline
            </strong>
            <span style={{ color: 'var(--color-text-secondary)' }}>
              {LEAD_PIPELINES.find((p) => p.id === pipeline)?.description}
            </span>
          </div>
        )}

        {pipeline === 'all' && view === 'board' ? (
          <AllPipelinesBoard />
        ) : view === 'board' ? (
          <LeadsBoard leads={shown} />
        ) : (
          <LeadsList leads={shown} />
        )}
      </div>
    </>
  );
}

function LeadsBoard({ leads }: { leads: Lead[] }) {
  return (
    <div className="leads-board">
      {LEAD_STAGES.filter((s) => s.id !== 'lost').map((s) => {
        const col = leads.filter((l) => l.stage === s.id);
        return (
          <div key={s.id} className="leads-col">
            <div className="leads-col-head">
              <div className="leads-col-title">{s.label}</div>
              <div className="leads-col-count">{col.length}</div>
            </div>
            <div className="leads-col-sub">{s.description}</div>
            <div className="leads-col-body">
              {col.map((l) => (
                <LeadCard key={l.id} l={l} showPipeline={false} />
              ))}
              {col.length === 0 && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--color-text-tertiary)',
                    textAlign: 'center',
                    padding: 24,
                  }}
                >
                  —
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AllPipelinesBoard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {LEAD_PIPELINES.map((p) => {
        const leads = LEADS.filter((l) => l.pipeline === p.id && l.stage !== 'lost');
        return (
          <div key={p.id}>
            <div
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'baseline',
                marginBottom: 8,
                padding: '0 2px',
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {p.label}
              </span>
              <span
                className="mono"
                style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}
              >
                {leads.length}
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                — {p.description}
              </span>
            </div>
            <div className="leads-board">
              {LEAD_STAGES.filter((s) => s.id !== 'lost').map((s) => {
                const col = leads.filter((l) => l.stage === s.id);
                return (
                  <div key={s.id} className="leads-col" style={{ minHeight: 160 }}>
                    <div className="leads-col-head">
                      <div className="leads-col-title">{s.label}</div>
                      <div className="leads-col-count">{col.length}</div>
                    </div>
                    <div className="leads-col-body" style={{ paddingTop: 8 }}>
                      {col.map((l) => (
                        <LeadCard key={l.id} l={l} showPipeline={false} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LeadCard({ l, showPipeline }: { l: Lead; showPipeline?: boolean }) {
  return (
    <div className="lead-card">
      {showPipeline && (
        <div
          style={{
            fontSize: 9,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-text-tertiary)',
            marginBottom: 4,
          }}
        >
          {LEAD_PIPELINES.find((p) => p.id === l.pipeline)?.label}
        </div>
      )}
      <div className="lead-card-name">{l.name}</div>
      <div className="lead-card-type">{l.type}</div>
      <div className="lead-card-value mono">{l.value}</div>
      <div className="lead-card-next">{l.nextStep}</div>
      <div className="lead-card-foot">
        <span className="avatar xs">{l.owner[0]}</span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
          {l.age}
        </span>
      </div>
    </div>
  );
}

function LeadsList({ leads }: { leads: Lead[] }) {
  return (
    <div className="card">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 0.6fr',
          gap: 12,
          padding: '10px 16px',
          borderBottom: '0.5px solid var(--color-border-tertiary)',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--color-text-tertiary)',
        }}
      >
        <span>Lead</span>
        <span>Source</span>
        <span>Type</span>
        <span>Value</span>
        <span>Next</span>
        <span>Owner</span>
      </div>
      {leads.map((l) => (
        <div
          key={l.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 0.6fr',
            gap: 12,
            padding: '14px 16px',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            alignItems: 'center',
            fontSize: 13,
          }}
        >
          <div>
            <div style={{ fontWeight: 500 }}>{l.name}</div>
            <div className="row-meta">{l.contact}</div>
          </div>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{l.source}</span>
          <span style={{ fontSize: 12 }}>{l.type}</span>
          <span className="mono" style={{ fontSize: 12 }}>
            {l.value}
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{l.nextStep}</span>
          <span className="avatar xs">{l.owner[0]}</span>
        </div>
      ))}
    </div>
  );
}

/* ───────────── INTELLIGENCE ───────────── */
export function IntelligenceModule() {
  const [tab, setTab] = useState('digest');
  const tabs = [
    { id: 'digest', label: 'Morning digest' },
    { id: 'insights', label: 'Open insights', count: INTEL_INSIGHTS.length },
    { id: 'pulse', label: 'Weekly pulse' },
    { id: 'ask', label: 'Ask Friday' },
  ];
  return (
    <>
      <ModuleHeader
        title="Intelligence"
        subtitle="Friday's read of your portfolio · AI commentary, anomaly detection, guided questions"
        tabs={tabs}
        activeTab={tab}
        onTabChange={setTab}
        actions={
          <button className="btn ghost sm">
            <IconSparkle size={12} /> New question
          </button>
        }
      />
      <div className="fad-module-body">
        <div
          style={{
            marginBottom: 20,
            padding: 12,
            background: 'var(--color-brand-accent-softer)',
            borderLeft: '2px solid var(--color-brand-accent)',
            borderRadius: 4,
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <IconSparkle size={12} />
          <span>
            Intelligence is Friday&apos;s commentary on the data. For raw dashboards, charts, and
            drill-downs, open{' '}
            <strong style={{ color: 'var(--color-brand-accent)', fontWeight: 500 }}>Analytics</strong>.
          </span>
        </div>
        <div className="kpi-grid">
          {INTEL_KPI.map((k, i) => (
            <div className="kpi" key={i}>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value">{k.value}</div>
              <div className="kpi-sub">{k.sub}</div>
            </div>
          ))}
        </div>
        {tab === 'digest' && <IntelDigest />}
        {tab === 'insights' && <IntelInsights />}
        {tab === 'pulse' && <IntelWeeklyPulse />}
        {tab === 'ask' && <IntelAskLibrary />}
      </div>
    </>
  );
}

function IntelDigest() {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">This morning&apos;s digest</div>
        <div className="card-subtitle">Friday · cached 06:00 · 3 things worth knowing</div>
      </div>
      {INTEL_DIGEST.map((d, i) => (
        <div
          key={i}
          style={{
            padding: '16px',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            display: 'flex',
            gap: 12,
          }}
        >
          <div style={{ flexShrink: 0, width: 76 }}>
            <span className="chip">{d.tag}</span>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, flex: 1 }}>{d.text}</div>
        </div>
      ))}
      <div style={{ padding: 16, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        Re-runs at 06:00 daily · one call per user per morning.
      </div>
    </div>
  );
}

function IntelInsights() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {INTEL_INSIGHTS.map((i) => (
        <InsightCard key={i.id} insight={i} />
      ))}
    </div>
  );
}

function insightKindStyle(kind: IntelInsightKind) {
  switch (kind) {
    case 'anomaly':
      return { color: 'var(--color-text-danger)', label: 'Anomaly', bg: 'var(--color-bg-danger)' };
    case 'risk':
      return { color: 'var(--color-text-warning)', label: 'Risk', bg: 'var(--color-bg-warning)' };
    case 'opportunity':
      return { color: 'var(--color-text-success)', label: 'Opportunity', bg: 'var(--color-bg-success)' };
    case 'pattern':
      return { color: 'var(--color-brand-accent)', label: 'Pattern', bg: 'var(--color-brand-accent-soft)' };
  }
}

function InsightCard({ insight }: { insight: IntelInsight }) {
  const s = insightKindStyle(insight.kind);
  return (
    <div
      className="card"
      style={{ borderLeft: '2px solid ' + s.color }}
    >
      <div
        style={{
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <span
          className="avatar sm"
          style={{ background: s.bg, color: s.color }}
        >
          <IconSparkle size={14} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span
              className="chip"
              style={{ background: s.bg, color: s.color, borderColor: 'transparent' }}
            >
              {s.label}
            </span>
            <span
              className="mono"
              style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}
            >
              {insight.age} · {Math.round(insight.confidence * 100)}% conf
            </span>
            <span
              className="mono"
              style={{
                marginLeft: 'auto',
                fontSize: 10,
                color: 'var(--color-text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {insight.module}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>{insight.title}</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.55, marginBottom: 8 }}>
            {insight.body}
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-mono-fad)',
              marginBottom: 12,
            }}
          >
            evidence · {insight.evidence}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {insight.actions.map((a, i) => (
              <button key={i} className="btn sm">
                {a}
              </button>
            ))}
            <button className="btn ghost sm">Dismiss</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IntelWeeklyPulse() {
  const p = INTEL_WEEKLY_PULSE;
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Weekly pulse</div>
        <div className="card-subtitle">{p.period} · auto-generated Sunday night</div>
      </div>
      <div className="card-body">
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: 'var(--color-text-primary)',
            marginBottom: 20,
            padding: 12,
            background: 'var(--color-brand-accent-softer)',
            borderLeft: '2px solid var(--color-brand-accent)',
            borderRadius: 4,
          }}
        >
          {p.summary}
        </div>
        <div className="two-col">
          <div>
            <div
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--color-text-success)',
                marginBottom: 8,
              }}
            >
              Highlights
            </div>
            {p.highlights.map((h, i) => (
              <div
                key={i}
                style={{
                  padding: '8px 0',
                  fontSize: 13,
                  borderBottom:
                    i < p.highlights.length - 1
                      ? '0.5px solid var(--color-border-tertiary)'
                      : 'none',
                  display: 'flex',
                  gap: 8,
                }}
              >
                <span style={{ color: 'var(--color-text-success)' }}>✓</span>
                <span>{h}</span>
              </div>
            ))}
          </div>
          <div>
            <div
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--color-text-warning)',
                marginBottom: 8,
              }}
            >
              Concerns
            </div>
            {p.concerns.map((c, i) => (
              <div
                key={i}
                style={{
                  padding: '8px 0',
                  fontSize: 13,
                  borderBottom:
                    i < p.concerns.length - 1
                      ? '0.5px solid var(--color-border-tertiary)'
                      : 'none',
                  display: 'flex',
                  gap: 8,
                }}
              >
                <span style={{ color: 'var(--color-text-warning)' }}>⚠</span>
                <span>{c}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function IntelAskLibrary() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {INTEL_PROMPT_LIBRARY.map((g) => (
        <div key={g.category} className="card">
          <div className="card-header">
            <div className="card-title">{g.category}</div>
          </div>
          {g.prompts.map((p, i) => (
            <div
              key={i}
              className="row"
              style={{ padding: '12px 16px', cursor: 'pointer' }}
            >
              <IconSparkle size={12} />
              <span style={{ flex: 1, fontSize: 13 }}>{p}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                Ask Friday →
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
