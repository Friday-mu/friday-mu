-- 069_supersede_stale_inbox_drafts.sql
--
-- Old imported draft runs left many `draft_ready` rows attached to
-- messages that were no longer the latest substantive inbound message.
-- That polluted the Inbox Review chip and could present operators with
-- replies to already-answered conversations. Keep only the newest
-- actionable draft for the current latest inbound message; supersede
-- everything else.

WITH latest_message AS (
  SELECT DISTINCT ON (conversation_id)
         conversation_id, id, direction
    FROM messages
   ORDER BY conversation_id, created_at DESC, id::text DESC
),
current_latest_draft AS (
  SELECT DISTINCT ON (d.conversation_id)
         d.conversation_id, d.id
    FROM drafts d
    JOIN latest_message lm
      ON lm.conversation_id = d.conversation_id
     AND lm.id = d.message_id
     AND lm.direction = 'inbound'
   WHERE d.state IN (
     'draft_ready',
     'under_review',
     'friday_drafting',
     'generation_failed',
     'send_queued',
     'send_failed'
   )
   ORDER BY d.conversation_id, d.created_at DESC, d.id::text DESC
)
UPDATE drafts d
   SET state = 'superseded',
       updated_at = NOW()
  FROM latest_message lm
 WHERE lm.conversation_id = d.conversation_id
   AND d.state IN (
     'draft_ready',
     'under_review',
     'friday_drafting',
     'generation_failed',
     'send_queued',
     'send_failed'
   )
   AND (
     lm.direction <> 'inbound'
     OR d.message_id <> lm.id
     OR d.id <> COALESCE(
       (SELECT cld.id FROM current_latest_draft cld WHERE cld.conversation_id = d.conversation_id),
       d.id
     )
   );

WITH latest_message AS (
  SELECT DISTINCT ON (conversation_id)
         conversation_id, id, direction
    FROM messages
   ORDER BY conversation_id, created_at DESC, id::text DESC
)
UPDATE drafts d
   SET state = 'superseded',
       updated_at = NOW()
 WHERE d.state IN (
   'draft_ready',
   'under_review',
   'friday_drafting',
   'generation_failed',
   'send_queued',
   'send_failed'
 )
   AND NOT EXISTS (
     SELECT 1 FROM latest_message lm WHERE lm.conversation_id = d.conversation_id
   );
