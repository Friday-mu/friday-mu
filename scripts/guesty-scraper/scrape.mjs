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
  || 'https://app.guesty.com/communication/inbox';
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
  const eventName = direction === 'outbound' ? 'conversation.message.sent' : 'conversation.message.received';
  const event = {
    event: eventName,
    source: 'guesty-scraper-l3',
    data: {
      message: {
        _id: guestyMessageId,
        conversationId: guestyConversationId,
        direction,
        body,
        senderName,
        createdAt,
      },
      conversation: {
        _id: guestyConversationId,
        channel,
        guest: { fullName: guestName },
      },
    },
  };
  const raw = JSON.stringify(event);
  const sig = signPayload(raw);

  if (DRY_RUN) {
    console.log(`[dry-run] would POST ${eventName} for ${guestyMessageId} (${body.slice(0, 60)}…)`);
    return { dryRun: true };
  }

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

const SELECTORS = {
  conversationListItem: '[data-testid="inbox-conversation-row"], .conversation-list-item, [class*="ConversationRow"]',
  conversationGuestName: '[data-testid="guest-name"], [class*="GuestName"]',
  conversationChannelIcon: '[data-testid="channel-icon"], [class*="ChannelIcon"]',
  conversationUnreadDot: '[data-testid="unread-indicator"], [class*="UnreadDot"]',
  threadMessage: '[data-testid="message-bubble"], [class*="MessageBubble"], [role="article"]',
  messageDirection: '[data-direction], [class*="inbound"], [class*="outbound"]',
  messageBody: '[data-testid="message-body"], [class*="MessageBody"], [class*="bubble-body"]',
  messageTimestamp: 'time, [data-testid="message-time"], [class*="Timestamp"]',
  messageSender: '[data-testid="sender-name"], [class*="SenderName"]',
};

async function extractConversationList(page) {
  return page.evaluate((sel) => {
    const rows = document.querySelectorAll(sel.conversationListItem);
    return Array.from(rows).slice(0, 100).map((row) => {
      // Conversation id might be in a data attribute or href.
      const link = row.closest('a') || row.querySelector('a');
      const href = link?.getAttribute('href') || '';
      const idMatch = href.match(/conversations?\/([a-f0-9-]+)/i);
      const id = idMatch?.[1] || row.getAttribute('data-conversation-id') || row.id || null;
      const name = row.querySelector(sel.conversationGuestName)?.textContent?.trim() || null;
      const unread = !!row.querySelector(sel.conversationUnreadDot);
      const channel = row.querySelector(sel.conversationChannelIcon)?.getAttribute('aria-label')
        || row.querySelector(sel.conversationChannelIcon)?.getAttribute('title')
        || null;
      return { id, name, unread, channel, href };
    }).filter((c) => c.id || c.href);
  }, SELECTORS);
}

async function extractThreadMessages(page) {
  return page.evaluate((sel) => {
    const nodes = document.querySelectorAll(sel.threadMessage);
    return Array.from(nodes).map((node) => {
      // Direction: inferred from class names or data-direction attribute.
      let direction = node.getAttribute('data-direction') || '';
      if (!direction) {
        const cls = node.className?.toString?.() || '';
        if (/outbound|sent|host/i.test(cls)) direction = 'outbound';
        else if (/inbound|received|guest/i.test(cls)) direction = 'inbound';
      }
      const body = node.querySelector(sel.messageBody)?.textContent?.trim()
        || node.textContent?.trim() || '';
      const tEl = node.querySelector(sel.messageTimestamp);
      const ts = tEl?.getAttribute('datetime') || tEl?.getAttribute('title') || tEl?.textContent?.trim() || null;
      const sender = node.querySelector(sel.messageSender)?.textContent?.trim() || null;
      const localId = node.getAttribute('data-message-id') || node.id || null;
      return { localId, direction, body, ts, sender };
    });
  }, SELECTORS);
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
      if (!USE_PEEKABOO) {
        console.warn(`[scrape] Re-run with --use-peekaboo for visual fallback.`);
      }
      process.exit(2);
    }

    let posted = 0;
    let skipped = 0;
    const conversationsToProcess = conversations
      .filter((c) => c.unread || !state.conversations[c.id])
      .slice(0, MAX_CONVERSATIONS);

    for (const conv of conversationsToProcess) {
      if (!conv.id) continue;
      const url = conv.href.startsWith('http') ? conv.href : `https://app.guesty.com${conv.href}`;
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector(SELECTORS.threadMessage, { timeout: 8000 }).catch(() => {});

      let msgs = await extractThreadMessages(page);

      if (msgs.length === 0 && USE_PEEKABOO) {
        const shot = resolve(__dirname, `.peek-${conv.id}.png`);
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

      const cursor = state.conversations[conv.id] || '1970-01-01T00:00:00Z';
      const newMsgs = msgs.filter((m) => {
        if (!m.body) return false;
        if (!m.ts) return true; // unknown ts → trust server dedup
        return new Date(m.ts).toISOString() > cursor;
      });

      console.log(`[scrape] conv ${conv.id} (${conv.name || '?'}) — ${msgs.length} total, ${newMsgs.length} new`);

      for (let i = 0; i < newMsgs.length; i++) {
        const m = newMsgs[i];
        const id = deriveStableMessageId(conv.id, m, i);
        const result = await postMessage({
          guestyConversationId: conv.id,
          guestyMessageId: id,
          direction: m.direction || 'inbound',
          body: m.body,
          senderName: m.sender || (m.direction === 'outbound' ? 'Friday' : conv.name || 'Guest'),
          createdAt: m.ts ? new Date(m.ts).toISOString() : new Date().toISOString(),
          channel: conv.channel,
          guestName: conv.name,
        });
        if (result.ok || result.dryRun) posted++;
        else skipped++;
      }

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
