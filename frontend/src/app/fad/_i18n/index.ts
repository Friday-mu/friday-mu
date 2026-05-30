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
    // Use single-brace placeholders {n} / {date} / {error} — matches
    // the convention already established in arrivalsBooked and friends.
    interpolation: { escapeValue: false, prefix: '{', suffix: '}' },
    returnEmptyString: false,
  });
}

export async function setLanguage(lang: Lang): Promise<void> {
  ensureI18nInitialized();
  writeStoredLang(lang);
  await i18n.changeLanguage(lang);
  // T3.15 v0.3 — fire-and-forget DB persist so the choice survives a
  // logout / fresh device. Don't block on it; localStorage is the
  // source of truth for the current tab.
  void persistPreferredLanguageToServer(lang);
}

async function persistPreferredLanguageToServer(lang: Lang): Promise<void> {
  if (typeof window === 'undefined') return;
  const token = window.localStorage.getItem('gms_token');
  if (!token) return; // not logged in — skip silently
  try {
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');
    const url = `${apiBase}/api/auth/me/preferences`;
    await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ preferred_language: lang }),
    });
  } catch {
    // Silent — DB persist is a nice-to-have. localStorage already
    // has the value so the current session is fine.
  }
}

/**
 * Hydrate the language from the user's DB preference on mount. Called
 * once from FadApp; safely no-ops when not logged in or when the user
 * has no preference set yet. localStorage takes precedence: if the
 * user explicitly switched on this device, we don't overwrite that
 * with a possibly-stale server-side value.
 */
export async function hydrateLanguageFromServer(): Promise<void> {
  if (typeof window === 'undefined') return;
  ensureI18nInitialized();
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'fr') return; // device choice wins
  const token = window.localStorage.getItem('gms_token');
  if (!token) return;
  try {
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');
    const res = await fetch(`${apiBase}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const me = await res.json();
    const dbLang = me?.preferred_language;
    if (dbLang === 'en' || dbLang === 'fr') {
      writeStoredLang(dbLang);
      await i18n.changeLanguage(dbLang);
    }
  } catch {
    // Silent — fall back to the existing in-memory lang.
  }
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
