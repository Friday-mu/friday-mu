-- 093 — Align FAD staff directory with the locked Ops roster policy.
--
-- Source of truth captured 2026-05-26:
-- Mathias Duval, Bryan Henri, Franny Henri, Catherine Henri,
-- Ishant Ayadassen, Mary Oladimeji.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.hr_staff') IS NOT NULL THEN
    UPDATE hr_staff
       SET name = 'Ishant Ayadassen',
           role = 'director',
           department = COALESCE(department, 'admin'),
           zone = COALESCE(zone, 'west'),
           status = 'active',
           updated_at = NOW()
     WHERE LOWER(email) = 'ishant@friday.mu'
        OR name IN ('Ishant', 'Ishant Sagoo');

    UPDATE hr_staff
       SET name = 'Mathias Duval',
           role = 'commercial',
           department = COALESCE(department, 'commercial'),
           zone = COALESCE(zone, 'north'),
           status = 'active',
           updated_at = NOW()
     WHERE LOWER(email) IN ('mathias@friday.mu', 'matias@friday.mu')
        OR name IN ('Mathias', 'Matias', 'Mathias David', 'Mathias Chen');

    UPDATE hr_staff
       SET name = 'Franny Henri',
           role = 'ops_manager',
           department = COALESCE(department, 'operations'),
           zone = COALESCE(zone, 'north'),
           status = 'active',
           updated_at = NOW()
     WHERE LOWER(email) = 'franny@friday.mu'
        OR name IN ('Franny', 'Franny Reyes');

    UPDATE hr_staff
       SET name = 'Mary Oladimeji',
           role = 'commercial',
           department = COALESCE(department, 'guest_services'),
           zone = COALESCE(zone, 'office'),
           status = 'active',
           updated_at = NOW()
     WHERE LOWER(email) = 'mary@friday.mu'
        OR name IN ('Mary', 'Mary Nunes');

    UPDATE hr_staff
       SET name = 'Bryan Henri',
           role = 'field',
           department = COALESCE(department, 'operations'),
           zone = COALESCE(zone, 'north'),
           status = 'active',
           updated_at = NOW()
     WHERE LOWER(email) = 'bryan@friday.mu'
        OR name IN ('Bryan', 'Bryan Patel', 'Bryan Lin');

    UPDATE hr_staff
       SET name = 'Catherine Henri',
           role = 'field',
           department = COALESCE(department, 'operations'),
           zone = COALESCE(zone, 'north'),
           status = 'active',
           updated_at = NOW()
     WHERE LOWER(email) = 'catherine@friday.mu'
        OR name IN ('Catherine', 'Catherine Henry');

    UPDATE hr_staff
       SET status = 'archived',
           last_worked_date = COALESCE(last_worked_date, CURRENT_DATE),
           leave_reason = COALESCE(leave_reason, 'not_current_fad_staff'),
           archived_at = COALESCE(archived_at, NOW()),
           updated_at = NOW()
     WHERE LOWER(COALESCE(email, '')) IN ('judith@friday.mu', 'alex@friday.mu', 'alexandra@friday.mu', 'hans@friday.mu')
        OR name IN ('Judith Friday', 'Alex Legentil', 'Alex Rivera', 'Alexandra', 'Hans Jowaheer');
  END IF;

  IF to_regclass('public.users') IS NOT NULL THEN
    UPDATE users
       SET display_name = 'Ishant Ayadassen',
           fad_role = 'director'
     WHERE LOWER(COALESCE(email, '')) = 'ishant@friday.mu'
        OR LOWER(COALESCE(username, '')) = 'ishant@friday.mu';

    UPDATE users
       SET display_name = 'Mathias Duval',
           fad_role = 'commercial_marketing'
     WHERE LOWER(COALESCE(email, '')) IN ('mathias@friday.mu', 'matias@friday.mu')
        OR LOWER(COALESCE(username, '')) IN ('mathias@friday.mu', 'matias@friday.mu');

    UPDATE users
       SET display_name = 'Franny Henri',
           fad_role = 'ops_manager'
     WHERE LOWER(COALESCE(email, '')) = 'franny@friday.mu'
        OR LOWER(COALESCE(username, '')) = 'franny@friday.mu';

    UPDATE users
       SET display_name = 'Mary Oladimeji',
           fad_role = 'commercial_marketing'
     WHERE LOWER(COALESCE(email, '')) = 'mary@friday.mu'
        OR LOWER(COALESCE(username, '')) = 'mary@friday.mu';

    UPDATE users
       SET display_name = 'Bryan Henri',
           fad_role = 'field'
     WHERE LOWER(COALESCE(email, '')) = 'bryan@friday.mu'
        OR LOWER(COALESCE(username, '')) = 'bryan@friday.mu';

    UPDATE users
       SET display_name = 'Catherine Henri',
           fad_role = 'field'
     WHERE LOWER(COALESCE(email, '')) = 'catherine@friday.mu'
        OR LOWER(COALESCE(username, '')) = 'catherine@friday.mu';
  END IF;

  IF to_regclass('public.staff_members') IS NOT NULL THEN
    INSERT INTO staff_members (name, email, role, active)
    VALUES
      ('Ishant Ayadassen', 'ishant@friday.mu', 'admin', TRUE),
      ('Franny Henri', 'franny@friday.mu', 'manager', TRUE),
      ('Mathias Duval', 'mathias@friday.mu', 'manager', TRUE),
      ('Mary Oladimeji', 'mary@friday.mu', 'staff', TRUE),
      ('Bryan Henri', 'bryan@friday.mu', 'staff', TRUE),
      ('Catherine Henri', 'catherine@friday.mu', 'staff', TRUE)
    ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name,
           role = EXCLUDED.role,
           active = TRUE;

    UPDATE staff_members
       SET active = FALSE
     WHERE LOWER(email) IN ('judith@friday.mu', 'alex@friday.mu', 'alexandra@friday.mu', 'hans@friday.mu', 'matias@friday.mu')
        OR name IN ('Judith Friday', 'Alex Legentil', 'Alex Rivera', 'Alexandra', 'Hans Jowaheer', 'Matias');
  END IF;
END $$;

COMMIT;
