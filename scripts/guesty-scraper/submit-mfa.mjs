// Submit a Guesty email-MFA code. Re-runs email+password first to make
// sure the code is freshly issued (so we don't burn a stale one), then
// fills the code and verifies we landed on the inbox.
//
// The two-step nature is intentional: we cannot pause between trigger
// and submit reliably without losing the MFA session, so we run them
// as one chromium session and the user supplies the code via env.
//
// USAGE
//   1. User puts the latest Guesty verification code into MFA_CODE.
//   2. Run this script. It will:
//        - open chromium with the persistent profile
//        - fill email + password (triggers fresh MFA)
//        - wait MFA_WAIT_MS for the email to land at judith@friday.mu
//        - assume the freshly-sent code matches MFA_CODE
//        - fill the code field + submit
//        - report whether we landed on the inbox
//
// Caveat: MFA codes are sent on each email+password submit, invalidating
// previous codes. So MFA_CODE must be passed in AFTER the user reads it
// from judith@friday.mu and AFTER this script has triggered MFA. To make
// that work, run with --trigger first to send a code, ask user for it,
// then run with MFA_CODE set and --submit to use the same browser run.
//
// In practice we run this end-to-end: --trigger-and-submit polls a
// `.mfa-code` file (written by user) for up to 4 minutes after sending.

import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = resolve(__dirname, '.profile');
const DEBUG = resolve(__dirname, '.debug');
const CODE_FILE = resolve(__dirname, '.mfa-code');
mkdirSync(DEBUG, { recursive: true });

const EMAIL = process.env.GUESTY_WEB_EMAIL;
const PASSWORD = process.env.GUESTY_WEB_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Missing GUESTY_WEB_EMAIL / GUESTY_WEB_PASSWORD env');
  process.exit(1);
}

const MFA_CODE_ENV = (process.env.MFA_CODE || '').trim();
const MAX_WAIT_MS = Number(process.env.MFA_MAX_WAIT_MS || 240000); // 4 min default
const POLL_MS = 2000;

async function dump(page, label) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const shot = resolve(DEBUG, `submit-mfa-${label}-${stamp}.png`);
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  return shot;
}

function readCodeFromFile() {
  if (!existsSync(CODE_FILE)) return null;
  try {
    const raw = readFileSync(CODE_FILE, 'utf-8').trim();
    // Accept 4-8 digit numeric codes only.
    const m = raw.match(/\b(\d{4,8})\b/);
    return m ? m[1] : null;
  } catch { return null; }
}

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: true,
  viewport: { width: 1400, height: 900 },
});
const page = await ctx.newPage();

let outcome = 'unknown';
try {
  await page.goto('https://app.guesty.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  // 1. Email + password to trigger fresh MFA.
  if (/auth\/login|signin/i.test(page.url())) {
    console.log(`[mfa] on login page; submitting email`);
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.fill(EMAIL);
    await page.getByRole('button', { name: /continue|next/i }).first().click();
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    const pwInput = page.locator('input[type="password"], input[name="password"], #okta-signin-password').first();
    await pwInput.waitFor({ state: 'visible', timeout: 10000 });
    await pwInput.fill(PASSWORD);
    console.log(`[mfa] submitting password — this triggers a fresh MFA email`);
    await page.locator('#okta-signin-submit, button[type="submit"]').first().click({ timeout: 5000 }).catch(async () => {
      await pwInput.press('Enter');
    });

    // Wait for either MFA prompt or another state.
    try {
      await page.waitForFunction(() => /authentication|verify|verification code|code you received|enter the code/i.test(document.body?.innerText || ''), null, { timeout: 30000 });
    } catch {
      console.error(`[mfa] no MFA prompt detected after password submit. Current url=${page.url()}`);
      await dump(page, 'no-mfa');
      outcome = 'no-mfa-prompt';
      throw new Error('no MFA prompt');
    }
    console.log(`[mfa] MFA prompt visible. Waiting for code…`);
  } else if (/communication|inbox|dashboard|home/i.test(page.url())) {
    console.log(`[mfa] already authed — landed on ${page.url()}`);
    outcome = 'already-authed';
    await ctx.close();
    process.exit(0);
  }

  // 2. Get the MFA code. Either from env (if already known) or from .mfa-code file.
  let code = MFA_CODE_ENV;
  if (!code) {
    console.log(`[mfa] waiting for ${CODE_FILE} (poll every ${POLL_MS}ms, max ${MAX_WAIT_MS}ms)…`);
    const deadline = Date.now() + MAX_WAIT_MS;
    while (Date.now() < deadline) {
      const c = readCodeFromFile();
      if (c) { code = c; break; }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }
  if (!code) {
    console.error(`[mfa] no code provided within ${MAX_WAIT_MS}ms`);
    outcome = 'no-code';
    throw new Error('no code');
  }
  console.log(`[mfa] using code: ${code.replace(/.(?=.{2})/g, '•')}`);

  // 3. Fill the code. The MFA UI is Okta-based; it usually presents either
  // a single `input` field or 6 individual digit inputs.
  const filled = await page.evaluate((c) => {
    const inputs = Array.from(document.querySelectorAll('input'));
    // Try single-input first (most common for Okta email factor).
    const single = inputs.find((i) => (i.type === 'text' || i.type === 'tel' || i.type === 'number') && (i.maxLength === c.length || /code|otp|token/i.test((i.name || '') + ' ' + (i.id || '') + ' ' + (i.placeholder || '') + ' ' + (i.getAttribute('aria-label') || ''))));
    if (single) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(single, c);
      single.dispatchEvent(new Event('input', { bubbles: true }));
      single.dispatchEvent(new Event('change', { bubbles: true }));
      return { mode: 'single', el: single.id || single.name || null };
    }
    // Try digit-per-input.
    const digitInputs = inputs.filter((i) => i.maxLength === 1 && (i.type === 'text' || i.type === 'tel' || i.type === 'number'));
    if (digitInputs.length >= c.length) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      for (let i = 0; i < c.length; i++) {
        setter.call(digitInputs[i], c[i]);
        digitInputs[i].dispatchEvent(new Event('input', { bubbles: true }));
        digitInputs[i].dispatchEvent(new Event('change', { bubbles: true }));
      }
      return { mode: 'digits', count: digitInputs.length };
    }
    return { mode: 'none' };
  }, code);
  console.log(`[mfa] code-fill mode: ${JSON.stringify(filled)}`);
  if (filled.mode === 'none') {
    await dump(page, 'no-input');
    console.error(`[mfa] could not find code input field`);
    outcome = 'no-input-field';
    throw new Error('no MFA input');
  }

  // 4. Submit. Try clicking a Verify/Continue button, fall back to Enter.
  const verifyBtn = page.getByRole('button', { name: /verify|continue|submit|sign in|sign-in/i }).first();
  await verifyBtn.click({ timeout: 5000 }).catch(async () => {
    await page.keyboard.press('Enter');
  });
  console.log(`[mfa] submitted code`);

  // 5. Wait for the inbox.
  try {
    await page.waitForFunction(() => /communication|inbox|dashboard|home/i.test(location.href), null, { timeout: 45000 });
    console.log(`[mfa] success — landed on ${page.url()}`);
    outcome = 'success';
  } catch {
    const finalUrl = page.url();
    const bodyText = await page.evaluate(() => (document.body?.innerText || '').slice(0, 600));
    await dump(page, 'post-code');
    console.error(`[mfa] did not reach inbox. url=${finalUrl} body-text=${JSON.stringify(bodyText)}`);
    outcome = /invalid|incorrect|expired/i.test(bodyText) ? 'code-rejected' : 'unknown-post-code';
  }
} catch (e) {
  console.error(`[mfa] error: ${e?.message || e}`);
  if (outcome === 'unknown') outcome = 'error';
} finally {
  await ctx.close();
  // Cleanup the code file so a stale one doesn't get reused next run.
  if (existsSync(CODE_FILE)) try { unlinkSync(CODE_FILE); } catch {}
  console.log(`[mfa] outcome=${outcome}`);
  process.exit(outcome === 'success' || outcome === 'already-authed' ? 0 : 2);
}
