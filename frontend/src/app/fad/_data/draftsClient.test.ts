import { beforeEach, describe, expect, it, vi } from 'vitest';

const outboundSendMock = vi.fn();
const apiFetchMock = vi.fn();

vi.mock('./outboundClient', () => ({
  outboundSend: outboundSendMock,
}));

vi.mock('../../../components/types', () => ({
  apiFetch: apiFetchMock,
}));

describe('draftsClient send contracts', () => {
  beforeEach(() => {
    outboundSendMock.mockReset();
    apiFetchMock.mockReset();
  });

  it('maps legacy manual compose to direct_send while preserving typed body literally', async () => {
    outboundSendMock.mockResolvedValue({
      ok: true,
      messageId: 'msg-1',
      sentAt: '2026-05-20T10:00:00.000Z',
    });

    const { sendCompose } = await import('./draftsClient');
    const result = await sendCompose('conv-1', {
      mode: 'manual',
      body: 'Guest typed reply stays exactly like this.',
      channel: 'whatsapp',
    });

    expect(outboundSendMock).toHaveBeenCalledWith({
      audience: 'guest',
      channel: 'whatsapp',
      contextId: 'conv-1',
      body: 'Guest typed reply stays exactly like this.',
      meta: {
        mode: 'direct_send',
        instruction: 'Guest typed reply stays exactly like this.',
      },
    });
    expect(result).toEqual({
      ok: true,
      message_id: 'msg-1',
      draft_id: undefined,
    });
  });

  it('keeps draft compose as draft mode and carries the operator instruction', async () => {
    outboundSendMock.mockResolvedValue({
      ok: true,
      draftId: 'draft-1',
    });

    const { sendCompose } = await import('./draftsClient');
    const result = await sendCompose('conv-2', {
      mode: 'draft',
      instruction: 'Draft a warmer reply.',
      channel: 'email',
    });

    expect(outboundSendMock).toHaveBeenCalledWith({
      audience: 'guest',
      channel: 'email',
      contextId: 'conv-2',
      body: '',
      meta: {
        mode: 'draft',
        instruction: 'Draft a warmer reply.',
      },
    });
    expect(result).toEqual({
      ok: true,
      message_id: undefined,
      draft_id: 'draft-1',
    });
  });

  it('routes website inbox replies to the website email reply endpoint', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      message_id: 'web-msg-1',
    });

    const { sendCompose } = await import('./draftsClient');
    const result = await sendCompose('web-thread-1', {
      mode: 'manual',
      body: 'Thanks, we can help with these dates.',
      channel: 'email',
    });

    expect(outboundSendMock).not.toHaveBeenCalled();
    expect(apiFetchMock).toHaveBeenCalledWith('/api/inbox/website/threads/thread-1/reply', {
      method: 'POST',
      body: JSON.stringify({
        body: 'Thanks, we can help with these dates.',
        channel: 'email',
      }),
    });
    expect(result).toEqual({
      ok: true,
      message_id: 'web-msg-1',
    });
  });

  it('posts WhatsApp template sends to the FAD conversation endpoint', async () => {
    apiFetchMock.mockResolvedValue({
      ok: false,
      state: 'blocked',
      error: 'template_send_not_configured',
      message: 'Send manually in Guesty.',
    });

    const { sendWhatsAppTemplate } = await import('./draftsClient');
    const result = await sendWhatsAppTemplate('conv-wa', {
      templateId: 'guest_reply_window_closed',
      variables: { guestName: 'Asha' },
    });

    expect(apiFetchMock).toHaveBeenCalledWith('/api/inbox/conversations/conv-wa/send-template', {
      method: 'POST',
      body: JSON.stringify({
        templateId: 'guest_reply_window_closed',
        variables: { guestName: 'Asha' },
      }),
    });
    expect(result.state).toBe('blocked');
    expect(result.error).toBe('template_send_not_configured');
  });
});
