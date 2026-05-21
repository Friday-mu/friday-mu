#!/usr/bin/env node
// Layer-3 fallback ingestion for the Guesty inbox.
//
// Runs from a Mac (Playwright + persistent Chromium profile, optional
// peekaboo CLI for visual extraction). Logs in once via Google SSO,
// reuses the saved session forever after. On each run, opens the
// Guesty unified inbox, walks recent conversations, extracts new
// messages, and posts them to fad-backend's existing Guesty webhook
// endpoint (HMAC-signed exactly like a real Guesty event). Dedup
// happens server-side via UNIQUE(guesty_message_id).
//
// Why this exists: Guesty's OAuth token endpoint is gated to ~5 mints
// per clientId per 24h. When the quota burns out, polling stops and
// (worse) we can't even subscribe to webhooks because POST /webhooks
// requires a token. This scraper is the worst-case backstop — slow,
// fragile, but free of the rate-limit dependency.
//
// USAGE
//   First-time setup:
//     npm install
//     npx playwright install chromium
//     npm run auth           # opens a real browser → log in via Google → close
//   Normal run:
//     npm run scrape
//   Dry-run (extract but don't post):
//     npm run scrape:dry
//   With peekaboo visual fallback (if DOM extraction misses things):
//     brew install peekaboo  (macOS only; https://peekaboo.dev)
//     npm run scrape:peek
//
// EXIT CODES
//   0 — completed (some messages may have failed individually)
//   1 — setup or auth error (re-run `npm run auth`)
//   2 — Guesty UI unreachable / structure changed (run with --use-peekaboo)
//
// CRON
//   Run from launchd every N minutes. Sample plist in README.md.
//   Only run when the API is known-broken; otherwise you waste cycles.

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ──────────────────────────────────────────────────────────

const FAD_WEBHOOK_URL = process.env.FAD_WEBHOOK_URL
  || 'https://admin.friday.mu/api/integrations/guesty/webhook';
const FAD_WEBHOOK_SECRET = process.env.FAD_WEBHOOK_SECRET
  || 'fr1day_wh_2026_s3cure';
const GUESTY_INBOX_URL = process.env.GUESTY_INBOX_URL
  || 'https://app.guesty.com/inbox-v2';
const PROFILE_DIR = process.env.GUESTY_PROFILE_DIR
  || resolve(__dirname, '.profile');
const STATE_FILE = resolve(__dirname, '.state.json');
const MAX_CONVERSATIONS = Number(process.env.MAX_CONVERSATIONS || 50);
const HEADFUL = process.env.HEADFUL === '1';

const args = new Set(process.argv.slice(2));
const AUTH_ONLY = args.has('--auth-only');
const DRY_RUN = args.has('--dry-run');
const USE_PEEKABOO = args.has('--use-peekaboo');

// ─── State (last-seen cursor per conversation) ───────────────────────
//
// Plain JSON: { conversations: { [guestyConversationId]: lastMessageIso } }
// Keeps us from re-scraping the entire backlog on every run. Dedup
// also exists server-side (UNIQUE on guesty_message_id), so this is
// purely a performance optimisation.

function loadState() {
  if (!existsSync(STATE_FILE)) return { conversations: {} };
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf-8')); }
  catch { return { conversations: {} }; }
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─── Authentication mode ─────────────────────────────────────────────
//
// First run: user logs in interactively. Playwright persists the
// session cookies + localStorage to PROFILE_DIR. All future runs
// reuse that profile and skip the login flow.

async function runAuth() {
  if (!existsSync(PROFILE_DIR)) mkdirSync(PROFILE_DIR, { recursive: true });
  console.log(`[auth] Opening a browser. Log in to Guesty, then close it.`);
  console.log(`[auth] Session will be persisted to ${PROFILE_DIR}`);
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1400, height: 900 },
  });
  const page = await ctx.newPage();
  await page.goto('https://app.guesty.com');
  console.log(`[auth] Browser is open. Complete login, navigate to the inbox`);
  console.log(`[auth] to confirm session works, then close the window.`);
  // Wait for the user to close the context manually.
  await ctx.waitForEvent('close', { timeout: 0 });
  console.log(`[auth] Context closed. Session saved.`);
}

// ─── Optional peekaboo visual fallback ───────────────────────────────
//
// Peekaboo is a macOS CLI that screenshots + passes the image to a
// vision LLM. If DOM extraction breaks (Guesty changes their markup,
// shadow roots, etc), we screenshot the panel and ask peekaboo to
// describe what messages are visible.
//
// This is best-effort and slow. We only invoke it when --use-peekaboo
// is set AND DOM extraction yielded zero messages for a conversation
// that looks active.

async function peekabooExtract(screenshotPath) {
  try {
    const prompt =
      `This is a screenshot of a Guesty inbox conversation. Extract all visible ` +
      `messages as JSON: {"messages":[{"direction":"inbound"|"outbound",` +
      `"sender":string,"body":string,"timestamp":string|null}]}. ` +
      `Inbound = guest, outbound = host. Return ONLY the JSON, no prose.`;
    const out = execSync(
      `peekaboo "${screenshotPath}" --prompt ${JSON.stringify(prompt)} --json`,
      { encoding: 'utf-8', maxBuffer: 4 * 1024 * 1024 },
    );
    const parsed = JSON.parse(out);
    return parsed.messages || [];
  } catch (e) {
    console.warn(`[peekaboo] extraction failed: ${e.message}`);
    return [];
  }
}

// ─── Webhook posting ─────────────────────────────────────────────────
//
// We synthesise a Guesty-shaped event and HMAC-sign it so the existing
// receiver accepts it. Format mirrors the conversation.message.received
// payload as best we know it.

function signPayload(rawBody) {
  return createHmac('sha256', FAD_WEBHOOK_SECRET).update(rawBody).digest('hex');
}

async function postMessage({ guestyConversationId, guestyMessageId, direction, body, senderName, createdAt, channel, guestName }) {
  // Synthesise a Guesty-shaped event matching the real Svix-delivered
  // payload envelope (flat, with sibling `message` + `conversation`
  // objects, camelCase event names). The receiver's field extractors
  // are keyed off this shape — keeping us aligned with real webhooks
  // means a single ingestion path serves both sources.
  const eventName = direction === 'outbound'
    ? 'reservation.messageSent'
    : 'reservation.messageReceived';
  const messageType = direction === 'outbound' ? 'fromHost' : 'fromGuest';
  const event = {
    event: eventName,
    source: 'guesty-scraper-l3',
    reservationId: null,
    message: {
      postId: guestyMessageId,
      id: guestyMessageId,
      type: messageType,
      body,
      from: senderName,
      module: channel,
      createdAt,
      sentAt: createdAt,
    },
    conversation: {
      _id: guestyConversationId,
      id: guestyConversationId,
      meta: { guestName },
      integration: { platform: channel },
    },
  };
  const raw = JSON.stringify(event);
  const sig = signPayload(raw);

  if (DRY_RUN) {
    console.log(`[dry-run] would POST ${eventName} for ${guestyMessageId} (${body.slice(0, 60)}…)`);
    return { dryRun: true };
  }

  // We sign with the legacy HMAC-hex scheme over our own
  // FAD_WEBHOOK_SECRET (real Guesty uses Svix, but the receiver
  // accepts both schemes — Svix for live deliveries, this one for us).
  const res = await fetch(FAD_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-guesty-signature': sig,
    },
    body: raw,
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    console.warn(`[post] ${guestyMessageId} → HTTP ${res.status} ${text}`);
    return { ok: false, status: res.status };
  }
  return { ok: true, status: res.status, response: text };
}

// ─── DOM extraction ──────────────────────────────────────────────────
//
// Guesty's inbox UI is a React app. Selectors below were captured from
// app.guesty.com/communication/inbox on 2026-05-17 and will rot. The
// extractors are written defensively (best-effort + fallbacks) and
// log every assumption so failures are easy to diagnose.
//
// If Guesty ships a redesign and these selectors break, two repairs:
//   1. Re-inspect via Playwright Inspector: `PWDEBUG=1 npm run scrape`
//   2. Fall through to peekaboo (--use-peekaboo) for visual extraction.

// Selectors for Guesty's /inbox-v2 UI (rewritten 2026-05-17 — the old
// /communication/inbox testids are gone). The new UI is a React app
// with virtualized rows; conversation IDs live in the URL only, so we
// click each row and read the URL afterward to associate messages.
const SELECTORS = {
  // Conversation rows are <div class="...row-wrapper..."> elements
  // inside the .conversation-section feed (which lives inside a
  // ReactVirtualized grid — only the visible window of rows is
  // rendered at any time). `data-qa="side-bar-item"` matches FILTER
  // chips (All conversations / Sample Inquiry), and `role="row"`
  // matches DayPicker calendar rows — neither is what we want.
  conversationListItem: '.conversation-section .row-wrapper',
  conversationGuestName: '[data-qa="person-name"]',
  conversationSnippet: '[data-qa="person-card-description"]',
  conversationChannelIcon: '[data-qa="indicator-circle"]',
  conversationUnreadDot: '[data-qa="bullet"]',
  threadMessage: '[data-testid="message-content"]',
  // Wrappers around message-content carry the direction. Inspecting
  // prod HTML: inbound has `messageBodyWrapperGuest`, outbound has
  // `messageBodyWrapperHost` somewhere in the ancestor chain.
  // Real Guesty class names (confirmed from prod HTML, 2026-05-17):
  //   .messageBodyWrapperGuest-*  — message FROM the guest (inbound)
  //   .messageBodyWrapperUs-*     — message FROM us / Friday   (outbound)
  // The earlier Host|Owner|Operator|Sent guess never matched any
  // outbound message — net result: all 162 first-run messages were
  // tagged 'inbound' and FAD's inbox put them all on the same side.
  inboundWrapperRegex: /messageBodyWrapperGuest/i,
  outboundWrapperRegex: /messageBodyWrapperUs(?:\b|-)/i,
};

// Pure DOM extraction of visible conversation rows. Does NOT include
// conv IDs (the new UI doesn't put them on the row element) — those
// come from clicking each row and reading the URL.
async function extractConversationList(page) {
  return page.evaluate((sel) => {
    const rows = document.querySelectorAll(sel.conversationListItem);
    return Array.from(rows).slice(0, 100).map((row, idx) => {
      const name = row.querySelector(sel.conversationGuestName)?.textContent?.trim() || null;
      const snippet = row.querySelector(sel.conversationSnippet)?.textContent?.trim() || null;
      const unread = !!row.querySelector(sel.conversationUnreadDot);
      const channelEl = row.querySelector(sel.conversationChannelIcon);
      const channel = channelEl?.getAttribute('aria-label')
        || channelEl?.getAttribute('title')
        || null;
      return { rowIndex: idx, name, snippet, unread, channel };
    }).filter((c) => c.name);
  }, SELECTORS);
}

async function extractThreadMessages(page) {
  return page.evaluate((sel) => {
    const inboundRe = new RegExp(sel.inboundWrapperRegex.source, sel.inboundWrapperRegex.flags);
    const outboundRe = new RegExp(sel.outboundWrapperRegex.source, sel.outboundWrapperRegex.flags);
    const nodes = document.querySelectorAll(sel.threadMessage);
    return Array.from(nodes).map((node) => {
      // Walk up the ancestor chain looking for the wrapper class that
      // signals direction.
      let direction = 'inbound';
      let cur = node;
      for (let depth = 0; depth < 8 && cur; depth++) {
        const cls = cur.className?.toString?.() || '';
        if (outboundRe.test(cls)) { direction = 'outbound'; break; }
        if (inboundRe.test(cls)) { direction = 'inbound'; break; }
        cur = cur.parentElement;
      }
      const body = node.textContent?.trim() || '';
      // Timestamp: closest <time> in the ancestor chain. Guesty renders
      // a single time-stamp per message bubble.
      let tEl = null;
      let probe = node;
      for (let depth = 0; depth < 6 && probe && !tEl; depth++) {
        tEl = probe.querySelector('time');
        probe = probe.parentElement;
      }
      const ts = tEl?.getAttribute('datetime') || tEl?.getAttribute('title') || tEl?.textContent?.trim() || null;
      return { localId: null, direction, body, ts, sender: null };
    }).filter((m) => m.body && m.body.length > 0);
  }, {
    conversationListItem: SELECTORS.conversationListItem,
    conversationGuestName: SELECTORS.conversationGuestName,
    threadMessage: SELECTORS.threadMessage,
    inboundWrapperRegex: { source: SELECTORS.inboundWrapperRegex.source, flags: SELECTORS.inboundWrapperRegex.flags },
    outboundWrapperRegex: { source: SELECTORS.outboundWrapperRegex.source, flags: SELECTORS.outboundWrapperRegex.flags },
  });
}

function deriveStableMessageId(guestyConversationId, msg, index) {
  // We don't always get Guesty's real message id from the DOM. To
  // keep dedup working, synthesise a deterministic id from the
  // conversation + timestamp + body hash. This means a re-scrape of
  // the same message produces the same id → ON CONFLICT DO NOTHING
  // server-side.
  if (msg.localId) return `g-scrape-${msg.localId}`;
  const seed = `${guestyConversationId}:${msg.ts || ''}:${index}:${(msg.body || '').slice(0, 80)}`;
  // Cheap FNV-1a; we don't need crypto strength here.
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `g-scrape-${(h >>> 0).toString(16)}-${(msg.body || '').slice(0, 8).replace(/[^a-z0-9]/gi, '')}`;
}

// ─── Main scrape loop ────────────────────────────────────────────────

async function runScrape() {
  if (!existsSync(PROFILE_DIR)) {
    console.error(`[scrape] No saved session. Run: npm run auth`);
    process.exit(1);
  }
  const state = loadState();
  console.log(`[scrape] target=${FAD_WEBHOOK_URL} dryRun=${DRY_RUN} peekaboo=${USE_PEEKABOO}`);

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: !HEADFUL,
    viewport: { width: 1400, height: 900 },
  });
  const page = await ctx.newPage();

  try {
    await page.goto(GUESTY_INBOX_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

    // Sanity: if we got bounced to a login screen, the session expired.
    if (page.url().includes('login') || page.url().includes('signin')) {
      console.error(`[scrape] Session expired. Run: npm run auth`);
      process.exit(1);
    }

    const conversations = await extractConversationList(page);
    console.log(`[scrape] found ${conversations.length} conversations in list`);
    if (conversations.length === 0) {
      console.warn(`[scrape] Empty conversation list. UI structure may have changed.`);
      // Dump what we actually saw so we can diagnose without a graphical
      // session. Saved under .debug/.
      try {
        const debugDir = resolve(__dirname, '.debug');
        mkdirSync(debugDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const shotPath = resolve(debugDir, `inbox-list-${stamp}.png`);
        const htmlPath = resolve(debugDir, `inbox-list-${stamp}.html`);
        await page.screenshot({ path: shotPath, fullPage: true });
        writeFileSync(htmlPath, await page.content());
        const diag = await page.evaluate((sel) => ({
          url: location.href,
          title: document.title,
          bodyTextHead: (document.body?.innerText || '').slice(0, 400),
          conversationListItem: document.querySelectorAll(sel.conversationListItem).length,
          anyAnchorToConversation: document.querySelectorAll('a[href*="conversation"]').length,
          anyDataTestid: document.querySelectorAll('[data-testid]').length,
          anyRoleListitemOrRow: document.querySelectorAll('[role="listitem"], [role="row"]').length,
          firstFewTestids: Array.from(document.querySelectorAll('[data-testid]')).slice(0, 12).map((n) => n.getAttribute('data-testid')),
          firstFewClassPrefixes: Array.from(new Set(Array.from(document.querySelectorAll('[class]')).slice(0, 80).map((n) => (n.className?.toString?.() || '').split(' ')[0]).filter(Boolean))).slice(0, 20),
        }), SELECTORS);
        console.warn(`[scrape] page url=${diag.url}`);
        console.warn(`[scrape] page title=${diag.title}`);
        console.warn(`[scrape] body-text head: ${JSON.stringify(diag.bodyTextHead)}`);
        console.warn(`[scrape] selector hits: conversationListItem=${diag.conversationListItem} anchors=${diag.anyAnchorToConversation} dataTestid=${diag.anyDataTestid} listitemOrRow=${diag.anyRoleListitemOrRow}`);
        console.warn(`[scrape] first data-testid values: ${JSON.stringify(diag.firstFewTestids)}`);
        console.warn(`[scrape] first class prefixes: ${JSON.stringify(diag.firstFewClassPrefixes)}`);
        console.warn(`[scrape] saved screenshot: ${shotPath}`);
        console.warn(`[scrape] saved html: ${htmlPath}`);
      } catch (e) {
        console.warn(`[scrape] debug-dump failed: ${e?.message || e}`);
      }
      if (!USE_PEEKABOO) {
        console.warn(`[scrape] Re-run with --use-peekaboo for visual fallback.`);
      }
      process.exit(2);
    }

    let posted = 0;
    let skipped = 0;
    const seenConvIds = new Set();
    const maxToProcess = Math.min(conversations.length, MAX_CONVERSATIONS);
    console.log(`[scrape] processing up to ${maxToProcess} conversation(s)`);

    for (let i = 0; i < maxToProcess; i++) {
      // Re-query rows each iteration — the virtualized list re-renders
      // around the active row after each click, so a stale handle would
      // misalign.
      const rows = page.locator(SELECTORS.conversationListItem);
      const liveCount = await rows.count();
      if (i >= liveCount) {
        // Virtualization hid this row; bail rather than guess.
        console.log(`[scrape] only ${liveCount} rows currently in DOM — stopping at i=${i}`);
        break;
      }
      const row = rows.nth(i);
      const name = await row.locator(SELECTORS.conversationGuestName).textContent().catch(() => null);
      const channelEl = row.locator(SELECTORS.conversationChannelIcon).first();
      const channel = await channelEl.getAttribute('aria-label').catch(() => null)
        || await channelEl.getAttribute('title').catch(() => null);

      // Click and wait for the URL to settle on a conv-specific path.
      const urlBefore = page.url();
      try {
        await row.click({ timeout: 5000 });
      } catch (e) {
        console.warn(`[scrape] row ${i} (${name || '?'}) — click failed: ${e?.message || e}`);
        continue;
      }
      try {
        await page.waitForFunction(
          (before) => location.href !== before && /\/inbox-v2\/[a-f0-9]{18,32}/.test(location.href),
          urlBefore,
          { timeout: 8000 },
        );
      } catch {
        console.warn(`[scrape] row ${i} (${name || '?'}) — URL never updated after click; skipping`);
        continue;
      }
      const urlAfter = page.url();
      const convId = urlAfter.match(/\/inbox-v2\/([a-f0-9]{18,32})/)?.[1];
      if (!convId) {
        console.warn(`[scrape] row ${i} (${name || '?'}) — could not parse conv id from ${urlAfter}`);
        continue;
      }
      if (seenConvIds.has(convId)) {
        // Same conv opened twice (e.g., virtualization re-shuffled).
        continue;
      }
      seenConvIds.add(convId);

      // Give the thread time to render its messages.
      await page.waitForSelector(SELECTORS.threadMessage, { timeout: 8000 }).catch(() => {});
      // Also give virtualization a beat — some message panes render
      // skeleton bubbles first.
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

      let msgs = await extractThreadMessages(page);

      if (msgs.length === 0 && USE_PEEKABOO) {
        const shot = resolve(__dirname, `.peek-${convId}.png`);
        await page.screenshot({ path: shot, fullPage: true });
        const peekMsgs = await peekabooExtract(shot);
        msgs = peekMsgs.map((m) => ({
          localId: null,
          direction: m.direction || 'inbound',
          body: m.body || '',
          ts: m.timestamp || null,
          sender: m.sender || null,
        }));
      }

      const cursor = state.conversations[convId] || '1970-01-01T00:00:00Z';
      const newMsgs = msgs.filter((m) => {
        if (!m.body) return false;
        if (!m.ts) return true; // unknown ts → trust server dedup
        return new Date(m.ts).toISOString() > cursor;
      });

      console.log(`[scrape] conv ${convId} (${name || '?'}) — ${msgs.length} total, ${newMsgs.length} new`);

      for (let j = 0; j < newMsgs.length; j++) {
        const m = newMsgs[j];
        const id = deriveStableMessageId(convId, m, j);
        const result = await postMessage({
          guestyConversationId: convId,
          guestyMessageId: id,
          direction: m.direction || 'inbound',
          body: m.body,
          senderName: m.sender || (m.direction === 'outbound' ? 'Friday' : name || 'Guest'),
          createdAt: m.ts ? new Date(m.ts).toISOString() : new Date().toISOString(),
          channel,
          guestName: name,
        });
        if (result.ok || result.dryRun) posted++;
        else skipped++;
      }
      // Shadow `conv` for the cursor-advancing block below.
      var conv = { id: convId, name, channel };

      // Advance the cursor to the latest message we saw (even if some
      // posts failed — server-side dedup will replay safely on retry).
      const latestTs = msgs
        .map((m) => m.ts && new Date(m.ts).getTime())
        .filter(Boolean)
        .sort((a, b) => b - a)[0];
      if (latestTs) state.conversations[conv.id] = new Date(latestTs).toISOString();
    }

    saveState(state);
    console.log(`[scrape] done. posted=${posted} skipped=${skipped} cursorState=${Object.keys(state.conversations).length}`);
  } finally {
    await ctx.close();
  }
}

// ─── Entry ───────────────────────────────────────────────────────────

(async () => {
  try {
    if (AUTH_ONLY) await runAuth();
    else await runScrape();
  } catch (e) {
    console.error(`[fatal] ${e.stack || e.message}`);
    process.exit(2);
  }
})();
