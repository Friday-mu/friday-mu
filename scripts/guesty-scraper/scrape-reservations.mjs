#!/usr/bin/env node
// Layer-3 fallback for Guesty Reservations + Source-of-Truth verifier.
//
// Reuses the same persisted Chromium profile as scrape.mjs (messages).
// First run: navigates to /reservations and dumps screenshot + HTML to
// .debug/ for selector discovery. Subsequent runs extract reservation
// rows and POST them to fad-backend's scraped-reservations endpoint,
// which upserts into guesty_reservations_cache (source='scraper').
//
// Why this exists:
//   1. Resilience — when the Guesty Open API is rate-limited (5 OAuth
//      mints / 24h) the poller can't refresh reservations. The website
//      then can't show accurate availability/prices. This scraper is
//      the backstop that keeps the cache fresh regardless.
//   2. Verification — running this alongside the API path lets us
//      diff scraped truth vs API truth and surface drift (debug mode).
//
// USAGE
//   npm run scrape:reservations        — fetch + post
//   npm run scrape:reservations -- --dry-run  — fetch + log, no post
//   npm run scrape:reservations -- --probe    — dump HTML + screenshot,
//                                                  no extraction
//   HEADFUL=1 npm run scrape:reservations
//
// EXIT CODES
//   0 — completed
//   1 — setup / auth error (re-run `npm run auth`)
//   2 — UI structure unrecognized (selectors need updating)

import { chromium } from 'playwright';
import { createHmac } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FAD_RES_INGEST_URL = process.env.FAD_RES_INGEST_URL
  || 'https://admin.friday.mu/api/integrations/guesty/scraped-reservations';
const FAD_WEBHOOK_SECRET = process.env.FAD_WEBHOOK_SECRET
  || 'fr1day_wh_2026_s3cure';
const GUESTY_RES_URL = process.env.GUESTY_RES_URL
  || 'https://app.guesty.com/reservations';
const PROFILE_DIR = process.env.GUESTY_PROFILE_DIR
  || resolve(__dirname, '.profile');
const DEBUG_DIR = resolve(__dirname, '.debug');
const MAX_RESERVATIONS = Number(process.env.MAX_RESERVATIONS || 200);
const HEADFUL = process.env.HEADFUL === '1';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const PROBE_ONLY = args.has('--probe');

// Selectors — best-guess; refined after first probe run.
//
// Guesty's reservations page is likely a table view. Common patterns
// to try: data-qa="reservation-row" / role="row" inside the table
// container. Probe mode dumps the DOM so we can verify.
const SELECTORS = {
  rowContainer: '[data-qa*="reservation"], [data-testid*="reservation-row"], .reservations-table tbody tr, [role="grid"] [role="row"]',
  confCode:     '[data-qa*="confirmation"], td[class*="confirm"]',
  guestName:    '[data-qa*="guest-name"], [data-qa*="person-name"], td[class*="guest"]',
  property:     '[data-qa*="listing"], [data-qa*="property"], td[class*="listing"]',
  status:       '[data-qa*="status"], td[class*="status"]',
  channel:      '[data-qa*="channel"], [data-qa*="source"], td[class*="channel"]',
  checkIn:      '[data-qa*="check-in"], [data-qa*="checkin"], td[class*="check"]',
  checkOut:     '[data-qa*="check-out"], [data-qa*="checkout"]',
};

if (!existsSync(PROFILE_DIR)) {
  console.error(`[res-scrape] No saved session at ${PROFILE_DIR}. Run: npm run auth`);
  process.exit(1);
}
mkdirSync(DEBUG_DIR, { recursive: true });

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: !HEADFUL,
  viewport: { width: 1600, height: 1000 },
});
const page = await ctx.newPage();

async function dump(label) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const shot = resolve(DEBUG_DIR, `res-${label}-${stamp}.png`);
  const html = resolve(DEBUG_DIR, `res-${label}-${stamp}.html`);
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  try { writeFileSync(html, await page.content()); } catch {}
  return { shot, html, stamp };
}

function signPayload(rawBody) {
  return createHmac('sha256', FAD_WEBHOOK_SECRET).update(rawBody).digest('hex');
}

async function postReservation(record) {
  if (DRY_RUN) {
    console.log(`[res-scrape] [dry-run] ${record.confirmationCode || record.guestyId} — ${record.guestName} ${record.checkIn}→${record.checkOut}`);
    return { ok: true, dryRun: true };
  }
  const event = {
    source: 'guesty-scraper-l3',
    scrapedAt: new Date().toISOString(),
    reservation: record,
  };
  const raw = JSON.stringify(event);
  const sig = signPayload(raw);
  const res = await fetch(FAD_RES_INGEST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-guesty-signature': sig,
    },
    body: raw,
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    console.warn(`[res-scrape] POST ${record.confirmationCode || record.guestyId} → HTTP ${res.status} ${text.slice(0, 120)}`);
    return { ok: false, status: res.status };
  }
  return { ok: true };
}

async function extractRows() {
  return page.evaluate((sel) => {
    // Try each candidate selector; pick the one with the most matches.
    const splits = sel.rowContainer.split(',').map((s) => s.trim());
    let best = { sel: null, rows: [] };
    for (const s of splits) {
      try {
        const found = Array.from(document.querySelectorAll(s));
        if (found.length > best.rows.length) best = { sel: s, rows: found };
      } catch {}
    }
    if (best.rows.length === 0) return { selector: null, rows: [] };

    const rows = best.rows.slice(0, 500).map((r, idx) => {
      const text = (q) => {
        for (const candidate of q.split(',').map((s) => s.trim())) {
          try {
            const el = r.querySelector(candidate);
            if (el) {
              const t = (el.textContent || '').trim();
              if (t) return t;
            }
          } catch {}
        }
        return null;
      };
      const allCellText = Array.from(r.querySelectorAll('td, [role="cell"], [role="gridcell"]')).map((c) => (c.textContent || '').trim());
      return {
        rowIndex: idx,
        confCode: text(sel.confCode),
        guestName: text(sel.guestName),
        property: text(sel.property),
        status: text(sel.status),
        channel: text(sel.channel),
        checkIn: text(sel.checkIn),
        checkOut: text(sel.checkOut),
        // Raw cells in column order — useful fallback when selectors don't match.
        cells: allCellText.slice(0, 12),
      };
    });
    return { selector: best.sel, rows };
  }, SELECTORS);
}

let exitCode = 0;
try {
  console.log(`[res-scrape] target=${FAD_RES_INGEST_URL} dryRun=${DRY_RUN} probe=${PROBE_ONLY}`);
  console.log(`[res-scrape] navigating to ${GUESTY_RES_URL}…`);
  await page.goto(GUESTY_RES_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

  if (page.url().includes('login') || page.url().includes('signin')) {
    console.error(`[res-scrape] Session expired. Run: npm run auth`);
    exitCode = 1;
  } else {
    const dumpInfo = await dump('initial');
    console.log(`[res-scrape] landed: ${page.url()}`);
    console.log(`[res-scrape] saved screenshot: ${dumpInfo.shot}`);
    console.log(`[res-scrape] saved html: ${dumpInfo.html}`);

    if (PROBE_ONLY) {
      const diag = await page.evaluate(() => ({
        title: document.title,
        bodyTextHead: (document.body?.innerText || '').slice(0, 800),
        anyDataQa: Array.from(document.querySelectorAll('[data-qa]')).slice(0, 30).map((n) => n.getAttribute('data-qa')),
        anyDataTestid: Array.from(document.querySelectorAll('[data-testid]')).slice(0, 30).map((n) => n.getAttribute('data-testid')),
        anyTables: document.querySelectorAll('table').length,
        anyGrids: document.querySelectorAll('[role="grid"]').length,
        anyRows: document.querySelectorAll('[role="row"]').length,
      }));
      console.log(`[res-scrape] page title: ${diag.title}`);
      console.log(`[res-scrape] body-text head: ${JSON.stringify(diag.bodyTextHead)}`);
      console.log(`[res-scrape] data-qa values: ${JSON.stringify([...new Set(diag.anyDataQa)])}`);
      console.log(`[res-scrape] data-testid values: ${JSON.stringify([...new Set(diag.anyDataTestid)])}`);
      console.log(`[res-scrape] tables=${diag.anyTables} grids=${diag.anyGrids} role=row count=${diag.anyRows}`);
    } else {
      const { selector, rows } = await extractRows();
      if (rows.length === 0) {
        console.warn(`[res-scrape] no rows extracted. UI structure may have changed; re-run with --probe and inspect ${dumpInfo.html}`);
        exitCode = 2;
      } else {
        console.log(`[res-scrape] selector='${selector}' rows=${rows.length}`);
        let posted = 0, skipped = 0;
        const toProcess = rows.slice(0, MAX_RESERVATIONS);
        for (const r of toProcess) {
          if (!r.confCode && !r.guestName) {
            skipped++;
            continue;
          }
          const record = {
            confirmationCode: r.confCode || null,
            guestName: r.guestName || (r.cells?.[0] ?? null),
            propertyName: r.property || null,
            status: r.status || null,
            channel: r.channel || null,
            checkIn: r.checkIn || null,
            checkOut: r.checkOut || null,
            rawCells: r.cells,
          };
          const result = await postReservation(record);
          if (result.ok) posted++;
          else skipped++;
        }
        console.log(`[res-scrape] done. posted=${posted} skipped=${skipped}`);
      }
    }
  }
} catch (e) {
  console.error(`[res-scrape] error: ${e.stack || e.message}`);
  exitCode = 2;
} finally {
  await ctx.close();
  process.exit(exitCode);
}
