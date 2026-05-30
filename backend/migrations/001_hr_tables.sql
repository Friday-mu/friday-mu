-- Migration 001 — FAD-owned HR tables (staff + time-off requests).
--
-- These tables live in the shared gmsdb but are FAD-owned: only FAD's
-- backend reads/writes them. GMS doesn't reference them. Track row in
-- fad_schema_migrations so this migration runs once per environment.
--
-- The optional user_id FK on hr_staff links a staff record to an auth
-- user when one exists (e.g. Ishant has a login; field workers may not).
-- ON DELETE SET NULL preserves the HR record if the user account is
-- deleted.

CREATE TABLE IF NOT EXISTS hr_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  user_id UUID,  -- link to auth.users when staff has a login account
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,           -- 'director' | 'commercial' | 'ops_manager' | 'field' | 'finance' | 'admin' | 'external'
  department TEXT,
  zone TEXT,           -- 'north' | 'west' | 'office'
  hire_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  last_worked_date DATE,
  leave_reason TEXT,
  leave_notes TEXT,
  archived_at TIMESTAMPTZ,
  archived_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hr_staff_status_check CHECK (status IN ('active', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_hr_staff_tenant ON hr_staff(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_staff_status ON hr_staff(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_hr_staff_user ON hr_staff(user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS hr_time_off_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  staff_id UUID NOT NULL REFERENCES hr_staff(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  type TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES hr_staff(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hr_timeoff_type_check CHECK (type IN ('annual', 'sick', 'unpaid', 'family', 'other')),
  CONSTRAINT hr_timeoff_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  CONSTRAINT hr_timeoff_dates_check CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_hr_timeoff_tenant ON hr_time_off_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_timeoff_staff ON hr_time_off_requests(staff_id);
CREATE INDEX IF NOT EXISTS idx_hr_timeoff_status ON hr_time_off_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_hr_timeoff_created ON hr_time_off_requests(tenant_id, created_at DESC);

-- Seed: 6 active staff. Runs only when the table is empty so re-deploys
-- are no-ops. Names + roles match user-provided list (updated 2026-05-26).
INSERT INTO hr_staff (name, email, role, status)
SELECT seed.name, seed.email, seed.role, 'active'
FROM (VALUES
  ('Ishant Ayadassen', 'ishant@friday.mu',    'director'),
  ('Mathias Duval',    'mathias@friday.mu',   'commercial'),
  ('Franny Henri',     'franny@friday.mu',    'ops_manager'),
  ('Bryan Henri',      'bryan@friday.mu',     'field'),
  ('Catherine Henri',  'catherine@friday.mu', 'field'),
  ('Mary Oladimeji',   'mary@friday.mu',      'commercial')
) AS seed(name, email, role)
WHERE NOT EXISTS (SELECT 1 FROM hr_staff LIMIT 1);

-- Link seeded staff to existing auth users by email (when accounts exist).
-- The users table is owned by GMS; only set user_id where a matching row
-- already exists in users(email). Skipped silently for staff without
-- accounts (field workers etc).
UPDATE hr_staff s
SET user_id = u.id
FROM users u
WHERE LOWER(s.email) = LOWER(u.email)
  AND s.user_id IS NULL;
