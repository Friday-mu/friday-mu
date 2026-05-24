-- 090_calendar_blocks.sql
--
-- Calendar v0.5 — block-dates feature. Ishant: "the block calendar
-- dates should be important."
--
-- Design: separate overlay table on top of guesty_calendar rather than
-- writing into the Guesty cache directly. The standard Guesty calendar
-- worker overwrites guesty_calendar rows on every sync — if we wrote
-- our blocks there, the next sync would clobber them. The overlay lets
-- FAD-blocked dates persist across re-syncs.
--
-- Reads: /api/calendar/grid LEFT JOINs this table and marks blocked
-- cells as is_available=false in the response shape, regardless of
-- what Guesty's cached row says.
--
-- Writes (Phase 1): FAD-local only. Phase 2: write-through to Guesty's
-- block-dates API when channel-manager work lands.
--
-- Multi-tenant: every row carries tenant_id; route guards filter by
-- req.tenantId before any read/write.

CREATE TABLE IF NOT EXISTS fad_calendar_blocks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
                      REFERENCES tenants(id) ON DELETE CASCADE,
  listing_guesty_id   TEXT NOT NULL,
  date                DATE NOT NULL,
  -- Optional categorical reason — drives the chip color + helps owner
  -- statements distinguish owner stays from operational blocks.
  reason              TEXT CHECK (reason IS NULL OR reason IN
                      ('owner_stay', 'maintenance', 'private_use',
                       'channel_block', 'other')),
  notes               TEXT,
  created_by_user_id  UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fad_calendar_blocks_unique
    UNIQUE (tenant_id, listing_guesty_id, date)
);

CREATE INDEX IF NOT EXISTS idx_fad_calendar_blocks_lookup
  ON fad_calendar_blocks(tenant_id, listing_guesty_id, date);

CREATE INDEX IF NOT EXISTS idx_fad_calendar_blocks_tenant_date
  ON fad_calendar_blocks(tenant_id, date);

DROP TRIGGER IF EXISTS trg_fad_calendar_blocks_updated_at ON fad_calendar_blocks;
CREATE TRIGGER trg_fad_calendar_blocks_updated_at
  BEFORE UPDATE ON fad_calendar_blocks
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_now();
