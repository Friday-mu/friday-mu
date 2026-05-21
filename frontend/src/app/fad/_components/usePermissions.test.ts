import { describe, expect, it } from 'vitest';
import { canSeeModule, decodeJwtClaimsForPermissions } from './usePermissions';

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('module visibility permissions', () => {
  it('keeps Bryan/field out of tenant-admin and cross-tenant management surfaces', () => {
    expect(canSeeModule('field', 'tenant-settings')).toBe(false);
    expect(canSeeModule('field', 'billing')).toBe(false);
    expect(canSeeModule('field', 'admin-analytics')).toBe(false);
    expect(canSeeModule('field', 'notifications')).toBe(false);
  });

  it('still lets field staff reach their operational surfaces', () => {
    expect(canSeeModule('field', 'operations')).toBe(true);
    expect(canSeeModule('field', 'reservations')).toBe(true);
    expect(canSeeModule('field', 'settings')).toBe(true);
  });

  it('allows directors to see tenant-admin surfaces', () => {
    expect(canSeeModule('director', 'tenant-settings')).toBe(true);
    expect(canSeeModule('director', 'billing')).toBe(true);
    expect(canSeeModule('director', 'admin-analytics')).toBe(true);
    expect(canSeeModule('director', 'notifications')).toBe(true);
  });

  it('decodes base64url JWT payloads so Bryan resolves from token instead of falling back to director', () => {
    const token = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
      username: 'bryan@friday.mu',
      role: 'staff',
      user_id: '66666666-6666-4666-8666-666666666666',
    })}.signature`;

    expect(decodeJwtClaimsForPermissions(token)).toEqual({
      email: 'bryan@friday.mu',
      dbRole: 'staff',
      userId: '66666666-6666-4666-8666-666666666666',
    });
  });
});
