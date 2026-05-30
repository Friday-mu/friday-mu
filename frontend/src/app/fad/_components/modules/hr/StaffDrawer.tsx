'use client';

import { useState } from 'react';
import { type TaskUser } from '../../../_data/tasks';
import { TASK_USER_BY_ID } from '../../../_data/tasks';
import { ROLE_LABEL } from '../../../_data/permissions';
import {
  createStaff as apiCreateStaff,
  updateStaff as apiUpdateStaff,
  staffToTaskUserLike,
  fixtureRoleToApi,
} from '../../../_data/hrClient';
import { fireToast } from '../../Toaster';
import { IconClose } from '../../icons';

type Mode = { kind: 'create' } | { kind: 'edit'; userId: string; initial?: Partial<TaskUser> };

interface Props {
  mode: Mode;
  onClose: () => void;
  onSaved: (user: TaskUser) => void;
}

const DAYS: Array<{ value: NonNullable<TaskUser['weeklyConstraints']>['neverWorks'] extends (infer U)[] | undefined ? U : never; label: string }> = [
  { value: 'monday', label: 'Mon' },
  { value: 'tuesday', label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday', label: 'Thu' },
  { value: 'friday', label: 'Fri' },
  { value: 'saturday', label: 'Sat' },
  { value: 'sunday', label: 'Sun' },
];

const SKILL_OPTIONS = [
  'cleaning', 'inspection', 'maintenance', 'plumbing', 'electrical', 'carpentry',
  'aircon', 'pool', 'garden', 'amenities', 'admin', 'guest_services', 'marketing',
];

export function StaffDrawer({ mode, onClose, onSaved }: Props) {
  // Prefer initial values handed in by the parent (live hr_staff record);
  // fall back to TASK_USER_BY_ID for legacy fixture-based callers.
  const existing: Partial<TaskUser> | undefined =
    mode.kind === 'edit' ? (mode.initial ?? TASK_USER_BY_ID[mode.userId]) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [role, setRole] = useState<TaskUser['role']>(existing?.role ?? 'field');
  const [homeZone, setHomeZone] = useState<'north' | 'west' | ''>(existing?.homeZone ?? '');
  const [skills, setSkills] = useState<string[]>(existing?.skills ?? []);
  const [neverWorks, setNeverWorks] = useState<string[]>(existing?.weeklyConstraints?.neverWorks ?? []);
  const [notificationChannel, setNotificationChannel] = useState<TaskUser['notificationChannel']>(existing?.notificationChannel ?? 'fad_inbox');
  const [startDate, setStartDate] = useState(existing?.startDate ?? '2026-04-27');
  const [endDate, setEndDate] = useState(existing?.endDate ?? '');

  const toggleSkill = (s: string) => {
    setSkills((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const toggleDay = (d: string) => {
    setNeverWorks((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const submit = async () => {
    // Map drawer form to the FAD HR API shape. Skills / weeklyConstraints /
    // notificationChannel aren't in the API schema yet — they're dropped on
    // create; the detail page surfaces them as undefined. Extending the
    // hr_staff schema with those columns is a follow-up slice.
    const apiPayload = {
      name,
      email: email || undefined,
      role: fixtureRoleToApi(role),
      zone: homeZone || undefined,
      hire_date: startDate || undefined,
    };

    try {
      let saved;
      if (mode.kind === 'create') {
        saved = await apiCreateStaff(apiPayload);
        fireToast(`Staff added · ${saved.name}`);
      } else {
        saved = await apiUpdateStaff(mode.userId, apiPayload);
        fireToast(`Staff updated · ${saved.name}`);
      }
      onSaved(staffToTaskUserLike(saved));
    } catch (e) {
      fireToast(`Save failed · ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  };

  return (
    <>
      <div className="fad-drawer-overlay open" onClick={onClose} />
      <aside className="fad-drawer open" style={{ maxWidth: 520 }}>
        <div className="fad-drawer-header">
          <div className="fad-drawer-title">
            {mode.kind === 'create' ? 'Add staff' : `Edit · ${existing?.name}`}
          </div>
          <button className="fad-util-btn" onClick={onClose} title="Close" style={{ marginLeft: 'auto' }}>
            <IconClose />
          </button>
        </div>
        <div className="fad-drawer-body" style={{ padding: 16 }}>
          <Field label="Name">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </Field>
          <Field label="Email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@friday.mu" />
          </Field>
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value as TaskUser['role'])}>
              {(['director', 'commercial_marketing', 'ops_manager', 'field', 'external'] as const).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
          {role === 'field' && (
            <Field label="Home zone">
              <select value={homeZone} onChange={(e) => setHomeZone(e.target.value as 'north' | 'west' | '')}>
                <option value="">No zone (flex)</option>
                <option value="north">North</option>
                <option value="west">West</option>
              </select>
            </Field>
          )}
          <Field label="Skills">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {SKILL_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={'inbox-chip' + (skills.includes(s) ? ' active' : '')}
                  onClick={() => toggleSkill(s)}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Never works (weekly constraints)">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {DAYS.map((d) => (
                <button
                  key={d.value as string}
                  type="button"
                  className={'inbox-chip' + (neverWorks.includes(d.value as string) ? ' active' : '')}
                  onClick={() => toggleDay(d.value as string)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Notification channel">
            <select value={notificationChannel} onChange={(e) => setNotificationChannel(e.target.value as TaskUser['notificationChannel'])}>
              <option value="fad_inbox">FAD Inbox</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="slack">Slack</option>
              <option value="print_only">Print only</option>
            </select>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Start date">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="End date (optional)">
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
          {mode.kind === 'edit' && endDate && existing?.endDate !== endDate && (
            <div
              style={{
                padding: 10,
                marginBottom: 12,
                background: 'var(--color-background-secondary)',
                borderLeft: '3px solid var(--color-text-warning)',
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              After {endDate}, this staff member won't appear in roster drafts or task assignments.
              Open tasks will need reassignment from the Staff detail page.
            </div>
          )}

          <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={submit} disabled={!name.trim()}>
              {mode.kind === 'create' ? 'Add staff' : 'Save changes'}
            </button>
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
