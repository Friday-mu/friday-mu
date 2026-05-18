'use strict';

// Translation worker — finds inbound messages without a detected
// language or translation and runs them through the Kimi-backed
// translateText pipeline. Replaces friday-gms's poller-driven
// detectLanguage path so fad-backend can do translation natively.
//
// Trigger model: simple setInterval. Cheap because the SELECT is
// indexed on (conversation_id, created_at) and bounded by a 7-day
// window. The translateText function has its own disk cache so
// re-runs over the same body don't burn tokens.
//
// Concurrency: one in-flight pass at a time. A long run would block
// the next tick — that's fine, this is best-effort backfill, not
// real-time. Real-time arrival should still get translated within
// 60-120s (worst case two ticks).

const { query } = require('../database/client');
const { translateText } = require('../ai/translate');

const POLL_INTERVAL_MS = Number(process.env.TRANSLATION_WORKER_INTERVAL_MS) || 60_000;
const BATCH_SIZE = Number(process.env.TRANSLATION_WORKER_BATCH) || 10;
const LOOKBACK_DAYS = Number(process.env.TRANSLATION_WORKER_LOOKBACK_DAYS) || 7;

let inFlight = false;
let timer = null;

async function translateOneTick() {
  if (inFlight) return;
  inFlight = true;
  try {
    // Candidates: inbound messages from the lookback window where we
    // don't yet have a confirmed language. NULL language means the
    // webhook (correctly) deferred to detection. We also pick up rows
    // where language was set but translation is missing AND language
    // is non-English (legacy rows that GMS's poller didn't reach).
    const { rows } = await query(
      `SELECT id, conversation_id, body
         FROM messages
         WHERE direction = 'inbound'
           AND created_at > NOW() - INTERVAL '${LOOKBACK_DAYS} days'
           AND (
             original_language IS NULL
             OR (original_language NOT IN ('en') AND translated_body IS NULL)
           )
           AND body IS NOT NULL
           AND LENGTH(body) > 0
           -- Skip the synthetic placeholder bodies the webhook writes
           -- for attachment-only / reaction-only / system messages.
           -- They're not real text to translate; running detectLanguage
           -- on them burns Kimi calls for no value.
           AND body NOT LIKE '📎%'
           AND body NOT LIKE '📷%'
           AND body NOT LIKE '💬%'
         ORDER BY created_at DESC
         LIMIT $1`,
      [BATCH_SIZE],
    );

    if (rows.length === 0) return;

    for (const row of rows) {
      try {
        const result = await translateText(row.body, { conversationId: row.conversation_id });
        // translateText returns { translated, sourceLang, ... }.
        // sourceLang is the detected language. translated is either
        // the English translation OR the original (if already English).
        const sourceLang = (result.sourceLang || 'en')
          .toLowerCase()
          .split(/[\s(]/)[0]
          .slice(0, 10);
        const isEnglish = sourceLang === 'en' || sourceLang.startsWith('en-');

        if (isEnglish) {
          // English: only need to mark the language. No translated_body.
          await query(
            `UPDATE messages
               SET original_language = $1
               WHERE id = $2 AND original_language IS DISTINCT FROM $1`,
            [sourceLang, row.id],
          );
        } else {
          await query(
            `UPDATE messages
               SET original_language = $1,
                   translated_body = $2
               WHERE id = $3`,
            [sourceLang, result.translated || null, row.id],
          );
        }

        // Cache the detected language on the conversation so future
        // emoji-only / undetectable messages can fall back to it
        // (matches GMS's last_detected_language column behavior).
        await query(
          `UPDATE conversations
             SET last_detected_language = $1
           WHERE id = $2 AND last_detected_language IS DISTINCT FROM $1`,
          [sourceLang, row.conversation_id],
        ).catch(() => {});
      } catch (e) {
        console.warn(`[translation/worker] row ${row.id} failed:`, e.message);
      }
    }

    if (rows.length === BATCH_SIZE) {
      console.log(`[translation/worker] processed ${rows.length} rows (batch full — more pending)`);
    } else {
      console.log(`[translation/worker] processed ${rows.length} rows`);
    }
  } catch (e) {
    console.error('[translation/worker] tick failed:', e.message);
  } finally {
    inFlight = false;
  }
}

function start() {
  if (timer) return;
  console.log(`[translation/worker] starting (interval=${POLL_INTERVAL_MS}ms, batch=${BATCH_SIZE}, lookback=${LOOKBACK_DAYS}d)`);
  // First tick on a short delay so backend startup logs aren't drowned out.
  setTimeout(() => { translateOneTick().catch(() => {}); }, 5_000);
  timer = setInterval(() => { translateOneTick().catch(() => {}); }, POLL_INTERVAL_MS);
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { start, stop, translateOneTick };
