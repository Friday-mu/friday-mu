#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../src/database/client');
const { parseCsv } = require('../src/tasks/breezewayImport');

const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MARKER_TAGS = ['reported_issue', 'reported_issue:accepted', 'breezeway:reported_issue'];

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage:
  node backend/scripts/mark-breezeway-reported-issues.js --dir <reported-issues-export-dir>
    [--tenant-id <uuid>] [--apply --confirm] [--out report.json]

Matches the Breezeway reported-issues summary export to existing
tasks.external_ref = breezeway:<Task ID> rows. Preview is read-only.
Apply mode only tags/marks existing tasks; it does not create tasks and does
not change lifecycle status or source provenance.`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    tenantId: DEFAULT_TENANT_ID,
    apply: false,
    confirm: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') usage(0);
    else if (arg === '--dir') args.dir = argv[++i];
    else if (arg === '--tenant-id') args.tenantId = argv[++i];
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--confirm') args.confirm = true;
    else if (arg === '--out') args.out = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.dir) throw new Error('--dir is required');
  if (!UUID_RE.test(args.tenantId)) throw new Error('--tenant-id must be a UUID');
  if (args.apply && !args.confirm) throw new Error('Apply mode requires --confirm');
  if (args.apply && !process.env.DATABASE_URL) throw new Error('Apply mode requires DATABASE_URL');
  return args;
}

function findSummaryFile(dir) {
  const files = fs.readdirSync(dir)
    .filter((name) => /^breezeway-task-summary-export.*\.csv$/i.test(name))
    .sort((a, b) => a.localeCompare(b));
  if (files.length === 0) throw new Error(`No Breezeway task summary export found in ${dir}`);
  return path.join(dir, files[0]);
}

function clean(value) {
  return String(value || '').trim();
}

function count(map, value) {
  const key = clean(value) || '(empty)';
  map.set(key, (map.get(key) || 0) + 1);
}

function asCounts(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

function taskId(row) {
  return clean(row['Task ID']);
}

function readExport(dir) {
  const summaryFile = findSummaryFile(dir);
  const text = fs.readFileSync(summaryFile, 'utf8');
  const parsed = parseCsv(text);
  const rowByTaskId = new Map();
  const duplicates = new Map();
  const missingTaskIdRows = [];
  const csvStatusCounts = new Map();

  for (const row of parsed.rows) {
    const id = taskId(row);
    count(csvStatusCounts, row.Status);
    if (!id) {
      missingTaskIdRows.push(row.__rowNumber);
      continue;
    }
    const existing = rowByTaskId.get(id);
    if (existing) {
      existing.rowNumbers.push(row.__rowNumber);
      duplicates.set(id, existing.rowNumbers);
    } else {
      rowByTaskId.set(id, {
        taskId: id,
        rowNumbers: [row.__rowNumber],
        property: clean(row.Property),
        propertyId: clean(row['Property ID']),
        propertyGroup: clean(row['Property Group']),
        title: clean(row['Task title']),
        status: clean(row.Status),
        priority: clean(row.Priority),
        createdDate: clean(row['Created date']),
        dueDate: clean(row['Due date']),
        completedDate: clean(row['Completed date']),
        requestedBy: clean(row['Requested by']),
      });
    }
  }

  return {
    summaryFile,
    parsed,
    textHash: crypto.createHash('sha256').update(text).digest('hex'),
    rowByTaskId,
    duplicates,
    missingTaskIdRows,
    csvStatusCounts,
  };
}

function isMarked(task) {
  const tags = new Set(task.tags || []);
  const payload = task.source_payload && typeof task.source_payload === 'object'
    ? task.source_payload
    : {};
  return tags.has('breezeway:reported_issue') && Boolean(payload.reportedIssue);
}

function sourceCounts(tasks) {
  const map = new Map();
  tasks.forEach((task) => count(map, task.source));
  return asCounts(map);
}

function statusCounts(tasks) {
  const map = new Map();
  tasks.forEach((task) => count(map, task.status));
  return asCounts(map);
}

function categoryCounts(tasks) {
  const map = new Map();
  tasks.forEach((task) => count(map, task.category));
  return asCounts(map);
}

function topValues(values, limit = 20) {
  const map = new Map();
  values.forEach((value) => count(map, value));
  return [...map.entries()]
    .map(([value, countValue]) => ({ value, count: countValue }))
    .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)))
    .slice(0, limit);
}

async function loadMatchedTasks(client, tenantId, externalRefs) {
  if (externalRefs.length === 0) return [];
  const { rows } = await client.query(
    `SELECT id, external_ref, bz_id, title, status, source, category, tags, source_payload
       FROM tasks
      WHERE tenant_id = $1
        AND external_ref = ANY($2)
      ORDER BY external_ref`,
    [tenantId, externalRefs],
  );
  return rows;
}

function buildMeta({ rowInfo, batchId, summaryFile }) {
  return {
    source: 'breezeway_reported_issues_export',
    status: 'accepted_existing_task',
    batchId,
    summaryFile: path.basename(summaryFile),
    taskId: rowInfo.taskId,
    rowNumbers: rowInfo.rowNumbers,
    property: rowInfo.property || null,
    propertyId: rowInfo.propertyId || null,
    title: rowInfo.title || null,
    exportStatus: rowInfo.status || null,
    exportPriority: rowInfo.priority || null,
    createdDate: rowInfo.createdDate || null,
    dueDate: rowInfo.dueDate || null,
    completedDate: rowInfo.completedDate || null,
    requestedBy: rowInfo.requestedBy || null,
    markedAt: new Date().toISOString(),
    version: 1,
  };
}

async function applyUpdate(client, tenantId, task, rowInfo, batchId, summaryFile) {
  const meta = buildMeta({ rowInfo, batchId, summaryFile });
  const { rowCount } = await client.query(
    `UPDATE tasks
        SET tags = ARRAY(
              SELECT DISTINCT tag
              FROM unnest(COALESCE(tags, '{}'::text[]) || $2::text[]) AS tag
              WHERE tag <> ''
              ORDER BY tag
            ),
            category = COALESCE(NULLIF(category, ''), 'reported_issue'),
            source_payload = jsonb_set(
              COALESCE(source_payload, '{}'::jsonb),
              '{reportedIssue}',
              $3::jsonb,
              true
            ),
            updated_at = NOW()
      WHERE tenant_id = $4
        AND id = $1`,
    [task.id, MARKER_TAGS, JSON.stringify(meta), tenantId],
  );
  return rowCount;
}

async function run(args) {
  const dir = path.resolve(args.dir);
  const exp = readExport(dir);
  const taskIds = [...exp.rowByTaskId.keys()];
  const externalRefs = taskIds.map((id) => `breezeway:${id}`);
  const batchId = `reported-issues-${exp.textHash.slice(0, 12)}`;
  const report = {
    mode: args.apply ? 'apply' : 'preview',
    tenantId: args.tenantId,
    sourceDirectory: dir,
    summaryFile: exp.summaryFile,
    batchId,
    csvRows: exp.parsed.rows.length,
    csvRowsMissingTaskId: exp.missingTaskIdRows.length,
    uniqueTaskIds: taskIds.length,
    duplicateTaskIds: [...exp.duplicates.entries()].slice(0, 25).map(([id, rows]) => ({ taskId: id, rowNumbers: rows })),
    duplicateTaskIdsTruncated: Math.max(0, exp.duplicates.size - 25),
    csvStatusCounts: asCounts(exp.csvStatusCounts),
    matchedTasks: 0,
    missingExistingTasks: 0,
    missingExistingTaskIdSamples: [],
    missingExistingBreakdown: {
      status: [],
      property: [],
      propertyGroup: [],
    },
    missingExistingSamples: [],
    alreadyMarked: 0,
    candidateUpdates: 0,
    appliedUpdates: 0,
    matchedStatusCounts: {},
    matchedSourceCounts: {},
    matchedCategoryCounts: {},
    sampleUpdates: [],
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const matched = await loadMatchedTasks(client, args.tenantId, externalRefs);
    const matchedRefs = new Set(matched.map((task) => task.external_ref));
    const missingIds = taskIds.filter((id) => !matchedRefs.has(`breezeway:${id}`));

    report.matchedTasks = matched.length;
    report.missingExistingTasks = missingIds.length;
    report.missingExistingTaskIdSamples = missingIds.slice(0, 25);
    const missingRows = missingIds.map((id) => exp.rowByTaskId.get(id)).filter(Boolean);
    report.missingExistingBreakdown = {
      status: topValues(missingRows.map((row) => row.status || '(empty)')),
      property: topValues(missingRows.map((row) => row.property || '(empty)')),
      propertyGroup: topValues(missingRows.map((row) => row.propertyGroup || '(empty)')),
    };
    report.missingExistingSamples = missingRows.slice(0, 15).map((row) => ({
      taskId: row.taskId,
      rowNumbers: row.rowNumbers,
      property: row.property,
      propertyId: row.propertyId,
      propertyGroup: row.propertyGroup,
      title: row.title,
      status: row.status,
      priority: row.priority,
      dueDate: row.dueDate,
      completedDate: row.completedDate,
    }));
    report.alreadyMarked = matched.filter(isMarked).length;
    report.matchedStatusCounts = statusCounts(matched);
    report.matchedSourceCounts = sourceCounts(matched);
    report.matchedCategoryCounts = categoryCounts(matched);

    const candidates = matched.filter((task) => !isMarked(task));
    report.candidateUpdates = candidates.length;
    report.sampleUpdates = candidates.slice(0, 15).map((task) => {
      const rowInfo = exp.rowByTaskId.get(String(task.external_ref || '').replace(/^breezeway:/, ''));
      return {
        id: task.id,
        externalRef: task.external_ref,
        title: task.title,
        status: task.status,
        source: task.source,
        category: task.category,
        addTags: MARKER_TAGS,
        exportRowNumbers: rowInfo?.rowNumbers || [],
      };
    });

    if (args.apply) {
      for (const task of candidates) {
        const id = String(task.external_ref || '').replace(/^breezeway:/, '');
        const rowInfo = exp.rowByTaskId.get(id);
        if (!rowInfo) continue;
        report.appliedUpdates += await applyUpdate(client, args.tenantId, task, rowInfo, batchId, exp.summaryFile);
      }
      await client.query('COMMIT');
    } else {
      await client.query('ROLLBACK');
    }
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
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
    console.log(`Wrote Breezeway reported-issues ${report.mode} report to ${path.resolve(args.out)}`);
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
