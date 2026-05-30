'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import dynamic from 'next/dynamic';
// T3.15 — side-effect import boots i18next before any module-level
// useTranslation()/useT() call fires. Must precede other module
// imports.
import '../_i18n';
import { hydrateLanguageFromServer } from '../_i18n';
import { MODULES, visibleSubPagesForModuleRole, type ModuleDef } from '../_data/modules';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { CommandPalette } from './CommandPalette';
import { FridayDrawer } from './FridayDrawer';
import { FridayFullscreen } from './FridayFullscreen';
// Eager (shell-level): finance-role helper + the always-mounted FAB / modal / banner.
import { lockedFinanceSubsFor, type FinRole } from '../_data/financeRoles';
import { BugReportFab } from './BugReport';
import { ChangePasswordModal } from './ChangePasswordModal';
import { UpdateBanner } from './UpdateBanner';

// ── Perf: module bodies are code-split via next/dynamic ────────────────────────
// Previously all ~19 modules + the field PWA were statically imported, so the
// initial /fad bundle shipped every module (incl. heavy Design/Finance/Analytics
// fixtures) up-front. Each is now a client-only (ssr:false) lazy chunk fetched on
// demand, behind a lightweight skeleton. Shell chrome (Header / Sidebar /
// CommandPalette / Friday*) stays eager so first paint is unaffected.
const InboxModule = dynamic(() => import('./modules/InboxModule').then((m) => ({ default: m.InboxModule })), { ssr: false, loading: ModuleLoading });
const CalendarModule = dynamic(() => import('./modules/CalendarModule').then((m) => ({ default: m.CalendarModule })), { ssr: false, loading: ModuleLoading });
const SettingsModule = dynamic(() => import('./modules/SettingsModule').then((m) => ({ default: m.SettingsModule })), { ssr: false, loading: ModuleLoading });
const LegalModule = dynamic(() => import('./modules/StubModules').then((m) => ({ default: m.LegalModule })), { ssr: false, loading: ModuleLoading });
const OwnersModule = dynamic(() => import('./modules/StubModules').then((m) => ({ default: m.OwnersModule })), { ssr: false, loading: ModuleLoading });
const TeaseModule = dynamic(() => import('./modules/StubModules').then((m) => ({ default: m.TeaseModule })), { ssr: false, loading: ModuleLoading });
const PropertiesModule = dynamic(() => import('./modules/PropertiesModule').then((m) => ({ default: m.PropertiesModule })), { ssr: false, loading: ModuleLoading });
const OperationsModule = dynamic(() => import('./modules/OperationsModule').then((m) => ({ default: m.OperationsModule })), { ssr: false, loading: ModuleLoading });
const FieldApp = dynamic(() => import('./field/FieldApp'), { ssr: false, loading: ModuleLoading });
const FinanceModule = dynamic(() => import('./modules/FinanceModule').then((m) => ({ default: m.FinanceModule })), { ssr: false, loading: ModuleLoading });
const GuestsModule = dynamic(() => import('./modules/Tier3Modules').then((m) => ({ default: m.GuestsModule })), { ssr: false, loading: ModuleLoading });
const IntelligenceModule = dynamic(() => import('./modules/Tier3Modules').then((m) => ({ default: m.IntelligenceModule })), { ssr: false, loading: ModuleLoading });
const LeadsModule = dynamic(() => import('./modules/Tier3Modules').then((m) => ({ default: m.LeadsModule })), { ssr: false, loading: ModuleLoading });
const MarketingModule = dynamic(() => import('./modules/Tier3Modules').then((m) => ({ default: m.MarketingModule })), { ssr: false, loading: ModuleLoading });
const AgencyModule = dynamic(() => import('./modules/AgencyModule').then((m) => ({ default: m.AgencyModule })), { ssr: false, loading: ModuleLoading });
const ReviewsModule = dynamic(() => import('./modules/ReviewsModule').then((m) => ({ default: m.ReviewsModule })), { ssr: false, loading: ModuleLoading });
const AnalyticsModule = dynamic(() => import('./modules/AnalyticsModule').then((m) => ({ default: m.AnalyticsModule })), { ssr: false, loading: ModuleLoading });
const ReservationsModule = dynamic(() => import('./modules/ReservationsModule').then((m) => ({ default: m.ReservationsModule })), { ssr: false, loading: ModuleLoading });
const TrainingModule = dynamic(() => import('./modules/TrainingModule').then((m) => ({ default: m.TrainingModule })), { ssr: false, loading: ModuleLoading });
const NotificationsModule = dynamic(() => import('./modules/NotificationsModule').then((m) => ({ default: m.NotificationsModule })), { ssr: false, loading: ModuleLoading });
const HRModule = dynamic(() => import('./modules/HRModule').then((m) => ({ default: m.HRModule })), { ssr: false, loading: ModuleLoading });
const DesignModule = dynamic(() => import('./modules/DesignModule').then((m) => ({ default: m.DesignModule })), { ssr: false, loading: ModuleLoading });
const TenantSettingsModule = dynamic(() => import('./modules/TenantSettingsModule').then((m) => ({ default: m.TenantSettingsModule })), { ssr: false, loading: ModuleLoading });
const BillingModule = dynamic(() => import('./modules/BillingModule').then((m) => ({ default: m.BillingModule })), { ssr: false, loading: ModuleLoading });
const AdminAnalyticsModule = dynamic(() => import('./modules/AdminAnalyticsModule').then((m) => ({ default: m.AdminAnalyticsModule })), { ssr: false, loading: ModuleLoading });
const AskFridayReviewModule = dynamic(() => import('./modules/AskFridayReviewModule').then((m) => ({ default: m.AskFridayReviewModule })), { ssr: false, loading: ModuleLoading });
import { MODULE_RESOURCE, PermissionsProvider, canSeeModule, useCurrentRole } from './usePermissions';
import { PermissionGate } from './PermissionGate';
import { Toaster } from './Toaster';
import { apiFetch, getToken } from '../../../components/types';
import NotificationPrompt from '../../../components/NotificationPrompt';
import { useEnabledModules } from '../_data/useEnabledModules';
import { useAnnexA } from '../_data/useAnnexA';
import { useTenantCurrency } from '../_data/useTenantCurrency';

type Theme = 'light' | 'dark';

interface FadAppProps {
  initialFridayFs?: boolean;
}

export default function FadApp(props: FadAppProps = {}) {
  return (
    <PermissionsProvider>
      <FadAppInner {...props} />
    </PermissionsProvider>
  );
}

function FadAppInner({ initialFridayFs = true }: FadAppProps) {
  const [active, setActive] = useState('inbox');
  const [subPage, setSubPage] = useState<string | null>(null);
  const [finRole, setFinRole] = useState<FinRole>('admin');
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [fridayOpen, setFridayOpen] = useState(false);
  // Optional finer scope override (e.g. set by a Friday brief insight card so the drawer opens
  // with "Tourist tax MRA registration" instead of the generic module+sub-page).
  // Cleared when the drawer closes or the user switches modules.
  const [fridayScopeOverride, setFridayScopeOverride] = useState<string | null>(null);
  // Default landing = Friday fullscreen. The mount effect below flips this to false if the URL has ?m=<module>.
  const [fridayFs, setFridayFs] = useState(initialFridayFs);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const [bellOpen, setBellOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const role = useCurrentRole();
  const { enabledSet } = useEnabledModules();
  useAnnexA();
  useTenantCurrency();

  const firstAllowedModule = () => {
    return MODULES.find((candidate) => canSeeModule(role, candidate.id)) ?? MODULES[0];
  };

  const firstVisibleSubPage = (modDef: ModuleDef) => {
    return visibleSubPagesForModuleRole(modDef, role)[0]?.id ?? null;
  };

  useEffect(() => {
    if (!getToken()) {
      window.location.replace('/');
      return;
    }
    setAuthChecked(true);
    void apiFetch('/api/auth/me')
      .then((data) => {
        if (data?.must_change_password) setMustChangePassword(true);
      })
      .catch(() => undefined);
    // T3.15 v0.3 — hydrate the UI language from the user's DB
    // preference if no localStorage choice exists on this device.
    void hydrateLanguageFromServer();

    const params = new URLSearchParams(window.location.search);
    let urlMod = params.get('m');
    const urlSub = params.get('sub');
    // Legacy redirect: 'tasks' module was renamed to 'operations'.
    if (urlMod === 'tasks') urlMod = 'operations';
    // Legacy redirect: 'interior' was renamed to the live Design module.
    if (urlMod === 'interior') urlMod = 'design';
    if (urlMod && MODULES.some((m) => m.id === urlMod)) {
      const requestedMod = MODULES.find((m) => m.id === urlMod);
      const modDef = requestedMod && canSeeModule(role, requestedMod.id)
        ? requestedMod
        : firstAllowedModule();
      setActive(modDef.id);
      setFridayFs(false);
      const visibleSubPages = visibleSubPagesForModuleRole(modDef, role);
      if (urlSub && visibleSubPages.some((s) => s.id === urlSub)) {
        setSubPage(urlSub);
      } else if (visibleSubPages.length) {
        setSubPage(visibleSubPages[0].id);
      } else {
        setSubPage(null);
      }
    } else if (role === 'field') {
      // Field-staff default landing: Operations → My tasks. Field workflow
      // is task-execution, not exploration, so save a tap and land them
      // directly on their queue. Ask Friday remains one tap away via the
      // sidebar entry; directors / managers still get Ask Friday fullscreen
      // as their default. Only applies when there's no explicit ?m= URL
      // param — bookmarked / shared links still resolve normally.
      const opsMod = MODULES.find((m) => m.id === 'operations');
      if (opsMod && canSeeModule(role, opsMod.id)) {
        setActive('operations');
        setSubPage('my');
        setFridayFs(false);
      }
    }
    setCollapsed(localStorage.getItem('fad:collapsed') === '1');
    const savedTheme = localStorage.getItem('fad:theme') as Theme | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('fad-dark', theme === 'dark');
    if (hydrated) localStorage.setItem('fad:theme', theme);
    return () => {
      document.documentElement.classList.remove('fad-dark');
    };
  }, [theme, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const url = new URL(window.location.href);
    let changed = false;
    if (fridayFs) {
      if (url.searchParams.has('m')) { url.searchParams.delete('m'); changed = true; }
      if (url.searchParams.has('sub')) { url.searchParams.delete('sub'); changed = true; }
    } else {
      if (url.searchParams.get('m') !== active) { url.searchParams.set('m', active); changed = true; }
      if (subPage) {
        if (url.searchParams.get('sub') !== subPage) { url.searchParams.set('sub', subPage); changed = true; }
      } else if (url.searchParams.has('sub')) {
        url.searchParams.delete('sub'); changed = true;
      }
    }
    if (changed) window.history.replaceState(null, '', url);
  }, [active, subPage, fridayFs, hydrated]);

  useEffect(() => {
    if (hydrated) localStorage.setItem('fad:collapsed', collapsed ? '1' : '0');
  }, [collapsed, hydrated]);

  useEffect(() => {
    if (!hydrated || fridayFs) return;
    const activeMod = MODULES.find((m) => m.id === active);
    if (!activeMod || !canSeeModule(role, activeMod.id)) {
      const fallback = firstAllowedModule();
      setActive(fallback.id);
      setSubPage(firstVisibleSubPage(fallback));
      return;
    }
    const visibleSubPages = visibleSubPagesForModuleRole(activeMod, role);
    if (visibleSubPages.length === 0) {
      if (subPage !== null) setSubPage(null);
      return;
    }
    if (!subPage || !visibleSubPages.some((s) => s.id === subPage)) {
      setSubPage(visibleSubPages[0].id);
    }
  }, [active, fridayFs, hydrated, role, subPage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (mod && e.key === '/') {
        e.preventDefault();
        setFridayOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setPaletteOpen(false);
        setBellOpen(false);
        setHelpOpen(false);
        setAvatarOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onClick = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest('.fad-header')) {
        setBellOpen(false);
        setHelpOpen(false);
        setAvatarOpen(false);
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  const dropdownHandler = (setter: (v: boolean) => void, others: Array<(v: boolean) => void>) =>
    (e: MouseEvent) => {
      e.stopPropagation();
      setter(!getCurrent(setter));
      others.forEach((o) => o(false));
    };

  const getCurrent = (setter: (v: boolean) => void) => {
    if (setter === setBellOpen) return bellOpen;
    if (setter === setHelpOpen) return helpOpen;
    if (setter === setAvatarOpen) return avatarOpen;
    return false;
  };

  const mod: ModuleDef = MODULES.find((m) => m.id === active) || MODULES[0];
  // Compose Friday's scope: override > module + sub-page label > module label.
  const subPageLabel = subPage && mod.subPages
    ? mod.subPages.find((s) => s.id === subPage)?.label || null
    : null;
  const fridayScope = fridayScopeOverride
    || (subPageLabel ? `${mod.label} · ${subPageLabel}` : mod.label);
  const moduleDisabledForTenant = !fridayFs && enabledSet !== null && !enabledSet.has(active);

  // Single entry point used by header pill, sidebar tile, ⌘/, AND inline triggers (Friday brief
  // cards, "Ask Friday" inline buttons). Optional `scope` overrides the auto-computed module+sub-page.
  const openFriday = (scope?: string) => {
    setFridayScopeOverride(scope || null);
    setFridayOpen(true);
  };
  const closeFriday = () => {
    setFridayOpen(false);
    setFridayScopeOverride(null);
  };

  if (!authChecked) return null;

  // Field staff get a dedicated mobile PWA shell (bottom-nav task app) rather
  // than the manager Header+Sidebar desktop shell. Director "View as → Field"
  // resolves here too, so it can be previewed. (Real feature — the demo gaps
  // are inside individual field screens, tracked in DEMO_CRUFT.md PROD-FIELD-*.)
  if (role === 'field') {
    return (
      <>
        <FieldApp />
        <NotificationPrompt />
        <Toaster />
        {mustChangePassword && <ChangePasswordModal onChanged={() => setMustChangePassword(false)} />}
      </>
    );
  }

  return (
    <div className="fad-app">
      <UpdateBanner />
      <Header
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenFriday={() => fridayOpen ? closeFriday() : openFriday()}
        fridayOpen={fridayOpen}
        onToggleSidebar={() => {
          if (typeof window !== 'undefined' && window.innerWidth <= 768) {
            setMobileNavOpen((o) => !o);
          } else {
            setCollapsed((c) => !c);
          }
        }}
        onGoHome={() => {
          setFridayFs(true);
          setFridayOpen(false);
          setPaletteOpen(false);
          setMobileNavOpen(false);
        }}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenBell={dropdownHandler(setBellOpen, [setHelpOpen, setAvatarOpen])}
        bellOpen={bellOpen}
        onOpenHelp={dropdownHandler(setHelpOpen, [setBellOpen, setAvatarOpen])}
        helpOpen={helpOpen}
        onOpenAvatar={dropdownHandler(setAvatarOpen, [setBellOpen, setHelpOpen])}
        avatarOpen={avatarOpen}
      />
      <div className="fad-body">
        <Sidebar
          active={fridayFs ? '' : active}
          subPage={subPage}
          lockedSubs={{ finance: lockedFinanceSubsFor(finRole) }}
          onSelect={(id) => {
            setActive(id);
            const modDef = MODULES.find((m) => m.id === id);
            const visibleSubPages = modDef ? visibleSubPagesForModuleRole(modDef, role) : [];
            setSubPage(visibleSubPages.length ? visibleSubPages[0].id : null);
            setFridayFs(false);
          }}
          onSelectSub={(modId, sub) => {
            setActive(modId);
            setSubPage(sub);
            setFridayFs(false);
          }}
          collapsed={collapsed}
          fridayFs={fridayFs}
          onOpenFridayFs={() => {
            setFridayFs((v) => !v);
            setFridayOpen(false);
          }}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
        <main
          className="fad-main"
          key={fridayFs ? 'fs' : active + ':' + (subPage || '')}
          data-screen-label={fridayFs ? 'Friday Fullscreen' : mod.label}
        >
          {fridayFs ? (
            <FridayFullscreen
              onNavigate={(m) => {
                const requestedMod = MODULES.find((md) => md.id === m);
                const modDef = requestedMod && canSeeModule(role, requestedMod.id)
                  ? requestedMod
                  : firstAllowedModule();
                setActive(modDef.id);
                const visibleSubPages = visibleSubPagesForModuleRole(modDef, role);
                setSubPage(visibleSubPages.length ? visibleSubPages[0].id : null);
                setFridayFs(false);
              }}
              onExit={() => setFridayFs(false)}
            />
          ) : moduleDisabledForTenant ? (
            <ModuleNotEnabled label={mod.label} />
          ) : (
            renderModule(mod, subPage, { theme, toggleTheme, openFriday, finRole, setFinRole, setSubPage })
          )}
        </main>
      </div>
      <FridayDrawer
        open={fridayOpen && !fridayFs}
        onClose={closeFriday}
        scope={fridayScope}
        onNavigate={setActive}
        onExpand={() => {
          setFridayFs(true);
          setFridayOpen(false);
        }}
      />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={setActive}
        onAskFriday={() => openFriday()}
        onToggleTheme={toggleTheme}
      />
      <BugReportFab currentModuleLabel={fridayFs ? 'Ask Friday' : mod.label} />
      <NotificationPrompt />
      <Toaster />
      {mustChangePassword && (
        <ChangePasswordModal onChanged={() => setMustChangePassword(false)} />
      )}
    </div>
  );
}

// Lightweight skeleton shown while a code-split module chunk loads.
function ModuleLoading() {
  return (
    <div
      className="fad-module-body"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240, fontSize: 12, color: 'var(--color-text-tertiary)' }}
    >
      Loading…
    </div>
  );
}

function ModuleNotEnabled({ label }: { label: string }) {
  return (
    <div className="fad-module-body">
      <div className="card" style={{ padding: 24, maxWidth: 560, margin: '40px auto', textAlign: 'center' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 500 }}>{label} is not enabled</h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
          This module is not enabled for your tenant.
        </p>
      </div>
    </div>
  );
}

function renderModule(
  mod: ModuleDef,
  subPage: string | null,
  ctx: { theme: Theme; toggleTheme: () => void; openFriday: (scope?: string) => void; finRole: FinRole; setFinRole: (r: FinRole) => void; setSubPage: (sub: string) => void }
) {
  const inner = renderModuleInner(mod, subPage, ctx);
  const resources = MODULE_RESOURCE[mod.id];
  if (!resources?.length) return inner;
  // Defense-in-depth: Sidebar already filters, but a direct ?m=finance URL with a
  // restricted role would bypass that. Module-level gate catches it.
  // OR semantics: module renders if ANY listed resource is granted.
  return (
    <PermissionGate resource={resources}>
      {inner}
    </PermissionGate>
  );
}

function renderModuleInner(
  mod: ModuleDef,
  subPage: string | null,
  ctx: { theme: Theme; toggleTheme: () => void; openFriday: (scope?: string) => void; finRole: FinRole; setFinRole: (r: FinRole) => void; setSubPage: (sub: string) => void }
) {
  switch (mod.id) {
    case 'inbox':
      return <InboxModule onAskFriday={ctx.openFriday} />;
    case 'calendar':
      return <CalendarModule />;
    case 'settings':
      return <SettingsModule theme={ctx.theme} onToggleTheme={ctx.toggleTheme} />;
    case 'training':
      return <TrainingModule />;
    case 'operations':
      return <OperationsModule subPage={subPage || 'overview'} onChangeSubPage={ctx.setSubPage} />;
    case 'hr':
      return <HRModule subPage={subPage || 'staff'} onChangeSubPage={ctx.setSubPage} />;
    case 'reservations':
      return <ReservationsModule subPage={subPage || 'overview'} onChangeSubPage={ctx.setSubPage} />;
    case 'finance':
      return <FinanceModule subPage={subPage || 'overview'} role={ctx.finRole} onRoleChange={ctx.setFinRole} onAskFriday={ctx.openFriday} />;
    case 'legal':
      return <LegalModule />;
    case 'properties':
      return <PropertiesModule subPage={subPage || 'overview'} onChangeSubPage={ctx.setSubPage} />;
    case 'owners':
      return <OwnersModule />;
    case 'reviews':
      return <ReviewsModule subPage={subPage || 'overview'} onChangeSubPage={ctx.setSubPage} />;
    case 'guests':
      return <GuestsModule />;
    case 'marketing':
      return <MarketingModule />;
    case 'leads':
      return <LeadsModule />;
    case 'intelligence':
      return <IntelligenceModule />;
    case 'analytics':
      return <AnalyticsModule />;
    case 'notifications':
      return <NotificationsModule />;
    case 'design':
      return <DesignModule subPage={subPage || 'overview'} onChangeSubPage={ctx.setSubPage} openFriday={ctx.openFriday} />;
    case 'tenant-settings':
      return <TenantSettingsModule subPage={subPage || 'general'} onChangeSubPage={ctx.setSubPage} />;
    case 'billing':
      return <BillingModule />;
    case 'admin-analytics':
      return <AdminAnalyticsModule />;
    case 'ask-friday-review':
      return <AskFridayReviewModule subPage={subPage || 'pending'} onChangeSubPage={ctx.setSubPage} />;
    case 'agency':
      return <AgencyModule />;
    case 'syndic':
      return <TeaseModule mod={mod} />;
    default:
      return <div className="fad-module-body">Module not found.</div>;
  }
}
