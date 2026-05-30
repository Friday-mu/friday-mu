'use strict';

const { buildRuntimeKnowledgeBlock, detectPlatform } = require('./runtime_context');

describe('runtime knowledge context', () => {
  test('detects platform from channel and context text', () => {
    expect(detectPlatform({ channel: 'airbnb2' })).toBe('airbnb');
    expect(detectPlatform({ contextText: 'Guest is asking on Booking.com' })).toBe('bookingCom');
    expect(detectPlatform({ channel: 'whatsapp' })).toBe('direct');
  });

  test('builds compact STR, sales, ops, and platform context', () => {
    const block = buildRuntimeKnowledgeBlock({
      channel: 'airbnb',
      contextText: 'Guest asks for a discount and late checkout.',
    });

    expect(block).toContain('Runtime STR / Support / Sales / Ops Knowledge');
    expect(block).toContain('STR essentials');
    expect(block).toContain('Sales knowledge');
    expect(block).toContain('Support and ops knowledge');
    expect(block).toContain('Platform rules: airbnb');
    expect(block).toContain('Do not invent facts');
  });
});
