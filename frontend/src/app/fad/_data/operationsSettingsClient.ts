import { apiFetch } from '../../../components/types';

// Operations settings client — per-tenant editable config (task templates,
// booking-trigger policies, recurring rules). Backend: migration 114 +
// src/operations/settings.js (GET/PUT /api/operations/settings).

export interface OpsTemplate {
  id?: string;
  name: string;
  route: string;
  estimate: string;
  enabled: boolean;
}
export interface OpsRule {
  id?: string;
  trigger: string;
  actions: string[];
  enabled: boolean;
}
export interface OperationsSettingsConfig {
  templates: OpsTemplate[];
  bookingPolicies: OpsRule[];
  recurringRules: OpsRule[];
}
export interface OperationsSettingsResponse {
  config: OperationsSettingsConfig;
  updated_at: string | null;
  is_default?: boolean;
}

// Resilience fallback only — the backend (GET) is the source of truth and
// returns these same seed defaults when a tenant hasn't customized yet.
export const DEFAULT_OPERATIONS_SETTINGS: OperationsSettingsConfig = {
  templates: [
    { id: 'std-clean', name: 'Standard cleaning', route: 'cleaning > standard_clean', estimate: '2h', enabled: true },
    { id: 'post-clean', name: 'Post-clean inspection', route: 'inspection > post_clean', estimate: '30m', enabled: true },
    { id: 'pre-arrival', name: 'Pre-arrival inspection', route: 'inspection > pre_arrival', estimate: '45m', enabled: true },
    { id: 'deep-clean', name: 'Deep clean', route: 'cleaning > deep_clean', estimate: '6h', enabled: true },
    { id: 'pool', name: 'Pool clarity check', route: 'maintenance > pool', estimate: '45m', enabled: true },
  ],
  bookingPolicies: [
    { id: 'checkout', trigger: 'Checkout received', actions: ['Create standard cleaning for checkout day', 'Create post-clean inspection after cleaning is due'], enabled: false },
    { id: 'pre-checkin', trigger: 'Two days before check-in', actions: ['If property is empty more than 3 days or flagged, create pre-arrival inspection', 'Otherwise skip to avoid noise'], enabled: false },
  ],
  recurringRules: [
    { id: 'pest', trigger: 'Pest control per property', actions: ['Every 3 months'], enabled: true },
    { id: 'ac', trigger: 'AC servicing per property', actions: ['Every 6 months'], enabled: true },
    { id: 'preventative', trigger: 'Preventative maintenance', actions: ['Monthly - all properties'], enabled: true },
    { id: 'aesthetic', trigger: 'Aesthetic check', actions: ['Monthly - all properties'], enabled: true },
    { id: 'amenities', trigger: 'Amenities form gap analysis', actions: ['Monthly - sequential'], enabled: true },
  ],
};

export function fetchOperationsSettings(): Promise<OperationsSettingsResponse> {
  return apiFetch('/api/operations/settings') as Promise<OperationsSettingsResponse>;
}

export function saveOperationsSettings(config: OperationsSettingsConfig): Promise<OperationsSettingsResponse> {
  return apiFetch('/api/operations/settings', {
    method: 'PUT',
    body: JSON.stringify({ config }),
  }) as Promise<OperationsSettingsResponse>;
}

export function newSettingsId(): string {
  // Browser-side id for new rows; the backend preserves it (or assigns one).
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `it-${crypto.randomUUID().slice(0, 8)}`;
  } catch { /* ignore */ }
  return `it-${Math.abs(Date.now() % 1e9).toString(36)}`;
}
