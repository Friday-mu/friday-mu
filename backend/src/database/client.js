'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[db] unexpected pool error:', err.message);
});

async function query(text, params) {
  return pool.query(text, params);
}

async function close() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  close,
};
