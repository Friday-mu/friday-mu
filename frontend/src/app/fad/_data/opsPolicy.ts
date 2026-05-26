// @demo:config - Replace with GET /api/operations/policy.
// Holds Friday-specific staffing, task duration, combo-property, and SRL rules
// until Operations policy is tenant-configurable. Tag: PROD-CONFIG-11.

import type { Department, Subdepartment } from './tasks';
import type { PropertyTier } from './properties';

export type OpsSize = 'small' | 'medium' | 'large';
export type StaffTravelBase = 'cap_malheureux' | 'roche_terre' | 'flic_en_flac' | 'sodnac_unknown';
export type StaffTransportMode = 'bus' | 'scooter' | 'car' | 'unknown';
export type OpsRegion = 'north' | 'west' | 'north_west';
export type MaintenanceComplexity = 'quick_reset' | 'low' | 'medium' | 'high';

export interface OpsStaffPolicy {
  id: string;
  fullName: string;
  base: StaffTravelBase;
  primaryRoles: string[];
  backupRoles: string[];
  avoidRoles?: string[];
  transport: {
    north?: StaffTransportMode[];
    west?: StaffTransportMode[];
    notes?: string;
  };
  schedulingNotes?: string[];
}

export interface OpsMaintenanceVendorPolicy {
  id: string;
  name: string;
  regions: OpsRegion[];
  services: string[];
  complexity: MaintenanceComplexity[];
  leadTimeHours: number;
  pricePosture: 'internal' | 'average' | 'higher' | 'unknown';
  notes: string;
}

export const OPS_STAFF_POLICY: OpsStaffPolicy[] = [
  {
    id: 'u-mathias',
    fullName: 'Mathias Duval',
    base: 'cap_malheureux',
    primaryRoles: ['guest_services', 'marketing', 'reservations', 'owner_comms'],
    backupRoles: ['admin_follow_up', 'guesty_update', 'amenities_report_north', 'procurement_with_car_north', 'lockbox_north'],
    avoidRoles: ['field_cleaning', 'maintenance'],
    transport: { north: ['car'], notes: 'No weekend work by default. Max two night shifts per week.' },
  },
  {
    id: 'u-bryan',
    fullName: 'Bryan Henri',
    base: 'cap_malheureux',
    primaryRoles: ['maintenance', 'cleaning', 'inspection', 'procurement', 'lockbox'],
    backupRoles: ['amenities_report', 'home_buildout', 'aesthetic_check'],
    transport: {
      north: ['scooter'],
      west: ['bus', 'scooter'],
      notes: 'Bus north-west-north. When working west, schedule roughly 08:00-15:00 and avoid leaving west after 15:00.',
    },
  },
  {
    id: 'u-franny',
    fullName: 'Franny Henri',
    base: 'cap_malheureux',
    primaryRoles: ['ops_manager', 'owner_comms', 'roster', 'schedule', 'guest_services'],
    backupRoles: ['inspection', 'cleaning', 'lockbox_emergency', 'deep_clean_after_2026_09'],
    avoidRoles: ['routine_field_work_during_pregnancy', 'maintenance'],
    transport: { north: ['bus'], west: ['bus'] },
    schedulingNotes: ['Avoid field deployment during pregnancy except emergency. Deep-clean backup resumes after September 2026.'],
  },
  {
    id: 'u-catherine',
    fullName: 'Catherine Henri',
    base: 'roche_terre',
    primaryRoles: ['cleaning', 'inspection', 'amenities_report', 'aesthetic_check', 'home_buildout'],
    backupRoles: ['lockbox', 'basic_reset_if_trained'],
    avoidRoles: ['maintenance', 'procurement_without_transport'],
    transport: { north: ['bus'], west: ['bus'] },
  },
  {
    id: 'u-ishant',
    fullName: 'Ishant Ayadassen',
    base: 'flic_en_flac',
    primaryRoles: ['director', 'escalations', 'west_backup', 'procurement_with_car'],
    backupRoles: ['quick_maintenance_reset_west', 'post_clean_west', 'arrival_inspection_west'],
    avoidRoles: ['cleaning', 'amenities_report', 'preventative_maintenance', 'routine_non_urgent_field_work'],
    transport: { west: ['car'], north: ['car'], notes: 'Le Datier Complex, Flic-en-Flac. West procurement/car backup.' },
  },
  {
    id: 'u-mary',
    fullName: 'Mary Oladimeji',
    base: 'sodnac_unknown',
    primaryRoles: ['guest_services', 'night_shift', 'admin_follow_up'],
    backupRoles: ['operations_cover'],
    avoidRoles: ['field_work'],
    transport: { notes: 'Exact location unknown. Use Sodnac/Centre as planning placeholder.' },
    schedulingNotes: ['Leaving end of May 2026. Do not make future roster assumptions beyond handover.'],
  },
];

export const OPS_MAINTENANCE_VENDOR_POLICY: OpsMaintenanceVendorPolicy[] = [
  {
    id: 'internal-bryan',
    name: 'Bryan Henri',
    regions: ['north', 'west'],
    services: ['maintenance', 'cleaning', 'procurement', 'inspection'],
    complexity: ['quick_reset', 'low', 'medium'],
    leadTimeHours: 0,
    pricePosture: 'internal',
    notes: 'Default internal first-line maintenance. West work should respect the 08:00-15:00 bus window when possible.',
  },
  {
    id: 'vendor-rodney',
    name: 'Rodney',
    regions: ['west'],
    services: ['ac', 'plumbing', 'limited_electrical'],
    complexity: ['low', 'medium', 'high'],
    leadTimeHours: 4,
    pricePosture: 'average',
    notes: 'West backup when Bryan cannot handle or cannot reach the property in time.',
  },
  {
    id: 'vendor-joe',
    name: 'Joe',
    regions: ['west'],
    services: ['general_maintenance'],
    complexity: ['low', 'medium', 'high'],
    leadTimeHours: 4,
    pricePosture: 'average',
    notes: 'New west vendor to validate after first jobs.',
  },
  {
    id: 'vendor-faiz',
    name: 'Faiz',
    regions: ['north_west'],
    services: ['electrical'],
    complexity: ['medium', 'high'],
    leadTimeHours: 24,
    pricePosture: 'higher',
    notes: 'Preferred for complex electrical work across north and west.',
  },
  {
    id: 'vendor-adrien-multimaintenance',
    name: 'Adrien / Multi-Maintenance Limited',
    regions: ['north_west'],
    services: ['complex_maintenance'],
    complexity: ['high'],
    leadTimeHours: 48,
    pricePosture: 'higher',
    notes: 'Use for larger complex work; harder to schedule.',
  },
];

export const OPS_COMBO_PROPERTIES: Record<string, string[]> = {
  'LB-C': ['LB-1', 'LB-2', 'LB-3'],
  'VA-C': ['VA-1', 'VA-2', 'VA-3', 'VA-4'],
};

export const OPS_PROPERTY_SIZE_OVERRIDES: Record<string, OpsSize> = {
  'LB-1': 'medium',
  'LB-2': 'medium',
  'LB-3': 'medium',
  'VA-1': 'medium',
  'VA-2': 'medium',
  'VA-3': 'small',
  'VA-4': 'small',
};

export const OPS_PROPERTY_PARENT: Record<string, string> = Object.entries(OPS_COMBO_PROPERTIES)
  .reduce<Record<string, string>>((acc, [parent, children]) => {
    children.forEach((child) => { acc[child] = parent; });
    return acc;
  }, {});

export const OPS_MAX_GUESTS_RULE = {
  guestsPerBedroom: 2,
  guestsPerSofaBed: 1,
};

export const OPS_SRL_RULES = {
  perBathroom: {
    shampooBottle: 2,
    conditionerBottle: 2,
    soap: 2,
    passiveScent: 1,
  },
  perProperty: {
    waterBottle: 2,
    cokeCan: 1,
    fantaCan: 1,
    ferreroRocherThreePack: 1,
    extraPassiveScent: 1,
  },
  perMaxGuest: {
    coffeePacket: 2,
    sugarPacket: 2,
  },
};

const SIZE_DURATION: Record<OpsSize, number> = {
  small: 90,
  medium: 120,
  large: 150,
};

export const OPS_TASK_DURATION_MINUTES = {
  standardClean: { small: 90, medium: 120, large: 150 },
  ownerStandardClean: { small: 90, medium: 120, large: 150 },
  deepClean: { small: 180, medium: 240, large: 300 },
  postCleanInspection: { small: 15, medium: 30, large: 45 },
  ownerPostCleanInspection: { small: 15, medium: 30, large: 45 },
  arrivalInspection: { small: 30, medium: 30, large: 45 },
  amenitiesReport: { small: 60, medium: 75, large: 90 },
  preventativeMaintenance: { small: 90, medium: 120, large: 150 },
  aestheticCheck: { small: 15, medium: 30, large: 45 },
  homeBuildout: { small: 60, medium: 75, large: 90 },
  lockboxCodeChange: 15,
  guestyLockboxUpdate: 15,
  pestControl: 15,
  storeCleaning: 60,
  procurementBase: 30,
  quickMaintenanceReset: 15,
  acServicingPerAc: 60,
} as const;

export function opsSizeFromTier(tier?: PropertyTier | null): OpsSize {
  if (tier === 'small') return 'small';
  if (tier === 'medium') return 'medium';
  return 'large';
}

export function opsSizeForProperty(code?: string | null, tier?: PropertyTier | null): OpsSize {
  const normalized = String(code || '').trim().toUpperCase();
  return OPS_PROPERTY_SIZE_OVERRIDES[normalized] || opsSizeFromTier(tier);
}

export function comboChildCodesForProperty(code?: string | null): string[] {
  const normalized = String(code || '').trim().toUpperCase();
  return OPS_COMBO_PROPERTIES[normalized] || [];
}

function durationBySize(values: Record<OpsSize, number>, size: OpsSize): number {
  return values[size];
}

function baseDurationForTemplate(
  template: string | undefined,
  department: Department,
  subdepartment: Subdepartment,
  size: OpsSize,
): number | null {
  const t = String(template || '').trim().toLowerCase();
  if (t === 'standard clean' || t === 'cleaning correction' || subdepartment === 'standard_clean') {
    return durationBySize(OPS_TASK_DURATION_MINUTES.standardClean, size);
  }
  if (t === 'owner standard clean') return durationBySize(OPS_TASK_DURATION_MINUTES.ownerStandardClean, size);
  if (t === 'mid-stay clean' || subdepartment === 'mid_stay') {
    return durationBySize(OPS_TASK_DURATION_MINUTES.standardClean, size);
  }
  if (t === 'deep clean' || subdepartment === 'deep_clean') {
    return durationBySize(OPS_TASK_DURATION_MINUTES.deepClean, size);
  }
  if (t === 'post-clean inspection' || t === 'inspection follow-up' || subdepartment === 'post_clean') {
    return durationBySize(OPS_TASK_DURATION_MINUTES.postCleanInspection, size);
  }
  if (t === 'owner post-clean inspection') return durationBySize(OPS_TASK_DURATION_MINUTES.ownerPostCleanInspection, size);
  if (t === 'arrival inspection' || subdepartment === 'pre_arrival' || subdepartment === 'arrival_inspection') {
    return durationBySize(OPS_TASK_DURATION_MINUTES.arrivalInspection, size);
  }
  if (t === 'amenities form' || t === 'amenities report' || subdepartment === 'amenities') {
    return durationBySize(OPS_TASK_DURATION_MINUTES.amenitiesReport, size);
  }
  if (t === 'preventative maintenance' || t === 'preventive maintenance' || subdepartment === 'preventative_maintenance') {
    return durationBySize(OPS_TASK_DURATION_MINUTES.preventativeMaintenance, size);
  }
  if (t === 'aesthetic check' || subdepartment === 'aesthetic_check') {
    return durationBySize(OPS_TASK_DURATION_MINUTES.aestheticCheck, size);
  }
  if (t === 'home buildout' || t === 'home build-out' || subdepartment === 'home_buildout') {
    return durationBySize(OPS_TASK_DURATION_MINUTES.homeBuildout, size);
  }
  if (t === 'lockbox code change' || subdepartment === 'lockbox') return OPS_TASK_DURATION_MINUTES.lockboxCodeChange;
  if (t === 'guesty lockbox update') return OPS_TASK_DURATION_MINUTES.guestyLockboxUpdate;
  if (t === 'pest control' || subdepartment === 'pest_control') return OPS_TASK_DURATION_MINUTES.pestControl;
  if (t === 'store cleaning' || subdepartment === 'store_cleaning') return OPS_TASK_DURATION_MINUTES.storeCleaning;
  if (t === 'procurement' || subdepartment === 'procurement') return OPS_TASK_DURATION_MINUTES.procurementBase;
  if (t === 'quick maintenance reset' || subdepartment === 'quick_reset') return OPS_TASK_DURATION_MINUTES.quickMaintenanceReset;
  if (t === 'ac servicing' || subdepartment === 'ac_servicing') return OPS_TASK_DURATION_MINUTES.acServicingPerAc;
  if (department === 'maintenance') return OPS_TASK_DURATION_MINUTES.quickMaintenanceReset;
  if (department === 'cleaning') return SIZE_DURATION[size];
  return null;
}

export function suggestedMinutesForTask(input: {
  template?: string;
  department: Department;
  subdepartment: Subdepartment;
  propertyCode?: string | null;
  propertyTier?: PropertyTier | null;
}): number | null {
  const childCodes = comboChildCodesForProperty(input.propertyCode);
  if (childCodes.length > 0) {
    const childTotal = childCodes
      .map((code) => baseDurationForTemplate(input.template, input.department, input.subdepartment, opsSizeForProperty(code),))
      .filter((value): value is number => typeof value === 'number');
    if (childTotal.length === childCodes.length) {
      return childTotal.reduce((sum, value) => sum + value, 0);
    }
  }
  return baseDurationForTemplate(
    input.template,
    input.department,
    input.subdepartment,
    opsSizeForProperty(input.propertyCode, input.propertyTier),
  );
}
