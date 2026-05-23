'use strict';

const crypto = require('node:crypto');
const { query } = require('../database/client');
const { cleanString, redactText, safeJson } = require('./contracts');

function runId() {
  return `afrun_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function parseLimit(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 100;
  return Math.min(Math.max(Math.floor(raw), 1), 500);
}

function hasSecretLikeContent(value) {
  const text = JSON.stringify(value || {});
  return redactText(text) !== text;
}

function normalizeAssertions(assertions) {
  if (!Array.isArray(assertions)) return [];
  return assertions
    .map((item) => safeJson(item, 40, 1000))
    .filter((item) => cleanString(item.type, 80))
    .slice(0, 50);
}

function allowedTools(contextPack) {
  const policy = contextPack?.tool_policy || {};
  const list = policy.allowedTools || policy.allowed_tools || policy.tools || [];
  return Array.isArray(list) ? new Set(list.map((tool) => cleanString(tool, 120)).filter(Boolean)) : new Set();
}

function requiredKnowledgeScopes(evalCase) {
  const expected = evalCase.expected || {};
  const list = expected.requiredKnowledgeScopes || expected.required_knowledge_scopes || [];
  return Array.isArray(list) ? list.map((scope) => cleanString(scope, 160)).filter(Boolean) : [];
}

function evaluateAssertion(evalCase, assertion, contextPack) {
  const type = cleanString(assertion.type, 80);
  if (type === 'privacy_redaction') {
    const failed = hasSecretLikeContent({
      inputPayload: evalCase.input_payload,
      expected: evalCase.expected,
      assertions: evalCase.assertions,
    });
    return {
      type,
      status: failed ? 'fail' : 'pass',
      message: failed ? 'Eval case contains unredacted secret-like content.' : 'No obvious secret-like content found.',
    };
  }

  if (type === 'tool_policy') {
    const tools = Array.isArray(evalCase.input_payload?.toolsUsed || evalCase.input_payload?.tools_used)
      ? (evalCase.input_payload.toolsUsed || evalCase.input_payload.tools_used).map((tool) => cleanString(tool, 120)).filter(Boolean)
      : [];
    const allowed = allowedTools(contextPack);
    if (tools.length === 0 || allowed.size === 0) {
      return { type, status: 'skip', message: 'No tools or no context-pack tool policy to compare.' };
    }
    const disallowed = tools.filter((tool) => !allowed.has(tool));
    return {
      type,
      status: disallowed.length > 0 ? 'fail' : 'pass',
      message: disallowed.length > 0 ? `Disallowed tools: ${disallowed.join(', ')}` : 'All tools are allowed by policy.',
    };
  }

  if (type === 'grounding') {
    const required = requiredKnowledgeScopes(evalCase);
    const scopes = new Set(contextPack?.knowledge_scopes || []);
    if (required.length === 0) {
      return contextPack
        ? { type, status: 'pass', message: 'Context pack exists; no required scopes declared.' }
        : { type, status: 'skip', message: 'No context pack supplied.' };
    }
    const missing = required.filter((scope) => !scopes.has(scope));
    return {
      type,
      status: missing.length > 0 ? 'fail' : 'pass',
      message: missing.length > 0 ? `Missing knowledge scopes: ${missing.join(', ')}` : 'Required scopes are present.',
    };
  }

  if (type === 'low_confidence_honesty') {
    return {
      type,
      status: 'skip',
      message: 'Requires model output or trace evaluation; not checked by deterministic runner.',
    };
  }

  return {
    type,
    status: 'skip',
    message: 'Unknown assertion type for deterministic runner.',
  };
}

function evaluateCase(evalCase, contextPack) {
  const assertions = normalizeAssertions(evalCase.assertions);
  const results = assertions.length > 0
    ? assertions.map((assertion) => evaluateAssertion(evalCase, assertion, contextPack))
    : [{ type: 'case_shape', status: 'pass', message: 'Eval case has no assertions; shape only.' }];
  const failed = results.filter((result) => result.status === 'fail').length;
  const passed = results.filter((result) => result.status === 'pass').length;
  const skipped = results.filter((result) => result.status === 'skip').length;
  return {
    evalId: evalCase.eval_id,
    suiteId: evalCase.suite_id,
    surfaceId: evalCase.surface_id,
    status: failed > 0 ? 'fail' : 'pass',
    passed,
    failed,
    skipped,
    assertions: results,
  };
}

async function loadContextPack(tenantId, options) {
  const contextPackId = cleanString(options.contextPackId || options.context_pack_id, 160);
  const surfaceId = cleanString(options.surfaceId || options.surface_id, 120);
  const version = Number.parseInt(options.contextPackVersion || options.context_pack_version, 10);
  if (contextPackId) {
    const { rows } = await query(
      `SELECT *
         FROM ask_friday_context_packs
        WHERE tenant_id = $1
          AND pack_id = $2
        LIMIT 1`,
      [tenantId, contextPackId],
    );
    return rows[0] || null;
  }
  if (!surfaceId) return null;
  const params = [tenantId, surfaceId];
  const versionClause = Number.isFinite(version) && version > 0 ? 'AND version = $3' : "AND status = 'published'";
  if (Number.isFinite(version) && version > 0) params.push(version);
  const { rows } = await query(
    `SELECT *
       FROM ask_friday_context_packs
      WHERE tenant_id = $1
        AND surface_id = $2
        ${versionClause}
      ORDER BY version DESC
      LIMIT 1`,
    params,
  );
  return rows[0] || null;
}

async function loadEvalCases(tenantId, options) {
  const suiteId = cleanString(options.suiteId || options.suite_id, 160);
  const surfaceId = cleanString(options.surfaceId || options.surface_id, 120);
  if (!suiteId && !surfaceId) throw badRequest('suiteId or surfaceId is required');
  const params = [tenantId];
  const filters = ['tenant_id = $1', "status = 'active'"];
  if (suiteId) {
    params.push(suiteId);
    filters.push(`suite_id = $${params.length}`);
  }
  if (surfaceId) {
    params.push(surfaceId);
    filters.push(`surface_id = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT *
       FROM ask_friday_eval_cases
      WHERE ${filters.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ${parseLimit(options.limit)}`,
    params,
  );
  return rows;
}

function summarizeRun(results) {
  const totals = results.reduce((acc, result) => {
    acc.cases += 1;
    acc.passedAssertions += result.passed;
    acc.failedAssertions += result.failed;
    acc.skippedAssertions += result.skipped;
    if (result.status === 'pass') acc.passedCases += 1;
    if (result.status === 'fail') acc.failedCases += 1;
    return acc;
  }, {
    cases: 0,
    passedCases: 0,
    failedCases: 0,
    passedAssertions: 0,
    failedAssertions: 0,
    skippedAssertions: 0,
  });
  return {
    ...totals,
    status: totals.failedCases > 0 ? 'failed' : 'passed',
    results,
  };
}

async function runEvalSuite(options) {
  const tenantId = options.tenantId;
  if (!tenantId) throw badRequest('tenantId is required');
  const contextPack = await loadContextPack(tenantId, options);
  const evalCases = await loadEvalCases(tenantId, options);
  const results = evalCases.map((evalCase) => evaluateCase(evalCase, contextPack));
  const summary = summarizeRun(results);
  const id = cleanString(options.runId || options.run_id, 160) || runId();
  const status = summary.status === 'failed' ? 'failed' : 'completed';

  const { rows } = await query(
    `INSERT INTO ask_friday_eval_runs (
       tenant_id, run_id, suite_id, context_pack_id, context_pack_version,
       status, summary, started_at, completed_at
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7::jsonb, NOW(), NOW()
     )
     ON CONFLICT (tenant_id, run_id) DO UPDATE SET
       suite_id = EXCLUDED.suite_id,
       context_pack_id = EXCLUDED.context_pack_id,
       context_pack_version = EXCLUDED.context_pack_version,
       status = EXCLUDED.status,
       summary = EXCLUDED.summary,
       completed_at = NOW()
     RETURNING *`,
    [
      tenantId,
      id,
      cleanString(options.suiteId || options.suite_id, 160) || cleanString(options.surfaceId || options.surface_id, 120),
      contextPack?.pack_id || null,
      contextPack?.version || null,
      status,
      JSON.stringify(summary),
    ],
  );

  return {
    run: rows[0],
    summary,
  };
}

module.exports = {
  runEvalSuite,
  _test: {
    allowedTools,
    evaluateAssertion,
    evaluateCase,
    hasSecretLikeContent,
    normalizeAssertions,
    requiredKnowledgeScopes,
    summarizeRun,
  },
};
