#!/usr/bin/env node
// Layer-3 fallback for Guesty Listings (a.k.a. Properties).
//
// Pattern mirrors scrape-reservations.mjs. The /properties page in
// the new Guesty UI is the same react-virtualized + .cell-row table
// design, so the same datakey-attributed extraction works — the
// datakeys are different (nickname / address / status / base price
// instead of confirmationCode / checkIn / etc).
//
// SCAFFOLD STATUS (2026-05-17): the actual datakey values used by
// /properties aren't probed yet — when I tried Guesty invalidated the
// session. The scaffold below uses best-guess datakeys; next session
// runs `node scrape-listings.mjs --probe` after fresh `npm run auth`
// and either confirms the selectors or updates them.
//
// USAGE
//   npm run scrape:listings              — fetch + post
//   npm run scrape:listings -- --dry-run
//   npm run scrape:listings -- --probe   — dump HTML + screenshot, no extract

import { chromium } from 'playwright';
import { createHmac } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FAD_LISTINGS_INGEST_URL = process.env.FAD_LISTINGS_INGEST_URL
  || 'https://admin.friday.mu/api/integrations/guesty/scraped-listings';
const FAD_WEBHOOK_SECRET = process.env.FAD_WEBHOOK_SECRET
  || 'fr1day_wh_2026_s3cure';
const GUESTY_LISTINGS_URL = process.env.GUESTY_LISTINGS_URL
  || 'https://app.guesty.com/properties';
const PROFILE_DIR = process.env.GUESTY_PROFILE_DIR
  || resolve(__dirname, '.profile');
const DEBUG_DIR = resolve(__dirname, '.debug');
const MAX_LISTINGS = Number(process.env.MAX_LISTINGS || 300);
const HEADFUL = process.env.HEADFUL === '1';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const PROBE_ONLY = args.has('--probe');

if (!existsSync(PROFILE_DIR)) {
  console.error(`[listings-scrape] No saved session at ${PROFILE_DIR}. Run: npm run auth`);
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
  const shot = resolve(DEBUG_DIR, `listings-${label}-${stamp}.png`);
  const html = resolve(DEBUG_DIR, `listings-${label}-${stamp}.html`);
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  try { writeFileSync(html, await page.content()); } catch {}
  return { shot, html };
}

function signPayload(rawBody) {
  return createHmac('sha256', FAD_WEBHOOK_SECRET).update(rawBody).digest('hex');
}

async function postListing(record) {
  if (DRY_RUN) {
    console.log(`[listings-scrape] [dry-run] ${record.nickname || '?'} @ ${record.city || '?'} — ${record.basePrice || '—'}`);
    return { ok: true, dryRun: true };
  }
  const event = {
    source: 'guesty-scraper-l3',
    scrapedAt: new Date().toISOString(),
    listing: record,
  };
  const raw = JSON.stringify(event);
  const sig = signPayload(raw);
  const res = await fetch(FAD_LISTINGS_INGEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-guesty-signature': sig },
    body: raw,
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    console.warn(`[listings-scrape] POST ${record.nickname} → HTTP ${res.status} ${text.slice(0, 120)}`);
    return { ok: false, status: res.status };
  }
  return { ok: true };
}

// Best-guess datakey mapping for /properties. CONFIRM in --probe mode
// next session and adjust if Guesty uses different names. Reservations
// uses: confirmationCode, checkIn, checkOut, listing. Expected here:
// nickname, title, address, status, bedrooms, bathrooms, basePrice, etc.
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
        // Capture every datakey we see so the probe can identify
        // unknown ones — strip empties, cap at 20 for readability.
        const allCells = {};
        for (const el of r.querySelectorAll('[datakey]')) {
          const key = el.getAttribute('datakey');
          if (!key) continue;
          const txt = (el.textContent || '').trim();
          if (txt) allCells[key] = txt.slice(0, 120);
        }
        return {
          rowIndex: idx,
          // Best-guess fields. Update after --probe.
          nickname: cell('nickname') || cell('title') || cell('listingNickname'),
          title: cell('title') || cell('listingTitle') || cell('name'),
          address: cell('address') || cell('addressFull'),
          city: cell('city') || cell('addressCity'),
          status: cell('status') || cell('listingStatus'),
          bedrooms: cell('bedrooms') || cell('numBedrooms'),
          bathrooms: cell('bathrooms') || cell('numBathrooms'),
          basePrice: cell('basePrice') || cell('price') || cell('baseRate'),
          currency: cell('currency') || cell('currencyCode'),
          allCells,
        };
      }).filter((r) => r.nickname || r.title || Object.keys(r.allCells).length > 0),
    };
  });
}

let exitCode = 0;
try {
  console.log(`[listings-scrape] target=${FAD_LISTINGS_INGEST_URL} dryRun=${DRY_RUN} probe=${PROBE_ONLY}`);
  console.log(`[listings-scrape] navigating to ${GUESTY_LISTINGS_URL}…`);
  await page.goto(GUESTY_LISTINGS_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await page.waitForSelector('[data-qa="text-cell"]', { timeout: 25_000 }).catch(() => {});
  await page.waitForTimeout(2500);

  if (page.url().includes('login') || page.url().includes('signin')) {
    console.error(`[listings-scrape] Session expired. Run: npm run auth`);
    exitCode = 1;
  } else {
    const d = await dump('initial');
    console.log(`[listings-scrape] landed: ${page.url()}`);
    console.log(`[listings-scrape] saved screenshot: ${d.shot}`);
    console.log(`[listings-scrape] saved html: ${d.html}`);

    if (PROBE_ONLY) {
      const diag = await page.evaluate(() => ({
        title: document.title,
        bodyTextHead: (document.body?.innerText || '').slice(0, 800),
        cellRowCount: document.querySelectorAll('.cell-row').length,
        textCellCount: document.querySelectorAll('[data-qa="text-cell"]').length,
        datakeys: [...new Set(Array.from(document.querySelectorAll('[datakey]')).map((n) => n.getAttribute('datakey')))],
      }));
      console.log(`[listings-scrape] page title: ${diag.title}`);
      console.log(`[listings-scrape] body-text head: ${JSON.stringify(diag.bodyTextHead)}`);
      console.log(`[listings-scrape] cell-rows: ${diag.cellRowCount}, text-cells: ${diag.textCellCount}`);
      console.log(`[listings-scrape] datakeys: ${JSON.stringify(diag.datakeys)}`);
    } else {
      const { selector, rows } = await extractRows();
      if (rows.length === 0) {
        console.warn(`[listings-scrape] no rows extracted. UI structure may have changed; re-run with --probe and inspect ${d.html}`);
        exitCode = 2;
      } else {
        console.log(`[listings-scrape] selector='${selector}' rows=${rows.length}`);
        let posted = 0, skipped = 0;
        const toProcess = rows.slice(0, MAX_LISTINGS);
        for (const r of toProcess) {
          if (!r.nickname && !r.title) {
            skipped++;
            continue;
          }
          const result = await postListing({
            nickname: r.nickname,
            title: r.title,
            address: r.address,
            city: r.city,
            status: r.status,
            bedrooms: r.bedrooms ? Number(r.bedrooms) : null,
            bathrooms: r.bathrooms ? Number(r.bathrooms) : null,
            basePrice: r.basePrice,
            currency: r.currency,
            allCells: r.allCells,
          });
          if (result.ok) posted++;
          else skipped++;
        }
        console.log(`[listings-scrape] done. posted=${posted} skipped=${skipped}`);
      }
    }
  }
} catch (e) {
  console.error(`[listings-scrape] error: ${e.stack || e.message}`);
  exitCode = 2;
} finally {
  await ctx.close();
  process.exit(exitCode);
}
