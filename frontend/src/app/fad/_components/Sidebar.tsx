'use client';

import { useEffect, useMemo, useState } from 'react';
import { MODULES, GROUPS, type ModuleDef } from '../_data/modules';
import { iconFor, IconExpand, IconSparkle } from './icons';
import { canSeeModule, useCurrentRole, useCurrentUserId } from './usePermissions';
import { pendingCountFor, pendingCountForSubpage, subscribePendingRev, type PendingCount } from '../_data/pendingCounts';
import { useEnabledModules } from '../_data/useEnabledModules';

interface Props {
  active: string;
  subPage?: string | null;
  onSelect: (id: string) => void;
  onSelectSub?: (modId: string, sub: string) => void;
  /** Map of moduleId -> set of locked subPage IDs (rendered with lock icon, still clickable). */
  lockedSubs?: Record<string, Set<string>>;
  collapsed: boolean;
  fridayFs?: boolean;
  onOpenFridayFs?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({
  active,
  subPage,
  onSelect,
  onSelectSub,
  lockedSubs,
  collapsed,
  fridayFs,
  onOpenFridayFs,
  mobileOpen,
  onMobileClose,
}: Props) {
  const role = useCurrentRole();
  const userId = useCurrentUserId();
  const { enabledSet } = useEnabledModules();

  // Subscribe to fixture-mutation bumps so badges re-compute reactively
  const [pendingRev, setPendingRev] = useState(0);
  useEffect(() => subscribePendingRev(setPendingRev), []);

  const byGroup = useMemo(() => {
    const m: Record<string, ModuleDef[]> = {};
    MODULES.forEach((mod) => {
      if (!canSeeModule(role, mod.id)) return;
      // SaaS module gate — when enabledSet has loaded, only show modules the
      // tenant has enabled. Before it loads (null), show everything to avoid
      // a flash of empty sidebar.
      if (enabledSet && !enabledSet.has(mod.id)) return;
      (m[mod.group] = m[mod.group] || []).push(mod);
    });
    return m;
  }, [role, enabledSet]);

  // Allow re-clicking the active module to collapse its sub-pages.
  // Resets when the user navigates to a different module.
  const [collapsedActive, setCollapsedActive] = useState(false);
  useEffect(() => {
    setCollapsedActive(false);
    setExpandedModuleId(null);
  }, [active]);

  // On mobile, tapping a module with sub-pages expands those subs in place
  // (without navigating or closing the sidebar) so the user can pick a sub-page.
  // null when no module is "preview-expanded".
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <>
      <div
        className={'fad-sidebar-backdrop' + (mobileOpen ? ' mobile-open' : '')}
        onClick={onMobileClose}
      />
      <aside
        className={
          'fad-sidebar' +
          (collapsed ? ' collapsed' : '') +
          (mobileOpen ? ' mobile-open' : '')
        }
      >
      <div className="fad-sidebar-inner">
        {onOpenFridayFs && (
          <>
            <button
              className="fad-friday-entry"
              onClick={() => {
                onOpenFridayFs();
                onMobileClose?.();
              }}
              title="Ask Friday — fullscreen"
              aria-pressed={fridayFs}
            >
              <span className="fad-nav-icon">
                <IconSparkle />
              </span>
              <span className="fad-friday-label">Ask Friday</span>
              <span className="fad-friday-expand" aria-hidden="true">
                <IconExpand size={12} />
              </span>
            </button>
            <div className="fad-friday-divider" />
          </>
        )}
        {GROUPS.map((g, gi) => {
          const groupMods = byGroup[g.id] || [];
          if (groupMods.length === 0) return null;
          const prevTier = gi > 0 ? GROUPS[gi - 1].tier : null;
          const tierChanged = prevTier !== null && prevTier !== g.tier;
          return (
            <div
              className={'fad-sidebar-group fad-sidebar-group-' + g.tier}
              key={g.id}
            >
              {tierChanged && g.tier === 'manage' && (
                <div className="fad-sidebar-tier-label">Manage</div>
              )}
              <div className="fad-sidebar-group-label">
                <span>{g.label}</span>
              </div>
              {groupMods.map((mod) => {
                const IconComp = iconFor(mod.icon);
                const isActive = mod.id === active;
                const isExpanded = expandedModuleId === mod.id;
                const hasSubs = !!mod.subPages?.length;
                const showSubs =
                  hasSubs &&
                  !collapsed &&
                  ((isActive && !collapsedActive) || isExpanded);
                const moduleCount = pendingCountFor(role, userId, mod.id);
                void pendingRev; // keep dependency live for re-render
                return (
                  <div key={mod.id} className="fad-nav-item-wrap">
                    <button
                      className={
                        'fad-nav-item' +
                        (isActive ? ' active' : '') +
                        (isExpanded ? ' expanded-preview' : '')
                      }
                      onClick={() => {
                        // Mobile: tapping an inactive module with subs expands them in
                        // place rather than navigating + closing the sidebar — so the
                        // user can see the sub-pages and pick the one they want.
                        if (isMobile && !isActive && hasSubs) {
                          setExpandedModuleId((prev) => (prev === mod.id ? null : mod.id));
                          return;
                        }
                        if (isActive && hasSubs) {
                          setCollapsedActive((v) => !v);
                          return;
                        }
                        onSelect(mod.id);
                        onMobileClose?.();
                      }}
                      title={moduleCount.total > 0 ? `${mod.label} · ${moduleCount.total} pending` : mod.label}
                    >
                      <span className="fad-nav-icon">
                        <IconComp />
                      </span>
                      <span className="fad-nav-label">{mod.label}</span>
                      {moduleCount.total > 0 && <PendingChip count={moduleCount} collapsed={collapsed} />}
                    </button>
                    {showSubs && (
                      <div className="fad-nav-subs">
                        {mod.subPages!.map((sp) => {
                          const isLocked = lockedSubs?.[mod.id]?.has(sp.id);
                          const subCount = pendingCountForSubpage(role, userId, mod.id, sp.id);
                          return (
                            <button
                              key={sp.id}
                              className={
                                'fad-nav-sub' + (subPage === sp.id ? ' active' : '') + (isLocked ? ' locked' : '')
                              }
                              onClick={() => {
                                onSelectSub?.(mod.id, sp.id);
                                onMobileClose?.();
                              }}
                              title={isLocked ? `${sp.label} · admin only` : sp.label}
                            >
                              <span className="fad-nav-sub-label">{sp.label}</span>
                              {subCount.total > 0 && <PendingChip count={subCount} collapsed={false} />}
                              {isLocked && <span className="fad-nav-sub-lock" aria-hidden="true">🔒</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </aside>
    </>
  );
}

function PendingChip({ count, collapsed }: { count: PendingCount; collapsed: boolean }) {
  const display = count.total > 99 ? '99+' : String(count.total);
  if (collapsed) {
    return (
      <span
        className={'fad-pending-dot' + (count.tone === 'urgent' ? ' urgent' : '')}
        aria-label={`${count.total} pending`}
      />
    );
  }
  return (
    <span
      className={'fad-pending-chip' + (count.tone === 'urgent' ? ' urgent' : '')}
      aria-label={`${count.total} pending`}
    >
      {display}
    </span>
  );
}
