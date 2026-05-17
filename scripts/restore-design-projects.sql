-- One-shot restoration: re-create the 4 design projects that were
-- accidentally deleted (n_tup_del=4 confirmed via pg_stat_user_tables).
-- Per Ishant 2026-05-17 — these were real projects, not demo:
--   * Duval — Flic en Flac          (lead stage)
--   * Residence Camelia 15 — closeout (reconciliation, waiting on owner)
--   * Lagon Bleu LB-2 — closeout    (reconciliation, in-progress)
--   * Lagon Bleu LB-3 — closeout    (reconciliation, waiting on owner)
--
-- Data sourced from the original frontend fixture (PROJECTS in
-- _data/design.ts:1226–1366) which captured the state these projects
-- were in before the delete. Owner emails are placeholders — Ishant
-- should replace with real contacts post-restore.
--
-- Every insert is guarded with NOT EXISTS so re-running is a no-op.
-- Wrapped in a transaction so a partial failure rolls back cleanly.

BEGIN;

-- ─────────────────────────── COUNTERPARTIES ───────────────────────────

INSERT INTO design_counterparties (name, email, phone, notes)
SELECT t.name, t.email, t.phone, t.notes
FROM (VALUES
  ('Matthieu Duval',          'matthieu.duval@example.com', NULL,        'Duval project owner — originally a WhatsApp lead, now an active project'),
  ('Residence Camelia 15 owner', 'owner-rc15@example.com',  NULL,        'Camelia 15 closeout — placeholder, replace with real owner contact'),
  ('Lagon Bleu LB-2 owner',   'owner-lb2@example.com',      NULL,        'Lagon Bleu LB-2 closeout — placeholder, replace with real owner contact'),
  ('Lagon Bleu LB-3 owner',   'owner-lb3@example.com',      NULL,        'Lagon Bleu LB-3 closeout — placeholder, replace with real owner contact')
) AS t(name, email, phone, notes)
WHERE NOT EXISTS (SELECT 1 FROM design_counterparties WHERE LOWER(email) = LOWER(t.email));

-- ─────────────────────────── PROPERTIES ───────────────────────────

INSERT INTO design_properties (counterparty_id, name, city, state, notes)
SELECT c.id, p.name, p.city, p.state, p.notes
FROM (VALUES
  ('matthieu.duval@example.com', 'Duval — Flic en Flac',     'Flic en Flac',         'Mauritius', 'Friday Design — renovation, lead stage'),
  ('owner-rc15@example.com',     'Residence Camelia 15',     'Beau Plan',            'Mauritius', 'Friday Design — closeout, RC-15 (Friday Retreats listing)'),
  ('owner-lb2@example.com',      'Lagon Bleu LB-2',          'Lagon Bleu Complex',   'Mauritius', 'Friday Design — closeout, LB-2 (Friday Retreats listing)'),
  ('owner-lb3@example.com',      'Lagon Bleu LB-3',          'Lagon Bleu Complex',   'Mauritius', 'Friday Design — closeout, LB-3 (Friday Retreats listing)')
) AS p(owner_email, name, city, state, notes)
JOIN design_counterparties c ON LOWER(c.email) = LOWER(p.owner_email)
WHERE NOT EXISTS (SELECT 1 FROM design_properties dp WHERE dp.name = p.name);

-- ─────────────────────────── PROJECTS ───────────────────────────

-- Duval — Flic en Flac: lead stage. Not yet costed.
INSERT INTO design_projects (
  name, slug, counterparty_id, property_id,
  classification, lead_source,
  budget_expectation_minor,
  goals, outcomes, urgency,
  current_stage, stage_status, engagement_scope, lifecycle_status,
  start_date
)
SELECT 'Duval — Flic en Flac', 'duval-flicflac', c.id, p.id,
       'renovation', 'whatsapp',
       120000000,  -- MUR 1.2M
       ARRAY['renovation', 'styling']::text[],
       ARRAY['raise_adr']::text[],
       '2026-08-01',
       'lead', 'in-progress', 'design_and_execution', 'active',
       (CURRENT_DATE - INTERVAL '4 days')::date
FROM design_counterparties c
JOIN design_properties p ON p.counterparty_id = c.id AND p.name = 'Duval — Flic en Flac'
WHERE c.email = 'matthieu.duval@example.com'
  AND NOT EXISTS (SELECT 1 FROM design_projects WHERE slug = 'duval-flicflac');

-- Residence Camelia 15: closeout / reconciliation, waiting on owner.
INSERT INTO design_projects (
  name, slug, counterparty_id, property_id,
  classification, tier, lead_source,
  epc_minor, budget_expectation_minor,
  goals, outcomes,
  current_stage, stage_status, engagement_scope, lifecycle_status,
  start_date
)
SELECT 'Residence Camelia 15 — closeout', 'residence-camelia-15', c.id, p.id,
       'furnishing', 3, 'existing_owner',
       42000000, 42000000,  -- MUR 420k
       ARRAY['furnishing']::text[],
       ARRAY['list_property']::text[],
       'reconciliation', 'waiting-on-owner', 'design_and_execution', 'active',
       (CURRENT_DATE - INTERVAL '180 days')::date
FROM design_counterparties c
JOIN design_properties p ON p.counterparty_id = c.id AND p.name = 'Residence Camelia 15'
WHERE c.email = 'owner-rc15@example.com'
  AND NOT EXISTS (SELECT 1 FROM design_projects WHERE slug = 'residence-camelia-15');

-- Lagon Bleu LB-2: closeout / reconciliation, in progress.
INSERT INTO design_projects (
  name, slug, counterparty_id, property_id,
  classification, tier, lead_source,
  epc_minor, budget_expectation_minor,
  goals, outcomes,
  current_stage, stage_status, engagement_scope, lifecycle_status,
  start_date
)
SELECT 'Lagon Bleu LB-2 — closeout', 'lagon-bleu-lb-2', c.id, p.id,
       'renovation', 2, 'existing_owner',
       85000000, 85000000,  -- MUR 850k
       ARRAY['renovation','furnishing']::text[],
       ARRAY['list_property']::text[],
       'reconciliation', 'in-progress', 'design_and_execution', 'active',
       (CURRENT_DATE - INTERVAL '210 days')::date
FROM design_counterparties c
JOIN design_properties p ON p.counterparty_id = c.id AND p.name = 'Lagon Bleu LB-2'
WHERE c.email = 'owner-lb2@example.com'
  AND NOT EXISTS (SELECT 1 FROM design_projects WHERE slug = 'lagon-bleu-lb-2');

-- Lagon Bleu LB-3: closeout / reconciliation, waiting on owner.
INSERT INTO design_projects (
  name, slug, counterparty_id, property_id,
  classification, tier, lead_source,
  epc_minor, budget_expectation_minor,
  goals, outcomes,
  current_stage, stage_status, engagement_scope, lifecycle_status,
  start_date
)
SELECT 'Lagon Bleu LB-3 — closeout', 'lagon-bleu-lb-3', c.id, p.id,
       'renovation', 2, 'existing_owner',
       72000000, 72000000,  -- MUR 720k
       ARRAY['renovation','furnishing']::text[],
       ARRAY['list_property']::text[],
       'reconciliation', 'waiting-on-owner', 'design_and_execution', 'active',
       (CURRENT_DATE - INTERVAL '200 days')::date
FROM design_counterparties c
JOIN design_properties p ON p.counterparty_id = c.id AND p.name = 'Lagon Bleu LB-3'
WHERE c.email = 'owner-lb3@example.com'
  AND NOT EXISTS (SELECT 1 FROM design_projects WHERE slug = 'lagon-bleu-lb-3');

-- ─────────────────────────── STAGES ───────────────────────────
--
-- Stage progression for each project. Same pattern as 003_design_seed.sql:
-- earlier stages marked 'done' with backdated entered_at / completed_at,
-- current stage marked with the project's stage_status.

-- Duval: only 'lead' is in progress. No prior done stages.
DO $duval_stages$
DECLARE pid UUID;
BEGIN
  SELECT id INTO pid FROM design_projects WHERE slug = 'duval-flicflac';
  IF pid IS NULL THEN RETURN; END IF;
  INSERT INTO design_stages (project_id, stage_key, status, entered_at)
  VALUES (pid, 'lead', 'in-progress', NOW() - INTERVAL '4 days')
  ON CONFLICT (project_id, stage_key) DO NOTHING;
END;
$duval_stages$;

-- Reusable: full 16-stage history done + reconciliation as current.
-- Stage list matches the canonical sequence in StageId enum (design.ts).
DO $closeout_stages$
DECLARE
  done_keys TEXT[] := ARRAY[
    'lead','proposal','doc-request','site-visit','preferences','rough-budget',
    'agreement','signature','payment-gate','moodboard','design-pack','design-review',
    'final-budget','design-procurement','execution','closeout'
  ];
  proj RECORD;
  k TEXT;
  i INT;
  stride INT := 11;  -- days per stage; 11 * 16 ≈ 176 days project length
BEGIN
  FOR proj IN
    SELECT id, slug, stage_status, start_date FROM design_projects
    WHERE slug IN ('residence-camelia-15','lagon-bleu-lb-2','lagon-bleu-lb-3')
  LOOP
    i := 0;
    FOREACH k IN ARRAY done_keys LOOP
      INSERT INTO design_stages (project_id, stage_key, status, entered_at, completed_at)
      VALUES (
        proj.id, k, 'done',
        NOW() - (((array_length(done_keys, 1) - i + 1) * stride) || ' days')::interval,
        NOW() - (((array_length(done_keys, 1) - i)     * stride + 1) || ' days')::interval
      )
      ON CONFLICT (project_id, stage_key) DO NOTHING;
      i := i + 1;
    END LOOP;
    -- Reconciliation as the current stage. status comes from the project.
    INSERT INTO design_stages (project_id, stage_key, status, entered_at)
    VALUES (proj.id, 'reconciliation', proj.stage_status, NOW() - INTERVAL '5 days')
    ON CONFLICT (project_id, stage_key) DO NOTHING;
  END LOOP;
END;
$closeout_stages$;

-- ─────────────────────────── SANITY ───────────────────────────

SELECT 'design_projects' AS table, COUNT(*) FROM design_projects WHERE lifecycle_status = 'active'
UNION ALL
SELECT 'design_counterparties', COUNT(*) FROM design_counterparties
UNION ALL
SELECT 'design_properties', COUNT(*) FROM design_properties
UNION ALL
SELECT 'design_stages (4 restored)', COUNT(*) FROM design_stages
WHERE project_id IN (SELECT id FROM design_projects WHERE slug IN ('duval-flicflac','residence-camelia-15','lagon-bleu-lb-2','lagon-bleu-lb-3'));

COMMIT;
