// T3.15 — convenience hook + helpers for components consuming i18n.
//
// Why a wrapper instead of importing react-i18next directly: lets us
// (a) ensure the bootstrap runs before the first hook call,
// (b) swap libraries later without touching every call site,
// (c) expose ergonomic helpers like translateModule() / translateGroup()
//     that are the most common Sidebar lookups, and
// (d) live-react to language changes via useSyncExternalStore.

import { useCallback, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { ensureI18nInitialized, getLanguage, i18n, setLanguage, type Lang } from './index';

ensureI18nInitialized();

function subscribeLang(listener: () => void): () => void {
  i18n.on('languageChanged', listener);
  return () => i18n.off('languageChanged', listener);
}

/**
 * Returns the current language ('en' | 'fr') reactively. Components
 * using this re-render when the language changes.
 */
export function useCurrentLang(): Lang {
  return useSyncExternalStore(subscribeLang, getLanguage, () => 'en');
}

/**
 * Returns {t, lang, setLang} — the most common shape used by FAD
 * components for translated strings + an explicit setter for the
 * language toggle UI.
 */
export function useT(): {
  t: (key: string, paramsOrFallback?: Record<string, string | number> | string, fallback?: string) => string;
  lang: Lang;
  setLang: (next: Lang) => Promise<void>;
} {
  const { t: rawT } = useTranslation();
  const lang = useCurrentLang();
  // Accepts either:
  //   t('key')
  //   t('key', 'Fallback EN string')
  //   t('key', {n: 5, error: 'oops'})  — interpolation params
  //   t('key', {n: 5}, 'Fallback EN string')
  const t = useCallback(
    (key: string, paramsOrFallback?: Record<string, string | number> | string, fallback?: string): string => {
      let params: Record<string, string | number> | undefined;
      let fb: string | undefined;
      if (typeof paramsOrFallback === 'string') {
        fb = paramsOrFallback;
      } else if (paramsOrFallback) {
        params = paramsOrFallback;
        fb = fallback;
      }
      const value = rawT(key, { defaultValue: fb ?? key, ...(params || {}) });
      return typeof value === 'string' ? value : String(value);
    },
    [rawT],
  );
  const setLang = useCallback(async (next: Lang) => {
    await setLanguage(next);
  }, []);
  return { t, lang, setLang };
}

/**
 * Sidebar-friendly: takes a module id like 'inbox' and returns the
 * localised label. Falls back to the supplied EN label (from the
 * MODULES fixture) when the key is missing.
 */
export function useTranslateModule(): (moduleId: string, fallback: string) => string {
  const { t } = useT();
  return useCallback(
    (moduleId: string, fallback: string) => t(`module.${moduleId}`, fallback),
    [t],
  );
}

/**
 * Same shape for group labels (Today / Portfolio / Business etc.).
 */
export function useTranslateGroup(): (groupId: string, fallback: string) => string {
  const { t } = useT();
  return useCallback(
    (groupId: string, fallback: string) => t(`group.${groupId}`, fallback),
    [t],
  );
}

/**
 * Sub-page labels — sub-page ids vary by module (overview, schedule,
 * inquiries, etc). Same fallback pattern.
 */
export function useTranslateSubpage(): (subpageId: string, fallback: string) => string {
  const { t } = useT();
  return useCallback(
    (subpageId: string, fallback: string) => t(`subpage.${subpageId}`, fallback),
    [t],
  );
}
