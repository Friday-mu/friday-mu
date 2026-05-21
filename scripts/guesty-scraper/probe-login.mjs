// One-shot probe: open Guesty in the scraper's persistent profile,
// screenshot/dump whatever page loads. Used to diagnose what flavour of
// login (SSO vs email+password) Guesty redirects to and whether the
// existing profile session is salvageable.

import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = resolve(__dirname, '.profile');
const DEBUG = resolve(__dirname, '.debug');
mkdirSync(DEBUG, { recursive: true });

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: true,
  viewport: { width: 1400, height: 900 },
});
const page = await ctx.newPage();

try {
  await page.goto('https://app.guesty.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const shot = resolve(DEBUG, `login-probe-${stamp}.png`);
  const html = resolve(DEBUG, `login-probe-${stamp}.html`);
  await page.screenshot({ path: shot, fullPage: true });
  writeFileSync(html, await page.content());

  const diag = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    bodyTextHead: (document.body?.innerText || '').slice(0, 800),
    inputs: Array.from(document.querySelectorAll('input')).map((i) => ({
      type: i.type, name: i.name, id: i.id,
      placeholder: i.placeholder, ariaLabel: i.getAttribute('aria-label'),
      autocomplete: i.autocomplete,
    })),
    buttons: Array.from(document.querySelectorAll('button')).slice(0, 15).map((b) => b.textContent?.trim().slice(0, 100)),
    googleAnchors: Array.from(document.querySelectorAll('a, button')).filter((n) => /google|sso/i.test(n.textContent || '')).slice(0, 5).map((n) => n.textContent?.trim().slice(0, 80)),
    hasGoogleFrame: !!document.querySelector('iframe[src*="google"]'),
  }));
  console.log(JSON.stringify({ ...diag, screenshot: shot, html }, null, 2));
} catch (e) {
  console.error(`[probe] failed: ${e?.message || e}`);
} finally {
  await ctx.close();
}
