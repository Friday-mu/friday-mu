#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../src/database/client');
const { parseCsv, previewBreezewayCsv } = require('../src/tasks/breezewayImport');

const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';

const FILES = {
  summary: 'breezeway-task-summary-export.csv',
  custom: 'breezeway-task-custom-export.csv',
  cost: 'breezeway-task-cost-export.csv',
  payroll: 'breezeway-task-payroll-export.csv',
  supplies: 'breezeway-task-supplies-export.csv',
};

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage:
  node backend/scripts/breezeway-task-bundle-preview.js --dir <export-dir> [--out report.json]
    [--tenant-id <uuid>] [--property-map map.json] [--user-map map.json] [--no-db]

Preview-only report for the multi-file Breezeway Operations export bundle. It does not write tasks.`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = { tenantId: DEFAULT_TENANT_ID, useDb: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--dir') args.dir = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--tenant-id') args.tenantId = argv[++i];
    else if (arg === '--property-map') args.propertyMapPath = argv[++i];
    else if (arg === '--user-map') args.userMapPath = argv[++i];
    else if (arg === '--no-db') args.useDb = false;
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

function topCount(entries, limit = 25) {
  return [...entries.values()]
    .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)))
    .slice(0, limit);
}

function countPush(map, value, rowNumber) {
  const key = String(value || '(empty)').trim() || '(empty)';
  const entry = map.get(key) || { value: key, count: 0, rows: [] };
  entry.count += 1;
  if (entry.rows.length < 10) entry.rows.push(rowNumber);
  map.set(key, entry);
}

function compactPreview(report) {
  return {
    fileName: report.fileName,
    totalRows: report.totalRows,
    validRows: report.validRows,
    insertableRows: report.insertableRows,
    duplicates: report.duplicates,
    unknownProperties: report.unknownProperties,
    unknownAssignees: report.unknownAssignees,
    unknownStatuses: report.unknownStatuses,
    unknownPriorities: report.unknownPriorities,
    unknownDepartments: report.unknownDepartments,
    emptyCriticalFields: report.emptyCriticalFields.slice(0, 50),
    skippedRows: report.skippedRows.slice(0, 50),
    skippedRowsTruncated: Math.max(0, report.skippedRows.length - 50),
    sensitiveRedactionCount: report.sensitiveRedactions.length,
    formulaEscapeCount: report.formulaEscapes.length,
    sampleTransformedRecords: report.sampleTransformedRecords,
  };
}

function taskId(row) {
  return String(row['Task ID'] || '').trim();
}

function indexByTaskId(rows) {
  const byTaskId = new Map();
  for (const row of rows) {
    const id = taskId(row);
    if (!id) continue;
    const list = byTaskId.get(id) || [];
    list.push(row);
    byTaskId.set(id, list);
  }
  return byTaskId;
}

function nonEmpty(row, fields) {
  return fields.some((field) => String(row[field] || '').trim().length > 0);
}

function supplementalLineCount(kind, rows) {
  if (kind === 'cost') {
    return rows.filter((row) => nonEmpty(row, [
      'Cost type',
      'Cost description',
      'Cost amount',
      'Cost bill to',
      'Supply ID',
      'Supply name',
      'Supply quantity',
      'Supply price',
      'Supply bill to',
    ])).length;
  }
  if (kind === 'payroll') {
    return rows.filter((row) => nonEmpty(row, [
      'Assignee',
      'Employee ID',
      'Rate paid',
      'Rate type',
      'Default rate',
      'Estimated time',
      'Total time',
    ])).length;
  }
  if (kind === 'supplies') {
    return rows.filter((row) => nonEmpty(row, [
      'Supply ID',
      'Supply name',
      'Supply quantity',
      'Supply unit cost',
      'Supply total cost',
      'Supply total charge',
    ])).length;
  }
  return 0;
}

function analyzeTaskIdFile({ kind, parsed, summaryByTaskId }) {
  const ids = parsed.rows.map(taskId).filter(Boolean);
  const unique = new Set(ids);
  const duplicates = new Map();
  const missingFromSummary = [];
  const statusMismatches = [];

  for (const row of parsed.rows) {
    const id = taskId(row);
    if (!id) continue;
    if (ids.indexOf(id) !== ids.lastIndexOf(id)) countPush(duplicates, id, row.__rowNumber);
    const summaryRows = summaryByTaskId.get(id);
    if (!summaryRows) {
      if (missingFromSummary.length < 25) missingFromSummary.push({ taskId: id, rowNumber: row.__rowNumber });
      continue;
    }
    if (row.Status && summaryRows[0].Status && row.Status !== summaryRows[0].Status && statusMismatches.length < 25) {
      statusMismatches.push({
        taskId: id,
        rowNumber: row.__rowNumber,
        supplementalStatus: row.Status,
        summaryStatus: summaryRows[0].Status,
      });
    }
  }

  let summaryMissingCount = 0;
  const summaryMissingSamples = [];
  for (const id of summaryByTaskId.keys()) {
    if (!unique.has(id)) {
      summaryMissingCount += 1;
      if (summaryMissingSamples.length < 25) summaryMissingSamples.push(id);
    }
  }

  return {
    rows: parsed.rows.length,
    headers: parsed.headers,
    taskIdRows: ids.length,
    uniqueTaskIds: unique.size,
    missingTaskIdRows: parsed.rows.length - ids.length,
    duplicateTaskRows: ids.length - unique.size,
    duplicateTaskIds: topCount(duplicates),
    taskIdsMissingFromSummaryCount: [...unique].filter((id) => !summaryByTaskId.has(id)).length,
    taskIdsMissingFromSummarySamples: missingFromSummary,
    summaryTaskIdsMissingFromFileCount: summaryMissingCount,
    summaryTaskIdsMissingFromFileSamples: summaryMissingSamples,
    supplementalLineRows: supplementalLineCount(kind, parsed.rows),
    statusMismatchSamples: statusMismatches,
  };
}

function analyzeCustomFile(parsed) {
  return {
    rows: parsed.rows.length,
    headers: parsed.headers,
    joinable: false,
    reason: 'custom_export_has_no_task_id_column',
    taskReportLinkRows: parsed.rows.filter((row) => String(row['Task report link'] || '').trim()).length,
    note: 'Do not join this file heuristically for apply mode. Re-export with Task ID if these custom fields are required.',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dir) usage(1);

  const dir = path.resolve(args.dir);
  const propertyMap = readJsonMap(args.propertyMapPath);
  const userMap = readJsonMap(args.userMapPath);
  const paths = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, path.join(dir, file)]));

  for (const [key, file] of Object.entries(paths)) {
    if (!fs.existsSync(file)) throw new Error(`Missing ${key} export: ${file}`);
  }

  const parsed = Object.fromEntries(Object.entries(paths).map(([key, file]) => [
    key,
    parseCsv(fs.readFileSync(file, 'utf8')),
  ]));

  const summaryCsvText = fs.readFileSync(paths.summary, 'utf8');
  const { report: summaryPreview } = await previewBreezewayCsv({
    csvText: summaryCsvText,
    fileName: FILES.summary,
    propertyMap,
    userMap,
    tenantId: args.tenantId,
    db: args.useDb && process.env.DATABASE_URL ? pool : null,
  });

  const summaryByTaskId = indexByTaskId(parsed.summary.rows);
  const report = {
    generatedAt: new Date().toISOString(),
    sourceDirectory: dir,
    tenantId: args.tenantId,
    mode: 'preview_only',
    files: Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, {
      path: file,
      rows: parsed[key].rows.length,
      headers: parsed[key].headers,
    }])),
    summaryTaskPreview: compactPreview(summaryPreview),
    supplementalJoinPreview: {
      cost: analyzeTaskIdFile({ kind: 'cost', parsed: parsed.cost, summaryByTaskId }),
      payroll: analyzeTaskIdFile({ kind: 'payroll', parsed: parsed.payroll, summaryByTaskId }),
      supplies: analyzeTaskIdFile({ kind: 'supplies', parsed: parsed.supplies, summaryByTaskId }),
      custom: analyzeCustomFile(parsed.custom),
    },
    applyReadiness: {
      readyToApply: false,
      blockers: [
        'review_unknown_properties_and_assignees',
        'supplemental_cost_payroll_supply_apply_not_implemented_yet',
        'custom_export_has_no_task_id_column',
      ],
      recommendation: 'Use summary export as the base task import only after property/user mappings are accepted. Treat cost/payroll/supply imports as follow-up child-row migrations joined by Task ID.',
    },
  };

  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) {
    fs.writeFileSync(path.resolve(args.out), json);
    console.log(`Wrote Breezeway bundle preview report to ${path.resolve(args.out)}`);
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
