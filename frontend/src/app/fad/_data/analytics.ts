// @demo:data — Benchmarks + KPIs — GET /api/analytics/*
// Tag: PROD-DATA-7 — see frontend/DEMO_CRUFT.md

export const ANALYTICS_OVERVIEW_KPI = [
  { label: 'Revenue · MTD', value: '€ 184,220', sub: '+12% vs Apr LM', dir: 'up' as const },
  { label: 'Occupancy · 30d', value: '79%', sub: '+3pp vs LY', dir: 'up' as const },
  { label: 'RevPAR · 30d', value: '€ 246', sub: '+6% vs LY', dir: 'up' as const },
  { label: 'Guest sat · 90d', value: '4.6', sub: '+0.1 vs Q1', dir: 'up' as const },
  { label: 'Net to owners · MTD', value: '€ 118,240', sub: '5 statements ready', dir: null },
  { label: 'Friday margin · MTD', value: '€ 47,890', sub: '26.0% of gross', dir: null },
  { label: 'Direct-book share', value: '22%', sub: 'goal 25% · +2pp', dir: 'up' as const },
  { label: 'First-draft acceptance', value: '79%', sub: 'target 85%', dir: null },
];

export const REVENUE_TREND = [
  { month: 'Nov', gross: 142, fees: 38, net: 104 },
  { month: 'Dec', gross: 218, fees: 57, net: 161 },
  { month: 'Jan', gross: 186, fees: 48, net: 138 },
  { month: 'Feb', gross: 172, fees: 44, net: 128 },
  { month: 'Mar', gross: 201, fees: 52, net: 149 },
  { month: 'Apr', gross: 184, fees: 48, net: 136, partial: true },
];

export const REVENUE_BY_PROPERTY = [
  { code: 'VAZ', property: 'Villa Azur', gross: 28400, bookings: 6, occ: 0.91 },
  { code: 'BBH', property: 'Blue Bay House', gross: 32200, bookings: 5, occ: 0.88 },
  { code: 'OCT', property: 'Ocean Terrace', gross: 21800, bookings: 4, occ: 0.85 },
  { code: 'DMT', property: 'Domaine Tamassa', gross: 24600, bookings: 3, occ: 0.74 },
  { code: 'SRT', property: 'Serenity Point', gross: 18900, bookings: 4, occ: 0.81 },
  { code: 'SBN', property: 'Sable Noir', gross: 16400, bookings: 5, occ: 0.78 },
  { code: 'COR', property: 'Coral Reef', gross: 12800, bookings: 6, occ: 0.88 },
  { code: 'LCA', property: 'La Casa Palm', gross: 14200, bookings: 4, occ: 0.68 },
  { code: 'NIT', property: 'Nitzana Estate', gross: 14920, bookings: 2, occ: 0.45, partial: true },
];

export const OCC_HEATMAP_PROPS = [
  { code: 'VAZ', row: [0.95, 0.88, 0.91, 0.94, 0.97, 0.92] },
  { code: 'BBH', row: [0.88, 0.82, 0.84, 0.91, 0.92, 0.88] },
  { code: 'OCT', row: [0.82, 0.80, 0.78, 0.88, 0.90, 0.85] },
  { code: 'DMT', row: [0.70, 0.75, 0.72, 0.76, 0.81, 0.74] },
  { code: 'SRT', row: [0.75, 0.78, 0.76, 0.85, 0.82, 0.81] },
  { code: 'SBN', row: [0.74, 0.71, 0.75, 0.78, 0.80, 0.78] },
  { code: 'COR', row: [0.82, 0.80, 0.84, 0.88, 0.92, 0.88] },
  { code: 'LCA', row: [0.62, 0.64, 0.68, 0.72, 0.70, 0.68] },
  { code: 'NIT', row: [0.0, 0.0, 0.25, 0.40, 0.42, 0.45] },
];
export const OCC_HEATMAP_MONTHS = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];

export const CHANNEL_REVENUE = [
  { channel: 'Airbnb', share: 0.44, gross: 81057, bookings: 18, aov: 4503 },
  { channel: 'Booking.com', share: 0.22, gross: 40528, bookings: 11, aov: 3684 },
  { channel: 'Direct', share: 0.22, gross: 40528, bookings: 8, aov: 5066 },
  { channel: 'VRBO', share: 0.08, gross: 14738, bookings: 3, aov: 4913 },
  { channel: 'Agent', share: 0.04, gross: 7369, bookings: 2, aov: 3685 },
];

export const CHANNEL_COSTS = [
  { channel: 'Airbnb', revenue: 81057, commission: 12158, effectiveRate: 0.15, notes: '15% channel fee' },
  { channel: 'Booking.com', revenue: 40528, commission: 6079, effectiveRate: 0.15, notes: '15% channel fee' },
  { channel: 'Direct', revenue: 40528, commission: 1216, effectiveRate: 0.03, notes: 'Stripe 3%' },
  { channel: 'VRBO', revenue: 14738, commission: 2211, effectiveRate: 0.15, notes: '15% channel fee' },
  { channel: 'Agent', revenue: 7369, commission: 736, effectiveRate: 0.1, notes: 'Agent commission' },
];

export const REVIEW_TREND = [
  { month: 'Nov', avg: 4.5, count: 23 },
  { month: 'Dec', avg: 4.6, count: 38 },
  { month: 'Jan', avg: 4.6, count: 29 },
  { month: 'Feb', avg: 4.5, count: 24 },
  { month: 'Mar', avg: 4.6, count: 28 },
  { month: 'Apr', avg: 4.7, count: 21, partial: true },
];

export const REVIEW_BY_REGION = [
  { region: 'South (Bel Ombre + Blue Bay)', properties: 3, avg: 4.88, count: 108, sla: '1h 52m' },
  { region: 'West (Black River + Tamarin)', properties: 2, avg: 4.48, count: 58, sla: '2h 24m' },
  { region: 'North (Grand Baie + Trou aux B.)', properties: 3, avg: 4.62, count: 102, sla: '2h 31m' },
  { region: 'Nitzana (soft launch)', properties: 1, avg: 4.95, count: 8, sla: '38m' },
];

export const TEAM_LOAD = [
  { name: 'Ishant', role: 'Admin', tasks: 12, messages: 142, reviews: 4, leads: 9 },
  { name: 'Mathias', role: 'Manager · GS', tasks: 18, messages: 388, reviews: 12, leads: 2 },
  { name: 'Franny', role: 'Manager · Ops/GS', tasks: 28, messages: 412, reviews: 14, leads: 0 },
  { name: 'Mary', role: 'Manager · Admin', tasks: 14, messages: 94, reviews: 0, leads: 2 },
  { name: 'Bryan', role: 'Contributor · Ops', tasks: 22, messages: 48, reviews: 0, leads: 0 },
  { name: 'Catherine', role: 'Contributor · Ops', tasks: 19, messages: 12, reviews: 0, leads: 0 },
];

export const MARGIN_BREAKDOWN = [
  { label: 'Gross revenue', value: 184220, color: 'var(--color-text-primary)' },
  { label: 'Channel fees', value: -22400, color: 'var(--color-text-secondary)' },
  { label: 'Owner payouts', value: -118240, color: 'var(--color-text-secondary)' },
  { label: 'Housekeeping', value: -4320, color: 'var(--color-text-secondary)' },
  { label: 'Maintenance + fixed ops', value: -6100, color: 'var(--color-text-secondary)' },
  { label: 'AI + tooling', value: -48, color: 'var(--color-text-secondary)' },
  { label: 'Friday margin', value: 33112, color: 'var(--color-brand-accent)', isTotal: true },
];
