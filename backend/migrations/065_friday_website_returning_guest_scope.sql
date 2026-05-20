-- 065_friday_website_returning_guest_scope.sql
--
-- Stage 4 website public API cutover: /api/public/returning-guest reads
-- the reservation cache and is guarded by reservations:read. The original
-- friday-website client was issued before that endpoint shipped, so add the
-- missing read scope without rotating the secret.

UPDATE api_clients
   SET scopes = (
     SELECT jsonb_agg(scope ORDER BY scope)
       FROM (
         SELECT DISTINCT jsonb_array_elements_text(scopes || '["reservations:read"]'::jsonb) AS scope
       ) s
   )
 WHERE client_id = 'friday-website'
   AND revoked_at IS NULL
   AND NOT (scopes ? 'reservations:read');

INSERT INTO api_client_audit (client_id, event, reason, metadata)
SELECT 'friday-website',
       'scope_added',
       'Stage 4 returning-guest public API requires reservations:read',
       '{"scope":"reservations:read","migration":"065_friday_website_returning_guest_scope.sql"}'::jsonb
WHERE EXISTS (
  SELECT 1
    FROM api_clients
   WHERE client_id = 'friday-website'
     AND revoked_at IS NULL
     AND scopes ? 'reservations:read'
);
