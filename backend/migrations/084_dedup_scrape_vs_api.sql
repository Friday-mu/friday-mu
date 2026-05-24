-- 084_dedup_scrape_vs_api.sql
--
-- Architectural fix per Ishant 2026-05-25: scraping is a fallback. The
-- moment the Guesty API returns a reservation, the API row is the source
-- of truth and any scrape row for the same booking should disappear.
--
-- The scraper writes synthetic guesty_ids like `scrape:HMZ2XSQKSA`;
-- the Guesty API writes its real `_id` (e.g. `698c41cfaaf2...`). The
-- existing UPSERT key (tenant_id, guesty_id) never matches across the
-- two paths → 10+ stale scrape rows lingering after the API caught up.
-- This shows up as bad analytics: nights double-counted, fake stays
-- on the Multi-calendar, occupancy > 100%.
--
-- Two changes here:
--   1. ONE-SHOT DEDUP: delete every scrape-l3 row that shares a
--      confirmation_code with a non-scrape row from the same tenant.
--   2. PARTIAL UNIQUE INDEX: prevent a scrape row from being inserted
--      when an API row with the same confirmation_code already exists.
--      (Defense-in-depth alongside the code change in sync.js + the
--      scraped_webhook.)
--
-- New index on confirmation_code so the dedupe runtime query is cheap.

CREATE INDEX IF NOT EXISTS idx_guesty_reservations_tenant_confirmation
  ON guesty_reservations (tenant_id, confirmation_code)
  WHERE confirmation_code IS NOT NULL;

-- One-shot dedup. Per (tenant_id, confirmation_code), if ANY non-scrape
-- row exists, delete the scrape rows. Keeps the API/owner/manual rows.
DELETE FROM guesty_reservations gr
USING (
  SELECT DISTINCT confirmation_code, tenant_id
  FROM guesty_reservations
  WHERE confirmation_code IS NOT NULL
    AND source <> 'scrape-l3'
    AND source IS NOT NULL
) authoritative
WHERE gr.tenant_id = authoritative.tenant_id
  AND gr.confirmation_code = authoritative.confirmation_code
  AND gr.source = 'scrape-l3';
