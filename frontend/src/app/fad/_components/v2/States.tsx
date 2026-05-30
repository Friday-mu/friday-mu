'use client';
// V2 state-matrix primitives — design spec §5 (every view defines its states).
// empty · loading · error · permission here; partial/stale/fallback/failed AI
// banners are StateBanner (ai/TrustStates). V2-tokened — use inside GmShell
// (`.dwrap`). CSS lives in gm-desktop.css (`.vstate` / `.vskel` / `.vperm`).
import { type ReactNode } from 'react';
import { StateBanner } from '../ai/TrustStates';

/** "Nothing here yet" — first-run / filtered-to-zero. */
export function EmptyState({
  title,
  hint,
  action,
  icon,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="vstate vempty" role="status">
      {icon && <div className="vstate-ic">{icon}</div>}
      <div className="vstate-ttl">{title}</div>
      {hint && <div className="vstate-hint">{hint}</div>}
      {action && <div className="vstate-act">{action}</div>}
    </div>
  );
}

/** Skeleton shimmer rows while data loads. */
export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <div className="vskel" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="vskel-row" />
      ))}
    </div>
  );
}

/** Hard error — data couldn't load. Reuses the failed StateBanner (actions paused). */
export function ErrorState({
  surface,
  source,
  onRetry,
}: {
  surface?: string;
  source?: string;
  onRetry?: () => void;
}) {
  return <StateBanner surface={surface} source={source} health="failed" onRetry={onRetry} />;
}

/** Read-only / viewer-role marker (hide mutating actions, show this badge). */
export function PermissionState({ label = 'Read-only · viewer role' }: { label?: string }) {
  return <span className="vperm bdg">{label}</span>;
}

export type DataStatus = 'ready' | 'loading' | 'empty' | 'error';

/**
 * One wrapper that resolves the common data states. `ready` renders children.
 * Keeps every migrated list/table honest about loading/empty/error per spec §5.
 */
export function DataState({
  status,
  children,
  empty,
  onRetry,
  surface,
  rows,
}: {
  status: DataStatus;
  children?: ReactNode;
  empty?: { title: string; hint?: string; action?: ReactNode; icon?: ReactNode };
  onRetry?: () => void;
  surface?: string;
  rows?: number;
}) {
  if (status === 'loading') return <LoadingState rows={rows} />;
  if (status === 'error') return <ErrorState surface={surface} onRetry={onRetry} />;
  if (status === 'empty') {
    return (
      <EmptyState
        title={empty?.title || 'Nothing here yet'}
        hint={empty?.hint}
        action={empty?.action}
        icon={empty?.icon}
      />
    );
  }
  return <>{children}</>;
}
