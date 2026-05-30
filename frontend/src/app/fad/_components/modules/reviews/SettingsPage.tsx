'use client';

// Reviews module — Settings page.
//
// Surfaces REAL integration state from /api/system/status. Previously held
// hardcoded fake API keys + toggles that did nothing; per the "no demo data
// masquerading as real" rule, anything not backed by a live endpoint is
// either replaced with reality or removed.

import { useState } from 'react';
import { TAG_LIBRARY } from '../../../_data/reviews';
import {
  useSystemStatus,
  testIntegration,
  type IntegrationStatus,
} from '../../../_data/systemStatus';
import { fireToast } from '../../Toaster';

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatFuture(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = t - Date.now();
  if (diff <= 0) return 'expired';
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `in ${hrs}h`;
  return `in ${Math.round(hrs / 24)}d`;
}

export function SettingsPage() {
  const { status, loading, error, refetch } = useSystemStatus();

  return (
    <div className="fad-module-body">
      {loading && <LoadingCard />}
      {error && <ErrorCard message={error} onRetry={refetch} />}
      {status && (
        <>
          <IntegrationsCard status={status} onRefresh={refetch} />
          <AiCard status={status} />
          <ChannelsCard channels={status.channels} />
          <TagTaxonomyCard />
        </>
      )}
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading system status…</div>
    </div>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderLeft: '3px solid var(--color-text-danger)',
        background: 'var(--color-bg-danger)',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--color-text-danger)', marginBottom: 6 }}>
        Backend unreachable
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 10 }}>{message}</div>
      <button className="btn ghost sm" onClick={onRetry}>Retry</button>
    </div>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label?: string }) {
  return (
    <span
      className="chip"
      style={{
        background: ok ? 'var(--color-bg-success)' : 'var(--color-background-tertiary)',
        color: ok ? 'var(--color-text-success)' : 'var(--color-text-tertiary)',
        fontSize: 10,
        fontWeight: 500,
      }}
    >
      {label ?? (ok ? 'Configured' : 'Not configured')}
    </span>
  );
}

function IntegrationsCard({
  status,
  onRefresh,
}: {
  status: ReturnType<typeof useSystemStatus>['status'];
  onRefresh: () => void;
}) {
  if (!status) return null;
  const [testing, setTesting] = useState<string | null>(null);

  const handleTest = async (name: 'guesty' | 'gms') => {
    setTesting(name);
    try {
      const result = await testIntegration(name);
      if (result.ok) {
        fireToast(`${name} OK · ${result.latencyMs}ms round-trip`);
        onRefresh();
      } else {
        fireToast(`${name} failed · ${result.error || 'unknown error'}`);
      }
    } catch (e) {
      fireToast(`${name} test failed · ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="card" style={{ padding: 14, marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Integrations
        </div>
        <button className="btn ghost sm" onClick={onRefresh} style={{ marginLeft: 'auto', fontSize: 11 }}>
          Refresh
        </button>
      </div>

      <IntegrationRow
        name="Guesty"
        subtitle={status.guesty.baseUrl}
        configured={status.guesty.configured}
        actions={
          status.guesty.configured ? (
            <button className="btn ghost sm" onClick={() => handleTest('guesty')} disabled={testing === 'guesty'}>
              {testing === 'guesty' ? 'Testing…' : 'Test'}
            </button>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Set GUESTY_CLIENT_ID + GUESTY_CLIENT_SECRET
            </span>
          )
        }
        stats={
          status.guesty.configured
            ? [
                { label: 'Token', value: status.guesty.tokenCached ? `cached, expires ${formatFuture(status.guesty.tokenExpiresAt)}` : 'not cached' },
                { label: 'Listings cached', value: `${status.guesty.listingsCached}` },
                { label: 'Listings refreshed', value: formatRelative(status.guesty.listingsLastRefreshAt) },
              ]
            : []
        }
      />

      <IntegrationRow
        name="GMS"
        subtitle={status.gms.baseUrl}
        configured={status.gms.configured}
        actions={
          <button className="btn ghost sm" onClick={() => handleTest('gms')} disabled={testing === 'gms'}>
            {testing === 'gms' ? 'Testing…' : 'Test'}
          </button>
        }
      />

      <IntegrationRow
        name="Breezeway"
        subtitle={status.breezeway.baseUrl}
        configured={status.breezeway.configured}
        actions={
          status.breezeway.configured ? null : (
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Credentials request pending (per handover 2026-05-12)
            </span>
          )
        }
      />
    </div>
  );
}

function IntegrationRow({
  name,
  subtitle,
  configured,
  stats = [],
  actions,
}: {
  name: string;
  subtitle?: string;
  configured: boolean;
  stats?: { label: string; value: string }[];
  actions?: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: '10px 0',
        borderBottom: '0.5px solid var(--color-border-tertiary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{name}</span>
        <StatusBadge ok={configured} />
        <div style={{ marginLeft: 'auto' }}>{actions}</div>
      </div>
      {subtitle && (
        <div className="mono" style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: stats.length ? 6 : 0 }}>
          {subtitle}
        </div>
      )}
      {stats.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 6, fontSize: 11 }}>
          {stats.map((s) => (
            <div key={s.label}>
              <span style={{ color: 'var(--color-text-tertiary)' }}>{s.label}: </span>
              <span className="mono">{s.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AiCard({ status }: { status: { kimi: IntegrationStatus; anthropic: IntegrationStatus; openai: IntegrationStatus } }) {
  return (
    <div className="card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        AI providers
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 10, lineHeight: 1.5 }}>
        All FAD AI work (translation, tag extraction, suggested actions, anomaly detection) runs through Kimi.
      </div>
      <IntegrationRow
        name="Kimi (Moonshot)"
        configured={status.kimi.configured}
        actions={
          status.kimi.configured ? null : (
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Set KIMI_API_KEY</span>
          )
        }
      />
    </div>
  );
}

function ChannelsCard({ channels }: { channels: Record<string, number> }) {
  const entries = Object.entries(channels).sort((a, b) => b[1] - a[1]);
  return (
    <div className="card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        Channels · listings per platform
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 10, lineHeight: 1.5 }}>
        Derived from Guesty listings' integration metadata. Read-only — channel subscription is managed in Guesty itself, this view reports reality.
      </div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          No listings cached yet. Hit Refresh after Guesty is reachable.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {entries.map(([ch, count]) => (
            <div
              key={ch}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '6px 10px',
                background: 'var(--color-background-secondary)',
                borderRadius: 4,
                fontSize: 12,
              }}
            >
              <span style={{ flex: 1, fontWeight: 500, textTransform: 'capitalize' }}>
                {ch === 'airbnb2' ? 'Airbnb' : ch === 'bookingcom' ? 'Booking.com' : ch}
              </span>
              <span className="mono" style={{ color: 'var(--color-text-tertiary)' }}>
                {count} listing{count === 1 ? '' : 's'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TagTaxonomyCard() {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        AI tag taxonomy
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 10, lineHeight: 1.5 }}>
        Canonical tag set for chip rendering + trending-tag aggregation. Per-review tag extraction (AI) is the next slice; this list is the curated catalogue extraction targets.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {TAG_LIBRARY.map((t) => (
          <span
            key={t.tag}
            className="chip"
            style={{
              background: t.sentiment === 'positive' ? 'var(--color-bg-success)'
                : t.sentiment === 'negative' ? 'var(--color-bg-danger)'
                : 'var(--color-background-secondary)',
              color: t.sentiment === 'positive' ? 'var(--color-text-success)'
                : t.sentiment === 'negative' ? 'var(--color-text-danger)'
                : 'var(--color-text-secondary)',
              fontSize: 11,
            }}
          >
            {t.tag}
          </span>
        ))}
      </div>
    </div>
  );
}
