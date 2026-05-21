'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  TASK_USERS,
  TASK_USER_BY_ID,
  type ActivityEntry,
  type Task,
  type TaskComment,
  type TaskCost,
  type TaskRequirement,
  type TaskRequirementState,
} from '../../../_data/tasks';
import { addComment, updateTask } from '../../../_data/tasksClient';
import {
  missingRequiredRequirements,
  normalizeRequirementState,
  requirementSatisfied,
  requirementsForTask,
  type CompletionSignals,
} from '../../../_data/taskRequirements';
import { FIN_EXPENSES } from '../../../_data/finance';
import { useCurrentUserId, useCanAccess, usePermissions } from '../../usePermissions';
import { fireToast } from '../../Toaster';
import { IconClose, IconExpand, IconPlus, IconSparkle } from '../../icons';
import { AddCostDrawer } from './AddCostDrawer';
import { useAITelemetry, type AISurface } from '../../ai/useAITelemetry';
import { AIConfidenceChip } from '../../ai/AIComponents';
import { RISK_FLAG_EXPLANATIONS, pickFromPool } from '../../../_data/aiFixtures';
import { priorityTone, taskStatusTone, toneStyle } from '../../palette';
import { PropertyChip } from '../properties/PropertyQuickView';
import { PROPERTY_BY_CODE } from '../../../_data/properties';
import {
  RESERVATION_BY_ID,
  CHANNEL_LABEL,
  STATUS_LABEL as RES_STATUS_LABEL,
  formatStayWindow,
} from '../../../_data/reservations';
import {
  appendMentionToken,
  publishTaskCommentMentionBridge,
  resolveTaskCommentMentions,
} from '../../../_data/taskCommentBridge';

interface DetailProps {
  task: Task;
  mode: 'drawer' | 'page';
  onClose?: () => void;
  onExpand?: () => void;
  onBumpRev: () => void;
  onReportIssue?: (task: Task) => void;
}

const RISK_LABEL: Record<string, string> = {
  overdue: 'Overdue',
  no_progress: 'No progress',
  blocked_access: 'Access blocked',
  over_time: 'Over time',
  unassigned: 'Unassigned',
  reservation_imminent: 'Guest arrival imminent',
};

const STATUS_LABEL: Record<Task['status'], string> = {
  reported: 'Reported',
  scheduled: 'Scheduled',
  ready: 'Ready',
  in_progress: 'In progress',
  paused: 'Paused',
  blocked: 'Blocked',
  completed: 'Completed',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

const SUMMARY_PREFIX = 'Execution summary:';
const EXECUTION_WINDOW_HOURS = 12;
const EXECUTION_GRACE_HOURS = 4;

type SyncState = 'idle' | 'saving' | 'saved' | 'queued' | 'failed';

interface EvidenceItem {
  id: string;
  name: string;
  size: number;
  type: string;
}

// Status + priority badges resolve through the palette helper so dark mode
// auto-flips and the design system stays single-sourced.
const statusBadgeFor = (s: Task['status']) => toneStyle(taskStatusTone(s));
const priorityBadgeFor = (p: Task['priority']) => toneStyle(priorityTone(p));

export function TaskDetail({ task, mode, onClose, onExpand, onBumpRev, onReportIssue }: DetailProps) {
  const currentUserId = useCurrentUserId();
  const { can, role } = usePermissions();
  const canManageTasks = can('tasks', 'write');
  const isAssigned = task.assigneeIds.includes(currentUserId);
  const canEdit = canManageTasks || isAssigned;
  const canCloseReopen = canManageTasks && role !== 'field';
  const canSeeFinance = useCanAccess('finance', 'read');
  const [draftComment, setDraftComment] = useState('');
  const [completionSummary, setCompletionSummary] = useState(() => latestExecutionSummary(task));
  const [aiSummaryShown, setAiSummaryShown] = useState(false);
  const [addCostOpen, setAddCostOpen] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [queuedStatus, setQueuedStatus] = useState<Task['status'] | null>(null);
  const [closeArmed, setCloseArmed] = useState(false);
  const [evidenceQueue, setEvidenceQueue] = useState<EvidenceItem[]>([]);
  const [requirementState, setRequirementState] = useState(() => normalizeRequirementState(task.requirementState));
  const [timerBaseSeconds, setTimerBaseSeconds] = useState(() => minutesToSeconds(task.spentMinutes));
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(() =>
    task.status === 'in_progress' ? Date.now() : null,
  );
  const [clockNow, setClockNow] = useState(() => Date.now());

  useEffect(() => {
    setCompletionSummary(latestExecutionSummary(task));
    setEvidenceQueue([]);
    setRequirementState(normalizeRequirementState(task.requirementState));
    setQueuedStatus(null);
    setSyncError(null);
    setSyncState('idle');
    setCloseArmed(false);
  }, [task.id]);

  useEffect(() => {
    setRequirementState(normalizeRequirementState(task.requirementState));
  }, [task.requirementState]);

  useEffect(() => {
    setTimerBaseSeconds(minutesToSeconds(task.spentMinutes));
    setTimerStartedAt(task.status === 'in_progress' ? Date.now() : null);
    setClockNow(Date.now());
  }, [task.id, task.spentMinutes, task.status]);

  useEffect(() => {
    if (task.status !== 'in_progress') return;
    const tick = () => setClockNow(Date.now());
    const id = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [task.status]);

  const elapsedSeconds = useMemo(() => {
    const runningSeconds =
      task.status === 'in_progress' && timerStartedAt
        ? Math.max(0, Math.floor((clockNow - timerStartedAt) / 1000))
        : 0;
    return timerBaseSeconds + runningSeconds;
  }, [clockNow, task.status, timerBaseSeconds, timerStartedAt]);

  const requirements = useMemo(() => requirementsForTask(task), [task]);

  const spentMinutesForPatch = () => Math.max(task.spentMinutes ?? 0, Math.ceil(elapsedSeconds / 60));

  const completionSignals = useMemo<CompletionSignals>(() => ({
    attachmentCount: task.attachmentCount,
    queuedEvidenceCount: evidenceQueue.length,
    costCount: task.costs.length,
    elapsedSeconds,
    spentMinutes: spentMinutesForPatch(),
    summary: completionSummary,
  }), [completionSummary, elapsedSeconds, evidenceQueue.length, task.attachmentCount, task.costs.length, task.spentMinutes]);

  const missingCompletionRequirements = useMemo(() => (
    missingRequiredRequirements(requirements, requirementState, completionSignals)
  ), [completionSignals, requirementState, requirements]);

  const sendComment = async () => {
    const text = draftComment.trim();
    if (!text) return;
    const mentionIds = resolveTaskCommentMentions(text);
    await runApiMutation('comment', async () => {
      const comment = await addComment({ taskId: task.id, authorId: currentUserId, text, mentions: mentionIds });
      publishTaskCommentMentionBridge({ task, comment, authorId: currentUserId, mentionIds });
      setDraftComment('');
      onBumpRev();
    });
  };

  const runApiMutation = async (label: string, fn: () => Promise<void>) => {
    setSyncError(null);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSyncState('queued');
      setSyncError(`${label} is waiting for a connection. This queue is local to this browser session.`);
      return;
    }
    setSyncState('saving');
    try {
      await fn();
      setQueuedStatus(null);
      setSyncState('saved');
      window.setTimeout(() => setSyncState((state) => (state === 'saved' ? 'idle' : state)), 1600);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Sync failed';
      setSyncState('failed');
      setSyncError(message);
      fireToast(`Task sync failed: ${message}`);
    }
  };

  const setStatus = async (status: Task['status']) => {
    setCloseArmed(false);
    if (status === 'completed' && missingCompletionRequirements.length > 0) {
      const missing = missingCompletionRequirements.map((req) => req.label).join(', ');
      setSyncState('failed');
      setSyncError(`Complete blocked: ${missing}.`);
      fireToast('Complete blocked: finish required checklist');
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setQueuedStatus(status);
      setSyncState('queued');
      setSyncError(`Queued ${STATUS_LABEL[status].toLowerCase()} for retry in this session.`);
      return;
    }
    await runApiMutation(STATUS_LABEL[status], async () => {
      const patch: Parameters<typeof updateTask>[0]['patch'] = { status };
      if (shouldPatchSpentMinutes(task.status, status)) {
        patch.spentMinutes = spentMinutesForPatch();
      }
      await updateTask({ taskId: task.id, patch, actorId: currentUserId });
      if (status === 'completed' && completionSummary.trim()) {
        await addComment({
          taskId: task.id,
          authorId: currentUserId,
          text: `${SUMMARY_PREFIX} ${completionSummary.trim()}`,
        });
      }
      onBumpRev();
    });
  };

  const persistRequirementState = async (next: TaskRequirementState) => {
    const normalized = normalizeRequirementState({ ...next, updatedAt: new Date().toISOString() });
    await runApiMutation('requirement checklist', async () => {
      await updateTask({ taskId: task.id, patch: { requirementState: normalized }, actorId: currentUserId });
      setRequirementState(normalized);
      onBumpRev();
    });
  };

  const toggleRequirement = async (requirementId: string) => {
    const complete = requirementState.completedIds.includes(requirementId);
    const completedIds = complete
      ? requirementState.completedIds.filter((id) => id !== requirementId)
      : [...requirementState.completedIds, requirementId];
    await persistRequirementState({ ...requirementState, completedIds });
  };

  const toggleWaiver = async (requirementId: string) => {
    const waived = requirementState.waivedIds.includes(requirementId);
    const waivedIds = waived
      ? requirementState.waivedIds.filter((id) => id !== requirementId)
      : [...requirementState.waivedIds, requirementId];
    await persistRequirementState({ ...requirementState, waivedIds });
  };

  const retryQueuedStatus = async () => {
    if (!queuedStatus) return;
    const status = queuedStatus;
    setQueuedStatus(null);
    await setStatus(status);
  };

  const saveSummary = async () => {
    const text = completionSummary.trim();
    if (!text) return;
    await runApiMutation('summary', async () => {
      await addComment({ taskId: task.id, authorId: currentUserId, text: `${SUMMARY_PREFIX} ${text}` });
      onBumpRev();
    });
  };

  const onEvidenceSelected = (files: FileList | null) => {
    const next = Array.from(files || []).map((file) => ({
      id: `${task.id}-${file.name}-${file.lastModified}-${file.size}`,
      name: file.name,
      size: file.size,
      type: file.type || 'file',
    }));
    if (next.length === 0) return;
    setEvidenceQueue((items) => [...items, ...next]);
    setSyncState('queued');
    setSyncError('Evidence is queued locally; upload is not yet persisted.');
  };

  return (
    <div className="ops-task-detail-root">
      <Header
        task={task}
        mode={mode}
        onClose={onClose}
        onExpand={onExpand}
        canExecute={canEdit}
        canCloseReopen={canCloseReopen}
        closeArmed={closeArmed}
        setCloseArmed={setCloseArmed}
        elapsedSeconds={elapsedSeconds}
        onSetStatus={setStatus}
      />
      <div className="ops-task-detail-scroll">
        <Body
          task={task}
          role={role}
          currentUserId={currentUserId}
          aiSummaryShown={aiSummaryShown}
          setAiSummaryShown={setAiSummaryShown}
          canEdit={canEdit}
          canManageTasks={canManageTasks}
          canCloseReopen={canCloseReopen}
          closeArmed={closeArmed}
          setCloseArmed={setCloseArmed}
          canSeeFinance={canSeeFinance}
          onAddCost={() => setAddCostOpen(true)}
          elapsedSeconds={elapsedSeconds}
          completionSummary={completionSummary}
          setCompletionSummary={setCompletionSummary}
          onSaveSummary={saveSummary}
          syncState={syncState}
          syncError={syncError}
          queuedStatus={queuedStatus}
          onRetryQueuedStatus={retryQueuedStatus}
          onSetStatus={setStatus}
          evidenceQueue={evidenceQueue}
          onEvidenceSelected={onEvidenceSelected}
          requirements={requirements}
          requirementState={requirementState}
          completionSignals={completionSignals}
          missingCompletionRequirements={missingCompletionRequirements}
          onToggleRequirement={toggleRequirement}
          onToggleWaiver={toggleWaiver}
          onReportIssue={onReportIssue}
        />
        <Comments
          task={task}
          draft={draftComment}
          setDraft={setDraftComment}
          currentUserId={currentUserId}
          onSend={canEdit ? sendComment : undefined}
        />
      </div>
      <MobileExecutionBar
        task={task}
        canExecute={canEdit}
        canCloseReopen={canCloseReopen}
        closeArmed={closeArmed}
        setCloseArmed={setCloseArmed}
        elapsedSeconds={elapsedSeconds}
        syncState={syncState}
        queuedStatus={queuedStatus}
        onSetStatus={setStatus}
      />
      <AddCostDrawer
        open={addCostOpen}
        task={task}
        onClose={() => setAddCostOpen(false)}
        onAdded={() => {
          setAddCostOpen(false);
          onBumpRev();
        }}
      />
    </div>
  );
}

function Header({
  task,
  mode,
  onClose,
  onExpand,
  canExecute,
  canCloseReopen,
  closeArmed,
  setCloseArmed,
  elapsedSeconds,
  onSetStatus,
}: {
  task: Task;
  mode: 'drawer' | 'page';
  onClose?: () => void;
  onExpand?: () => void;
  canExecute: boolean;
  canCloseReopen: boolean;
  closeArmed: boolean;
  setCloseArmed: (v: boolean) => void;
  elapsedSeconds: number;
  onSetStatus: (s: Task['status']) => void;
}) {
  const statusBadge = statusBadgeFor(task.status);
  const priorityBadge = priorityBadgeFor(task.priority);
  const riskFlags = task.riskFlags;

  return (
    <div className="ops-task-detail-header">
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {task.bzId && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            #{task.bzId}
          </span>
        )}
        <PropertyChip
          code={task.propertyCode}
          className="chip"
          style={{
            minWidth: 44,
            minHeight: 44,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 8px',
            fontSize: 11,
            whiteSpace: 'nowrap',
          }}
        >
          {task.propertyCode}
        </PropertyChip>
        <span className="chip" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
          {task.department} · {task.subdepartment.replace('_', ' ')}
        </span>
        {mode === 'drawer' && onExpand && (
          <button className="fad-util-btn ops-detail-expand" onClick={onExpand} title="Open as page" style={{ marginLeft: 'auto' }}>
            <IconExpand size={14} />
          </button>
        )}
        {onClose && (
          <button className="fad-util-btn" onClick={onClose} title="Close">
            <IconClose size={14} />
          </button>
        )}
      </div>
      <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 500 }}>{task.title}</h2>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <Badge label={STATUS_LABEL[task.status]} bg={statusBadge.background} fg={statusBadge.color} />
        <Badge label={task.priority} bg={priorityBadge.background} fg={priorityBadge.color} />
        {riskFlags.map((rf) => (
          <RiskFlagBadge key={rf} flag={rf} label={RISK_LABEL[rf]} />
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          Due {task.dueDate}{task.dueTime ? ` · ${task.dueTime}` : ''}
        </span>
      </div>
      <div className="ops-execution-header-actions">
        <ExecutionButtons
          task={task}
          canExecute={canExecute}
          canCloseReopen={canCloseReopen}
          closeArmed={closeArmed}
          setCloseArmed={setCloseArmed}
          onSetStatus={onSetStatus}
        />
        <span className="ops-timer-pill">{formatDuration(elapsedSeconds)}</span>
      </div>
    </div>
  );
}

function Body({
  task,
  role,
  currentUserId,
  aiSummaryShown,
  setAiSummaryShown,
  canEdit,
  canManageTasks,
  canCloseReopen,
  closeArmed,
  setCloseArmed,
  canSeeFinance,
  onAddCost,
  elapsedSeconds,
  completionSummary,
  setCompletionSummary,
  onSaveSummary,
  syncState,
  syncError,
  queuedStatus,
  onRetryQueuedStatus,
  onSetStatus,
  evidenceQueue,
  onEvidenceSelected,
  requirements,
  requirementState,
  completionSignals,
  missingCompletionRequirements,
  onToggleRequirement,
  onToggleWaiver,
  onReportIssue,
}: {
  task: Task;
  role: NonNullable<ReturnType<typeof usePermissions>['role']>;
  currentUserId: string;
  aiSummaryShown: boolean;
  setAiSummaryShown: (v: boolean) => void;
  canEdit: boolean;
  canManageTasks: boolean;
  canCloseReopen: boolean;
  closeArmed: boolean;
  setCloseArmed: (v: boolean) => void;
  canSeeFinance: boolean;
  onAddCost: () => void;
  elapsedSeconds: number;
  completionSummary: string;
  setCompletionSummary: (v: string) => void;
  onSaveSummary: () => void;
  syncState: SyncState;
  syncError: string | null;
  queuedStatus: Task['status'] | null;
  onRetryQueuedStatus: () => void;
  onSetStatus: (s: Task['status']) => void;
  evidenceQueue: EvidenceItem[];
  onEvidenceSelected: (files: FileList | null) => void;
  requirements: TaskRequirement[];
  requirementState: TaskRequirementState;
  completionSignals: CompletionSignals;
  missingCompletionRequirements: TaskRequirement[];
  onToggleRequirement: (requirementId: string) => void;
  onToggleWaiver: (requirementId: string) => void;
  onReportIssue?: (task: Task) => void;
}) {
  const assignees = task.assigneeIds.map((id) => TASK_USER_BY_ID[id]).filter(Boolean);
  const canViewSensitiveContext = canManageTasks || task.assigneeIds.includes(currentUserId);
  return (
    <>
      <ExecutionPanel
        task={task}
        canExecute={canEdit}
        canCloseReopen={canCloseReopen}
        closeArmed={closeArmed}
        setCloseArmed={setCloseArmed}
        elapsedSeconds={elapsedSeconds}
        completionSummary={completionSummary}
        setCompletionSummary={setCompletionSummary}
        onSaveSummary={onSaveSummary}
        syncState={syncState}
        syncError={syncError}
        queuedStatus={queuedStatus}
        onRetryQueuedStatus={onRetryQueuedStatus}
        onSetStatus={onSetStatus}
      />

      {requirements.length > 0 && (
        <RequirementsPanel
          requirements={requirements}
          requirementState={requirementState}
          signals={completionSignals}
          canEdit={canEdit}
          canWaive={canManageTasks}
          missing={missingCompletionRequirements}
          onToggleRequirement={onToggleRequirement}
          onToggleWaiver={onToggleWaiver}
        />
      )}

      {task.description && (
        <Section title="Original description">
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{task.description}</p>
        </Section>
      )}

      <Section title="Property context">
        <PropertyContextPanel task={task} canViewSensitiveContext={canViewSensitiveContext} />
      </Section>

      {onReportIssue && canEdit && (
        <Section title="Report related issue">
          <div className="ops-related-report">
            <span>
              Create a separate reported issue from this task. Property and reservation context are inherited, but guest/access details are not copied into the report text.
            </span>
            <button type="button" className="btn ghost sm" onClick={() => onReportIssue(task)}>
              Report issue
            </button>
          </div>
        </Section>
      )}

      <Section title="Assignees">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {assignees.length === 0 && <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Unassigned</span>}
          {assignees.map((u) => (
            <span key={u.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  background: u.avatarColor,
                  color: 'white',
                  fontSize: 9,
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {u.initials}
              </span>
              {u.name}
            </span>
          ))}
        </div>
      </Section>

      {task.reservationId && (
        <Section title="Staff-safe reservation context">
          <ReservationPanel reservationId={task.reservationId} staffMode={role === 'field'} />
        </Section>
      )}

      <Section title={`Evidence · ${task.attachmentCount + evidenceQueue.length}`}>
        <EvidencePanel task={task} evidenceQueue={evidenceQueue} onEvidenceSelected={onEvidenceSelected} />
      </Section>

      <Section title="Access">
        <AccessPanel task={task} role={role} currentUserId={currentUserId} canManageTasks={canManageTasks} />
      </Section>

      <Section title="Details">
        <DetailsPanel task={task} />
      </Section>

      {task.aiSuggestions.length > 0 && (
        <Section title="AI panel">
          <AIPanel task={task} />
        </Section>
      )}

      <CostLines task={task} canEdit={canEdit} canSeeFinance={canSeeFinance} onAddCost={onAddCost} />

      <Section title="Activity">
        <ActivityLog entries={task.activityLog} />
      </Section>
    </>
  );
}

function ExecutionPanel({
  task,
  canExecute,
  canCloseReopen,
  closeArmed,
  setCloseArmed,
  elapsedSeconds,
  completionSummary,
  setCompletionSummary,
  onSaveSummary,
  syncState,
  syncError,
  queuedStatus,
  onRetryQueuedStatus,
  onSetStatus,
}: {
  task: Task;
  canExecute: boolean;
  canCloseReopen: boolean;
  closeArmed: boolean;
  setCloseArmed: (v: boolean) => void;
  elapsedSeconds: number;
  completionSummary: string;
  setCompletionSummary: (v: string) => void;
  onSaveSummary: () => void;
  syncState: SyncState;
  syncError: string | null;
  queuedStatus: Task['status'] | null;
  onRetryQueuedStatus: () => void;
  onSetStatus: (s: Task['status']) => void;
}) {
  const needsSummary = task.status !== 'closed' && task.status !== 'cancelled';
  return (
    <Section title="Execution">
      <div className="ops-execution-panel">
        <div className="ops-execution-topline">
          <div>
            <span className="ops-mobile-kicker">Time on task</span>
            <strong className="ops-execution-time">{formatDuration(elapsedSeconds)}</strong>
            <small>
              {task.estimatedMinutes ? `Estimated ${formatDuration(task.estimatedMinutes * 60)}` : 'No estimate set'}
            </small>
          </div>
          <ExecutionButtons
            task={task}
            canExecute={canExecute}
            canCloseReopen={canCloseReopen}
            closeArmed={closeArmed}
            setCloseArmed={setCloseArmed}
            onSetStatus={onSetStatus}
          />
        </div>
        <SyncNotice
          syncState={syncState}
          syncError={syncError}
          queuedStatus={queuedStatus}
          onRetryQueuedStatus={onRetryQueuedStatus}
        />
        {needsSummary && (
          <div className="ops-summary-editor">
            <label htmlFor={`task-summary-${task.id}`}>Execution summary</label>
            <textarea
              id={`task-summary-${task.id}`}
              value={completionSummary}
              onChange={(e) => setCompletionSummary(e.target.value)}
              placeholder="What changed, what was found, what remains..."
            />
            <div className="ops-summary-actions">
              <span>Saved summaries are stored as task comments; the original description stays unchanged.</span>
              <button className="btn ghost sm" onClick={onSaveSummary} disabled={!completionSummary.trim()}>
                Save summary
              </button>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

function RequirementsPanel({
  requirements,
  requirementState,
  signals,
  canEdit,
  canWaive,
  missing,
  onToggleRequirement,
  onToggleWaiver,
}: {
  requirements: TaskRequirement[];
  requirementState: TaskRequirementState;
  signals: CompletionSignals;
  canEdit: boolean;
  canWaive: boolean;
  missing: TaskRequirement[];
  onToggleRequirement: (requirementId: string) => void;
  onToggleWaiver: (requirementId: string) => void;
}) {
  const completed = requirements.filter((req) => requirementSatisfied(req, requirementState, signals)).length;
  return (
    <Section title={`Requirements · ${completed}/${requirements.length}`}>
      <div className="ops-requirements-panel">
        {missing.length > 0 && (
          <div className="ops-requirement-alert" role="alert">
            Complete is blocked by {missing.map((req) => req.label).join(', ')}.
          </div>
        )}
        <div className="ops-requirement-list">
          {requirements.map((requirement) => (
            <RequirementRow
              key={requirement.id}
              requirement={requirement}
              state={requirementState}
              signals={signals}
              canEdit={canEdit}
              canWaive={canWaive}
              onToggleRequirement={onToggleRequirement}
              onToggleWaiver={onToggleWaiver}
            />
          ))}
        </div>
      </div>
    </Section>
  );
}

function RequirementRow({
  requirement,
  state,
  signals,
  canEdit,
  canWaive,
  onToggleRequirement,
  onToggleWaiver,
}: {
  requirement: TaskRequirement;
  state: TaskRequirementState;
  signals: CompletionSignals;
  canEdit: boolean;
  canWaive: boolean;
  onToggleRequirement: (requirementId: string) => void;
  onToggleWaiver: (requirementId: string) => void;
}) {
  const waived = state.waivedIds.includes(requirement.id);
  const done = requirementSatisfied(requirement, state, signals);
  const manual = requirement.kind === 'check' || requirement.kind === 'supply';
  const tone = waived ? 'waived' : done ? 'done' : requirement.required ? 'missing' : 'optional';
  return (
    <div className={`ops-requirement-row ${tone}`}>
      <button
        type="button"
        className="ops-requirement-toggle"
        aria-pressed={done}
        disabled={!canEdit || !manual}
        onClick={() => onToggleRequirement(requirement.id)}
        title={manual ? 'Toggle requirement' : 'This requirement is checked from task evidence'}
      >
        {done ? 'Done' : manual ? 'Mark' : 'Auto'}
      </button>
      <div className="ops-requirement-copy">
        <div>
          <strong>{requirement.label}</strong>
          <span>{requirement.required ? 'Required' : 'Optional'} · {requirementKindLabel(requirement.kind)}</span>
        </div>
        {requirement.description && <small>{requirement.description}</small>}
        <small>{requirementStatusText(requirement, state, signals)}</small>
      </div>
      {canWaive && requirement.required && (
        <button
          type="button"
          className="btn ghost sm ops-requirement-waive"
          onClick={() => onToggleWaiver(requirement.id)}
        >
          {waived ? 'Unwaive' : 'Waive'}
        </button>
      )}
    </div>
  );
}

function ExecutionButtons({
  task,
  canExecute,
  canCloseReopen,
  closeArmed,
  setCloseArmed,
  onSetStatus,
}: {
  task: Task;
  canExecute: boolean;
  canCloseReopen: boolean;
  closeArmed: boolean;
  setCloseArmed: (v: boolean) => void;
  onSetStatus: (s: Task['status']) => void;
}) {
  const terminal = task.status === 'closed' || task.status === 'cancelled';
  const canWork = canExecute && !terminal && task.status !== 'completed';
  return (
    <div className="ops-execution-actions">
      {canWork && (task.status === 'reported' || task.status === 'scheduled' || task.status === 'ready') && (
        <button className="btn ghost sm" onClick={() => onSetStatus('in_progress')}>Start</button>
      )}
      {canWork && task.status === 'in_progress' && (
        <button className="btn ghost sm" onClick={() => onSetStatus('paused')}>Pause</button>
      )}
      {canWork && (task.status === 'paused' || task.status === 'blocked') && (
        <button className="btn ghost sm" onClick={() => onSetStatus('in_progress')}>Resume</button>
      )}
      {canWork && task.status !== 'blocked' && (
        <button className="btn ghost sm" onClick={() => onSetStatus('blocked')}>Block</button>
      )}
      {canWork && (
        <button className="btn primary sm" onClick={() => onSetStatus('completed')}>Complete</button>
      )}
      {canCloseReopen && task.status === 'completed' && (
        closeArmed ? (
          <button className="btn primary sm" onClick={() => onSetStatus('closed')}>Confirm close</button>
        ) : (
          <button className="btn ghost sm" onClick={() => setCloseArmed(true)}>Close task</button>
        )
      )}
      {canCloseReopen && task.status === 'closed' && (
        <button className="btn ghost sm" onClick={() => onSetStatus('ready')}>Reopen</button>
      )}
    </div>
  );
}

function SyncNotice({
  syncState,
  syncError,
  queuedStatus,
  onRetryQueuedStatus,
}: {
  syncState: SyncState;
  syncError: string | null;
  queuedStatus: Task['status'] | null;
  onRetryQueuedStatus: () => void;
}) {
  if (syncState === 'idle') return null;
  const label =
    syncState === 'saving' ? 'Syncing change...' :
      syncState === 'saved' ? 'Saved' :
        syncState === 'queued' ? 'Queued locally' :
          'Sync failed';
  return (
    <div className={`ops-sync-notice ${syncState}`}>
      <span>{label}</span>
      {syncError && <small>{syncError}</small>}
      {queuedStatus && (
        <button className="btn ghost sm" onClick={onRetryQueuedStatus}>
          Retry {STATUS_LABEL[queuedStatus].toLowerCase()}
        </button>
      )}
    </div>
  );
}

function MobileExecutionBar({
  task,
  canExecute,
  canCloseReopen,
  closeArmed,
  setCloseArmed,
  elapsedSeconds,
  syncState,
  queuedStatus,
  onSetStatus,
}: {
  task: Task;
  canExecute: boolean;
  canCloseReopen: boolean;
  closeArmed: boolean;
  setCloseArmed: (v: boolean) => void;
  elapsedSeconds: number;
  syncState: SyncState;
  queuedStatus: Task['status'] | null;
  onSetStatus: (s: Task['status']) => void;
}) {
  return (
    <div className="ops-mobile-execution-bar">
      <div className="ops-mobile-execution-meta">
        <span>{task.status === 'in_progress' ? 'Running' : STATUS_LABEL[task.status]}</span>
        <strong>{formatDuration(elapsedSeconds)}</strong>
        {syncState === 'saving' && <small>Syncing</small>}
        {syncState === 'queued' && <small>Queued{queuedStatus ? `: ${STATUS_LABEL[queuedStatus]}` : ''}</small>}
      </div>
      <ExecutionButtons
        task={task}
        canExecute={canExecute}
        canCloseReopen={canCloseReopen}
        closeArmed={closeArmed}
        setCloseArmed={setCloseArmed}
        onSetStatus={onSetStatus}
      />
    </div>
  );
}

function PropertyContextPanel({ task, canViewSensitiveContext }: { task: Task; canViewSensitiveContext: boolean }) {
  const property = PROPERTY_BY_CODE[task.propertyCode];
  if (!property) {
    return <div className="ops-context-panel">Property {task.propertyCode || 'not linked'}.</div>;
  }
  const sourceLine =
    task.source === 'reported_issue' ? 'Linked from field issue report' :
      task.source === 'inbox_ai' ? 'Linked from Inbox AI proposal' :
        task.source === 'reservation_trigger' ? 'Linked from reservation workflow' :
          'No separate issue record linked';
  return (
    <div className="ops-context-panel">
      <div>
        <span className="ops-mobile-kicker">Property</span>
        <strong>{property.code} · {property.name}</strong>
        <small>{property.area} · {property.bedrooms} bed · {property.maxOccupancy} pax</small>
      </div>
      <div>
        <span className="ops-mobile-kicker">Location</span>
        <strong>{canViewSensitiveContext ? property.address : 'Hidden until assigned'}</strong>
        <small>{property.lifecycleStatus.replace('_', ' ')}</small>
      </div>
      <div>
        <span className="ops-mobile-kicker">Issue context</span>
        <strong>{sourceLine}</strong>
        <small>{task.tags.length > 0 ? task.tags.join(', ') : 'No issue tags'}</small>
      </div>
    </div>
  );
}

function EvidencePanel({
  task,
  evidenceQueue,
  onEvidenceSelected,
}: {
  task: Task;
  evidenceQueue: EvidenceItem[];
  onEvidenceSelected: (files: FileList | null) => void;
}) {
  return (
    <div className="ops-evidence-panel">
      {task.attachmentCount > 0 && (
        <div className="ops-attachment-grid">
          {Array.from({ length: Math.min(task.attachmentCount, 8) }).map((_, i) => (
            <div key={i} className="ops-attachment-tile">attachment {i + 1}</div>
          ))}
          {task.attachmentCount > 8 && (
            <div className="ops-attachment-tile">+{task.attachmentCount - 8} more</div>
          )}
        </div>
      )}
      <label className="btn ghost sm ops-evidence-pick">
        Add photo/file
        <input
          type="file"
          accept="image/*,.pdf"
          capture="environment"
          multiple
          onChange={(e) => {
            onEvidenceSelected(e.currentTarget.files);
            e.currentTarget.value = '';
          }}
        />
      </label>
      {evidenceQueue.length === 0 ? (
        <div className="ops-evidence-empty">No local evidence queued.</div>
      ) : (
        <div className="ops-evidence-queue">
          {evidenceQueue.map((file) => (
            <div key={file.id} className="ops-evidence-row">
              <span>{file.name}</span>
              <small>{formatBytes(file.size)} · queued locally</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AccessPanel({
  task,
  role,
  currentUserId,
  canManageTasks,
}: {
  task: Task;
  role: NonNullable<ReturnType<typeof usePermissions>['role']>;
  currentUserId: string;
  canManageTasks: boolean;
}) {
  const policy = accessPolicyFor(task, role, currentUserId, canManageTasks);
  return (
    <div className={`ops-access-panel ${policy.allowed ? 'open' : 'locked'}`}>
      <strong>{policy.title}</strong>
      <span>{policy.body}</span>
      {policy.windowLabel && <small>{policy.windowLabel}</small>}
    </div>
  );
}

function DetailsPanel({ task }: { task: Task }) {
  const assignees = task.assigneeIds
    .map((id) => TASK_USER_BY_ID[id]?.name || id)
    .join(', ') || 'Unassigned';
  const requester = task.requesterId ? TASK_USER_BY_ID[task.requesterId]?.name || task.requesterId : 'System/import';
  const externalId = task.externalRef || task.bzId || 'None';
  return (
    <div className="ops-details-grid">
      <DetailPair label="Last updated" value={formatDateTime(task.updatedAt)} />
      <DetailPair label="Created" value={formatDateTime(task.createdAt)} />
      <DetailPair label="Created by" value={requester} />
      <DetailPair label="Source" value={sourceLabel(task.source)} />
      <DetailPair label="External task ID" value={externalId} mono />
      <DetailPair label="Assignees" value={assignees} />
      <DetailPair label="Priority" value={task.priority} />
      <DetailPair label="Due" value={formatDue(task)} />
      <DetailPair label="Status" value={STATUS_LABEL[task.status]} />
    </div>
  );
}

function DetailPair({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span>{label}</span>
      <strong className={mono ? 'mono' : undefined}>{value}</strong>
    </div>
  );
}

function CostLines({
  task,
  canEdit,
  canSeeFinance,
  onAddCost,
}: {
  task: Task;
  canEdit: boolean;
  canSeeFinance: boolean;
  onAddCost: () => void;
}) {
  const total = task.costs.reduce((s, c) => s + c.amount, 0);
  const ownerBillable = task.costs.filter((c) => c.ownerCharge);
  return (
    <Section title={`Cost lines · ${task.costs.length}`}>
      {task.costs.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
          No costs recorded yet.
        </div>
      )}
      {task.costs.map((c) => (
        <CostRow key={c.id} cost={c} task={task} canSeeFinance={canSeeFinance} />
      ))}
      {task.costs.length > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 8,
            padding: '8px 0',
            borderTop: '0.5px solid var(--color-border-tertiary)',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          <span>Total</span>
          <span className="mono">{total.toLocaleString('en-MU')} {task.costs[0]?.currency ?? 'MUR'}</span>
        </div>
      )}
      {ownerBillable.length > 0 && (
        <div
          style={{
            marginTop: 8,
            padding: '8px 10px',
            background: 'var(--color-bg-success)',
            borderLeft: '3px solid var(--color-text-success)',
            color: 'var(--color-text-success)',
            borderRadius: 4,
            fontSize: 11,
          }}
        >
          🔄 {ownerBillable.length} line{ownerBillable.length === 1 ? '' : 's'} flowing to Finance · owner-billable
        </div>
      )}
      {canEdit && (
        <button
          className="btn ghost sm"
          onClick={onAddCost}
          style={{ marginTop: 10 }}
        >
          <IconPlus size={11} /> Add cost
        </button>
      )}
    </Section>
  );
}

function CostRow({ cost, task, canSeeFinance }: { cost: TaskCost; task: Task; canSeeFinance: boolean }) {
  const addedBy = TASK_USER_BY_ID[cost.addedBy];
  // Find the linked FinExpense — either by direct id or by sourceTaskId match.
  const linkedExpense = useMemo(() => {
    if (cost.flowedToFinanceExpenseId) {
      return FIN_EXPENSES.find((e) => e.id === cost.flowedToFinanceExpenseId);
    }
    if (cost.ownerCharge) {
      return FIN_EXPENSES.find((e) => e.sourceTaskId === task.id);
    }
    return undefined;
  }, [cost, task.id]);

  return (
    <div
      style={{
        padding: '6px 0',
        borderBottom: '0.5px dashed var(--color-border-tertiary)',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase', fontSize: 10, width: 70 }}>
          {cost.type.replace('_', ' ')}
        </span>
        <span style={{ flex: 1 }}>{cost.description}</span>
        <span className="mono" style={{ fontWeight: 500 }}>
          {cost.amount.toLocaleString('en-MU')} {cost.currency}
        </span>
        {cost.ownerCharge && (
          <span
            className="chip"
            style={{ fontSize: 9, background: 'var(--color-bg-success)', color: 'var(--color-text-success)', padding: '0 5px' }}
            title="Flows to Finance as owner-billable"
          >
            OWNER
          </span>
        )}
        {addedBy && (
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{addedBy.name.split(' ')[0]}</span>
        )}
      </div>
      {cost.ownerCharge && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, paddingLeft: 78, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          <span>→ Flowing to Finance</span>
          {linkedExpense && canSeeFinance && (
            <a
              href={`/fad?m=finance&sub=transactions&capture=${linkedExpense.id}`}
              style={{ color: 'var(--color-brand-accent)', textDecoration: 'none', fontWeight: 500 }}
              onClick={(e) => {
                e.preventDefault();
                fireToast(`Would navigate to Finance > capture ${linkedExpense.id}`);
              }}
            >
              View capture →
            </a>
          )}
          {!linkedExpense && (
            <span style={{ fontStyle: 'italic' }}>(pending capture creation)</span>
          )}
        </div>
      )}
    </div>
  );
}

function AIPanel({ task }: { task: Task }) {
  return (
    <div
      style={{
        padding: 12,
        background: 'var(--color-brand-accent-softer)',
        borderLeft: '3px solid var(--color-brand-accent)',
        borderRadius: 6,
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      {task.aiSuggestions.map((s, i) => (
        <AISuggestionRow key={i} suggestion={s} />
      ))}
      {task.inboxThreadId && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          📨 Drafted from inbox thread · <code>{task.inboxThreadId}</code>
        </div>
      )}
      {task.groupEmailId && (
        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          ✉️ From group email · <code>{task.groupEmailId}</code>
        </div>
      )}
    </div>
  );
}

function suggestionKindToSurface(kind: Task['aiSuggestions'][number]['kind']): AISurface {
  if (kind === 'urgency_bump' || kind === 'reservation_aware') return 'reservation_urgency';
  if (kind === 'thread_summary') return 'thread_summary';
  if (kind === 'route') return 'auto_triage';
  if (kind === 'assign') return 'suggested_assignment';
  if (kind === 'risk') return 'risk_flag';
  if (kind === 'owner_charge') return 'owner_charge';
  return 'risk_flag';
}

function AISuggestionRow({ suggestion }: { suggestion: Task['aiSuggestions'][number] }) {
  const [feedback, setFeedback] = useState<'accepted' | 'rejected' | null>(null);
  const telemetry = useAITelemetry();
  const surface = suggestionKindToSurface(suggestion.kind);

  const onAccept = () => {
    setFeedback('accepted');
    telemetry.recordAccept(surface, { kind: suggestion.kind, confidence: suggestion.confidence });
  };
  const onReject = () => {
    setFeedback('rejected');
    telemetry.recordOverride(surface, { kind: suggestion.kind });
  };
  const onRegenerate = () => {
    telemetry.recordRegenerate(surface, { kind: suggestion.kind });
    fireToast('Regenerating suggestion (canned response Phase 1)');
  };

  return (
    <div style={{ marginBottom: 6, paddingBottom: 6, borderBottom: '0.5px dashed var(--color-border-tertiary)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-brand-accent)' }}>
          {suggestion.kind.replace('_', ' ')}
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <AIConfidenceChip percent={Math.round(suggestion.confidence * 100)} />
        </span>
      </div>
      <div style={{ marginTop: 2 }}>{suggestion.message}</div>
      {feedback === null && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          <button className="btn ghost sm" onClick={onAccept} style={{ fontSize: 10, padding: '2px 8px' }}>
            Accept
          </button>
          <button className="btn ghost sm" onClick={onReject} style={{ fontSize: 10, padding: '2px 8px' }}>
            Reject
          </button>
          <button className="btn ghost sm" onClick={onRegenerate} style={{ fontSize: 10, padding: '2px 8px' }}>
            Regenerate
          </button>
        </div>
      )}
      {feedback && (
        <div style={{ marginTop: 4, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
          Feedback recorded: {feedback}
        </div>
      )}
    </div>
  );
}

function ActivityLog({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>No activity yet.</div>;
  }
  const sorted = [...entries].sort((a, b) => b.ts.localeCompare(a.ts));
  return (
    <div>
      {sorted.map((e) => {
        const actor = TASK_USER_BY_ID[e.actorId];
        return (
          <div
            key={e.id}
            style={{
              display: 'flex',
              gap: 8,
              padding: '4px 0',
              fontSize: 11,
              alignItems: 'baseline',
              borderBottom: '0.5px dashed var(--color-border-tertiary)',
            }}
          >
            <span style={{ width: 80, color: 'var(--color-text-tertiary)' }}>
              {formatActivityTime(e.ts)}
            </span>
            <span style={{ width: 60, fontWeight: 500, color: 'var(--color-brand-accent)' }}>
              {e.kind.replace('_', ' ')}
            </span>
            <span style={{ flex: 1 }}>
              {e.detail || ''}
              {actor && (
                <span style={{ marginLeft: 6, color: 'var(--color-text-tertiary)' }}>· {actor.name.split(' ')[0]}</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Comments({
  task,
  draft,
  setDraft,
  currentUserId,
  onSend,
}: {
  task: Task;
  draft: string;
  setDraft: (s: string) => void;
  currentUserId: string;
  onSend?: () => void;
}) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const sortedComments = useMemo(() => [...task.comments].sort((a, b) => a.ts.localeCompare(b.ts)), [task]);
  const mentionIds = useMemo(() => resolveTaskCommentMentions(draft), [draft]);
  const mentionCandidates = useMemo(
    () => TASK_USERS.filter((user) => user.active && user.role !== 'external' && user.id !== currentUserId).slice(0, 8),
    [currentUserId],
  );

  return (
    <Section title={`Comments · ${task.comments.length}`}>
      {task.comments.length > 5 && (
        <div style={{ marginBottom: 10 }}>
          <button
            className="btn ghost sm"
            onClick={() => setSummaryOpen((o) => !o)}
          >
            <IconSparkle size={11} /> {summaryOpen ? 'Hide' : 'Summarize thread'}
          </button>
          {summaryOpen && (
            <div
              style={{
                marginTop: 6,
                padding: 10,
                background: 'var(--color-brand-accent-softer)',
                borderLeft: '3px solid var(--color-brand-accent)',
                borderRadius: 4,
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              {generateThreadSummary(task)}
            </div>
          )}
        </div>
      )}
      {sortedComments.map((c) => (
        <CommentRow key={c.id} comment={c} />
      ))}
      {task.comments.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>No comments yet.</div>
      )}
      {onSend && (
        <div style={{ marginTop: 10 }}>
          <textarea
            placeholder="Add a comment… (use @ to mention)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ width: '100%', minHeight: 60, padding: 8, fontSize: 13, fontFamily: 'inherit' }}
          />
          <div className="ops-mention-picker" aria-label="Mention staff">
            {mentionCandidates.map((user) => (
              <button
                key={user.id}
                type="button"
                className={mentionIds.includes(user.id) ? 'active' : ''}
                onClick={() => setDraft(appendMentionToken(draft, user.id))}
              >
                @{user.name.split(' ')[0]}
              </button>
            ))}
          </div>
          {mentionIds.length > 0 && (
            <div className="ops-mention-preview">
              Notifies {mentionIds.map((id) => TASK_USER_BY_ID[id]?.name ?? id).join(', ')} in TeamInbox and Notifications.
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button className="btn primary sm" onClick={onSend} disabled={!draft.trim()}>
              Post comment
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

function CommentRow({ comment }: { comment: TaskComment }) {
  const author = TASK_USER_BY_ID[comment.authorId];
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 10, padding: '8px 0', borderBottom: '0.5px dashed var(--color-border-tertiary)' }}>
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          background: author?.avatarColor ?? '#94a3b8',
          color: 'white',
          fontSize: 10,
          fontWeight: 500,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {author?.initials ?? '??'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>{author?.name ?? 'Unknown'}</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{formatActivityTime(comment.ts)}</span>
          {comment.syncedToBreezeway && (
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>· synced</span>
          )}
        </div>
        <div style={{ marginTop: 2, fontSize: 13 }}>{renderMentions(comment.text)}</div>
      </div>
    </div>
  );
}

function renderMentions(text: string): React.ReactNode {
  const parts = text.split(/(@[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/g);
  return parts.map((p, i) =>
    p.startsWith('@') ? (
      <span
        key={i}
        style={{
          color: 'var(--color-brand-accent)',
          background: 'var(--color-background-tertiary)',
          padding: '0 4px',
          borderRadius: 3,
          fontWeight: 500,
        }}
      >
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function latestExecutionSummary(task: Task): string {
  const summary = [...task.comments]
    .reverse()
    .find((comment) => comment.text.trim().toLowerCase().startsWith(SUMMARY_PREFIX.toLowerCase()));
  if (!summary) return '';
  return summary.text.trim().slice(SUMMARY_PREFIX.length).trim();
}

function minutesToSeconds(minutes?: number): number {
  return Math.max(0, Math.round((minutes ?? 0) * 60));
}

function shouldPatchSpentMinutes(from: Task['status'], to: Task['status']): boolean {
  if (from === 'in_progress') return true;
  return to === 'completed' || to === 'blocked' || to === 'paused';
}

function requirementKindLabel(kind: TaskRequirement['kind']): string {
  const labels: Record<TaskRequirement['kind'], string> = {
    check: 'Checklist',
    photo: 'Photo',
    file: 'File',
    expense: 'Expense',
    supply: 'Supply',
    time: 'Time',
    summary: 'Summary',
  };
  return labels[kind];
}

function requirementStatusText(
  requirement: TaskRequirement,
  state: TaskRequirementState,
  signals: CompletionSignals,
): string {
  if (state.waivedIds.includes(requirement.id)) return 'Waived by manager.';
  if (requirement.kind === 'check' || requirement.kind === 'supply') {
    return state.completedIds.includes(requirement.id) ? 'Marked complete.' : 'Needs manual confirmation.';
  }
  if (requirement.kind === 'photo' || requirement.kind === 'file') {
    const count = signals.attachmentCount + signals.queuedEvidenceCount;
    if (count > 0) return `${count} evidence item${count === 1 ? '' : 's'} attached or queued.`;
    return requirement.evidenceHint || 'Attach evidence before completing.';
  }
  if (requirement.kind === 'expense') {
    return signals.costCount > 0 ? `${signals.costCount} cost line${signals.costCount === 1 ? '' : 's'} recorded.` : 'Add a cost line before completing.';
  }
  if (requirement.kind === 'time') {
    return signals.spentMinutes > 0 || signals.elapsedSeconds > 0 ? 'Time captured.' : 'Start the timer or record spent minutes.';
  }
  if (requirement.kind === 'summary') {
    return signals.summary.trim() ? 'Summary ready.' : 'Write the execution summary before completing.';
  }
  return 'Waiting for completion.';
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  return `${m}m`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatActivityTime(ts: string): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

function formatDateTime(value?: string): string {
  if (!value) return 'Not set';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function dueDateTime(task: Task): Date | null {
  if (!task.dueDate) return null;
  const time = task.dueTime || '12:00';
  const d = new Date(`${task.dueDate}T${time.length === 5 ? `${time}:00` : time}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDue(task: Task): string {
  const d = dueDateTime(task);
  if (!d) return 'Not scheduled';
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sourceLabel(source: Task['source']): string {
  const labels: Record<Task['source'], string> = {
    manual: 'Manual',
    breezeway: 'Breezeway import',
    inbox_ai: 'Inbox AI',
    guesty: 'Guesty',
    recurring: 'Recurring template',
    reservation_trigger: 'Reservation workflow',
    group_email: 'Group email',
    friday: 'Friday system',
    reported_issue: 'Field issue report',
    personal: 'Personal task',
    review: 'Review workflow',
  };
  return labels[source] || source;
}

function accessPolicyFor(
  task: Task,
  role: NonNullable<ReturnType<typeof usePermissions>['role']>,
  currentUserId: string,
  canManageTasks: boolean,
): { allowed: boolean; title: string; body: string; windowLabel?: string } {
  const terminal = task.status === 'closed' || task.status === 'cancelled' || task.status === 'completed';
  const due = dueDateTime(task);
  const assigned = task.assigneeIds.includes(currentUserId);

  if (canManageTasks && role !== 'field') {
    return {
      allowed: false,
      title: 'Access policy',
      body: 'Managers can audit the access window here. Codes stay in the secure property/access source, not in this task drawer.',
      windowLabel: due ? `Field window opens ${EXECUTION_WINDOW_HOURS}h before ${formatDue(task)}` : 'Schedule the task before access can open.',
    };
  }

  if (!assigned) {
    return {
      allowed: false,
      title: 'Access hidden',
      body: 'Only assigned field staff can request task access.',
    };
  }

  if (terminal) {
    return {
      allowed: false,
      title: 'Access closed',
      body: 'Access details are hidden once the task is completed, closed, or cancelled.',
    };
  }

  if (!due) {
    return {
      allowed: false,
      title: 'Access pending schedule',
      body: 'A manager must schedule this task before field access can open.',
    };
  }

  const now = Date.now();
  const opensAt = due.getTime() - EXECUTION_WINDOW_HOURS * 60 * 60 * 1000;
  const closesAt = due.getTime() + EXECUTION_GRACE_HOURS * 60 * 60 * 1000;
  if (now < opensAt || now > closesAt) {
    return {
      allowed: false,
      title: 'Access hidden',
      body: 'Access is time-gated for assigned field work.',
      windowLabel: `Window: ${new Date(opensAt).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} - ${new Date(closesAt).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
    };
  }

  return {
    allowed: true,
    title: 'Access window open',
    body: 'Assigned task access can be requested now. No access code is displayed in this Operations view.',
    windowLabel: `Window closes ${new Date(closesAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
  };
}

function generateThreadSummary(task: Task): string {
  // Phase 1 canned summary built from the comment metadata.
  const decisions = task.aiSuggestions.find((s) => s.kind === 'thread_summary');
  if (decisions) return decisions.message;
  const lastComment = task.comments[task.comments.length - 1];
  const author = lastComment ? TASK_USER_BY_ID[lastComment.authorId] : undefined;
  return `${task.comments.length} comments · last update from ${author?.name.split(' ')[0] ?? 'someone'}: "${lastComment?.text ?? ''}".`;
}

function ReservationPanel({ reservationId, staffMode }: { reservationId: string; staffMode: boolean }) {
  const rsv = RESERVATION_BY_ID[reservationId];
  if (!rsv) {
    return (
      <span className="chip" style={{ fontSize: 11 }}>
        Reservation {reservationId}
      </span>
    );
  }
  return (
    <div
      style={{
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 8,
        padding: 12,
        background: 'var(--color-background-secondary)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="mono" style={{ fontSize: 12, fontWeight: 500 }}>
          {rsv.id}
        </span>
        <span
          style={{
            fontSize: 10,
            padding: '2px 6px',
            borderRadius: 4,
            background: 'var(--color-brand-accent-soft)',
            color: 'var(--color-brand-accent)',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {RES_STATUS_LABEL[rsv.status]}
        </span>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
          {CHANNEL_LABEL[rsv.channel]}
        </span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>
        {staffMode ? 'Guest record linked' : rsv.guestName}
        <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}>
          {' · '}
          {rsv.propertyCode}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
        {formatStayWindow(rsv)}
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        {rsv.partySize.adults} adult{rsv.partySize.adults === 1 ? '' : 's'}
        {rsv.partySize.children > 0 && ` · ${rsv.partySize.children} child${rsv.partySize.children === 1 ? '' : 'ren'}`}
      </div>
      {!staffMode && rsv.notes && (
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
          {rsv.notes}
        </div>
      )}
      {!staffMode && (
        <button
          className="btn ghost sm"
          style={{ alignSelf: 'flex-start', marginTop: 4 }}
          onClick={() => window.location.assign(`/fad?m=reservations&sub=overview&rsv=${rsv.id}`)}
        >
          Open reservation
        </button>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-tertiary)',
          fontWeight: 500,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function RiskFlagBadge({ flag, label }: { flag: string; label: string }) {
  const [open, setOpen] = useState(false);
  const explanations = RISK_FLAG_EXPLANATIONS[flag] ?? [];
  const explanation = explanations.length > 0 ? pickFromPool(explanations) : undefined;
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => explanation && setOpen((v) => !v)}
        style={{
          fontSize: 10,
          padding: '2px 8px',
          borderRadius: 4,
          background: 'var(--color-bg-warning)',
          color: 'var(--color-text-warning)',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          border: 0,
          cursor: explanation ? 'pointer' : 'default',
        }}
        title={explanation ?? `Risk flag: ${label}`}
      >
        ⚠ {label}
      </button>
      {open && explanation && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              padding: 10,
              background: 'var(--color-background-primary)',
              border: '0.5px solid var(--color-border-secondary)',
              borderRadius: 6,
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              minWidth: 280,
              maxWidth: 360,
              zIndex: 10,
              fontSize: 11,
              lineHeight: 1.5,
              color: 'var(--color-text-secondary)',
            }}
          >
            <div style={{ fontWeight: 500, color: 'var(--color-text-warning)', marginBottom: 4 }}>⚠ {label}</div>
            {explanation}
          </div>
        </>
      )}
    </span>
  );
}

function Badge({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        padding: '2px 8px',
        borderRadius: 4,
        background: bg,
        color: fg,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {label}
    </span>
  );
}
