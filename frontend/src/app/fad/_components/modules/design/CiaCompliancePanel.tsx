'use client';

// CIA Mauritius compliance panel. Construction Industry Authority Act
// 2023 requires registration for projects above Rs 1M EPC or any T1
// renovation. The research handover (interior-design-best-practices.md)
// flagged this as a hidden legal landmine — Friday was operating
// without surfacing it. The team can be fined or blocked from execution
// if they skip the check.
//
// Surface logic:
//   • required + status='unknown' → red banner: "Required, not started"
//   • required + status='pending' → amber banner: "Application submitted"
//   • required + status='registered' → green banner with ref number
//   • not required → muted "Not required — small-scale furnishing"
//   • The status enum is on the project row (migration 027); staff
//     update it via the inline form. cia_notes is appended on each
//     transition for the audit trail.

import { useEffect, useState } from 'react';
import { designClient, PROJECTS as FIXTURE_PROJECTS, type DesignProject } from '../../../_data/design';
import { updateProject, loadProject, apiProjectToFixture, type ApiProject } from '../../../_data/designClient';
import { bumpFixtureRev } from '../../../_data/fixtureRev';
import { fireToast } from '../../Toaster';

interface Props {
  project: DesignProject;
}

// Threshold per the Construction Industry Authority (Application of Act)
// Regulations 2023: works valued at or above Rs 1 million.
const CIA_THRESHOLD_MUR = 1_000_000;
const CIA_THRESHOLD_MINOR = CIA_THRESHOLD_MUR * 100;

type CiaStatus = NonNullable<ApiProject['cia_registration_status']>;

export function requiresCiaRegistration(project: DesignProject): {
  required: boolean;
  reason: string;
} {
  // T1 = renovation work, always triggers regardless of value.
  if (project.tier === 1) {
    return { required: true, reason: 'Tier 1 (renovation) — CIA registration mandatory regardless of EPC.' };
  }
  // T2-renovation classified projects above the threshold.
  if (project.tier === 2 && project.classification === 'renovation' && (project.epcMinor ?? 0) >= CIA_THRESHOLD_MINOR) {
    return { required: true, reason: `Tier 2 renovation with EPC ≥ Rs ${CIA_THRESHOLD_MUR.toLocaleString()}.` };
  }
  // Any project above the threshold value, irrespective of tier.
  if ((project.epcMinor ?? 0) >= CIA_THRESHOLD_MINOR) {
    return { required: true, reason: `EPC ≥ Rs ${CIA_THRESHOLD_MUR.toLocaleString()} crosses the CIA threshold (Construction Industry Authority Act 2023, Sched. 1).` };
  }
  // Mixed classification at any value: caution — flag for legal review.
  if (project.classification === 'mixed') {
    return { required: true, reason: 'Mixed classification — confirm with CIA whether the renovation portion of scope is above the threshold.' };
  }
  return { required: false, reason: 'Furnishing-only project below the Rs 1M threshold.' };
}

function statusLabel(s: CiaStatus): string {
  switch (s) {
    case 'unknown': return 'Not yet evaluated';
    case 'not_required': return 'Not required';
    case 'pending': return 'Application submitted, awaiting registration';
    case 'registered': return 'Registered';
    case 'exempt': return 'Exempted (rationale logged)';
  }
}

function statusTone(s: CiaStatus, required: boolean): { bg: string; fg: string; border: string } {
  if (s === 'registered') return { bg: 'var(--color-bg-success)', fg: 'var(--color-text-success)', border: 'var(--color-text-success)' };
  if (s === 'pending') return { bg: 'var(--color-bg-warning)', fg: 'var(--color-text-warning)', border: 'var(--color-text-warning)' };
  if (s === 'not_required' || s === 'exempt') return { bg: 'var(--color-background-tertiary)', fg: 'var(--color-text-tertiary)', border: 'var(--color-border-tertiary)' };
  // 'unknown' — red if required, neutral otherwise.
  if (required) return { bg: 'var(--color-bg-danger)', fg: 'var(--color-text-danger)', border: 'var(--color-text-danger)' };
  return { bg: 'var(--color-background-tertiary)', fg: 'var(--color-text-tertiary)', border: 'var(--color-border-tertiary)' };
}

// Wave C2: reads prefer regionalCompliance JSONB (migration 043) and
// fall back to the legacy top-level cia_* fields for older API rows.
function readCiaState(project: DesignProject): { status: CiaStatus; ref: string; notes: string } {
  const rc = (project as DesignProject & { regionalCompliance?: Record<string, unknown> }).regionalCompliance ?? {};
  const legacy = project as DesignProject & {
    ciaRegistrationStatus?: CiaStatus;
    ciaRegistrationRef?: string | null;
    ciaNotes?: string | null;
  };
  return {
    status: (rc.cia_registration_status as CiaStatus | undefined) ?? legacy.ciaRegistrationStatus ?? 'unknown',
    ref:    ((rc.cia_registration_ref    as string | null | undefined) ?? legacy.ciaRegistrationRef ?? '') as string,
    notes:  ((rc.cia_notes               as string | null | undefined) ?? legacy.ciaNotes ?? '') as string,
  };
}

export function CiaCompliancePanel({ project }: Props) {
  const { required, reason } = requiresCiaRegistration(project);
  const initial = readCiaState(project);
  const [status, setStatus] = useState<CiaStatus>(initial.status);
  const [refNum, setRefNum] = useState<string>(initial.ref);
  const [notes, setNotes] = useState<string>(initial.notes);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  // Sync from project changes if the parent re-fetches.
  useEffect(() => {
    const next = readCiaState(project);
    setStatus(next.status);
    setRefNum(next.ref);
    setNotes(next.notes);
  }, [project.id]);

  const tone = statusTone(status, required);

  const handleSave = async () => {
    // Force registered → must have ref.
    if (status === 'registered' && !refNum.trim()) {
      fireToast('Registration reference is required for "Registered" status.');
      return;
    }
    if (status === 'exempt' && !notes.trim()) {
      fireToast('Notes are required when marking exempt — document the rationale.');
      return;
    }
    setSaving(true);
    try {
      const stampedNotes = notes.trim()
        ? `${notes.trim()}\n[${new Date().toISOString().slice(0, 10)}] Status set to ${status}`
        : `[${new Date().toISOString().slice(0, 10)}] Status set to ${status}`;
      // Wave C2: dual-write — populate both regional_compliance (the
      // new home, migration 043) and the legacy top-level cia_* fields
      // until the backfill rollout completes and we drop the legacy
      // columns in a future migration.
      const existingRc =
        ((project as DesignProject & { regionalCompliance?: Record<string, unknown> }).regionalCompliance) ?? {};
      await updateProject(project.id, {
        cia_registration_status: status,
        cia_registration_ref: refNum.trim() || null,
        cia_notes: stampedNotes,
        regional_compliance: {
          ...existingRc,
          cia_registration_status: status,
          cia_registration_ref: refNum.trim() || null,
          cia_notes: stampedNotes,
        },
      });
      // Refetch + splice the project row into FIXTURE_PROJECTS so the
      // Design Overview "Needs attention" dashboard, project list
      // filters, and any other surface reading from designClient.projects
      // refreshes on the next fixtureRev bump. Replaces the previous
      // in-place fixture mutation which only worked for callers holding
      // the same object reference.
      try {
        const refreshedApi = await loadProject(project.id);
        const refreshed = apiProjectToFixture(refreshedApi);
        const idx = FIXTURE_PROJECTS.findIndex((p) => p.id === project.id);
        if (idx >= 0) FIXTURE_PROJECTS.splice(idx, 1, refreshed);
        else FIXTURE_PROJECTS.push(refreshed);
      } catch {
        /* tolerate refetch failure — next hydration catches up */
      }
      setNotes(stampedNotes);
      bumpFixtureRev();
      setEditing(false);
      fireToast(`CIA compliance status saved: ${statusLabel(status)}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fireToast(`Save failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-cia-compliance-panel
      style={{
        background: tone.bg,
        border: `0.5px solid ${tone.border}`,
        borderRadius: 'var(--radius-md)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: tone.fg }}>
            CIA Mauritius compliance
            {required && (status === 'unknown' || status === 'pending') && ' ⚠'}
            {status === 'registered' && ' ✓'}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            {reason}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          data-cia-edit-toggle
          style={{
            padding: '4px 10px',
            fontSize: 11,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-background-primary)',
            border: '0.5px solid var(--color-border-secondary)',
            color: 'var(--color-text-primary)',
            cursor: 'pointer',
          }}
        >
          {editing ? 'Cancel' : 'Update status'}
        </button>
      </div>

      <div style={{ fontSize: 12, color: tone.fg, fontWeight: 500 }}>
        Status: {statusLabel(status)}
        {refNum && status === 'registered' && (
          <>
            {' · '}
            <code style={{ fontFamily: 'var(--font-mono-fad)' }}>{refNum}</code>
          </>
        )}
      </div>

      {editing && (
        <div
          data-cia-edit-form
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 10,
            background: 'var(--color-background-primary)',
            border: '0.5px solid var(--color-border-secondary)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as CiaStatus)}
              disabled={saving}
              data-cia-status-select
              style={{ ...inputStyle(), marginTop: 4 }}
            >
              <option value="unknown">Unknown — not yet evaluated</option>
              <option value="not_required">Not required (below threshold + no renovation scope)</option>
              <option value="pending">Pending — application submitted</option>
              <option value="registered">Registered — CIA cert received</option>
              <option value="exempt">Exempt — rationale documented</option>
            </select>
          </label>
          {(status === 'registered' || status === 'pending') && (
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              Registration reference{status === 'registered' ? ' (required)' : ' (optional, pending application no.)'}
              <input
                value={refNum}
                onChange={(e) => setRefNum(e.target.value)}
                placeholder="e.g. CIA/REG/2026/00125"
                disabled={saving}
                data-cia-ref-input
                style={{ ...inputStyle(), marginTop: 4 }}
              />
            </label>
          )}
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            Notes / audit trail
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={status === 'exempt' ? 'Required for exempt — document why this project is exempt.' : 'Append context for the status change.'}
              disabled={saving}
              data-cia-notes-input
              style={{ ...inputStyle(), marginTop: 4, resize: 'vertical' }}
            />
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              data-cia-save
              style={{
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-brand-accent)',
                color: '#fff',
                border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.5 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%',
    padding: '6px 10px',
    fontSize: 12,
    borderRadius: 'var(--radius-sm)',
    border: '0.5px solid var(--color-border-secondary)',
    background: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
  };
}
