'use client';

import { useState, type ReactNode } from 'react';
import type { Action, Resource } from '../_data/permissions';
import { ROLE_LABEL } from '../_data/permissions';
import { useCanAccess, usePermissions } from './usePermissions';
import { useCurrentTenantId, FR_TENANT_ID } from '../_data/useTenantIdentity';
import type { TaskUser } from '../_data/tasks';

interface GateProps {
  /** Single resource OR list — list grants access if ANY resource is granted (OR semantics). */
  resource: Resource | Resource[];
  action?: Action;
  /** When the gate's scope is 'self', pass the resource owner's user id. */
  ownerId?: string;
  /** Custom rendering when access is denied. Default: minimal "no access" panel. */
  fallback?: ReactNode;
  /** Render nothing on denial (no fallback panel). */
  silent?: boolean;
  children: ReactNode;
}

/**
 * Declarative wrapper. Renders children only when the current role has the
 * requested permission. Surfaces NOT wrapped stay open — see brief §10.
 */
export function PermissionGate({
  resource,
  action = 'read',
  ownerId,
  fallback,
  silent,
  children,
}: GateProps) {
  const { role, scopeOf, canForSelf } = usePermissions();
  const resources = Array.isArray(resource) ? resource : [resource];
  // Module-level gates: any non-'none' scope is enough to render. Sub-tab and
  // row-level filtering inside the module handles 'self' vs 'team' restrictions.
  const granted = ownerId
    ? resources.some((r) => canForSelf(r, action, ownerId))
    : resources.some((r) => scopeOf(r, action) !== 'none');

  if (granted) return <>{children}</>;
  if (silent) return null;
  if (fallback !== undefined) return <>{fallback}</>;

  return (
    <div className="fad-module-body" style={{ padding: 32 }}>
      <div
        style={{
          maxWidth: 460,
          margin: '40px auto',
          padding: 24,
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: 12,
          background: 'var(--color-background-secondary)',
        }}
      >
        <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 6 }}>No access to this view</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          Your role ({ROLE_LABEL[role]}) doesn't have {action} permission on this resource.
          Talk to a Director if you need access.
        </div>
      </div>
    </div>
  );
}

// ───────────────── RoleSwitcher (dev affordance) ─────────────────

// @demo:auth + @demo:ui — Tag: PROD-AUTH-3 / PROD-UI-4 — see frontend/DEMO_CRUFT.md
// Remove this entire RoleSwitcher component when real auth lands.
// Real auth resolves role from JWT — users can't pick. The ROLES table
// below + the dropdown below + the "View as · dev preview" UI all go.
const ROLES: Array<{ id: TaskUser['role']; label: string; example: string }> = [
  { id: 'director', label: 'Director', example: 'Ishant' },
  { id: 'commercial_marketing', label: 'Commercial & Marketing', example: 'Mathias' },
  { id: 'ops_manager', label: 'Ops Manager', example: 'Franny' },
  { id: 'field', label: 'Field', example: 'Bryan' },
];

/**
 * Small inline dropdown for switching the acting role. Renders in the Header.
 * Gated to real-role=director so non-directors using FAD for real never see it.
 * Persists choice to localStorage. Phase 2 replaces this with real auth.
 */
export function RoleSwitcher() {
  const { role, realRole, setRole } = usePermissions();
  const [open, setOpen] = useState(false);
  const current = ROLES.find((r) => r.id === role);
  // SaaS tenants get the FAD shell pre-wired to the Director persona
  // (the demo-data default in usePermissions.ts) — so the realRole gate
  // alone leaks the FR-internal view-as switcher to every signup. Also
  // require the JWT's tenant_id to match FR's UUID.
  const tenantId = useCurrentTenantId();
  const isFrTenant = tenantId === FR_TENANT_ID;

  // Only Directors get the View-as switcher.
  if (realRole !== 'director' || !isFrTenant) return null;

  const isViewingAsOther = role !== realRole;

  return (
    <div className="fad-role-switcher" style={{ position: 'relative' }}>
      <button
        className="fad-util-btn"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title={`View as: ${current?.label ?? role}`}
        style={{
          padding: '0 10px',
          width: 'auto',
          fontSize: 11,
          fontWeight: 500,
          background: open || isViewingAsOther ? 'var(--color-background-tertiary)' : undefined,
          // When viewing-as a non-director, mark with accent so it's obvious.
          color: isViewingAsOther ? 'var(--color-brand-accent)' : undefined,
        }}
      >
        View as · {current?.label ?? role}
      </button>
      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9 }}
            onClick={() => setOpen(false)}
          />
          <div
            className="fad-dropdown"
            style={{ width: 240, right: 0, left: 'auto', zIndex: 10 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="fad-dropdown-header">View as · dev preview</div>
            <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--color-text-tertiary)', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
              You're a Director. Switch role to preview what each team sees.
              Pick Director to exit.
            </div>
            {ROLES.map((r) => (
              <button
                key={r.id}
                className="fad-dropdown-item"
                onClick={() => {
                  setRole(r.id);
                  setOpen(false);
                }}
                style={{ background: r.id === role ? 'var(--color-background-tertiary)' : undefined }}
              >
                <span style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontWeight: 500 }}>{r.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>e.g. {r.example}</div>
                </span>
                {r.id === role && <span style={{ fontSize: 11 }}>✓</span>}
              </button>
            ))}
            <div className="fad-dropdown-divider" />
            <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Phase 2 wires real auth. This switcher persists locally only.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Convenience shortcut for non-render places (e.g. event handlers). */
export function useGate(resource: Resource, action: Action = 'read'): boolean {
  return useCanAccess(resource, action);
}
