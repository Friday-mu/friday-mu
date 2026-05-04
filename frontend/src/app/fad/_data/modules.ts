export type Tier = 'live' | 'preview' | 'pitch' | 'tease';
export type GroupTier = 'today' | 'manage';

export interface SubPage {
  id: string;
  label: string;
}

export interface ModuleDef {
  id: string;
  label: string;
  group: string;
  tier: Tier;
  ship: string;
  icon: string;
  path: string;
  warning?: boolean;
  subPages?: SubPage[];
}

export interface GroupDef {
  id: string;
  label: string;
  tier: GroupTier;
}

export const MODULES: ModuleDef[] = [
  { id: 'inbox', label: 'Inbox', group: 'Today', tier: 'live', ship: 'live', icon: 'IconInbox', path: '/gms/inbox' },
  { id: 'operations', label: 'Operations', group: 'Today', tier: 'live', ship: 'live', icon: 'IconTasks', path: '/fad/operations', subPages: [
    { id: 'overview', label: 'Overview' },
    { id: 'all', label: 'All tasks' },
    { id: 'issues', label: 'Reported issues' },
    { id: 'approvals', label: 'Approvals' },
    { id: 'roster', label: 'Roster' },
    { id: 'insights', label: 'Insights' },
    { id: 'settings', label: 'Settings' },
  ] },
  { id: 'calendar', label: 'Calendar', group: 'Today', tier: 'live', ship: 'live', icon: 'IconCal', path: '/gms/calendar' },
  { id: 'properties', label: 'Properties', group: 'Portfolio', tier: 'live', ship: 'live', icon: 'IconProp', path: '/fad/properties', subPages: [
    { id: 'overview', label: 'Overview' },
    { id: 'all', label: 'All properties' },
    { id: 'onboarding', label: 'Onboarding' },
    { id: 'insights', label: 'Insights' },
  ] },
  { id: 'reservations', label: 'Reservations', group: 'Portfolio', tier: 'live', ship: 'live', icon: 'IconBook', path: '/fad/reservations', subPages: [
    { id: 'overview', label: 'Overview' },
    { id: 'all', label: 'All reservations' },
    { id: 'inquiries', label: 'Inquiries' },
  ] },
  { id: 'finance', label: 'Finance', group: 'Business', tier: 'preview', warning: true, ship: "Apr '26", icon: 'IconFinance', path: '/gms/finance', subPages: [
    { id: 'overview', label: 'Overview' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'approvals', label: 'Approvals' },
    { id: 'owner-statements', label: 'Owner statements' },
    { id: 'tourist-tax', label: 'Tourist tax' },
    { id: 'pnl', label: 'P&L dashboard' },
    { id: 'float-ledger', label: 'Float ledger' },
    { id: 'reports', label: 'Reports' },
    { id: 'settings', label: 'Settings' },
  ] },
  { id: 'legal', label: 'Legal & Admin', group: 'Business', tier: 'preview', warning: true, ship: "Apr '26", icon: 'IconLegal', path: '/gms/legal' },
  { id: 'guests', label: 'Guests', group: 'People', tier: 'pitch', ship: "Jul '26", icon: 'IconGuests', path: '/gms/guests' },
  { id: 'owners', label: 'Owners', group: 'People', tier: 'preview', ship: "May '26", icon: 'IconOwners', path: '/gms/owners' },
  { id: 'reviews', label: 'Reviews', group: 'People', tier: 'live', ship: 'live', icon: 'IconReviews', path: '/fad/reviews', subPages: [
    { id: 'overview', label: 'Overview' },
    { id: 'all', label: 'All reviews' },
    { id: 'trends', label: 'Trends' },
    { id: 'staff', label: 'Staff performance' },
    { id: 'settings', label: 'Settings' },
  ] },
  { id: 'hr', label: 'HR', group: 'People', tier: 'live', ship: 'live', icon: 'IconUsers', path: '/fad/hr', subPages: [
    { id: 'staff', label: 'Staff' },
    { id: 'time-off', label: 'Time-off' },
    { id: 'stats', label: 'Stats' },
    { id: 'permissions', label: 'Permissions' },
  ] },
  { id: 'marketing', label: 'Marketing', group: 'Growth', tier: 'pitch', ship: "Aug '26", icon: 'IconMkt', path: '/gms/marketing' },
  { id: 'leads', label: 'Leads / CRM-lite', group: 'Growth', tier: 'pitch', ship: 'soon', icon: 'IconLeads', path: '/gms/leads' },
  { id: 'analytics', label: 'Analytics', group: 'Growth', tier: 'preview', ship: "Jun '26", icon: 'IconChart', path: '/gms/analytics' },
  { id: 'intelligence', label: 'Intelligence', group: 'Growth', tier: 'pitch', ship: "Aug '26", icon: 'IconIntel', path: '/gms/intelligence' },
  { id: 'syndic', label: 'Syndic', group: 'Units', tier: 'tease', ship: "Q1 '27", icon: 'IconSyndic', path: '/gms/syndic' },
  { id: 'design', label: 'Design', group: 'Units', tier: 'preview', warning: true, ship: "May '26", icon: 'IconInterior', path: '/fad/design', subPages: [
    { id: 'overview', label: 'Overview' },
    { id: 'projects', label: 'Projects' },
    { id: 'leads', label: 'Leads' },
    { id: 'vendors', label: 'Vendors' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'settings', label: 'Settings' },
  ] },
  { id: 'agency', label: 'Agency', group: 'Units', tier: 'tease', ship: 'TBD', icon: 'IconAgency', path: '/gms/agency' },
  { id: 'notifications', label: 'Notifications', group: 'System', tier: 'live', ship: 'live', icon: 'IconBell', path: '/fad/notifications' },
  { id: 'training', label: 'Training', group: 'System', tier: 'preview', ship: "May '26", icon: 'IconAI', path: '/gms/training' },
  { id: 'settings', label: 'Settings', group: 'System', tier: 'live', ship: 'live', icon: 'IconSettings', path: '/gms/settings' },
];

export const GROUPS: GroupDef[] = [
  { id: 'Today', label: 'Today', tier: 'today' },
  { id: 'Portfolio', label: 'Portfolio', tier: 'manage' },
  { id: 'Business', label: 'Business', tier: 'manage' },
  { id: 'People', label: 'People', tier: 'manage' },
  { id: 'Growth', label: 'Growth', tier: 'manage' },
  { id: 'Units', label: 'Business Units', tier: 'manage' },
  { id: 'System', label: 'System', tier: 'manage' },
];
