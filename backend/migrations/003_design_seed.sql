-- Migration 003 — initial Design OS seed data.
--
-- Per Sprint chat 2026-05-13:
--   * 1 lead: Matthieu Duval (qualified, not yet converted).
--   * 3 projects in different stages of progression:
--       - Ohana House (OH-2)      → final-budget stage, near handover
--       - Albion - Tasleem        → design-pack stage, moodboard approved
--       - Ocean Terrace 5 (OT-5)  → lead stage, not yet started
--
-- Each project gets a counterparty (owner), property, and stage rows
-- reflecting its current position. Where reaching a stage implies an
-- artifact exists (moodboards, packs, agreements, payments), those are
-- seeded too so the UI renders something coherent in QA.
--
-- Every insert is guarded with NOT EXISTS / ON CONFLICT so re-running
-- the migration is a no-op.

-- ─────────────────────────── COUNTERPARTIES ───────────────────────────

INSERT INTO design_counterparties (name, email, notes)
SELECT t.name, t.email, t.notes
FROM (VALUES
  ('Ohana House owner',    'owner-oh2@example.com',  'Placeholder — replace with real owner contact'),
  ('Tasleem',              'tasleem@example.com',    'Albion project owner'),
  ('Ocean Terrace 5 owner','owner-ot5@example.com',  'Placeholder — replace with real owner contact')
) AS t(name, email, notes)
WHERE NOT EXISTS (SELECT 1 FROM design_counterparties WHERE LOWER(email) = LOWER(t.email));

-- ─────────────────────────── PROPERTIES ───────────────────────────

INSERT INTO design_properties (counterparty_id, name, city, state, notes)
SELECT c.id, p.name, p.city, p.state, p.notes
FROM (VALUES
  ('owner-oh2@example.com',  'Ohana House (OH-2)',       NULL,    'Mauritius', 'Friday Design — final-budget stage'),
  ('tasleem@example.com',    'Albion - Tasleem',         'Albion','Mauritius', 'Friday Design — design-pack stage'),
  ('owner-ot5@example.com',  'Ocean Terrace 5 (OT-5)',   NULL,    'Mauritius', 'Friday Design — not started yet')
) AS p(owner_email, name, city, state, notes)
JOIN design_counterparties c ON LOWER(c.email) = LOWER(p.owner_email)
WHERE NOT EXISTS (SELECT 1 FROM design_properties dp WHERE dp.name = p.name);

-- ─────────────────────────── PROJECTS ───────────────────────────

-- Ohana House (OH-2): final-budget. Tier 2 renovation, well-progressed.
INSERT INTO design_projects (
  name, slug, counterparty_id, property_id, classification, tier, lead_source,
  budget_expectation_minor, goals, outcomes, current_stage, stage_status,
  lifecycle_status, start_date
)
SELECT 'Ohana House (OH-2)', 'oh-2', c.id, p.id,
       'renovation', 2, 'existing_owner',
       1500000000,  -- MUR 15M (in minor units / cents)
       ARRAY['Refresh kitchen + master suite', 'Improve coastal weather resilience'],
       ARRAY['Move-in-ready by handover', 'Furniture catalog handed to ops'],
       'final-budget', 'in-progress', 'active',
       (CURRENT_DATE - INTERVAL '120 days')::date
FROM design_counterparties c
JOIN design_properties p ON p.counterparty_id = c.id AND p.name = 'Ohana House (OH-2)'
WHERE c.email = 'owner-oh2@example.com'
  AND NOT EXISTS (SELECT 1 FROM design_projects WHERE slug = 'oh-2');

-- Albion - Tasleem: design-pack stage. Tier 1 furnishing.
INSERT INTO design_projects (
  name, slug, counterparty_id, property_id, classification, tier, lead_source,
  budget_expectation_minor, goals, outcomes, current_stage, stage_status,
  lifecycle_status, start_date
)
SELECT 'Albion - Tasleem', 'albion-tasleem', c.id, p.id,
       'furnishing', 1, 'owner_referral',
       400000000,  -- MUR 4M
       ARRAY['Furnish 3-bedroom villa for short-term rental'],
       ARRAY['Move-in within 8 weeks', 'Vendor list ready for ops'],
       'design-pack', 'in-progress', 'active',
       (CURRENT_DATE - INTERVAL '45 days')::date
FROM design_counterparties c
JOIN design_properties p ON p.counterparty_id = c.id AND p.name = 'Albion - Tasleem'
WHERE c.email = 'tasleem@example.com'
  AND NOT EXISTS (SELECT 1 FROM design_projects WHERE slug = 'albion-tasleem');

-- Ocean Terrace 5 (OT-5): lead stage, not yet started.
INSERT INTO design_projects (
  name, slug, counterparty_id, property_id, classification, lead_source,
  goals, current_stage, stage_status, lifecycle_status, start_date
)
SELECT 'Ocean Terrace 5 (OT-5)', 'ot-5', c.id, p.id,
       'mixed', 'website',
       ARRAY['Discovery TBD — initial intake'],
       'lead', 'pending', 'active',
       (CURRENT_DATE - INTERVAL '3 days')::date
FROM design_counterparties c
JOIN design_properties p ON p.counterparty_id = c.id AND p.name = 'Ocean Terrace 5 (OT-5)'
WHERE c.email = 'owner-ot5@example.com'
  AND NOT EXISTS (SELECT 1 FROM design_projects WHERE slug = 'ot-5');

-- ─────────────────────────── STAGE ROWS ───────────────────────────

-- OH-2: stages 1..12 done, final-budget (13) in-progress. Spread the
-- completion dates across ~110 days so time-in-stage analytics has
-- something realistic to chart.
DO $oh2_stages$
DECLARE
  pid UUID;
  keys TEXT[] := ARRAY['lead','proposal','doc-request','site-visit','preferences','rough-budget','agreement','signature','payment-gate','moodboard','design-pack','design-review'];
  k TEXT;
  i INT := 0;
  stride INT := 9;  -- days per stage
BEGIN
  SELECT id INTO pid FROM design_projects WHERE slug = 'oh-2';
  IF pid IS NULL THEN RETURN; END IF;
  FOREACH k IN ARRAY keys LOOP
    INSERT INTO design_stages (project_id, stage_key, status, entered_at, completed_at)
    VALUES (
      pid, k, 'done',
      NOW() - (((array_length(keys, 1) - i) * stride) || ' days')::interval,
      NOW() - (((array_length(keys, 1) - i - 1) * stride + 1) || ' days')::interval
    )
    ON CONFLICT (project_id, stage_key) DO NOTHING;
    i := i + 1;
  END LOOP;
  -- Active stage: final-budget. Entered after the last completed stage.
  INSERT INTO design_stages (project_id, stage_key, status, entered_at)
  VALUES (pid, 'final-budget', 'in-progress', NOW() - INTERVAL '1 day')
  ON CONFLICT (project_id, stage_key) DO NOTHING;
END $oh2_stages$;

-- Albion: stages 1..10 done, design-pack (11) in-progress.
DO $albion_stages$
DECLARE
  pid UUID;
  keys TEXT[] := ARRAY['lead','proposal','doc-request','site-visit','preferences','rough-budget','agreement','signature','payment-gate','moodboard'];
  k TEXT;
  i INT := 0;
  stride INT := 4;
BEGIN
  SELECT id INTO pid FROM design_projects WHERE slug = 'albion-tasleem';
  IF pid IS NULL THEN RETURN; END IF;
  FOREACH k IN ARRAY keys LOOP
    INSERT INTO design_stages (project_id, stage_key, status, entered_at, completed_at)
    VALUES (
      pid, k, 'done',
      NOW() - (((array_length(keys, 1) - i) * stride) || ' days')::interval,
      NOW() - (((array_length(keys, 1) - i - 1) * stride + 1) || ' days')::interval
    )
    ON CONFLICT (project_id, stage_key) DO NOTHING;
    i := i + 1;
  END LOOP;
  INSERT INTO design_stages (project_id, stage_key, status, entered_at)
  VALUES (pid, 'design-pack', 'in-progress', NOW() - INTERVAL '1 day')
  ON CONFLICT (project_id, stage_key) DO NOTHING;
END $albion_stages$;

-- OT-5: just the lead stage, pending.
INSERT INTO design_stages (project_id, stage_key, status, entered_at)
SELECT id, 'lead', 'pending', NOW() - INTERVAL '3 days'
FROM design_projects WHERE slug = 'ot-5'
ON CONFLICT (project_id, stage_key) DO NOTHING;

-- ─────────────────────────── ARTIFACTS ───────────────────────────

-- Albion: moodboard v1 approved, design pack v1 sent.
INSERT INTO design_moodboards (project_id, version_number, status, name, links, sent_at, approved_at)
SELECT id, 1, 'approved', 'Albion v1 — coastal modern',
       '[{"url": "https://example.com/albion-m1.jpg", "caption": "Living room palette"},
         {"url": "https://example.com/albion-m2.jpg", "caption": "Kitchen direction"}]'::jsonb,
       NOW() - INTERVAL '14 days', NOW() - INTERVAL '12 days'
FROM design_projects WHERE slug = 'albion-tasleem'
ON CONFLICT (project_id, version_number) DO NOTHING;

INSERT INTO design_packs (project_id, version_number, status, room_label, image_ids, sent_at)
SELECT id, 1, 'sent', 'Living + Kitchen', '[]'::jsonb, NOW() - INTERVAL '5 days'
FROM design_projects WHERE slug = 'albion-tasleem'
ON CONFLICT (project_id, version_number) DO NOTHING;

-- Albion: agreement signed, deposit + 60% design fee received, 40% pending.
INSERT INTO design_agreements (project_id, status, sent_at, signed_at, design_fee_percent, procurement_fee_percent, contingency_percent, annex_b)
SELECT id, 'signed', NOW() - INTERVAL '35 days', NOW() - INTERVAL '32 days',
       12.00, 8.00, 10.00,
       '{"schedule": [{"description": "Annex B placeholder — Tier 1"}]}'::jsonb
FROM design_projects WHERE slug = 'albion-tasleem'
ON CONFLICT (project_id) DO NOTHING;

INSERT INTO design_payment_gates (project_id, gate_id, status, amount_minor, received_amount_minor, received_at, due_date)
SELECT p.id, g.gate_id, g.status, g.amount_minor, g.received_amount_minor, g.received_at, g.due_date
FROM design_projects p
CROSS JOIN (VALUES
  ('agreement_signed', 'received',  4000000::bigint,  4000000::bigint,   NOW() - INTERVAL '32 days', NULL::date),
  ('design_fee_60',    'received', 24000000::bigint, 24000000::bigint,  NOW() - INTERVAL '30 days', NULL::date),
  ('design_fee_40',    'pending',  16000000::bigint, NULL::bigint,      NULL::timestamptz,           (CURRENT_DATE + INTERVAL '14 days')::date)
) AS g(gate_id, status, amount_minor, received_amount_minor, received_at, due_date)
WHERE p.slug = 'albion-tasleem'
ON CONFLICT (project_id, gate_id) DO NOTHING;

-- OH-2: agreement signed, moodboard v1 + pack v1 both approved.
INSERT INTO design_agreements (project_id, status, sent_at, signed_at, design_fee_percent, procurement_fee_percent, contingency_percent, annex_b)
SELECT id, 'signed', NOW() - INTERVAL '110 days', NOW() - INTERVAL '105 days',
       10.00, 7.00, 10.00,
       '{"schedule": [{"description": "Annex B placeholder — Tier 2"}]}'::jsonb
FROM design_projects WHERE slug = 'oh-2'
ON CONFLICT (project_id) DO NOTHING;

INSERT INTO design_moodboards (project_id, version_number, status, name, links, sent_at, approved_at)
SELECT id, 1, 'approved', 'OH-2 v1 — coastal classic',
       '[{"url": "https://example.com/oh2-m1.jpg", "caption": "Master bedroom"},
         {"url": "https://example.com/oh2-m2.jpg", "caption": "Kitchen palette"}]'::jsonb,
       NOW() - INTERVAL '70 days', NOW() - INTERVAL '65 days'
FROM design_projects WHERE slug = 'oh-2'
ON CONFLICT (project_id, version_number) DO NOTHING;

INSERT INTO design_packs (project_id, version_number, status, room_label, image_ids, sent_at, approved_at)
SELECT id, 1, 'approved', 'Full house', '[]'::jsonb,
       NOW() - INTERVAL '50 days', NOW() - INTERVAL '45 days'
FROM design_projects WHERE slug = 'oh-2'
ON CONFLICT (project_id, version_number) DO NOTHING;

-- OH-2: full payment chain through design — execution fees not yet received.
INSERT INTO design_payment_gates (project_id, gate_id, status, amount_minor, received_amount_minor, received_at)
SELECT p.id, g.gate_id, g.status, g.amount_minor, g.received_amount_minor, g.received_at
FROM design_projects p
CROSS JOIN (VALUES
  ('agreement_signed', 'received',  15000000::bigint, 15000000::bigint, NOW() - INTERVAL '105 days'),
  ('design_fee_60',    'received',  90000000::bigint, 90000000::bigint, NOW() - INTERVAL '100 days'),
  ('design_fee_40',    'received',  60000000::bigint, 60000000::bigint, NOW() - INTERVAL '40 days')
) AS g(gate_id, status, amount_minor, received_amount_minor, received_at)
WHERE p.slug = 'oh-2'
ON CONFLICT (project_id, gate_id) DO NOTHING;

-- ─────────────────────────── LEAD ───────────────────────────

INSERT INTO design_leads (name, email, source, status, staleness_days, notes)
SELECT 'Matthieu Duval', 'matthieu.duval@example.com', 'whatsapp', 'qualified', 0,
       'Initial outreach 2026-05 — interested in Tier-1 furnishing project'
WHERE NOT EXISTS (SELECT 1 FROM design_leads WHERE LOWER(email) = 'matthieu.duval@example.com');

-- ─────────────────────────── ACTIVITY FEED ───────────────────────────

-- Album of representative activities for Albion and OH-2 so the timeline
-- tab + portal Activity feed don't render empty in QA.
INSERT INTO design_activities (project_id, action, payload, visibility, actor_name, created_at)
SELECT p.id, a.action, a.payload::jsonb, a.visibility, a.actor_name,
       NOW() - (a.days_ago || ' days')::interval
FROM design_projects p
CROSS JOIN (VALUES
  ('project.created',         '{}',                       'internal', 'Mathias Duval', 45),
  ('stage.entered',           '{"stage": "moodboard"}',    'internal', 'Mathias Duval', 20),
  ('moodboard.sent',          '{"version_number": 1}',     'portal',   'Mathias Duval', 14),
  ('moodboard.approved',      '{"version_number": 1}',     'portal',   'Owner',         12),
  ('stage.entered',           '{"stage": "design-pack"}',  'internal', 'Mathias Duval', 8),
  ('design_pack.sent',        '{"version_number": 1}',     'portal',   'Mathias Duval', 5)
) AS a(action, payload, visibility, actor_name, days_ago)
WHERE p.slug = 'albion-tasleem'
  AND NOT EXISTS (SELECT 1 FROM design_activities WHERE project_id = p.id);

INSERT INTO design_activities (project_id, action, payload, visibility, actor_name, created_at)
SELECT p.id, a.action, a.payload::jsonb, a.visibility, a.actor_name,
       NOW() - (a.days_ago || ' days')::interval
FROM design_projects p
CROSS JOIN (VALUES
  ('project.created',           '{}',                       'internal', 'Mathias Duval', 120),
  ('agreement.signed',          '{}',                       'portal',   'Owner',         105),
  ('payment.received',          '{"gate_id": "design_fee_60"}', 'portal', 'Owner',       100),
  ('moodboard.approved',        '{"version_number": 1}',     'portal',   'Owner',         65),
  ('design_pack.approved',      '{"version_number": 1}',     'portal',   'Owner',         45),
  ('payment.received',          '{"gate_id": "design_fee_40"}', 'portal', 'Owner',        40),
  ('stage.entered',             '{"stage": "final-budget"}', 'internal', 'Mathias Duval', 1)
) AS a(action, payload, visibility, actor_name, days_ago)
WHERE p.slug = 'oh-2'
  AND NOT EXISTS (SELECT 1 FROM design_activities WHERE project_id = p.id);

-- ─────────────────────────── ANNEX A ───────────────────────────

-- Singleton Annex A — starter tier table. v0.1 lets the director edit
-- this via the Settings tab; for QA we just need *something* present so
-- the simulator doesn't render an empty config.
INSERT INTO design_annex_a (tenant_id, annex_a)
SELECT '00000000-0000-0000-0000-000000000001',
       '{
         "tiers": {
           "1": {"name": "Tier 1 — Furnishing only",   "design_fee_percent": 12, "procurement_fee_percent": 8,  "min_budget_minor": 200000000, "max_budget_minor": 500000000},
           "2": {"name": "Tier 2 — Light renovation",  "design_fee_percent": 10, "procurement_fee_percent": 7,  "min_budget_minor": 500000000, "max_budget_minor": 2000000000},
           "3": {"name": "Tier 3 — Full renovation",   "design_fee_percent": 8,  "procurement_fee_percent": 6,  "min_budget_minor": 2000000000, "max_budget_minor": null}
         },
         "contingency_percent_default": 10,
         "currency": "MUR"
       }'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM design_annex_a WHERE tenant_id = '00000000-0000-0000-0000-000000000001');
