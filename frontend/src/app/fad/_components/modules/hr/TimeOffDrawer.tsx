'use client';

import { useState } from 'react';
import { TASK_USER_BY_ID, TASK_USERS } from '../../../_data/tasks';
import { type TimeOffRequest } from '../../../_data/timeOff';
import { submitTimeOffRequest, apiRequestToFixtureShape } from '../../../_data/hrClient';
import { useCurrentUserId } from '../../usePermissions';
import { fireToast } from '../../Toaster';
import { IconClose } from '../../icons';

type Mode = { kind: 'new' } | { kind: 'detail'; id: string };

interface Props {
  mode: Mode;
  canApprove: boolean;
  onClose: () => void;
  onSaved: (req: TimeOffRequest) => void;
}

export function TimeOffDrawer({ mode, canApprove, onClose, onSaved }: Props) {
  void canApprove;
  const currentUserId = useCurrentUserId();
  const me = TASK_USER_BY_ID[currentUserId];

  const [userId, setUserId] = useState(currentUserId);
  const [startDate, setStartDate] = useState('2026-05-04');
  const [endDate, setEndDate] = useState('2026-05-04');
  const [type, setType] = useState<TimeOffRequest['type']>('annual');
  const [reason, setReason] = useState('');

  const submit = async () => {
    // userId field is decorative in the live API — the backend resolves
    // staff_id from the JWT, so users submit only for themselves. Selecting
    // a different user in the dropdown is ignored server-side.
    try {
      const apiType = type === 'personal' ? 'other' : type;
      const req = await submitTimeOffRequest({
        start_date: startDate,
        end_date: endDate,
        type: apiType as 'annual' | 'sick' | 'unpaid' | 'family' | 'other',
        reason: reason || undefined,
      });
      fireToast(`Time-off request submitted · ${startDate} → ${endDate}`);
      onSaved(apiRequestToFixtureShape(req));
    } catch (e) {
      fireToast(`Submit failed · ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  };

  if (mode.kind !== 'new') return null;

  return (
    <>
      <div className="fad-drawer-overlay open" onClick={onClose} />
      <aside className="fad-drawer open" style={{ maxWidth: 460 }}>
        <div className="fad-drawer-header">
          <div className="fad-drawer-title">New time-off request</div>
          <button className="fad-util-btn" onClick={onClose} title="Close" style={{ marginLeft: 'auto' }}>
            <IconClose />
          </button>
        </div>
        <div className="fad-drawer-body" style={{ padding: 16 }}>
          <Field label="For">
            <select value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value={currentUserId}>{me?.name ?? 'Me'} (self)</option>
              {TASK_USERS.filter((u) => u.id !== currentUserId && u.role !== 'external').map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Start date">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="End date">
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value as TimeOffRequest['type'])}>
              <option value="annual">Annual leave</option>
              <option value="sick">Sick leave</option>
              <option value="personal">Personal</option>
            </select>
          </Field>
          <Field label="Reason (optional)">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Anything the reviewer should know…"
              style={{ width: '100%', minHeight: 60, fontFamily: 'inherit' }}
            />
          </Field>
          <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={submit}
              disabled={!startDate || !endDate || endDate < startDate}
            >
              Submit request
            </button>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            Self-requests don't auto-approve — they go to Director or Ops Manager for review.
          </div>
        </div>
      </aside>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label
      style={{
        display: 'block',
        marginBottom: 12,
        fontSize: 11,
        color: 'var(--color-text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {label}
      <div style={{ marginTop: 4, textTransform: 'none' }}>{children}</div>
    </label>
  );
}
