-- Migration 072 — HR roster persistence for Operations scheduling.
--
-- This is FAD's own weekly availability roster. It replaces the
-- frontend-only roster fixture for staff/date availability, but it is
-- not a Breezeway runtime dependency and not the future task-calendar
-- assignment table.

CREATE TABLE IF NOT EXISTS hr_roster_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  published_at TIMESTAMPTZ,
  published_by UUID,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hr_roster_week_status_check CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT hr_roster_week_dates_check CHECK (week_end >= week_start),
  CONSTRAINT hr_roster_week_unique UNIQUE (tenant_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_hr_roster_weeks_tenant_status
  ON hr_roster_weeks(tenant_id, status, week_start DESC);

CREATE TABLE IF NOT EXISTS hr_roster_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  week_id UUID NOT NULL REFERENCES hr_roster_weeks(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES hr_staff(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  availability TEXT NOT NULL DEFAULT 'on',
  zone TEXT,
  leave_type TEXT,
  start_time TIME,
  end_time TIME,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hr_roster_day_availability_check CHECK (availability IN ('on', 'off', 'leave', 'standby')),
  CONSTRAINT hr_roster_day_zone_check CHECK (zone IS NULL OR zone IN ('north', 'west', 'office')),
  CONSTRAINT hr_roster_day_leave_type_check CHECK (leave_type IS NULL OR leave_type IN ('annual', 'sick', 'personal', 'unpaid', 'family', 'other')),
  CONSTRAINT hr_roster_day_time_check CHECK (end_time IS NULL OR start_time IS NULL OR end_time >= start_time),
  CONSTRAINT hr_roster_day_unique UNIQUE (tenant_id, week_id, staff_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_hr_roster_days_staff_date
  ON hr_roster_days(tenant_id, staff_id, work_date);

CREATE INDEX IF NOT EXISTS idx_hr_roster_days_week
  ON hr_roster_days(tenant_id, week_id, work_date);

COMMENT ON TABLE hr_roster_weeks IS 'FAD-owned weekly staff availability roster for Operations.';
COMMENT ON TABLE hr_roster_days IS 'One staff availability cell per roster week/date.';
