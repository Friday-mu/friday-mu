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
  // Sub-page labels are module-qualified to disambiguate context-
  // sensitive ids ('all' means All properties in Properties, All
  // reservations in Reservations). Add new keys as `subpage.<module>.<id>`.
  // Fallback to the EN label from the MODULES fixture when no key matches.
  subpage: {
    // Operations
    'operations.overview': 'Overview',
    'operations.schedule': 'Schedule',
    'operations.my': 'My tasks',
    'operations.all': 'All tasks',
    'operations.issues': 'Reported issues',
    'operations.history': 'My history',
    'operations.approvals': 'Approvals',
    'operations.roster': 'Roster',
    'operations.insights': 'Insights',
    'operations.settings': 'Settings',
    // Properties
    'properties.overview': 'Overview',
    'properties.all': 'All properties',
    'properties.onboarding': 'Onboarding',
    'properties.insights': 'Insights',
    // Reservations
    'reservations.overview': 'Overview',
    'reservations.all': 'All reservations',
    'reservations.inquiries': 'Inquiries',
    // Finance
    'finance.overview': 'Overview',
    'finance.transactions': 'Transactions',
    'finance.approvals': 'Approvals',
    'finance.owner-statements': 'Owner statements',
    'finance.tourist-tax': 'Tourist tax',
    'finance.pnl': 'P&L',
    'finance.reports': 'Reports',
    'finance.float-ledger': 'Float ledger',
    'finance.brand': 'Brand',
    // HR
    'hr.staff': 'Staff',
    'hr.time-off': 'Time-off',
    'hr.stats': 'Stats',
    'hr.permissions': 'Permissions',
    // Tenant settings
    'tenant-settings.general': 'General',
    'tenant-settings.users': 'Users',
    'tenant-settings.permissions': 'Permissions',
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
      reported: 'Reported',
      scheduled: 'Scheduled',
      ready: 'Ready',
      inProgress: 'In progress',
      active: 'Active',
      paused: 'Paused',
      blocked: 'Blocked',
      completed: 'Completed',
      done: 'Done',
      closed: 'Closed',
      cancelled: 'Cancelled',
      all: 'All',
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
    overview: {
      title: 'Operations dashboard',
      fieldAgenda: 'My agenda',
      managerAgenda: 'Manager agenda',
      dateLabel: 'Date',
      statusFiltersAria: 'Task status filters',
      mobileDashboardAria: 'Mobile operations dashboard',
      taskCountOne: '1 task',
      taskCountMany: '{n} tasks',
      kpi: {
        openToday: 'Open today',
        overdue: 'Overdue',
        urgent: 'Urgent',
        awaitingApproval: 'Awaiting approval',
        reportedToday: 'Reported today',
      },
      loadingLive: 'Loading live tasks',
      loadError: 'Live tasks could not load: {error}',
      emptyAgenda: 'No tasks scheduled for this day.',
      emptyAgendaForDate: 'No agenda tasks for {date}.',
      anyTime: 'Any time',
      reservationLinked: 'reservation linked',
      noReservation: 'no reservation',
      filesCount: '{n} files',
      commentsCount: '{n} comments',
      dailyBrief: 'Friday Daily Brief',
      escalationsCount: 'Escalations · {n}',
      noEscalations: 'No escalations.',
      reservationUrgentCount: 'Reservation-driven urgent · {n}',
      noReservationUrgent: 'No reservation-driven urgent tasks.',
      recentActivity: 'Recent activity (last 24h)',
    },
    mine: {
      kickerField: 'Assigned only',
      kickerManager: 'Assigned to me',
      title: 'My tasks',
      introField: 'Start, comment, attach evidence, and complete only work assigned to you.',
      introManager: 'Your own execution queue inside the manager board.',
      countsAria: 'My task counts',
      countActive: 'active',
      countDue: 'due',
      countBlocked: 'blocked',
      countDone: 'done',
      loadingAssigned: 'Loading assigned tasks',
      loadError: 'Live tasks could not load: {error}. Offline queue is not enabled yet, so failed actions stay visible here instead of disappearing.',
      dateRangeAria: 'Task date range',
      dateToday: 'Today',
      dateTomorrow: 'Tomorrow',
      dateWeek: 'Week',
      dateAll: 'All',
      searchPlaceholder: 'Search property, title, reservation...',
      sortAria: 'Sort my tasks',
      sortSuggested: 'Suggested',
      sortDue: 'Due time',
      sortPriority: 'Priority',
      sortProperty: 'Property',
      deptAria: 'Department',
      deptAll: 'All departments',
      deptCleaning: 'Cleaning',
      deptInspection: 'Inspection',
      deptMaintenance: 'Maintenance',
      deptOffice: 'Office',
      priorityAria: 'Priority',
      priorityAll: 'All priorities',
      priorityUrgent: 'Urgent',
      priorityHigh: 'High',
      priorityMedium: 'Medium',
      priorityLow: 'Low',
      priorityLowest: 'Lowest',
      reservationAria: 'Reservation state',
      reservationAny: 'Any reservation',
      reservationLinked: 'Linked reservation',
      reservationUnlinked: 'No reservation',
      startDateAria: 'Start date',
      endDateAria: 'End date',
      resultOne: '{n} assigned task',
      resultMany: '{n} assigned tasks',
      syncIssue: 'Sync issue visible',
      syncLive: 'Live sync',
      notSynced: 'Not synced',
      live: 'Live',
      empty: 'No assigned tasks match this view.',
      toastCompleted: 'Task marked completed',
      toastMoved: 'Task moved to {status}',
      toastFailed: 'Task update failed',
    },
    schedule: {
      title: 'Schedule',
      intro: 'Plan the week. Drag-drop assignments and balance the workload across staff.',
      timezoneAria: 'Schedule timezone',
      emptySlot: 'No tasks',
      legendBalanced: 'Balanced',
      legendHeavy: 'Heavy load',
      legendUnstaffed: 'Unstaffed',
    },
    all: {
      title: 'All tasks',
      intro: 'Manager board. Filter, sort, bulk-edit across every task in the property portfolio.',
      newTask: 'New task',
      searchPlaceholder: 'Search tasks...',
      filters: 'Filters',
      resultRange: '{from}-{to} of {total} tasks',
      perPage: '{n} / page',
      previous: 'Prev',
      next: 'Next',
      empty: 'No tasks match the filters.',
    },
    issues: {
      title: 'Reported issues',
      intro: 'Issues guests, staff or AI surfaced — triage, assign, and resolve.',
      empty: 'No reported issues right now.',
      filterAll: 'All',
      filterOpen: 'Open',
      filterResolved: 'Resolved',
      reportedBy: 'Reported by',
      reportedAt: 'Reported',
    },
    manager: {
      kicker: 'Manager workbench',
      intro: 'Cross-portfolio view: blockers, escalations, capacity heatmap.',
      blockersTitle: 'Blockers needing manager unblock',
      blockersEmpty: 'No active blockers.',
      capacityTitle: 'Capacity today',
      capacityEmpty: 'No staff scheduled today.',
      escalationsTitle: 'Recent escalations',
      escalationsEmpty: 'No escalations in the last 24h.',
    },
  },

  // ─── Properties module ────────────────────────────────────────
  properties: {
    subtitle: 'Unification layer between Guesty (commercial) and Breezeway (operational) · destination for everything property-anchored',
    tabs: {
      overview: 'Overview',
      all: 'All properties',
      onboarding: 'Onboarding',
      insights: 'Insights',
    },
    newProperty: 'New property',
  },

  // ─── Reservations module ──────────────────────────────────────
  reservations: {
    subtitle: 'Lookup, detail, inquiries · supporting surface across Finance / Operations / Inbox',
    tabs: {
      overview: 'Overview',
      all: 'All reservations',
      inquiries: 'Inquiries',
    },
    newReservation: 'New reservation',
    overview: {
      kpi: {
        arrivingToday: 'Arriving today',
        departingToday: 'Departing today',
        inHouse: 'In-house',
        next7Days: 'Next 7 days',
        arrivalsBooked: '{n} arrivals booked',
      },
      needsAttention: 'Needs attention',
      flag: {
        balanceDue: 'Balance due before check-in',
      },
    },
  },

  // ─── HR module ────────────────────────────────────────────────
  hr: {
    subtitle: {
      field: 'Time-off · personal stats',
      manager: 'Staff · time-off · stats · permissions',
    },
    tabs: {
      staff: 'Staff',
      timeOff: 'Time-off',
      stats: 'Stats',
      permissions: 'Permissions',
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
    appearance: {
      subtitle: 'Light, dark, or follow your system.',
      darkMode: 'Dark mode',
      darkModeHelp: 'FAD follows your OS preference by default.',
      currentlyLabel: 'Currently:',
      density: 'Density',
      densityHelp: 'Dense is standard for Inbox; comfy on large displays.',
      densityValue: 'Dense',
      sidebar: 'Sidebar',
      sidebarHelp: 'Remembered per device.',
      sidebarValue: 'Expanded',
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
    overview: {
      title: string;
      fieldAgenda: string;
      managerAgenda: string;
      dateLabel: string;
      statusFiltersAria: string;
      mobileDashboardAria: string;
      taskCountOne: string;
      taskCountMany: string;
      kpi: Record<string, string>;
      loadingLive: string;
      loadError: string;
      emptyAgenda: string;
      emptyAgendaForDate: string;
      anyTime: string;
      reservationLinked: string;
      noReservation: string;
      filesCount: string;
      commentsCount: string;
      dailyBrief: string;
      escalationsCount: string;
      noEscalations: string;
      reservationUrgentCount: string;
      noReservationUrgent: string;
      recentActivity: string;
    };
    mine: Record<string, string>;
    schedule: Record<string, string>;
    all: Record<string, string>;
    issues: Record<string, string>;
    manager: Record<string, string>;
  };
  properties: {
    subtitle: string;
    tabs: Record<string, string>;
    newProperty: string;
  };
  reservations: {
    subtitle: string;
    tabs: Record<string, string>;
    newReservation: string;
    overview: {
      kpi: Record<string, string>;
      needsAttention: string;
      flag: Record<string, string>;
    };
  };
  hr: {
    subtitle: { field: string; manager: string };
    tabs: Record<string, string>;
  };
  settings: {
    title: string;
    sections: Record<string, string>;
    language: { label: string; help: string; en: string; fr: string };
    theme: Record<string, string>;
    appearance: Record<string, string>;
    signOut: string;
  };
  common: Record<string, string>;
}
