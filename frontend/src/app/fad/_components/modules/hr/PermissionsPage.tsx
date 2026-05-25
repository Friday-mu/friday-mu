'use client';

import { useMemo, useState } from 'react';
import {
  ALL_ACTIONS,
  ALL_RESOURCES,
  PERMISSIONS,
  ROLE_LABEL,
  RESOURCE_LABEL,
  type Action,
  type Resource,
  type Scope,
} from '../../../_data/permissions';
import { TASK_USERS, type TaskUser } from '../../../_data/tasks';
import { useCurrentUserId, usePermissions } from '../../usePermissions';
import { fireToast } from '../../Toaster';

type Role = TaskUser['role'];

const SCOPE_OPTIONS: { value: Scope; label: string; description: string }[] = [
  { value: 'none', label: 'None', description: 'No access' },
  { value: 'self', label: 'Self', description: 'Own records only' },
  { value: 'team', label: 'Team', description: 'Own + team-visible' },
  { value: 'all', label: 'All', description: 'Full scope' },
];

import { scopeTone, toneStyle } from '../../palette';

const SCOPE_SYMBOL: Record<Scope, string> = {
  none: '×',
  self: 'self',
  team: 'team',
  all: '✓',
};
const scopeBadge = (s: Scope) => {
  const sw = toneStyle(scopeTone(s));
  return { bg: sw.background, fg: sw.color, symbol: SCOPE_SYMBOL[s] };
};

// Snapshot defaults at module load so "Reset to defaults" can restore them.
const DEFAULTS: Record<Role, typeof PERMISSIONS[Role]> = JSON.parse(JSON.stringify(PERMISSIONS));

export function PermissionsPage() {
  const { realRole } = usePermissions();
  const currentUserId = useCurrentUserId();
  const [selectedRole, setSelectedRole] = useState<Role>('field');
  const [detailOpen, setDetailOpen] = useState(false);
  const [, setRev] = useState(0);
  const bumpRev = () => setRev((n) => n + 1);
  const [lastModified, setLastModified] = useState<{ at: string; by: string; role: Role } | null>(null);

  const userCounts = useMemo(() => {
    const counts: Record<Role, number> = {
      director: 0,
      commercial_marketing: 0,
      ops_manager: 0,
      field: 0,
      external: 0,
    };
    TASK_USERS.forEach((u) => {
      if (u.active) counts[u.role]++;
    });
    return counts;
  }, []);

  // Director-only gate at the page level (defense beyond the tab gate).
  if (realRole !== 'director') {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
        <h3 style={{ fontSize: 16, marginBottom: 8 }}>Only the Director can manage permissions.</h3>
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
          If you need access to a particular resource, raise it with Ishant or Franny.
        </p>
      </div>
    );
  }

  const setCell = (resource: Resource, action: Action, scope: Scope) => {
    if (selectedRole === 'director') return; // Director locked — guard.
    const role = PERMISSIONS[selectedRole];
    if (!role[resource]) role[resource] = {};
    if (scope === 'none') {
      delete role[resource]![action];
    } else {
      role[resource]![action] = scope;
    }
    bumpRev();
  };

  const save = () => {
    if (selectedRole === 'director') return;
    const at = new Date().toISOString();
    const by = TASK_USERS.find((u) => u.id === currentUserId)?.name ?? 'Director';
    setLastModified({ at, by, role: selectedRole });
    fireToast(`Permissions for ${ROLE_LABEL[selectedRole]} saved · ${userCounts[selectedRole]} user${userCounts[selectedRole] === 1 ? '' : 's'} affected immediately`);
  };

  const reset = () => {
    if (selectedRole === 'director') return;
    if (!confirm(`Reset ${ROLE_LABEL[selectedRole]} permissions to launch defaults? Any custom changes will be lost.`)) return;
    const defaults = DEFAULTS[selectedRole];
    PERMISSIONS[selectedRole] = JSON.parse(JSON.stringify(defaults));
    setLastModified(null);
    fireToast(`${ROLE_LABEL[selectedRole]} reset to launch defaults`);
    bumpRev();
  };

  const isDirector = selectedRole === 'director';

  return (
    <div className={'fad-split-pane' + (detailOpen ? ' detail-open' : '')}>
      {/* Left: role selector */}
      <div
        className="fad-split-list"
        style={{
          width: 280,
          borderRight: '0.5px solid var(--color-border-tertiary)',
          padding: 16,
          overflowY: 'auto',
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
          Roles
        </div>
        {(['director', 'commercial_marketing', 'ops_manager', 'field'] as const).map((r) => {
          const isSelected = selectedRole === r;
          return (
            <button
              key={r}
              onClick={() => { setSelectedRole(r); setDetailOpen(true); }}
              style={{
                display: 'flex',
                width: '100%',
                padding: '10px 12px',
                marginBottom: 4,
                background: isSelected ? 'var(--color-background-tertiary)' : 'transparent',
                border: '0.5px solid ' + (isSelected ? 'var(--color-brand-accent)' : 'transparent'),
                borderRadius: 6,
                cursor: 'pointer',
                textAlign: 'left',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  border: '1.5px solid ' + (isSelected ? 'var(--color-brand-accent)' : 'var(--color-border-secondary)'),
                  background: isSelected ? 'var(--color-brand-accent)' : 'transparent',
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{ROLE_LABEL[r]}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                  {userCounts[r]} user{userCounts[r] === 1 ? '' : 's'}
                </div>
              </div>
            </button>
          );
        })}
        <div style={{ marginTop: 12, padding: '8px 12px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          External ({userCounts.external} user{userCounts.external === 1 ? '' : 's'}) — no FAD access, hidden from matrix.
        </div>

        <div style={{ marginTop: 24, padding: '8px 12px', fontSize: 11, color: 'var(--color-text-tertiary)', borderTop: '0.5px solid var(--color-border-tertiary)', paddingTop: 12 }}>
          <strong>Custom roles</strong> ship in Phase 2. Phase 1 has 4 hardcoded roles editable as-is.
        </div>
      </div>

      {/* Right: matrix */}
      <div className="fad-split-detail" style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <button
          type="button"
          className="btn ghost sm fad-split-back"
          onClick={() => setDetailOpen(false)}
        >
          ← Back to roles
        </button>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
            Permissions for {ROLE_LABEL[selectedRole]}
          </h2>
          <span style={{ flex: 1 }} />
          {!isDirector && (
            <>
              <button className="btn ghost sm" onClick={reset}>
                Reset to defaults
              </button>
              <button className="btn primary sm" onClick={save}>
                Save
              </button>
            </>
          )}
        </div>

        {isDirector && (
          <div
            style={{
              padding: 12,
              background: 'var(--color-bg-success)',
              borderLeft: '3px solid var(--color-text-success)',
              borderRadius: 4,
              marginBottom: 16,
              fontSize: 12,
            }}
          >
            🔒 Director has full access to all resources. This role cannot be modified — it's the lockout guard.
          </div>
        )}

        <div className="fad-permissions-matrix-scroll" style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--color-background-secondary)' }}>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--color-text-tertiary)',
                    fontWeight: 500,
                  }}
                >
                  Resource
                </th>
                {ALL_ACTIONS.map((a) => (
                  <th
                    key={a}
                    style={{
                      padding: '8px 12px',
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--color-text-tertiary)',
                      fontWeight: 500,
                      width: 140,
                      textAlign: 'left',
                    }}
                  >
                    {a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_RESOURCES.map((r) => (
                <tr key={r} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 500 }}>{RESOURCE_LABEL[r]}</td>
                  {ALL_ACTIONS.map((a) => (
                    <td key={a} style={{ padding: '6px 12px' }}>
                      <CellEditor
                        role={selectedRole}
                        resource={r}
                        action={a}
                        onChange={(scope) => setCell(r, a, scope)}
                        locked={isDirector}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 20, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {lastModified ? (
            <>Last modified by {lastModified.by} · {formatLastMod(lastModified.at)}</>
          ) : (
            <>Defaults from launch — never modified.</>
          )}
        </div>
      </div>
    </div>
  );
}

function CellEditor({
  role,
  resource,
  action,
  onChange,
  locked,
}: {
  role: Role;
  resource: Resource;
  action: Action;
  onChange: (scope: Scope) => void;
  locked: boolean;
}) {
  const current = (PERMISSIONS[role][resource]?.[action] ?? 'none') as Scope;
  const badge = scopeBadge(current);

  if (locked) {
    return (
      <span
        style={{
          fontSize: 10,
          padding: '3px 8px',
          borderRadius: 4,
          background: scopeBadge('all').bg,
          color: scopeBadge('all').fg,
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        ALL
      </span>
    );
  }

  return (
    <select
      value={current}
      onChange={(e) => onChange(e.target.value as Scope)}
      style={{
        fontSize: 11,
        padding: '4px 8px',
        borderRadius: 4,
        border: '0.5px solid var(--color-border-tertiary)',
        background: badge.bg,
        color: badge.fg,
        fontWeight: 500,
        cursor: 'pointer',
        textTransform: current === 'none' || current === 'all' ? 'none' : 'uppercase',
        letterSpacing: '0.04em',
        minWidth: 90,
      }}
    >
      {SCOPE_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label} — {o.description}
        </option>
      ))}
    </select>
  );
}

function formatLastMod(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}
