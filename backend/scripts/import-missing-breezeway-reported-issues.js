#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../src/database/client');
const {
  parseCsv,
  previewBreezewayBundle,
  applyBreezewayBundle,
} = require('../src/tasks/breezewayImport');

const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILTERED_FILE_NAMES = {
  summary: 'breezeway-task-summary-export.csv',
  custom: 'breezeway-task-custom-export.csv',
  cost: 'breezeway-task-cost-export.csv',
  payroll: 'breezeway-task-payroll-export.csv',
  supplies: 'breezeway-task-supplies-export.csv',
};

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage:
  node backend/scripts/import-missing-breezeway-reported-issues.js --dir <reported-issues-export-dir>
    [--tenant-id <uuid>] [--apply --confirm] [--out report.json] [--keep-temp]

Builds a filtered Breezeway bundle containing only reported-issue Task IDs
that are missing from FAD tasks.external_ref. Preview is read-only. Apply
imports only the filtered missing rows and disables the first-pass admin/GBH
skip policy because this script is for the approved reported-issues backfill.`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    tenantId: DEFAULT_TENANT_ID,
    apply: false,
    confirm: false,
    keepTemp: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') usage(0);
    else if (arg === '--dir') args.dir = argv[++i];
    else if (arg === '--tenant-id') args.tenantId = argv[++i];
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--confirm') args.confirm = true;
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--keep-temp') args.keepTemp = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.dir) throw new Error('--dir is required');
  if (!UUID_RE.test(args.tenantId)) throw new Error('--tenant-id must be a UUID');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required to find missing tasks');
  if (args.apply && !args.confirm) throw new Error('Apply mode requires --confirm');
  return args;
}

function clean(value) {
  return String(value || '').trim();
}

function taskIdFromRow(row) {
  return clean(row['Task ID']);
}

function findFile(dir, kind) {
  const names = fs.readdirSync(dir);
  if (kind === 'summary') {
    const summaries = names
      .filter((name) => /^breezeway-task-summary-export.*\.csv$/i.test(name))
      .sort((a, b) => a.localeCompare(b));
    if (summaries.length === 0) throw new Error(`No Breezeway summary export found in ${dir}`);
    return path.join(dir, summaries[0]);
  }
  const fileName = FILTERED_FILE_NAMES[kind];
  const filePath = path.join(dir, fileName);
  if (!fs.existsSync(filePath)) throw new Error(`Missing ${kind} export: ${filePath}`);
  return filePath;
}

function readBundle(dir) {
  const files = {};
  const parsed = {};
  const text = {};
  for (const kind of Object.keys(FILTERED_FILE_NAMES)) {
    const filePath = findFile(dir, kind);
    const csvText = fs.readFileSync(filePath, 'utf8');
    files[kind] = filePath;
    text[kind] = csvText;
    parsed[kind] = parseCsv(csvText);
  }
  return { files, parsed, text };
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\r\n]/.test(text) || /^\s|\s$/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsv(filePath, headers, rows) {
  const body = [
    headers.map(csvCell).join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ].join('\n');
  fs.writeFileSync(filePath, `${body}\n`);
}

function countBy(values) {
  const counts = new Map();
  for (const value of values) {
    const key = clean(value) || '(empty)';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function duplicateTaskIds(summaryRows) {
  const seen = new Map();
  const duplicates = [];
  for (const row of summaryRows) {
    const taskId = taskIdFromRow(row);
    if (!taskId) continue;
    const existing = seen.get(taskId);
    if (existing) {
      existing.rowNumbers.push(row.__rowNumber);
    } else {
      seen.set(taskId, { taskId, rowNumbers: [row.__rowNumber] });
    }
  }
  for (const entry of seen.values()) {
    if (entry.rowNumbers.length > 1) duplicates.push(entry);
  }
  return duplicates;
}

async function loadExistingRefs(tenantId, taskIds) {
  if (taskIds.length === 0) return new Set();
  const refs = taskIds.map((taskId) => `breezeway:${taskId}`);
  const { rows } = await pool.query(
    `SELECT external_ref
       FROM tasks
      WHERE tenant_id = $1
        AND external_ref = ANY($2::text[])`,
    [tenantId, refs],
  );
  return new Set(rows.map((row) => row.external_ref));
}

function buildFilteredBundle(source, missingIds, batchId) {
  const missing = new Set(missingIds);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${batchId}-`));
  const missingSummaryRows = [];
  const missingSummaryIndexes = [];

  source.parsed.summary.rows.forEach((row, index) => {
    if (missing.has(taskIdFromRow(row))) {
      missingSummaryRows.push(row);
      missingSummaryIndexes.push(index);
    }
  });

  const missingCustomRows = missingSummaryIndexes
    .map((index) => source.parsed.custom.rows[index])
    .filter(Boolean);
  const supplementalByKind = {};
  for (const kind of ['cost', 'payroll', 'supplies']) {
    supplementalByKind[kind] = source.parsed[kind].rows.filter((row) => missing.has(taskIdFromRow(row)));
  }

  writeCsv(
    path.join(tempDir, FILTERED_FILE_NAMES.summary),
    source.parsed.summary.headers,
    missingSummaryRows,
  );
  writeCsv(
    path.join(tempDir, FILTERED_FILE_NAMES.custom),
    source.parsed.custom.headers,
    missingCustomRows,
  );
  for (const kind of ['cost', 'payroll', 'supplies']) {
    writeCsv(
      path.join(tempDir, FILTERED_FILE_NAMES[kind]),
      source.parsed[kind].headers,
      supplementalByKind[kind],
    );
  }

  return {
    tempDir,
    rows: {
      summary: missingSummaryRows.length,
      custom: missingCustomRows.length,
      cost: supplementalByKind.cost.length,
      payroll: supplementalByKind.payroll.length,
      supplies: supplementalByKind.supplies.length,
    },
    customAligned: missingCustomRows.length === missingSummaryRows.length,
  };
}

function sampleRows(rows, limit = 15) {
  return rows.slice(0, limit).map((row) => ({
    taskId: taskIdFromRow(row),
    rowNumber: row.__rowNumber,
    property: clean(row.Property) || null,
    propertyId: clean(row['Property ID']) || null,
    propertyGroup: clean(row['Property Group']) || null,
    title: clean(row['Task title']) || null,
    status: clean(row.Status) || null,
    priority: clean(row.Priority) || null,
    dueDate: clean(row['Due date']) || null,
    completedDate: clean(row['Completed date']) || null,
    assignees: clean(row.Assignees) || null,
  }));
}

async function run(args) {
  const dir = path.resolve(args.dir);
  const source = readBundle(dir);
  const summaryHash = crypto.createHash('sha256').update(source.text.summary).digest('hex');
  const batchId = `reported-issues-missing-${summaryHash.slice(0, 12)}`;
  const uniqueTaskIds = [...new Set(source.parsed.summary.rows.map(taskIdFromRow).filter(Boolean))];
  const existingRefs = await loadExistingRefs(args.tenantId, uniqueTaskIds);
  const missingIds = uniqueTaskIds.filter((taskId) => !existingRefs.has(`breezeway:${taskId}`));
  const missingSet = new Set(missingIds);
  const missingRows = source.parsed.summary.rows.filter((row) => missingSet.has(taskIdFromRow(row)));
  const filtered = buildFilteredBundle(source, missingIds, batchId);

  if (!filtered.customAligned) {
    throw new Error(`Filtered custom export row count ${filtered.rows.custom} does not match summary row count ${filtered.rows.summary}`);
  }

  const common = {
    db: pool,
    tenantId: args.tenantId,
    directory: filtered.tempDir,
    importBatchId: batchId,
    skipPolicy: false,
  };
  const importResult = args.apply
    ? await applyBreezewayBundle(common)
    : (await previewBreezewayBundle(common)).report;

  const report = {
    mode: args.apply ? 'apply' : 'preview',
    tenantId: args.tenantId,
    sourceDirectory: dir,
    sourceFiles: Object.fromEntries(Object.entries(source.files).map(([kind, filePath]) => [kind, filePath])),
    batchId,
    sourceSummarySha256: summaryHash,
    totalCsvRows: source.parsed.summary.rows.length,
    uniqueTaskIds: uniqueTaskIds.length,
    duplicateTaskIds: duplicateTaskIds(source.parsed.summary.rows).slice(0, 25),
    duplicateTaskIdsTruncated: Math.max(0, duplicateTaskIds(source.parsed.summary.rows).length - 25),
    existingTasks: existingRefs.size,
    missingTasks: missingIds.length,
    missingTaskIdSamples: missingIds.slice(0, 25),
    missingBreakdown: {
      status: countBy(missingRows.map((row) => row.Status)),
      property: countBy(missingRows.map((row) => row.Property)).slice(0, 25),
      propertyGroup: countBy(missingRows.map((row) => row['Property Group'])).slice(0, 25),
    },
    missingSamples: sampleRows(missingRows),
    filteredBundle: {
      directory: filtered.tempDir,
      rows: filtered.rows,
      customAligned: filtered.customAligned,
      keepTemp: args.keepTemp,
    },
    importReport: importResult,
  };

  if (!args.keepTemp) {
    fs.rmSync(filtered.tempDir, { recursive: true, force: true });
    report.filteredBundle.removed = true;
  }

  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await run(args);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) {
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(path.resolve(args.out), json);
    console.log(`Wrote missing Breezeway reported-issues ${report.mode} report to ${path.resolve(args.out)}`);
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
