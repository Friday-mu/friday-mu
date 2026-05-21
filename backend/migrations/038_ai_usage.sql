-- Migration 038 — per-tenant AI cost monitoring.
--
-- Today every design-module AI call (Gemini text op translation,
-- Nanobanana image generation, Kimi rough-budget / ask / annex-b
-- edits) hits FR's API keys without any tracking. A single new
-- tenant could quietly burn the entire monthly Gemini bill before
-- anyone notices. This migration adds:
--
--   ai_usage           append-only log of every AI call (tenant +
--                       feature + provider + token counts + cents)
--   tenants extensions monthly_ai_cost_cap_minor_usd quota + period
--                       anchor; default $10/mo per tenant
--
-- Cost minor units: cents USD (BIGINT for headroom — a runaway
-- Nanobanana cap could in theory crest 10^9 in a month). Token
-- counts are INTEGER which fits up to 2.1B / row, far above any
-- single-call ceiling.
--
-- request_context: tagged JSONB for cheap debugging — we stash
-- project_id, version_id, etc. so a tenant's "where did my money
-- go?" question has an answer without joining back to design tables.

CREATE TABLE IF NOT EXISTS ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID,
  feature TEXT NOT NULL,          -- 'floor_plan_ai', 'floor_plan_render', 'ai_rough_budget', 'ai_ask', 'ai_annex_b_edit', 'moodboard_image', 'moodboard_prompt', 'furnished_plan_prompt', ...
  provider TEXT NOT NULL,         -- 'gemini' | 'kimi' | 'nanobanana'
  model TEXT NOT NULL,            -- e.g. 'gemini-2.5-flash', 'gemini-2.5-flash-image-preview', 'moonshot-v1-8k'
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  cost_minor_usd BIGINT,          -- cents USD; computed from provider rates
  duration_ms INTEGER,
  success BOOLEAN NOT NULL DEFAULT true,
  error_code TEXT,
  request_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant_date ON ai_usage(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_feature_date ON ai_usage(feature, created_at DESC);

-- Per-tenant monthly cap. $10/mo (1000 cents) default — high enough
-- that legitimate use isn't blocked, low enough that a runaway
-- script lands in the alert queue rather than the billing queue.
-- FR-side enforcement can raise the cap manually.
--
-- ai_quota_period_start is set on first usage of a billing cycle.
-- The enforcer treats NULL as "start a new period today".
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS monthly_ai_cost_cap_minor_usd BIGINT DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS ai_quota_period_start DATE;
