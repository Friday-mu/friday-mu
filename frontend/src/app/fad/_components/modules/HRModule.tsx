'use client';

// @demo:data — Tag: PROD-DATA-26 — see frontend/DEMO_CRUFT.md
// HR (Staff names, time-off, stats, permissions)
// Entire module is inline demo JSX content (cards, tables, charts with
// hardcoded mock data). Replace with real backend-driven content when
// the module ships, or render a 'Coming soon' placeholder until then.

import { ModuleHeader } from '../ModuleHeader';
import { useCanSee, useCurrentRole } from '../usePermissions';
import { StaffPage } from './hr/StaffPage';
import { TimeOffPage } from './hr/TimeOffPage';
import { StatsPage } from './hr/StatsPage';
import { PermissionsPage } from './hr/PermissionsPage';

interface Props {
  subPage: string;
  onChangeSubPage: (id: string) => void;
}

export function HRModule({ subPage, onChangeSubPage }: Props) {
  const role = useCurrentRole();
  const canSeeStaff = useCanSee('hr_staff', 'read');
  const canSeeTimeOff = useCanSee('hr_time_off', 'read');
  const canSeeStats = useCanSee('hr_stats', 'read');
  const canSeePermissions = useCanSee('hr_permissions', 'read');

  const tabs = [
    canSeeStaff && { id: 'staff', label: 'Staff' },
    canSeeTimeOff && { id: 'time-off', label: 'Time-off' },
    canSeeStats && { id: 'stats', label: 'Stats' },
    canSeePermissions && { id: 'permissions', label: 'Permissions' },
  ].filter((t): t is { id: string; label: string } => Boolean(t));

  const active = tabs.find((t) => t.id === subPage)?.id ?? tabs[0]?.id ?? 'staff';

  const renderSub = (id: string) => {
    switch (id) {
      case 'staff':
        return canSeeStaff ? <StaffPage /> : null;
      case 'time-off':
        return canSeeTimeOff ? <TimeOffPage /> : null;
      case 'stats':
        return canSeeStats ? <StatsPage /> : null;
      case 'permissions':
        return canSeePermissions ? <PermissionsPage /> : null;
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <ModuleHeader
        title="HR"
        subtitle={role === 'field' ? 'Time-off · personal stats' : 'Staff · time-off · stats · permissions'}
        tabs={tabs}
        activeTab={active}
        onTabChange={onChangeSubPage}
      />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {renderSub(active)}
      </div>
    </div>
  );
}
