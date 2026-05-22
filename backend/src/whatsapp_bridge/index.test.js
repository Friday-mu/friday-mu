'use strict';

jest.mock('../database/client', () => ({ query: jest.fn() }));
jest.mock('../inbox/draft_generator', () => ({ triggerDraftGeneration: jest.fn() }));
jest.mock('../realtime', () => ({ publishFadEvent: jest.fn(() => Promise.resolve()) }));

const { query } = require('../database/client');
const { triggerDraftGeneration } = require('../inbox/draft_generator');
const { publishFadEvent } = require('../realtime');
const {
  loadConfig,
  normalizeJid,
  getTextFromBaileysMessage,
  detectSensitiveContent,
  shouldReplyToGroup,
  createRateLimiter,
  handleInboundMessage,
} = require('./index');

function inboundMessage(overrides = {}) {
  return {
    key: {
      remoteJid: '2305000000@s.whatsapp.net',
      id: 'in-1',
      fromMe: false,
      ...(overrides.key || {}),
    },
    pushName: 'Burner Guest',
    message: {
      conversation: 'Hello Friday',
      ...(overrides.message || {}),
    },
  };
}

function mockDb() {
  query.mockImplementation((sql) => {
    if (sql.includes('SELECT id FROM conversations')) return Promise.resolve({ rows: [] });
    if (sql.includes('INSERT INTO conversations')) return Promise.resolve({ rows: [{ id: 'conv-1' }] });
    if (sql.includes('INSERT INTO messages')) return Promise.resolve({ rows: [{ id: sql.includes('outbound') ? 'out-msg-1' : 'msg-1' }] });
    if (sql.includes('UPDATE conversations')) return Promise.resolve({ rows: [] });
    if (sql.includes('SELECT id, draft_body')) {
      return Promise.resolve({ rows: [{ id: 'draft-1', draft_body: 'Hello from FAD.', confidence: 88, state: 'draft_ready' }] });
    }
    if (sql.includes('INSERT INTO whatsapp_bridge_events')) return Promise.resolve({ rows: [] });
    if (sql.includes('SELECT id FROM messages')) return Promise.resolve({ rows: [{ id: 'msg-1' }] });
    return Promise.resolve({ rows: [] });
  });
}

describe('WhatsApp burner bridge prototype', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.WHATSAPP_BRIDGE_KILL_SWITCH;
    delete process.env.WHATSAPP_BRIDGE_OUTBOUND_ENABLED;
  });

  test('normalizes allowlist JIDs from phone numbers', () => {
    const config = loadConfig({ WHATSAPP_BRIDGE_ALLOWLIST: '+230 500 0000,12025550123@s.whatsapp.net' });
    expect(normalizeJid('+230 500 0000')).toBe('2305000000@s.whatsapp.net');
    expect(config.allowlist.has('2305000000@s.whatsapp.net')).toBe(true);
    expect(config.allowlist.has('12025550123@s.whatsapp.net')).toBe(true);
  });

  test('extracts supported text and captions from Baileys messages', () => {
    expect(getTextFromBaileysMessage(inboundMessage())).toBe('Hello Friday');
    expect(getTextFromBaileysMessage(inboundMessage({
      message: { conversation: undefined, imageMessage: { caption: 'Photo caption' } },
    }))).toBe('Photo caption');
  });

  test('detects sensitive content before AI processing', () => {
    expect(detectSensitiveContent('My OTP is 123456')).toEqual(expect.objectContaining({ category: 'otp' }));
    expect(detectSensitiveContent('My passport number is A1234567')).toEqual(expect.objectContaining({ category: 'sensitive_id' }));
    expect(detectSensitiveContent('Can I check in at 2pm?')).toBeNull();
  });

  test('only replies to group messages when mentioned, quoted, or triggered', () => {
    const config = loadConfig({ WHATSAPP_BRIDGE_GROUP_TRIGGERS: 'judith,ask friday' });
    const group = inboundMessage({ key: { remoteJid: '120363@g.us' } });
    expect(shouldReplyToGroup(group, 'hello', config, '230999@s.whatsapp.net')).toBe(false);
    expect(shouldReplyToGroup(group, 'Judith can you check this?', config, '230999@s.whatsapp.net')).toBe(true);
    expect(shouldReplyToGroup(inboundMessage({
      key: { remoteJid: '120363@g.us' },
      message: { extendedTextMessage: { text: 'hello', contextInfo: { mentionedJid: ['230999@s.whatsapp.net'] } } },
    }), 'hello', config, '230999@s.whatsapp.net')).toBe(true);
  });

  test('enforces per-chat and global rate limits', () => {
    let now = 1_000;
    const limiter = createRateLimiter(() => now);
    const config = loadConfig({
      WHATSAPP_BRIDGE_CHAT_RATE_LIMIT_PER_MIN: '1',
      WHATSAPP_BRIDGE_GLOBAL_RATE_LIMIT_PER_MIN: '2',
    });
    expect(limiter.check(config, 'a@s.whatsapp.net')).toEqual({ ok: true });
    expect(limiter.check(config, 'a@s.whatsapp.net')).toEqual({ ok: false, scope: 'chat' });
    expect(limiter.check(config, 'b@s.whatsapp.net')).toEqual({ ok: true });
    expect(limiter.check(config, 'c@s.whatsapp.net')).toEqual({ ok: false, scope: 'global' });
    now += 61_000;
    expect(limiter.check(config, 'a@s.whatsapp.net')).toEqual({ ok: true });
  });

  test('logs allowed inbound messages to FAD Inbox without sending when outbound is disabled', async () => {
    mockDb();
    const config = loadConfig({ WHATSAPP_BRIDGE_ALLOWLIST: '2305000000' });
    const sock = { user: { id: '230999@s.whatsapp.net' }, sendMessage: jest.fn() };

    const result = await handleInboundMessage({ sock, msg: inboundMessage(), config });

    expect(result).toMatchObject({ inboundLogged: true, outboundBlocked: true, conversationId: 'conv-1', messageId: 'msg-1' });
    expect(sock.sendMessage).not.toHaveBeenCalled();
    expect(publishFadEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'inbox.message_received',
      payload: expect.objectContaining({ source: 'whatsapp_bridge' }),
    }));
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO messages'))).toBe(true);
  });

  test('generates and auto-sends a FAD draft only when outbound is explicitly enabled', async () => {
    mockDb();
    process.env.WHATSAPP_BRIDGE_OUTBOUND_ENABLED = 'true';
    triggerDraftGeneration.mockResolvedValueOnce({ draftId: 'draft-1', state: 'draft_ready' });
    const config = loadConfig({
      WHATSAPP_BRIDGE_ALLOWLIST: '2305000000',
      WHATSAPP_BRIDGE_OUTBOUND_ENABLED: 'true',
    });
    const sock = {
      user: { id: '230999@s.whatsapp.net' },
      sendMessage: jest.fn(() => Promise.resolve({ key: { id: 'out-1' } })),
    };

    const result = await handleInboundMessage({ sock, msg: inboundMessage(), config });

    expect(result).toMatchObject({ sent: true, draftId: 'draft-1', outboundMessageId: 'out-msg-1' });
    expect(triggerDraftGeneration).toHaveBeenCalledWith('msg-1', 'conv-1', { recoveryReason: 'whatsapp_bridge_auto_reply' });
    expect(sock.sendMessage).toHaveBeenCalledWith('2305000000@s.whatsapp.net', { text: 'Hello from FAD.' });
  });
});
