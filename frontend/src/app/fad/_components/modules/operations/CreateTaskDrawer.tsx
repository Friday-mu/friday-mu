'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import {
  CORE_TASK_TEMPLATE_OPTIONS,
  initialRequirementState,
  requirementsForTemplate,
} from '../../../_data/taskRequirements';
import { useHydratePropertiesFromGuesty } from '../../../_data/propertiesClient';
import {
  parseTaskIntent,
  type ParseTaskProposal,
  type ParseTaskHistoryTurn,
} from '../../../_data/intentClient';
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
  ...CORE_TASK_TEMPLATE_OPTIONS,
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

function compactTaskTitle(value: string): string {
  const cleaned = value
    .replace(/\s+/g, ' ')
    .replace(/^(please\s+)?(can you\s+)?(create|schedule|assign|add|make|report)\s+(a\s+|this\s+)?(task\s+)?(for|to)?\s*/i, '')
    .trim();
  const title = cleaned || value.trim();
  const capped = title.length > 72 ? `${title.slice(0, 69).trim()}...` : title;
  return capped.charAt(0).toUpperCase() + capped.slice(1);
}

function timeFromParts(hourValue: number, minuteValue: number): string | null {
  if (!Number.isFinite(hourValue) || hourValue < 0 || hourValue > 23) return null;
  if (!Number.isFinite(minuteValue) || minuteValue < 0 || minuteValue > 59) return null;
  return `${String(hourValue).padStart(2, '0')}:${String(minuteValue).padStart(2, '0')}`;
}

function timeFromText(text: string): string | null {
  const meridiem = text.match(/\b(?:at|by|around|for)?\s*(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/);
  if (meridiem) {
    let hour = Number(meridiem[1]);
    const minute = Number(meridiem[2] || 0);
    if (meridiem[3] === 'pm' && hour !== 12) hour += 12;
    if (meridiem[3] === 'am' && hour === 12) hour = 0;
    return timeFromParts(hour, minute);
  }

  const hourMinute = text.match(/\b(?:at|by|around|for)?\s*([01]?\d|2[0-3])[:h]([0-5]\d)\b/);
  if (hourMinute) {
    return timeFromParts(Number(hourMinute[1]), Number(hourMinute[2]));
  }

  const bareHour = text.match(/\b(?:at|by|around|for)\s+([01]?\d|2[0-3])\b/);
  if (bareHour) {
    let hour = Number(bareHour[1]);
    if (hour >= 1 && hour <= 6) hour += 12;
    return timeFromParts(hour, 0);
  }

  if (/\b(end of day|eod|evening)\b/.test(text)) return '17:00';
  if (/\b(noon|midday)\b/.test(text)) return '12:00';
  if (/\bafternoon\b/.test(text)) return '14:00';
  if (/\bmorning\b/.test(text)) return '09:00';
  return null;
}

function durationFromText(text: string): number | null {
  const hourMatch =
    text.match(/\b(?:estimate(?:d)?|duration|takes?|should take|about|approx\.?|for)\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/) ||
    text.match(/\b(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/);
  if (hourMatch) return Math.round(Number(hourMatch[1]) * 60);

  const minuteMatch = text.match(/\b(?:estimate(?:d)?|duration|takes?|should take|about|approx\.?|for)\s+(\d{1,3})\s*(m|min|mins|minute|minutes)\b/);
  if (minuteMatch) return Number(minuteMatch[1]);
  return null;
}

function mentionedPropertyCode(rawText: string): string | null {
  const explicitCode = rawText.match(/\b([A-Z]{2,4}-[\w-]{1,6})\b/);
  if (explicitCode) return explicitCode[1].toUpperCase();

  const text = rawText.toLowerCase();
  const property = TASK_PROPERTIES.find((item) => (
    text.includes(item.code.toLowerCase()) ||
    (item.name.length > 6 && text.includes(item.name.toLowerCase()))
  ));
  return property?.code ?? null;
}

function assigneeIdsFromText(text: string): string[] {
  const ids = new Set<string>();
  if (/\bbrian\b/.test(text)) ids.add('u-bryan');
  TASK_USERS
    .filter((user) => user.active && user.role !== 'external')
    .forEach((user) => {
      const [firstName] = user.name.toLowerCase().split(/\s+/);
      const fullName = user.name.toLowerCase();
      if (new RegExp(`\\b${firstName}\\b`).test(text) || text.includes(fullName)) {
        ids.add(user.id);
      }
    });
  return Array.from(ids);
}

function mergeTags(existing: string, next: string[]): string {
  const values = [
    ...existing.split(',').map((tag) => tag.trim()).filter(Boolean),
    ...next,
  ];
  return Array.from(new Set(values)).join(', ');
}

export function CreateTaskDrawer({ open, onClose, onCreated, mode, sourceTask, prefill }: Props) {
  const currentUserId = useCurrentUserId();
  const { role, can } = usePermissions();
  const resolvedMode: CreateTaskMode = mode ?? (role === 'field' ? 'field_standalone_issue' : 'manager_schedule');
  const isManagerMode = resolvedMode === 'manager_schedule';
  const isAssignedIssue = resolvedMode === 'assigned_issue';
  const canSchedule = role !== 'field' && can('tasks', 'write');

  // Bug fix (2026-05-23, Franny 11:00) — "When creating a new task, we
  // don't have the option to select which properties; only the
  // store/office/admin option shows up." Diagnosis: TASK_PROPERTIES
  // = TASK_PROPERTIES_SHIM = [...PROPERTIES.map(...), OFFICE_META].
  // PROPERTIES is hydrated from /api/properties (Guesty listings) but
  // only inside PropertiesModule. Operators creating tasks from the
  // Operations module never triggered the hydration, so PROPERTIES
  // stayed empty and only OFFICE_META remained visible. Triggering
  // hydration here ensures the property picker is populated on first
  // open. The hook is idempotent (caches hydrated state in its own
  // useState), so multiple consumers don't double-fetch.
  useHydratePropertiesFromGuesty();

  const [nl, setNl] = useState('');
  // Smart-mode chat state. Replaces the regex parseNl for the common
  // case: operator types a free-text note, Friday returns a structured
  // proposal + (optionally) a clarifying question. Each turn re-issues
  // with the full transcript so refinements are cumulative.
  // Per Ishant's NEW scope (2026-05-23): "you write a message, it
  // creates the task, you can write again if it didn't create the
  // right task… it must be able to have an interaction".
  type SmartTurn =
    | { role: 'user'; text: string }
    | { role: 'assistant'; text: string; proposed?: ParseTaskProposal; confidence?: string };
  const [smartTurns, setSmartTurns] = useState<SmartTurn[]>([]);
  const [smartThinking, setSmartThinking] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);
  const smartActiveRef = useRef<AbortController | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [propertyCode, setPropertyCode] = useState('');
  const [propertyQuery, setPropertyQuery] = useState('');
  const [department, setDepartment] = useState<Department>('maintenance');
  const [subdepartment, setSubdepartment] = useState<Subdepartment>('plumbing');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [requesterId, setRequesterId] = useState(currentUserId);
  const [dueDate, setDueDate] = useState('');
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
    setSmartTurns([]);
    setSmartThinking(false);
    setSmartError(null);
    smartActiveRef.current?.abort();
    smartActiveRef.current = null;
    setTitle(prefill?.title ?? '');
    setDescription(prefill?.description ?? '');
    setPropertyCode(prefill?.propertyCode ?? sourceTask?.propertyCode ?? '');
    setPropertyQuery('');
    setDepartment(firstDept);
    setSubdepartment(firstSubdept);
    setPriority(prefill?.priority ?? 'medium');
    setAssigneeIds(resolvedMode === 'manager_schedule' ? prefill?.assigneeIds ?? [] : []);
    setRequesterId(currentUserId);
    setDueDate(
      resolvedMode === 'manager_schedule'
        ? prefill?.dueDate ?? sourceTask?.dueDate ?? TODAY
        : prefill?.dueDate ?? '',
    );
    setDueTime(resolvedMode === 'manager_schedule' ? prefill?.dueTime ?? sourceTask?.dueTime ?? '' : '');
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

  // Apply a structured proposal to the form. Each field is independent
  // — operator hand-edits between turns will survive unless the model
  // proposes a new value for that specific field. tags merge (not
  // replace) so a refinement turn ("also tag this owner-billable")
  // doesn't drop earlier tags.
  const applyProposal = (proposed: ParseTaskProposal) => {
    if (proposed.title) setTitle(proposed.title);
    if (proposed.description) setDescription(proposed.description);
    if (proposed.propertyCode) {
      setPropertyCode(proposed.propertyCode);
      setPropertyQuery('');
    }
    if (proposed.department) {
      setDepartment(proposed.department);
      // If the model didn't also specify a subdept, fall back to the
      // first valid one for the chosen department.
      if (!proposed.subdepartment) {
        setSubdepartment(SUBDEPT_BY_DEPT[proposed.department][0]);
      }
    }
    if (proposed.subdepartment) {
      setSubdepartment(proposed.subdepartment as Subdepartment);
    }
    if (proposed.priority) setPriority(proposed.priority);
    if (proposed.assigneeIds && proposed.assigneeIds.length > 0) {
      setAssigneeIds(proposed.assigneeIds);
    }
    if (proposed.dueDate) setDueDate(proposed.dueDate);
    if (proposed.dueTime) setDueTime(proposed.dueTime);
    if (typeof proposed.estimatedMinutes === 'number') {
      setEstimatedMinutes(String(proposed.estimatedMinutes));
    }
    if (proposed.template) setTemplate(proposed.template);
    if (proposed.category) setElement(proposed.category);
    if (proposed.tags && proposed.tags.length > 0) {
      setTagText((current) => mergeTags(current, proposed.tags!));
    }
  };

  const sendSmartTurn = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || smartThinking) return;
    setSmartError(null);

    const userTurn: SmartTurn = { role: 'user', text: trimmed };
    const baseHistory: ParseTaskHistoryTurn[] = smartTurns.map((turn) => ({
      role: turn.role,
      content: turn.text,
    }));
    setSmartTurns((prev) => [...prev, userTurn]);
    setNl('');
    setSmartThinking(true);

    const controller = new AbortController();
    smartActiveRef.current?.abort();
    smartActiveRef.current = controller;

    try {
      // Reference data the model uses to resolve property codes +
      // assignee names. We pass the FULL local directory (capped by the
      // backend) so the model can match "Bryan", "Mary", "GBH-C8" etc.
      // exactly. today is computed in Mauritius local time — used for
      // relative dates ("tomorrow", "next week").
      const reference = {
        today: TODAY,
        properties: TASK_PROPERTIES.map((p) => ({ code: p.code, name: p.name, zone: p.zone })),
        assignees: TASK_USERS
          .filter((u) => u.active && u.role !== 'external')
          .map((u) => ({ id: u.id, name: u.name, role: u.role, skills: u.skills })),
      };
      const focus = prefill?.inboxThreadId
        ? { module: 'inbox', threadId: prefill.inboxThreadId, reservationId: prefill.reservationId || null, propertyCode: prefill.propertyCode || null }
        : prefill?.reservationId
          ? { module: 'operations', reservationId: prefill.reservationId, propertyCode: prefill.propertyCode || null }
          : null;
      const response = await parseTaskIntent({
        text: trimmed,
        history: baseHistory,
        reference,
        focus,
        signal: controller.signal,
      });
      if (smartActiveRef.current !== controller) return;
      if (response.proposed && Object.keys(response.proposed).length > 0) {
        applyProposal(response.proposed);
      }
      const assistantText = response.clarifyingQuestion
        || (response.reasoning || 'Draft updated. Adjust any field manually or refine in chat.');
      setSmartTurns((prev) => [...prev, {
        role: 'assistant',
        text: assistantText,
        proposed: response.proposed,
        confidence: response.confidence,
      }]);
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return;
      const msg = e instanceof Error ? e.message : 'Smart drafter unreachable';
      setSmartError(msg);
      setSmartTurns((prev) => [...prev, {
        role: 'assistant',
        text: `Smart drafter is unavailable right now (${msg}). You can use Quick draft (below) or fill the form by hand.`,
      }]);
    } finally {
      if (smartActiveRef.current === controller) {
        smartActiveRef.current = null;
        setSmartThinking(false);
      }
    }
  };

  // T1.8 (2026-05-24): parseNl regex-based offline drafter removed —
  // the Friday-smart drafter (sendSmartTurn) is reliable in prod and
  // the regex fallback never fired in real use. Saved ~80 lines.

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
      const requirements = isReportIntent ? [] : requirementsForTemplate(template, department, subdepartment);
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
        dueDate: isReportIntent ? dueDate || undefined : dueDate || TODAY,
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
        requirements: requirements.length > 0 ? requirements : undefined,
        requirementState: requirements.length > 0 ? initialRequirementState() : undefined,
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
      ? 'Create an intake item or scheduled task.'
      : isAssignedIssue
        ? 'Inherited context is copied safely.'
        : 'Report a property issue for manager triage.';

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
            <section className="ops-form-section ops-quickfill-section">
              <div className="ops-form-section-title">
                <IconSparkle size={12} /> Draft with Friday
              </div>
              {smartTurns.length > 0 && (
                <div className="ops-smart-turns" role="log" aria-live="polite">
                  {smartTurns.map((turn, i) => (
                    <div
                      key={i}
                      className={'ops-smart-turn ' + (turn.role === 'user' ? 'user' : 'assistant')}
                    >
                      {turn.role === 'assistant' && (
                        <span className="ops-smart-badge">
                          <IconSparkle size={10} /> Friday
                          {turn.confidence && (
                            <em className={'ops-smart-conf ' + turn.confidence}>· {turn.confidence}</em>
                          )}
                        </span>
                      )}
                      <span className="ops-smart-text">{turn.text}</span>
                    </div>
                  ))}
                  {smartThinking && (
                    <div className="ops-smart-turn assistant pending">
                      <span className="ops-smart-badge">
                        <IconSparkle size={10} /> Friday
                      </span>
                      <span className="ops-smart-text">Drafting…</span>
                    </div>
                  )}
                </div>
              )}
              <textarea
                value={nl}
                onChange={(e) => setNl(e.target.value)}
                placeholder={smartTurns.length === 0
                  ? 'Assign Bryan to check low water pressure at GBH-C8 tomorrow morning. Guest says shower drops after 2 minutes.'
                  : 'Refine: change the property, swap the assignee, push the date out…'}
                rows={smartTurns.length === 0 ? 3 : 2}
                onKeyDown={(e) => {
                  // Cmd/Ctrl+Enter sends — matches Ask Friday / FridayConsult.
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    if (nl.trim()) void sendSmartTurn(nl);
                  }
                }}
              />
              <div className="ops-quickfill-action">
                <button
                  className="btn primary sm"
                  type="button"
                  onClick={() => void sendSmartTurn(nl)}
                  disabled={!nl.trim() || smartThinking}
                  title="Send to Friday (⌘+Enter)"
                >
                  {smartTurns.length === 0 ? 'Draft with Friday' : 'Refine'}
                </button>
                {/* T1.8 (2026-05-24): "Quick draft (offline)" + parseNl removed.
                    The Friday-smart drafter has proven reliable on prod; the
                    regex fallback never fired in real use. Removing the
                    button (+ unused parseNl below) per the overnight plan. */}
              </div>
              {smartError && <div className="ops-form-alert failed">{smartError}</div>}
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
                {/* 2026-05-23 (Ishant): the chip grid was overwhelming
                    when you opened the drawer for the first time. A
                    dropdown is the conventional Ops UI and matches
                    Breezeway. Department headers stay so the operator
                    can find the right person by skill. */}
                <Field label="Assign to">
                  <select
                    value=""
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id && !assigneeIds.includes(id)) {
                        setAssigneeIds((prev) => [...prev, id]);
                      }
                    }}
                  >
                    <option value="">Pick someone…</option>
                    {canSchedule && currentUser && !assigneeIds.includes(currentUserId) && (
                      <option value={currentUserId}>Assign to me ({currentUser.name})</option>
                    )}
                    {assigneeGroups.map((group) => (
                      <optgroup key={group.dept} label={group.dept}>
                        {group.users
                          .filter((u) => !assigneeIds.includes(u.id))
                          .map((u) => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </Field>
                {assigneeIds.length > 0 && (
                  <div className="ops-assignee-pill-row">
                    {assigneeIds.map((id) => {
                      const u = TASK_USER_BY_ID[id];
                      if (!u) return null;
                      return (
                        <span key={id} className="ops-assignee-pill">
                          <span className="ops-assignee-pill-dot" style={{ background: u.avatarColor }}>
                            {u.initials}
                          </span>
                          <span>{u.name}</span>
                          <button
                            type="button"
                            className="ops-assignee-pill-remove"
                            title={`Remove ${u.name}`}
                            onClick={() => toggleAssignee(id)}
                          >
                            <IconClose />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <Field label="Requester">
                  <select value={requesterId} onChange={(e) => setRequesterId(e.target.value)}>
                    {candidateAssignees.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}{user.id === currentUserId ? ' (you)' : ''}
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
