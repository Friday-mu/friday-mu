-- 104_ask_friday_website_public_core_scopes.sql
--
-- Unblock friday.mu public Ask Friday Core wiring. The Website emits
-- compact redacted learning events and consumes approved public context
-- packs; FAD keeps ownership of scopes, registry policy, review, and
-- canonical context-pack publication.

WITH updated_client AS (
  UPDATE api_clients
     SET scopes = (
       SELECT jsonb_agg(scope ORDER BY scope)
         FROM (
           SELECT DISTINCT jsonb_array_elements_text(
             scopes || '[
               "ask-friday:context:read",
               "ask-friday:events:write"
             ]'::jsonb
           ) AS scope
         ) s
     )
   WHERE client_id = 'friday-website'
     AND revoked_at IS NULL
     AND NOT (scopes ?& ARRAY[
       'ask-friday:context:read',
       'ask-friday:events:write'
     ])
   RETURNING client_id, scopes
)
INSERT INTO api_client_audit (client_id, event, reason, metadata)
SELECT client_id,
       'scope_added',
       'Website Ask Friday Core wiring requires context-pack reads and learning-event writes',
       '{"scopes":["ask-friday:context:read","ask-friday:events:write"],"migration":"104_ask_friday_website_public_core_scopes.sql"}'::jsonb
  FROM updated_client;

UPDATE ask_friday_surfaces
   SET allowed_tools = ARRAY(
         SELECT DISTINCT tool
           FROM unnest(allowed_tools || ARRAY[
             'route_intent',
             'search_residences',
             'search_experiences',
             'check_availability',
             'get_residence',
             'get_experience',
             'search_journal',
             'search_places',
             'send_enquiry',
             'open_experience_modal'
           ]::text[]) AS t(tool)
          ORDER BY tool
       ),
       updated_at = NOW()
 WHERE surface_id IN ('website_guest_hero', 'website_ask_friday_fab');
