'use client';

import { useState } from 'react';
import {
  LISTING_CHANNEL_LABEL,
  preflightChannelPush,
  pushListingToChannel,
  type ListingChannel,
  type Property,
} from '../../../_data/properties';
import { fireToast } from '../../Toaster';

interface Props {
  property: Property;
  channel: ListingChannel;
  /** True if this would create a new listing (no existing record for this channel). */
  isCreateNew: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'preflight' | 'push' | 'done';

export function ListingPushFlow({ property, channel, isCreateNew, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('preflight');
  const [result, setResult] = useState<string | null>(null);
  const issues = preflightChannelPush(property, channel);
  const channelLabel = LISTING_CHANNEL_LABEL[channel];

  const doPush = () => {
    setStep('push');
    // Simulate API latency for the demo
    setTimeout(() => {
      const r = pushListingToChannel(property.id, channel);
      setResult(r.message);
      setStep('done');
      if (r.ok) {
        fireToast(r.message);
      }
    }, 800);
  };

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
        className="card"
        style={{ width: 480, maxWidth: '95vw', padding: 22 }}
      >
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 500 }}>
          {isCreateNew ? `Create listing on ${channelLabel}` : `Push update to ${channelLabel}`}
        </h3>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {property.code} · {property.name}
        </p>

        {step === 'preflight' && (
          <PreflightStep
            issues={issues}
            isCreateNew={isCreateNew}
            channelLabel={channelLabel}
            onCancel={onClose}
            onContinue={doPush}
          />
        )}

        {step === 'push' && (
          <div style={{ padding: '20px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>↑</div>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              {isCreateNew ? `Creating listing on ${channelLabel}...` : `Pushing update to ${channelLabel}...`}
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              · Phase 2 write-through · Guesty API call simulated ·
            </p>
          </div>
        )}

        {step === 'done' && (
          <div style={{ padding: '12px 0' }}>
            <div style={{ fontSize: 24, marginBottom: 8, color: 'var(--color-text-success)' }}>✓</div>
            <p style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{result}</p>
            <p style={{ margin: '6px 0 12px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Activity logged · listing visible to channel within ~5 minutes.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn primary sm" onClick={() => { onSuccess(); onClose(); }}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PreflightStep({
  issues, isCreateNew, channelLabel, onCancel, onContinue,
}: {
  issues: string[];
  isCreateNew: boolean;
  channelLabel: string;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const blocked = issues.length > 0;
  return (
    <div>
      <h4 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-tertiary)' }}>
        Preflight
      </h4>
      {blocked ? (
        <div>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-warning)' }}>
            Cannot push to {channelLabel} — {issues.length} issue{issues.length === 1 ? '' : 's'} to fix:
          </p>
          <ul style={{ margin: '0 0 14px', padding: '0 0 0 20px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            {issues.map((iss, i) => <li key={i} style={{ marginBottom: 4 }}>{iss}</li>)}
          </ul>
        </div>
      ) : (
        <div>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-success)' }}>
            ✓ All preflight checks passed.
          </p>
          <ul style={{ margin: '0 0 14px', padding: '0 0 0 20px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            <li>Photos + hero present</li>
            <li>Base price set</li>
            <li>Lifecycle: live</li>
            {isCreateNew && <li>Will create new listing on {channelLabel}</li>}
            {!isCreateNew && <li>Will update existing listing on {channelLabel}</li>}
          </ul>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn ghost sm" onClick={onCancel}>Cancel</button>
        <button
          className="btn primary sm"
          onClick={onContinue}
          disabled={blocked}
          style={blocked ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
        >
          {isCreateNew ? `Push to ${channelLabel}` : `Update ${channelLabel}`}
        </button>
      </div>
    </div>
  );
}
