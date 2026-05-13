'use client';

import { useEffect, useRef, useState } from 'react';
import { designClient, type DesignProject } from '../../../_data/design';
import { bumpFixtureRev } from '../../../_data/fixtureRev';
import { fireToast } from '../../Toaster';
import { useCurrentRole } from '../../usePermissions';

interface Props {
  project: DesignProject;
  /** Notify the parent so it can re-read the (mutated) project from the store. */
  onChange: () => void;
}

type ModalKind = 'pause' | 'cancel' | null;

/**
 * Friday-discretion lifecycle actions (Albion fallback decision):
 *  - active   → Pause | Cancel
 *  - paused   → Resume | Cancel
 *  - cancelled → no actions
 *
 * Director-only. Non-director users see the kebab but each action surfaces a
 * disabled tooltip explaining the gate.
 */
export function LifecycleMenu({ project, onChange }: Props) {
  const role = useCurrentRole();
  const isDirector = role === 'director';
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Click-outside-to-close.
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const ls = project.lifecycleStatus;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="Project actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 32,
          height: 32,
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-border-secondary)',
          background: open ? 'var(--color-background-tertiary)' : 'var(--color-background-primary)',
          color: 'var(--color-text-primary)',
          fontSize: 16,
          lineHeight: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: 200,
            background: 'var(--color-background-primary)',
            border: '0.5px solid var(--color-border-tertiary)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            zIndex: 30,
            overflow: 'hidden',
          }}
        >
          {ls === 'active' && (
            <>
              <MenuItem
                label="Pause project"
                description="Halt workflow; resume later."
                disabled={!isDirector}
                disabledReason="Director only."
                onClick={() => {
                  setOpen(false);
                  setModal('pause');
                }}
              />
              <Divider />
              <MenuItem
                label="Cancel project"
                description="Terminal — fee retained, items optionally to inventory."
                tone="danger"
                disabled={!isDirector}
                disabledReason="Director only."
                onClick={() => {
                  setOpen(false);
                  setModal('cancel');
                }}
              />
            </>
          )}
          {ls === 'paused' && (
            <>
              <MenuItem
                label="Resume project"
                description="Return workflow to active."
                disabled={!isDirector}
                disabledReason="Director only."
                onClick={() => {
                  if (!isDirector) return;
                  designClient.projects.resume(project.id, { byUserId: 'u-ishant' });
                  // Fan out: Design Overview list, sidebar counts, and
                  // any other surface reading from FIXTURE_PROJECTS
                  // re-renders on the next bump. Without this, only
                  // the local project shell sees the new state.
                  bumpFixtureRev();
                  fireToast('Project resumed');
                  setOpen(false);
                  onChange();
                }}
              />
              <Divider />
              <MenuItem
                label="Cancel project"
                description="Terminal — fee retained, items optionally to inventory."
                tone="danger"
                disabled={!isDirector}
                disabledReason="Director only."
                onClick={() => {
                  setOpen(false);
                  setModal('cancel');
                }}
              />
            </>
          )}
          {ls === 'cancelled' && (
            <div style={{ padding: 12, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Project is cancelled. No actions available.
            </div>
          )}
        </div>
      )}

      {modal === 'pause' && (
        <PauseModal
          onCancel={() => setModal(null)}
          onConfirm={(reason) => {
            designClient.projects.pause(project.id, { reason: reason || null, byUserId: 'u-ishant' });
            bumpFixtureRev();
            fireToast('Project paused');
            setModal(null);
            onChange();
          }}
        />
      )}
      {modal === 'cancel' && (
        <CancelModal
          onCancel={() => setModal(null)}
          onConfirm={(reason, transferToInventory, retainFee) => {
            designClient.projects.cancel(project.id, {
              reason,
              byUserId: 'u-ishant',
              transferToInventory,
              retainFee,
            });
            bumpFixtureRev();
            fireToast('Project cancelled');
            setModal(null);
            onChange();
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────── menu item primitive ───────────────────────────

function MenuItem({
  label,
  description,
  onClick,
  tone,
  disabled,
  disabledReason,
}: {
  label: string;
  description?: string;
  onClick: () => void;
  tone?: 'danger';
  disabled?: boolean;
  disabledReason?: string;
}) {
  const fg =
    disabled ? 'var(--color-text-tertiary)' :
    tone === 'danger' ? 'var(--color-text-danger, var(--color-text-warning))' :
    'var(--color-text-primary)';
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '10px 14px',
        background: 'transparent',
        color: fg,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
      {description && (
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{description}</span>
      )}
    </button>
  );
}

function Divider() {
  return <div style={{ height: 0.5, background: 'var(--color-border-tertiary)' }} />;
}

// ─────────────────────────── modals ───────────────────────────

function ModalShell({ title, onCancel, children }: { title: string; onCancel: () => void; children: React.ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          background: 'var(--color-background-primary)',
          borderRadius: 'var(--radius-md)',
          padding: 20,
          maxWidth: 480,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function PauseModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <ModalShell title="Pause project" onCancel={onCancel}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>
        Workflow halted. All data preserved. Resume any time. Reason is optional but recorded in the activity log.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        placeholder="Reason (optional, e.g. owner waiting on bank loan approval)"
        style={textareaStyle()}
      />
      <ActionRow>
        <button type="button" onClick={onCancel} style={secondaryBtn()}>Cancel</button>
        <button type="button" onClick={() => onConfirm(reason.trim())} style={primaryBtn()}>Pause project</button>
      </ActionRow>
    </ModalShell>
  );
}

function CancelModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (reason: string, transferToInventory: boolean, retainFee: boolean) => void;
}) {
  const [reason, setReason] = useState('');
  const [transferToInventory, setTransferToInventory] = useState(true);
  const [retainFee, setRetainFee] = useState(true);
  const valid = reason.trim().length >= 10;
  return (
    <ModalShell title="Cancel project" onCancel={onCancel}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>
        Terminal action. The project is closed and removed from the active queue. Friday discretion: choose how to handle the fee and any procured items.
      </p>
      <label style={fieldLabel()}>
        Reason (required, min 10 chars)
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="e.g. Owner unable to fund loan window; cancel per agreement §8."
          style={textareaStyle()}
        />
      </label>
      <label style={cb()}>
        <input
          type="checkbox"
          checked={retainFee}
          onChange={(e) => setRetainFee(e.target.checked)}
        />
        Retain Friday fee (design + procurement, per agreement)
      </label>
      <label style={cb()}>
        <input
          type="checkbox"
          checked={transferToInventory}
          onChange={(e) => setTransferToInventory(e.target.checked)}
        />
        Transfer procured items to Friday inventory
      </label>
      <ActionRow>
        <button type="button" onClick={onCancel} style={secondaryBtn()}>Cancel</button>
        <button
          type="button"
          onClick={() => valid && onConfirm(reason.trim(), transferToInventory, retainFee)}
          disabled={!valid}
          style={valid ? dangerBtn() : disabledBtn()}
          title={valid ? '' : 'Reason must be at least 10 characters.'}
        >
          Cancel project
        </button>
      </ActionRow>
    </ModalShell>
  );
}

// ─────────────────────────── style helpers ───────────────────────────

function ActionRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>{children}</div>;
}
function fieldLabel(): React.CSSProperties {
  return { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' };
}
function cb(): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-secondary)' };
}
function textareaStyle(): React.CSSProperties {
  return {
    width: '100%',
    padding: '8px 10px',
    fontSize: 12,
    borderRadius: 'var(--radius-sm)',
    border: '0.5px solid var(--color-border-secondary)',
    background: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
    resize: 'vertical',
    fontFamily: 'inherit',
  };
}
function primaryBtn(): React.CSSProperties {
  return {
    padding: '8px 16px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-brand-accent)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 500,
  };
}
function dangerBtn(): React.CSSProperties {
  return {
    padding: '8px 16px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-text-warning)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 500,
  };
}
function secondaryBtn(): React.CSSProperties {
  return {
    padding: '8px 16px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-background-tertiary)',
    color: 'var(--color-text-primary)',
    fontSize: 12,
  };
}
function disabledBtn(): React.CSSProperties {
  return { ...secondaryBtn(), color: 'var(--color-text-tertiary)', cursor: 'not-allowed' };
}
