import { describe, expect, it } from 'vitest';
import { apiProjectToFixture, type ApiProject } from './designClient';

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
