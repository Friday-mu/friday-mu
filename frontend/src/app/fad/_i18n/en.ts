// T3.15 — English translation source. All UI strings start here and
// get mirrored 1:1 in fr.ts. Keep keys hierarchical (group.subgroup.id)
// so future modules slot in without collision.
//
// New surfaces / new strings: add the EN copy here FIRST, then the FR
// translation in fr.ts. CI/tests can grep for missing keys later.

// Translation maps use plain string types — we want fr.ts to satisfy
// the same SHAPE (key tree) without requiring its values to be the
// literal English strings. Use `satisfies TranslationShape` from fr.ts
// to enforce shape coverage.
//
// NB: don't `as const` this — it pins values to string literals and
// causes TS2322 in fr.ts.
export const en: TranslationShape = {
  // ─── Sidebar / shell chrome ────────────────────────────────────
  group: {
    Today: 'Today',
    Portfolio: 'Portfolio',
    Business: 'Business',
    People: 'People',
    Growth: 'Growth',
    'Business Units': 'Business Units',
    Manage: 'Manage',
    System: 'System',
  },
  module: {
    inbox: 'Inbox',
    operations: 'Operations',
    calendar: 'Calendar',
    properties: 'Properties',
    reservations: 'Reservations',
    finance: 'Finance',
    legal: 'Legal & Admin',
    guests: 'Guests',
    owners: 'Owners',
    reviews: 'Reviews',
    hr: 'HR',
    marketing: 'Marketing',
    leads: 'Leads / CRM-lite',
    analytics: 'Analytics',
    intelligence: 'Intelligence',
    syndic: 'Syndic',
    design: 'Design',
    agency: 'Agency',
    'tenant-settings': 'Tenant settings',
    billing: 'Billing',
    'admin-analytics': 'Admin Analytics',
    notifications: 'Notifications',
    training: 'Training',
    settings: 'Settings',
  },
  subpage: {
    overview: 'Overview',
    schedule: 'Schedule',
    'my-tasks': 'My tasks',
    'all-tasks': 'All tasks',
    issues: 'Reported issues',
    history: 'My history',
    approvals: 'Approvals',
    roster: 'Roster',
    insights: 'Insights',
    settings: 'Settings',
    all: 'All',
    'all-properties': 'All properties',
    'all-reservations': 'All reservations',
    inquiries: 'Inquiries',
    onboarding: 'Onboarding',
    transactions: 'Transactions',
  },
  shell: {
    askFriday: 'Ask Friday',
    fridayThinking: 'Friday is thinking…',
    search: 'Search or Ask Friday…',
    viewAs: 'View as',
    pending: 'pending',
    adminOnly: 'admin only',
  },

  // ─── Operations module ─────────────────────────────────────────
  operations: {
    title: 'Operations',
    subtitle: {
      field: 'Assigned work · comments · evidence · history',
      manager: 'Tasks · reported issues · approvals · roster · insights',
    },
    tabs: {
      overview: 'Overview',
      schedule: 'Schedule',
      my: 'My tasks',
      all: 'All tasks',
      issues: 'Reported issues',
      history: 'My history',
      approvals: 'Approvals',
      roster: 'Roster',
      insights: 'Insights',
      settings: 'Settings',
    },
    newTask: 'New task',
    reportIssue: 'Report issue',
    addTask: '+ Task',
    addExpense: '+ Expense',
    addReceipt: '+ Receipt',
    todayTasks: 'Today’s tasks',
    overdueTasks: 'Overdue',
    upcomingTasks: 'Upcoming',
    completedTasks: 'Completed',
    noTasks: 'No tasks to show.',
    assignTo: 'Assign to',
    priority: 'Priority',
    property: 'Property',
    dueDate: 'Due date',
    status: {
      open: 'Open',
      inProgress: 'In progress',
      completed: 'Completed',
      cancelled: 'Cancelled',
      blocked: 'Blocked',
    },
    priorityLabel: {
      urgent: 'Urgent',
      high: 'High',
      normal: 'Normal',
      low: 'Low',
    },
    filters: {
      mine: 'Mine',
      all: 'All',
      today: 'Today',
      week: 'This week',
    },
  },

  // ─── Settings page ─────────────────────────────────────────────
  settings: {
    title: 'Settings',
    sections: {
      account: 'Account',
      preferences: 'Preferences',
      appearance: 'Appearance',
      notifications: 'Notifications',
      language: 'Language',
    },
    language: {
      label: 'Language',
      help: 'Choose the language used for buttons, menus and labels across modules you can access.',
      en: 'English',
      fr: 'Français',
    },
    theme: {
      label: 'Theme',
      light: 'Light',
      dark: 'Dark',
      auto: 'System',
    },
    signOut: 'Sign out',
  },

  // ─── Common buttons / actions ──────────────────────────────────
  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    confirm: 'Confirm',
    close: 'Close',
    edit: 'Edit',
    add: 'Add',
    remove: 'Remove',
    open: 'Open',
    yes: 'Yes',
    no: 'No',
    loading: 'Loading…',
    saved: 'Saved',
    error: 'Something went wrong',
    retry: 'Retry',
  },
};

// Shape contract — keeps fr.ts in lockstep with en.ts. Update both
// files together when adding keys.
export interface TranslationShape {
  group: Record<string, string>;
  module: Record<string, string>;
  subpage: Record<string, string>;
  shell: Record<string, string>;
  operations: {
    title: string;
    subtitle: { field: string; manager: string };
    tabs: Record<string, string>;
    newTask: string;
    reportIssue: string;
    addTask: string;
    addExpense: string;
    addReceipt: string;
    todayTasks: string;
    overdueTasks: string;
    upcomingTasks: string;
    completedTasks: string;
    noTasks: string;
    assignTo: string;
    priority: string;
    property: string;
    dueDate: string;
    status: Record<string, string>;
    priorityLabel: Record<string, string>;
    filters: Record<string, string>;
  };
  settings: {
    title: string;
    sections: Record<string, string>;
    language: { label: string; help: string; en: string; fr: string };
    theme: Record<string, string>;
    signOut: string;
  };
  common: Record<string, string>;
}
