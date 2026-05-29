'use strict';

const {
  WEBSITE_TOOL_ALLOWLIST,
  websitePublicDraftContextPacks,
} = require('./context_pack_templates');
const { normalizeContextPack } = require('./contracts');
const { validateContextPackAgainstSurface } = require('./policy');

function websiteSurface(surfaceId) {
  const base = {
    surface_id: surfaceId,
    source_system: 'friday-website',
    access_class: 'public',
    status: 'active',
    allowed_knowledge_scopes: [
      'public_brand',
      'public_residences',
      'public_experiences',
      'public_mauritius',
      'guest_booking_rules',
      'public_owner_overview',
    ],
    allowed_tools: WEBSITE_TOOL_ALLOWLIST,
    allowed_actions: [
      'request_booking',
      'request_owner_followup',
      'request_feedback',
      'request_handoff',
    ],
  };
  if (surfaceId === 'website_guest_hero') {
    return {
      ...base,
      allowed_knowledge_scopes: base.allowed_knowledge_scopes.filter((scope) => scope !== 'public_owner_overview'),
      allowed_actions: ['request_booking', 'request_handoff'],
    };
  }
  return base;
}

describe('Ask Friday public Website context-pack templates', () => {
  test('draft packs validate against public surface policy', () => {
    for (const draft of websitePublicDraftContextPacks()) {
      const pack = normalizeContextPack(draft);
      expect(pack.status).toBe('draft');
      expect(() => validateContextPackAgainstSurface(pack, websiteSurface(pack.surfaceId))).not.toThrow();
    }
  });

  test('draft packs are public-only and review-gated', () => {
    for (const draft of websitePublicDraftContextPacks()) {
      const text = JSON.stringify(draft).toLowerCase();
      expect(text).not.toContain('staff_private');
      expect(text).not.toContain('owner_private');
      expect(text).not.toContain('guest_sensitive');
      expect(text).not.toContain('payment data lookup');
      expect(draft.status).toBe('draft');
      expect(draft.packPayload.reviewBlockersBeforePublish.length).toBeGreaterThan(0);
      expect(draft.memoryPolicy.canonicalization).toContain('human_review_required');
    }
  });
});
