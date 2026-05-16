'use strict';

// AI Bet #3 — Ask Friday R-class queries in the Design module.
//
// Read-only conversational AI scoped to a single project (or cross-
// project summary when project_id is null). Loads the live project
// state into a Kimi system prompt + asks for an answer with inline
// citations.
//
// Strict R-class: the system prompt explicitly forbids drafting,
// writing, or sending. S-class (suggested actions) and A-class
// (autonomous writes) are future work behind confirm flows.
//
// Architecture mirrors ai_rough_budget.js — same Kimi call shape,
// retry/backoff, template fallback when KIMI_API_KEY is unset.

const express = require('express');
const axios = require('axios');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { loadTenantConfig } = require('./adapters');
const {
  enforceQuota,
  recordUsage,
  parseKimiUsage,
  QuotaExceededError,
} = require('../tenants/ai_usage');

const router = express.Router();

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
const KIMI_MODEL = process.env.KIMI_MODEL || 'moonshot-v1-8k';
const MAX_RETRIES = 2;
const TIMEOUT_MS = 35_000;

// System prompt built per request so per-tenant config (mig 035) can
// thread through company name + locale phrasing. See ai_rough_budget.js
// for the rationale on the Mauritius-mention heuristic.
function buildSystemPrompt(config) {
  const company = config.company_name || 'the';
  const isMU = (config.legal_jurisdiction_text || '').includes('Mauritius');
  const localePhrase = isMU ? ' in Mauritius' : '';
  return `You are ${company}'s design module assistant, helping the team manage interior-design projects${localePhrase}.

STRICT RULES:
1. READ-ONLY. You may answer questions about the project state. You MUST NOT draft emails, write content for owners, or take any action — refuse those requests politely and tell the user "I'm read-only — to draft anything, ask me again with explicit confirmation."
2. CITE every numeric claim. When you mention an amount, date, count, or named entity (budget item, moodboard version, task, etc.), include a citation tag like [budget:bi-x5], [task:t-12], [moodboard:v3], [payment:design_fee_60], [activity:a-44], [signature:sig-7]. The frontend renders these as clickable pills.
3. IF YOU DON'T KNOW, say so. Don't invent. Don't extrapolate. Don't "assume a standard" — assumptions are fabrications. If a fact (an expiry date, deadline, percentage, duration, owner intent, etc.) isn't explicitly in the context below, the correct answer is "I don't have that in the project data — try checking the Documents tab or asking the team directly." Refuse even with a caveat; do NOT answer with "assuming X" + a derived number. Legal and financial questions are especially load-bearing — a wrong derived answer is worse than no answer.
4. PROSE STYLE: concise, scannable. Use short paragraphs and bullet lists when comparing things. Friday's team is busy — give them the answer first, supporting detail second.

OUTPUT FORMAT:
Return ONLY a JSON object with this shape:
{
  "answer": "<your answer as markdown — citations inline like [budget:bi-x5]>",
  "citations": [
    {"kind": "budget"|"task"|"moodboard"|"payment"|"activity"|"approval"|"signature"|"site_visit", "refId": "<the id matching the inline tag>", "label": "<short human-readable label>"}
  ]
}

Citations array must list each tag that appears in the answer exactly once.`;
}

function parseModelJson(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) s = fenceMatch[1].trim();
  try { return JSON.parse(s); } catch { return null; }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function isRetryable(err) {
  if (!err) return false;
  const code = err.code || err.response?.status;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNABORTED') return true;
  if (typeof code === 'number' && (code === 429 || (code >= 500 && code < 600))) return true;
  return false;
}

async function callKimi(systemPrompt, userContent) {
  const start = Date.now();
  try {
    const { data } = await axios.post(
      `${KIMI_BASE_URL}/chat/completions`,
      {
        model: KIMI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.3, // Lower than rough-budget — analytical, not creative.
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.KIMI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: TIMEOUT_MS,
      },
    );
    const raw = data?.choices?.[0]?.message?.content;
    const parsed = parseModelJson(raw);
    if (!parsed) return { ok: false, error: 'Kimi returned unparseable JSON', durationMs: Date.now() - start, raw, data };
    return { ok: true, parsed, durationMs: Date.now() - start, data };
  } catch (e) {
    return { ok: false, error: e.response?.data?.error?.message || e.message, durationMs: Date.now() - start, err: e };
  }
}

// Load a focused project-context blob. Trims older activity rows to keep
// the token budget tight (system + context + question should stay < 6k
// tokens). When project_id is null we load a cross-project summary
// instead (name + current_stage + tier + EPC per project).
async function loadProjectContext(projectId, tenantId) {
  if (!projectId) {
    const { rows } = await query(
      `SELECT id, name, slug, current_stage, tier, classification, epc_minor,
              design_fee_minor, procurement_fee_minor, lifecycle_status
       FROM design_projects
       WHERE tenant_id = $1 AND lifecycle_status = 'active'
       ORDER BY created_at DESC LIMIT 30`,
      [tenantId],
    );
    return { kind: 'all_projects', projects: rows };
  }

  // Owner-side: load the project + its blockers (tasks where category='blocker'),
  // next-actions, recent activity, budget summary, moodboards, payments,
  // approvals, signature status.
  const [project, tasks, activity, budgetItems, moodboards, payments, approvals, signature, roughBudgets, siteVisit] = await Promise.all([
    query(
      `SELECT id, name, slug, current_stage, stage_status, tier, classification,
              epc_minor, design_fee_minor, procurement_fee_minor,
              engagement_scope, lifecycle_status
       FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [tenantId, projectId],
    ),
    query(
      `SELECT id, title, status, category, due_date, assignee_user_id
       FROM design_tasks WHERE project_id = $1
       ORDER BY (status = 'done')::int, created_at DESC LIMIT 30`,
      [projectId],
    ),
    query(
      `SELECT id, action, payload, created_at
       FROM design_activities WHERE project_id = $1
       ORDER BY created_at DESC LIMIT 20`,
      [projectId],
    ),
    query(
      `SELECT id, description, category_code, unit_cost_minor, quantity,
              retail_cost_minor, negotiated_cost_minor, actual_paid_minor,
              internal_work
       FROM design_budget_items WHERE project_id = $1
       ORDER BY created_at DESC LIMIT 40`,
      [projectId],
    ),
    query(
      `SELECT id, version_number, status, sent_at, approved_at
       FROM design_moodboards WHERE project_id = $1
       ORDER BY version_number DESC LIMIT 5`,
      [projectId],
    ),
    query(
      `SELECT id, gate_id, status, amount_minor, due_date, received_at
       FROM design_payment_gates WHERE project_id = $1
       ORDER BY due_date NULLS LAST`,
      [projectId],
    ),
    query(
      `SELECT id, type, target_id, status, sent_at, respondent_name
       FROM design_approvals WHERE project_id = $1
       ORDER BY sent_at DESC LIMIT 10`,
      [projectId],
    ),
    query(
      `SELECT id, signed_at, typed_name
       FROM design_agreement_signatures WHERE project_id = $1
         AND (notes IS NULL OR notes NOT LIKE 'VOIDED:%')
       ORDER BY signed_at DESC LIMIT 1`,
      [projectId],
    ),
    query(
      `SELECT id, version_number, status, low_minor, mid_minor, high_minor, tier
       FROM design_rough_budget_versions WHERE project_id = $1
       ORDER BY version_number DESC LIMIT 3`,
      [projectId],
    ),
    query(
      `SELECT id, visit_date, visited_at, visited_by_user_id, status, notes
       FROM design_site_visits WHERE project_id = $1
       ORDER BY visit_date DESC LIMIT 1`,
      [projectId],
    ),
  ]);

  return {
    kind: 'one_project',
    project: project.rows[0] || null,
    tasks: tasks.rows,
    activity: activity.rows,
    budget_items: budgetItems.rows,
    moodboards: moodboards.rows,
    payments: payments.rows,
    approvals: approvals.rows,
    signature: signature.rows[0] || null,
    rough_budgets: roughBudgets.rows,
    site_visit: siteVisit.rows[0] || null,
  };
}

router.post('/ask', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const body = req.body || {};
    const { project_id, query: question } = body;
    if (!question || typeof question !== 'string' || question.trim().length < 3) {
      return res.status(400).json({ error: 'query is required (minimum 3 characters)' });
    }
    if (project_id && typeof project_id !== 'string') {
      return res.status(400).json({ error: 'project_id must be a string or null' });
    }

    // Validate project ownership if scoped.
    if (project_id) {
      const ownerCheck = await query(
        `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
        [req.tenantId, project_id],
      );
      if (ownerCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }
    }

    const start = Date.now();
    const context = await loadProjectContext(project_id || null, req.tenantId);

    // Template fallback when KIMI_API_KEY is unset — surface a minimal
    // structured response so the staff still gets something useful.
    if (!process.env.KIMI_API_KEY) {
      const fallbackAnswer = project_id
        ? `I can't answer questions without the Kimi API key configured. Project context loaded: ${context.project?.name ?? 'unknown'}, stage ${context.project?.current_stage}, ${context.tasks?.length ?? 0} tasks, ${context.budget_items?.length ?? 0} budget items.`
        : `I can't answer questions without the Kimi API key configured. ${context.projects?.length ?? 0} active projects loaded.`;
      return res.json({
        answer: fallbackAnswer,
        citations: [],
        source: 'template-fallback',
        durationMs: Date.now() - start,
      });
    }

    const userContent = JSON.stringify({
      question: question.trim(),
      context,
    }, null, 2);

    // Quota guard — runs BEFORE the upstream call.
    try {
      await enforceQuota(req.tenantId);
    } catch (e) {
      if (e instanceof QuotaExceededError) {
        return res.status(402).json({
          error: e.message,
          code: 'QUOTA_EXCEEDED',
          totalCostMinorUsd: e.totalCostMinorUsd,
          capMinorUsd: e.capMinorUsd,
        });
      }
      throw e;
    }

    const tenantConfig = await loadTenantConfig(req.tenantId);
    const systemPrompt = buildSystemPrompt(tenantConfig);

    let lastErr = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const result = await callKimi(systemPrompt, userContent);
      if (result.ok) {
        const parsed = result.parsed;
        const answer = typeof parsed.answer === 'string' ? parsed.answer : '';
        const citations = Array.isArray(parsed.citations)
          ? parsed.citations
              .filter((c) => c && typeof c.kind === 'string' && typeof c.refId === 'string')
              .map((c) => ({
                kind: c.kind,
                refId: c.refId,
                label: typeof c.label === 'string' ? c.label : c.refId,
              }))
          : [];
        // Log usage on success — tokens come from Kimi's `usage` block.
        const usage = parseKimiUsage(result.data);
        recordUsage({
          tenantId: req.tenantId,
          userId: req.identity?.userId,
          feature: 'ai_ask',
          provider: 'kimi',
          model: KIMI_MODEL,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          durationMs: result.durationMs,
          success: true,
          requestContext: { project_id: project_id || null },
        }).catch(() => {});
        return res.json({
          answer,
          citations,
          source: 'kimi',
          model: KIMI_MODEL,
          durationMs: Date.now() - start,
        });
      }
      lastErr = result;
      if (!isRetryable(result.err) || attempt === MAX_RETRIES - 1) break;
      const delay = 500 * Math.pow(2, attempt);
      console.warn(`[ai/ask] attempt ${attempt + 1}/${MAX_RETRIES} failed (${result.error}); retrying in ${delay}ms`);
      await sleep(delay);
    }

    // Failure path — record so the cap reflects reality even when the
    // call didn't produce useful output.
    recordUsage({
      tenantId: req.tenantId,
      userId: req.identity?.userId,
      feature: 'ai_ask',
      provider: 'kimi',
      model: KIMI_MODEL,
      durationMs: Date.now() - start,
      success: false,
      errorCode: String(lastErr?.err?.response?.status || lastErr?.error || 'unknown_error').slice(0, 64),
      requestContext: { project_id: project_id || null },
    }).catch(() => {});

    return res.status(502).json({
      error: lastErr?.error || 'Kimi unavailable',
      durationMs: Date.now() - start,
    });
  } catch (e) {
    console.error('[ai/ask] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
