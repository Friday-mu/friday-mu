-- 053_team_inbox_search.sql
--
-- Postgres full-text search for the TeamInbox. Adds tsvector columns
-- to team_channel_messages + team_dm_messages with GIN indexes for
-- fast lookup. The tsvector is computed via a generated column from
-- the `text` body (English language config) so it stays in sync with
-- edits + inserts without needing application-side maintenance.
--
-- Why FTS not semantic for v1:
--   - Ships in hours not weeks
--   - English-only chat content; FTS handles it well
--   - No embedding pipeline + vector store required
--   - Semantic upgrade is additive later (vector column alongside)
--
-- File search (PDFs, screenshots, attachments) will hook in once
-- file uploads ship Day 2-3 — attach a separate ts_vector column to
-- the future `team_file_attachments` table at that point.
--
-- Notion / Drive / KB cross-platform search: explicitly out of scope
-- per Ishant 2026-05-17. Later sprint when justified.

-- ─── tsvector generated columns ────────────────────────────────────
-- Computed automatically by Postgres on insert/update; no triggers
-- needed. Stored (STORED keyword) so the GIN index can use them
-- directly without recomputation on every search.

ALTER TABLE team_channel_messages
  ADD COLUMN IF NOT EXISTS text_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(text, ''))) STORED;

ALTER TABLE team_dm_messages
  ADD COLUMN IF NOT EXISTS text_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(text, ''))) STORED;

-- ─── GIN indexes ───────────────────────────────────────────────────
-- Standard pattern for FTS: GIN beats GiST for static-ish text
-- corpora (chat messages don't get edited often after send).

CREATE INDEX IF NOT EXISTS idx_team_channel_messages_text_tsv
  ON team_channel_messages USING GIN (text_tsv)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_team_dm_messages_text_tsv
  ON team_dm_messages USING GIN (text_tsv)
  WHERE deleted_at IS NULL;
