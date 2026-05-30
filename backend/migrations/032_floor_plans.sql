-- Migration 032 — Vector floor plans for the Conversational Floor Plan
-- Editor (Mathias feedback, 2026-05-14; see docs/scoping/
-- conversational-floor-plan-editor.md).
--
-- Replaces the single-shot raster generation in FloorPlanGenerator
-- with a stable structured representation: walls / doors / windows /
-- furniture as positioned geometric primitives. The renderer turns
-- this into an SVG (W4) and then a stylised raster via Gemini.
--
-- One floor plan per project; the plan is versioned so we can let the
-- user revert through the chat history. The plan itself is a single
-- JSONB blob — the schema evolves rapidly during W3-W5, and a typed-
-- column model would create migration friction. Once the shape is
-- stable (post-W6) we can promote hot fields to columns if needed.

CREATE TABLE IF NOT EXISTS design_floor_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  -- Sequential version per project. Incremented on every accepted
  -- chat turn that produced a new render. Older versions are read-
  -- only and let Mathias rewind.
  version INTEGER NOT NULL,
  -- The source raster the owner uploaded (jpg/png/pdf-first-page).
  -- Stored as a URL into /var/www/fad-uploads (same path multer
  -- already writes to). Nullable for projects that start from a
  -- blank canvas.
  source_image_url TEXT,
  -- Vector model: walls, doors, windows, furniture, surfaces.
  -- See frontend FloorPlanModel TypeScript type for the shape.
  model JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- The rendered raster image URL (output of the W4 renderer →
  -- Gemini texture pass). NULL for unrendered drafts.
  rendered_image_url TEXT,
  -- Free-form chat label so Mathias can find a version ("after
  -- moving the sofa"). Auto-generated from the user's message that
  -- produced this version.
  label TEXT,
  -- Marks the version Mathias clicked "save as final" on. Exactly
  -- zero or one row per project_id has is_final=true at a time.
  is_final BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT design_floor_plans_version_per_project UNIQUE (project_id, version)
);

CREATE INDEX IF NOT EXISTS idx_design_floor_plans_project
  ON design_floor_plans(project_id, version DESC);

-- Partial unique index — at most one final per project at a time.
-- Updating is_final flips the previous final to false in the same
-- transaction in the API layer.
CREATE UNIQUE INDEX IF NOT EXISTS idx_design_floor_plans_one_final_per_project
  ON design_floor_plans(project_id) WHERE is_final = TRUE;

-- Chat turns. Each turn is one user message → Kimi reply with the
-- list of operations applied → resulting floor_plan_version_id.
-- Lets the chat UI display "you said X, Friday did Y" history and
-- recover from refresh.
CREATE TABLE IF NOT EXISTS design_floor_plan_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  -- The floor plan version this turn produced. NULL for failed turns
  -- where no plan change was applied.
  resulting_version_id UUID REFERENCES design_floor_plans(id) ON DELETE SET NULL,
  user_message TEXT NOT NULL,
  friday_reply TEXT,
  -- The list of operations Kimi proposed, as JSONB array. Useful for
  -- debugging when a turn produces a surprising result.
  operations JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 'pending' | 'applied' | 'rejected' (Kimi returned invalid ops) |
  -- 'failed' (renderer or Gemini errored). Lets the UI surface
  -- per-turn status.
  status TEXT NOT NULL DEFAULT 'applied',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT design_floor_plan_chats_status_check
    CHECK (status IN ('pending', 'applied', 'rejected', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_design_floor_plan_chats_project
  ON design_floor_plan_chats(project_id, created_at DESC);
