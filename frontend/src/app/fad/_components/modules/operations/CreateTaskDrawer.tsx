'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  TASK_PROPERTIES,
  TASK_USERS,
  TASK_USER_BY_ID,
  SUBDEPT_BY_DEPT,
  type Department,
  type Subdepartment,
  type Task,
  type TaskPriority,
  type TaskSource,
} from '../../../_data/tasks';
import { createTask } from '../../../_data/tasksClient';
import { useCurrentUserId, usePermissions } from '../../usePermissions';
import { fireToast } from '../../Toaster';
import { IconClose, IconPlus, IconSparkle } from '../../icons';

export type CreateTaskMode = 'manager_schedule' | 'field_standalone_issue' | 'assigned_issue';

export type CreateTaskPrefill = Partial<{
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
  dueDate: string;
  dueTime: string;
  estimatedMinutes: number;
  template: string;
  tags: string[];
  category: string;
  externalRef: string;
}>;

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (task: Task) => void;
  mode?: CreateTaskMode;
  /** Assigned-task issue reporting inherits safe context from this source task. */
  sourceTask?: Task;
  /** Optional pre-fill from inbox AI / group email AI / reservation flow. */
  prefill?: CreateTaskPrefill;
}

const DEPARTMENTS: Department[] = ['cleaning', 'inspection', 'maintenance', 'office'];
const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low', 'lowest'];
const TEMPLATE_OPTIONS = [
  '',
  'Maintenance follow-up',
  'Inspection follow-up',
  'Cleaning correction',
  'Guest service follow-up',
  'Manager review',
];

type SaveState = 'idle' | 'saving' | 'queued' | 'failed';

function todayIso(): string {
  const now = new Date();
  const localMidnight = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localMidnight.toISOString().slice(0, 10);
}

function addDaysIso(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

const TODAY = todayIso();

export function CreateTaskDrawer({ open, onClose, onCreated, mode, sourceTask, prefill }: Props) {
  const currentUserId = useCurrentUserId();
  const { role, can } = usePermissions();
  const resolvedMode: CreateTaskMode = mode ?? (role === 'field' ? 'field_standalone_issue' : 'manager_schedule');
  const isManagerMode = resolvedMode === 'manager_schedule';
  const isAssignedIssue = resolvedMode === 'assigned_issue';
  const canSchedule = role !== 'field' && can('tasks', 'write');

  const [nl, setNl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [propertyCode, setPropertyCode] = useState('');
  const [propertyQuery, setPropertyQuery] = useState('');
  const [department, setDepartment] = useState<Department>('maintenance');
  const [subdepartment, setSubdepartment] = useState<Subdepartment>('plumbing');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [requesterId, setRequesterId] = useState(currentUserId);
  const [dueDate, setDueDate] = useState(TODAY);
  const [dueTime, setDueTime] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState('');
  const [template, setTemplate] = useState('');
  const [element, setElement] = useState('');
  const [tagText, setTagText] = useState('');
  const [attachmentNames, setAttachmentNames] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [queuedIntent, setQueuedIntent] = useState<'report' | 'schedule' | null>(null);

  useEffect(() => {
    if (!open) return;
    const firstDept = prefill?.department ?? sourceTask?.department ?? 'maintenance';
    const firstSubdept = prefill?.subdepartment ?? sourceTask?.subdepartment ?? SUBDEPT_BY_DEPT[firstDept][0];
    setNl('');
    setTitle(prefill?.title ?? '');
    setDescription(prefill?.description ?? '');
    setPropertyCode(prefill?.propertyCode ?? sourceTask?.propertyCode ?? '');
    setPropertyQuery('');
    setDepartment(firstDept);
    setSubdepartment(firstSubdept);
    setPriority(prefill?.priority ?? 'medium');
    setAssigneeIds(resolvedMode === 'manager_schedule' ? prefill?.assigneeIds ?? [] : []);
    setRequesterId(currentUserId);
    setDueDate(prefill?.dueDate ?? sourceTask?.dueDate ?? TODAY);
    setDueTime(prefill?.dueTime ?? sourceTask?.dueTime ?? '');
    setEstimatedMinutes(prefill?.estimatedMinutes ? String(prefill.estimatedMinutes) : '');
    setTemplate(prefill?.template ?? '');
    setElement(prefill?.category ?? '');
    setTagText(prefill?.tags?.join(', ') ?? '');
    setAttachmentNames([]);
    setSaveState('idle');
    setSaveError(null);
    setQueuedIntent(null);
  }, [currentUserId, open, prefill, resolvedMode, sourceTask]);

  const subOptions = SUBDEPT_BY_DEPT[department];
  const selectedProperty = TASK_PROPERTIES.find((p) => p.code === propertyCode);
  const candidateAssignees = useMemo(
    () => TASK_USERS.filter((u) => u.role !== 'external' && u.active),
    [],
  );
  const propertyResults = useMemo(() => {
    const q = propertyQuery.trim().toLowerCase();
    if (!q) return TASK_PROPERTIES.slice(0, 10);
    return TASK_PROPERTIES.filter((p) => (
      p.code.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.zone.toLowerCase().includes(q)
    )).slice(0, 10);
  }, [propertyQuery]);
  const assigneeGroups = useMemo(() => (
    DEPARTMENTS.map((dept) => ({
      dept,
      users: candidateAssignees.filter((u) => u.skills?.includes(dept) || (dept === 'office' && u.role !== 'field')),
    })).filter((group) => group.users.length > 0)
  ), [candidateAssignees]);
  const currentUser = TASK_USER_BY_ID[currentUserId];

  const parseNl = () => {
    if (!nl.trim()) return;
    // @demo:logic — Tag: PROD-LOGIC-4 — see frontend/DEMO_CRUFT.md
    // Replace with: POST /api/intent/parse-task (real LLM intent endpoint).
    // Phase 1: regex-based intent parsing. Phase 2 swaps to real LLM.
    const text = nl.toLowerCase();

    const propMatch = nl.match(/\b([A-Z]{2,4}-\w{1,3})\b/);
    if (propMatch) setPropertyCode(propMatch[1].toUpperCase());

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

    if (/\burgent\b|\bnow\b|\basap\b/.test(text)) setPriority('urgent');
    else if (/\bhigh\b|\bsoon\b|\btoday\b/.test(text)) setPriority('high');

    if (/\btomorrow\b/.test(text)) setDueDate(addDaysIso(TODAY, 1));
    else if (/\btoday\b/.test(text)) setDueDate(TODAY);
    else if (/\bweek\b/.test(text)) setDueDate(addDaysIso(TODAY, 6));

    setTitle(nl.charAt(0).toUpperCase() + nl.slice(1, 90));
    fireToast('Form pre-filled from your description · review and submit');
  };

  const toggleAssignee = (id: string) => {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectProperty = (code: string) => {
    setPropertyCode(code);
    setPropertyQuery('');
  };

  const onAttachmentSelected = (files: FileList | null) => {
    const next = Array.from(files || []).map((file) => file.name);
    if (next.length === 0) return;
    setAttachmentNames((items) => [...items, ...next]);
  };

  const validation = useMemo(() => {
    const issues: string[] = [];
    if (!propertyCode) issues.push('Select a property.');
    if (!title.trim()) issues.push('Enter a title.');
    if (!description.trim() && resolvedMode !== 'manager_schedule') issues.push('Describe the issue.');
    return issues;
  }, [description, propertyCode, resolvedMode, title]);

  const managerScheduleValidation = useMemo(() => {
    const issues = [...validation];
    if (!dueDate) issues.push('Choose a due date.');
    return issues;
  }, [dueDate, validation]);

  const buildDescription = () => {
    const context: string[] = [];
    if (isAssignedIssue && sourceTask) {
      context.push(`Reported from assigned task ${sourceTask.bzId ? `#${sourceTask.bzId}` : sourceTask.id}: ${sourceTask.title}`);
      if (sourceTask.reservationId) {
        context.push('Reservation context is inherited from the assigned task; guest/access details are intentionally omitted from report text.');
      }
    }
    if (attachmentNames.length > 0) {
      context.push(`Attachment upload pending: ${attachmentNames.join(', ')}`);
    }
    return [context.join('\n'), description.trim()].filter(Boolean).join('\n\n');
  };

  const submit = async (intent: 'report' | 'schedule') => {
    const isReportIntent = intent === 'report' || resolvedMode !== 'manager_schedule';
    const blockers = isReportIntent ? validation : managerScheduleValidation;
    if (blockers.length > 0) {
      setSaveState('failed');
      setSaveError(blockers.join(' '));
      return;
    }
    if (!isReportIntent && !canSchedule) {
      setSaveState('failed');
      setSaveError('Your role cannot schedule tasks.');
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setQueuedIntent(intent);
      setSaveState('queued');
      setSaveError('This report is queued only in this browser session. Reconnect and retry before closing FAD.');
      return;
    }

    setSaveState('saving');
    setSaveError(null);
    try {
      const tags = tagText
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      const task = await createTask({
        title: title.trim(),
        description: buildDescription(),
        propertyCode,
        department,
        subdepartment,
        priority,
        source: isReportIntent
          ? (prefill?.source ?? 'reported_issue')
          : (prefill?.source ?? 'manual'),
        status: isReportIntent ? 'reported' : 'scheduled',
        visibility: isReportIntent ? 'team' : 'all',
        assigneeIds: isReportIntent ? [] : assigneeIds,
        requesterId: requesterId || currentUserId,
        dueDate: dueDate || TODAY,
        dueTime: isReportIntent ? undefined : dueTime || undefined,
        estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
        reservationId: isAssignedIssue
          ? sourceTask?.reservationId
          : resolvedMode === 'field_standalone_issue'
            ? undefined
            : prefill?.reservationId,
        inboxThreadId: prefill?.inboxThreadId,
        groupEmailId: prefill?.groupEmailId,
        tags,
        category: element.trim() || undefined,
        template: template || undefined,
        externalRef: prefill?.externalRef,
      });
      onCreated(task);
      fireToast(isReportIntent ? 'Issue reported for manager triage' : 'Task scheduled');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Task save failed';
      setSaveState('failed');
      setSaveError(message);
      fireToast(message);
    }
  };

  const retryQueued = () => {
    const intent = queuedIntent;
    if (!intent) return;
    setQueuedIntent(null);
    void submit(intent);
  };

  if (!open) return null;

  const titleText =
    resolvedMode === 'assigned_issue'
      ? 'Report related issue'
      : resolvedMode === 'field_standalone_issue'
        ? 'Report property issue'
        : prefill
          ? 'Review & create task'
          : 'New operation task';
  const introText =
    resolvedMode === 'manager_schedule'
      ? 'Managers can report an intake item or schedule assigned work. Field create-and-complete stays disabled.'
      : isAssignedIssue
        ? 'Property and reservation context are inherited from your assigned task. Access details are never copied into the report.'
        : 'Select the property and describe what you saw. A manager will triage before scheduling or assigning work.';

  return (
    <>
      <div className="fad-drawer-overlay open" onClick={onClose} />
      <aside className="fad-drawer open ops-create-drawer" style={{ maxWidth: 560 }}>
        <div className="fad-drawer-header">
          <div className="fad-drawer-title">{titleText}</div>
          <button className="fad-util-btn" onClick={onClose} title="Close" style={{ marginLeft: 'auto' }}>
            <IconClose />
          </button>
        </div>
        <div className="fad-drawer-body ops-create-body">
          <div className="ops-form-alert neutral">{introText}</div>

          {isManagerMode && !prefill && (
            <section className="ops-form-section">
              <div className="ops-form-section-title">
                <IconSparkle size={12} /> Quick fill
              </div>
              <textarea
                value={nl}
                onChange={(e) => setNl(e.target.value)}
                placeholder="e.g. urgent AC repair at LB-2 tomorrow morning"
                rows={3}
              />
              <button className="btn ghost sm" type="button" onClick={parseNl} disabled={!nl.trim()}>
                Parse and fill
              </button>
            </section>
          )}

          {isAssignedIssue && sourceTask && (
            <section className="ops-form-section">
              <div className="ops-form-section-title">Inherited context</div>
              <div className="ops-context-readonly">
                <span>
                  <small>Assigned task</small>
                  <strong>{sourceTask.title}</strong>
                </span>
                <span>
                  <small>Property</small>
                  <strong>{sourceTask.propertyCode}</strong>
                </span>
                <span>
                  <small>Reservation</small>
                  <strong>{sourceTask.reservationId ? 'Inherited safely' : 'None'}</strong>
                </span>
              </div>
            </section>
          )}

          <section className="ops-form-section">
            <div className="ops-form-section-title">Property</div>
            {isAssignedIssue ? (
              <div className="ops-property-locked">
                <strong>{propertyCode || sourceTask?.propertyCode}</strong>
                <span>{selectedProperty?.name ?? 'Inherited from assigned task'}</span>
              </div>
            ) : (
              <>
                <input
                  type="search"
                  value={propertyQuery}
                  onChange={(e) => setPropertyQuery(e.target.value)}
                  placeholder={selectedProperty ? `${selectedProperty.code} · ${selectedProperty.name}` : 'Search property code, name, or zone'}
                  className="ops-property-search"
                />
                <div className="ops-property-results" aria-label="Property results">
                  {propertyResults.map((property) => (
                    <button
                      key={property.code}
                      type="button"
                      className={'ops-property-option' + (propertyCode === property.code ? ' active' : '')}
                      onClick={() => selectProperty(property.code)}
                    >
                      <span className="mono">{property.code}</span>
                      <span>{property.name}</span>
                      <small>{property.zone}</small>
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="ops-form-section">
            <div className="ops-form-section-title">{isManagerMode ? 'Work details' : 'Issue details'}</div>
            <Field label="Title">
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short title" />
            </Field>
            <Field label={isManagerMode ? 'Description' : 'What happened'}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={isManagerMode ? 'What needs to happen?' : 'Describe what you saw, heard, or encountered.'}
                rows={4}
              />
            </Field>
            <Field label="Priority">
              <div className="ops-choice-grid priorities">
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={'ops-choice-chip' + (priority === p ? ' active' : '')}
                    onClick={() => setPriority(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </Field>
            <div className="ops-form-grid two">
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
            {isManagerMode && (
              <div className="ops-form-grid two">
                <Field label="Template">
                  <select value={template} onChange={(e) => setTemplate(e.target.value)}>
                    {TEMPLATE_OPTIONS.map((item) => (
                      <option key={item || 'none'} value={item}>
                        {item || 'No template'}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Element">
                  <input value={element} onChange={(e) => setElement(e.target.value)} placeholder="AC, pool, linen, lock..." />
                </Field>
              </div>
            )}
          </section>

          <section className="ops-form-section">
            <div className="ops-form-section-title">Evidence and tags</div>
            <label className="ops-evidence-pick ops-create-attach">
              <input type="file" accept="image/*,.pdf" capture="environment" multiple onChange={(e) => onAttachmentSelected(e.target.files)} />
              <span className="btn ghost sm">
                <IconPlus size={13} /> Add photo/file
              </span>
            </label>
            {attachmentNames.length > 0 && (
              <div className="ops-form-alert neutral">
                Upload is not persisted yet; file names will be noted on the task: {attachmentNames.join(', ')}
              </div>
            )}
            {isManagerMode && (
              <Field label="Tags">
                <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="owner-billable, arrival, follow-up" />
              </Field>
            )}
          </section>

          {isManagerMode ? (
            <>
              <section className="ops-form-section">
                <div className="ops-form-section-title">Schedule</div>
                <div className="ops-form-grid three">
                  <Field label="Due date">
                    <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </Field>
                  <Field label="Due time">
                    <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
                  </Field>
                  <Field label="Minutes">
                    <input
                      type="number"
                      min="0"
                      step="15"
                      inputMode="numeric"
                      value={estimatedMinutes}
                      onChange={(e) => setEstimatedMinutes(e.target.value)}
                      placeholder="60"
                    />
                  </Field>
                </div>
              </section>

              <section className="ops-form-section">
                <div className="ops-form-section-title">Assignees</div>
                {canSchedule && currentUser && (
                  <button
                    type="button"
                    className="btn ghost sm ops-assign-self"
                    onClick={() => {
                      if (!assigneeIds.includes(currentUserId)) setAssigneeIds((ids) => [currentUserId, ...ids]);
                    }}
                  >
                    Assign to me
                  </button>
                )}
                <div className="ops-assignee-groups">
                  {assigneeGroups.map((group) => (
                    <div className="ops-assignee-group" key={group.dept}>
                      <div>{group.dept}</div>
                      <div>
                        {group.users.map((user) => {
                          const selected = assigneeIds.includes(user.id);
                          return (
                            <button
                              key={`${group.dept}-${user.id}`}
                              type="button"
                              className={'ops-assignee-chip' + (selected ? ' active' : '')}
                              onClick={() => toggleAssignee(user.id)}
                            >
                              <span style={{ background: user.avatarColor }}>{user.initials}</span>
                              {user.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <Field label="Requester">
                  <select value={requesterId} onChange={(e) => setRequesterId(e.target.value)}>
                    {candidateAssignees.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </section>
            </>
          ) : (
            <div className="ops-form-alert neutral">
              This creates an unassigned reported item for manager triage. It will not appear in your My Tasks unless a manager assigns it.
            </div>
          )}

          {saveState !== 'idle' && (
            <div className={`ops-form-alert ${saveState}`}>
              {saveState === 'saving' && 'Saving...'}
              {saveState === 'queued' && (
                <>
                  {saveError}
                  <button className="btn ghost sm" type="button" onClick={retryQueued}>Retry</button>
                </>
              )}
              {saveState === 'failed' && saveError}
            </div>
          )}

          <div className="ops-create-footer">
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            {isManagerMode ? (
              <>
                <button className="btn ghost" type="button" onClick={() => submit('report')} disabled={saveState === 'saving' || validation.length > 0}>
                  Report
                </button>
                <button className="btn primary" type="button" onClick={() => submit('schedule')} disabled={saveState === 'saving' || managerScheduleValidation.length > 0 || !canSchedule}>
                  Schedule
                </button>
              </>
            ) : (
              <button className="btn primary" type="button" onClick={() => submit('report')} disabled={saveState === 'saving' || validation.length > 0}>
                Report issue
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="ops-form-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
