-- 052_team_inbox.sql
--
-- Team-internal chat surface (FAD's Slack replacement). Channels +
-- DMs + messages + per-message read receipts. Replaces what the
-- TeamInbox.tsx frontend currently renders against empty fixtures.
--
-- Shape follows the existing tasks pattern: tenant-scoped, soft FKs
-- where the joined entity might disappear, hard FKs (CASCADE) where
-- it must. Per-message read receipts split into a child table so the
-- main messages table stays narrow and reads scale cleanly.
--
-- V1 scope (this migration):
--   - 13 seeded channels for FR tenant (gm, announce, random, ops,
--     reservations, syndic, agency, marketing, finance, admin,
--     refunds, adjustments, photoshoot)
--   - Channel membership (public channels seed everyone; private
--     channels seed empty — admin adds members via API)
--   - Text messages with @mention array
--   - DMs (1:1 and group) auto-created on first message
--   - Read receipts per (user, message)
--
-- Out of v1 (added later migrations):
--   - Threading (parent_message_id column will be added in a follow-up)
--   - Reactions (separate table — follow-up)
--   - File attachments (storage TBD — follow-up)
--   - Full-text search index (Postgres tsvector — follow-up)
--
-- Rollback: DROP TABLE team_message_reads, team_dm_messages,
-- team_dms, team_channel_messages, team_channel_members, team_channels.

-- ─── Channels ────────────────────────────────────────────────────
-- One row per channel. Visibility column drives default membership
-- seeding (public = everyone in tenant; private = explicit only).
-- The `kind` column is reserved for future channel types (e.g.,
-- 'voice', 'announcement-only') — for v1 everything is 'standard'.

CREATE TABLE IF NOT EXISTS team_channels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Stable string key the frontend uses to identify channels by purpose
  -- (TeamInbox.tsx hardcodes a ChannelKey union). Unique per tenant.
  channel_key     TEXT NOT NULL,
  name            TEXT NOT NULL,
  purpose         TEXT,
  visibility      TEXT NOT NULL DEFAULT 'public'
                  CHECK (visibility IN ('public', 'private')),
  kind            TEXT NOT NULL DEFAULT 'standard',
  -- Photoshoot channel bypasses image compression — set true for
  -- channels that should preserve full-quality uploads. Other
  -- channels = compressed/optimised on upload.
  preserve_upload_quality BOOLEAN NOT NULL DEFAULT FALSE,
  -- Soft-delete flag. Archive instead of drop so message history stays
  -- queryable.
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_channels_tenant_key
  ON team_channels(tenant_id, channel_key);
CREATE INDEX IF NOT EXISTS idx_team_channels_tenant_active
  ON team_channels(tenant_id)
  WHERE archived_at IS NULL;

-- ─── Channel membership ──────────────────────────────────────────
-- Public channels seed everyone on creation. Private channels start
-- empty; admins add members via API. Removed users keep their old
-- messages (no CASCADE on user delete — set null instead).

CREATE TABLE IF NOT EXISTS team_channel_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id      UUID NOT NULL REFERENCES team_channels(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Optional role: 'admin' = can add/remove members + archive.
  -- 'member' = default. No room-owner concept for v1.
  role            TEXT NOT NULL DEFAULT 'member'
                  CHECK (role IN ('admin', 'member'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_channel_members_unique
  ON team_channel_members(channel_id, user_id);
CREATE INDEX IF NOT EXISTS idx_team_channel_members_user
  ON team_channel_members(user_id);

-- ─── Channel messages ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_channel_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id      UUID NOT NULL REFERENCES team_channels(id) ON DELETE CASCADE,
  -- Soft FK: if a user is deleted, their messages persist with
  -- author_user_id = NULL and author_display_name preserved for
  -- historical display.
  author_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  author_display_name TEXT NOT NULL,
  text            TEXT NOT NULL DEFAULT '',
  -- Mention array: UUIDs of @mentioned users. Parsed client-side
  -- from the text body at send time and validated server-side
  -- against channel membership.
  mention_user_ids UUID[] NOT NULL DEFAULT '{}',
  -- Message kind: 'text' (default), 'system' (channel events like
  -- "X added Y to the channel"), 'call_scheduled' (Google Meet
  -- link), 'task_link' (cross-module link to a task — for the
  -- inline widget work in week 2). Matches TeamMessageKind in
  -- frontend/_data/teamInbox.ts.
  kind            TEXT NOT NULL DEFAULT 'text'
                  CHECK (kind IN ('text','system','call_scheduled','task_link','roster_publish','finance_escalation')),
  -- JSONB payload for non-text kinds. callMeta for call_scheduled,
  -- linkedTaskId for task_link, financeEscalation meta, etc.
  meta            JSONB,
  -- Threading hook — populated in a follow-up migration. Reserved
  -- so the v1 API can return it as null without a schema change.
  parent_message_id UUID REFERENCES team_channel_messages(id) ON DELETE CASCADE,
  edited_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_channel_messages_channel_recent
  ON team_channel_messages(channel_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_team_channel_messages_parent
  ON team_channel_messages(parent_message_id)
  WHERE parent_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_channel_messages_mentions_gin
  ON team_channel_messages USING GIN (mention_user_ids);

-- ─── DMs (direct message threads) ────────────────────────────────
-- A DM is a persistent thread between 2+ users. Auto-created on the
-- first message between a unique participant set. Group DMs supported
-- (3+ participants) but uncommon — for v1 the UI primarily creates
-- 1:1 DMs.

CREATE TABLE IF NOT EXISTS team_dms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Sorted UUIDs joined by '|' — natural dedup key for "DM with these
  -- exact participants". Recomputed by API on insert.
  participant_signature TEXT NOT NULL,
  -- Denormalised array of participant user IDs for fast queries.
  participant_user_ids UUID[] NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_dms_tenant_signature
  ON team_dms(tenant_id, participant_signature);
CREATE INDEX IF NOT EXISTS idx_team_dms_participants_gin
  ON team_dms USING GIN (participant_user_ids);
CREATE INDEX IF NOT EXISTS idx_team_dms_recent
  ON team_dms(tenant_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS team_dm_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dm_id           UUID NOT NULL REFERENCES team_dms(id) ON DELETE CASCADE,
  author_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  author_display_name TEXT NOT NULL,
  text            TEXT NOT NULL DEFAULT '',
  mention_user_ids UUID[] NOT NULL DEFAULT '{}',
  kind            TEXT NOT NULL DEFAULT 'text'
                  CHECK (kind IN ('text','system','call_scheduled','task_link')),
  meta            JSONB,
  parent_message_id UUID REFERENCES team_dm_messages(id) ON DELETE CASCADE,
  edited_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_dm_messages_dm_recent
  ON team_dm_messages(dm_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ─── Read receipts ───────────────────────────────────────────────
-- Per-(user, message) row. Polymorphic across channels + DMs via
-- the message_kind discriminator. Click-to-expand UI reads this to
-- show "seen by N people" + a popover with names.
--
-- Implementation note: writes happen on read (when a user opens a
-- channel/DM, batch-upsert rows for every previously-unseen message).
-- Reads happen when rendering the seen-indicator on each message.
-- Index supports both: lookup by message_id (who saw it) and
-- by user_id (their unread set).

CREATE TABLE IF NOT EXISTS team_message_reads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id      UUID NOT NULL,
  message_kind    TEXT NOT NULL CHECK (message_kind IN ('channel','dm')),
  read_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_message_reads_unique
  ON team_message_reads(user_id, message_id);
CREATE INDEX IF NOT EXISTS idx_team_message_reads_by_message
  ON team_message_reads(message_id, message_kind);

-- ─── Reactions ───────────────────────────────────────────────────
-- Three-emoji set per Ishant's spec: 👀 "looking", ✅ "done",
-- 🙋 "need help". Stored as text for forward-compat (if we add a
-- 4th later).

CREATE TABLE IF NOT EXISTS team_message_reactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id      UUID NOT NULL,
  message_kind    TEXT NOT NULL CHECK (message_kind IN ('channel','dm')),
  emoji           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_message_reactions_unique
  ON team_message_reactions(user_id, message_id, emoji);
CREATE INDEX IF NOT EXISTS idx_team_message_reactions_by_message
  ON team_message_reactions(message_id, message_kind);

-- ─── Seed the 13 channels for FR tenant ──────────────────────────
-- Hardcoded against the FR tenant id (single-tenant in v1; other
-- tenants in FAD's multi-tenant Design SaaS won't see TeamInbox yet
-- — gated at the frontend module catalog).

DO $$
DECLARE
  fr_tenant_id UUID;
BEGIN
  -- FR tenant slug is 'friday' (not 'fr'). Falls back to the canonical
  -- default UUID '00000000-0000-0000-0000-000000000001' which is the
  -- column default on users.tenant_id, so this works even if the slug
  -- ever changes.
  SELECT id INTO fr_tenant_id FROM tenants WHERE slug = 'friday' LIMIT 1;
  IF fr_tenant_id IS NULL THEN
    fr_tenant_id := '00000000-0000-0000-0000-000000000001'::UUID;
  END IF;

  -- Public channels — everyone in the tenant sees them
  INSERT INTO team_channels (tenant_id, channel_key, name, purpose, visibility, preserve_upload_quality)
  VALUES
    (fr_tenant_id, 'gm',           'GM',           'Daily good morning check-in', 'public', FALSE),
    (fr_tenant_id, 'announce',     'Announcements','Company announcements + team updates', 'public', FALSE),
    (fr_tenant_id, 'random',       'Random',       'Non-work / miscellaneous', 'public', FALSE),
    (fr_tenant_id, 'ops',          'Ops',          'Operations + guest comms execution', 'public', FALSE),
    (fr_tenant_id, 'reservations', 'Reservations', 'Listings, OTAs, pricing, website, new reservations', 'public', FALSE),
    (fr_tenant_id, 'syndic',       'Syndic',       'Syndic work', 'public', FALSE),
    (fr_tenant_id, 'agency',       'Agency',       'Agency work', 'public', FALSE),
    (fr_tenant_id, 'marketing',    'Marketing',    'Marketing campaigns + content', 'public', FALSE),
    (fr_tenant_id, 'photoshoot',   'Photoshoot',   'Property photoshoots — full quality images preserved', 'public', TRUE)
  ON CONFLICT (tenant_id, channel_key) DO NOTHING;

  -- Private channels — finance/admin/refunds/adjustments. Members
  -- added explicitly via the channel-members admin UI.
  INSERT INTO team_channels (tenant_id, channel_key, name, purpose, visibility, preserve_upload_quality)
  VALUES
    (fr_tenant_id, 'finance',      'Finance',      'Finance + accounting', 'private', FALSE),
    (fr_tenant_id, 'admin',        'Admin',        'Stripe, bank accounts, legal-ops, accountant comms', 'private', FALSE),
    (fr_tenant_id, 'refunds',      'Refunds',      'Refund decisions + paper trail', 'private', FALSE),
    (fr_tenant_id, 'adjustments',  'Adjustments',  'Pricing / reservation adjustments', 'private', FALSE)
  ON CONFLICT (tenant_id, channel_key) DO NOTHING;

  -- Seed public-channel membership for every existing FR user.
  -- New users will be auto-added by the API on their first auth.
  INSERT INTO team_channel_members (channel_id, user_id, role)
  SELECT c.id, u.id, 'member'
  FROM team_channels c
  CROSS JOIN users u
  WHERE c.tenant_id = fr_tenant_id
    AND c.visibility = 'public'
    AND u.tenant_id = fr_tenant_id
  ON CONFLICT (channel_id, user_id) DO NOTHING;
END $$;
