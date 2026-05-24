// Frontend-only role/gate stub for the Finance module.
// Real RBAC ships with Tasks 3.2 (backend route guards). Until then, FE shows what
// each role would see and locks the rest with a tooltip + screen.

export type FinRole = 'admin' | 'manager' | 'contributor';

export interface FinRoleGate {
  /** Sub-page IDs the role can access (others get a 🔒 in sidebar + lock screen on route) */
  sub: Set<string>;
  canApprove: boolean;
  canClose: boolean;
  canCapture: boolean;
  canEditVendors: boolean;
  canUploadStatements: boolean;
}

export const FIN_ROLE_GATES: Record<FinRole, FinRoleGate> = {
  // Finance Insights panel (`insights`) is admin-only per scope
  // 36a43ca8849281e48272f92596717764: it's the CEO's financial
  // management cockpit, gated to the top financial role. Mathias /
  // Franny (manager / contributor) explicitly do NOT see it.
  admin: {
    sub: new Set([
      'overview', 'transactions', 'approvals', 'owner-statements',
      'tourist-tax', 'pnl', 'float-ledger', 'reports', 'insights', 'settings',
    ]),
    canApprove: true, canClose: true, canCapture: true,
    canEditVendors: true, canUploadStatements: true,
  },
  manager: {
    sub: new Set([
      'overview', 'transactions', 'approvals', 'owner-statements',
      'tourist-tax', 'pnl', 'float-ledger', 'reports',
    ]),
    canApprove: true, canClose: false, canCapture: true,
    canEditVendors: true, canUploadStatements: false,
  },
  contributor: {
    sub: new Set(['overview', 'transactions']),
    canApprove: false, canClose: false, canCapture: true,
    canEditVendors: false, canUploadStatements: false,
  },
};

export const FIN_ROLE_LABELS: Record<FinRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  contributor: 'Contributor',
};

/** All Finance sub-page IDs (kept aligned with modules.ts subPages). */
export const FIN_ALL_SUB_IDS = [
  'overview', 'transactions', 'approvals', 'owner-statements',
  'tourist-tax', 'pnl', 'float-ledger', 'reports', 'insights', 'settings',
];

/** Compute the set of locked sub-page IDs for a given role — used by Sidebar for lock icons. */
export function lockedFinanceSubsFor(role: FinRole): Set<string> {
  const allowed = FIN_ROLE_GATES[role].sub;
  return new Set(FIN_ALL_SUB_IDS.filter((id) => !allowed.has(id)));
}
