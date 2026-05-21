-- 053_task_supplies_inventory.sql
--
-- Task-linked supply consumption and stock movement events. This keeps
-- supply use inside the Operations task execution flow while giving a
-- downstream inventory ledger something durable to consume.

CREATE TABLE IF NOT EXISTS stock_movements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id               UUID REFERENCES tasks(id) ON DELETE SET NULL,
  supply_id             TEXT NOT NULL,
  supply_name           TEXT NOT NULL,
  location_code         TEXT,
  quantity_delta        NUMERIC(10,2) NOT NULL CHECK (quantity_delta <> 0),
  unit                  TEXT NOT NULL,
  reason                TEXT NOT NULL,
  created_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stock_movements_reason_check CHECK (reason IN (
    'task_use',
    'task_supply_removed',
    'adjustment',
    'restock',
    'transfer'
  ))
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_supply
  ON stock_movements(tenant_id, supply_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_location
  ON stock_movements(tenant_id, location_code, created_at DESC)
  WHERE location_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_task
  ON stock_movements(task_id)
  WHERE task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS task_supplies (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id                     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supply_id                   TEXT NOT NULL,
  supply_name                 TEXT NOT NULL,
  category                    TEXT NOT NULL,
  quantity                    NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  unit                        TEXT NOT NULL,
  location_code               TEXT,
  unit_cost_minor             BIGINT,
  currency_code               TEXT NOT NULL DEFAULT 'MUR',
  owner_charge                BOOLEAN NOT NULL DEFAULT FALSE,
  stock_movement_id           UUID REFERENCES stock_movements(id) ON DELETE SET NULL,
  flowed_to_task_cost_id      UUID REFERENCES task_costs(id) ON DELETE SET NULL,
  added_by_user_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT task_supplies_category_check CHECK (category IN (
    'linen',
    'amenity',
    'cleaning',
    'maintenance',
    'welcome',
    'consumable',
    'other'
  ))
);

CREATE INDEX IF NOT EXISTS idx_task_supplies_task
  ON task_supplies(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_supplies_tenant_supply
  ON task_supplies(tenant_id, supply_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_supplies_owner_charge
  ON task_supplies(tenant_id, owner_charge)
  WHERE owner_charge = TRUE;

COMMENT ON TABLE task_supplies IS 'Supply quantities used from an Operations task; billable rows may also create task_costs.';
COMMENT ON TABLE stock_movements IS 'Inventory movement ledger for task supply use, removals, restock, transfer, and manual adjustment events.';
