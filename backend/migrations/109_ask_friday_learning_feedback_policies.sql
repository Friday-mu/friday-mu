-- 109_ask_friday_learning_feedback_policies.sql
--
-- Make the Ask Friday feedback loop explicit in the surface registry.
-- This does not make learning canonical. Events remain evidence only until
-- reviewed and approved into a context pack / KB candidate.

UPDATE ask_friday_surfaces
   SET memory_policy = memory_policy || '{
     "learningEventPolicy": {
       "required": true,
       "mode": "public_core_events",
       "emitter": "Friday Website",
       "notes": "Website emits compact redacted events to FAD Core; FAD owns review and canonicalization."
     }
   }'::jsonb,
       updated_at = NOW()
 WHERE surface_id IN (
   'website_guest_hero',
   'website_ask_friday_fab',
   'website_owner_enquiry',
   'website_feedback_bug',
   'website_feedback_feature'
 );

UPDATE ask_friday_surfaces
   SET memory_policy = memory_policy || '{
     "learningEventPolicy": {
       "required": true,
       "mode": "direct_runtime",
       "emitter": "FAD global Ask Friday",
       "notes": "Global staff command turns emit staff-private learning events to Core."
     }
   }'::jsonb,
       updated_at = NOW()
 WHERE surface_id = 'fad_global_ask_friday';

UPDATE ask_friday_surfaces
   SET memory_policy = memory_policy || '{
     "learningEventPolicy": {
       "required": true,
       "mode": "direct_runtime",
       "emitter": "Inbox Friday Consult",
       "notes": "Inbox Consult emits staff-private events after draft/advisory turns."
     }
   }'::jsonb,
       updated_at = NOW()
 WHERE surface_id = 'fad_consult';

UPDATE ask_friday_surfaces
   SET memory_policy = memory_policy || '{
     "learningEventPolicy": {
       "required": true,
       "mode": "direct_runtime_and_global_panel_module_mirror",
       "emitter": "Operations Friday Consult plus global Ask Friday",
       "notes": "Direct Ops Consult emits its own events; global right-panel Ops turns also mirror compact module events to this surface."
     }
   }'::jsonb,
       updated_at = NOW()
 WHERE surface_id = 'fad_ops_assistant';

UPDATE ask_friday_surfaces
   SET memory_policy = memory_policy || '{
     "learningEventPolicy": {
       "required": true,
       "mode": "global_panel_module_mirror_until_dedicated_runtime",
       "emitter": "Global Ask Friday",
       "notes": "No dedicated module chat runtime yet; page-aware global right-panel turns mirror compact staff-private events to this surface."
     }
   }'::jsonb,
       updated_at = NOW()
 WHERE surface_id IN (
   'fad_reservations_calendar_assistant',
   'fad_properties_assistant'
 );

UPDATE ask_friday_surfaces
   SET memory_policy = memory_policy || '{
     "learningEventPolicy": {
       "required": false,
       "mode": "planned",
       "emitter": "not_wired_yet",
       "notes": "Surface shell is governed, but runtime learning emitters are deferred until the module agent is built."
     }
   }'::jsonb,
       updated_at = NOW()
 WHERE surface_id IN (
   'fad_finance_assistant',
   'fad_legal_admin_assistant',
   'fad_hr_training_assistant',
   'fad_owners_assistant',
   'fad_analytics_intelligence',
   'guest_portal_ask_friday',
   'public_mcp'
 );

UPDATE ask_friday_surfaces
   SET memory_policy = memory_policy || '{
     "learningEventPolicy": {
       "required": true,
       "mode": "sanitized_summary_api",
       "emitter": "Internal agents",
       "notes": "Internal agents may submit sanitized summaries/candidates only; raw transcripts are not ingested."
     }
   }'::jsonb,
       updated_at = NOW()
 WHERE surface_id = 'internal_agent_bridge';
