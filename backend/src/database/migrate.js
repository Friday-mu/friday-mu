'use strict';

// FAD-owned migration runner. Mirrors the GMS pattern from
// friday-gms/src/core/db/client.ts but uses a SEPARATE tracking table
// (fad_schema_migrations) so FAD and GMS don't interfere with each other's
// migration state in the shared gmsdb.
//
// Files live in backend/migrations/*.sql, applied in alphabetical order.
// Each runs inside a transaction; partial failures roll back.

const fs = require('fs');
const path = require('path');
const { pool } = require('./client');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    console.warn('[migrate] DATABASE_URL not set — skipping migrations. Set it in backend/.env to enable HR routes.');
    return { skipped: true };
  }

  // FAD-specific tracking table — GMS uses `schema_migrations`, we use
  // `fad_schema_migrations`. Independent so the two systems can run in
  // parallel without stepping on each other.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fad_schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const tracked = await pool.query('SELECT filename FROM fad_schema_migrations');
  const applied = new Set(tracked.rows.map((r) => r.filename));

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.warn('[migrate] migrations dir missing:', MIGRATIONS_DIR);
    return { applied: 0, skipped: 0 };
  }
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

  let appliedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    if (applied.has(file)) { skippedCount++; continue; }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO fad_schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
        [file],
      );
      await client.query('COMMIT');
      appliedCount++;
      console.log(`[migrate] applied: ${file}`);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`[migrate] FAILED: ${file} — ${e.message}`);
      // Don't throw — server should still start. Operator addresses the
      // failed migration manually. Same pattern as GMS migration runner.
      break;
    } finally {
      client.release();
    }
  }

  console.log(`[migrate] complete: ${appliedCount} applied, ${skippedCount} already-applied, ${files.length} total`);
  return { applied: appliedCount, skipped: skippedCount, total: files.length };
}

module.exports = { runMigrations };
