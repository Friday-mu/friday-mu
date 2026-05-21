#!/usr/bin/env node
// Orchestrator for the three Layer-3 scrapers. Opens Chromium ONCE,
// reuses the persisted .profile session, walks each surface in
// sequence, posts records to fad-backend. Designed for launchd at a
// 15-minute cadence.
//
// Why one browser, not three subprocess invocations: launching
// Chromium is the slow part (~6s + module load). Three separate spawns
// = ~25s of pure launch cost. One session = ~6s, and we reuse warmed
// modules / cookies / fonts.
//
// USAGE
//   npm run scrape:all
//   HEADFUL=1 npm run scrape:all     — debug
//   SKIP_LISTINGS=1 npm run scrape:all  — skip listings scrape
//   SKIP_MESSAGES=1 npm run scrape:all
//   SKIP_RESERVATIONS=1 npm run scrape:all
//
// EXIT CODES
//   0 — all three completed (or were skipped)
//   1 — auth missing/expired (run npm run auth)
//   2 — one or more surfaces failed (partial success still possible)

import { chromium } from 'playwright';
import { createHmac } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = resolve(__dirname, '.profile');
const STATE_FILE = resolve(__dirname, '.state.json');
const DEBUG_DIR = resolve(__dirname, '.debug');
const HEADFUL = process.env.HEADFUL === '1';
const FAD_WEBHOOK_SECRET = process.env.FAD_WEBHOOK_SECRET || 'fr1day_wh_2026_s3cure';

const SKIP_MESSAGES = process.env.SKIP_MESSAGES === '1';
const SKIP_RESERVATIONS = process.env.SKIP_RESERVATIONS === '1';
const SKIP_LISTINGS = process.env.SKIP_LISTINGS === '1';

if (!existsSync(PROFILE_DIR)) {
  console.error(`[scrape-all] No saved session at ${PROFILE_DIR}. Run: npm run auth`);
  process.exit(1);
}
mkdirSync(DEBUG_DIR, { recursive: true });

function loadState() {
  if (!existsSync(STATE_FILE)) return { conversations: {} };
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf-8')); } catch { return { conversations: {} }; }
}
function saveState(s) { writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

function sign(rawBody) {
  return createHmac('sha256', FAD_WEBHOOK_SECRET).update(rawBody).digest('hex');
}
async function postJson(url, payload) {
  const raw = JSON.stringify(payload);
  const sig = sign(raw);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-guesty-signature': sig },
    body: raw,
  });
  return res.ok;
}

// ─── Session boot ────────────────────────────────────────────────────

console.log(`[scrape-all] starting at ${new Date().toISOString()} (headful=${HEADFUL})`);
const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: !HEADFUL,
  viewport: { width: 1600, height: 1000 },
});
const page = await ctx.newPage();

async function ensureAuthed() {
  await page.goto('https://app.guesty.com', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  if (/auth\/login|signin/i.test(page.url())) {
    return false;
  }
  return true;
}

const ok = await ensureAuthed();
if (!ok) {
  console.error('[scrape-all] session expired — run `npm run auth` and retry');
  await ctx.close();
  process.exit(1);
}
console.log(`[scrape-all] authed — proceeding`);

// ─── Surface 1: messages ─────────────────────────────────────────────
//
// Pulled into this file inline rather than spawning scrape.mjs as a
// subprocess — same reasoning as the unified-orchestrator argument.
// Code intentionally mirrors scrape.mjs:runScrape line-for-line so the
// two can be kept in sync; if scrape.mjs's selectors get updated, copy
// the corresponding block here.

const FAD_MSG_URL = 'https://admin.friday.mu/api/integrations/guesty/webhook';

async function postMessage({ guestyConversationId, guestyMessageId, direction, body, senderName, createdAt, channel, guestName }) {
  const eventName = direction === 'outbound' ? 'reservation.messageSent' : 'reservation.messageReceived';
  const messageType = direction === 'outbound' ? 'fromHost' : 'fromGuest';
  const event = {
    event: eventName, source: 'guesty-scraper-l3', reservationId: null,
    message: { postId: guestyMessageId, id: guestyMessageId, type: messageType, body, from: senderName, module: channel, createdAt, sentAt: createdAt },
    conversation: { _id: guestyConversationId, id: guestyConversationId, meta: { guestName }, integration: { platform: channel } },
  };
  const raw = JSON.stringify(event);
  const sig = sign(raw);
  const res = await fetch(FAD_MSG_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-guesty-signature': sig },
    body: raw,
  });
  return res.ok;
}

function deriveMsgId(convId, msg, idx) {
  if (msg.localId) return `g-scrape-${msg.localId}`;
  const seed = `${convId}:${msg.ts || ''}:${idx}:${(msg.body || '').slice(0, 80)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `g-scrape-${(h >>> 0).toString(16)}-${(msg.body || '').slice(0, 8).replace(/[^a-z0-9]/gi, '')}`;
}

async function scrapeMessages(state) {
  console.log(`[scrape-all/messages] starting…`);
  await page.goto('https://app.guesty.com/inbox-v2', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await page.waitForSelector('.conversation-section .row-wrapper', { timeout: 15_000 }).catch(() => {});

  const rows = page.locator('.conversation-section .row-wrapper');
  const rowCount = await rows.count();
  console.log(`[scrape-all/messages] found ${rowCount} conversation rows`);

  const seen = new Set();
  let posted = 0;
  for (let i = 0; i < Math.min(rowCount, 100); i++) {
    const r = page.locator('.conversation-section .row-wrapper').nth(i);
    const name = await r.locator('[data-qa="person-name"]').textContent().catch(() => null);
    const urlBefore = page.url();
    try { await r.click({ timeout: 5_000 }); } catch { continue; }
    try {
      await page.waitForFunction(
        (before) => location.href !== before && /\/inbox-v2\/[a-f0-9]{18,32}/.test(location.href),
        urlBefore, { timeout: 8_000 },
      );
    } catch { continue; }
    const convId = page.url().match(/\/inbox-v2\/([a-f0-9]{18,32})/)?.[1];
    if (!convId || seen.has(convId)) continue;
    seen.add(convId);

    await page.waitForSelector('[data-testid="message-content"]', { timeout: 8_000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});

    const msgs = await page.evaluate(() => {
      const nodes = document.querySelectorAll('[data-testid="message-content"]');
      // Real Guesty class names (confirmed from prod HTML 2026-05-17):
      // messageBodyWrapperGuest = inbound, messageBodyWrapperUs = outbound.
      const inboundRe = /messageBodyWrapperGuest/i;
      const outboundRe = /messageBodyWrapperUs(?:\b|-)/i;
      return Array.from(nodes).map((node) => {
        let direction = 'inbound', cur = node;
        for (let d = 0; d < 8 && cur; d++) {
          const cls = cur.className?.toString?.() || '';
          if (outboundRe.test(cls)) { direction = 'outbound'; break; }
          if (inboundRe.test(cls)) { direction = 'inbound'; break; }
          cur = cur.parentElement;
        }
        const body = node.textContent?.trim() || '';
        let tEl = null, probe = node;
        for (let d = 0; d < 6 && probe && !tEl; d++) { tEl = probe.querySelector('time'); probe = probe.parentElement; }
        const ts = tEl?.getAttribute('datetime') || tEl?.getAttribute('title') || tEl?.textContent?.trim() || null;
        return { direction, body, ts };
      }).filter((m) => m.body);
    });

    const cursor = state.conversations[convId] || '1970-01-01T00:00:00Z';
    const newMsgs = msgs.filter((m) => !m.ts || new Date(m.ts).toISOString() > cursor);

    for (let j = 0; j < newMsgs.length; j++) {
      const m = newMsgs[j];
      const ok = await postMessage({
        guestyConversationId: convId,
        guestyMessageId: deriveMsgId(convId, m, j),
        direction: m.direction || 'inbound',
        body: m.body,
        senderName: m.direction === 'outbound' ? 'Friday' : (name || 'Guest'),
        createdAt: m.ts ? new Date(m.ts).toISOString() : new Date().toISOString(),
        channel: null, guestName: name,
      });
      if (ok) posted++;
    }
    const latestTs = msgs.map((m) => m.ts && new Date(m.ts).getTime()).filter(Boolean).sort((a, b) => b - a)[0];
    if (latestTs) state.conversations[convId] = new Date(latestTs).toISOString();
  }
  console.log(`[scrape-all/messages] done. posted=${posted}`);
}

// ─── Surface 2: reservations ─────────────────────────────────────────
//
// Mirrors scrape-reservations.mjs:extractRows.

async function scrapeReservations() {
  console.log(`[scrape-all/reservations] starting…`);
  await page.goto('https://app.guesty.com/reservations', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await page.waitForSelector('[data-qa="text-cell"]', { timeout: 25_000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const { rows } = await page.evaluate(() => {
    const rs = Array.from(document.querySelectorAll('.cell-row'));
    return {
      rows: rs.slice(0, 500).map((r) => {
        const cell = (k) => (r.querySelector(`[datakey="${k}"]`)?.textContent || '').trim() || null;
        const listingRaw = cell('listing');
        let listingNickname = null, listingTitle = null;
        if (listingRaw) {
          const parts = listingRaw.split(' / ');
          listingNickname = parts[0]?.trim() || null;
          listingTitle = parts.slice(1).join(' / ').trim() || null;
        }
        return {
          confirmationCode: cell('confirmationCode'),
          checkInRaw: cell('checkIn'), checkOutRaw: cell('checkOut'),
          listingNickname, listingTitle, listingRaw,
          // Guest cell: person-cell class WITHOUT a datakey attr — the
          // listing column has datakey="listing" + sometimes person-cell
          // too, so a bare `.person-cell` lands on the listing instead
          // of the guest.
          guestName: (r.querySelector('[data-qa="text-cell"]:not([datakey]).person-cell')?.textContent || '').trim() || null,
        };
      }).filter((x) => x.confirmationCode || x.guestName),
    };
  });

  // Same parseGuestyDateTime as scrape-reservations.mjs
  const parse = (text) => {
    if (!text) return { date: null, time: null };
    const m = text.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})\s+(AM|PM))?$/);
    if (!m) return { date: null, time: null };
    const months = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
    const mm = months[m[1].slice(0, 3)];
    if (!mm) return { date: null, time: null };
    const date = `${m[3]}-${String(mm).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
    let time = null;
    if (m[4]) {
      let hh = parseInt(m[4], 10);
      if (m[6] === 'PM' && hh < 12) hh += 12;
      if (m[6] === 'AM' && hh === 12) hh = 0;
      time = `${String(hh).padStart(2, '0')}:${m[5]}`;
    }
    return { date, time };
  };

  let posted = 0;
  for (const r of rows) {
    if (!r.confirmationCode) continue;
    const ci = parse(r.checkInRaw);
    const co = parse(r.checkOutRaw);
    const ok = await postJson('https://admin.friday.mu/api/integrations/guesty/scraped-reservations', {
      source: 'guesty-scraper-l3',
      scrapedAt: new Date().toISOString(),
      reservation: {
        confirmationCode: r.confirmationCode,
        guestName: r.guestName,
        listingNickname: r.listingNickname,
        listingTitle: r.listingTitle,
        checkInDate: ci.date, checkInTime: ci.time,
        checkOutDate: co.date, checkOutTime: co.time,
      },
    });
    if (ok) posted++;
  }
  console.log(`[scrape-all/reservations] done. posted=${posted}/${rows.length}`);
}

// ─── Surface 3: listings ─────────────────────────────────────────────
//
// Scaffold. Datakeys for /properties are unconfirmed (Guesty
// invalidated the session before we could probe). Next session: run
// `node scrape-listings.mjs --probe` after fresh auth, confirm
// datakeys, then this block uses the proven set.

async function scrapeListings() {
  console.log(`[scrape-all/listings] starting…`);
  await page.goto('https://app.guesty.com/properties', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await page.waitForSelector('[data-qa="text-cell"]', { timeout: 25_000 }).catch(() => {});
  await page.waitForTimeout(2500);

  if (page.url().includes('login')) {
    console.warn(`[scrape-all/listings] session bounced — skipping`);
    return;
  }

  const { rows, datakeys } = await page.evaluate(() => {
    const rs = Array.from(document.querySelectorAll('.cell-row'));
    const seenKeys = new Set();
    return {
      datakeys: [...new Set(rs.flatMap((r) =>
        Array.from(r.querySelectorAll('[datakey]')).map((n) => n.getAttribute('datakey'))
      ).filter(Boolean))],
      rows: rs.slice(0, 500).map((r) => {
        const all = {};
        for (const el of r.querySelectorAll('[datakey]')) {
          const k = el.getAttribute('datakey');
          const t = (el.textContent || '').trim();
          if (k && t) all[k] = t.slice(0, 200);
        }
        return all;
      }).filter((r) => Object.keys(r).length > 0),
    };
  });

  if (rows.length === 0) {
    console.warn(`[scrape-all/listings] no rows. probe selectors with: node scrape-listings.mjs --probe`);
    return;
  }
  console.log(`[scrape-all/listings] saw datakeys: ${JSON.stringify(datakeys)}`);

  let posted = 0;
  for (const r of rows) {
    const ok = await postJson('https://admin.friday.mu/api/integrations/guesty/scraped-listings', {
      source: 'guesty-scraper-l3',
      scrapedAt: new Date().toISOString(),
      listing: r, // raw datakey→value map; backend interprets known keys
    });
    if (ok) posted++;
  }
  console.log(`[scrape-all/listings] done. posted=${posted}/${rows.length}`);
}

// ─── Run all three ───────────────────────────────────────────────────

let exitCode = 0;
const state = loadState();
try {
  if (!SKIP_MESSAGES) await scrapeMessages(state).catch((e) => { console.error(`[messages] ${e.message}`); exitCode = 2; });
  if (!SKIP_RESERVATIONS) await scrapeReservations().catch((e) => { console.error(`[reservations] ${e.message}`); exitCode = 2; });
  if (!SKIP_LISTINGS) await scrapeListings().catch((e) => { console.error(`[listings] ${e.message}`); exitCode = 2; });
  saveState(state);
} finally {
  await ctx.close();
  console.log(`[scrape-all] finished at ${new Date().toISOString()} exit=${exitCode}`);
  process.exit(exitCode);
}
