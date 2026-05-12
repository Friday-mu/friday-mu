'use strict';

// Auto-task scheduler — boots a setInterval on server start that calls
// runAutoTaskScan every 5 minutes. Deliberately dumb: no retry, no
// exponential backoff, no per-tick error escalation. If a scan errors
// we log and move on; the next tick gets a clean slate. That matches
// the brief's out-of-scope notes for design-be-9.
//
// Disabled when NODE_ENV='test' so the test harness doesn't see ghost
// inserts. The startAutoTaskScheduler() function is idempotent — calling
// it twice returns the already-installed interval reference.

const { runAutoTaskScan } = require('./auto_tasks');

const INTERVAL_MS = 5 * 60 * 1000;

let _intervalRef = null;

function startAutoTaskScheduler() {
  if (process.env.NODE_ENV === 'test') return null;
  if (_intervalRef) return _intervalRef;
  // First tick fires after INTERVAL_MS, not immediately — that gives the
  // server time to finish bootstrap. If you want a kick on boot, call
  // runAutoTaskScan() directly elsewhere.
  _intervalRef = setInterval(async () => {
    try {
      const result = await runAutoTaskScan();
      if (result.generated > 0) {
        console.log(
          `[auto-tasks] scan complete: ${result.generated} task(s) generated`,
          result.by_trigger,
        );
      }
    } catch (e) {
      console.error('[auto-tasks] scan failed:', e.message);
    }
  }, INTERVAL_MS);
  // Don't keep the process alive just for the scheduler — server.listen
  // already holds the event loop, and during graceful shutdown we want
  // the interval to release.
  if (typeof _intervalRef.unref === 'function') _intervalRef.unref();
  return _intervalRef;
}

function stopAutoTaskScheduler() {
  if (_intervalRef) {
    clearInterval(_intervalRef);
    _intervalRef = null;
  }
}

module.exports = {
  startAutoTaskScheduler,
  stopAutoTaskScheduler,
  INTERVAL_MS,
};
