'use client';

import { useState } from 'react';
import {
  TASK_PROPERTIES,
  SUBDEPT_BY_DEPT,
  type Department,
  type Subdepartment,
  type Task,
  type TaskPriority,
  type TaskSource,
} from '../../../_data/tasks';
import { createTask } from '../../../_data/tasksClient';
import { useTenantUsers } from '../../../_data/useTenantUsers';
import { useCurrentUserId } from '../../usePermissions';
import { fireToast } from '../../Toaster';
import { IconClose, IconSparkle } from '../../icons';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (task: Task) => void;
  /** Optional pre-fill from inbox AI / group email AI / reservation flow. */
  prefill?: Partial<{
    title: string;
    description: string;
    propertyCode: string;
    department: Department;
    subdepartment: Subdepartment;
    priority: TaskPriority;
    assigneeIds: string[];
    inboxThreadId: string;
    groupEmailId: string;
    reservationId: string;
    source: TaskSource;
  }>;
}

const DEPARTMENTS: Department[] = ['cleaning', 'inspection', 'maintenance', 'office'];
const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low', 'lowest'];

export function CreateTaskDrawer({ open, onClose, onCreated, prefill }: Props) {
  const currentUserId = useCurrentUserId();
  const [nl, setNl] = useState('');
  const [title, setTitle] = useState(prefill?.title ?? '');
  const [description, setDescription] = useState(prefill?.description ?? '');
  const [propertyCode, setPropertyCode] = useState(prefill?.propertyCode ?? 'OFFICE');
  const [department, setDepartment] = useState<Department>(prefill?.department ?? 'office');
  const [subdepartment, setSubdepartment] = useState<Subdepartment>(prefill?.subdepartment ?? 'admin');
  const [priority, setPriority] = useState<TaskPriority>(prefill?.priority ?? 'medium');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(prefill?.assigneeIds ?? []);
  const [dueDate, setDueDate] = useState('2026-04-28');

  const subOptions = SUBDEPT_BY_DEPT[department];
  const { users: tenantUsers } = useTenantUsers();
  const candidateAssignees = tenantUsers.filter((u) => u.role !== 'external' && u.active);

  const parseNl = () => {
    if (!nl.trim()) return;
    // @demo:logic — Tag: PROD-LOGIC-4 — see frontend/DEMO_CRUFT.md
    // Replace with: POST /api/intent/parse-task (real LLM intent endpoint).
    // Phase 1: regex-based intent parsing. Phase 2 swaps to real LLM.
    const text = nl.toLowerCase();

    // Property code: 2-3 alphas + optional dash + 1-3 alphanumerics.
    const propMatch = nl.match(/\b([A-Z]{2,4}-\w{1,3})\b/);
    if (propMatch) setPropertyCode(propMatch[1].toUpperCase());

    // Department guess
    if (/\bclean\b|\bturnover\b|\blinen\b|\bdeep\b/.test(text)) {
      setDepartment('cleaning');
      setSubdepartment(/\bdeep\b/.test(text) ? 'deep_clean' : 'standard_clean');
    } else if (/\binspection\b|\binspect\b|\bpre-arrival\b/.test(text)) {
      setDepartment('inspection');
      setSubdepartment('pre_arrival');
    } else if (/\bplumbing\b|\bleak\b|\bsink\b|\btoilet\b/.test(text)) {
      setDepartment('maintenance');
      setSubdepartment('plumbing');
    } else if (/\bac\b|\baircon\b|\bcooling\b/.test(text)) {
      setDepartment('maintenance');
      setSubdepartment('aircon');
    } else if (/\bgarden\b|\bhedge\b|\blawn\b/.test(text)) {
      setDepartment('maintenance');
      setSubdepartment('garden');
    } else if (/\bpool\b/.test(text)) {
      setDepartment('maintenance');
      setSubdepartment('pool');
    }

    // Priority guess
    if (/\burgent\b|\bnow\b|\basap\b/.test(text)) setPriority('urgent');
    else if (/\bhigh\b|\bsoon\b|\btoday\b/.test(text)) setPriority('high');

    // Date guess (very rough)
    if (/\btomorrow\b/.test(text)) setDueDate('2026-04-28');
    else if (/\btoday\b/.test(text)) setDueDate('2026-04-27');
    else if (/\bweek\b/.test(text)) setDueDate('2026-05-03');

    // Title: use the NL text capped, capitalized
    setTitle(nl.charAt(0).toUpperCase() + nl.slice(1, 90));
    fireToast('Form pre-filled from your description · review and submit');
  };

  const submit = async () => {
    const task = await createTask({
      title,
      description,
      propertyCode,
      department,
      subdepartment,
      priority,
      source: prefill?.source ?? 'manual',
      assigneeIds,
      requesterId: currentUserId,
      dueDate,
      inboxThreadId: prefill?.inboxThreadId,
      groupEmailId: prefill?.groupEmailId,
      reservationId: prefill?.reservationId,
    });
    onCreated(task);
    fireToast('Task created · would push to Breezeway');
  };

  const toggleAssignee = (id: string) => {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  if (!open) return null;
  return (
    <>
      <div className="fad-drawer-overlay open" onClick={onClose} />
      <aside className="fad-drawer open" style={{ maxWidth: 520 }}>
        <div className="fad-drawer-header">
          <div className="fad-drawer-title">{prefill ? 'Review & create task' : 'New task'}</div>
          <button className="fad-util-btn" onClick={onClose} title="Close" style={{ marginLeft: 'auto' }}>
            <IconClose />
          </button>
        </div>
        <div className="fad-drawer-body" style={{ padding: 16 }}>
          {!prefill && (
            <div style={{ marginBottom: 14, padding: 12, background: 'var(--color-brand-accent-softer)', borderRadius: 6, borderLeft: '3px solid var(--color-brand-accent)' }}>
              <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 6, color: 'var(--color-brand-accent)' }}>
                <IconSparkle size={11} /> Describe the task — AI fills the form
              </div>
              <textarea
                value={nl}
                onChange={(e) => setNl(e.target.value)}
                placeholder="e.g. urgent AC repair at LB-2 tomorrow morning"
                style={{ width: '100%', minHeight: 50, fontSize: 13, fontFamily: 'inherit', padding: 8 }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                <button className="btn ghost sm" onClick={parseNl} disabled={!nl.trim()}>
                  Parse → fill form
                </button>
              </div>
            </div>
          )}

          <Field label="Title">
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short title" />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What needs to happen?"
              style={{ minHeight: 60 }}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Property">
              <select value={propertyCode} onChange={(e) => setPropertyCode(e.target.value)}>
                {TASK_PROPERTIES.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Department">
              <select
                value={department}
                onChange={(e) => {
                  const d = e.target.value as Department;
                  setDepartment(d);
                  setSubdepartment(SUBDEPT_BY_DEPT[d][0]);
                }}
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sub-department">
              <select value={subdepartment} onChange={(e) => setSubdepartment(e.target.value as Subdepartment)}>
                {subOptions.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Due date">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>

          <Field label="Assignees">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {candidateAssignees.map((u) => {
                const selected = assigneeIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    className={'inbox-chip' + (selected ? ' active' : '')}
                    onClick={() => toggleAssignee(u.id)}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        width: 14,
                        height: 14,
                        borderRadius: 7,
                        background: u.avatarColor,
                        color: 'white',
                        fontSize: 9,
                        textAlign: 'center',
                        lineHeight: '14px',
                        marginRight: 4,
                      }}
                    >
                      {u.initials}
                    </span>
                    {u.name.split(' ')[0]}
                  </button>
                );
              })}
            </div>
          </Field>

          <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={submit} disabled={!title.trim()}>
              Create task
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
