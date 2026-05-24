// T3.15 — i18next bootstrap. Imported once from FadApp.tsx via a
// side-effect import so initialization runs before the first render.
//
// Persistence: language preference stored in localStorage under the
// `fad:lang` key. On first load, defaults to browser language if it
// starts with 'fr', otherwise English. Server-rendered HTML always
// uses 'en' (static export — no per-user SSR), then hydration
// swaps to the stored preference on client.
//
// Falling back: missing keys fall back to the English source so a
// half-translated module still renders sensibly.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { fr } from './fr';

export type Lang = 'en' | 'fr';
export const SUPPORTED_LANGS: Lang[] = ['en', 'fr'];
const STORAGE_KEY = 'fad:lang';

export function readStoredLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'fr') return stored;
    // First-load default: respect browser preference for FR speakers.
    const nav = (window.navigator.language || '').toLowerCase();
    if (nav.startsWith('fr')) return 'fr';
  } catch {
    /* localStorage blocked — fall through to en */
  }
  return 'en';
}

export function writeStoredLang(lang: Lang): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* localStorage blocked — silently no-op; the in-memory i18next
     * state still applies for this session. */
  }
}

let initialized = false;

export function ensureI18nInitialized(): void {
  if (initialized) return;
  initialized = true;
  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
    },
    // Start with EN on the server so SSG HTML stays deterministic.
    // The provider below swaps on mount.
    lng: typeof window === 'undefined' ? 'en' : readStoredLang(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });
}

export async function setLanguage(lang: Lang): Promise<void> {
  ensureI18nInitialized();
  writeStoredLang(lang);
  await i18n.changeLanguage(lang);
}

export function getLanguage(): Lang {
  ensureI18nInitialized();
  const cur = i18n.language;
  return cur === 'fr' ? 'fr' : 'en';
}

// Initialize on module load so any component importing this can
// safely call useTranslation() immediately.
ensureI18nInitialized();

export { i18n };
