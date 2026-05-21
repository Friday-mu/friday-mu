'use strict';

// Periodic safety-net pull — runs every PULL_INTERVAL_MS to catch
// messages that arrived between Pub/Sub push delivery (which can fail
// silently) and the next watch refresh. Per locked decision §4, this
// is the gap-filler.
//
// Status: PARKED on Ishant creating the GCP OAuth client + setting
// EMAIL_PULL_ENABLED=true env var. Setting up the interval is cheap
// (no API calls until the env is configured), so we wire it now.
//
// Schedule: every 4 hours by default. Per-account cadence (each
// account independently pulls history since last seen).
//
// Implementation sketch (when wired):
//   for each email_accounts row where allowed=TRUE:
//     try {
//       const hist = await gmail_client.listHistory(account, account.history_id);
//       for (const event of hist.history || []) {
//         for (const m of event.messagesAdded || []) {
//           await syncMessage(account, m.message.id);
//         }
//       }
//       update email_accounts set history_id = hist.historyId
//     } catch (err) {
//       // 404 means history_id expired (>7 days) — full re-sync needed.
//       // Bubble to admin alert; not auto-recovered in v1.
//     }

const PULL_INTERVAL_MS = Number(process.env.EMAIL_PULL_INTERVAL_MS || 4 * 60 * 60 * 1000);

let timer = null;

async function tick() {
  if (process.env.EMAIL_PULL_ENABLED !== 'true') return;
  try {
    // TODO: implement once gmail_client is reachable.
    //   1. SELECT * FROM email_accounts WHERE allowed = TRUE
    //   2. For each, listHistory(account, account.history_id)
    //   3. For each new message id, getMessage + persist
    //   4. UPDATE email_accounts SET history_id = ... WHERE id = ...
  } catch (e) {
    console.error('[email/pull_worker] tick error:', e.message);
  }
}

function start() {
  if (timer) return; // already running
  // Run once after a 30s grace period so server startup isn't slowed.
  setTimeout(tick, 30_000);
  timer = setInterval(tick, PULL_INTERVAL_MS);
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, tick };
