import { describe, expect, it, vi } from 'vitest';
import { allNotifications } from './notifications';

vi.mock('../../../components/types', () => ({
  API_BASE: '',
  apiFetch: vi.fn().mockRejectedValue(new Error('not used in visibility tests')),
  getToken: vi.fn(() => null),
}));

describe('notification visibility', () => {
  it('does not show field staff finance or property notifications', () => {
    const items = allNotifications('field', 'u-bryan');
    expect(items.some((n) => n.module === 'finance')).toBe(false);
    expect(items.some((n) => n.module === 'properties')).toBe(false);
  });

  it('keeps field staff operational notifications available', () => {
    const items = allNotifications('field', 'u-bryan');
    expect(items.some((n) => n.module === 'operations')).toBe(true);
  });

  it('keeps director notifications broad', () => {
    const items = allNotifications('director', 'u-ishant');
    expect(items.some((n) => n.module === 'finance')).toBe(true);
    expect(items.some((n) => n.module === 'properties')).toBe(true);
  });
});
