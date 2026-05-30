-- 108_ask_friday_website_public_action_scope.sql
--
-- Allow friday.mu public Ask Friday surfaces to enqueue approval-gated
-- action requests through Ask Friday Core. Surface policy still controls the
-- specific allowed actions; this migration only grants the API client the
-- route scope needed for owner follow-up and feedback issue requests.

WITH updated_client AS (
  UPDATE api_clients
     SET scopes = (
       SELECT jsonb_agg(scope ORDER BY scope)
         FROM (
           SELECT DISTINCT jsonb_array_elements_text(
             scopes || '[
               "ask-friday:actions:write"
             ]'::jsonb
           ) AS scope
         ) s
     )
   WHERE client_id = 'friday-website'
     AND revoked_at IS NULL
     AND NOT (scopes ? 'ask-friday:actions:write')
   RETURNING client_id, scopes
)
INSERT INTO api_client_audit (client_id, event, reason, metadata)
SELECT client_id,
       'scope_added',
       'Website Ask Friday owner enquiry and feedback surfaces require approval-gated action-request writes',
       '{"scopes":["ask-friday:actions:write"],"migration":"108_ask_friday_website_public_action_scope.sql"}'::jsonb
  FROM updated_client;
