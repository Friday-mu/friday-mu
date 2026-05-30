#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../src/database/client');
const {
  TOKEN_CACHE,
  apiGet,
  breezewayToken,
  summarizeApiTask,
} = require('../src/tasks/breezewayEnrichment');

const TENANT_ID = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';
const BREEZEWAY_API_BASE = process.env.BREEZEWAY_BASE_URL || 'https://api.breezeway.io';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
    [--lookback-days 14] [--request-delay-ms 100] [--detail-timeout-ms 10000]
    [--detail-scope recent|all] [--out report.json] [--use-keychain] [--include-closed]
    [--no-fetch-details] [--allow-possible-duplicates] [--confirm]

Fetches current Breezeway task lists from the API and reconciles FAD
source=breezeway rows by external_ref=breezeway:<Task ID>. Preview is read-only.
Apply requires --confirm and DATABASE_URL. The script does not print secrets or
raw access-like values.`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    mode: 'preview',
    tenantId: TENANT_ID,
    propertyLimit: 50,
    perPropertyLimit: 20,
    lookbackDays: 14,
    requestDelayMs: 100,
    detailTimeoutMs: 10_000,
    detailScope: 'recent',
    useKeychain: false,
    fetchDetails: true,
    includeClosed: false,
    allowPossibleDuplicates: false,
    confirm: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--mode') args.mode = argv[++i];
    else if (arg === '--tenant-id') args.tenantId = argv[++i];
    else if (arg === '--property-limit') args.propertyLimit = Number(argv[++i]);
    else if (arg === '--per-property-limit') args.perPropertyLimit = Number(argv[++i]);
    else if (arg === '--lookback-days') args.lookbackDays = Number(argv[++i]);
    else if (arg === '--request-delay-ms') args.requestDelayMs = Number(argv[++i]);
    else if (arg === '--detail-timeout-ms') args.detailTimeoutMs = Number(argv[++i]);
    else if (arg === '--detail-scope') args.detailScope = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--use-keychain') args.useKeychain = true;
    else if (arg === '--no-fetch-details') args.fetchDetails = false;
    else if (arg === '--include-closed') args.includeClosed = true;
    else if (arg === '--allow-possible-duplicates') args.allowPossibleDuplicates = true;
    else if (arg === '--confirm') args.confirm = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!['preview', 'apply'].includes(args.mode)) throw new Error('--mode must be preview or apply');
  if (args.mode === 'apply' && !args.confirm) throw new Error('Apply mode requires --confirm');
  if (args.mode === 'apply' && !process.env.DATABASE_URL) throw new Error('Apply mode requires DATABASE_URL');
  if (!UUID_RE.test(args.tenantId)) throw new Error('--tenant-id must be a UUID');
  if (!Number.isFinite(args.lookbackDays) || args.lookbackDays < 0) throw new Error('--lookback-days must be a non-negative number');
  if (!Number.isFinite(args.requestDelayMs) || args.requestDelayMs < 0) throw new Error('--request-delay-ms must be a non-negative number');
  if (!Number.isFinite(args.detailTimeoutMs) || args.detailTimeoutMs < 1000) throw new Error('--detail-timeout-ms must be at least 1000');
  if (!['recent', 'all'].includes(args.detailScope)) throw new Error('--detail-scope must be recent or all');
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

function safeDisplayText(value, fallback = '') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  if (SENSITIVE_TEXT_RE.test(text)) return fallback;
  return text.replace(/^[=+\-@\t\r\n]/, "'");
}

function titleCase(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fallbackTitle(summary, propertyCode) {
  const department = safeDisplayText(
    summary.department?.name || summary.department?.code || summary.subdepartment,
    '',
  );
  const label = titleCase(department) || 'Operations';
  const suffix = propertyCode ? ` (${propertyCode})` : '';
  const taskSuffix = summary.taskId ? ` #${summary.taskId}` : '';
  return `${label} Breezeway task${suffix}${taskSuffix}`;
}

function taskTitle(summary, propertyCode) {
  const fallback = fallbackTitle(summary, propertyCode);
  return safeDisplayText(summary.name || summary.summary?.note || summary.description, fallback);
}

function isPlaceholderTitle(value) {
  const text = String(value || '').trim();
  return !text
    || /\[redacted/i.test(text)
    || /^imported from breezeway/i.test(text)
    || /^breezeway (api )?task\b/i.test(text)
    || /^breezeway protected task\b/i.test(text)
    || /^protected breezeway task\b/i.test(text);
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

async function loadExistingRows(db, tenantId, refs) {
  if (refs.length === 0) return new Map();
  const { rows } = await db.query(
    `SELECT id, tenant_id, bz_id, external_ref, title, description,
            status, priority, source, visibility,
            department, subdepartment, property_code,
            assignee_user_id, assignee_user_ids,
            due_date, due_time, estimated_minutes, spent_minutes,
            tags, import_batch_id, source_payload,
            source_created_at, source_updated_at, source_started_at,
            source_due_at, source_completed_at, completed_at, attachment_count,
            updated_at
       FROM tasks
      WHERE tenant_id = $1
        AND external_ref = ANY($2)`,
    [tenantId, refs],
  );
  return new Map(rows.map((row) => [row.external_ref, row]));
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
  const title = taskTitle(summary, propertyCode);
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

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const text = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

function normalizeTime(value) {
  if (!value) return null;
  return String(value).trim().slice(0, 5) || null;
}

function normalizeTimestamp(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sortedStrings(values) {
  return Array.isArray(values)
    ? values.map((value) => String(value)).filter(Boolean).sort()
    : [];
}

function arraysEqual(a, b) {
  const left = sortedStrings(a);
  const right = sortedStrings(b);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function mergeTags(existing, incoming) {
  return [...new Set([
    ...sortedStrings(existing),
    ...sortedStrings(incoming),
  ])].sort();
}

function cloneJson(value) {
  if (!value || typeof value !== 'object') return {};
  return JSON.parse(JSON.stringify(value));
}

function comparablePayload(value) {
  const payload = cloneJson(value);
  delete payload.importBatchId;
  delete payload.lastApiSyncBatchId;
  delete payload.lastApiSyncAt;
  if (payload.apiEnrichment && typeof payload.apiEnrichment === 'object') {
    delete payload.apiEnrichment.fetchedAt;
  }
  return payload;
}

function payloadsEqual(a, b) {
  return JSON.stringify(comparablePayload(a)) === JSON.stringify(comparablePayload(b));
}

function mergeSourcePayload(existingPayload, record) {
  const existing = cloneJson(existingPayload);
  const next = {
    ...existing,
    provider: 'breezeway',
    taskId: record.taskId,
    externalRef: record.externalRef,
    originalStatus: record.sourcePayload.originalStatus,
    originalPriority: record.sourcePayload.originalPriority,
    property: record.sourcePayload.property,
    people: record.sourcePayload.people,
    time: record.sourcePayload.time,
    apiEnrichment: record.sourcePayload.apiEnrichment,
    lastApiSyncBatchId: record.sourcePayload.importBatchId,
    lastApiSyncAt: record.sourcePayload.apiEnrichment?.fetchedAt || new Date().toISOString(),
  };
  next.importBatchId = existing.importBatchId || record.sourcePayload.importBatchId;
  return next;
}

function isMeaningfulChange(current, next) {
  return (current ?? null) !== (next ?? null);
}

function addSet(patch, column, value, cast = '') {
  patch.sets.push({ column, value, cast });
}

function buildUpdatePatch(existing, record) {
  const patch = { sets: [], diff: {}, titleRepair: false };
  const note = (field, from, to) => {
    patch.diff[field] = { from: from ?? null, to: to ?? null };
  };

  const scalarFields = [
    ['bz_id', record.bzId],
    ['status', record.status],
    ['priority', record.priority],
    ['department', record.department],
    ['subdepartment', record.subdepartment],
    ['property_code', record.propertyCode],
    ['assignee_user_id', record.assigneeUserIds[0] || null],
    ['spent_minutes', record.spentMinutes],
    ['attachment_count', record.attachmentCount],
  ];
  for (const [column, value] of scalarFields) {
    if (isMeaningfulChange(existing[column], value)) {
      addSet(patch, column, value);
      note(column, existing[column], value);
    }
  }

  if (isPlaceholderTitle(existing.title) && existing.title !== record.title) {
    addSet(patch, 'title', record.title);
    patch.titleRepair = true;
    note('title', existing.title, record.title);
  }

  const nextDueDate = normalizeDate(record.dueDate);
  if (normalizeDate(existing.due_date) !== nextDueDate) {
    addSet(patch, 'due_date', nextDueDate, '::date');
    note('due_date', normalizeDate(existing.due_date), nextDueDate);
  }

  const nextDueTime = normalizeTime(record.dueTime);
  if (normalizeTime(existing.due_time) !== nextDueTime) {
    addSet(patch, 'due_time', nextDueTime);
    note('due_time', normalizeTime(existing.due_time), nextDueTime);
  }

  if (!arraysEqual(existing.assignee_user_ids || [], record.assigneeUserIds || [])) {
    addSet(patch, 'assignee_user_ids', record.assigneeUserIds || [], '::uuid[]');
    note('assignee_user_ids', sortedStrings(existing.assignee_user_ids || []), sortedStrings(record.assigneeUserIds || []));
  }

  const nextTags = mergeTags(existing.tags, record.tags);
  if (!arraysEqual(existing.tags || [], nextTags)) {
    addSet(patch, 'tags', nextTags, '::text[]');
    note('tags', sortedStrings(existing.tags || []), nextTags);
  }

  const timestampFields = [
    ['source_created_at', record.sourceCreatedAt, false],
    ['source_updated_at', record.sourceUpdatedAt, false],
    ['source_started_at', record.sourceStartedAt, true],
    ['source_completed_at', record.sourceCompletedAt, true],
    ['completed_at', record.completedAt, true],
  ];
  for (const [column, value, allowClear] of timestampFields) {
    const next = normalizeTimestamp(value);
    if (next == null && !allowClear) continue;
    if (normalizeTimestamp(existing[column]) !== next) {
      addSet(patch, column, next, '::timestamptz');
      note(column, normalizeTimestamp(existing[column]), next);
    }
  }

  const hasOperationalChange = patch.sets.length > 0;
  const nextPayload = mergeSourcePayload(existing.source_payload, record);
  if ((record.detailFetched || hasOperationalChange || !existing.source_payload?.apiEnrichment)
    && !payloadsEqual(existing.source_payload, nextPayload)) {
    addSet(patch, 'source_payload', JSON.stringify(nextPayload), '::jsonb');
    patch.diff.source_payload = { changed: true };
  }

  return patch;
}

async function updateRecord(client, existing, record, patch) {
  if (patch.sets.length === 0) return false;
  const params = [];
  const assignments = patch.sets.map(({ column, value, cast }) => {
    params.push(value);
    return `${column} = $${params.length}${cast}`;
  });
  params.push(existing.id, existing.tenant_id);
  const idIndex = params.length - 1;
  const tenantIndex = params.length;
  const { rowCount } = await client.query(
    `UPDATE tasks
        SET ${assignments.join(', ')},
            updated_at = NOW()
      WHERE id = $${idIndex}
        AND tenant_id = $${tenantIndex}`,
    params,
  );
  return rowCount > 0;
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
  return rows[0]?.id || null;
}

function cutoffDate(days) {
  return new Date(Date.now() - (Number(days) || 0) * 24 * 60 * 60 * 1000);
}

function recordWithinLookback(record, cutoff) {
  const values = [
    record.sourceUpdatedAt,
    record.sourceCreatedAt,
    record.sourceStartedAt,
    record.sourceCompletedAt,
    record.dueDate,
  ];
  return values.some((value) => {
    const normalized = normalizeTimestamp(value) || (normalizeDate(value) ? `${normalizeDate(value)}T00:00:00.000Z` : null);
    return normalized && new Date(normalized).getTime() >= cutoff.getTime();
  });
}

function sourceTouchedWithinLookback(record, cutoff) {
  const values = [
    record.sourceUpdatedAt,
    record.sourceCreatedAt,
    record.sourceStartedAt,
    record.sourceCompletedAt,
  ];
  return values.some((value) => {
    const normalized = normalizeTimestamp(value);
    return normalized && new Date(normalized).getTime() >= cutoff.getTime();
  });
}

function recentComments(record, cutoff) {
  const comments = record.sourcePayload?.apiEnrichment?.comments || [];
  return comments.filter((comment) => {
    if (!comment?.comment) return false;
    const createdAt = normalizeTimestamp(comment.createdAt);
    return !createdAt || new Date(createdAt).getTime() >= cutoff.getTime();
  });
}

function commentAuthorLabel(value) {
  if (!value) return '';
  if (typeof value === 'string') return safeDisplayText(value, '');
  if (typeof value === 'object') {
    return safeDisplayText(value.name || value.full_name || value.email || value.id, '');
  }
  return '';
}

function commentMarker(comment) {
  const id = comment?.id || crypto
    .createHash('sha1')
    .update(`${comment?.createdAt || ''}|${comment?.comment || ''}`)
    .digest('hex')
    .slice(0, 12);
  return `[Breezeway comment ${id}]`;
}

function formatBreezewayComment(comment) {
  const body = cleanText(comment?.comment, '');
  if (!body) return null;
  const author = commentAuthorLabel(comment?.commentBy);
  const marker = commentMarker(comment);
  return `${marker}${author ? ` ${author}:` : ''} ${body}`.trim();
}

async function syncRecentComments(client, tenantId, taskId, record, cutoff) {
  const result = { inserted: 0, skipped: 0 };
  for (const comment of recentComments(record, cutoff)) {
    const text = formatBreezewayComment(comment);
    if (!text) {
      result.skipped += 1;
      continue;
    }
    const { rowCount } = await client.query(
      `INSERT INTO task_comments (task_id, tenant_id, author_user_id, text, synced_to_breezeway, created_at)
       SELECT $1, $2, NULL, $3, TRUE, COALESCE($4::timestamptz, NOW())
        WHERE NOT EXISTS (
          SELECT 1
            FROM task_comments
           WHERE task_id = $1
             AND text = $3
        )`,
      [taskId, tenantId, text, normalizeTimestamp(comment.createdAt)],
    );
    if (rowCount > 0) result.inserted += 1;
    else result.skipped += 1;
  }
  return result;
}

async function possibleDuplicateCandidates(db, tenantId, record, windowDays = 14) {
  if (!record.propertyCode || !record.title) return [];
  const { rows } = await db.query(
    `SELECT id, title, property_code, due_date, status, source, external_ref
       FROM tasks
      WHERE tenant_id = $1
        AND status <> 'cancelled'
        AND external_ref IS NULL
        AND property_code = $2
        AND lower(trim(title)) = lower(trim($3))
        AND (
          $4::date IS NULL
          OR due_date IS NULL
          OR due_date BETWEEN ($4::date - ($5::int * interval '1 day'))
                          AND ($4::date + ($5::int * interval '1 day'))
        )
      ORDER BY due_date DESC NULLS LAST, updated_at DESC
      LIMIT 5`,
    [tenantId, record.propertyCode, record.title, record.dueDate, windowDays],
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    propertyCode: row.property_code,
    dueDate: normalizeDate(row.due_date),
    status: row.status,
    source: row.source,
    externalRef: row.external_ref,
  }));
}

function fallbackExistingTitle(row) {
  const label = titleCase(safeDisplayText(row.subdepartment || row.department, '')) || 'Operations';
  const property = row.property_code ? ` (${row.property_code})` : '';
  const taskId = String(row.external_ref || '').replace(/^breezeway:/, '');
  const suffix = taskId ? ` #${taskId}` : '';
  return `${label} Breezeway task${property}${suffix}`;
}

async function loadPlaceholderTitleRows(db, tenantId) {
  const { rows } = await db.query(
    `SELECT id, tenant_id, external_ref, title, department, subdepartment, property_code
       FROM tasks
      WHERE tenant_id = $1
        AND source = 'breezeway'
        AND status <> 'cancelled'
        AND (
          title ILIKE '%redacted%'
          OR title ILIKE 'imported from breezeway%'
          OR title ILIKE 'breezeway protected task%'
          OR title ILIKE 'protected breezeway task%'
        )
      ORDER BY due_date DESC NULLS LAST, updated_at DESC`,
    [tenantId],
  );
  return rows.map((row) => ({
    ...row,
    nextTitle: fallbackExistingTitle(row),
  })).filter((row) => row.nextTitle && row.nextTitle !== row.title);
}

async function repairPlaceholderTitles(client, rows) {
  const result = { repaired: 0, samples: [] };
  for (const row of rows) {
    const { rowCount } = await client.query(
      `UPDATE tasks
          SET title = $1,
              updated_at = NOW()
        WHERE id = $2
          AND tenant_id = $3
          AND title = $4`,
      [row.nextTitle, row.id, row.tenant_id, row.title],
    );
    if (rowCount > 0) {
      result.repaired += 1;
      if (result.samples.length < 20) {
        result.samples.push({
          externalRef: row.external_ref,
          from: row.title,
          to: row.nextTitle,
        });
      }
    }
  }
  return result;
}

async function apiGetWithTimeout(token, pathname, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BREEZEWAY_API_BASE}${pathname}`, {
      headers: { accept: 'application/json', Authorization: `JWT ${token}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`Breezeway API request failed: HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error(`Breezeway API detail request timed out after ${timeoutMs}ms`);
      timeoutError.status = 'timeout';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function maybeFetchTaskDetails(token, task, args) {
  if (!args.fetchDetails) return task;
  const summary = summarizeApiTask(task);
  if (!summary.taskId) return task;
  try {
    return await apiGetWithTimeout(
      token,
      `/public/inventory/v1/task/${encodeURIComponent(summary.taskId)}`,
      args.detailTimeoutMs,
    );
  } catch (error) {
    error.taskId = summary.taskId;
    throw error;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(Number(ms) || 0, 0)));
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
  const lookbackCutoff = cutoffDate(args.lookbackDays);

  for (const property of properties) {
    const propertyCode = propertyCodeFrom(property, knownCodes);
    if (!propertyCode) {
      skipped.push({ property: propertyLabel(property), reason: 'unmapped_property' });
      continue;
    }
    try {
      const tasks = await listTasksForProperty(token, property, args.perPropertyLimit);
      for (const task of tasks) {
        let transformed = transformTask(task, property, propertyCode, staffMap, importBatchId);
        transformed.detailFetched = false;
        if (transformed.skipped) {
          skipped.push({ property: propertyCode, reason: transformed.reason });
          continue;
        }
        const shouldFetchDetails = args.fetchDetails
          && (args.detailScope === 'all' || sourceTouchedWithinLookback(transformed, lookbackCutoff));
        if (shouldFetchDetails) {
          try {
            const sourceTask = await maybeFetchTaskDetails(token, task, args);
            transformed = transformTask(sourceTask, property, propertyCode, staffMap, importBatchId);
            transformed.detailFetched = true;
          } catch (error) {
            apiErrors.push({
              property: propertyCode,
              taskId: error.taskId || null,
              error: error.message,
              status: error.status || null,
              detailFetchFallback: true,
            });
          }
        }
        const terminal = ['completed', 'closed', 'cancelled'].includes(transformed.status);
        if (!args.includeClosed && terminal && !recordWithinLookback(transformed, lookbackCutoff)) continue;
        records.push(transformed);
        if (shouldFetchDetails && args.requestDelayMs > 0) await sleep(args.requestDelayMs);
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
  const existingRows = await loadExistingRows(pool, args.tenantId, unique.map((record) => record.externalRef));
  const existingRecords = [];
  const changedRecords = [];
  const unchangedRecords = [];
  const missing = [];
  const heldPossibleDuplicates = [];

  for (const record of unique) {
    const existing = existingRows.get(record.externalRef);
    if (existing) {
      const patch = buildUpdatePatch(existing, record);
      const item = { record, existing, patch };
      existingRecords.push(item);
      if (patch.sets.length > 0) changedRecords.push(item);
      else unchangedRecords.push(item);
      continue;
    }

    const candidates = await possibleDuplicateCandidates(pool, args.tenantId, record);
    if (candidates.length > 0 && !args.allowPossibleDuplicates) {
      heldPossibleDuplicates.push({ record, candidates });
    } else {
      missing.push(record);
    }
  }

  const commentsAvailable = unique.reduce((count, record) => count + recentComments(record, lookbackCutoff).length, 0);
  const placeholderTitleRows = await loadPlaceholderTitleRows(pool, args.tenantId);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: args.mode,
    source: 'breezeway_api_current_tasks',
    tenantId: args.tenantId,
    propertyLimit: args.propertyLimit,
    perPropertyLimit: args.perPropertyLimit,
    lookbackDays: args.lookbackDays,
    fetchDetails: args.fetchDetails,
    detailScope: args.fetchDetails ? args.detailScope : 'none',
    propertiesScanned: properties.length,
    recordsScanned: unique.length,
    existing: existingRows.size,
    changed: changedRecords.length,
    unchanged: unchangedRecords.length,
    missing: missing.length,
    heldPossibleDuplicates: heldPossibleDuplicates.length,
    commentsAvailable,
    titleRepairsPending: changedRecords.filter((item) => item.patch.titleRepair).length,
    historicalTitleRepairsPending: placeholderTitleRows.length,
    skipped: skipped.slice(0, 50),
    apiErrors,
    sampleChanged: changedRecords.slice(0, 30).map(({ record, patch }) => ({
      ...record.sample,
      changes: patch.diff,
    })),
    sampleMissing: missing.slice(0, 30).map((record) => record.sample),
    sampleHeldPossibleDuplicates: heldPossibleDuplicates.slice(0, 30).map(({ record, candidates }) => ({
      ...record.sample,
      candidates,
    })),
    sampleHistoricalTitleRepairs: placeholderTitleRows.slice(0, 20).map((row) => ({
      externalRef: row.external_ref,
      from: row.title,
      to: row.nextTitle,
    })),
    apply: null,
    notes: [
      'Preview/apply reconciles existing Breezeway API tasks by external_ref before inserting missing rows.',
      'Moved dates, moved assignees, status, priority, property, source timestamps, tags, and API enrichment are compared for existing rows.',
      'Closed/completed/cancelled tasks are skipped unless --include-closed is passed, except terminal tasks updated within --lookback-days are still reconciled.',
      'Missing rows with no external_ref match but same property/title near the due date are held as possible duplicates unless --allow-possible-duplicates is passed.',
      'Recent Breezeway comments are copied into task_comments idempotently using a Breezeway comment marker.',
      'Older placeholder/redacted Breezeway titles are repaired to neutral department/property/task-id labels without unredacting sensitive source text.',
      'No raw API credentials are included. Access-like text is redacted from descriptions.',
    ],
  };

  if (args.mode === 'apply') {
    const client = await pool.connect();
    const apply = {
      inserted: 0,
      updated: 0,
      unchanged: unchangedRecords.length,
      titleRepairs: 0,
      historicalTitleRepairs: 0,
      heldPossibleDuplicates: heldPossibleDuplicates.length,
      commentsInserted: 0,
      commentsSkipped: 0,
      skippedExisting: 0,
      failed: 0,
      errors: [],
    };
    const taskIdsByRef = new Map(existingRecords.map(({ record, existing }) => [record.externalRef, existing.id]));
    const heldRefs = new Set(heldPossibleDuplicates.map(({ record }) => record.externalRef));
    try {
      await client.query('BEGIN');
      for (const item of changedRecords) {
        try {
          if (await updateRecord(client, item.existing, item.record, item.patch)) {
            apply.updated += 1;
            if (item.patch.titleRepair) apply.titleRepairs += 1;
          } else {
            apply.skippedExisting += 1;
          }
        } catch (error) {
          apply.failed += 1;
          apply.errors.push({ externalRef: item.record.externalRef, action: 'update', error: error.message });
        }
      }
      for (const record of missing) {
        try {
          const insertedId = await insertRecord(client, args.tenantId, record);
          if (insertedId) {
            apply.inserted += 1;
            taskIdsByRef.set(record.externalRef, insertedId);
          } else {
            apply.skippedExisting += 1;
          }
        } catch (error) {
          apply.failed += 1;
          apply.errors.push({ externalRef: record.externalRef, action: 'insert', error: error.message });
        }
      }
      for (const record of unique) {
        if (heldRefs.has(record.externalRef)) continue;
        const taskId = taskIdsByRef.get(record.externalRef);
        if (!taskId) continue;
        try {
          const synced = await syncRecentComments(client, args.tenantId, taskId, record, lookbackCutoff);
          apply.commentsInserted += synced.inserted;
          apply.commentsSkipped += synced.skipped;
        } catch (error) {
          apply.failed += 1;
          apply.errors.push({ externalRef: record.externalRef, action: 'comments', error: error.message });
        }
      }
      try {
        const repaired = await repairPlaceholderTitles(client, placeholderTitleRows);
        apply.historicalTitleRepairs = repaired.repaired;
        apply.historicalTitleRepairSamples = repaired.samples;
      } catch (error) {
        apply.failed += 1;
        apply.errors.push({ action: 'historical_title_repair', error: error.message });
      }
      if (apply.failed > 0) throw new Error('One or more Breezeway API tasks failed to reconcile.');
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
