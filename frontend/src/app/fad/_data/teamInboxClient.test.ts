import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadAttachmentDownloadBlob,
  loadAttachmentPreviewBlob,
  parseMentions,
  type LiveUser,
} from './teamInboxClient';

const outboundSendMock = vi.fn();

vi.mock('./outboundClient', () => ({
  outboundSend: outboundSendMock,
}));

function stubLocalStorage() {
  const store: Record<string, string> = {};
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const key of Object.keys(store)) delete store[key]; },
  });
}

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

describe('TeamInbox attachment preview contracts', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    stubLocalStorage();
  });

  it('fetches preview blobs through the authenticated team preview endpoint', async () => {
    localStorage.setItem('gms_token', 'test-token');
    const fetchMock = vi.fn().mockResolvedValue(new Response('pdf', {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadAttachmentPreviewBlob('att-1');

    expect(result.type).toBe('application/pdf');
    expect(fetchMock).toHaveBeenCalledWith('/api/team/attachments/att-1/preview', {
      headers: { Authorization: 'Bearer test-token' },
    });
  });

  it('uses the download variant when saving an attachment', async () => {
    localStorage.setItem('gms_token', 'test-token');
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(['x']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await loadAttachmentDownloadBlob('att-2');

    expect(fetchMock).toHaveBeenCalledWith('/api/team/attachments/att-2/preview?download=1', {
      headers: { Authorization: 'Bearer test-token' },
    });
  });
});
