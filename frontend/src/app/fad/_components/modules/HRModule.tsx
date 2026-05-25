'use client';

// @demo:data — Tag: PROD-DATA-26 — see frontend/DEMO_CRUFT.md
// HR (Staff names, time-off, stats, permissions)
// Entire module is inline demo JSX content (cards, tables, charts with
// hardcoded mock data). Replace with real backend-driven content when
// the module ships, or render a 'Coming soon' placeholder until then.

import { ModuleHeader } from '../ModuleHeader';
import { useCanSee, useCurrentRole } from '../usePermissions';
import { useT } from '../../_i18n/useT';
import { StaffPage } from './hr/StaffPage';
import { TimeOffPage } from './hr/TimeOffPage';
import { StatsPage } from './hr/StatsPage';
import { PermissionsPage } from './hr/PermissionsPage';
import { HRInsightsPage } from './hr/HRInsightsPage';

interface Props {
  subPage: string;
  onChangeSubPage: (id: string) => void;
}

export function HRModule({ subPage, onChangeSubPage }: Props) {
  const role = useCurrentRole();
  const { t } = useT();
  const canSeeStaff = useCanSee('hr_staff', 'read');
  const canSeeTimeOff = useCanSee('hr_time_off', 'read');
  const canSeeStats = useCanSee('hr_stats', 'read');
  const canSeePermissions = useCanSee('hr_permissions', 'read');

  const tabs = [
    canSeeStaff && { id: 'staff', label: t('hr.tabs.staff', 'Staff') },
    canSeeTimeOff && { id: 'time-off', label: t('hr.tabs.timeOff', 'Time-off') },
    canSeeStats && { id: 'stats', label: t('hr.tabs.stats', 'Stats') },
    canSeeStats && { id: 'insights', label: t('hr.tabs.insights', 'Insights') },
    canSeePermissions && { id: 'permissions', label: t('hr.tabs.permissions', 'Permissions') },
  ].filter((tab): tab is { id: string; label: string } => Boolean(tab));

  const active = tabs.find((t) => t.id === subPage)?.id ?? tabs[0]?.id ?? 'staff';

  const renderSub = (id: string) => {
    switch (id) {
      case 'staff':
        return canSeeStaff ? <StaffPage /> : null;
      case 'time-off':
        return canSeeTimeOff ? <TimeOffPage /> : null;
      case 'stats':
        return canSeeStats ? <StatsPage /> : null;
      case 'insights':
        return canSeeStats ? <HRInsightsPage /> : null;
      case 'permissions':
        return canSeePermissions ? <PermissionsPage /> : null;
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <ModuleHeader
        title={t('module.hr', 'HR')}
        subtitle={role === 'field'
          ? t('hr.subtitle.field', 'Time-off · personal stats')
          : t('hr.subtitle.manager', 'Staff · time-off · stats · permissions')}
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
