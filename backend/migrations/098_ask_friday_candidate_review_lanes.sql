-- 098_ask_friday_candidate_review_lanes.sql
--
-- Add review-lane metadata so Ask Friday candidates can be separated
-- by public/staff/restricted/internal review paths before UI polish.

ALTER TABLE ask_friday_kb_candidates
  ADD COLUMN IF NOT EXISTS review_lane TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS reviewer_domain TEXT,
  ADD COLUMN IF NOT EXISTS allowed_surface_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS target_privacy_class TEXT NOT NULL DEFAULT 'unknown';

UPDATE ask_friday_kb_candidates
   SET review_lane = CASE
         WHEN risk_class = 'restricted' OR target_layer ILIKE '%finance%' THEN 'restricted_finance'
         WHEN target_layer ILIKE '%legal%' THEN 'restricted_legal'
         WHEN COALESCE(proposed_change->>'surfaceId', '') ILIKE '%finance%' THEN 'restricted_finance'
         WHEN COALESCE(proposed_change->>'surfaceId', '') ILIKE '%legal%' THEN 'restricted_legal'
         WHEN COALESCE(proposed_change->>'surfaceId', '') ILIKE '%owner%' THEN 'owner_private'
         WHEN COALESCE(proposed_change->>'surfaceId', '') ILIKE 'fad_%' THEN 'staff_ops'
         WHEN EXISTS (
           SELECT 1 FROM unnest(source_event_ids) AS ev(event_id)
            WHERE event_id ILIKE '%public%' OR event_id ILIKE '%website%'
         ) OR COALESCE(proposed_change->>'surfaceId', '') ILIKE 'website_%'
           OR COALESCE(proposed_change->>'surfaceId', '') ILIKE 'guest_portal_%'
           OR COALESCE(proposed_change->>'surfaceId', '') = 'public_mcp' THEN 'public'
         ELSE review_lane
       END,
       reviewer_domain = COALESCE(reviewer_domain, CASE
         WHEN risk_class = 'restricted' OR target_layer ILIKE '%finance%' THEN 'finance'
         WHEN target_layer ILIKE '%legal%' THEN 'legal'
         WHEN COALESCE(proposed_change->>'surfaceId', '') ILIKE '%owner%' THEN 'owner_relations'
         WHEN COALESCE(proposed_change->>'surfaceId', '') ILIKE 'website_%'
           OR COALESCE(proposed_change->>'surfaceId', '') ILIKE 'guest_portal_%'
           OR COALESCE(proposed_change->>'surfaceId', '') = 'public_mcp' THEN 'product'
         WHEN COALESCE(proposed_change->>'surfaceId', '') ILIKE 'fad_%' THEN 'ops'
         ELSE NULL
       END),
       target_privacy_class = CASE
         WHEN risk_class = 'restricted'
           OR COALESCE(proposed_change->>'surfaceId', '') ILIKE '%finance%'
           OR COALESCE(proposed_change->>'surfaceId', '') ILIKE '%legal%' THEN 'restricted'
         WHEN risk_class = 'high' THEN 'high'
         WHEN COALESCE(proposed_change->>'surfaceId', '') ILIKE '%owner%' THEN 'high'
         WHEN COALESCE(proposed_change->>'surfaceId', '') ILIKE 'website_%'
           OR COALESCE(proposed_change->>'surfaceId', '') ILIKE 'guest_portal_%'
           OR COALESCE(proposed_change->>'surfaceId', '') = 'public_mcp' THEN 'medium'
         ELSE target_privacy_class
       END
 WHERE review_lane = 'general'
    OR reviewer_domain IS NULL
    OR target_privacy_class = 'unknown';

CREATE INDEX IF NOT EXISTS idx_ask_friday_kb_candidates_review_lane
  ON ask_friday_kb_candidates (tenant_id, review_lane, review_status, risk_class, created_at DESC);
