'use client';

import { useMemo, useState } from 'react';
import {
  PROPERTIES,
  LIFECYCLE_LABEL,
  type LifecycleStatus,
  type Property,
  lifecycleBadge,
} from '../../../_data/properties';
import { useFixtureRev } from '../../../_data/fixtureRev';
import { COHORT_LABEL, type Cohort } from '../../../_data/reviews';
import { FIN_OWNERS } from '../../../_data/finance';
import { BulkEditDrawer } from './BulkEditDrawer';

interface Props {
  onOpen: (code: string) => void;
}

type LifecycleFilter = 'all_active' | LifecycleStatus | 'archived';
type SortKey = 'code' | 'name' | 'lifecycle' | 'region' | 'bedrooms' | 'occ' | 'adr' | 'rating' | 'lastActivity';

export function AllPropertiesPage({ onOpen }: Props) {
  const fixtureRev = useFixtureRev();
  const [search, setSearch] = useState('');
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>('all_active');
  const [region, setRegion] = useState<'all' | Cohort>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'lastActivity', dir: 'desc' });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [, setRev] = useState(0);
  const bump = () => setRev((n) => n + 1);

  const ownerName = (id: string) => FIN_OWNERS.find((o) => o.id === id)?.name ?? id;

  const filtered = useMemo(() => {
    let rows: Property[] = PROPERTIES.slice();

    // Default scope: hide off-boarded unless explicitly requested
    if (lifecycle === 'all_active') {
      rows = rows.filter((p) => p.lifecycleStatus !== 'off_boarded');
    } else if (lifecycle === 'archived') {
      rows = rows.filter((p) => p.lifecycleStatus === 'off_boarded');
    } else {
      rows = rows.filter((p) => p.lifecycleStatus === lifecycle);
    }

    if (region !== 'all') rows = rows.filter((p) => p.region === region);

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.area.toLowerCase().includes(q));
    }

    const compare = (a: Property, b: Property) => {
      const dir = sort.dir === 'asc' ? 1 : -1;
      switch (sort.key) {
        case 'code': return a.code.localeCompare(b.code) * dir;
        case 'name': return a.name.localeCompare(b.name) * dir;
        case 'lifecycle': return a.lifecycleStatus.localeCompare(b.lifecycleStatus) * dir;
        case 'region': return a.region.localeCompare(b.region) * dir;
        case 'bedrooms': return (a.bedrooms - b.bedrooms) * dir;
        case 'occ': return (a.occupancy90d - b.occupancy90d) * dir;
        case 'adr': return (a.adr - b.adr) * dir;
        case 'rating': return (a.rating - b.rating) * dir;
        case 'lastActivity': return a.lastActivityAt.localeCompare(b.lastActivityAt) * dir;
      }
    };

    return rows.sort(compare);
  }, [search, lifecycle, region, sort, fixtureRev]);

  const toggleSort = (key: SortKey) => {
    setSort((s) => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allVisibleSelected = filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id));
  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) return new Set();
      const next = new Set(prev);
      filtered.forEach((p) => next.add(p.id));
      return next;
    });
  };

  const selectedArray = Array.from(selectedIds);

  return (
    <div className="fad-module-body" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search code, name, area…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: '8px 12px', fontSize: 13, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
        />
        <select value={lifecycle} onChange={(e) => setLifecycle(e.target.value as LifecycleFilter)} style={{ padding: '8px 12px', fontSize: 13, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
          <option value="all_active">All active</option>
          <option value="live">Live only</option>
          <option value="onboarding">Onboarding</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived (off-boarded)</option>
        </select>
        <select value={region} onChange={(e) => setRegion(e.target.value as 'all' | Cohort)} style={{ padding: '8px 12px', fontSize: 13, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
          <option value="all">All regions</option>
          {Object.entries(COHORT_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-text-tertiary)', alignSelf: 'center' }}>
          {filtered.length} {filtered.length === 1 ? 'property' : 'properties'}
        </span>
      </div>

      {/* Bulk-action toolbar (shown when ≥ 1 selected) */}
      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', marginBottom: 8,
          background: 'rgba(var(--color-brand-accent-rgb, 86, 128, 202), 0.10)',
          border: '0.5px solid var(--color-brand-accent)',
          borderRadius: 'var(--radius-sm)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{selectedIds.size} selected</span>
          <button className="btn primary sm" onClick={() => setBulkOpen(true)}>Bulk edit…</button>
          <span style={{ flex: 1 }} />
          <button className="btn ghost sm" onClick={() => setSelectedIds(new Set())}>Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="card prop-table-wrap" style={{ flex: 1, overflow: 'auto', padding: 0 }}>
        <table className="prop-table">
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  title={allVisibleSelected ? 'Deselect all' : 'Select all visible'}
                />
              </th>
              <SortHeader k="code" sort={sort} onToggle={toggleSort}>Code</SortHeader>
              <SortHeader k="name" sort={sort} onToggle={toggleSort}>Name</SortHeader>
              <SortHeader k="lifecycle" sort={sort} onToggle={toggleSort}>Status</SortHeader>
              <SortHeader k="region" sort={sort} onToggle={toggleSort}>Region</SortHeader>
              <SortHeader k="bedrooms" sort={sort} onToggle={toggleSort}>Beds</SortHeader>
              <th>Owner</th>
              <th>Channels</th>
              <SortHeader k="occ" sort={sort} onToggle={toggleSort}>Occ 90d</SortHeader>
              <SortHeader k="adr" sort={sort} onToggle={toggleSort}>ADR</SortHeader>
              <SortHeader k="rating" sort={sort} onToggle={toggleSort}>Rating</SortHeader>
              <SortHeader k="lastActivity" sort={sort} onToggle={toggleSort}>Last activity</SortHeader>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const badge = lifecycleBadge(p);
              const channels = p.listings.map((l) => l.channel).join(', ') || '—';
              return (
                <tr key={p.code} className="prop-row" onClick={() => onOpen(p.code)}>
                  <td onClick={(e) => { e.stopPropagation(); toggleRow(p.id); }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleRow(p.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="mono">{p.code}{p.isCombo && <span className="chip sm" style={{ marginLeft: 6 }}>combo</span>}{p.parentPropertyId && <span className="chip sm" style={{ marginLeft: 6 }}>unit</span>}</td>
                  <td><strong>{p.name}</strong>{p.buildingName && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{p.buildingName}</div>}</td>
                  <td><span className={`chip sm ${badge.tone === 'success' ? 'info' : badge.tone === 'warning' ? 'warn' : ''}`}>{badge.label}</span></td>
                  <td>{COHORT_LABEL[p.region]}</td>
                  <td>{p.bedrooms === 0 ? 'Studio' : p.bedrooms}</td>
                  <td>{ownerName(p.primaryOwnerId)}</td>
                  <td style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{channels}</td>
                  <td>{p.occupancy90d > 0 ? `${Math.round(p.occupancy90d * 100)}%` : '—'}</td>
                  <td>{p.adr > 0 ? `€${p.adr}` : '—'}</td>
                  <td>{p.rating > 0 ? `★ ${p.rating.toFixed(2)}` : '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{p.lastActivityAt}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={12} style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-tertiary)' }}>No properties match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="prop-mobile-list">
        {filtered.map((p) => {
          const badge = lifecycleBadge(p);
          const channels = p.listings.map((l) => l.channel).join(', ') || 'No channels';
          return (
            <article
              key={p.code}
              className="prop-mobile-card"
              onClick={() => onOpen(p.code)}
            >
              <div className="prop-mobile-card-top">
                <input
                  type="checkbox"
                  checked={selectedIds.has(p.id)}
                  onChange={() => toggleRow(p.id)}
                  onClick={(e) => e.stopPropagation()}
                  title={selectedIds.has(p.id) ? 'Deselect property' : 'Select property'}
                />
                <div className="prop-mobile-title">
                  <span className="mono">{p.code}</span>
                  <strong>{p.name}</strong>
                </div>
                <span className={`chip sm ${badge.tone === 'success' ? 'info' : badge.tone === 'warning' ? 'warn' : ''}`}>
                  {badge.label}
                </span>
              </div>
              <div className="prop-mobile-meta">
                <span>{COHORT_LABEL[p.region]}</span>
                <span>{p.bedrooms === 0 ? 'Studio' : `${p.bedrooms} bed`}</span>
                <span>{ownerName(p.primaryOwnerId)}</span>
              </div>
              <div className="prop-mobile-stats">
                <span><small>Occ</small>{p.occupancy90d > 0 ? `${Math.round(p.occupancy90d * 100)}%` : '—'}</span>
                <span><small>ADR</small>{p.adr > 0 ? `€${p.adr}` : '—'}</span>
                <span><small>Rating</small>{p.rating > 0 ? `★ ${p.rating.toFixed(2)}` : '—'}</span>
              </div>
              <div className="prop-mobile-foot">
                <span>{channels}</span>
                <span>{p.lastActivityAt}</span>
              </div>
            </article>
          );
        })}
        {filtered.length === 0 && (
          <div className="prop-mobile-empty">No properties match.</div>
        )}
      </div>

      {bulkOpen && (
        <BulkEditDrawer
          selectedIds={selectedArray}
          onClose={() => setBulkOpen(false)}
          onApplied={() => { setSelectedIds(new Set()); bump(); }}
        />
      )}
    </div>
  );
}

function SortHeader({ k, sort, onToggle, children }: {
  k: SortKey; sort: { key: SortKey; dir: 'asc' | 'desc' }; onToggle: (k: SortKey) => void; children: React.ReactNode;
}) {
  const active = sort.key === k;
  return (
    <th onClick={() => onToggle(k)} style={{ cursor: 'pointer', userSelect: 'none' }}>
      {children} {active && <span style={{ fontSize: 9 }}>{sort.dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );
}
