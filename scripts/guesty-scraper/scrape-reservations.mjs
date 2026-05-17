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

// Selectors — calibrated against Guesty's /reservations table
// (probed 2026-05-17). Each data row is a `.cell-row` container with
// `[data-qa="text-cell"]` children. Each cell carries a `datakey`
// attribute identifying the field (confirmationCode / checkIn /
// checkOut / listing). The guest cell has no datakey but a unique
// `person-cell` class.
const SELECTORS = {
  rowContainer: '.cell-row',
  cellByDatakey: (key) => `[datakey="${key}"]`,
  personCell: '.person-cell',
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
    console.log(`[res-scrape] [dry-run] ${record.confirmationCode} — ${record.guestName} @ ${record.listingNickname} ${record.checkInDate}→${record.checkOutDate}`);
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
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.cell-row'));
    return {
      selector: '.cell-row',
      rows: rows.slice(0, 500).map((r, idx) => {
        const cell = (key) => {
          const el = r.querySelector(`[datakey="${key}"]`);
          return (el?.textContent || '').trim() || null;
        };
        const personText = (r.querySelector('.person-cell')?.textContent || '').trim() || null;
        // Listing cell is e.g. "RC-14 / Modern Sea View Apt with Pool ...";
        // split into nickname (before " / ") and title.
        const listingRaw = cell('listing');
        let listingNickname = null, listingTitle = null;
        if (listingRaw) {
          const parts = listingRaw.split(' / ');
          listingNickname = parts[0]?.trim() || null;
          listingTitle = parts.slice(1).join(' / ').trim() || null;
        }
        return {
          rowIndex: idx,
          confirmationCode: cell('confirmationCode'),
          checkInRaw: cell('checkIn'),
          checkOutRaw: cell('checkOut'),
          listingNickname,
          listingTitle,
          listingRaw,
          guestName: personText,
        };
      }).filter((r) => r.confirmationCode || r.guestName),
    };
  });
}

// Parse Guesty's check-in/out cell text into ISO. Format observed:
//   "Mar 20, 2026 9:00 PM"  → "2026-03-20T21:00:00"
//   "May 31, 2026 10:00 AM" → "2026-05-31T10:00:00"
// Returns the ISO date only (no TZ) — backend converts to date col.
function parseGuestyDateTime(text) {
  if (!text) return { date: null, time: null };
  try {
    const m = text.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})\s+(AM|PM))?$/);
    if (!m) return { date: null, time: null, raw: text };
    const months = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
    const mm = months[m[1].slice(0, 3)];
    if (!mm) return { date: null, time: null, raw: text };
    const dd = String(m[2]).padStart(2, '0');
    const yyyy = m[3];
    const date = `${yyyy}-${String(mm).padStart(2, '0')}-${dd}`;
    let time = null;
    if (m[4]) {
      let hh = parseInt(m[4], 10);
      if (m[6] === 'PM' && hh < 12) hh += 12;
      if (m[6] === 'AM' && hh === 12) hh = 0;
      time = `${String(hh).padStart(2, '0')}:${m[5]}`;
    }
    return { date, time, raw: text };
  } catch {
    return { date: null, time: null, raw: text };
  }
}

let exitCode = 0;
try {
  console.log(`[res-scrape] target=${FAD_RES_INGEST_URL} dryRun=${DRY_RUN} probe=${PROBE_ONLY}`);
  console.log(`[res-scrape] navigating to ${GUESTY_RES_URL}…`);
  await page.goto(GUESTY_RES_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  // The reservations table is data-heavy and renders rows AFTER
  // networkidle. Wait for cells to appear, plus a brief settle.
  await page.waitForSelector('[data-qa="text-cell"]', { timeout: 25_000 }).catch(() => {});
  await page.waitForTimeout(2500);

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
          if (!r.confirmationCode && !r.guestName) {
            skipped++;
            continue;
          }
          const checkIn = parseGuestyDateTime(r.checkInRaw);
          const checkOut = parseGuestyDateTime(r.checkOutRaw);
          const record = {
            confirmationCode: r.confirmationCode,
            guestName: r.guestName,
            listingNickname: r.listingNickname,
            listingTitle: r.listingTitle,
            checkInDate: checkIn.date,
            checkInTime: checkIn.time,
            checkOutDate: checkOut.date,
            checkOutTime: checkOut.time,
            rawCheckIn: r.checkInRaw,
            rawCheckOut: r.checkOutRaw,
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
