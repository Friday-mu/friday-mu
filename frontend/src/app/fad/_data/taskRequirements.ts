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
    label: 'Preventative maintenance',
    aliases: ['preventative maintenance', 'preventive maintenance', 'maintenance follow-up'],
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
    aliases: ['amenities form', 'guest service follow-up', 'amenities'],
    department: 'cleaning',
    subdepartment: 'amenities',
    requirements: [
      required('amenities-check', 'check', 'Verify amenities list', 'Confirm the property amenities list matches the physical setup.'),
      required('amenities-supply', 'supply', 'Confirm consumables restock', 'Mark done after amenities and welcome consumables are restocked or escalated.'),
      required('amenities-photo', 'photo', 'Attach amenities evidence', 'Queue or upload representative photos.', 'Photo evidence required'),
      required('amenities-summary', 'summary', 'Write amenities note', 'Note missing items, substitutions, or owner follow-up.'),
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
