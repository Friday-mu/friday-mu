#!/usr/bin/env node
'use strict';

require('dotenv').config();

const { runRetention } = require('../src/ask_friday/retention');
const { close } = require('../src/database/client');

function boolEnv(name, fallback = true) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return !['0', 'false', 'no'].includes(String(value).toLowerCase());
}

async function main() {
  const tenantId = process.env.ASK_FRIDAY_RETENTION_TENANT_ID
    || process.env.DEFAULT_TENANT_ID
    || '00000000-0000-0000-0000-000000000001';
  const result = await runRetention({
    tenantId,
    dryRun: boolEnv('ASK_FRIDAY_RETENTION_DRY_RUN', true),
    rejectedCandidateRetentionDays: process.env.ASK_FRIDAY_REJECTED_CANDIDATE_RETENTION_DAYS,
    expiredCandidateRetentionDays: process.env.ASK_FRIDAY_EXPIRED_CANDIDATE_RETENTION_DAYS,
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error('[ask-friday/retention-worker] failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await close().catch((error) => {
      console.warn('[ask-friday/retention-worker] db close failed:', error.message);
    });
  });
