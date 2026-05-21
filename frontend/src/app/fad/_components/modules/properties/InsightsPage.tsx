'use client';

import { useMemo, useState } from 'react';
import {
  PROPERTIES,
  portfolioInsights,
  listingRecommendations,
  type PortfolioInsight,
  type ListingRecommendation,
  type Property,
} from '../../../_data/properties';
import { useFixtureRev } from '../../../_data/fixtureRev';
import { fireToast } from '../../Toaster';

interface Props {
  onOpen: (code: string) => void;
}

type Severity = 'low' | 'medium' | 'high';

interface PropertyRecBundle {
  property: Property;
  recs: ListingRecommendation[];
}

export function InsightsPage({ onOpen }: Props) {
  const fixtureRev = useFixtureRev();
  const portfolio = useMemo(() => portfolioInsights(), [fixtureRev]);

  const propertyBundles = useMemo<PropertyRecBundle[]>(() => {
    return PROPERTIES
      .map((p) => ({ property: p, recs: listingRecommendations(p) }))
      .filter((b) => b.recs.length > 0)
      .sort((a, b) => {
        const aHigh = a.recs.filter((r) => r.severity === 'high').length;
        const bHigh = b.recs.filter((r) => r.severity === 'high').length;
        if (aHigh !== bHigh) return bHigh - aHigh;
        return b.recs.length - a.recs.length;
      });
  }, [fixtureRev]);

  const counts = useMemo(() => {
    const all = [...portfolio.map((i) => i.severity), ...propertyBundles.flatMap((b) => b.recs.map((r) => r.severity))];
    return {
      high: all.filter((s) => s === 'high').length,
      medium: all.filter((s) => s === 'medium').length,
      low: all.filter((s) => s === 'low').length,
    };
  }, [portfolio, propertyBundles]);

  const [filter, setFilter] = useState<'all' | Severity>('all');
  const filterFn = (sev: Severity) => filter === 'all' || filter === sev;

  return (
    <div className="fad-module-body" style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 500 }}>Insights</h2>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-tertiary)' }}>
          Listing-quality + portfolio-level pattern detection. AI-flagged improvement opportunities and cross-property signals.
          Knowledge-extraction (water shutoff facts, gate codes, FAQ-style learnings) lives in Training when that module ships — this surface is about <em>improving</em> what we have, not capturing new facts.
        </p>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <FilterChip label={`All · ${counts.high + counts.medium + counts.low}`} active={filter === 'all'} onClick={() => setFilter('all')} />
          <FilterChip label={`🔴 High · ${counts.high}`} active={filter === 'high'} onClick={() => setFilter('high')} />
          <FilterChip label={`🟡 Medium · ${counts.medium}`} active={filter === 'medium'} onClick={() => setFilter('medium')} />
          <FilterChip label={`⚪ Low · ${counts.low}`} active={filter === 'low'} onClick={() => setFilter('low')} />
        </div>
      </div>

      {/* Portfolio-level patterns */}
      <section style={{ marginBottom: 28 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 500 }}>Portfolio patterns</h3>
        <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Cross-property signals — region cohorts, multi-unit groups, channel coverage gaps, onboarding stalls.
        </p>

        {portfolio.filter((i) => filterFn(i.severity)).length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>No patterns matching this filter.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {portfolio.filter((i) => filterFn(i.severity)).map((insight) => (
              <PortfolioInsightCard key={insight.id} insight={insight} onOpen={onOpen} />
            ))}
          </div>
        )}
      </section>

      {/* Per-property recommendations */}
      <section>
        <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 500 }}>Per-property recommendations</h3>
        <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Listing-quality signals per property · sorted by high-severity count.
        </p>

        {propertyBundles.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No property-level recommendations.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {propertyBundles.map((bundle) => {
              const visibleRecs = bundle.recs.filter((r) => filterFn(r.severity));
              if (visibleRecs.length === 0) return null;
              return <PropertyRecCard key={bundle.property.code} bundle={{ ...bundle, recs: visibleRecs }} onOpen={() => onOpen(bundle.property.code)} />;
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={'chip' + (active ? ' info' : '')}
      style={{ cursor: 'pointer', border: 'none', fontSize: 11 }}
    >
      {label}
    </button>
  );
}

function severityStyles(sev: Severity) {
  if (sev === 'high') return { bg: 'rgba(220, 80, 80, 0.08)', border: 'rgba(220, 80, 80, 0.4)', emoji: '🔴' };
  if (sev === 'medium') return { bg: 'rgba(220, 160, 60, 0.08)', border: 'rgba(220, 160, 60, 0.4)', emoji: '🟡' };
  return { bg: 'var(--color-background-secondary)', border: 'var(--color-border-tertiary)', emoji: '⚪' };
}

function PortfolioInsightCard({ insight, onOpen }: { insight: PortfolioInsight; onOpen: (code: string) => void }) {
  const s = severityStyles(insight.severity);
  return (
    <div className="card" style={{ padding: 14, background: s.bg, border: `0.5px solid ${s.border}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 13, marginTop: 1 }}>{s.emoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14 }}>{insight.title}</strong>
            {insight.axis && <span className="chip sm">{insight.axis}</span>}
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {insight.propertyCodes.length} {insight.propertyCodes.length === 1 ? 'property' : 'properties'}
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            {insight.message}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {insight.propertyCodes.slice(0, 8).map((code) => (
              <button
                key={code}
                onClick={() => onOpen(code)}
                className="chip mono"
                style={{ cursor: 'pointer', border: 'none', fontSize: 10 }}
              >
                {code}
              </button>
            ))}
            {insight.propertyCodes.length > 8 && (
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', alignSelf: 'center' }}>
                +{insight.propertyCodes.length - 8} more
              </span>
            )}
          </div>
          {insight.actionLabel && (
            <button className="btn ghost sm" onClick={() => fireToast(`${insight.actionLabel} · Phase 2 wires action handlers`)}>
              {insight.actionLabel} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PropertyRecCard({ bundle, onOpen }: { bundle: PropertyRecBundle; onOpen: () => void }) {
  const { property, recs } = bundle;
  const highCount = recs.filter((r) => r.severity === 'high').length;
  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <button
          onClick={onOpen}
          className="mono"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: 'var(--color-brand-accent)', textDecoration: 'underline' }}
        >
          {property.code}
        </button>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{property.name}</span>
        {highCount > 0 && <span className="chip sm warn">🔴 {highCount}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {recs.length} signal{recs.length === 1 ? '' : 's'}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {recs.map((r) => {
          const s = severityStyles(r.severity);
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, padding: '4px 0' }}>
              <span style={{ fontSize: 10, marginTop: 2 }}>{s.emoji}</span>
              <span style={{ flex: 1 }}>{r.message}</span>
              {r.actionLabel && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>· {r.actionLabel}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
