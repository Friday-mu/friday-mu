#!/usr/bin/env node
'use strict';

// CLI helper — issue an api_clients row for a new public-API consumer
// (the friday.mu website is the first; later tenants follow). Per
// roadmap §5.2.1 / ADR-003.
//
// Usage (on the VPS, with /var/www/fad-backend/.env loaded):
//
//   node scripts/issue-api-client.js \
//     --name=friday-website \
//     --tenant=00000000-0000-0000-0000-000000000001 \
//     --scopes=listings:read,availability:read,reservations:write,email:send,ai:chat,events:read \
//     --description="Vercel-hosted friday.mu marketing site"
//
//   # Rotate an existing client's secret (everything but the secret
//   # stays the same; old secret is invalidated immediately because
//   # the hash is replaced):
//   node scripts/issue-api-client.js --name=friday-website --rotate
//
// The script prints the client_secret to stdout exactly once. It is
// NOT recoverable — copy it into the consumer's env immediately. Lose
// it, re-run with --rotate.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

require('dotenv').config();
const { query } = require('../src/database/client');

// rounds=12 per the website-session contract: industry standard
// (significantly stronger than rounds=10 which the user-session hash
// uses); negligible verify cost at <10 issuances/day.
const BCRYPT_ROUNDS = 12;

function parseArgs() {
  const out = {};
  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq === -1) {
      out[arg.slice(2)] = true;
    } else {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
    }
  }
  return out;
}

function generateSecret() {
  // 32 bytes = 256 bits of entropy. Hex-encoded for copy-paste safety
  // across shells / env files. Result: 64-char string.
  return crypto.randomBytes(32).toString('hex');
}

async function main() {
  const args = parseArgs();
  const name = String(args.name || '').trim();
  const tenant = String(args.tenant || '').trim();
  const scopesRaw = String(args.scopes || '').trim();
  const description = String(args.description || '').trim() || null;
  const rotate = !!args.rotate;
  const createdBy = String(args['created-by'] || process.env.USER || 'cli').trim();

  if (!name) {
    console.error('error: --name is required (e.g. --name=friday-website)');
    process.exit(2);
  }
  if (!rotate && !tenant) {
    console.error('error: --tenant is required when issuing a new client');
    process.exit(2);
  }
  if (!rotate && !scopesRaw) {
    console.error('error: --scopes is required when issuing a new client (comma-separated)');
    process.exit(2);
  }

  const scopes = scopesRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const existing = await query(
    `SELECT id, client_id, scopes, tenant_id, revoked_at
       FROM api_clients WHERE client_id = $1 LIMIT 1`,
    [name],
  );

  const secret = generateSecret();
  const hash = await bcrypt.hash(secret, BCRYPT_ROUNDS);

  if (existing.rows.length > 0) {
    if (!rotate) {
      console.error(`error: client_id "${name}" already exists. Use --rotate to mint a new secret in place.`);
      process.exit(2);
    }
    const row = existing.rows[0];
    await query(
      `UPDATE api_clients
         SET client_secret_hash = $1,
             revoked_at = NULL,
             last_used_at = NULL
       WHERE id = $2`,
      [hash, row.id],
    );
    await query(
      `INSERT INTO api_client_audit (client_id, event, reason, metadata)
       VALUES ($1, 'rotated', $2, $3)`,
      [name, `rotated by ${createdBy}`, JSON.stringify({ kept_scopes: row.scopes, kept_tenant_id: row.tenant_id })],
    );
    print(name, row.tenant_id, row.scopes || [], secret, 'rotated');
  } else {
    await query(
      `INSERT INTO api_clients
         (client_id, client_secret_hash, tenant_id, scopes, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [name, hash, tenant, JSON.stringify(scopes), description, createdBy],
    );
    await query(
      `INSERT INTO api_client_audit (client_id, event, reason, metadata)
       VALUES ($1, 'issued', $2, $3)`,
      [name, `issued by ${createdBy}`, JSON.stringify({ scopes, tenant_id: tenant, description })],
    );
    print(name, tenant, scopes, secret, 'issued');
  }
  process.exit(0);
}

function print(clientId, tenantId, scopes, secret, action) {
  console.log('');
  console.log(`✔  ${action === 'rotated' ? 'Rotated' : 'Issued'} api_clients row for "${clientId}"`);
  console.log('');
  console.log(`  client_id     : ${clientId}`);
  console.log(`  tenant_id     : ${tenantId}`);
  console.log(`  scopes        : ${Array.isArray(scopes) ? scopes.join(' ') : scopes}`);
  console.log('');
  console.log('  ──────────────────────────────────────────────────────────────');
  console.log(`  CLIENT SECRET (shown once — copy to consumer env NOW):`);
  console.log('  ──────────────────────────────────────────────────────────────');
  console.log('');
  console.log(`  ${secret}`);
  console.log('');
  console.log('  ──────────────────────────────────────────────────────────────');
  console.log('  This secret is not stored in cleartext anywhere on the');
  console.log('  server — only its bcrypt hash. If lost, re-run with --rotate.');
  console.log('');
}

main().catch((e) => {
  console.error('issue-api-client failed:', e.message);
  process.exit(1);
});
