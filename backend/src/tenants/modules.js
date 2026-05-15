'use strict';

// Module registry. Single source of truth for the set of modules that
// can be subscribed to. Matches the keys in the `tenant_modules` table
// and the sidebar in the FAD frontend.
//
// v0 product: only `design` is a saleable standalone. The rest are
// FR-internal modules that exist in the FAD shell but aren't pitched
// outside FR yet. When a new module becomes saleable, flip its
// `saleable` flag and set its `monthly_price_usd`; the signup flow
// will pick it up automatically.
//
// Schema-side: tenant_modules.module_key must match a key here, but
// that's enforced at the application layer (no DB CHECK constraint
// so we can add modules without a migration).

const MODULES = {
  design: {
    name: 'Design',
    description: 'Interior design project management — site visits, moodboards, floor plans, vendor quotes, owner approvals.',
    saleable: true,
    monthly_price_usd: 99,
    enabled_by_default_in_signup: true,
  },
  inbox: {
    name: 'Inbox (Guest Messaging)',
    description: 'Unified inbox for guest messages across WhatsApp, Airbnb, Booking.com.',
    saleable: false,
    monthly_price_usd: null,
    enabled_by_default_in_signup: false,
  },
  reservations: {
    name: 'Reservations',
    description: 'Booking management, Guesty sync.',
    saleable: false,
    monthly_price_usd: null,
    enabled_by_default_in_signup: false,
  },
  calendar: {
    name: 'Calendar',
    description: 'Multi-property availability + booking calendar.',
    saleable: false,
    monthly_price_usd: null,
    enabled_by_default_in_signup: false,
  },
  operations: {
    name: 'Operations',
    description: 'Cleaning, maintenance, Breezeway tasks.',
    saleable: false,
    monthly_price_usd: null,
    enabled_by_default_in_signup: false,
  },
  finance: {
    name: 'Finance',
    description: 'Bookkeeping, GL, invoicing, financial reports.',
    saleable: false,
    monthly_price_usd: null,
    enabled_by_default_in_signup: false,
  },
  hr: {
    name: 'HR',
    description: 'Staff, time-off, payroll, performance.',
    saleable: false,
    monthly_price_usd: null,
    enabled_by_default_in_signup: false,
  },
  analytics: {
    name: 'Analytics',
    description: 'Pipeline funnel, revenue curves, vendor performance.',
    saleable: false,
    monthly_price_usd: null,
    enabled_by_default_in_signup: false,
  },
  reviews: {
    name: 'Reviews',
    description: 'Guest reviews — collect, respond, analyse.',
    saleable: false,
    monthly_price_usd: null,
    enabled_by_default_in_signup: false,
  },
  training: {
    name: 'Training',
    description: 'Staff training tracker.',
    saleable: false,
    monthly_price_usd: null,
    enabled_by_default_in_signup: false,
  },
  settings: {
    name: 'FAD Settings',
    description: 'FR-internal config (legacy).',
    saleable: false,
    monthly_price_usd: null,
    enabled_by_default_in_signup: false,
  },
  'website-inbox': {
    name: 'Website Inbox',
    description: 'Bookings/enquiries from friday.mu.',
    saleable: false,
    monthly_price_usd: null,
    enabled_by_default_in_signup: false,
  },
  // SaaS-self-service modules — always enabled for every tenant.
  'tenant-settings': {
    name: 'Tenant Settings',
    description: 'Brand, vendor defaults, currency, locale.',
    saleable: false,
    monthly_price_usd: null,
    enabled_by_default_in_signup: true,
    always_on: true,
  },
  billing: {
    name: 'Billing',
    description: 'Invoices, payment history, bank transfer details.',
    saleable: false,
    monthly_price_usd: null,
    enabled_by_default_in_signup: true,
    always_on: true,
  },
};

function isKnownModule(moduleKey) {
  return Object.prototype.hasOwnProperty.call(MODULES, moduleKey);
}

function getModule(moduleKey) {
  return MODULES[moduleKey] || null;
}

// Default modules to enable for a brand-new signup. Always-on modules
// + modules marked enabled_by_default_in_signup (currently: design,
// tenant-settings, billing).
function defaultSignupModuleKeys() {
  return Object.entries(MODULES)
    .filter(([, m]) => m.enabled_by_default_in_signup || m.always_on)
    .map(([key]) => key);
}

// All module keys (used by the FR backfill in mig 036 + the FR
// tenant-settings module-list UI later).
function allModuleKeys() {
  return Object.keys(MODULES);
}

module.exports = {
  MODULES,
  isKnownModule,
  getModule,
  defaultSignupModuleKeys,
  allModuleKeys,
};
