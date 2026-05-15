'use strict';

// Row → API-shape adapters for the SaaS-scaffolding tables (tenants
// extensions, tenant_modules, invoices). Mirrors the style of
// backend/src/design/adapters.js — centralises the row→JSON mapping
// so route handlers stay tidy.
//
// All three tables use UUID/date/string columns; no BIGINT-as-id risk
// here. invoices.amount_minor IS BIGINT — pg-node returns BIGINTs as
// strings by default. shapeInvoice coerces it to a JS number; amounts
// will be well below 2^53 / 100 for the foreseeable future (and we
// keep the minor unit so even billion-dollar invoices fit).

function shapeTenant(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    active: row.active,
    stripe_customer_id: row.stripe_customer_id,
    subscription_status: row.subscription_status,
    subscription_started_at: row.subscription_started_at,
    trial_ends_at: row.trial_ends_at,
    payment_method: row.payment_method,
    country: row.country,
    locale: row.locale,
    billing_email: row.billing_email,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function shapeTenantModule(row) {
  if (!row) return null;
  return {
    tenant_id: row.tenant_id,
    module_key: row.module_key,
    enabled: row.enabled,
    enabled_at: row.enabled_at,
    disabled_at: row.disabled_at,
    notes: row.notes,
  };
}

// Format minor units as a display currency string. Falls back to a
// plain numeric string if Intl can't construct the formatter (unknown
// currency code, etc.) so we never throw out of a shape function.
function _formatAmount(amountMinor, currencyCode) {
  const major = amountMinor / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode || 'USD',
    }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currencyCode || ''}`.trim();
  }
}

function shapeInvoice(row) {
  if (!row) return null;
  // pg returns BIGINT as string. Coerce to JS number — safe up to
  // 2^53; invoice amounts in minor units will never approach that.
  const amountMinor = row.amount_minor == null ? 0 : Number(row.amount_minor);
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    invoice_number: row.invoice_number,
    amount_minor: amountMinor,
    currency_code: row.currency_code,
    amount_display: _formatAmount(amountMinor, row.currency_code),
    period_start: row.period_start,
    period_end: row.period_end,
    status: row.status,
    due_date: row.due_date,
    issued_at: row.issued_at,
    paid_at: row.paid_at,
    paid_by: row.paid_by,
    bank_transfer_ref: row.bank_transfer_ref,
    pdf_url: row.pdf_url,
    notes: row.notes,
    // Sometimes the JOIN to tenants includes the tenant name; pass it
    // through if present so the FR-admin "all invoices" view can use
    // it without a second round trip.
    tenant_name: row.tenant_name || undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

module.exports = {
  shapeTenant,
  shapeTenantModule,
  shapeInvoice,
};
