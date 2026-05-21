'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import { MODULES, visibleSubPagesForModuleRole, type ModuleDef } from '../_data/modules';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { CommandPalette } from './CommandPalette';
import { FridayDrawer } from './FridayDrawer';
import { FridayFullscreen } from './FridayFullscreen';
import { InboxModule } from './modules/InboxModule';
import { WebsiteInboxModule } from './modules/WebsiteInboxModule';
import { CalendarModule } from './modules/CalendarModule';
import { SettingsModule } from './modules/SettingsModule';
import {
  LegalModule,
  OwnersModule,
  TeaseModule,
} from './modules/StubModules';
import { PropertiesModule } from './modules/PropertiesModule';
import { OperationsModule } from './modules/OperationsModule';
import { FinanceModule } from './modules/FinanceModule';
import { lockedFinanceSubsFor, type FinRole } from '../_data/financeRoles';
import {
  GuestsModule,
  IntelligenceModule,
  LeadsModule,
  MarketingModule,
} from './modules/Tier3Modules';
import { ReviewsModule } from './modules/ReviewsModule';
import { BugReportFab } from './BugReport';
import { ChangePasswordModal } from './ChangePasswordModal';
import { UpdateBanner } from './UpdateBanner';
import { trackEvent } from '../../../lib/analytics';
import { AnalyticsModule } from './modules/AnalyticsModule';
import { ReservationsModule } from './modules/ReservationsModule';
import { TrainingModule } from './modules/TrainingModule';
import { NotificationsModule } from './modules/NotificationsModule';
import { HRModule } from './modules/HRModule';
import { DesignModule } from './modules/DesignModule';
import { TenantSettingsModule } from './modules/TenantSettingsModule';
import { BillingModule } from './modules/BillingModule';
import { AdminAnalyticsModule } from './modules/AdminAnalyticsModule';
import { canSeeModule, MODULE_RESOURCE, PermissionsProvider, useCurrentRole } from './usePermissions';
import { PermissionGate } from './PermissionGate';
import { Toaster } from './Toaster';
import { useEnabledModules } from '../_data/useEnabledModules';
import { useAnnexA } from '../_data/useAnnexA';
import { useTenantCurrency } from '../_data/useTenantCurrency';
import { apiFetch } from '../../../components/types';
import { FR_TENANT_ID, useCurrentTenantId } from '../_data/useTenantIdentity';
import { demoDataEnabled, liveOnlyMode, LIVE_WIRED_MODULE_IDS } from '../_data/demoMode';

type Theme = 'light' | 'dark';

interface FadAppProps {
  initialFridayFs?: boolean;
}

interface FadQaSnapshot {
  activeModule: string;
  subPage: string | null;
  screenLabel: string;
  fridayFullscreen: boolean;
  fridayDrawerOpen: boolean;
  commandPaletteOpen: boolean;
  mobileNavOpen: boolean;
  sidebarCollapsed: boolean;
  theme: Theme;
  hydrated: boolean;
  role: ReturnType<typeof useCurrentRole>;
  tenantId: string | null;
  isFrTenant: boolean;
  liveOnly: boolean;
  demoDataEnabled: boolean;
  enabledModulesLoaded: boolean;
  enabledModules: string[] | null;
  viewport: {
    width: number;
    height: number;
    isMobile: boolean;
  };
  pwa: {
    displayModeStandalone: boolean;
    serviceWorkerController: boolean;
    notificationPermission: NotificationPermission | 'unsupported';
  };
}

interface FadQaApi {
  version: 1;
  snapshot: () => FadQaSnapshot;
  navigate: (moduleId: string, subPage?: string | null) => boolean;
  closeOverlays: () => void;
  openFriday: () => void;
  closeFriday: () => void;
  openSidebar: () => void;
  closeSidebar: () => void;
  setDemoData: (enabled: boolean) => void;
}

declare global {
  interface Window {
    __FAD_QA__?: FadQaApi;
  }
}

export default function FadApp(props: FadAppProps = {}) {
  return (
    <PermissionsProvider>
      <FadAppInner {...props} />
    </PermissionsProvider>
  );
}

function FadAppInner({ initialFridayFs = true }: FadAppProps) {
  const role = useCurrentRole();
  const { enabledSet } = useEnabledModules();
  const tenantId = useCurrentTenantId();
  const isFrTenant = tenantId === FR_TENANT_ID;
  // Side-effect only: hot-patches ANNEX_A_DEFAULT.vatRate (and any future
  // per-tenant constants) on first fetch. The return value is unused —
  // helpers like withVAT/vatOf read ANNEX_A_DEFAULT directly. See
  // _data/useAnnexA.ts for the rationale on the lighter approach.
  useAnnexA();
  // Same shape — populates the tenant currency cache so the legacy
  // `formatMUR` shim (now backed by `currencyCache.ts`) flips from
  // "Rs" to the tenant's currency on the first re-render. Return
  // value unused — call sites read from the cache, not from this hook
  // directly. See _data/useTenantCurrency.ts.
  useTenantCurrency();
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
  // Default landing = Friday fullscreen unless the URL deep-links to a module.
  // Initialize from the browser URL so the URL sync effect cannot erase ?m=...
  // before the mount parser applies it.
  const [fridayFs, setFridayFs] = useState(() => {
    if (typeof window === 'undefined') return initialFridayFs;
    return initialFridayFs && !new URLSearchParams(window.location.search).has('m');
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const [bellOpen, setBellOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // Force-change-password overlay state. Set by the auth/me check below
  // when the user's must_change_password column is TRUE; cleared on
  // successful change-password POST.
  const [mustChangePassword, setMustChangePassword] = useState(false);

  // Usage analytics — fires on every module change (sidebar nav, URL
  // deep-link, command palette). The batched buffer in lib/analytics.ts
  // flushes every 30s or when buffer hits 20; no per-event network cost.
  useEffect(() => {
    if (!hydrated) return; // skip the initial mount echo
    trackEvent('fad_module_open', { module: active, sub_page: subPage });
  }, [active, subPage, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    if (fridayFs) trackEvent('fad_friday_fullscreen_open');
  }, [fridayFs, hydrated]);

  // Auth guard — the shell is post-login. Missing token → back to /.
  // Token is set by LoginScreen on successful /api/auth/login; cleared by
  // apiFetch on any 401 from the backend.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem('gms_token')) {
      window.location.href = '/';
      return;
    }
    // Surface must_change_password from /api/auth/me. Forced-change is a
    // hard block — the modal renders over everything until they reset.
    (async () => {
      try {
        const data = await apiFetch('/api/auth/me');
        if (data?.must_change_password) setMustChangePassword(true);
      } catch (_e) {
        // Non-fatal — worst case they reset later.
      }
    })();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let urlMod = params.get('m');
    const urlSub = params.get('sub');
    // Legacy redirect: 'tasks' module was renamed to 'operations'.
    if (urlMod === 'tasks') urlMod = 'operations';
    // Legacy redirect: 'interior' tease slot was repurposed as the live 'design' module.
    if (urlMod === 'interior') urlMod = 'design';
    if (urlMod && MODULES.some((m) => m.id === urlMod)) {
      setActive(urlMod);
      setFridayFs(false);
      const modDef = MODULES.find((m) => m.id === urlMod);
      const visibleSubPages = modDef ? visibleSubPagesForModuleRole(modDef, role) : [];
      if (urlSub && visibleSubPages.some((s) => s.id === urlSub)) {
        setSubPage(urlSub);
      } else if (visibleSubPages.length) {
        setSubPage(visibleSubPages[0].id);
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
  }, [role]);

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
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (mod && e.key === '/') {
        e.preventDefault();
        setFridayOpen((o) => !o);
      } else if (e.key === 'Escape') {
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

  useEffect(() => {
    if (typeof window === 'undefined' || process.env.NEXT_PUBLIC_FAD_QA === '0') return;

    const readPwaState = () => {
      const nav = window.navigator as Navigator & { standalone?: boolean };
      const displayModeStandalone =
        Boolean(window.matchMedia?.('(display-mode: standalone)').matches) ||
        nav.standalone === true;
      return {
        displayModeStandalone,
        serviceWorkerController: Boolean(window.navigator.serviceWorker?.controller),
        notificationPermission:
          typeof Notification === 'undefined' ? 'unsupported' as const : Notification.permission,
      };
    };

    const closeOverlays = () => {
      setBellOpen(false);
      setHelpOpen(false);
      setAvatarOpen(false);
      setPaletteOpen(false);
      setFridayOpen(false);
      setMobileNavOpen(false);
      setFridayScopeOverride(null);
    };

    const api: FadQaApi = {
      version: 1,
      snapshot: () => ({
        activeModule: active,
        subPage,
        screenLabel: fridayFs ? 'Friday Fullscreen' : mod.label,
        fridayFullscreen: fridayFs,
        fridayDrawerOpen: fridayOpen && !fridayFs,
        commandPaletteOpen: paletteOpen,
        mobileNavOpen,
        sidebarCollapsed: collapsed,
        theme,
        hydrated,
        role,
        tenantId,
        isFrTenant,
        liveOnly: liveOnlyMode(),
        demoDataEnabled: demoDataEnabled(),
        enabledModulesLoaded: Boolean(enabledSet),
        enabledModules: enabledSet ? Array.from(enabledSet).sort() : null,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          isMobile: window.innerWidth <= 768,
        },
        pwa: readPwaState(),
      }),
      navigate: (moduleId, requestedSubPage = null) => {
        const target = MODULES.find((m) => m.id === moduleId);
        if (!target) return false;
        if (!canSeeModule(role, target.id)) return false;
        if (enabledSet && !enabledSet.has(target.id)) return false;
        if (target.id === 'admin-analytics' && !isFrTenant) return false;

        const visibleSubPages = visibleSubPagesForModuleRole(target, role);
        const nextSubPage =
          requestedSubPage && visibleSubPages.some((s) => s.id === requestedSubPage)
            ? requestedSubPage
            : visibleSubPages[0]?.id ?? null;

        setActive(target.id);
        setSubPage(nextSubPage);
        setFridayFs(false);
        closeOverlays();
        return true;
      },
      closeOverlays,
      openFriday: () => {
        setFridayFs(false);
        closeOverlays();
        setFridayOpen(true);
      },
      closeFriday,
      openSidebar: () => setMobileNavOpen(true),
      closeSidebar: () => setMobileNavOpen(false),
      setDemoData: (enabled) => {
        window.localStorage.setItem('fad:demo-data', enabled ? '1' : '0');
        window.location.reload();
      },
    };

    window.__FAD_QA__ = api;
    document.documentElement.dataset.fadQaReady = 'true';
    return () => {
      if (window.__FAD_QA__ === api) delete window.__FAD_QA__;
      delete document.documentElement.dataset.fadQaReady;
    };
  }, [
    active,
    avatarOpen,
    bellOpen,
    collapsed,
    enabledSet,
    fridayFs,
    fridayOpen,
    helpOpen,
    hydrated,
    isFrTenant,
    mobileNavOpen,
    mod.label,
    paletteOpen,
    role,
    subPage,
    tenantId,
    theme,
  ]);

  return (
    <div
      className="fad-app"
      data-qa="fad-app"
      data-qa-ready={hydrated ? 'true' : 'false'}
      data-qa-active-module={active}
      data-qa-sub-page={subPage || ''}
      data-qa-role={role}
      data-qa-tenant={tenantId || ''}
      data-qa-live-only={liveOnlyMode() ? 'true' : 'false'}
      data-qa-demo-data={demoDataEnabled() ? 'true' : 'false'}
      data-qa-theme={theme}
      data-qa-friday-fs={fridayFs ? 'true' : 'false'}
      data-qa-friday-drawer-open={fridayOpen && !fridayFs ? 'true' : 'false'}
      data-qa-command-palette-open={paletteOpen ? 'true' : 'false'}
      data-qa-mobile-nav-open={mobileNavOpen ? 'true' : 'false'}
      data-qa-sidebar-collapsed={collapsed ? 'true' : 'false'}
    >
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
          data-qa="fad-main"
          data-qa-screen-label={fridayFs ? 'Friday Fullscreen' : mod.label}
          data-qa-module={fridayFs ? 'friday-fullscreen' : active}
          data-qa-sub-page={fridayFs ? '' : subPage || ''}
          data-qa-friday-fs={fridayFs ? 'true' : 'false'}
        >
          {fridayFs ? (
            <FridayFullscreen
              onNavigate={(m) => {
                setActive(m);
                const modDef = MODULES.find((md) => md.id === m);
                const visibleSubPages = modDef ? visibleSubPagesForModuleRole(modDef, role) : [];
                setSubPage(visibleSubPages.length ? visibleSubPages[0].id : null);
                setFridayFs(false);
              }}
              onExit={() => setFridayFs(false)}
            />
          ) : (
            renderModule(mod, subPage, { theme, toggleTheme, openFriday, finRole, setFinRole, setSubPage, enabledSet, isFrTenant })
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
      <Toaster />
      {mustChangePassword && (
        <ChangePasswordModal onChanged={() => setMustChangePassword(false)} />
      )}
    </div>
  );
}

interface RenderCtx {
  theme: Theme;
  toggleTheme: () => void;
  openFriday: (scope?: string) => void;
  finRole: FinRole;
  setFinRole: (r: FinRole) => void;
  setSubPage: (sub: string) => void;
  /** Tenant-enabled modules. null until /api/tenants/me/modules resolves. */
  enabledSet: Set<string> | null;
  isFrTenant: boolean;
}

function renderModule(
  mod: ModuleDef,
  subPage: string | null,
  ctx: RenderCtx
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

function ModuleNotEnabled({ label }: { label: string }) {
  return (
    <div className="fad-module-body">
      <div className="card" style={{ padding: 24, maxWidth: 560, margin: '40px auto', textAlign: 'center' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 500 }}>{label} is not enabled</h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
          This module is not enabled on your tenant. Contact your admin to enable it.
        </p>
      </div>
    </div>
  );
}

function ModuleLiveOnlyPlaceholder({ label }: { label: string }) {
  return (
    <div className="fad-module-body">
      <div className="card" style={{ padding: 24, maxWidth: 600, margin: '40px auto', textAlign: 'center' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 500 }}>{label} has no live data wiring yet</h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
          Demo data is disabled, so this module is intentionally blank until its backend source is live.
        </p>
      </div>
    </div>
  );
}

function renderModuleInner(
  mod: ModuleDef,
  subPage: string | null,
  ctx: RenderCtx
) {
  if (liveOnlyMode() && !LIVE_WIRED_MODULE_IDS.has(mod.id)) {
    return <ModuleLiveOnlyPlaceholder label={mod.label} />;
  }
  switch (mod.id) {
    case 'inbox':
      return <InboxModule onAskFriday={ctx.openFriday} />;
    case 'website-inbox':
      return <WebsiteInboxModule />;
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
      // Defense-in-depth: a direct ?m=design URL bypasses the sidebar filter.
      // Once enabledSet has loaded and design is NOT in it, refuse to render.
      // While enabledSet is still null (loading), keep rendering — matches the
      // sidebar's "show full list during load" behaviour.
      if (ctx.enabledSet && !ctx.enabledSet.has('design')) {
        return <ModuleNotEnabled label="Design" />;
      }
      return <DesignModule subPage={subPage || 'overview'} onChangeSubPage={ctx.setSubPage} openFriday={ctx.openFriday} />;
    case 'tenant-settings':
      return <TenantSettingsModule subPage={subPage || 'general'} onChangeSubPage={ctx.setSubPage} />;
    case 'billing':
      return <BillingModule />;
    case 'admin-analytics':
      if (!ctx.isFrTenant) {
        return <ModuleNotEnabled label="Admin Analytics" />;
      }
      return <AdminAnalyticsModule />;
    case 'syndic':
    case 'agency':
      return <TeaseModule mod={mod} />;
    default:
      return <div className="fad-module-body">Module not found.</div>;
  }
}
