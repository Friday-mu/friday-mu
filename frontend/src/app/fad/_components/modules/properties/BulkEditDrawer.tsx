'use client';

import { useState } from 'react';
import {
  bulkSetLifecycle,
  bulkAddTag,
  bulkRemoveTag,
  allTags,
  PROPERTY_BY_ID,
  LIFECYCLE_LABEL,
  type LifecycleStatus,
} from '../../../_data/properties';
import { fireToast } from '../../Toaster';

interface Props {
  selectedIds: string[];
  onClose: () => void;
  onApplied: () => void;
}

type Mode = 'menu' | 'lifecycle' | 'add_tag' | 'remove_tag';

export function BulkEditDrawer({ selectedIds, onClose, onApplied }: Props) {
  const [mode, setMode] = useState<Mode>('menu');
  const count = selectedIds.length;
  const selectedNames = selectedIds.slice(0, 3).map((id) => PROPERTY_BY_ID[id]?.code ?? id).join(', ');

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>Bulk edit</h3>
          <button className="btn ghost sm" onClick={onClose}>Close</button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {count} {count === 1 ? 'property' : 'properties'} selected{count > 0 && `: ${selectedNames}${count > 3 ? ` and ${count - 3} more` : ''}`}
        </p>

        {mode === 'menu' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ActionButton label="Change lifecycle status" hint="Live · Paused · Off-boarded" onClick={() => setMode('lifecycle')} />
            <ActionButton label="Add tag" hint="Apply a label to all selected" onClick={() => setMode('add_tag')} />
            <ActionButton label="Remove tag" hint="Strip a tag from all selected" onClick={() => setMode('remove_tag')} />
          </div>
        )}

        {mode === 'lifecycle' && (
          <LifecycleStep
            count={count}
            onApply={(status, reason) => {
              const n = bulkSetLifecycle(selectedIds, status, reason);
              fireToast(`${n} ${n === 1 ? 'property' : 'properties'} → ${LIFECYCLE_LABEL[status]}`);
              onApplied();
              onClose();
            }}
            onBack={() => setMode('menu')}
          />
        )}

        {mode === 'add_tag' && (
          <TagStep
            kind="add"
            onApply={(tag) => {
              const n = bulkAddTag(selectedIds, tag);
              fireToast(`Tag "${tag}" added to ${n} ${n === 1 ? 'property' : 'properties'}`);
              onApplied();
              onClose();
            }}
            onBack={() => setMode('menu')}
          />
        )}

        {mode === 'remove_tag' && (
          <TagStep
            kind="remove"
            onApply={(tag) => {
              const n = bulkRemoveTag(selectedIds, tag);
              fireToast(`Tag "${tag}" removed from ${n} ${n === 1 ? 'property' : 'properties'}`);
              onApplied();
              onClose();
            }}
            onBack={() => setMode('menu')}
          />
        )}
      </div>
    </div>
  );
}

function ActionButton({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left', padding: '12px 14px',
        background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-primary)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{hint}</div>
    </button>
  );
}

function LifecycleStep({ count, onApply, onBack }: { count: number; onApply: (status: LifecycleStatus, reason?: string) => void; onBack: () => void }) {
  const [status, setStatus] = useState<LifecycleStatus>('paused');
  const [reason, setReason] = useState('');
  const isOffBoard = status === 'off_boarded';

  return (
    <div>
      <button className="btn ghost sm" onClick={onBack} style={{ marginBottom: 10 }}>← Back</button>
      <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 500 }}>Change lifecycle status</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {(['live', 'paused', 'off_boarded'] as LifecycleStatus[]).map((s) => (
          <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: 6, background: status === s ? 'rgba(var(--color-brand-accent-rgb, 86, 128, 202), 0.1)' : 'transparent', borderRadius: 'var(--radius-sm)' }}>
            <input type="radio" checked={status === s} onChange={() => setStatus(s)} />
            <span style={{ fontWeight: 500 }}>{LIFECYCLE_LABEL[s]}</span>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>
              {s === 'live' && '· clear pause / re-activate listings'}
              {s === 'paused' && '· block calendar · unlist on channels'}
              {s === 'off_boarded' && '· soft-delete · keep queryable'}
            </span>
          </label>
        ))}
      </div>

      {status === 'paused' && (
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Pause reason (optional, e.g. 'Renovation — bathroom + kitchen')"
          style={{ width: '100%', padding: '8px 10px', fontSize: 12, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', marginBottom: 12 }}
        />
      )}

      {isOffBoard && (
        <p style={{ margin: '0 0 12px', padding: 10, background: 'var(--color-bg-warning, rgba(255, 152, 0, 0.1))', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--color-text-warning, var(--color-text-primary))' }}>
          ⚠ Off-boarding {count} {count === 1 ? 'property' : 'properties'} requires owner notification, key return, SRL retrieval, and channel shutdown. This bulk action only flips the flag — manual follow-up required.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn ghost sm" onClick={onBack}>Cancel</button>
        <button className="btn primary sm" onClick={() => onApply(status, reason || undefined)}>
          Apply to {count}
        </button>
      </div>
    </div>
  );
}

function TagStep({ kind, onApply, onBack }: { kind: 'add' | 'remove'; onApply: (tag: string) => void; onBack: () => void }) {
  const existing = allTags();
  const [tag, setTag] = useState('');

  return (
    <div>
      <button className="btn ghost sm" onClick={onBack} style={{ marginBottom: 10 }}>← Back</button>
      <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 500 }}>{kind === 'add' ? 'Add tag' : 'Remove tag'}</h4>
      <input
        type="text"
        value={tag}
        onChange={(e) => setTag(e.target.value)}
        placeholder="Tag name"
        style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', marginBottom: 12 }}
      />
      {existing.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>Existing tags:</p>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {existing.map((t) => (
              <button
                key={t}
                onClick={() => setTag(t)}
                className="chip"
                style={{ cursor: 'pointer', border: 'none', fontSize: 11 }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn ghost sm" onClick={onBack}>Cancel</button>
        <button
          className="btn primary sm"
          onClick={() => onApply(tag.trim())}
          disabled={!tag.trim()}
          style={!tag.trim() ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
        >
          {kind === 'add' ? 'Add' : 'Remove'}
        </button>
      </div>
    </div>
  );
}
