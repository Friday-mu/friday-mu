'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const API_BASE = process.env.BREEZEWAY_BASE_URL || 'https://api.breezeway.io';
const TOKEN_CACHE = process.env.BREEZEWAY_TOKEN_CACHE
  || path.join(process.env.TMPDIR || '/tmp', 'fad-breezeway-token-cache.json');

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
  };
}

function assignmentShape(value) {
  if (!value || typeof value !== 'object') return null;
  const status = value.type_task_user_status;
  return {
    id: value.id != null ? String(value.id) : null,
    assigneeId: value.assignee_id != null ? String(value.assignee_id) : null,
    name: value.name || value.assignee_name || null,
    status: status && typeof status === 'object'
      ? (status.code || status.name || null)
      : (status || null),
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
  };
}

function arrayOf(value, mapper) {
  return Array.isArray(value) ? value.map(mapper).filter(Boolean) : [];
}

function summarizeApiTask(apiTask) {
  const assignments = arrayOf(apiTask.assignments, assignmentShape);
  const photos = arrayOf(apiTask.photos, photoShape);
  const taskTags = arrayOf(apiTask.task_tags, taskTagShape);
  const tags = Array.isArray(apiTask.tags) ? apiTask.tags.filter(Boolean).map(String) : [];
  const costs = Array.isArray(apiTask.costs) ? apiTask.costs : [];
  const supplies = Array.isArray(apiTask.supplies) ? apiTask.supplies : [];
  return {
    hasDescription: Boolean(apiTask.description),
    hasSummary: Boolean(apiTask.summary),
    hasReportUrl: Boolean(apiTask.report_url),
    assignments,
    photos,
    tags,
    taskTags,
    costsCount: costs.length,
    suppliesCount: supplies.length,
    createdBy: personShape(apiTask.created_by),
    finishedBy: personShape(apiTask.finished_by),
    requestedBy: personShape(apiTask.requested_by),
    linkedReservationPresent: Boolean(apiTask.linked_reservation),
    linkedReservationId: apiTask.linked_reservation?.id || apiTask.linked_reservation?._id || null,
    statusStage: apiTask.type_task_status?.stage || null,
    statusCode: apiTask.type_task_status?.code || null,
    updatedAt: apiTask.updated_at || null,
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
    costs: summary.costsCount > 0,
    supplies: summary.suppliesCount > 0,
    createdBy: Boolean(summary.createdBy),
    finishedBy: Boolean(summary.finishedBy),
    requestedBy: Boolean(summary.requestedBy),
    linkedReservations: summary.linkedReservationPresent,
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
  };
}

async function loadImportedTasks({ db, tenantId, limit, offset, externalRef }) {
  if (!db) throw new Error('Database handle is required for Breezeway enrichment preview.');
  const params = [tenantId];
  const filters = [`tenant_id = $1`, `external_ref LIKE 'breezeway:%'`];
  let i = 2;
  if (externalRef) {
    filters.push(`external_ref = $${i++}`);
    params.push(externalRef);
  }
  const { rows } = await db.query(
    `SELECT id, external_ref, bz_id, title, property_code, status,
            attachment_count, source_payload, updated_at,
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
} = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const { tasks, total } = await loadImportedTasks({
    db,
    tenantId,
    limit: safeLimit,
    offset: safeOffset,
    externalRef,
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
          costsCount: summary.costsCount,
          suppliesCount: summary.suppliesCount,
          hasCreatedBy: Boolean(summary.createdBy),
          hasFinishedBy: Boolean(summary.finishedBy),
          hasRequestedBy: Boolean(summary.requestedBy),
          hasLinkedReservation: summary.linkedReservationPresent,
          statusStage: summary.statusStage,
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
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: 'preview_only',
    source: 'breezeway_api',
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

async function previewBreezewayTaskIds({
  taskIds,
  useKeychain = false,
  tokenCachePath = TOKEN_CACHE,
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
          costsCount: summary.costsCount,
          suppliesCount: summary.suppliesCount,
          hasCreatedBy: Boolean(summary.createdBy),
          hasFinishedBy: Boolean(summary.finishedBy),
          hasRequestedBy: Boolean(summary.requestedBy),
          hasLinkedReservation: summary.linkedReservationPresent,
          statusStage: summary.statusStage,
        },
      });
    } catch (error) {
      failures.push({
        taskId,
        status: error.status || null,
        error: error.message,
      });
    }
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
  apiGet,
  breezewayToken,
  previewBreezewayTaskIds,
  previewBreezewayTaskEnrichment,
  summarizeApiTask,
};
