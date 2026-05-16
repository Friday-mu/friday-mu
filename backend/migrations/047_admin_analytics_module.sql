-- Migration 047 — enable the admin-analytics module for the FR tenant.
--
-- The Admin Analytics module is FR-only: it surfaces platform-wide KPIs
-- (MRR, AI cost, tenant signups, churn) that no other tenant should see.
-- Gating is enforced two layers up — the backend endpoint runs an
-- _isFrAdmin() check, and Sidebar.tsx filters the entry out for non-FR
-- tenants. This row is what lets the sidebar render the entry for FR.
--
-- No-op for any non-FR tenant; idempotent via ON CONFLICT.

INSERT INTO tenant_modules (tenant_id, module_key, enabled)
VALUES ('00000000-0000-0000-0000-000000000001', 'admin-analytics', true)
ON CONFLICT (tenant_id, module_key) DO UPDATE
  SET enabled = true,
      enabled_at = NOW(),
      disabled_at = NULL;
