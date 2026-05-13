'use client';

// design-be-18: shared shell behind BlockersPanel and NextActionsPanel.
// Tasks discriminated by `category` field live in design_tasks; this
// panel is the inline multi-item editor for one category, mounted at
// the top of the project overview screen.
//
// Behaviour summary:
//  - Renders open tasks (status != 'done') first, then a collapsible
//    Resolved (N) footer for status='done'.
//  - Inline "+ Add" with Enter-to-save. Empty submit is a no-op (per
//    locked decisions in the brief).
//  - Optimistic create: row appended immediately, rolled back on error.
//  - Checkbox toggles status open ↔ done. Title is debounce-saved.
//  - Each row exposes an "open details" affordance that routes to the
//    TaskDetailDrawer for the full field set.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createTask,
  deleteTask,
  listTasksByCategory,
  updateTask,
  type ApiTask,
  type ApiTaskCategory,
} from '../../../_data/designClient';
import { fireToast } from '../../Toaster';
import { TaskDetailDrawer } from './TaskDetailDrawer';

interface Props {
  projectId: string;
  category: Exclude<ApiTaskCategory, 'general'>;
  /** Title heading prefix shown before the count, e.g. "🚧 Blockers". */
  heading: string;
  /** Empty-state message when no tasks exist for this category. */
  emptyMessage: string;
  /** Placeholder shown in the inline add input. */
  addPlaceholder: string;
}

const TITLE_DEBOUNCE_MS = 600;

export function TaskItemsPanel({ projectId, category, heading, emptyMessage, addPlaceholder }: Props) {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState('');
  const [refetchKey, setRefetchKey] = useState(0);
  const [resolvedOpen, setResolvedOpen] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    listTasksByCategory(projectId, category)
      .then((rows) => {
        if (cancelled) return;
        setTasks(rows);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setLoadError(msg);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, category, refetchKey]);

  const { openTasks, resolvedTasks } = useMemo(() => {
    const open: ApiTask[] = [];
    const resolved: ApiTask[] = [];
    for (const t of tasks) {
      (t.status === 'done' ? resolved : open).push(t);
    }
    return { openTasks: open, resolvedTasks: resolved };
  }, [tasks]);

  const handleAdd = useCallback(async () => {
    const title = adding.trim();
    if (!title) return;
    setAdding('');
    // Optimistic: temporary id, rolled back on failure.
    const tempId = `temp-${Date.now()}`;
    const now = new Date().toISOString();
    const optimistic: ApiTask = {
      id: tempId,
      project_id: projectId,
      title,
      status: 'todo',
      category,
      created_at: now,
      updated_at: now,
    };
    setTasks((prev) => [...prev, optimistic]);
    try {
      const created = await createTask({ project_id: projectId, title, category, status: 'todo' });
      setTasks((prev) => prev.map((t) => (t.id === tempId ? created : t)));
    } catch (e) {
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
      const msg = e instanceof Error ? e.message : String(e);
      fireToast(`Could not save: ${msg}`);
    }
  }, [adding, projectId, category]);

  const handleToggleDone = useCallback(async (task: ApiTask) => {
    const nextStatus: ApiTask['status'] = task.status === 'done' ? 'todo' : 'done';
    const previous = task.status;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
    try {
      const updated = await updateTask(task.id, { status: nextStatus });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch (e) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: previous } : t)));
      const msg = e instanceof Error ? e.message : String(e);
      fireToast(`Could not update: ${msg}`);
    }
  }, []);

  const handleTitleChange = useCallback((id: string, title: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
  }, []);

  const handleTitleCommit = useCallback(async (id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      await updateTask(id, { title: trimmed });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      fireToast(`Could not rename: ${msg}`);
      setRefetchKey((k) => k + 1);
    }
  }, []);

  const handleAssigneeChange = useCallback(async (task: ApiTask, assigneeUserId: string | null) => {
    const previous = task.assignee_user_id;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, assignee_user_id: assigneeUserId } : t)));
    try {
      await updateTask(task.id, { assignee_user_id: assigneeUserId });
    } catch (e) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, assignee_user_id: previous ?? null } : t)));
      const msg = e instanceof Error ? e.message : String(e);
      fireToast(`Could not save assignee: ${msg}`);
    }
  }, []);

  const handleDueDateChange = useCallback(async (task: ApiTask, dueDate: string | null) => {
    const previous = task.due_date;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, due_date: dueDate } : t)));
    try {
      await updateTask(task.id, { due_date: dueDate });
    } catch (e) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, due_date: previous ?? null } : t)));
      const msg = e instanceof Error ? e.message : String(e);
      fireToast(`Could not save due date: ${msg}`);
    }
  }, []);

  const detailTask = detailTaskId ? tasks.find((t) => t.id === detailTaskId) ?? null : null;

  return (
    <div
      style={{
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-md)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <h3 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600 }}>
        {heading} <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 500 }}>({openTasks.length})</span>
      </h3>

      {loading && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading…</div>}
      {!loading && loadError && (
        <div style={{ fontSize: 12, color: 'var(--color-text-danger)' }}>Could not load: {loadError}</div>
      )}

      {!loading && !loadError && (
        <>
          {openTasks.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>{emptyMessage}</div>
          )}
          {openTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggleDone={() => handleToggleDone(task)}
              onTitleChange={(t) => handleTitleChange(task.id, t)}
              onTitleCommit={(t) => handleTitleCommit(task.id, t)}
              onAssigneeChange={(v) => handleAssigneeChange(task, v)}
              onDueDateChange={(v) => handleDueDateChange(task, v)}
              onOpenDetails={() => setDetailTaskId(task.id)}
            />
          ))}

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>+</span>
            <input
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder={addPlaceholder}
              style={{
                flex: 1,
                padding: '4px 8px',
                fontSize: 12,
                border: '0.5px solid var(--color-border-tertiary)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--color-text-primary)',
              }}
            />
          </div>

          {resolvedTasks.length > 0 && (
            <div style={{ marginTop: 6, borderTop: '0.5px dashed var(--color-border-tertiary)', paddingTop: 6 }}>
              <button
                type="button"
                onClick={() => setResolvedOpen((v) => !v)}
                style={{
                  background: 'transparent',
                  border: 0,
                  padding: 0,
                  fontSize: 11,
                  color: 'var(--color-text-tertiary)',
                  cursor: 'pointer',
                }}
              >
                {resolvedOpen ? '▾' : '▸'} Resolved ({resolvedTasks.length})
              </button>
              {resolvedOpen && (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {resolvedTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onToggleDone={() => handleToggleDone(task)}
                      onTitleChange={(t) => handleTitleChange(task.id, t)}
                      onTitleCommit={(t) => handleTitleCommit(task.id, t)}
                      onAssigneeChange={(v) => handleAssigneeChange(task, v)}
                      onDueDateChange={(v) => handleDueDateChange(task, v)}
                      onOpenDetails={() => setDetailTaskId(task.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {detailTask && (
        <TaskDetailDrawer
          task={detailTask}
          onSaved={() => setRefetchKey((k) => k + 1)}
          onDeleted={() => {
            setTasks((prev) => prev.filter((t) => t.id !== detailTask.id));
            setDetailTaskId(null);
          }}
          onClose={() => setDetailTaskId(null)}
        />
      )}
    </div>
  );
}

interface RowProps {
  task: ApiTask;
  onToggleDone: () => void;
  onTitleChange: (next: string) => void;
  onTitleCommit: (next: string) => void;
  onAssigneeChange: (next: string | null) => void;
  onDueDateChange: (next: string | null) => void;
  onOpenDetails: () => void;
}

function TaskRow({ task, onToggleDone, onTitleChange, onTitleCommit, onAssigneeChange, onDueDateChange, onOpenDetails }: RowProps) {
  const done = task.status === 'done';
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInput = (value: string) => {
    onTitleChange(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onTitleCommit(value);
    }, TITLE_DEBOUNCE_MS);
  };

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        opacity: done ? 0.55 : 1,
        fontSize: 12,
      }}
    >
      <input
        type="checkbox"
        checked={done}
        onChange={onToggleDone}
        aria-label={done ? 'Mark as not done' : 'Mark as done'}
        style={{ cursor: 'pointer' }}
      />
      <input
        value={task.title}
        onChange={(e) => handleInput(e.target.value)}
        onBlur={() => {
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
          }
          onTitleCommit(task.title);
        }}
        style={{
          flex: 1,
          padding: '3px 6px',
          fontSize: 12,
          border: '0.5px solid transparent',
          borderRadius: 'var(--radius-sm)',
          background: 'transparent',
          color: 'var(--color-text-primary)',
          textDecoration: done ? 'line-through' : 'none',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-secondary)'; }}
        onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = 'transparent'; }}
      />
      <input
        value={task.assignee_user_id ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          onAssigneeChange(v.trim() === '' ? null : v);
        }}
        placeholder="—"
        title="Assignee user id"
        style={{
          width: 80,
          padding: '3px 6px',
          fontSize: 11,
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: 'var(--radius-full)',
          background: 'var(--color-background-secondary)',
          color: 'var(--color-text-secondary)',
        }}
      />
      <input
        type="date"
        value={task.due_date ? task.due_date.slice(0, 10) : ''}
        onChange={(e) => onDueDateChange(e.target.value || null)}
        style={{
          padding: '3px 6px',
          fontSize: 11,
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--color-background-secondary)',
          color: 'var(--color-text-secondary)',
        }}
      />
      <button
        type="button"
        onClick={onOpenDetails}
        aria-label="Open task details"
        title="Open task details"
        style={{
          padding: '2px 6px',
          fontSize: 12,
          background: 'transparent',
          border: 0,
          color: 'var(--color-text-tertiary)',
          cursor: 'pointer',
        }}
      >
        ›
      </button>
    </div>
  );
}
