'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface Props {
  title: string;
  subtitle?: string;
  tabs?: Tab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  actions?: ReactNode;
}

export function ModuleHeader({ title, subtitle, tabs, activeTab, onTabChange, actions }: Props) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const activeTabObj = tabs?.find((t) => t.id === activeTab);
  const desktopTabsRef = useRef<HTMLDivElement | null>(null);

  // On mobile / narrow viewports the desktop tabs row scrolls horizontally — when
  // the active tab is far to the right (e.g. "Tasks" in a 9-tab list), it would
  // be off-screen at first paint. Scroll it into view so users can see what's
  // selected without dragging.
  useEffect(() => {
    if (!desktopTabsRef.current || !activeTab) return;
    const active = desktopTabsRef.current.querySelector('.fad-tab.active') as HTMLElement | null;
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeTab]);

  return (
    <div className="fad-module-header">
      <div className="fad-module-header-main">
        <h1 className="fad-module-title">{title}</h1>
        {subtitle && <div className="fad-module-subtitle">{subtitle}</div>}
        {tabs && tabs.length > 0 && (
          <>
            {/* Desktop: full tabs row · always rendered, hidden on mobile via CSS */}
            <div ref={desktopTabsRef} className="fad-tabs fad-tabs-desktop">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  className={'fad-tab' + (activeTab === t.id ? ' active' : '')}
                  onClick={() => onTabChange?.(t.id)}
                >
                  {t.label}
                  {t.count !== undefined && <span className="count mono">{t.count}</span>}
                </button>
              ))}
            </div>

            {/* Mobile: active-tab + "More" dropdown · always rendered, hidden on desktop via CSS */}
            <div className="fad-tabs fad-tabs-mobile">
                {activeTabObj && (
                  <button className="fad-tab active" type="button">
                    {activeTabObj.label}
                    {activeTabObj.count !== undefined && (
                      <span className="count mono">{activeTabObj.count}</span>
                    )}
                  </button>
                )}
                <div style={{ position: 'relative' }}>
                  <button
                    className={'fad-tab' + (overflowOpen ? ' active' : '')}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOverflowOpen(!overflowOpen);
                    }}
                    aria-haspopup="menu"
                    aria-expanded={overflowOpen}
                  >
                    More ▾
                  </button>
                  {overflowOpen && (
                    <>
                      <div
                        style={{ position: 'fixed', inset: 0, zIndex: 9 }}
                        onClick={() => setOverflowOpen(false)}
                      />
                      <div
                        className="fad-dropdown"
                        style={{ minWidth: 200, padding: 4, zIndex: 10 }}
                        onClick={(e) => e.stopPropagation()}
                        role="menu"
                      >
                        {tabs.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            role="menuitem"
                            className="fad-dropdown-item"
                            onClick={() => {
                              onTabChange?.(t.id);
                              setOverflowOpen(false);
                            }}
                            style={
                              activeTab === t.id
                                ? { color: 'var(--color-brand-accent)', fontWeight: 500 }
                                : undefined
                            }
                          >
                            <span>{t.label}</span>
                            {t.count !== undefined && <span className="meta">{t.count}</span>}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
          </>
        )}
      </div>
      {actions && <div className="fad-module-actions">{actions}</div>}
    </div>
  );
}
