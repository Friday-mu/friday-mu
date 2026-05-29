#!/usr/bin/env node
'use strict';

const { query, pool } = require('../src/database/client');
const { normalizeContextPack } = require('../src/ask_friday/contracts');
const { validateContextPackAgainstSurface } = require('../src/ask_friday/policy');
const { websitePublicDraftContextPacks } = require('../src/ask_friday/context_pack_templates');

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

function argValue(name, fallback = '') {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

async function loadSurface(tenantId, surfaceId) {
  const { rows } = await query(
    `SELECT *
       FROM ask_friday_surfaces
      WHERE tenant_id = $1
        AND surface_id = $2
      LIMIT 1`,
    [tenantId, surfaceId],
  );
  return rows[0] || null;
}

async function upsertDraft(tenantId, draft) {
  const pack = normalizeContextPack(draft);
  const surface = await loadSurface(tenantId, pack.surfaceId);
  validateContextPackAgainstSurface(pack, surface);
  const { rows } = await query(
    `INSERT INTO ask_friday_context_packs (
       tenant_id, pack_id, surface_id, version, status, knowledge_scopes,
       behavior_rules, tool_policy, memory_policy, source_snapshot_refs,
       pack_payload, approved_by, approved_at, published_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, 'draft', $5,
       $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb,
       $10::jsonb, NULL, NULL, NULL, NOW()
     )
     ON CONFLICT (tenant_id, surface_id, version) DO UPDATE SET
       pack_id = EXCLUDED.pack_id,
       status = 'draft',
       knowledge_scopes = EXCLUDED.knowledge_scopes,
       behavior_rules = EXCLUDED.behavior_rules,
       tool_policy = EXCLUDED.tool_policy,
       memory_policy = EXCLUDED.memory_policy,
       source_snapshot_refs = EXCLUDED.source_snapshot_refs,
       pack_payload = EXCLUDED.pack_payload,
       approved_by = NULL,
       approved_at = NULL,
       published_at = NULL,
       updated_at = NOW()
     RETURNING pack_id, surface_id, version, status, updated_at`,
    [
      tenantId,
      pack.packId,
      pack.surfaceId,
      pack.version,
      pack.knowledgeScopes,
      JSON.stringify(pack.behaviorRules),
      JSON.stringify(pack.toolPolicy),
      JSON.stringify(pack.memoryPolicy),
      JSON.stringify(pack.sourceSnapshotRefs),
      JSON.stringify(pack.packPayload),
    ],
  );
  return rows[0];
}

async function main() {
  const tenantId = argValue('--tenant', process.env.ASK_FRIDAY_TENANT_ID || DEFAULT_TENANT_ID);
  const version = Number.parseInt(argValue('--version', '1'), 10) || 1;
  const apply = hasFlag('--apply');
  const drafts = websitePublicDraftContextPacks({ version });

  if (!apply) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      tenantId,
      count: drafts.length,
      drafts,
      note: 'Run with --apply to upsert draft rows. Drafts are not public-readable until explicitly published through the gated publisher.',
    }, null, 2));
    return;
  }

  const rows = [];
  for (const draft of drafts) {
    rows.push(await upsertDraft(tenantId, draft));
  }
  console.log(JSON.stringify({ mode: 'applied', tenantId, count: rows.length, drafts: rows }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    pool.end().catch(() => {});
  });
