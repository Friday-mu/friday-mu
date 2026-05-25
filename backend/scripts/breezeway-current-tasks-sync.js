#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../src/database/client');
const {
  TOKEN_CACHE,
  apiGet,
  breezewayToken,
  summarizeApiTask,
} = require('../src/tasks/breezewayEnrichment');

const TENANT_ID = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SENSITIVE_TEXT_RE = /\b(wi-?fi|password|passcode|lock\s*box|lockbox|gate\s+code|access\s+code|key\s*safe|keysafe|pin\s+code)\b/i;
const SKIP_PROPERTY_RE = /^(office\s*\/\s*store\s*\/\s*admin|grand baie heights)$/i;

const STATUS_MAP = new Map([
  ['drafted', 'scheduled'],
  ['created', 'scheduled'],
  ['new', 'scheduled'],
  ['not started', 'scheduled'],
  ['assigned', 'scheduled'],
  ['scheduled', 'scheduled'],
  ['started', 'in_progress'],
  ['in progress', 'in_progress'],
  ['in_progress', 'in_progress'],
  ['paused', 'paused'],
  ['blocked', 'blocked'],
  ['finished', 'completed'],
  ['complete', 'completed'],
  ['completed', 'completed'],
  ['closed', 'closed'],
  ['cancelled', 'cancelled'],
  ['canceled', 'cancelled'],
]);

const PRIORITY_MAP = new Map([
  ['lowest', 'lowest'],
  ['low', 'low'],
  ['watch', 'low'],
  ['medium', 'medium'],
  ['normal', 'medium'],
  ['high', 'high'],
  ['urgent', 'urgent'],
  ['emergency', 'urgent'],
]);

const DEPARTMENT_MAP = new Map([
  ['cleaning', 'cleaning'],
  ['housekeeping', 'cleaning'],
  ['inspection', 'inspection'],
  ['maintenance', 'maintenance'],
  ['safety', 'maintenance'],
  ['office', 'office'],
  ['admin', 'office'],
  ['administration', 'office'],
]);

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage:
  node backend/scripts/breezeway-current-tasks-sync.js [--mode preview|apply]
    [--tenant-id <uuid>] [--property-limit 50] [--per-property-limit 20]
    [--out report.json] [--use-keychain] [--include-closed] [--confirm]

Fetches current Breezeway task lists from the API and imports missing tasks as
source=breezeway rows. Preview is read-only. Apply requires --confirm and
DATABASE_URL. The script does not print secrets or raw access-like values.`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    mode: 'preview',
    tenantId: TENANT_ID,
    propertyLimit: 50,
    perPropertyLimit: 20,
    useKeychain: false,
    includeClosed: false,
    confirm: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--mode') args.mode = argv[++i];
    else if (arg === '--tenant-id') args.tenantId = argv[++i];
    else if (arg === '--property-limit') args.propertyLimit = Number(argv[++i]);
    else if (arg === '--per-property-limit') args.perPropertyLimit = Number(argv[++i]);
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--use-keychain') args.useKeychain = true;
    else if (arg === '--include-closed') args.includeClosed = true;
    else if (arg === '--confirm') args.confirm = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!['preview', 'apply'].includes(args.mode)) throw new Error('--mode must be preview or apply');
  if (args.mode === 'apply' && !args.confirm) throw new Error('Apply mode requires --confirm');
  if (args.mode === 'apply' && !process.env.DATABASE_URL) throw new Error('Apply mode requires DATABASE_URL');
  if (!UUID_RE.test(args.tenantId)) throw new Error('--tenant-id must be a UUID');
  return args;
}

function key(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function slug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function cleanText(value, fallback = '') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  if (SENSITIVE_TEXT_RE.test(text)) return '[redacted operational access detail]';
  return text.replace(/^[=+\-@\t\r\n]/, "'");
}

function propertyLabel(property) {
  return String(
    property.name
    || property.nickname
    || property.reference_property_id
    || property.reference_external_property_id
    || property.id
    || '',
  ).trim();
}

function propertyCodeFrom(property, knownCodes) {
  const candidates = [
    property.name,
    property.nickname,
    property.reference_property_id,
    property.reference_external_property_id,
    property.internal_id,
  ].map((value) => String(value || '').trim()).filter(Boolean);
  for (const candidate of candidates) {
    if (SKIP_PROPERTY_RE.test(candidate)) return null;
    const upper = candidate.toUpperCase();
    if (knownCodes.has(upper)) return upper;
  }
  for (const candidate of candidates) {
    const match = candidate.toUpperCase().match(/\b[A-Z]{2,4}-[A-Z0-9]+\b/);
    if (match) return match[0];
  }
  return null;
}

function mappedStatus(summary) {
  return STATUS_MAP.get(key(summary.status?.code || summary.status?.name)) || 'scheduled';
}

function mappedPriority(summary) {
  return PRIORITY_MAP.get(key(summary.priority?.code || summary.priority?.name)) || 'medium';
}

function mappedDepartment(summary) {
  const raw = summary.department?.code || summary.department?.name || '';
  return DEPARTMENT_MAP.get(key(raw)) || null;
}

function mappedSubdepartment(summary) {
  return slug(summary.subdepartment || '') || null;
}

async function loadKnownPropertyCodes(db, tenantId) {
  const codes = new Set();
  const queries = [
    `SELECT DISTINCT property_code AS code FROM tasks WHERE tenant_id = $1 AND property_code IS NOT NULL`,
    `SELECT code FROM properties WHERE tenant_id = $1 AND code IS NOT NULL`,
  ];
  for (const sql of queries) {
    try {
      const { rows } = await db.query(sql, [tenantId]);
      rows.forEach((row) => {
        if (row.code) codes.add(String(row.code).trim().toUpperCase());
      });
    } catch (_) {
      // Some environments do not have the native properties overlay yet.
    }
  }
  return codes;
}

async function loadStaffUserMap(db, tenantId) {
  const map = new Map();
  const { rows } = await db.query(
    `SELECT name, user_id
       FROM hr_staff
      WHERE tenant_id = $1
        AND status = 'active'
        AND user_id IS NOT NULL`,
    [tenantId],
  ).catch(() => ({ rows: [] }));
  for (const row of rows) {
    if (row.name && row.user_id) map.set(key(row.name), row.user_id);
  }
  return map;
}

async function loadExistingRefs(db, tenantId, refs) {
  if (refs.length === 0) return new Set();
  const { rows } = await db.query(
    `SELECT external_ref
       FROM tasks
      WHERE tenant_id = $1
        AND external_ref = ANY($2)
        AND status <> 'cancelled'`,
    [tenantId, refs],
  );
  return new Set(rows.map((row) => row.external_ref));
}

async function listProperties(token, limit) {
  const properties = [];
  for (let page = 1; page <= 20 && properties.length < limit; page += 1) {
    const data = await apiGet(token, '/public/inventory/v1/property', { limit: 100, page });
    const batch = Array.isArray(data) ? data : (data.results || data.data || []);
    properties.push(...batch);
    const pages = Number(data.total_pages || data.pages || data.num_pages || 1);
    if (page >= pages) break;
  }
  return properties
    .filter((property) => (property.active ?? property.is_active ?? true) !== false)
    .slice(0, limit);
}

async function listTasksForProperty(token, property, limit) {
  const homeId = property.id || property.home_id;
  if (!homeId) return [];
  const data = await apiGet(token, '/public/inventory/v1/task/', { home_id: homeId, limit });
  return Array.isArray(data) ? data : (data.results || data.data || data.tasks || []);
}

function transformTask(apiTask, property, propertyCode, staffMap, importBatchId) {
  const summary = summarizeApiTask(apiTask);
  if (!summary.taskId) return { skipped: true, reason: 'missing_task_id' };
  const status = mappedStatus(summary);
  const title = cleanText(summary.name || summary.summary?.note || summary.description, `Breezeway task ${summary.taskId}`);
  const descriptionParts = [
    cleanText(summary.description),
    summary.summary?.note ? `Summary: ${cleanText(summary.summary.note)}` : '',
    `Imported from Breezeway API task ${summary.taskId}.`,
  ].filter(Boolean);
  const assigneeIds = summary.assignments
    .map((assignment) => staffMap.get(key(assignment.name)))
    .filter((id, index, ids) => id && ids.indexOf(id) === index);

  return {
    taskId: summary.taskId,
    externalRef: `breezeway:${summary.taskId}`,
    bzId: summary.taskId,
    title,
    description: descriptionParts.join('\n\n'),
    status,
    priority: mappedPriority(summary),
    department: mappedDepartment(summary),
    subdepartment: mappedSubdepartment(summary),
    propertyCode,
    assigneeUserIds: assigneeIds,
    dueDate: summary.scheduledDate,
    dueTime: summary.scheduledTime ? String(summary.scheduledTime).slice(0, 5) : null,
    estimatedMinutes: null,
    spentMinutes: summary.totalMinutes,
    completedAt: status === 'completed' || status === 'closed' ? (summary.finishedAt || summary.updatedAt) : null,
    sourceCreatedAt: summary.createdAt,
    sourceUpdatedAt: summary.updatedAt,
    sourceStartedAt: summary.startedAt,
    sourceDueAt: null,
    sourceCompletedAt: summary.finishedAt,
    attachmentCount: summary.photos.length,
    tags: [
      'breezeway-api-sync',
      `breezeway-status:${slug(summary.status?.code || summary.status?.name || status)}`,
      ...summary.tags,
      ...summary.taskTags.map((tag) => tag.name).filter(Boolean),
    ].filter(Boolean),
    sourcePayload: {
      provider: 'breezeway',
      importBatchId,
      taskId: summary.taskId,
      externalRef: `breezeway:${summary.taskId}`,
      originalStatus: summary.status,
      originalPriority: summary.priority,
      property: {
        name: propertyLabel(property),
        breezewayId: String(property.id || property.home_id || ''),
        referencePropertyId: property.reference_property_id || null,
        referenceExternalPropertyId: property.reference_external_property_id || null,
        resolvedCode: propertyCode,
      },
      people: {
        assignees: summary.assignments.map((assignment) => assignment.name).filter(Boolean),
        unresolvedAssignees: summary.assignments
          .filter((assignment) => assignment.name && !staffMap.has(key(assignment.name)))
          .map((assignment) => ({ name: assignment.name, assigneeId: assignment.assigneeId || assignment.id })),
      },
      time: {
        sourceCreatedAt: summary.createdAt,
        sourceUpdatedAt: summary.updatedAt,
        sourceStartedAt: summary.startedAt,
        sourceCompletedAt: summary.finishedAt,
      },
      apiEnrichment: {
        provider: 'breezeway',
        fetchedAt: new Date().toISOString(),
        reportUrl: summary.reportUrl,
        assignments: summary.assignments,
        photos: summary.photos,
        photoCount: summary.photos.length,
        comments: summary.comments,
        commentsCount: summary.comments.length,
        costs: summary.costs,
        costsCount: summary.costs.length,
        supplies: summary.supplies,
        suppliesCount: summary.supplies.length,
      },
    },
    sample: {
      externalRef: `breezeway:${summary.taskId}`,
      title,
      propertyCode,
      status,
      priority: mappedPriority(summary),
      dueDate: summary.scheduledDate,
      dueTime: summary.scheduledTime ? String(summary.scheduledTime).slice(0, 5) : null,
      assigneeCount: assigneeIds.length,
    },
  };
}

async function insertRecord(client, tenantId, record) {
  const { rows } = await client.query(
    `INSERT INTO tasks (
       tenant_id, bz_id, external_ref, title, description,
       status, priority, source, visibility,
       department, subdepartment, property_code,
       assignee_user_id, assignee_user_ids,
       due_date, due_time, estimated_minutes, spent_minutes,
       is_recurring, template, awaiting_human_approval, tags,
       import_batch_id, source_payload,
       source_created_at, source_updated_at, source_started_at,
       source_due_at, source_completed_at, completed_at, attachment_count
     )
     VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, 'breezeway', 'team',
       $8, $9, $10,
       $11, $12,
       $13, $14, $15, $16,
       FALSE, NULL, FALSE, $17,
       $18, $19::jsonb,
       $20, $21, $22,
       $23, $24, $25, $26
     )
     ON CONFLICT (tenant_id, external_ref)
       WHERE external_ref IS NOT NULL AND status <> 'cancelled'
     DO NOTHING
     RETURNING id`,
    [
      tenantId,
      record.bzId,
      record.externalRef,
      record.title,
      record.description || null,
      record.status,
      record.priority,
      record.department,
      record.subdepartment,
      record.propertyCode,
      record.assigneeUserIds[0] || null,
      record.assigneeUserIds,
      record.dueDate,
      record.dueTime,
      record.estimatedMinutes,
      record.spentMinutes,
      record.tags,
      record.sourcePayload.importBatchId,
      JSON.stringify(record.sourcePayload),
      record.sourceCreatedAt,
      record.sourceUpdatedAt,
      record.sourceStartedAt,
      record.sourceDueAt,
      record.sourceCompletedAt,
      record.completedAt,
      record.attachmentCount,
    ],
  );
  return rows.length > 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const importBatchId = `breezeway-api-${startedAt.replace(/[:.]/g, '-')}`;
  const token = await breezewayToken({ useKeychain: args.useKeychain, tokenCachePath: TOKEN_CACHE });
  const [knownCodes, staffMap] = await Promise.all([
    loadKnownPropertyCodes(pool, args.tenantId),
    loadStaffUserMap(pool, args.tenantId),
  ]);
  const properties = await listProperties(token, args.propertyLimit);
  const skipped = [];
  const records = [];
  const apiErrors = [];

  for (const property of properties) {
    const propertyCode = propertyCodeFrom(property, knownCodes);
    if (!propertyCode) {
      skipped.push({ property: propertyLabel(property), reason: 'unmapped_property' });
      continue;
    }
    try {
      const tasks = await listTasksForProperty(token, property, args.perPropertyLimit);
      for (const task of tasks) {
        const transformed = transformTask(task, property, propertyCode, staffMap, importBatchId);
        if (transformed.skipped) {
          skipped.push({ property: propertyCode, reason: transformed.reason });
          continue;
        }
        if (!args.includeClosed && ['completed', 'closed', 'cancelled'].includes(transformed.status)) continue;
        records.push(transformed);
      }
    } catch (error) {
      apiErrors.push({ property: propertyLabel(property), error: error.message, status: error.status || null });
    }
  }

  const unique = [];
  const seen = new Set();
  for (const record of records.sort((a, b) => String(b.sourceUpdatedAt || b.sourceCreatedAt || '').localeCompare(String(a.sourceUpdatedAt || a.sourceCreatedAt || '')))) {
    if (seen.has(record.externalRef)) continue;
    seen.add(record.externalRef);
    unique.push(record);
  }
  const existing = await loadExistingRefs(pool, args.tenantId, unique.map((record) => record.externalRef));
  const missing = unique.filter((record) => !existing.has(record.externalRef));

  const report = {
    generatedAt: new Date().toISOString(),
    mode: args.mode,
    source: 'breezeway_api_current_tasks',
    tenantId: args.tenantId,
    propertyLimit: args.propertyLimit,
    perPropertyLimit: args.perPropertyLimit,
    propertiesScanned: properties.length,
    recordsScanned: unique.length,
    existing: existing.size,
    missing: missing.length,
    skipped: skipped.slice(0, 50),
    apiErrors,
    sampleMissing: missing.slice(0, 30).map((record) => record.sample),
    apply: null,
    notes: [
      'Preview/apply imports missing current Breezeway API tasks only.',
      'Closed/completed/cancelled tasks are skipped unless --include-closed is passed.',
      'No raw API credentials are included. Access-like text is redacted from descriptions.',
    ],
  };

  if (args.mode === 'apply') {
    const client = await pool.connect();
    const apply = { inserted: 0, skippedExisting: existing.size, failed: 0, errors: [] };
    try {
      await client.query('BEGIN');
      for (const record of missing) {
        try {
          if (await insertRecord(client, args.tenantId, record)) apply.inserted += 1;
          else apply.skippedExisting += 1;
        } catch (error) {
          apply.failed += 1;
          apply.errors.push({ externalRef: record.externalRef, error: error.message });
        }
      }
      if (apply.failed > 0) throw new Error('One or more Breezeway API tasks failed to import.');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      error.report = { ...report, apply: { ...apply, rolledBack: true } };
      throw error;
    } finally {
      client.release();
    }
    report.apply = apply;
  }

  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) {
    fs.writeFileSync(path.resolve(args.out), json);
    console.log(`Wrote Breezeway current task ${args.mode} report to ${path.resolve(args.out)}`);
  } else {
    process.stdout.write(json);
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    if (error.report) process.stderr.write(`${JSON.stringify(error.report, null, 2)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
