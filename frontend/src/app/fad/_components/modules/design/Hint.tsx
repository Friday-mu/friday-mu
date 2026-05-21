'use client';

// Shared field-hint block — small "what to write here" callout above
// an input, with optional bullet examples below the body. Two local
// copies (PreferencesStage, SiteVisitStage) were nearly identical;
// promoting once the third usage landed (per
// docs/scoping/field-hint-pattern.md rollout rule of three).
//
// Anti-pattern called out in the scoping doc: do NOT generate hint
// copy with an LLM at render time. Hints are hand-written, static,
// and ship in the bundle.

export interface HintProps {
  /** Lead sentence — what the field is for, in your own words. */
  body: string;
  /** Optional concrete-example bullets shown below the body. */
  examples?: string[];
}

export function Hint({ body, examples }: HintProps) {
  return (
    <div
      style={{
        marginBottom: 8,
        padding: '8px 10px',
        background: 'var(--color-brand-accent-soft)',
        borderLeft: '2px solid var(--color-brand-accent)',
        borderRadius: 'var(--radius-sm)',
        fontSize: 11,
        lineHeight: 1.5,
        color: 'var(--color-text-secondary)',
      }}
    >
      <div>{body}</div>
      {examples && examples.length > 0 && (
        <ul
          style={{
            margin: '4px 0 0 16px',
            padding: 0,
            color: 'var(--color-text-tertiary)',
            fontStyle: 'italic',
          }}
        >
          {examples.map((ex, i) => (
            <li key={i} style={{ marginBottom: 2 }}>{ex}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
