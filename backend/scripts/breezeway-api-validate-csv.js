#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { previewBreezewayCsv } = require('../src/tasks/breezewayImport');

const API_BASE = process.env.BREEZEWAY_BASE_URL || 'https://api.breezeway.io';

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage:
  node backend/scripts/breezeway-api-validate-csv.js --csv <file> [--sample-size 10] [--use-keychain]

CSV remains the source of truth. This temporary validator fetches a small Breezeway
sample and compares selected fields without writing FAD data. It never prints secrets.`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = { sampleSize: 10, useKeychain: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--csv') args.csv = argv[++i];
    else if (arg === '--sample-size') args.sampleSize = Number(argv[++i]);
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
  const response = await fetch(`${API_BASE}/public/auth/v1/`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: creds.clientId, client_secret: creds.clientSecret }),
  });
  if (!response.ok) {
    throw new Error(`Breezeway token request failed: HTTP ${response.status}`);
  }
  const data = await response.json();
  if (!data.access_token) throw new Error('Breezeway token response did not include access_token');
  return data.access_token;
}

async function listTasksForProperty(token, propertyId) {
  const url = new URL(`${API_BASE}/public/inventory/v1/task/`);
  url.searchParams.set('home_id', propertyId);
  url.searchParams.set('limit', '100');
  url.searchParams.set('sort_by', 'updated_at');
  url.searchParams.set('sort_order', 'desc');
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

function compareRecord(record, apiTask) {
  const diffs = [];
  const apiTitle = String(apiTask.name || apiTask.title || '').trim();
  const apiStatus = String(apiTask.status || '').trim();
  const apiPriority = String(apiTask.priority || '').trim();
  if (apiTitle && apiTitle !== record.title) diffs.push('title');
  if (apiStatus && apiStatus.toLowerCase() !== record.sourcePayload.originalStatus?.toLowerCase()) diffs.push('status');
  if (apiPriority && apiPriority.toLowerCase() !== record.sourcePayload.originalPriority?.toLowerCase()) diffs.push('priority');
  return diffs;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.csv) usage(1);
  if (!Number.isFinite(args.sampleSize) || args.sampleSize < 1) throw new Error('--sample-size must be a positive number');

  const csvPath = path.resolve(args.csv);
  const csvText = fs.readFileSync(csvPath, 'utf8');
  const { records } = await previewBreezewayCsv({
    csvText,
    fileName: path.basename(csvPath),
    sampleSize: args.sampleSize,
  });
  const sample = records.slice(0, args.sampleSize);
  const propertyIds = [...new Set(sample.map((record) => record.sourcePayload.property.breezewayId).filter(Boolean))];

  const token = await breezewayToken(credentials(args.useKeychain));
  const apiById = new Map();
  const fetches = [];
  for (const propertyId of propertyIds) {
    const result = await listTasksForProperty(token, propertyId);
    fetches.push({ propertyId, ok: result.ok, status: result.status, count: result.tasks.length });
    result.tasks.forEach((task) => {
      const taskId = normalizeApiTaskId(task);
      if (taskId) apiById.set(taskId, task);
    });
  }

  const comparisons = sample.map((record) => {
    const apiTask = apiById.get(record.taskId);
    return {
      taskId: record.taskId,
      externalRef: record.externalRef,
      foundInApi: Boolean(apiTask),
      differingFields: apiTask ? compareRecord(record, apiTask) : [],
    };
  });

  console.log(JSON.stringify({
    csvFile: path.basename(csvPath),
    sampleSize: sample.length,
    propertyFetches: fetches,
    foundInApi: comparisons.filter((item) => item.foundInApi).length,
    missingInApi: comparisons.filter((item) => !item.foundInApi).map((item) => item.taskId),
    fieldDiffs: comparisons.filter((item) => item.differingFields.length > 0),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
