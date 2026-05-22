'use strict';

jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('../tenants/ai_usage', () => ({ recordUsage: jest.fn(() => Promise.resolve()) }));

describe('chat proxy', () => {
  const OLD_ENV = process.env;
  let axios;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, KIMI_API_KEY: 'test-kimi-key', KIMI_CHAT_MODEL: 'kimi-k2.6' };
    axios = require('axios');
    axios.post.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('treats empty Kimi content as a provider failure', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: { role: 'assistant', content: '' },
            finish_reason: 'length',
          },
        ],
        usage: { prompt_tokens: 1200, completion_tokens: 1400, total_tokens: 2600 },
      },
    });

    const { invokeChat } = require('./chat_proxy');
    const result = await invokeChat({
      model: 'kimi-k2.6',
      messages: [{ role: 'user', content: 'answer as JSON' }],
      meter: { tenantId: 'tenant-1', feature: 'test' },
    });

    expect(result).toMatchObject({
      ok: false,
      status: 502,
      finishReason: 'length',
      usage: {
        input_tokens: 1200,
        output_tokens: 1400,
        total_tokens: 2600,
      },
    });
    expect(result.error).toContain('empty response');
  });

  test('keeps valid Kimi text responses', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: { role: 'assistant', content: '{"answer":"Done"}' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 12, total_tokens: 22 },
      },
    });

    const { invokeChat } = require('./chat_proxy');
    const result = await invokeChat({
      model: 'kimi-k2.6',
      messages: [{ role: 'user', content: 'answer as JSON' }],
    });

    expect(result).toMatchObject({
      ok: true,
      model: 'kimi-k2.6',
      finishReason: 'stop',
      message: {
        role: 'assistant',
        content: '{"answer":"Done"}',
      },
    });
  });
});
