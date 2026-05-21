#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { previewBreezewayCsv } = require('../src/tasks/breezewayImport');

const API_BASE = process.env.BREEZEWAY_BASE_URL || 'https://api.breezeway.io';
const TOKEN_CACHE = process.env.BREEZEWAY_TOKEN_CACHE
  || path.join(process.env.TMPDIR || '/tmp', 'fad-breezeway-token-cache.json');

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage:
  node backend/scripts/breezeway-api-validate-csv.js --csv <file> [--custom-csv <file>]
    [--sample-size 25] [--out report.json] [--use-keychain]

CSV remains the source of truth. This temporary validator fetches a small Breezeway
sample and compares selected fields without writing FAD data. It never prints secrets.`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = { sampleSize: 25, useKeychain: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--csv') args.csv = argv[++i];
    else if (arg === '--custom-csv') args.customCsv = argv[++i];
    else if (arg === '--sample-size') args.sampleSize = Number(argv[++i]);
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--use-keychain') args.useKeychain = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
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

function credentials(useKeychain) {
  const clientId = process.env.BREEZEWAY_CLIENT_ID || (useKeychain ? keychainSecret('client-id') : '');
  const clientSecret = process.env.BREEZEWAY_CLIENT_SECRET || (useKeychain ? keychainSecret('client-secret') : '');
  if (!clientId || !clientSecret) {
    throw new Error('Breezeway credentials unavailable. Set env vars or pass --use-keychain.');
  }
  return { clientId, clientSecret };
}

async function breezewayToken(creds) {
  try {
    const cached = JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'));
    if (cached?.accessToken && cached?.expiresAt && Date.now() < new Date(cached.expiresAt).getTime() - 300_000) {
      return cached.accessToken;
    }
  } catch (_) {
    // No usable cache. Fall through to the 1/minute auth endpoint.
  }

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
  fs.writeFileSync(TOKEN_CACHE, `${JSON.stringify({ accessToken: data.access_token, expiresAt }, null, 2)}\n`, { mode: 0o600 });
  return data.access_token;
}

async function apiGet(token, pathname, params = {}) {
  const url = new URL(`${API_BASE}${pathname}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, {
    headers: { accept: 'application/json', Authorization: `JWT ${token}` },
  });
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

async function listProperties(token) {
  const byHomeId = new Map();
  let page = 1;
  let totalPages = 1;
  do {
    const data = await apiGet(token, '/public/inventory/v1/property', { limit: 100, page });
    const properties = Array.isArray(data) ? data : (data.results || data.data || data.properties || []);
    properties.forEach((property) => {
      const id = String(property.id || '').trim();
      if (!id) return;
      byHomeId.set(id, {
        id,
        name: property.name || null,
        referencePropertyId: property.reference_property_id || null,
        referenceExternalPropertyId: property.reference_external_property_id || null,
        active: property.active ?? property.is_active ?? null,
      });
    });
    totalPages = Number(data.total_pages || data.pages || data.num_pages || 1);
    page += 1;
  } while (page <= totalPages && page <= 20);
  return byHomeId;
}

async function retrieveTask(token, taskId) {
  return apiGet(token, `/public/inventory/v1/task/${encodeURIComponent(taskId)}`);
}

async function listTasksForProperty(token, propertyId, filters = {}) {
  const url = new URL(`${API_BASE}/public/inventory/v1/task/`);
  url.searchParams.set('home_id', propertyId);
  url.searchParams.set('limit', '100');
  url.searchParams.set('sort_by', 'updated_at');
  url.searchParams.set('sort_order', 'desc');
  Object.entries(filters).forEach(([key, value]) => {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, {
    headers: { accept: 'application/json', Authorization: `JWT ${token}` },
  });
  if (!response.ok) {
    return { ok: false, status: response.status, tasks: [] };
  }
  const data = await response.json();
  const tasks = Array.isArray(data) ? data : (data.results || data.data || data.tasks || []);
  return { ok: true, status: response.status, tasks };
}

function normalizeApiTaskId(task) {
  return String(task.id || task.task_id || task.taskId || '').trim();
}

function normalizePriority(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'normal') return 'medium';
  if (raw === 'watch') return 'low';
  return raw;
}

function normalizeStatus(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (['created', 'new', 'not started'].includes(raw)) return 'scheduled';
  if (['started', 'in progress'].includes(raw)) return 'in_progress';
  if (['finished', 'completed'].includes(raw)) return 'completed';
  return raw;
}

function dateOnly(value) {
  if (!value) return null;
  const raw = String(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function minutesDelta(a, b) {
  const normalize = (value) => {
    const raw = String(value || '');
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)) return `${raw}Z`;
    return raw;
  };
  const left = new Date(normalize(a)).getTime();
  const right = new Date(normalize(b)).getTime();
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return Math.round(Math.abs(left - right) / 60000);
}

function getApiStatus(apiTask) {
  const status = apiTask.type_task_status;
  if (status && typeof status === 'object') return status.code || status.name || status.stage || '';
  return status || apiTask.status || '';
}

function getCustomRowForRecord(record, customRows) {
  if (!customRows?.length) return null;
  return customRows[record.rowNumber - 2] || null;
}

function customRowsAligned(records, customRows) {
  if (!customRows?.length) return null;
  const mismatches = [];
  let titleComparisonsSkippedForRedaction = 0;
  records.forEach((record) => {
    const customRow = getCustomRowForRecord(record, customRows);
    if (!customRow) {
      mismatches.push({ rowNumber: record.rowNumber, reason: 'missing_custom_row' });
      return;
    }
    const rawSummaryTitle = String(record.sourcePayload.raw['Task title'] || '').trim();
    const titleRedacted = rawSummaryTitle.startsWith('[redacted:');
    const titleMatches = titleRedacted
      ? true
      : String(customRow['Task title'] || '').trim() === rawSummaryTitle;
    if (titleRedacted) titleComparisonsSkippedForRedaction += 1;
    const dueMatches = String(customRow['Due date'] || '').trim() === String(record.sourcePayload.raw['Due date'] || '').trim();
    const createdMatches = String(customRow['Created date'] || '').trim() === String(record.sourcePayload.raw['Created date'] || '').trim();
    const updatedMatches = String(customRow['Last updated date'] || '').trim() === String(record.sourcePayload.raw['Last updated date'] || '').trim();
    if (!(titleMatches && dueMatches && createdMatches && updatedMatches) && mismatches.length < 25) {
      mismatches.push({
        rowNumber: record.rowNumber,
        taskId: record.taskId,
        titleMatches,
        dueMatches,
        createdMatches,
        updatedMatches,
      });
    }
  });
  return {
    checkedRows: records.length,
    customRows: customRows.length,
    aligned: mismatches.length === 0,
    titleComparisonsSkippedForRedaction,
    mismatches,
  };
}

function selectSpreadSample(records, sampleSize) {
  const byProperty = new Map();
  records.forEach((record) => {
    const key = record.sourcePayload.property.breezewayId || '(no property)';
    const list = byProperty.get(key) || [];
    list.push(record);
    byProperty.set(key, list);
  });

  const selected = [];
  const groups = [...byProperty.values()];
  for (let index = 0; selected.length < sampleSize; index += 1) {
    let added = false;
    for (const group of groups) {
      if (selected.length >= sampleSize) break;
      if (group[index]) {
        selected.push(group[index]);
        added = true;
      }
    }
    if (!added) break;
  }
  return selected;
}

function importPolicy(record) {
  const property = record.sourcePayload.property || {};
  const name = String(property.name || '').trim();
  const internalId = String(property.internalId || '').trim();
  const marketingId = String(property.marketingId || '').trim();
  const homeId = String(property.breezewayId || '').trim();

  if (name === 'Office / Store / Admin' || homeId === '1099484') {
    return { importable: false, reason: 'administrative_property' };
  }
  if (homeId === '1268645' && (name === 'GBH' || internalId === 'GBH' || marketingId === 'GBH')) {
    return { importable: false, reason: 'aggregate_property' };
  }
  return { importable: true, reason: null };
}

function compareRecord(record, apiTask, customRow) {
  const diffs = [];
  const skipped = [];
  const apiTitle = String(apiTask.name || apiTask.title || '').trim();
  const apiStatus = getApiStatus(apiTask);
  const apiPriority = apiTask.type_priority || apiTask.priority || '';
  const apiDepartment = apiTask.type_department || apiTask.department || '';
  const apiScheduledTime = apiTask.scheduled_time ? String(apiTask.scheduled_time).slice(0, 5) : null;
  const csvTitleRedacted = String(record.title || '').startsWith('[redacted:');

  if (apiTitle && !csvTitleRedacted && apiTitle !== record.title) diffs.push('title');
  if (csvTitleRedacted) skipped.push('title_redacted_in_csv_preview');
  if (apiStatus && normalizeStatus(apiStatus) !== normalizeStatus(record.status)) diffs.push('status');
  if (apiPriority && normalizePriority(apiPriority) !== normalizePriority(record.priority)) diffs.push('priority');
  if (apiDepartment && String(apiDepartment).toLowerCase() !== String(record.department || '').toLowerCase()) diffs.push('department');
  if (String(apiTask.home_id || '') !== String(record.sourcePayload.property.breezewayId || '')) diffs.push('property_home_id');
  if (
    apiTask.reference_property_id
    && record.sourcePayload.property.internalId
    && String(apiTask.reference_property_id) !== String(record.sourcePayload.property.internalId)
  ) diffs.push('reference_property_id');
  if (dateOnly(apiTask.scheduled_date) !== record.dueDate) diffs.push('scheduled_date');
  if ((apiScheduledTime || null) !== (record.dueTime || null)) diffs.push('scheduled_time');
  if (record.sourcePayload.time.sourceCreatedAt && apiTask.created_at) {
    const delta = minutesDelta(record.sourcePayload.time.sourceCreatedAt, apiTask.created_at);
    if (delta == null || delta > 5) diffs.push('created_at');
  }
  if (record.sourcePayload.time.sourceStartedAt && apiTask.started_at) {
    const delta = minutesDelta(record.sourcePayload.time.sourceStartedAt, apiTask.started_at);
    if (delta == null || delta > 5) diffs.push('started_at');
  }
  if (record.sourcePayload.time.sourceCompletedAt && apiTask.finished_at) {
    const delta = minutesDelta(record.sourcePayload.time.sourceCompletedAt, apiTask.finished_at);
    if (delta == null || delta > 5) diffs.push('finished_at');
  }
  if (record.sourcePayload.time.sourceUpdatedAt && apiTask.updated_at) {
    const csvDate = dateOnly(record.sourcePayload.time.sourceUpdatedAt);
    const apiDate = dateOnly(apiTask.updated_at);
    if (csvDate !== apiDate) diffs.push('updated_at_date');
  }

  const customReportLink = String(customRow?.['Task report link'] || '').trim();
  if (customReportLink && apiTask.report_url && customReportLink !== apiTask.report_url) {
    diffs.push('report_url');
  }

  return { diffs, skipped };
}

function summarizeApiTask(apiTask) {
  return {
    hasDescription: Boolean(apiTask.description),
    hasSummary: Boolean(apiTask.summary),
    hasReportUrl: Boolean(apiTask.report_url),
    assignmentsCount: Array.isArray(apiTask.assignments) ? apiTask.assignments.length : 0,
    costsCount: Array.isArray(apiTask.costs) ? apiTask.costs.length : 0,
    suppliesCount: Array.isArray(apiTask.supplies) ? apiTask.supplies.length : 0,
    photosCount: Array.isArray(apiTask.photos) ? apiTask.photos.length : 0,
    tagsCount: Array.isArray(apiTask.tags) ? apiTask.tags.length : 0,
    taskTagsCount: Array.isArray(apiTask.task_tags) ? apiTask.task_tags.length : 0,
    hasLinkedReservation: Boolean(apiTask.linked_reservation),
    hasCreatedByObject: Boolean(apiTask.created_by && typeof apiTask.created_by === 'object'),
    hasFinishedByObject: Boolean(apiTask.finished_by && typeof apiTask.finished_by === 'object'),
    hasRequestedByObject: Boolean(apiTask.requested_by && typeof apiTask.requested_by === 'object'),
  };
}

function addPresenceCounts(target, summary) {
  Object.entries(summary).forEach(([key, value]) => {
    if (typeof value === 'boolean') {
      if (value) target[key] = (target[key] || 0) + 1;
      return;
    }
    if (typeof value === 'number' && value > 0) target[key] = (target[key] || 0) + 1;
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.csv) usage(1);
  if (!Number.isFinite(args.sampleSize) || args.sampleSize < 1) throw new Error('--sample-size must be a positive number');

  const csvPath = path.resolve(args.csv);
  const csvText = fs.readFileSync(csvPath, 'utf8');
  const customRows = args.customCsv
    ? require('../src/tasks/breezewayImport').parseCsv(fs.readFileSync(path.resolve(args.customCsv), 'utf8')).rows
    : null;
  const { records } = await previewBreezewayCsv({
    csvText,
    fileName: path.basename(csvPath),
    sampleSize: 5,
  });
  const policyRows = records.map((record) => ({ record, policy: importPolicy(record) }));
  const importableRecords = policyRows.filter((item) => item.policy.importable).map((item) => item.record);
  const excludedByPolicy = policyRows
    .filter((item) => !item.policy.importable)
    .reduce((acc, item) => {
      const entry = acc.get(item.policy.reason) || { reason: item.policy.reason, count: 0, sampleTaskIds: [] };
      entry.count += 1;
      if (entry.sampleTaskIds.length < 10) entry.sampleTaskIds.push(item.record.taskId);
      acc.set(item.policy.reason, entry);
      return acc;
    }, new Map());
  const sample = selectSpreadSample(importableRecords, args.sampleSize);

  const token = await breezewayToken(credentials(args.useKeychain));
  const apiProperties = await listProperties(token);
  const propertyIds = [...new Set(records.map((record) => record.sourcePayload.property.breezewayId).filter(Boolean))];
  const propertyValidation = {
    csvHomeIds: propertyIds.length,
    matchedHomeIds: propertyIds.filter((propertyId) => apiProperties.has(String(propertyId))).length,
    missingHomeIds: propertyIds.filter((propertyId) => !apiProperties.has(String(propertyId))).slice(0, 25),
    referencePropertyIdMismatches: [],
  };
  records.forEach((record) => {
    const homeId = String(record.sourcePayload.property.breezewayId || '');
    if (!homeId || propertyValidation.referencePropertyIdMismatches.length >= 25) return;
    const property = apiProperties.get(homeId);
    const internalId = record.sourcePayload.property.internalId;
    if (property?.referencePropertyId && internalId && property.referencePropertyId !== internalId) {
      propertyValidation.referencePropertyIdMismatches.push({
        taskId: record.taskId,
        homeId,
        csvInternalIdPresent: Boolean(internalId),
        apiReferencePropertyIdPresent: Boolean(property.referencePropertyId),
      });
    }
  });

  const comparisons = [];
  const retrievals = [];
  const apiFieldPresence = {};
  for (const record of sample) {
    let apiTask = null;
    try {
      apiTask = await retrieveTask(token, record.taskId);
      retrievals.push({ taskId: record.taskId, ok: true, status: 200 });
    } catch (error) {
      retrievals.push({ taskId: record.taskId, ok: false, status: error.status || null });
    }
    if (apiTask) addPresenceCounts(apiFieldPresence, summarizeApiTask(apiTask));
    const customRow = getCustomRowForRecord(record, customRows);
    const compared = apiTask ? compareRecord(record, apiTask, customRow) : { diffs: [], skipped: [] };
    const apiSummary = apiTask ? summarizeApiTask(apiTask) : null;
    comparisons.push({
      taskId: record.taskId,
      externalRef: record.externalRef,
      rowNumber: record.rowNumber,
      propertyHomeId: record.sourcePayload.property.breezewayId,
      propertyCode: record.propertyCode,
      foundInApi: Boolean(apiTask),
      differingFields: compared.diffs,
      skippedComparisons: compared.skipped,
      apiFieldPresence: apiSummary,
      customReportLinkPresent: Boolean(customRow?.['Task report link']),
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'api_validation_preview_only',
    csvFile: csvPath,
    customCsvFile: args.customCsv ? path.resolve(args.customCsv) : null,
    sampleStrategy: 'spread_across_property_home_ids',
    totalCsvRecords: records.length,
    importableCsvRecords: importableRecords.length,
    excludedByPolicy: [...excludedByPolicy.values()],
    sampleSize: sample.length,
    tokenCachePath: TOKEN_CACHE,
    propertyValidation,
    customValidation: customRowsAligned(records, customRows),
    apiTaskRetrievals: {
      attempted: retrievals.length,
      ok: retrievals.filter((item) => item.ok).length,
      failed: retrievals.filter((item) => !item.ok),
    },
    foundInApi: comparisons.filter((item) => item.foundInApi).length,
    missingInApi: comparisons.filter((item) => !item.foundInApi).map((item) => item.taskId),
    fieldDiffs: comparisons.filter((item) => item.differingFields.length > 0).map((item) => ({
      taskId: item.taskId,
      rowNumber: item.rowNumber,
      propertyHomeId: item.propertyHomeId,
      differingFields: item.differingFields,
    })),
    skippedComparisons: comparisons
      .filter((item) => item.skippedComparisons.length > 0)
      .map((item) => ({ taskId: item.taskId, rowNumber: item.rowNumber, skipped: item.skippedComparisons })),
    apiFieldPresenceCounts: apiFieldPresence,
    sampleComparisons: comparisons.slice(0, 20),
    notes: [
      'CSV remains the primary migration source; API validation is temporary and preview-only.',
      'Report intentionally omits raw descriptions, summaries, access details, Wi-Fi fields, and API secrets.',
      'Use external_ref = breezeway:<Task ID> for idempotent import; preserve API-only evidence in source_payload only if explicitly approved.',
    ],
  };

  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) {
    fs.writeFileSync(path.resolve(args.out), json);
    console.log(`Wrote Breezeway API validation report to ${path.resolve(args.out)}`);
  } else {
    process.stdout.write(json);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
