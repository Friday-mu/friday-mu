#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../src/database/client');
const {
  applyBreezewayTaskEnrichment,
  previewBreezewayTaskEnrichment,
  previewBreezewayTaskIds,
} = require('../src/tasks/breezewayEnrichment');

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage:
  node backend/scripts/breezeway-task-enrichment-preview.js [--limit 25] [--offset 0]
    [--tenant-id <uuid>] [--external-ref breezeway:<id>] [--task-id <id>]
    [--out report.json] [--use-keychain] [--request-delay-ms 250]
    [--missing-only] [--include-enriched] [--apply]

Reads already-imported FAD tasks with external_ref=breezeway:<Task ID>, fetches
temporary Breezeway API detail, and reports API-only enrichment that could be
added later. Default mode is preview only: it does not write FAD data or print
secrets.

If --task-id is supplied, the script validates API enrichment for those task IDs
without requiring DATABASE_URL. --apply is only available in DB-backed mode and
updates existing source=breezeway tasks only. Apply mode defaults to rows missing
source_payload.apiEnrichment so batch reruns stay idempotent.`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    limit: 25,
    offset: 0,
    tenantId: process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001',
    useKeychain: false,
    apply: false,
    requestDelayMs: 250,
    missingOnly: false,
    includeEnriched: false,
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
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--request-delay-ms') args.requestDelayMs = Number(argv[++i]);
    else if (arg === '--missing-only') args.missingOnly = true;
    else if (arg === '--include-enriched') args.includeEnriched = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.apply && args.taskIds?.length) {
    throw new Error('--apply cannot be used with --task-id; use DB-backed mode so existing FAD tasks can be updated idempotently.');
  }
  const report = args.taskIds?.length
    ? await previewBreezewayTaskIds({
      taskIds: args.taskIds,
      useKeychain: args.useKeychain,
      requestDelayMs: args.requestDelayMs,
    })
    : await (async () => {
      if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
      const fn = args.apply ? applyBreezewayTaskEnrichment : previewBreezewayTaskEnrichment;
      return fn({
        db: pool,
        tenantId: args.tenantId,
        limit: args.limit,
        offset: args.offset,
        externalRef: args.externalRef || null,
        useKeychain: args.useKeychain,
        requestDelayMs: args.requestDelayMs,
        missingEnrichment: args.apply ? !args.includeEnriched : args.missingOnly,
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
    if (error.report) {
      process.stderr.write(`${JSON.stringify(error.report, null, 2)}\n`);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
