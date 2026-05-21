-- 070_supersede_drafts_after_any_outbound.sql
--
-- Follow-up to 069: the guard must treat later outbound messages as
-- real even when legacy imports marked them `is_auto_response = true`.
-- If the latest message is outbound, no draft should remain actionable.

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
