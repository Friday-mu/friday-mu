'use client';

import { useEffect, useMemo, useState } from 'react';
import { ModuleHeader } from '../ModuleHeader';
import { OverviewPage } from './properties/OverviewPage';
import { AllPropertiesPage } from './properties/AllPropertiesPage';
import { OnboardingPage } from './properties/OnboardingPage';
import { InsightsPage } from './properties/InsightsPage';
import { PropertyDetail } from './properties/PropertyDetail';
import { CreatePropertyDrawer } from './properties/CreatePropertyDrawer';
import { portfolioInsights } from '../../_data/properties';
import { useHydratePropertiesFromGuesty } from '../../_data/propertiesClient';
import { IconPlus } from '../icons';

interface Props {
  subPage: string;
  onChangeSubPage: (id: string) => void;
}

export function PropertiesModule({ subPage, onChangeSubPage }: Props) {
  // Hydrate PROPERTIES from /api/properties (the operational Guesty
  // listings cache) on mount so child pages render the live 60-row
  // portfolio instead of the static fixture. The hook mutates
  // PROPERTIES (and re-derives PROPERTY_BY_CODE / OWNERS / PHOTOS /
  // legacy shims) in place; `rev` re-triggers this component so
  // insightsCount and the child pages re-read fresh data.
  const { rev: hydrateRev } = useHydratePropertiesFromGuesty();
  // Recompute after hydration so the Insights badge reflects live data.
  const insightsCount = useMemo(
    () => portfolioInsights().filter((i) => i.severity === 'high').length,
    [hydrateRev],
  );
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'all', label: 'All properties' },
    { id: 'onboarding', label: 'Onboarding' },
    { id: 'insights', label: insightsCount > 0 ? `Insights · ${insightsCount}` : 'Insights' },
  ];

  const active = tabs.find((t) => t.id === subPage)?.id ?? 'overview';
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Cross-link target: ?p=<code> opens detail directly. Strip the param after
  // reading so closing the drawer + navigating away then back doesn't re-open
  // it on remount (Reservations bug-fix sweep pattern).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const target = params.get('p');
    if (target) {
      setOpenCode(target);
      params.delete('p');
      const qs = params.toString();
      const nextUrl = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
      window.history.replaceState(window.history.state, '', nextUrl);
    }
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <ModuleHeader
        title="Properties"
        subtitle="Unification layer between Guesty (commercial) and Breezeway (operational) · destination for everything property-anchored"
        tabs={tabs}
        activeTab={active}
        onTabChange={onChangeSubPage}
        actions={
          <button className="btn primary sm" onClick={() => setCreateOpen(true)}>
            <IconPlus size={12} /> New property
          </button>
        }
      />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {active === 'overview' && <OverviewPage onOpen={setOpenCode} />}
        {active === 'all' && <AllPropertiesPage onOpen={setOpenCode} />}
        {active === 'onboarding' && <OnboardingPage onOpen={setOpenCode} />}
        {active === 'insights' && <InsightsPage onOpen={setOpenCode} />}
      </div>
      {openCode && (
        <PropertyDetail
          propertyCode={openCode}
          onClose={() => setOpenCode(null)}
        />
      )}
      <CreatePropertyDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(p) => {
          setCreateOpen(false);
          setOpenCode(p.code);
        }}
      />
    </div>
  );
}
