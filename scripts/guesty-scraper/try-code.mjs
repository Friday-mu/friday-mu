// Try a Guesty MFA code WITHOUT triggering a fresh email/password
// submit first. If the persisted .profile session has us stuck on the
// MFA-prompt page, this enters the code and submits. If we're stuck on
// the plain login page (no MFA pending), it does email+password first
// to trigger a fresh code and then exits — caller must re-run with
// a fresh code in that case.
//
// Usage: MFA_CODE=123456 node try-code.mjs

import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = resolve(__dirname, '.profile');
const DEBUG = resolve(__dirname, '.debug');
mkdirSync(DEBUG, { recursive: true });

const EMAIL = process.env.GUESTY_WEB_EMAIL;
const PASSWORD = process.env.GUESTY_WEB_PASSWORD;
const CODE = (process.env.MFA_CODE || '').trim();
if (!CODE) { console.error('Missing MFA_CODE env'); process.exit(1); }

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: true,
  viewport: { width: 1400, height: 900 },
});
const page = await ctx.newPage();

async function dump(label) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const shot = resolve(DEBUG, `try-code-${label}-${stamp}.png`);
  const html = resolve(DEBUG, `try-code-${label}-${stamp}.html`);
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  await page.content().then((h) => writeFileSync(html, h)).catch(() => {});
  return { shot, html };
}

async function isOnMfaPrompt() {
  const body = await page.evaluate(() => (document.body?.innerText || '').slice(0, 600));
  const url = page.url();
  return { url, body, hasMfaText: /authentication|verification code|enter the code|code you received/i.test(body) };
}

async function fillAndSubmitCode(code) {
  const filled = await page.evaluate((c) => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const single = inputs.find((i) => (i.type === 'text' || i.type === 'tel' || i.type === 'number') && (i.maxLength === c.length || /code|otp|token/i.test((i.name || '') + ' ' + (i.id || '') + ' ' + (i.placeholder || '') + ' ' + (i.getAttribute('aria-label') || ''))));
    if (single) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(single, c);
      single.dispatchEvent(new Event('input', { bubbles: true }));
      single.dispatchEvent(new Event('change', { bubbles: true }));
      return { mode: 'single' };
    }
    const digitInputs = inputs.filter((i) => i.maxLength === 1 && (i.type === 'text' || i.type === 'tel' || i.type === 'number'));
    if (digitInputs.length >= c.length) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      for (let i = 0; i < c.length; i++) {
        setter.call(digitInputs[i], c[i]);
        digitInputs[i].dispatchEvent(new Event('input', { bubbles: true }));
        digitInputs[i].dispatchEvent(new Event('change', { bubbles: true }));
      }
      return { mode: 'digits' };
    }
    return { mode: 'none' };
  }, code);
  if (filled.mode === 'none') throw new Error('no code input field');
  const verifyBtn = page.getByRole('button', { name: /verify|continue|submit|sign in|sign-in/i }).first();
  await verifyBtn.click({ timeout: 5000 }).catch(async () => { await page.keyboard.press('Enter'); });
}

let outcome = 'unknown';
try {
  await page.goto('https://app.guesty.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  let state = await isOnMfaPrompt();
  console.log(`[try-code] initial state url=${state.url} hasMfa=${state.hasMfaText}`);

  if (!state.hasMfaText && /auth\/login|signin/i.test(state.url)) {
    // No pending MFA — must do email+password first to trigger one.
    if (!EMAIL || !PASSWORD) {
      throw new Error('on login page + no MFA pending + no creds to trigger one');
    }
    console.log(`[try-code] no pending MFA; running email+password to trigger`);
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.fill(EMAIL);
    await page.getByRole('button', { name: /continue|next/i }).first().click();
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const pwInput = page.locator('input[type="password"], input[name="password"], #okta-signin-password').first();
    await pwInput.waitFor({ state: 'visible', timeout: 10000 });
    await pwInput.fill(PASSWORD);
    await page.locator('#okta-signin-submit, button[type="submit"]').first().click({ timeout: 5000 }).catch(async () => {
      await pwInput.press('Enter');
    });
    try {
      await page.waitForFunction(() => /authentication|verify|verification code|code you received|enter the code/i.test(document.body?.innerText || ''), null, { timeout: 30000 });
    } catch { /* fall through, we'll check below */ }
    state = await isOnMfaPrompt();
    console.log(`[try-code] after credentials url=${state.url} hasMfa=${state.hasMfaText}`);
  }

  if (!state.hasMfaText) {
    if (/communication|inbox|dashboard|home/i.test(state.url)) {
      console.log(`[try-code] no MFA needed — already on ${state.url}`);
      outcome = 'already-authed';
    } else {
      await dump('no-mfa-page');
      console.error(`[try-code] not on MFA prompt and not on inbox. URL=${state.url}`);
      outcome = 'unexpected-state';
    }
  } else {
    // Try the code we have.
    await fillAndSubmitCode(CODE);
    console.log(`[try-code] submitted code: ${CODE.replace(/.(?=.{2})/g, '•')}`);
    try {
      await page.waitForFunction(() => !/authentication|verification code|enter the code|code you received/i.test(document.body?.innerText || ''), null, { timeout: 30000 });
    } catch { /* timed out; check anyway */ }
    const finalUrl = page.url();
    const finalBody = await page.evaluate(() => (document.body?.innerText || '').slice(0, 500));
    console.log(`[try-code] post-submit url=${finalUrl}`);
    if (/communication|inbox|dashboard|home/i.test(finalUrl)) {
      console.log(`[try-code] success!`);
      outcome = 'success';
    } else if (/invalid|incorrect|expired|wrong/i.test(finalBody)) {
      console.error(`[try-code] code rejected. body=${JSON.stringify(finalBody)}`);
      outcome = 'code-rejected';
    } else {
      await dump('post-submit-unknown');
      console.error(`[try-code] unclear outcome. url=${finalUrl} body-head=${JSON.stringify(finalBody)}`);
      outcome = 'unknown-post-submit';
    }
  }
} catch (e) {
  console.error(`[try-code] error: ${e?.message || e}`);
  if (outcome === 'unknown') outcome = 'error';
} finally {
  await ctx.close();
  console.log(`[try-code] outcome=${outcome}`);
  process.exit(outcome === 'success' || outcome === 'already-authed' ? 0 : 2);
}
