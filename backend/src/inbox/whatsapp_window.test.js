'use strict';

const {
  WA_WINDOW_MS,
  isWhatsAppModule,
  isWithinWhatsAppWindow,
  loadLastInboundWhatsAppAt,
  getWhatsAppWindowState,
} = require('./whatsapp_window');

describe('WhatsApp window helpers', () => {
  test('recognizes WhatsApp module markers', () => {
    expect(isWhatsAppModule('whatsapp')).toBe(true);
    expect(isWhatsAppModule('Guesty WhatsApp')).toBe(true);
    expect(isWhatsAppModule('wa')).toBe(true);
    expect(isWhatsAppModule('email')).toBe(false);
  });

  test('checks 24h window from inbound WhatsApp timestamp', () => {
    const now = new Date('2026-05-29T12:00:00.000Z').getTime();
    expect(isWithinWhatsAppWindow('2026-05-28T12:01:00.000Z', now)).toBe(true);
    expect(isWithinWhatsAppWindow('2026-05-28T11:59:00.000Z', now)).toBe(false);
    expect(isWithinWhatsAppWindow(null, now)).toBe(false);
  });

  test('loads last inbound WhatsApp timestamp from message-level channel markers', async () => {
    const queryFn = jest.fn(async () => ({
      rows: [{ last_whatsapp_inbound_at: '2026-05-29T10:00:00.000Z' }],
    }));

    await expect(loadLastInboundWhatsAppAt('conversation-1', queryFn)).resolves.toBe('2026-05-29T10:00:00.000Z');
    expect(queryFn.mock.calls[0][0]).toContain('m.module_type');
    expect(queryFn.mock.calls[0][0]).toContain('m.communication_channel');
    expect(queryFn.mock.calls[0][0]).toContain("LOWER(COALESCE(m.communication_channel, '')) LIKE '%whatsapp%'");
    expect(queryFn.mock.calls[0][0]).not.toContain('c.communication_channel');
    expect(queryFn.mock.calls[0][1]).toEqual(['conversation-1']);
  });

  test('does not let inbound email messages inherit the conversation WhatsApp channel', async () => {
    const queryFn = jest.fn(async () => ({ rows: [{ last_whatsapp_inbound_at: null }] }));

    await loadLastInboundWhatsAppAt('conversation-1', queryFn);
    const sql = queryFn.mock.calls[0][0];
    expect(sql).toMatch(/LOWER\(COALESCE\(m\.module_type, ''\)\) LIKE '%whatsapp%'/);
    expect(sql).toMatch(/LOWER\(COALESCE\(m\.communication_channel, ''\)\) LIKE '%whatsapp%'/);
    expect(sql).not.toContain('LEFT JOIN conversations');
    expect(sql).not.toContain('c.communication_channel');
    expect(sql).not.toContain('c.channel');
  });

  test('returns exact expiry metadata for the UI', async () => {
    const now = new Date('2026-05-29T12:00:00.000Z').getTime();
    const queryFn = jest.fn(async () => ({
      rows: [{ last_whatsapp_inbound_at: '2026-05-29T10:00:00.000Z' }],
    }));

    const state = await getWhatsAppWindowState('conversation-1', queryFn, now);
    expect(state).toEqual({
      open: true,
      lastInboundAt: '2026-05-29T10:00:00.000Z',
      expiresAt: new Date(new Date('2026-05-29T10:00:00.000Z').getTime() + WA_WINDOW_MS).toISOString(),
    });
  });
});
