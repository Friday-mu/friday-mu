-- 099_teachings_friday_consult_source.sql
--
-- Friday Consult writes explicit teachings with source='friday_consult'.
-- Older production schemas only allowed manual/auto_pattern/direct, which
-- made successful Consult "learn" actions fail at persistence time.

ALTER TABLE teachings
  DROP CONSTRAINT IF EXISTS teachings_source_check;

ALTER TABLE teachings
  ADD CONSTRAINT teachings_source_check
  CHECK (source IN ('manual', 'auto_pattern', 'direct', 'friday_consult'));
