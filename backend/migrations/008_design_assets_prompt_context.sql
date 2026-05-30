-- Migration 008 — add prompt_context JSONB column to design_assets for
-- moodboard image generation auditing (design-be-7-smart-prompt).
--
-- The smart-prompt synthesis path (POST /api/design/ai_images/
-- generate-from-project) gathers a structured context blob — project +
-- property + preferences + site_visit + goals + outcomes + inspiration
-- captions — runs it through Kimi to synthesise the Nanobanana prompt,
-- then renders the image. We persist the raw context on the asset row
-- so we can later debug "why did the model pick that palette?" or audit
-- which preferences flowed into a given moodboard, without re-running
-- the pipeline.
--
-- NULL for assets generated via the original POST /generate route (no
-- structured context, user typed the prompt by hand). Non-null only on
-- the smart-prompt path. The shape mirrors the buildMoodboardPrompt()
-- input contract:
--   { project, property, preferences, siteVisit, goals, outcomes,
--     classification, tier, inspirationCaptions,
--     promptSource: 'kimi'|'override'|'template-fallback',
--     usedImageCount: number }
--
-- No index needed yet — this is debug / audit storage, not a query
-- target. If a future surface lists "all moodboards using preference X"
-- a GIN index on prompt_context can be added then.

ALTER TABLE design_assets
  ADD COLUMN IF NOT EXISTS prompt_context JSONB;
