-- 054_slack_import.sql
--
-- One-time Slack history backfill into TeamInbox. Schema additions
-- support provenance tracking + Slack-to-FAD identity mapping so we
-- can attribute messages to the right user even when Slack and FAD
-- have different IDs.
--
-- The actual import worker lives in backend/src/team_inbox/slack_import.js
-- and runs when an admin POSTs to /api/team/slack-import/start with the
-- Slack bot token. After successful import, Slack is decommissioned;
-- this schema persists so the audit trail (who said what on Slack
-- before the migration) stays queryable.

-- ─── Provenance on existing messages ───────────────────────────────
-- Nullable: native-FAD messages have these empty. Slack-imported
-- messages carry their original Slack identifiers so we can prove
-- where they came from and dedupe re-imports.

ALTER TABLE team_channel_messages
  ADD COLUMN IF NOT EXISTS slack_source_message_id  TEXT,
  ADD COLUMN IF NOT EXISTS slack_source_channel_id  TEXT,
  ADD COLUMN IF NOT EXISTS slack_source_user_id     TEXT;

ALTER TABLE team_dm_messages
  ADD COLUMN IF NOT EXISTS slack_source_message_id  TEXT,
  ADD COLUMN IF NOT EXISTS slack_source_dm_id       TEXT,
  ADD COLUMN IF NOT EXISTS slack_source_user_id     TEXT;

-- Unique indexes prevent re-import duplicates if the worker is run
-- twice. Partial — only enforced for Slack-sourced rows; native FAD
-- messages have NULL slack_source_message_id.

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_channel_messages_slack_dedup
  ON team_channel_messages(slack_source_message_id, slack_source_channel_id)
  WHERE slack_source_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_dm_messages_slack_dedup
  ON team_dm_messages(slack_source_message_id, slack_source_dm_id)
  WHERE slack_source_message_id IS NOT NULL;

-- ─── Slack ↔ FAD identity mapping ──────────────────────────────────
-- Resolved during the first phase of the import worker (fetch
-- Slack users list, match against FAD users by email). Unmatched
-- Slack users get a placeholder author_display_name on imported
-- messages — author_user_id stays NULL since they're not real FAD
-- users.

CREATE TABLE IF NOT EXISTS slack_user_map (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slack_user_id       TEXT NOT NULL,
  slack_username      TEXT,
  slack_email         TEXT,
  slack_display_name  TEXT,
  -- FAD user that this Slack user maps to. NULL = no match found
  -- (e.g. ex-employee, bot, or someone who never had a FAD account).
  -- Imported messages from unmatched users get the slack_display_name
  -- as author_display_name and author_user_id = NULL.
  fad_user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  match_method        TEXT, -- 'email' | 'username' | 'manual' | 'unmatched'
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_slack_user_map_tenant_slack
  ON slack_user_map(tenant_id, slack_user_id);
CREATE INDEX IF NOT EXISTS idx_slack_user_map_fad_user
  ON slack_user_map(fad_user_id)
  WHERE fad_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS slack_channel_map (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slack_channel_id    TEXT NOT NULL,
  slack_channel_name  TEXT,
  slack_is_private    BOOLEAN NOT NULL DEFAULT FALSE,
  slack_is_archived   BOOLEAN NOT NULL DEFAULT FALSE,
  -- FAD channel to import this Slack channel's history INTO.
  -- NULL = skip this channel during import (e.g., #social channels
  -- the team doesn't want migrated).
  -- The mapping is operator-configured before import runs — admin
  -- UI lets the team review every Slack channel and pick the
  -- target FAD channel (or skip). Default suggestions wire by name
  -- match.
  target_fad_channel_id  UUID REFERENCES team_channels(id) ON DELETE SET NULL,
  skip                 BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_slack_channel_map_tenant_slack
  ON slack_channel_map(tenant_id, slack_channel_id);

-- ─── Import run tracking ────────────────────────────────────────────
-- One row per import attempt. Lets the admin UI show "last run on
-- 2026-05-18, imported 1,234 messages from 9 channels" and identify
-- which messages came from which run.

CREATE TABLE IF NOT EXISTS slack_import_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at         TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'running'
                      CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled')),
  -- Date floor: messages older than this aren't imported. NULL = no
  -- floor (import everything Slack lets us see, which is 90 days on
  -- free tier).
  imported_since      TIMESTAMPTZ,
  -- Aggregate counts (final values written on completion).
  channels_imported   INTEGER NOT NULL DEFAULT 0,
  messages_imported   INTEGER NOT NULL DEFAULT 0,
  dms_imported        INTEGER NOT NULL DEFAULT 0,
  users_mapped        INTEGER NOT NULL DEFAULT 0,
  users_unmapped      INTEGER NOT NULL DEFAULT 0,
  -- Last error message if status='failed'. Operator can retry from
  -- the admin UI; cursor positions for resume aren't persisted in v1
  -- (full re-run is acceptable since unique indexes prevent dupes).
  last_error          TEXT
);

CREATE INDEX IF NOT EXISTS idx_slack_import_runs_tenant_recent
  ON slack_import_runs(tenant_id, started_at DESC);
