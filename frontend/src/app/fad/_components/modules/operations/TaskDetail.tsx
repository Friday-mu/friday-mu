'use client';

import { useMemo, useState } from 'react';
import {
  type ActivityEntry,
  type Task,
  type TaskComment,
  type TaskCost,
} from '../../../_data/tasks';
import { addComment, updateTask } from '../../../_data/tasksClient';
import { useTenantUsers } from '../../../_data/useTenantUsers';
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
import {
  RESERVATION_BY_ID,
  CHANNEL_LABEL,
  STATUS_LABEL as RES_STATUS_LABEL,
  formatStayWindow,
} from '../../../_data/reservations';

interface DetailProps {
  task: Task;
  mode: 'drawer' | 'page';
  onClose?: () => void;
  onExpand?: () => void;
  onBumpRev: () => void;
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
  todo: 'To do',
  in_progress: 'In progress',
  paused: 'Paused',
  reported: 'Reported',
  awaiting_approval: 'Awaiting approval',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// Status + priority badges resolve through the palette helper so dark mode
// auto-flips and the design system stays single-sourced.
const statusBadgeFor = (s: Task['status']) => toneStyle(taskStatusTone(s));
const priorityBadgeFor = (p: Task['priority']) => toneStyle(priorityTone(p));

export function TaskDetail({ task, mode, onClose, onExpand, onBumpRev }: DetailProps) {
  const currentUserId = useCurrentUserId();
  const { can } = usePermissions();
  const canEdit = can('tasks', 'write') || task.assigneeIds.includes(currentUserId);
  const canSeeFinance = useCanAccess('finance', 'read');
  const [draftComment, setDraftComment] = useState('');
  const [aiSummaryShown, setAiSummaryShown] = useState(false);
  const [addCostOpen, setAddCostOpen] = useState(false);

  const sendComment = async () => {
    const text = draftComment.trim();
    if (!text) return;
    await addComment({ taskId: task.id, authorId: currentUserId, text });
    setDraftComment('');
    onBumpRev();
  };

  const setStatus = async (status: Task['status']) => {
    await updateTask({ taskId: task.id, patch: { status }, actorId: currentUserId });
    onBumpRev();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Header
        task={task}
        mode={mode}
        onClose={onClose}
        onExpand={onExpand}
        onSetStatus={canEdit ? setStatus : undefined}
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <Body
          task={task}
          aiSummaryShown={aiSummaryShown}
          setAiSummaryShown={setAiSummaryShown}
          canEdit={canEdit}
          canSeeFinance={canSeeFinance}
          onAddCost={() => setAddCostOpen(true)}
        />
        <Comments task={task} draft={draftComment} setDraft={setDraftComment} onSend={canEdit ? sendComment : undefined} />
      </div>
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
  onSetStatus,
}: {
  task: Task;
  mode: 'drawer' | 'page';
  onClose?: () => void;
  onExpand?: () => void;
  onSetStatus?: (s: Task['status']) => void;
}) {
  const statusBadge = statusBadgeFor(task.status);
  const priorityBadge = priorityBadgeFor(task.priority);
  const riskFlags = task.riskFlags;

  return (
    <div style={{ padding: '14px 20px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {task.bzId && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            #{task.bzId}
          </span>
        )}
        <PropertyChip
          code={task.propertyCode}
          className="chip"
          style={{ fontSize: 11 }}
        >
          {task.propertyCode}
        </PropertyChip>
        <span className="chip" style={{ fontSize: 11 }}>
          {task.department} · {task.subdepartment.replace('_', ' ')}
        </span>
        <span style={{ flex: 1 }} />
        {mode === 'drawer' && onExpand && (
          <button className="fad-util-btn" onClick={onExpand} title="Open as page">
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
      {onSetStatus && task.status !== 'completed' && (
        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {task.status === 'todo' && <button className="btn ghost sm" onClick={() => onSetStatus('in_progress')}>Start</button>}
          {task.status === 'in_progress' && <button className="btn ghost sm" onClick={() => onSetStatus('paused')}>Pause</button>}
          {task.status === 'paused' && <button className="btn ghost sm" onClick={() => onSetStatus('in_progress')}>Resume</button>}
          <button className="btn primary sm" onClick={() => onSetStatus('completed')}>Mark complete</button>
        </div>
      )}
    </div>
  );
}

function Body({
  task,
  aiSummaryShown,
  setAiSummaryShown,
  canEdit,
  canSeeFinance,
  onAddCost,
}: {
  task: Task;
  aiSummaryShown: boolean;
  setAiSummaryShown: (v: boolean) => void;
  canEdit: boolean;
  canSeeFinance: boolean;
  onAddCost: () => void;
}) {
  const { byId: usersById } = useTenantUsers();
  // Narrow to non-undefined via type predicate — Map.get returns T | undefined.
  type AssigneeUser = NonNullable<ReturnType<typeof usersById.get>>;
  const assignees = task.assigneeIds
    .map((id) => usersById.get(id))
    .filter((u): u is AssigneeUser => Boolean(u));
  return (
    <>
      {task.description && (
        <Section title="Description">
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{task.description}</p>
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
        <Section title="Linked reservation">
          <ReservationPanel reservationId={task.reservationId} />
        </Section>
      )}

      {task.attachmentCount > 0 && (
        <Section title={`Attachments · ${task.attachmentCount}`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 6 }}>
            {Array.from({ length: Math.min(task.attachmentCount, 8) }).map((_, i) => (
              <div
                key={i}
                style={{
                  height: 60,
                  background: 'var(--color-background-secondary)',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  color: 'var(--color-text-tertiary)',
                }}
              >
                attachment {i + 1}
              </div>
            ))}
            {task.attachmentCount > 8 && (
              <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                +{task.attachmentCount - 8} more
              </div>
            )}
          </div>
        </Section>
      )}

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
  const { byId: usersById } = useTenantUsers();
  const addedBy = usersById.get(cost.addedBy);
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
  const { byId: usersById } = useTenantUsers();
  if (entries.length === 0) {
    return <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>No activity yet.</div>;
  }
  const sorted = [...entries].sort((a, b) => b.ts.localeCompare(a.ts));
  return (
    <div>
      {sorted.map((e) => {
        const actor = usersById.get(e.actorId);
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
  onSend,
}: {
  task: Task;
  draft: string;
  setDraft: (s: string) => void;
  onSend?: () => void;
}) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const { byId: usersById } = useTenantUsers();
  const sortedComments = useMemo(() => [...task.comments].sort((a, b) => a.ts.localeCompare(b.ts)), [task]);

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
              {generateThreadSummary(task, usersById)}
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
  const { byId: usersById } = useTenantUsers();
  const author = usersById.get(comment.authorId);
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

function formatActivityTime(ts: string): string {
  const d = new Date(ts);
  const today = new Date('2026-04-27');
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

function generateThreadSummary(task: Task, usersById: Map<string, { name: string }>): string {
  // Phase 1 canned summary built from the comment metadata.
  const decisions = task.aiSuggestions.find((s) => s.kind === 'thread_summary');
  if (decisions) return decisions.message;
  const lastComment = task.comments[task.comments.length - 1];
  const author = lastComment ? usersById.get(lastComment.authorId) : undefined;
  return `${task.comments.length} comments · last update from ${author?.name.split(' ')[0] ?? 'someone'}: "${lastComment?.text ?? ''}".`;
}

function ReservationPanel({ reservationId }: { reservationId: string }) {
  const rsv = RESERVATION_BY_ID[reservationId];
  if (!rsv) {
    return (
      <span className="chip" style={{ fontSize: 11 }}>
        🛏 {reservationId}
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
          🛏 {rsv.id}
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
        {rsv.guestName}
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
      {rsv.notes && (
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
          {rsv.notes}
        </div>
      )}
      <button
        className="btn ghost sm"
        style={{ alignSelf: 'flex-start', marginTop: 4 }}
        onClick={() => window.location.assign(`/fad?m=reservations&sub=overview&rsv=${rsv.id}`)}
      >
        Open reservation →
      </button>
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
