import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseMentions, type LiveUser } from './teamInboxClient';

const outboundSendMock = vi.fn();

vi.mock('./outboundClient', () => ({
  outboundSend: outboundSendMock,
}));

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

  it('resolves the local part when username is stored as an email address', () => {
    const parsed = parseMentions('@catherine can you check this?', [
      ...users,
      {
        id: '55555555-5555-4555-8555-555555555555',
        username: 'catherine@friday.mu',
        displayName: 'Catherine Laville',
        email: 'catherine@friday.mu',
        role: 'agent',
      },
    ]);
    expect(parsed.mentions).toEqual(['55555555-5555-4555-8555-555555555555']);
    expect(parsed.matches).toEqual(['@catherine']);
  });

  it('does not resolve ambiguous first names or email-like fragments', () => {
    expect(parseMentions('@Mathias can inspect mathias@friday.mu', users)).toEqual({
      mentions: [],
      matches: [],
    });
  });
});

describe('TeamInbox send contracts', () => {
  beforeEach(() => {
    outboundSendMock.mockReset();
  });

  it('sends channel messages through outbound with parsed mention UUIDs', async () => {
    outboundSendMock.mockResolvedValue({
      ok: true,
      upstream: {
        message: {
          id: 'msg-channel',
          text: '@mary please check',
          mentions: ['22222222-2222-4222-8222-222222222222'],
        },
      },
    });

    const { sendChannelMessage } = await import('./teamInboxClient');
    const message = await sendChannelMessage('channel-uuid', {
      text: '@mary please check',
      mentions: ['22222222-2222-4222-8222-222222222222'],
      attachmentIds: ['att-1'],
      meta: { designProjectId: 'project-1' },
    });

    expect(outboundSendMock).toHaveBeenCalledWith({
      audience: 'team',
      channel: 'team-channel',
      contextId: 'channel-uuid',
      body: '@mary please check',
      meta: {
        designProjectId: 'project-1',
        mentions: ['22222222-2222-4222-8222-222222222222'],
        attachmentIds: ['att-1'],
      },
    });
    expect(message.id).toBe('msg-channel');
  });

  it('sends DM thread replies through outbound with parent message and mention UUIDs', async () => {
    outboundSendMock.mockResolvedValue({
      ok: true,
      upstream: {
        message: {
          id: 'msg-reply',
          text: '@Ishant done',
          parentMessageId: 'parent-1',
          mentions: ['11111111-1111-4111-8111-111111111111'],
        },
      },
    });

    const { sendDmMessage } = await import('./teamInboxClient');
    const message = await sendDmMessage('dm-uuid', {
      text: '@Ishant done',
      mentions: ['11111111-1111-4111-8111-111111111111'],
      parentMessageId: 'parent-1',
    });

    expect(outboundSendMock).toHaveBeenCalledWith({
      audience: 'team',
      channel: 'team-dm',
      contextId: 'dm-uuid',
      body: '@Ishant done',
      meta: {
        mentions: ['11111111-1111-4111-8111-111111111111'],
        parentMessageId: 'parent-1',
      },
    });
    expect(message.id).toBe('msg-reply');
  });
});
