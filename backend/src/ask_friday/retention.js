'use strict';

const { query } = require('../database/client');
const { cleanString } = require('./contracts');

const DEFAULT_REJECTED_CANDIDATE_RETENTION_DAYS = 180;
const DEFAULT_EXPIRED_CANDIDATE_RETENTION_DAYS = 30;

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function positiveInt(value, fallback, min = 1, max = 3650) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.floor(raw), min), max);
}

function rowCount(rows) {
  const raw = rows?.[0]?.count ?? rows?.[0]?.deleted_count ?? 0;
  const count = Number(raw);
  return Number.isFinite(count) ? count : 0;
}

async function countExpiredEvidenceRefs(tenantId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count
       FROM ask_friday_evidence_refs
      WHERE tenant_id = $1
        AND expires_at IS NOT NULL
        AND expires_at < NOW()`,
    [tenantId],
  );
  return rowCount(rows);
}

async function deleteExpiredEvidenceRefs(tenantId) {
  const { rows } = await query(
    `WITH deleted AS (
       DELETE FROM ask_friday_evidence_refs
        WHERE tenant_id = $1
          AND expires_at IS NOT NULL
          AND expires_at < NOW()
        RETURNING id
     )
     SELECT COUNT(*)::int AS deleted_count FROM deleted`,
    [tenantId],
  );
  return rowCount(rows);
}

async function countOldCandidates(tenantId, status, days) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count
       FROM ask_friday_kb_candidates
      WHERE tenant_id = $1
        AND review_status = $2
        AND updated_at < NOW() - ($3::int * INTERVAL '1 day')`,
    [tenantId, status, days],
  );
  return rowCount(rows);
}

async function deleteOldCandidates(tenantId, status, days) {
  const { rows } = await query(
    `WITH deleted AS (
       DELETE FROM ask_friday_kb_candidates
        WHERE tenant_id = $1
          AND review_status = $2
          AND updated_at < NOW() - ($3::int * INTERVAL '1 day')
        RETURNING id
     )
     SELECT COUNT(*)::int AS deleted_count FROM deleted`,
    [tenantId, status, days],
  );
  return rowCount(rows);
}

async function runRetention(options = {}) {
  const tenantId = cleanString(options.tenantId, 80);
  if (!tenantId) throw badRequest('tenantId is required');

  const dryRun = options.dryRun !== false;
  const rejectedCandidateDays = positiveInt(
    options.rejectedCandidateRetentionDays,
    DEFAULT_REJECTED_CANDIDATE_RETENTION_DAYS,
  );
  const expiredCandidateDays = positiveInt(
    options.expiredCandidateRetentionDays,
    DEFAULT_EXPIRED_CANDIDATE_RETENTION_DAYS,
  );

  const summary = {
    dryRun,
    tenantId,
    deleted: {
      expiredEvidenceRefs: 0,
      rejectedCandidates: 0,
      expiredCandidates: 0,
    },
    candidates: {
      rejectedRetentionDays: rejectedCandidateDays,
      expiredRetentionDays: expiredCandidateDays,
    },
    notes: [
      'Learning events are not deleted by this worker until Ishant reviews retention windows.',
      'Approved candidates and published context packs are not deleted by this worker.',
    ],
  };

  if (dryRun) {
    summary.deleted.expiredEvidenceRefs = await countExpiredEvidenceRefs(tenantId);
    summary.deleted.rejectedCandidates = await countOldCandidates(tenantId, 'rejected', rejectedCandidateDays);
    summary.deleted.expiredCandidates = await countOldCandidates(tenantId, 'expired', expiredCandidateDays);
    return summary;
  }

  summary.deleted.expiredEvidenceRefs = await deleteExpiredEvidenceRefs(tenantId);
  summary.deleted.rejectedCandidates = await deleteOldCandidates(tenantId, 'rejected', rejectedCandidateDays);
  summary.deleted.expiredCandidates = await deleteOldCandidates(tenantId, 'expired', expiredCandidateDays);
  return summary;
}

module.exports = {
  runRetention,
  _test: {
    countExpiredEvidenceRefs,
    countOldCandidates,
    deleteExpiredEvidenceRefs,
    deleteOldCandidates,
    positiveInt,
  },
};
