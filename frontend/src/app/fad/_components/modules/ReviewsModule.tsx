'use client';

// @demo:data — Tag: PROD-DATA-27 — see frontend/DEMO_CRUFT.md
// Reviews (anomaly callouts, suggested actions, trends, staff perf names)
// Entire module is inline demo JSX content (cards, tables, charts with
// hardcoded mock data). Replace with real backend-driven content when
// the module ships, or render a 'Coming soon' placeholder until then.

import { useState } from 'react';
import { ModuleHeader } from '../ModuleHeader';
import { OverviewPage } from './reviews/OverviewPage';
import { AllReviewsPage } from './reviews/AllReviewsPage';
import { TrendsPage } from './reviews/TrendsPage';
import { StaffPerformancePage } from './reviews/StaffPerformancePage';
import { SettingsPage } from './reviews/SettingsPage';
import { liveOnlyMode } from '../../_data/demoMode';

interface Props {
  subPage: string;
  onChangeSubPage: (id: string) => void;
}

export function ReviewsModule({ subPage, onChangeSubPage }: Props) {
  const liveOnly = liveOnlyMode();
  const allTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'all', label: 'All reviews' },
    { id: 'trends', label: 'Trends' },
    { id: 'staff', label: 'Staff performance' },
    { id: 'settings', label: 'Settings' },
  ];
  const tabs = liveOnly ? allTabs.filter((tab) => tab.id !== 'trends' && tab.id !== 'staff') : allTabs;
  const active = tabs.find((t) => t.id === subPage)?.id ?? 'overview';

  // Bumped after fixture mutations (e.g. reply sent, internal note added).
  const [, setRev] = useState(0);
  const bumpRev = () => setRev((n) => n + 1);

  const renderSub = () => {
    switch (active) {
      case 'overview':
        return <OverviewPage onNavigate={onChangeSubPage} />;
      case 'all':
        return <AllReviewsPage onMutated={bumpRev} />;
      case 'trends':
        return <TrendsPage />;
      case 'staff':
        return <StaffPerformancePage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <ModuleHeader
        title="Reviews"
        subtitle="Aggregate ratings · per-stay reviews · staff attribution · trending themes"
        tabs={tabs}
        activeTab={active}
        onTabChange={onChangeSubPage}
      />
      {renderSub()}
    </div>
  );
}
