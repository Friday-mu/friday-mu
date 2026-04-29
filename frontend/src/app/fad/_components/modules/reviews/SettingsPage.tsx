'use client';

import { useState } from 'react';
import { CHANNEL_LABEL, TAG_LIBRARY, type ReviewChannel } from '../../../_data/reviews';
import { fireToast } from '../../Toaster';

export function SettingsPage() {
  // @demo:config — Channel subscriptions, auto-publish threshold (5 min), and low-activity window
  // (90 days) are hardcoded defaults. Replace with GET /api/reviews/settings returning per-tenant
  // channel subscriptions and review policy config. Tag: PROD-CONFIG-6.
  const [channelSubs, setChannelSubs] = useState<Record<ReviewChannel, boolean>>({
    airbnb: true, booking: true, vrbo: true, google: true, direct: false,
  });
  const [autoPublishMin, setAutoPublishMin] = useState(5);
  const [lowActivityDays, setLowActivityDays] = useState(90);
  // @demo:data — Tag: PROD-DATA-49 — see frontend/DEMO_CRUFT.md
  // Hardcoded masked API keys + integration sync stats. Replace with
  // GET /api/integrations/{guesty,breezeway}/status returning real values.
  const [guestyApiKey, setGuestyApiKey] = useState('••••••••••••gst_8f2a');
  const [breezewayApiKey, setBreezewayApiKey] = useState('••••••••••••brz_4d91');

  const toggleChannel = (ch: ReviewChannel) => {
    setChannelSubs((prev) => ({ ...prev, [ch]: !prev[ch] }));
    fireToast(`${CHANNEL_LABEL[ch]} subscription ${!channelSubs[ch] ? 'enabled' : 'disabled'}`);
  };

  return (
    <div className="fad-module-body">
      {/* Guesty + Breezeway integration */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Integrations
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12, lineHeight: 1.5 }}>
          Reviews are pulled directly from Guesty (per-channel feeds) and joined to Breezeway tasks for staff attribution. No Reva dependency.
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Guesty API key</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={guestyApiKey}
              onChange={(e) => setGuestyApiKey(e.target.value)}
              style={{ flex: 1, padding: '6px 10px', fontSize: 12, fontFamily: 'var(--font-mono-fad)' }}
            />
            <button className="btn ghost sm" onClick={() => fireToast('Guesty connection test · stub')}>Test</button>
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Breezeway API key</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={breezewayApiKey}
              onChange={(e) => setBreezewayApiKey(e.target.value)}
              style={{ flex: 1, padding: '6px 10px', fontSize: 12, fontFamily: 'var(--font-mono-fad)' }}
            />
            <button className="btn ghost sm" onClick={() => fireToast('Breezeway connection test · stub')}>Test</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, fontSize: 12 }}>
          <Stat label="Last sync · Guesty" value="2 minutes ago" />
          <Stat label="Last sync · Breezeway" value="6 minutes ago" />
          <Stat label="Last error" value="None · 7d" />
          <Stat label="Reviews today" value="3" />
        </div>
      </div>

      {/* Channel subscriptions */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Channel subscriptions
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12, lineHeight: 1.5 }}>
          Channels enabled here pull through Guesty into the Reviews module. Direct-booking review collection is owned by the Marketing module's website widget pipeline (Phase 2+).
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(['airbnb', 'booking', 'vrbo', 'google', 'direct'] as const).map((ch) => (
            <div key={ch} style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', background: 'var(--color-background-secondary)', borderRadius: 4 }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{CHANNEL_LABEL[ch]}</span>
              {ch === 'direct' && (
                <span className="chip" style={{ background: 'var(--color-bg-warning)', color: 'var(--color-text-warning)', fontSize: 10, marginRight: 8 }}>
                  Marketing-owned
                </span>
              )}
              <button
                className={'inbox-chip' + (channelSubs[ch] ? ' active' : '')}
                onClick={() => toggleChannel(ch)}
                disabled={ch === 'direct'}
              >
                {channelSubs[ch] ? 'On' : 'Off'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Auto-publish threshold */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Auto-publish threshold
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12, lineHeight: 1.5 }}>
          When ON, reviews at or above the threshold auto-publish to friday.mu's website widget pipeline (Marketing module). Lower-rated reviews stay internal-only until reviewed.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ fontSize: 12 }}>Reviews ≥</label>
          <input
            type="number" min={1} max={5} step={0.5}
            value={autoPublishMin}
            onChange={(e) => setAutoPublishMin(parseFloat(e.target.value))}
            style={{ width: 60, padding: '4px 8px', fontSize: 12 }}
          />
          <span style={{ fontSize: 12 }}>stars are auto-published</span>
        </div>
      </div>

      {/* Low-activity threshold */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Low-activity threshold
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12, lineHeight: 1.5 }}>
          Properties with no reviews in this window are flagged on the Overview anomaly strip.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ fontSize: 12 }}>Flag if no reviews in</label>
          <input
            type="number" min={30} max={365} step={30}
            value={lowActivityDays}
            onChange={(e) => setLowActivityDays(parseInt(e.target.value))}
            style={{ width: 70, padding: '4px 8px', fontSize: 12 }}
          />
          <span style={{ fontSize: 12 }}>days</span>
        </div>
      </div>

      {/* AI tag taxonomy */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          AI tag taxonomy
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12, lineHeight: 1.5 }}>
          Canonical tag set used for chip rendering and trending-tag aggregation. New tags can still appear on individual reviews — this is the curated catalogue, not a hard schema.
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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
      <div className="mono" style={{ fontSize: 13 }}>{value}</div>
    </div>
  );
}
