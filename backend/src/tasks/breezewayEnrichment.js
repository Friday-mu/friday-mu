'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const API_BASE = process.env.BREEZEWAY_BASE_URL || 'https://api.breezeway.io';
const TOKEN_CACHE = process.env.BREEZEWAY_TOKEN_CACHE
  || path.join(process.env.TMPDIR || '/tmp', 'fad-breezeway-token-cache.json');
const DEFAULT_REQUEST_DELAY_MS = 250;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function keychainSecret(account) {
  return execFileSync('security', [
    'find-generic-password',
    '-s',
    'breezeway-api',
    '-a',
    account,
    '-w',
  ], { encoding: 'utf8' }).trim();
}

function credentials({ useKeychain = false } = {}) {
  const clientId = process.env.BREEZEWAY_CLIENT_ID || (useKeychain ? keychainSecret('client-id') : '');
  const clientSecret = process.env.BREEZEWAY_CLIENT_SECRET || (useKeychain ? keychainSecret('client-secret') : '');
  if (!clientId || !clientSecret) {
    throw new Error('Breezeway credentials unavailable. Set env vars or pass --use-keychain.');
  }
  return { clientId, clientSecret };
}

async function breezewayToken({ useKeychain = false, tokenCachePath = TOKEN_CACHE } = {}) {
  try {
    const cached = JSON.parse(fs.readFileSync(tokenCachePath, 'utf8'));
    if (cached?.accessToken && cached?.expiresAt && Date.now() < new Date(cached.expiresAt).getTime() - 300_000) {
      return cached.accessToken;
    }
  } catch (_) {
    // No usable cache. Fall through to the 1/minute auth endpoint.
  }

  const creds = credentials({ useKeychain });
  const response = await fetch(`${API_BASE}/public/auth/v1/`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: creds.clientId, client_secret: creds.clientSecret }),
  });
  if (!response.ok) {
    const retryAfter = response.headers.get('retry-after');
    let body = '';
    try { body = await response.text(); } catch (_) {}
    throw new Error(`Breezeway token request failed: HTTP ${response.status}${retryAfter ? ` retry-after=${retryAfter}` : ''}${body ? ` ${body.slice(0, 160)}` : ''}`);
  }
  const data = await response.json();
  if (!data.access_token) throw new Error('Breezeway token response did not include access_token');
  const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
  fs.writeFileSync(tokenCachePath, `${JSON.stringify({ accessToken: data.access_token, expiresAt }, null, 2)}\n`, { mode: 0o600 });
  return data.access_token;
}

async function apiGet(token, pathname, params = {}, { maxRetryAfterMs = 60_000 } = {}) {
  const url = new URL(`${API_BASE}${pathname}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  });
  const request = () => fetch(url, {
    headers: { accept: 'application/json', Authorization: `JWT ${token}` },
  });
  let response = await request();
  if (response.status === 429) {
    const retryAfterSec = Number(response.headers.get('retry-after')) || 5;
    await sleep(Math.min(Math.max(retryAfterSec * 1000, 1000), maxRetryAfterMs));
    response = await request();
  }
  if (!response.ok) {
    let body = '';
    try { body = await response.text(); } catch (_) {}
    const error = new Error(`Breezeway API request failed: HTTP ${response.status}`);
    error.status = response.status;
    error.body = body.slice(0, 240);
    throw error;
  }
  return response.json();
}

function taskIdFromExternalRef(externalRef) {
  const raw = String(externalRef || '').trim();
  return raw.startsWith('breezeway:') ? raw.slice('breezeway:'.length) : '';
}

function personShape(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    id: value.id != null ? String(value.id) : null,
    name: value.name || value.full_name || value.email || null,
    employeeCode: value.employee_code != null ? String(value.employee_code) : null,
  };
}

function assignmentShape(value) {
  if (!value || typeof value !== 'object') return null;
  const status = value.type_task_user_status;
  return {
    id: value.id != null ? String(value.id) : null,
    assigneeId: value.assignee_id != null ? String(value.assignee_id) : null,
    employeeCode: value.employee_code != null ? String(value.employee_code) : null,
    name: value.name || value.assignee_name || null,
    status: status && typeof status === 'object'
      ? (status.code || status.name || null)
      : (status || null),
    expiresAt: value.expires_at || null,
  };
}

function taskTagShape(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    id: value.id != null ? String(value.id) : null,
    name: value.name || null,
  };
}

function photoShape(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    id: value.id != null ? String(value.id) : null,
    hasUrl: Boolean(value.url),
    createdAt: value.created_at || null,
    updatedAt: value.updated_at || null,
  };
}

function commentShape(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    id: value.id != null ? String(value.id) : null,
    comment: typeof value.comment === 'string' ? value.comment : null,
    commentBy: value.comment_by || null,
    createdAt: value.created_at || null,
  };
}

function noteShape(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    id: value.id != null ? String(value.id) : null,
    note: typeof value.note === 'string' ? value.note : null,
    createdAt: value.created_at || null,
    updatedAt: value.updated_at || null,
  };
}

function costShape(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    id: value.id != null ? String(value.id) : null,
    cost: Number.isFinite(Number(value.cost)) ? Number(value.cost) : null,
    type: value.type_cost?.code || value.type_cost?.name || null,
    description: typeof value.description === 'string' ? value.description : null,
    createdAt: value.created_at || null,
    updatedAt: value.updated_at || null,
    deletedAt: value.deleted_at || null,
  };
}

function supplyShape(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    id: value.id != null ? String(value.id) : null,
    name: value.name || null,
    description: typeof value.description === 'string' ? value.description : null,
    quantity: Number.isFinite(Number(value.quantity)) ? Number(value.quantity) : null,
    size: value.size || null,
    unitCost: Number.isFinite(Number(value.unit_cost)) ? Number(value.unit_cost) : null,
  };
}

function arrayOf(value, mapper) {
  return Array.isArray(value) ? value.map(mapper).filter(Boolean) : [];
}

function codeNameShape(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    id: value.id != null ? String(value.id) : null,
    code: value.code || null,
    name: value.name || null,
    stage: value.stage || null,
  };
}

function scalar(value) {
  if (value == null) return null;
  if (['string', 'number', 'boolean'].includes(typeof value)) return value;
  return null;
}

function cleanDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cleanDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  return value.slice(0, 10);
}

function cleanTime(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseDurationMinutes(value) {
  if (value == null || value === '') return null;
  if (Number.isFinite(Number(value))) return Math.round(Number(value));
  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  const hms = text.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (hms) {
    return (Number(hms[1]) * 60) + Number(hms[2]) + (Number(hms[3] || 0) >= 30 ? 1 : 0);
  }
  let total = 0;
  const hour = text.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/);
  const minute = text.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)/);
  if (hour) total += Number(hour[1]) * 60;
  if (minute) total += Number(minute[1]);
  return total > 0 ? Math.round(total) : null;
}

function summarizeApiTask(apiTask) {
  const assignments = arrayOf(apiTask.assignments, assignmentShape);
  const photos = arrayOf(apiTask.photos, photoShape);
  const taskTags = arrayOf(apiTask.task_tags, taskTagShape);
  const tags = Array.isArray(apiTask.tags) ? apiTask.tags.filter(Boolean).map(String) : [];
  const comments = arrayOf(apiTask.comments, commentShape);
  const costs = arrayOf(apiTask.costs, costShape);
  const supplies = arrayOf(apiTask.supplies, supplyShape);
  const summaryNote = typeof apiTask.summary === 'string'
    ? { note: apiTask.summary, id: null, createdAt: null, updatedAt: null }
    : noteShape(apiTask.summary);
  const reportedTasks = Array.isArray(apiTask.reported_tasks)
    ? apiTask.reported_tasks.map((id) => String(id)).filter(Boolean)
    : [];
  return {
    taskId: apiTask.id != null ? String(apiTask.id) : null,
    name: apiTask.name || null,
    hasDescription: Boolean(apiTask.description),
    description: typeof apiTask.description === 'string' ? apiTask.description : null,
    hasSummary: Boolean(summaryNote?.note),
    summary: summaryNote,
    hasReportUrl: Boolean(apiTask.report_url || apiTask.task_report_url),
    reportUrl: apiTask.report_url || apiTask.task_report_url || null,
    assignments,
    photos,
    tags,
    taskTags,
    comments,
    costs,
    supplies,
    createdBy: personShape(apiTask.created_by),
    finishedBy: personShape(apiTask.finished_by),
    requestedBy: personShape(apiTask.requested_by),
    startedBy: personShape(apiTask.started_by),
    linkedReservationPresent: Boolean(apiTask.linked_reservation),
    linkedReservationId: apiTask.linked_reservation?.id || apiTask.linked_reservation?._id || null,
    linkedReservationExternalId: apiTask.linked_reservation?.external_reservation_id || null,
    reportedTasks,
    status: codeNameShape(apiTask.type_task_status),
    priority: codeNameShape(apiTask.type_priority),
    department: codeNameShape(apiTask.type_department),
    subdepartment: typeof apiTask.subdepartment === 'string'
      ? apiTask.subdepartment
      : (apiTask.subdepartment?.name || apiTask.subdepartment?.code || null),
    billTo: scalar(apiTask.bill_to),
    ratePaid: Number.isFinite(Number(apiTask.rate_paid)) ? Number(apiTask.rate_paid) : null,
    rateType: scalar(apiTask.rate_type),
    totalTime: scalar(apiTask.total_time),
    totalMinutes: parseDurationMinutes(apiTask.total_time),
    templateId: apiTask.template_id != null ? String(apiTask.template_id) : null,
    homeId: apiTask.home_id != null ? String(apiTask.home_id) : null,
    referencePropertyId: apiTask.reference_property_id || null,
    scheduledDate: cleanDate(apiTask.scheduled_date),
    scheduledTime: cleanTime(apiTask.scheduled_time),
    createdAt: cleanDateTime(apiTask.created_at),
    updatedAt: cleanDateTime(apiTask.updated_at),
    startedAt: cleanDateTime(apiTask.started_at),
    finishedAt: cleanDateTime(apiTask.finished_at),
  };
}

function incrementPresence(counts, summary) {
  const rules = {
    descriptions: summary.hasDescription,
    summaries: summary.hasSummary,
    reportUrls: summary.hasReportUrl,
    assignments: summary.assignments.length > 0,
    photos: summary.photos.length > 0,
    tags: summary.tags.length > 0 || summary.taskTags.length > 0,
    comments: summary.comments.length > 0,
    costs: summary.costs.length > 0,
    supplies: summary.supplies.length > 0,
    createdBy: Boolean(summary.createdBy),
    finishedBy: Boolean(summary.finishedBy),
    requestedBy: Boolean(summary.requestedBy),
    linkedReservations: summary.linkedReservationPresent,
    reportedTasks: summary.reportedTasks.length > 0,
  };
  Object.entries(rules).forEach(([key, present]) => {
    if (present) counts[key] = (counts[key] || 0) + 1;
  });
}

function buildWouldEnrich(task, summary) {
  const sourcePayload = task.source_payload && typeof task.source_payload === 'object'
    ? task.source_payload
    : {};
  const existing = sourcePayload.apiEnrichment || {};
  return {
    sourcePayloadApiEnrichment: true,
    attachmentCount: summary.photos.length > Number(task.attachment_count || 0)
      ? summary.photos.length
      : null,
    assignments: summary.assignments.length > 0 && JSON.stringify(existing.assignments || []) !== JSON.stringify(summary.assignments),
    photos: summary.photos.length > 0 && JSON.stringify(existing.photos || []) !== JSON.stringify(summary.photos),
    taskTags: summary.taskTags.length > 0,
    reportUrl: summary.hasReportUrl && existing.reportUrl !== true,
    people: Boolean(summary.createdBy || summary.finishedBy || summary.requestedBy),
    linkedReservation: summary.linkedReservationPresent,
    comments: summary.comments.length > 0,
    costs: summary.costs.length > 0,
    supplies: summary.supplies.length > 0,
    reportedTasks: summary.reportedTasks.length > 0,
  };
}

function buildApiEnrichment(apiTask, summary, fetchedAt = new Date().toISOString()) {
  return {
    provider: 'breezeway',
    fetchedAt,
    taskId: summary.taskId,
    sourceUpdatedAt: summary.updatedAt,
    reportUrl: summary.reportUrl,
    descriptionPresent: summary.hasDescription,
    summary: summary.summary,
    assignments: summary.assignments,
    photos: summary.photos,
    photoCount: summary.photos.length,
    comments: summary.comments,
    commentsCount: summary.comments.length,
    costs: summary.costs,
    costsCount: summary.costs.length,
    supplies: summary.supplies,
    suppliesCount: summary.supplies.length,
    tags: summary.tags,
    taskTags: summary.taskTags,
    people: {
      createdBy: summary.createdBy,
      finishedBy: summary.finishedBy,
      requestedBy: summary.requestedBy,
      startedBy: summary.startedBy,
    },
    linkedReservation: summary.linkedReservationPresent ? {
      id: summary.linkedReservationId != null ? String(summary.linkedReservationId) : null,
      externalReservationId: summary.linkedReservationExternalId,
    } : null,
    reportedTasks: summary.reportedTasks,
    status: summary.status,
    priority: summary.priority,
    department: summary.department,
    subdepartment: summary.subdepartment,
    billTo: summary.billTo,
    ratePaid: summary.ratePaid,
    rateType: summary.rateType,
    totalTime: summary.totalTime,
    totalMinutes: summary.totalMinutes,
    templateId: summary.templateId,
    homeId: summary.homeId,
    referencePropertyId: summary.referencePropertyId,
    scheduledDate: summary.scheduledDate,
    scheduledTime: summary.scheduledTime,
    createdAt: summary.createdAt,
    startedAt: summary.startedAt,
    finishedAt: summary.finishedAt,
    rawShape: {
      keys: Object.keys(apiTask || {}).sort(),
      arrayCounts: Object.fromEntries(
        Object.entries(apiTask || {})
          .filter(([, value]) => Array.isArray(value))
          .map(([key, value]) => [key, value.length]),
      ),
    },
  };
}

function mergeTags(existingTags, summary) {
  const merged = new Set(Array.isArray(existingTags) ? existingTags.filter(Boolean) : []);
  for (const tag of summary.tags || []) merged.add(String(tag));
  for (const tag of summary.taskTags || []) {
    if (tag.name) merged.add(String(tag.name));
  }
  return [...merged];
}

function delayIfNeeded(ms) {
  const safeMs = Math.max(Number(ms) || 0, 0);
  return safeMs > 0 ? sleep(safeMs) : Promise.resolve();
}

async function loadImportedTasks({
  db,
  tenantId,
  limit,
  offset,
  externalRef,
  missingEnrichment = false,
}) {
  if (!db) throw new Error('Database handle is required for Breezeway enrichment preview.');
  const params = [tenantId];
  const filters = [`tenant_id = $1`, `external_ref LIKE 'breezeway:%'`];
  let i = 2;
  if (externalRef) {
    filters.push(`external_ref = $${i++}`);
    params.push(externalRef);
  }
  if (missingEnrichment) {
    filters.push(`NOT (COALESCE(source_payload, '{}'::jsonb) ? 'apiEnrichment')`);
  }
  const { rows } = await db.query(
    `SELECT id, external_ref, bz_id, title, property_code, status,
            attachment_count, tags, source_payload, updated_at,
            COUNT(*) OVER()::int AS total_count
       FROM tasks
      WHERE ${filters.join(' AND ')}
      ORDER BY source_updated_at DESC NULLS LAST, updated_at DESC
      LIMIT $${i++}
      OFFSET $${i++}`,
    [...params, limit, offset],
  );
  return {
    tasks: rows,
    total: rows.length > 0 ? Number(rows[0].total_count || 0) : 0,
  };
}

async function previewBreezewayTaskEnrichment({
  db,
  tenantId,
  limit = 25,
  offset = 0,
  externalRef = null,
  useKeychain = false,
  tokenCachePath = TOKEN_CACHE,
  requestDelayMs = DEFAULT_REQUEST_DELAY_MS,
  missingEnrichment = false,
} = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const { tasks, total } = await loadImportedTasks({
    db,
    tenantId,
    limit: safeLimit,
    offset: safeOffset,
    externalRef,
    missingEnrichment,
  });
  const token = await breezewayToken({ useKeychain, tokenCachePath });
  const samples = [];
  const failures = [];
  const apiFieldPresence = {};

  for (const task of tasks) {
    const taskId = task.bz_id || taskIdFromExternalRef(task.external_ref);
    if (!taskId) {
      failures.push({ taskId: null, externalRef: task.external_ref, error: 'missing_breezeway_task_id' });
      continue;
    }
    try {
      const apiTask = await apiGet(token, `/public/inventory/v1/task/${encodeURIComponent(taskId)}`);
      const summary = summarizeApiTask(apiTask);
      incrementPresence(apiFieldPresence, summary);
      const wouldEnrich = buildWouldEnrich(task, summary);
      samples.push({
        taskId,
        externalRef: task.external_ref,
        fadTaskId: task.id,
        propertyCode: task.property_code,
        status: task.status,
        currentAttachmentCount: Number(task.attachment_count || 0),
        api: {
          hasDescription: summary.hasDescription,
          hasSummary: summary.hasSummary,
          hasReportUrl: summary.hasReportUrl,
          assignmentsCount: summary.assignments.length,
          photosCount: summary.photos.length,
          tagsCount: summary.tags.length + summary.taskTags.length,
          commentsCount: summary.comments.length,
          costsCount: summary.costs.length,
          suppliesCount: summary.supplies.length,
          hasCreatedBy: Boolean(summary.createdBy),
          hasFinishedBy: Boolean(summary.finishedBy),
          hasRequestedBy: Boolean(summary.requestedBy),
          hasLinkedReservation: summary.linkedReservationPresent,
          reportedTasksCount: summary.reportedTasks.length,
          statusStage: summary.status?.stage || null,
        },
        wouldEnrich,
      });
    } catch (error) {
      failures.push({
        taskId,
        externalRef: task.external_ref,
        status: error.status || null,
        error: error.message,
      });
    }
    await delayIfNeeded(requestDelayMs);
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: 'preview_only',
    source: 'breezeway_api',
    missingEnrichment,
    totalImportedBreezewayTasks: total,
    limit: safeLimit,
    offset: safeOffset,
    scanned: tasks.length,
    retrieved: samples.length,
    failed: failures.length,
    failures,
    apiFieldPresence,
    samples,
    nextOffset: safeOffset + tasks.length < total ? safeOffset + tasks.length : null,
    notes: [
      'Preview only: no FAD rows were written.',
      'Photo URLs are not printed; report only records photo counts and URL presence.',
      'Apply mode should store enrichment in source_payload.apiEnrichment and update attachment_count idempotently.',
    ],
  };
}

async function applyBreezewayTaskEnrichment({
  db,
  tenantId,
  limit = 25,
  offset = 0,
  externalRef = null,
  useKeychain = false,
  tokenCachePath = TOKEN_CACHE,
  requestDelayMs = DEFAULT_REQUEST_DELAY_MS,
  missingEnrichment = true,
} = {}) {
  if (!db) throw new Error('Database handle is required for Breezeway enrichment apply.');
  if (!tenantId) throw new Error('tenantId is required for Breezeway enrichment apply.');
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const { tasks, total } = await loadImportedTasks({
    db,
    tenantId,
    limit: safeLimit,
    offset: safeOffset,
    externalRef,
    missingEnrichment,
  });
  const token = await breezewayToken({ useKeychain, tokenCachePath });
  const samples = [];
  const failures = [];
  const apiFieldPresence = {};
  let updated = 0;

  for (const task of tasks) {
    const taskId = task.bz_id || taskIdFromExternalRef(task.external_ref);
    if (!taskId) {
      failures.push({ taskId: null, externalRef: task.external_ref, error: 'missing_breezeway_task_id' });
      continue;
    }
    try {
      const apiTask = await apiGet(token, `/public/inventory/v1/task/${encodeURIComponent(taskId)}`);
      const summary = summarizeApiTask(apiTask);
      incrementPresence(apiFieldPresence, summary);
      const enrichment = buildApiEnrichment(apiTask, summary);
      const mergedTags = mergeTags(task.tags, summary);
      const { rows } = await db.query(
        `UPDATE tasks
            SET source_payload = jsonb_set(
                  COALESCE(source_payload, '{}'::jsonb),
                  '{apiEnrichment}',
                  $3::jsonb,
                  true
                ),
                attachment_count = GREATEST(COALESCE(attachment_count, 0), $4::int),
                tags = $5,
                spent_minutes = COALESCE(spent_minutes, $6),
                due_date = COALESCE(due_date, $7),
                due_time = COALESCE(due_time, $8),
                department = COALESCE(department, $9),
                subdepartment = COALESCE(subdepartment, $10),
                source_updated_at = COALESCE($11::timestamptz, source_updated_at),
                source_started_at = COALESCE(source_started_at, $12::timestamptz),
                source_completed_at = COALESCE(source_completed_at, $13::timestamptz),
                source_due_at = COALESCE(source_due_at, $14::timestamptz),
                updated_at = NOW()
          WHERE id = $1
            AND tenant_id = $2
            AND source = 'breezeway'
            AND external_ref LIKE 'breezeway:%'
          RETURNING id, external_ref, attachment_count, spent_minutes, tags`,
        [
          task.id,
          tenantId,
          JSON.stringify(enrichment),
          summary.photos.length,
          mergedTags,
          summary.totalMinutes,
          summary.scheduledDate,
          summary.scheduledTime,
          summary.department?.code || summary.department?.name || null,
          summary.subdepartment,
          summary.updatedAt,
          summary.startedAt,
          summary.finishedAt,
          summary.scheduledDate,
        ],
      );
      if (rows.length > 0) {
        updated += 1;
        if (samples.length < 10) {
          samples.push({
            taskId,
            externalRef: task.external_ref,
            fadTaskId: task.id,
            attachmentCount: Number(rows[0].attachment_count || 0),
            commentsCount: summary.comments.length,
            photosCount: summary.photos.length,
            costsCount: summary.costs.length,
            suppliesCount: summary.supplies.length,
            reportedTasksCount: summary.reportedTasks.length,
          });
        }
      }
    } catch (error) {
      failures.push({
        taskId,
        externalRef: task.external_ref,
        status: error.status || null,
        error: error.message,
      });
    }
    await delayIfNeeded(requestDelayMs);
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: 'applied',
    source: 'breezeway_api',
    missingEnrichment,
    totalImportedBreezewayTasks: total,
    limit: safeLimit,
    offset: safeOffset,
    scanned: tasks.length,
    updated,
    failed: failures.length,
    failures,
    apiFieldPresence,
    samples,
    nextOffset: safeOffset + tasks.length < total ? safeOffset + tasks.length : null,
    notes: [
      'Updated existing source=breezeway tasks only; no new FAD tasks were created.',
      'API photos are stored as redacted metadata only; URLs are not stored or printed.',
      'API details are stored under source_payload.apiEnrichment for one-time migration provenance.',
    ],
  };
}

async function previewBreezewayTaskIds({
  taskIds,
  useKeychain = false,
  tokenCachePath = TOKEN_CACHE,
  requestDelayMs = DEFAULT_REQUEST_DELAY_MS,
} = {}) {
  const ids = Array.isArray(taskIds)
    ? taskIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  if (ids.length === 0) throw new Error('At least one Breezeway --task-id is required.');
  const token = await breezewayToken({ useKeychain, tokenCachePath });
  const samples = [];
  const failures = [];
  const apiFieldPresence = {};
  for (const taskId of ids) {
    try {
      const apiTask = await apiGet(token, `/public/inventory/v1/task/${encodeURIComponent(taskId)}`);
      const summary = summarizeApiTask(apiTask);
      incrementPresence(apiFieldPresence, summary);
      samples.push({
        taskId,
        externalRef: `breezeway:${taskId}`,
        api: {
          hasDescription: summary.hasDescription,
          hasSummary: summary.hasSummary,
          hasReportUrl: summary.hasReportUrl,
          assignmentsCount: summary.assignments.length,
          photosCount: summary.photos.length,
          tagsCount: summary.tags.length + summary.taskTags.length,
          commentsCount: summary.comments.length,
          costsCount: summary.costs.length,
          suppliesCount: summary.supplies.length,
          hasCreatedBy: Boolean(summary.createdBy),
          hasFinishedBy: Boolean(summary.finishedBy),
          hasRequestedBy: Boolean(summary.requestedBy),
          hasLinkedReservation: summary.linkedReservationPresent,
          reportedTasksCount: summary.reportedTasks.length,
          statusStage: summary.status?.stage || null,
        },
      });
    } catch (error) {
      failures.push({
        taskId,
        status: error.status || null,
        error: error.message,
      });
    }
    await delayIfNeeded(requestDelayMs);
  }
  return {
    generatedAt: new Date().toISOString(),
    mode: 'api_task_id_preview_only',
    source: 'breezeway_api',
    scanned: ids.length,
    retrieved: samples.length,
    failed: failures.length,
    failures,
    apiFieldPresence,
    samples,
    notes: [
      'Preview only: no FAD rows were read or written.',
      'Use DB-backed mode without --task-id to preview enrichment against imported FAD tasks.',
    ],
  };
}

module.exports = {
  TOKEN_CACHE,
  applyBreezewayTaskEnrichment,
  apiGet,
  buildApiEnrichment,
  breezewayToken,
  previewBreezewayTaskIds,
  previewBreezewayTaskEnrichment,
  summarizeApiTask,
};
