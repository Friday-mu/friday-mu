'use client';

// design-be-18: full-detail editor for a single design_task. Opens from
// any TaskItemsPanel row's "open details" chevron. Mirrors the visual
// pattern of ProjectEditDrawer (right-side overlay, Escape-to-close,
// scroll body, footer with Save / Delete / Cancel).
//
// Fields exposed: title, notes (description), assignee_user_id (free
// text — full user picker is future work), due_date, status,
// stage_key (optional dropdown from STAGES), category (display only —
// re-categorising via UI is deferred to v2), created_at / updated_at
// (display only).

import { useEffect, useState } from 'react';
import { STAGES } from '../../../_data/design';
import { deleteTask, updateTask, type ApiTask } from '../../../_data/designClient';
import { fireToast } from '../../Toaster';

interface Props {
  task: ApiTask;
  onSaved: () => void;
  onClose: () => void;
  onDeleted: () => void;
}

const STATUS_OPTIONS: { id: ApiTask['status']; label: string }[] = [
  { id: 'todo',        label: 'To do' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'blocked',     label: 'Blocked' },
  { id: 'done',        label: 'Done' },
];

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  border: '0.5px solid var(--color-border-secondary)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--color-background-primary)',
  color: 'var(--color-text-primary)',
  fontSize: 13,
};

export function TaskDetailDrawer({ task, onSaved, onClose, onDeleted }: Props) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [assigneeUserId, setAssigneeUserId] = useState(task.assignee_user_id ?? '');
  const [dueDate, setDueDate] = useState(task.due_date ? task.due_date.slice(0, 10) : '');
  const [status, setStatus] = useState<ApiTask['status']>(task.status);
  const [stageKey, setStageKey] = useState(task.stage_key ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving && !deleting) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving, deleting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!title.trim()) nextErrors.title = 'Title is required';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});

    setSaving(true);
    try {
      await updateTask(task.id, {
        title: title.trim(),
        notes: notes.trim() || null,
        assignee_user_id: assigneeUserId.trim() || null,
        due_date: dueDate || null,
        status,
        stage_key: stageKey || null,
      });
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrors({ _form: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this task? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await deleteTask(task.id);
      onDeleted();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fireToast(`Could not delete: ${msg}`);
      setDeleting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 60,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !saving && !deleting) onClose(); }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: 'min(480px, 100%)',
          height: '100%',
          background: 'var(--color-background-primary)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-2px 0 16px rgba(0, 0, 0, 0.25)',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-friday-fad)', fontSize: 16, fontWeight: 500 }}>Task details</h3>
          <button type="button" onClick={onClose} aria-label="Close" disabled={saving || deleting} style={{ fontSize: 14, padding: '4px 8px' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {errors._form && (
            <div style={{ padding: 8, background: 'var(--color-background-danger-soft)', color: 'var(--color-text-danger)', fontSize: 12, borderRadius: 'var(--radius-sm)' }}>
              {errors._form}
            </div>
          )}

          <Field label="Title" error={errors.title}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Description / notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
            />
          </Field>

          <Field label="Assignee (user id)" hint="user-picker coming later">
            <input
              value={assigneeUserId}
              onChange={(e) => setAssigneeUserId(e.target.value)}
              placeholder="u-ishant"
              style={inputStyle}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Due date">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value as ApiTask['status'])} style={inputStyle}>
                {STATUS_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Stage link (optional)">
            <select value={stageKey} onChange={(e) => setStageKey(e.target.value)} style={inputStyle}>
              <option value="">— No stage link —</option>
              {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>

          <Field label="Category">
            <div
              style={{
                ...inputStyle,
                color: 'var(--color-text-tertiary)',
                background: 'var(--color-background-secondary)',
              }}
            >
              {task.category}
            </div>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            <div>
              <div style={{ fontWeight: 500, marginBottom: 2 }}>Created</div>
              <div>{task.created_at.slice(0, 16).replace('T', ' ')}</div>
            </div>
            <div>
              <div style={{ fontWeight: 500, marginBottom: 2 }}>Updated</div>
              <div>{task.updated_at.slice(0, 16).replace('T', ' ')}</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 16px', borderTop: '0.5px solid var(--color-border-tertiary)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving || deleting}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              color: 'var(--color-text-danger)',
              border: '0.5px solid var(--color-border-tertiary)',
            }}
          >
            {deleting ? 'Deleting…' : 'Delete task'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} disabled={saving || deleting} style={{ padding: '6px 12px', fontSize: 12, borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)' }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || deleting}
              style={{
                padding: '6px 14px',
                fontSize: 12,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-brand-accent)',
                color: 'var(--color-text-on-accent)',
                fontWeight: 600,
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
        {label}
        {hint && <span style={{ marginLeft: 6, color: 'var(--color-text-tertiary)', fontWeight: 400, fontStyle: 'italic' }}>{hint}</span>}
      </span>
      {children}
      {error && <span style={{ fontSize: 11, color: 'var(--color-text-danger)' }}>{error}</span>}
    </label>
  );
}
