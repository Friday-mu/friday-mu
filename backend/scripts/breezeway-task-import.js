#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../src/database/client');
const { previewBreezewayCsv, applyBreezewayCsv } = require('../src/tasks/breezewayImport');

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage:
  node backend/scripts/breezeway-task-import.js --csv <file> [--mode preview|apply] [--out report.json]
    [--tenant-id <uuid>] [--property-map map.json] [--user-map map.json] [--no-db] [--confirm]

Preview is the default. Apply requires --confirm and DATABASE_URL.
Maps are simple JSON objects, e.g. { "1268645": "GBH-C8", "employee-id": "<user-uuid>" }.`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    mode: 'preview',
    tenantId: process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001',
    useDb: true,
    confirm: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--csv') args.csv = argv[++i];
    else if (arg === '--mode') args.mode = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--tenant-id') args.tenantId = argv[++i];
    else if (arg === '--property-map') args.propertyMapPath = argv[++i];
    else if (arg === '--user-map') args.userMapPath = argv[++i];
    else if (arg === '--no-db') args.useDb = false;
    else if (arg === '--confirm') args.confirm = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function readJsonMap(file) {
  if (!file) return {};
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${file} must contain a JSON object`);
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.csv) usage(1);
  if (!['preview', 'apply'].includes(args.mode)) throw new Error('--mode must be preview or apply');
  if (args.mode === 'apply' && !args.confirm) throw new Error('Apply mode requires --confirm');
  if (args.mode === 'apply' && !process.env.DATABASE_URL) throw new Error('Apply mode requires DATABASE_URL');

  const csvPath = path.resolve(args.csv);
  const csvText = fs.readFileSync(csvPath, 'utf8');
  const common = {
    csvText,
    fileName: path.basename(csvPath),
    propertyMap: readJsonMap(args.propertyMapPath),
    userMap: readJsonMap(args.userMapPath),
    tenantId: args.tenantId,
    db: args.useDb && process.env.DATABASE_URL ? pool : null,
  };

  const report = args.mode === 'apply'
    ? await applyBreezewayCsv(common)
    : (await previewBreezewayCsv(common)).report;
  const json = JSON.stringify(report, null, 2);

  if (args.out) {
    fs.writeFileSync(path.resolve(args.out), `${json}\n`);
    console.log(`Wrote Breezeway ${args.mode} report to ${path.resolve(args.out)}`);
  } else {
    console.log(json);
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
