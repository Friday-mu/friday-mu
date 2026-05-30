'use client';

import { useState } from 'react';

interface Props {
  approvalLabel: string;
  onCancel: () => void;
  onSubmit: (comment: string) => void;
}

const MIN_COMMENT_CHARS = 10;

export function RequestChangesModal({ approvalLabel, onCancel, onSubmit }: Props) {
  const [comment, setComment] = useState('');
  const [touched, setTouched] = useState(false);
  const tooShort = comment.trim().length < MIN_COMMENT_CHARS;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="request-changes-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'var(--color-background-tertiary)',
          width: '100%',
          maxWidth: 460,
          borderRadius: 'var(--radius-lg)',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <h3 id="request-changes-title" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          Request changes to {approvalLabel}
        </h3>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>
          Tell Friday what you'd like adjusted. The team will get the message and follow up.
        </p>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            Your comments (required, min {MIN_COMMENT_CHARS} characters)
          </span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onBlur={() => setTouched(true)}
            rows={5}
            placeholder="e.g. The sofa colour feels too warm — could we try a deeper navy?"
            style={{
              padding: 10,
              fontSize: 13,
              border: '0.5px solid var(--color-border-secondary)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-background-primary)',
              color: 'var(--color-text-primary)',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
          {touched && tooShort && (
            <span style={{ fontSize: 11, color: 'var(--color-text-warning)' }}>
              Add a few more details so Friday can act on your feedback.
            </span>
          )}
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 14px',
              fontSize: 12,
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              border: '0.5px solid var(--color-border-secondary)',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={tooShort}
            data-portal-request-changes-submit
            onClick={() => {
              if (tooShort) {
                setTouched(true);
                return;
              }
              onSubmit(comment.trim());
            }}
            style={{
              padding: '8px 14px',
              fontSize: 12,
              borderRadius: 'var(--radius-sm)',
              background: tooShort ? 'var(--color-background-primary)' : 'var(--color-brand-accent)',
              color: tooShort ? 'var(--color-text-tertiary)' : '#fff',
              fontWeight: 500,
              cursor: tooShort ? 'not-allowed' : 'pointer',
              opacity: tooShort ? 0.6 : 1,
            }}
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
