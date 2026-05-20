import { describe, expect, it } from 'vitest';
import { parseMentions, type LiveUser } from './teamInboxClient';

const users: LiveUser[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    username: 'ishant',
    displayName: 'Ishant Ayadassen',
    email: 'ishant@friday.mu',
    role: 'admin',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    username: 'mary',
    displayName: 'Mary Finance',
    email: 'mary@friday.mu',
    role: 'admin',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    username: 'mathias.ops',
    displayName: 'Mathias Ops',
    email: 'mathias@friday.mu',
    role: 'manager',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    username: 'mathias.design',
    displayName: 'Mathias Design',
    email: 'mathias.design@friday.mu',
    role: 'manager',
  },
];

describe('parseMentions', () => {
  it('resolves full display-name mentions with spaces', () => {
    expect(parseMentions('Please check @Ishant Ayadassen today', users)).toEqual({
      mentions: ['11111111-1111-4111-8111-111111111111'],
      matches: ['@Ishant Ayadassen'],
    });
  });

  it('resolves username, compact display name, and unique first name', () => {
    const parsed = parseMentions('@mary @IshantAyadassen @Ishant', users);
    expect(parsed.mentions).toEqual([
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
    ]);
    expect(parsed.matches).toEqual(['@mary', '@IshantAyadassen', '@Ishant']);
  });

  it('does not resolve ambiguous first names or email-like fragments', () => {
    expect(parseMentions('@Mathias can inspect mathias@friday.mu', users)).toEqual({
      mentions: [],
      matches: [],
    });
  });
});
