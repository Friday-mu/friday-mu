-- Migration 100 — Feedback multi-screenshot evidence and diagnostics.
--
-- The original feedback table stored one inline screenshot in
-- screenshot_data_url. The agentic Feedback FAB can now attach multiple
-- bounded screenshots to one report, so keep the legacy column for older
-- inbox previews and add a JSONB array for the complete evidence set.

ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS screenshot_data_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE feedback
   SET screenshot_data_urls = jsonb_build_array(screenshot_data_url)
 WHERE screenshot_data_url IS NOT NULL
   AND length(screenshot_data_url) > 0
   AND screenshot_data_urls = '[]'::jsonb;

ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_screenshot_data_urls_array_check;
ALTER TABLE feedback ADD CONSTRAINT feedback_screenshot_data_urls_array_check
  CHECK (jsonb_typeof(screenshot_data_urls) = 'array');

ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_diagnostics_object_check;
ALTER TABLE feedback ADD CONSTRAINT feedback_diagnostics_object_check
  CHECK (jsonb_typeof(diagnostics) = 'object');
