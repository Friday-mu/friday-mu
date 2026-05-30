'use strict';

// Shared Postgres client + connection pool for FAD backend.
//
// FAD owns its own tables (currently HR module) but lives in the shared
// gmsdb so the eventual GMS shutdown leaves the schema in place. Only
// FAD writes to fad_-prefixed concerns; GMS doesn't reference them.

const { Pool } = require('pg');

const _pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Keep small — FAD backend is mostly proxy work; HR + future direct
  // queries are low-volume. Tune if monitoring shows pool exhaustion.
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

_pool.on('error', (err) => {
  console.error('[db] unexpected pool error:', err.message);
});

/**
 * Run a parameterized query. Mirrors the `query(text, params)` signature
 * used in GMS so callers can copy patterns across repos.
 */
async function query(text, params) {
  return _pool.query(text, params);
}

// Acquire a single connection for transactional work (BEGIN/COMMIT/
// ROLLBACK across multiple statements). Caller MUST call client.release()
// in a finally block to return the connection to the pool. Use the
// top-level `query()` for any read or single-statement write.
async function getClient() {
  return _pool.connect();
}

async function close() {
  await _pool.end();
}

module.exports = {
  pool: _pool,
  query,
  getClient,
  close,
};
