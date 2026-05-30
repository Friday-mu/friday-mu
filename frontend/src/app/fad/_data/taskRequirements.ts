import type {
  Department,
  Subdepartment,
  Task,
  TaskRequirement,
  TaskRequirementKind,
  TaskRequirementState,
} from './tasks';

export interface CompletionSignals {
  attachmentCount: number;
  queuedEvidenceCount: number;
  costCount: number;
  supplyCount: number;
  elapsedSeconds: number;
  spentMinutes: number;
  summary: string;
}

type TemplateDefinition = {
  label: string;
  aliases: string[];
  department?: Department;
  subdepartment?: Subdepartment;
  requirements: TaskRequirement[];
};

const required = (
  id: string,
  kind: TaskRequirementKind,
  label: string,
  description: string,
  evidenceHint?: string,
): TaskRequirement => ({
  id,
  kind,
  label,
  description,
  evidenceHint,
  required: true,
});

const optional = (
  id: string,
  kind: TaskRequirementKind,
  label: string,
  description: string,
): TaskRequirement => ({
  id,
  kind,
  label,
  description,
  required: false,
});

export const TASK_REQUIREMENT_TEMPLATES: TemplateDefinition[] = [
  {
    label: 'Standard clean',
    aliases: ['standard clean', 'cleaning correction', 'turnover clean'],
    department: 'cleaning',
    subdepartment: 'standard_clean',
    requirements: [
      required('clean-reset', 'check', 'Complete room-by-room reset', 'Bedrooms, bathrooms, kitchen, bins, floors, and exterior touchpoints are reset.'),
      required('clean-photo', 'photo', 'Attach completion photos', 'Queue or upload representative after photos before completing.', 'Photo evidence required'),
      required('clean-supplies', 'supply', 'Confirm linen and amenities restock', 'Mark done only after consumables and linen are restocked or escalated.'),
      required('clean-summary', 'summary', 'Write turnover summary', 'Note any damage, missing inventory, or guest-impacting follow-up.'),
      optional('clean-time', 'time', 'Capture time on task', 'Start the task timer or ensure spent minutes are recorded.'),
    ],
  },
  {
    label: 'Owner standard clean',
    aliases: ['owner standard clean', 'owner clean', 'owner checkout clean'],
    department: 'cleaning',
    subdepartment: 'owner_standard_clean',
    requirements: [
      required('owner-clean-reset', 'check', 'Complete owner checkout reset', 'Clean to guest-ready standard after owner or owner-guest use.'),
      required('owner-clean-photo', 'photo', 'Attach completion photos', 'Queue or upload representative after photos before completing.', 'Photo evidence required'),
      required('owner-clean-summary', 'summary', 'Write owner clean note', 'Note whether this is owner-paid, self-clean correction, or standard owner service.'),
    ],
  },
  {
    label: 'Mid-stay clean',
    aliases: ['mid-stay clean', 'mid stay clean', 'midstay clean'],
    department: 'cleaning',
    subdepartment: 'mid_stay',
    requirements: [
      required('midstay-guest-window', 'check', 'Confirm guest-approved access window', 'Confirm the agreed time window before entering the property.'),
      required('midstay-reset', 'check', 'Complete mid-stay reset', 'Refresh bathrooms, kitchen, bins, floors, linen/towels if included, and guest-facing surfaces.'),
      required('midstay-summary', 'summary', 'Write mid-stay note', 'Note guest requests, damage, missing items, or follow-up needed.'),
    ],
  },
  {
    label: 'Post-clean inspection',
    aliases: ['post-clean inspection', 'inspection follow-up', 'post clean inspection'],
    department: 'inspection',
    subdepartment: 'post_clean',
    requirements: [
      required('inspection-check', 'check', 'Pass inspection checklist', 'Inspect guest-facing rooms, amenities, safety basics, and arrival readiness.'),
      required('inspection-photo', 'photo', 'Attach inspection evidence', 'Queue or upload photos for any failed or corrected item.', 'Photo/file evidence required'),
      required('inspection-summary', 'summary', 'Write inspection result', 'Summarize pass/fail outcome and any follow-up required.'),
    ],
  },
  {
    label: 'Owner post-clean inspection',
    aliases: ['owner post-clean inspection', 'owner post clean inspection', 'owner self-clean inspection'],
    department: 'inspection',
    subdepartment: 'owner_post_clean',
    requirements: [
      required('owner-post-clean-check', 'check', 'Verify owner clean quality', 'Check whether owner/owner-guest left the property guest-ready.'),
      required('owner-post-clean-photo', 'photo', 'Attach failed-item evidence', 'Photograph any cleanliness issue that may require a billed clean.', 'Photo evidence required if failed'),
      required('owner-post-clean-summary', 'summary', 'Write owner inspection outcome', 'State pass/fail and whether a paid cleaning task should be created.'),
    ],
  },
  {
    label: 'Arrival inspection',
    aliases: ['arrival inspection', 'pre-arrival inspection', 'pre arrival inspection'],
    department: 'inspection',
    subdepartment: 'arrival_inspection',
    requirements: [
      required('arrival-access', 'check', 'Confirm access is ready', 'Verify lockbox/code, keys, parking, and arrival path.'),
      required('arrival-readiness', 'check', 'Confirm arrival readiness', 'Check bedrooms, bathrooms, AC, hot water, Wi-Fi, welcome/SRL placement, and obvious damage.'),
      required('arrival-photo', 'photo', 'Attach issue evidence', 'Queue or upload photos for any failed readiness item.', 'Photo evidence required if failed'),
      required('arrival-summary', 'summary', 'Write arrival inspection note', 'Confirm pass/fail and list any urgent follow-up before guest arrival.'),
    ],
  },
  {
    label: 'Preventative maintenance',
    aliases: ['preventative maintenance', 'preventive maintenance', 'maintenance follow-up'],
    department: 'maintenance',
    subdepartment: 'preventative_maintenance',
    requirements: [
      required('preventative-ac-filter', 'check', 'Clean/check AC filters', 'AC filter cleaning/check is included in the preventative maintenance time.'),
      required('preventative-systems', 'check', 'Check core systems', 'Check plumbing, electrical basics, appliances, doors/windows, leaks, visible wear, and safety basics.'),
      required('preventative-photo', 'photo', 'Attach issue evidence', 'Queue or upload photos for any failed or risky item.', 'Photo evidence required if issue found'),
      required('preventative-summary', 'summary', 'Write preventative note', 'List checked areas, issues found, and vendor follow-up needed.'),
    ],
  },
  {
    label: 'Maintenance follow-up',
    aliases: ['maintenance follow-up', 'repair follow-up', 'fix follow-up'],
    department: 'maintenance',
    requirements: [
      required('maintenance-diagnosis', 'check', 'Record diagnosis and fix', 'Confirm the fault, action taken, and whether specialist follow-up is needed.'),
      required('maintenance-photo', 'photo', 'Attach before/after evidence', 'Queue or upload photos/files that show the issue and result.', 'Evidence required'),
      required('maintenance-time', 'time', 'Capture work time', 'Start the timer or record spent minutes before completing.'),
      required('maintenance-summary', 'summary', 'Write maintenance summary', 'Include parts used, unresolved risk, and next action if any.'),
      optional('maintenance-expense', 'expense', 'Add cost line if parts were used', 'Record material/labor cost when owner-billable or reimbursable.'),
    ],
  },
  {
    label: 'Home buildout',
    aliases: ['home buildout', 'buildout', 'onboarding buildout'],
    department: 'maintenance',
    requirements: [
      required('buildout-scope', 'check', 'Confirm buildout scope item', 'Mark the assigned buildout item complete against property onboarding scope.'),
      required('buildout-file', 'file', 'Attach proof or file', 'Queue or upload photo, invoice, spec, or handover file.', 'File or photo required'),
      required('buildout-expense', 'expense', 'Record buildout cost', 'Add the owner-billable or internal cost line before completion.'),
      required('buildout-summary', 'summary', 'Write buildout handover note', 'Summarize what changed and what remains.'),
    ],
  },
  {
    label: 'Amenities form',
    aliases: ['amenities form', 'amenities report', 'guest service follow-up', 'amenities'],
    department: 'cleaning',
    subdepartment: 'amenities',
    requirements: [
      required('amenities-check', 'check', 'Verify amenities list', 'Confirm the property amenities list matches the physical setup.'),
      required('amenities-supply', 'supply', 'Confirm consumables restock', 'Mark done after amenities and welcome consumables are restocked or escalated.'),
      required('amenities-photo', 'photo', 'Attach amenities evidence', 'Queue or upload representative photos.', 'Photo evidence required'),
      required('amenities-summary', 'summary', 'Write amenities note', 'Note missing items, substitutions, or owner follow-up.'),
    ],
  },
  {
    label: 'Aesthetic check',
    aliases: ['aesthetic check', 'visual check', 'property aesthetic check'],
    department: 'inspection',
    subdepartment: 'aesthetic_check',
    requirements: [
      required('aesthetic-walkthrough', 'check', 'Complete visual walkthrough', 'Check visible wear, staging, decor, lighting, smell, and guest-facing first impressions.'),
      required('aesthetic-photo', 'photo', 'Attach improvement photos', 'Photograph anything that should be fixed, replaced, styled, or escalated.', 'Photo evidence required if issue found'),
      required('aesthetic-summary', 'summary', 'Write aesthetic note', 'List improvements needed and whether owner approval is required.'),
    ],
  },
  {
    label: 'Lockbox code change',
    aliases: ['lockbox code change', 'change lockbox code', 'lockbox'],
    department: 'office',
    subdepartment: 'lockbox',
    requirements: [
      required('lockbox-change', 'check', 'Change physical lockbox code', 'Confirm the property lockbox has the new monthly code.'),
      required('lockbox-photo', 'photo', 'Attach lockbox proof', 'Upload or queue a photo showing the lockbox/location, without exposing the code publicly.', 'Photo evidence required'),
      required('lockbox-update-task', 'summary', 'Note Guesty update handoff', 'Confirm whether a Guesty lockbox update task is needed or already done.'),
    ],
  },
  {
    label: 'Guesty lockbox update',
    aliases: ['guesty lockbox update', 'update guesty lockbox', 'update guesty code'],
    department: 'office',
    subdepartment: 'lockbox',
    requirements: [
      required('guesty-code-update', 'check', 'Update Guesty lockbox code', 'Update the correct listing/reservation automation so arrival instructions send the right code.'),
      required('guesty-code-verify', 'check', 'Verify code timing', 'Confirm the code will be sent before guest arrival, currently 10:00 on arrival day.'),
      required('guesty-code-summary', 'summary', 'Write update note', 'Record property, date changed, and any risk for upcoming arrivals.'),
    ],
  },
  {
    label: 'Pest control',
    aliases: ['pest control', 'quarterly pest control'],
    department: 'maintenance',
    subdepartment: 'pest_control',
    requirements: [
      required('pest-control-done', 'check', 'Complete pest-control pass', 'Apply or verify pest-control treatment for the property.'),
      required('pest-control-photo', 'photo', 'Attach treatment evidence', 'Queue or upload proof of treatment or issue evidence.', 'Photo evidence required'),
      required('pest-control-summary', 'summary', 'Write pest-control note', 'Note treatment completed, pest signs, and follow-up date if needed.'),
    ],
  },
  {
    label: 'Store cleaning',
    aliases: ['store cleaning', 'clean store', 'storage cleaning'],
    department: 'cleaning',
    subdepartment: 'store_cleaning',
    requirements: [
      required('store-reset', 'check', 'Clean and organize store', 'Reset shelves, remove trash, group supplies, and surface any low-stock or damaged items.'),
      required('store-photo', 'photo', 'Attach store photos', 'Queue or upload after photos showing store state.', 'Photo evidence required'),
      required('store-summary', 'summary', 'Write store note', 'Mention stock risks, damaged supplies, or next procurement needs.'),
    ],
  },
  {
    label: 'Procurement',
    aliases: ['procurement', 'buy supplies', 'supply run', 'purchase run'],
    department: 'office',
    subdepartment: 'procurement',
    requirements: [
      required('procurement-list', 'check', 'Confirm shopping list', 'Confirm requested items, property/store destination, and urgency before buying.'),
      required('procurement-expense', 'expense', 'Capture receipt/expense', 'Add expense line and receipt for purchased items.', 'Receipt required'),
      required('procurement-summary', 'summary', 'Write procurement note', 'Record vendor, what was bought, and where supplies were dropped.'),
    ],
  },
  {
    label: 'Quick maintenance reset',
    aliases: ['quick maintenance reset', 'quick reset', 'simple reset'],
    department: 'maintenance',
    subdepartment: 'quick_reset',
    requirements: [
      required('quick-reset-action', 'check', 'Perform simple reset', 'Handle safe basic reset only; escalate if specialist work is needed.'),
      required('quick-reset-photo', 'photo', 'Attach proof if visible', 'Queue or upload photo if the issue/result is visible.', 'Photo evidence if visible'),
      required('quick-reset-summary', 'summary', 'Write reset outcome', 'State what was reset and whether the issue is resolved.'),
    ],
  },
  {
    label: 'AC servicing',
    aliases: ['ac servicing', 'a/c servicing', 'aircon servicing'],
    department: 'maintenance',
    subdepartment: 'ac_servicing',
    requirements: [
      required('ac-vendor-confirm', 'check', 'Confirm AC vendor/service visit', 'External vendor handles servicing for now; Bryan can supervise when practical.'),
      required('ac-unit-count', 'summary', 'Record AC units serviced', 'List units serviced and any units skipped or needing follow-up.'),
      required('ac-service-proof', 'photo', 'Attach service evidence', 'Queue or upload vendor proof, unit photos, or invoice.', 'Evidence required'),
      optional('ac-service-expense', 'expense', 'Capture vendor cost', 'Add invoice/expense if billed or owner-chargeable.'),
    ],
  },
];

export const CORE_TASK_TEMPLATE_OPTIONS = TASK_REQUIREMENT_TEMPLATES.map((template) => template.label);

function cloneRequirements(requirements: TaskRequirement[]): TaskRequirement[] {
  return requirements.map((req) => ({ ...req }));
}

function normalizeTemplateName(template?: string): string {
  return (template || '').trim().toLowerCase();
}

function templateFor(template?: string, department?: Department, subdepartment?: Subdepartment): TemplateDefinition | undefined {
  const normalized = normalizeTemplateName(template);
  if (normalized) {
    const explicit = TASK_REQUIREMENT_TEMPLATES.find((candidate) => (
      candidate.label.toLowerCase() === normalized ||
      candidate.aliases.includes(normalized)
    ));
    if (explicit) return explicit;
  }
  return TASK_REQUIREMENT_TEMPLATES.find((candidate) => (
    (candidate.subdepartment && candidate.subdepartment === subdepartment) ||
    (!candidate.subdepartment && candidate.department === department)
  ));
}

export function requirementsForTemplate(
  template?: string,
  department?: Department,
  subdepartment?: Subdepartment,
): TaskRequirement[] {
  const definition = templateFor(template, department, subdepartment);
  return definition ? cloneRequirements(definition.requirements) : [];
}

export function normalizeRequirements(requirements?: TaskRequirement[] | null): TaskRequirement[] {
  if (!Array.isArray(requirements)) return [];
  return requirements
    .filter((req): req is TaskRequirement => Boolean(req?.id && req?.label && req?.kind))
    .map((req) => ({ ...req, required: req.required !== false }));
}

export function requirementsForTask(task: Pick<Task, 'requirements' | 'template' | 'department' | 'subdepartment'>): TaskRequirement[] {
  const persisted = normalizeRequirements(task.requirements);
  if (persisted.length > 0) return persisted;
  if (!task.template?.trim()) return [];
  return requirementsForTemplate(task.template, task.department, task.subdepartment);
}

export function initialRequirementState(): TaskRequirementState {
  return { completedIds: [], waivedIds: [] };
}

function uniqueIds(values?: string[]): string[] {
  return Array.from(new Set((values || []).filter((id) => typeof id === 'string' && id.trim().length > 0)));
}

export function normalizeRequirementState(state?: TaskRequirementState | null): TaskRequirementState {
  return {
    completedIds: uniqueIds(state?.completedIds),
    waivedIds: uniqueIds(state?.waivedIds),
    updatedAt: state?.updatedAt,
  };
}

export function requirementSatisfied(
  requirement: TaskRequirement,
  state: TaskRequirementState,
  signals: CompletionSignals,
): boolean {
  if (state.waivedIds.includes(requirement.id)) return true;
  if (requirement.kind === 'check') {
    return state.completedIds.includes(requirement.id);
  }
  if (requirement.kind === 'supply') {
    return state.completedIds.includes(requirement.id) || signals.supplyCount > 0;
  }
  if (requirement.kind === 'photo' || requirement.kind === 'file') {
    return signals.attachmentCount + signals.queuedEvidenceCount > 0;
  }
  if (requirement.kind === 'expense') {
    return signals.costCount > 0;
  }
  if (requirement.kind === 'time') {
    return signals.spentMinutes > 0 || signals.elapsedSeconds > 0;
  }
  if (requirement.kind === 'summary') {
    return signals.summary.trim().length > 0;
  }
  return state.completedIds.includes(requirement.id);
}

export function missingRequiredRequirements(
  requirements: TaskRequirement[],
  state: TaskRequirementState,
  signals: CompletionSignals,
): TaskRequirement[] {
  return requirements.filter((req) => req.required && !requirementSatisfied(req, state, signals));
}
