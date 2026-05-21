#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../src/database/client');
const {
  previewBreezewayTaskEnrichment,
  previewBreezewayTaskIds,
} = require('../src/tasks/breezewayEnrichment');

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage:
  node backend/scripts/breezeway-task-enrichment-preview.js [--limit 25] [--offset 0]
    [--tenant-id <uuid>] [--external-ref breezeway:<id>] [--task-id <id>]
    [--out report.json] [--use-keychain]

Reads already-imported FAD tasks with external_ref=breezeway:<Task ID>, fetches
temporary Breezeway API detail, and reports API-only enrichment that could be
added later. Preview only: it does not write FAD data or print secrets.

If --task-id is supplied, the script validates API enrichment for those task IDs
without requiring DATABASE_URL.`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    limit: 25,
    offset: 0,
    tenantId: process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001',
    useKeychain: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg === '--offset') args.offset = Number(argv[++i]);
    else if (arg === '--tenant-id') args.tenantId = argv[++i];
    else if (arg === '--external-ref') args.externalRef = argv[++i];
    else if (arg === '--task-id') {
      if (!args.taskIds) args.taskIds = [];
      args.taskIds.push(argv[++i]);
    }
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--use-keychain') args.useKeychain = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = args.taskIds?.length
    ? await previewBreezewayTaskIds({
      taskIds: args.taskIds,
      useKeychain: args.useKeychain,
    })
    : await (async () => {
      if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
      return previewBreezewayTaskEnrichment({
        db: pool,
        tenantId: args.tenantId,
        limit: args.limit,
        offset: args.offset,
        externalRef: args.externalRef || null,
        useKeychain: args.useKeychain,
      });
    })();
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) {
    fs.writeFileSync(path.resolve(args.out), json);
    console.log(`Wrote Breezeway enrichment preview report to ${path.resolve(args.out)}`);
  } else {
    process.stdout.write(json);
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
