// One-shot non-interactive auth into Guesty using env credentials.
// Tries the email-then-password flow on app.guesty.com/auth/login.
// If Guesty redirects to Google SSO after Continue, bails — that flow
// requires the user's hands.
//
// Env:
//   GUESTY_WEB_EMAIL     — email (from fad-backend .env on prod, but
//                          fall back to friday-gms .env)
//   GUESTY_WEB_PASSWORD  — password
//
// Usage:
//   GUESTY_WEB_EMAIL=… GUESTY_WEB_PASSWORD=… node auto-auth.mjs

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
if (!EMAIL || !PASSWORD) {
  console.error('Missing GUESTY_WEB_EMAIL / GUESTY_WEB_PASSWORD env');
  process.exit(1);
}

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: true,
  viewport: { width: 1400, height: 900 },
});
const page = await ctx.newPage();

async function dump(label) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const shot = resolve(DEBUG, `auto-auth-${label}-${stamp}.png`);
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  return shot;
}

let outcome = 'unknown';
try {
  await page.goto('https://app.guesty.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  // Already authed?
  if (!/auth\/login|signin|okta/i.test(page.url())) {
    console.log(`[auto-auth] already authed — landed on ${page.url()}`);
    outcome = 'already-authed';
  } else {
    console.log(`[auto-auth] login page: ${page.url()}`);
    // Step 1: enter email.
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.fill(EMAIL);
    console.log(`[auto-auth] filled email`);

    // Click Continue (or whatever the submit on this stage is).
    const continueBtn = page.getByRole('button', { name: /continue|next/i }).first();
    await continueBtn.click();
    console.log(`[auto-auth] clicked continue`);

    // Wait for either a password field, an SSO redirect, or the inbox.
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const afterContinueUrl = page.url();
    console.log(`[auto-auth] after continue, url=${afterContinueUrl}`);
    const ssAfter = await dump('after-continue');
    console.log(`[auto-auth] screenshot: ${ssAfter}`);

    if (/google\.com|accounts\.google/i.test(afterContinueUrl)) {
      console.error(`[auto-auth] redirected to Google SSO — abort. URL=${afterContinueUrl}`);
      outcome = 'sso-required';
    } else {
      // Try to fill password.
      const pwInput = page.locator('input[type="password"], input[name="password"], #okta-signin-password').first();
      try {
        await pwInput.waitFor({ state: 'visible', timeout: 8000 });
      } catch {
        // No password field — maybe Guesty needs another step, or sso landed somewhere strange.
        console.error(`[auto-auth] no password field appeared`);
        outcome = 'no-password-field';
        throw new Error('no password field');
      }
      await pwInput.fill(PASSWORD);
      console.log(`[auto-auth] filled password`);

      // Submit. The page may have a generic Continue/Sign-in button.
      const submitBtn = page.locator('#okta-signin-submit, button[type="submit"]').first();
      await submitBtn.click({ timeout: 5000 }).catch(async () => {
        // Fallback: press Enter on the password field.
        await pwInput.press('Enter');
      });
      console.log(`[auto-auth] submitted password`);

      // Wait for navigation away from login.
      try {
        await page.waitForFunction(() => !/auth\/login|signin/.test(location.href), null, { timeout: 30000 });
      } catch {
        // still on login — likely wrong creds or MFA.
      }

      const finalUrl = page.url();
      console.log(`[auto-auth] final url=${finalUrl}`);
      const ssFinal = await dump('final');
      console.log(`[auto-auth] screenshot: ${ssFinal}`);

      if (/auth\/login|signin|okta/i.test(finalUrl)) {
        // Look for error messages.
        const errText = await page.evaluate(() => (document.body?.innerText || '').slice(0, 500));
        console.error(`[auto-auth] still on login. body-text head: ${JSON.stringify(errText)}`);
        outcome = 'login-failed';
      } else if (/communication|inbox|dashboard|home/i.test(finalUrl)) {
        console.log(`[auto-auth] success — landed on ${finalUrl}`);
        outcome = 'success';
      } else {
        // MFA / device verification / something else.
        const bodyText = await page.evaluate(() => (document.body?.innerText || '').slice(0, 500));
        console.error(`[auto-auth] unknown post-login state. URL=${finalUrl} body-text=${JSON.stringify(bodyText)}`);
        outcome = 'unknown-post-login';
      }
    }
  }
} catch (e) {
  console.error(`[auto-auth] error: ${e?.message || e}`);
  if (outcome === 'unknown') outcome = 'error';
} finally {
  await ctx.close();
  console.log(`[auto-auth] outcome=${outcome}`);
  process.exit(outcome === 'success' || outcome === 'already-authed' ? 0 : 2);
}
