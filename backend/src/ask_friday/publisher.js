'use strict';

const { query } = require('../database/client');
const { cleanArray, cleanString, safeJson } = require('./contracts');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function cleanCandidateIds(value) {
  return cleanArray(value, 100, 160);
}

function cleanJsonArray(value, maxItems = 100) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((item) => safeJson(item, 120, 8000));
}

async function loadApprovedCandidates(tenantId, candidateIds) {
  if (candidateIds.length === 0) return [];
  const { rows } = await query(
    `SELECT candidate_id, candidate_type, target_layer, proposed_change,
            source_event_ids, evidence_summary, risk_class, trust_tier,
            review_status, reviewer, approved_snapshot_version
       FROM ask_friday_kb_candidates
      WHERE tenant_id = $1
        AND candidate_id = ANY($2)
        AND review_status = 'approved'`,
    [tenantId, candidateIds],
  );
  const found = new Set(rows.map((row) => row.candidate_id));
  const missing = candidateIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw badRequest(`candidateIds must all reference approved candidates: ${missing.join(', ')}`);
  }
  return rows;
}

async function nextPackVersion(tenantId, surfaceId) {
  const { rows } = await query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
       FROM ask_friday_context_packs
      WHERE tenant_id = $1
        AND surface_id = $2`,
    [tenantId, surfaceId],
  );
  return Number(rows[0]?.next_version) || 1;
}

function candidateSnapshotRefs(candidates) {
  return candidates.map((candidate) => ({
    type: 'kb_candidate',
    candidateId: candidate.candidate_id,
    candidateType: candidate.candidate_type,
    targetLayer: candidate.target_layer,
    riskClass: candidate.risk_class,
    trustTier: candidate.trust_tier,
    reviewer: candidate.reviewer || null,
  }));
}

async function publishContextPack(options) {
  const tenantId = options.tenantId;
  const surfaceId = cleanString(options.surfaceId, 120);
  if (!tenantId) throw badRequest('tenantId is required');
  if (!surfaceId) throw badRequest('surfaceId is required');

  const candidateIds = cleanCandidateIds(
    options.candidateIds
    || options.candidate_ids
    || options.approvedCandidateIds
    || options.approved_candidate_ids,
  );
  const manualApproval = options.manualApproval === true;
  if (candidateIds.length === 0 && !manualApproval) {
    throw badRequest('approved candidateIds or manualApproval:true is required');
  }

  const approvedBy = cleanString(options.approvedBy, 160) || 'ask-friday-reviewer';
  const candidates = await loadApprovedCandidates(tenantId, candidateIds);
  const version = options.version
    ? Math.max(1, Number.parseInt(options.version, 10) || 1)
    : await nextPackVersion(tenantId, surfaceId);
  const packId = cleanString(options.packId, 160) || `${surfaceId}_v${version}`;
  const sourceSnapshotRefs = [
    ...candidateSnapshotRefs(candidates),
    ...cleanJsonArray(options.sourceSnapshotRefs || options.source_snapshot_refs, 100),
    ...(manualApproval ? [{
      type: 'manual_approval',
      approvedBy,
      rationale: cleanString(options.manualApprovalRationale || options.manual_approval_rationale, 1000) || null,
    }] : []),
  ];

  const { rows } = await query(
    `INSERT INTO ask_friday_context_packs (
       tenant_id, pack_id, surface_id, version, status, knowledge_scopes,
       behavior_rules, tool_policy, memory_policy, source_snapshot_refs,
       pack_payload, approved_by, approved_at, published_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, 'published', $5,
       $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb,
       $10::jsonb, $11, NOW(), NOW(), NOW()
     )
     ON CONFLICT (tenant_id, surface_id, version) DO UPDATE SET
       pack_id = EXCLUDED.pack_id,
       status = 'published',
       knowledge_scopes = EXCLUDED.knowledge_scopes,
       behavior_rules = EXCLUDED.behavior_rules,
       tool_policy = EXCLUDED.tool_policy,
       memory_policy = EXCLUDED.memory_policy,
       source_snapshot_refs = EXCLUDED.source_snapshot_refs,
       pack_payload = EXCLUDED.pack_payload,
       approved_by = EXCLUDED.approved_by,
       approved_at = NOW(),
       published_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [
      tenantId,
      packId,
      surfaceId,
      version,
      cleanArray(options.knowledgeScopes || options.knowledge_scopes, 100, 160),
      JSON.stringify(cleanJsonArray(options.behaviorRules || options.behavior_rules, 100)),
      JSON.stringify(safeJson(options.toolPolicy || options.tool_policy, 120, 8000)),
      JSON.stringify(safeJson(options.memoryPolicy || options.memory_policy, 120, 8000)),
      JSON.stringify(sourceSnapshotRefs),
      JSON.stringify(safeJson(options.packPayload || options.pack_payload || {}, 160, 12000)),
      approvedBy,
    ],
  );

  if (candidateIds.length > 0) {
    await query(
      `UPDATE ask_friday_kb_candidates
          SET approved_snapshot_version = $1,
              updated_at = NOW()
        WHERE tenant_id = $2
          AND candidate_id = ANY($3)
          AND review_status = 'approved'`,
      [packId, tenantId, candidateIds],
    );
  }

  return {
    contextPack: rows[0],
    approvedCandidates: candidates,
  };
}

module.exports = {
  publishContextPack,
  _test: {
    candidateSnapshotRefs,
    cleanCandidateIds,
    cleanJsonArray,
  },
};
