import { describe, expect, it } from 'vitest';
import { apiProjectToFixture, type ApiProject } from './designClient';
import { combinedOptionalStages, engagementScopeStageRules } from './design';

// design-be-23: regression tests for the design-only engagement fork.
// apiProjectToFixture is the read-path adapter every UI component goes
// through, so verifying the masking + passthrough here covers the
// whole frontend.

function buildApiProject(overrides: Partial<ApiProject> = {}): ApiProject {
  return {
    id: 'p-test',
    entity_id: 'FD',
    name: 'Test project',
    slug: 'test-project',
    counterparty_id: 'cp-1',
    property_id: 'pr-1',
    classification: 'renovation',
    tier: 1,
    lead_source: 'other',
    epc_minor: 3_000_000_00, // Tier 1: > Rs 1.5M
    design_fee_minor: null,
    procurement_fee_minor: null,
    design_fee_minor_override: null,
    procurement_fee_minor_override: null,
    budget_expectation_minor: 3_000_000_00,
    goals: [],
    outcomes: [],
    urgency: null,
    pm_link: 'not_managed',
    design_lead_user_id: null,
    current_stage: 'lead',
    stage_status: 'pending',
    blocker: null,
    next_action: null,
    lifecycle_status: 'active',
    paused_at: null,
    paused_reason: null,
    paused_by_user_id: null,
    cancelled_at: null,
    cancelled_reason: null,
    cancelled_by_user_id: null,
    cancel_transfer_to_inventory: null,
    start_date: null,
    estimated_completion: null,
    floor_plan_image_id: null,
    floor_plan_furnished_image_id: null,
    created_at: '2026-05-13T00:00:00.000Z',
    updated_at: '2026-05-13T00:00:00.000Z',
    ...overrides,
  };
}

describe('apiProjectToFixture — engagement scope', () => {
  it('passes engagementScope through, defaulting to design_and_execution when omitted', () => {
    const fullScope = apiProjectToFixture(buildApiProject());
    expect(fullScope.engagementScope).toBe('design_and_execution');

    const explicit = apiProjectToFixture(buildApiProject({ engagement_scope: 'design_only' }));
    expect(explicit.engagementScope).toBe('design_only');
  });

  it('zeroes procurementFeeMinor when engagement_scope is design_only, regardless of override', () => {
    // No override: the tier-derived procurement fee would normally be
    // 12.5% of 3M for Tier 1 renovation = 375,000_00.
    const designOnly = apiProjectToFixture(buildApiProject({
      engagement_scope: 'design_only',
    }));
    expect(designOnly.procurementFeeMinor).toBe(0);

    // Even a pinned override is masked.
    const designOnlyWithOverride = apiProjectToFixture(buildApiProject({
      engagement_scope: 'design_only',
      procurement_fee_minor_override: 999_999_00,
    }));
    expect(designOnlyWithOverride.procurementFeeMinor).toBe(0);

    // Full-scope still respects the derivation.
    const fullScope = apiProjectToFixture(buildApiProject({
      engagement_scope: 'design_and_execution',
    }));
    expect(fullScope.procurementFeeMinor).toBeGreaterThan(0);
  });

  it('derives effectiveTotalFeeMinor = designFeeMinor under design_only', () => {
    const designOnly = apiProjectToFixture(buildApiProject({
      engagement_scope: 'design_only',
    }));
    expect(designOnly.effectiveTotalFeeMinor).toBe(designOnly.designFeeMinor);
    expect(designOnly.procurementFeeMinor).toBe(0);

    // Full-scope: total = design + procurement.
    const fullScope = apiProjectToFixture(buildApiProject({
      engagement_scope: 'design_and_execution',
    }));
    const expectedTotal = (fullScope.designFeeMinor ?? 0) + (fullScope.procurementFeeMinor ?? 0);
    expect(fullScope.effectiveTotalFeeMinor).toBe(expectedTotal);
  });
});

describe('engagementScopeStageRules + combinedOptionalStages', () => {
  it('lists the execution-phase stages as optional for design_only', () => {
    const optional = engagementScopeStageRules.design_only.optionalStages;
    expect(optional).toContain('final-budget');
    expect(optional).toContain('funding-gate');
    expect(optional).toContain('execution');
    expect(optional).toContain('expense-capture');
    expect(optional).toContain('reconciliation');
  });

  it('is empty for design_and_execution (no scope-driven skips)', () => {
    expect(engagementScopeStageRules.design_and_execution.optionalStages).toEqual([]);
  });

  it('unions tier + scope optional stages without duplicates', () => {
    // Tier 3 + design_only: T3 already has design-pack + design-review
    // optional from tierStageRules; design_only adds execution-phase 14-17.
    // None of the T3 stages overlap with the execution-phase set, so the
    // union should be a superset of both.
    const t3Only = combinedOptionalStages(3, 'design_only');
    expect(t3Only).toContain('design-pack');     // from tier
    expect(t3Only).toContain('design-review');   // from tier
    expect(t3Only).toContain('execution');       // from scope
    expect(t3Only).toContain('reconciliation');  // from scope

    // Tier 1 + design_only: T1 has no tier-optional stages, so only the
    // scope stages should appear.
    const t1Only = combinedOptionalStages(1, 'design_only');
    expect(t1Only).toEqual([
      'final-budget', 'funding-gate', 'execution', 'expense-capture', 'reconciliation',
    ]);

    // Full-scope = exactly the tier rules.
    const t1Full = combinedOptionalStages(1, 'design_and_execution');
    expect(t1Full).toEqual([]);

    // No duplicate IDs after the union.
    const ids = new Set(t3Only);
    expect(ids.size).toBe(t3Only.length);
  });
});
