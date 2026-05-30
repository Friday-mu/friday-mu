'use client'

// Inline task suggestion card rendered inside Friday Consult chat.
// Mirrors the TeachingCard pattern — sits below the AI message,
// shows the suggested task fields, lets the operator confirm or
// dismiss. Confirm fires a callback that opens CreateTaskDrawer
// prefilled with the suggestion.

import React, { useState } from 'react'

export interface TaskSuggestion {
  title: string
  description: string | null
  propertyCode: string | null
  department: 'cleaning' | 'inspection' | 'maintenance' | 'office'
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'lowest'
  subdepartment?: string | null
  dueDate?: string | null
}

interface Props {
  suggestion: TaskSuggestion
  onAccept: (s: TaskSuggestion) => void
  onDismiss: () => void
  dismissed?: boolean
}

const DEPT_LABEL: Record<TaskSuggestion['department'], string> = {
  cleaning: 'Cleaning',
  inspection: 'Inspection',
  maintenance: 'Maintenance',
  office: 'Office',
}

const PRIORITY_COLOR: Record<TaskSuggestion['priority'], { bg: string; fg: string }> = {
  urgent: { bg: 'rgba(220, 60, 60, 0.12)', fg: 'rgb(220, 60, 60)' },
  high: { bg: 'rgba(220, 130, 40, 0.12)', fg: 'rgb(200, 110, 30)' },
  medium: { bg: 'rgba(60, 100, 180, 0.12)', fg: 'rgb(60, 100, 180)' },
  low: { bg: 'rgba(120, 120, 120, 0.12)', fg: 'rgb(100, 100, 100)' },
  lowest: { bg: 'rgba(120, 120, 120, 0.08)', fg: 'rgb(140, 140, 140)' },
}

export default function TaskSuggestionCard({ suggestion, onAccept, onDismiss, dismissed }: Props) {
  const [busy, setBusy] = useState(false)
  const prio = PRIORITY_COLOR[suggestion.priority] || PRIORITY_COLOR.medium

  return (
    <div
      style={{
        border: '0.5px solid var(--color-border-secondary, #d0d0d0)',
        borderLeft: `3px solid ${prio.fg}`,
        borderRadius: 8,
        padding: 12,
        marginTop: 8,
        background: dismissed ? 'var(--color-background-secondary, #f5f5f5)' : 'var(--color-background-primary, #fff)',
        opacity: dismissed ? 0.6 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          ⚡ Friday suggests · task
        </span>
        <span
          style={{
            fontSize: 10,
            padding: '2px 6px',
            borderRadius: 3,
            background: prio.bg,
            color: prio.fg,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            fontWeight: 500,
          }}
        >
          {suggestion.priority}
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
          {DEPT_LABEL[suggestion.department] || suggestion.department}
        </span>
        {suggestion.propertyCode && (
          <span
            className="mono"
            style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 3,
              background: 'var(--color-background-secondary, #f5f5f5)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {suggestion.propertyCode}
          </span>
        )}
      </div>

      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4, lineHeight: 1.35 }}>
        {suggestion.title}
      </div>

      {suggestion.description && (
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10, lineHeight: 1.4 }}>
          {suggestion.description}
        </div>
      )}

      {!dismissed && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              try {
                onAccept(suggestion)
              } finally {
                setTimeout(() => setBusy(false), 800)
              }
            }}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 500,
              background: 'var(--color-brand-accent, #4a7ec0)',
              color: 'white',
              border: 0,
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            + Create task
          </button>
          <button
            type="button"
            onClick={onDismiss}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              background: 'transparent',
              color: 'var(--color-text-tertiary)',
              border: '0.5px solid var(--color-border-tertiary, #e0e0e0)',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {dismissed && (
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
          Dismissed — Friday won't propose this again in this thread.
        </div>
      )}
    </div>
  )
}
