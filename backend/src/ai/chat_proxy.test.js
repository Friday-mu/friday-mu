'use strict';

jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('../tenants/ai_usage', () => ({ recordUsage: jest.fn(() => Promise.resolve()) }));

describe('chat proxy', () => {
  const OLD_ENV = process.env;
  let axios;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      KIMI_API_KEY: 'test-kimi-key',
      KIMI_CHAT_MODEL: 'kimi-k2.6',
      GEMINI_API_KEY: 'test-gemini-key',
      GEMINI_CHAT_MODEL: 'gemini-3.5-flash',
    };
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

  test('routes explicit Gemini Flash requests to the Gemini API', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        candidates: [
          {
            content: { parts: [{ text: '{"answer":"Gemini done"}' }] },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: { promptTokenCount: 14, candidatesTokenCount: 9, totalTokenCount: 23 },
      },
    });

    const { invokeChat } = require('./chat_proxy');
    const result = await invokeChat({
      model: 'gemini-3.5-flash',
      system: 'Return JSON',
      messages: [{ role: 'user', content: 'answer as JSON' }],
    });

    expect(axios.post.mock.calls[0][0]).toContain('/models/gemini-3.5-flash:generateContent');
    expect(axios.post.mock.calls[0][2].headers).toEqual(expect.objectContaining({
      'x-goog-api-key': 'test-gemini-key',
    }));
    expect(result).toMatchObject({
      ok: true,
      model: 'gemini-3.5-flash',
      finishReason: 'STOP',
      message: { role: 'assistant', content: '{"answer":"Gemini done"}' },
      usage: { input_tokens: 14, output_tokens: 9, total_tokens: 23 },
    });
  });

  test('falls back from Gemini to the default Kimi model on provider failure', async () => {
    axios.post
      .mockRejectedValueOnce({
        response: { status: 429, data: { error: { message: 'quota exceeded' } } },
      })
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: { role: 'assistant', content: '{"answer":"Kimi fallback"}' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
        },
      });

    const { invokeChat } = require('./chat_proxy');
    const result = await invokeChat({
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: 'answer as JSON' }],
    });

    expect(axios.post.mock.calls[0][0]).toContain('/models/gemini-3.5-flash:generateContent');
    expect(axios.post.mock.calls[1][1]).toEqual(expect.objectContaining({ model: 'kimi-k2.6' }));
    expect(result).toMatchObject({
      ok: true,
      model: 'kimi-k2.6',
      fallbackUsed: true,
      message: { role: 'assistant', content: '{"answer":"Kimi fallback"}' },
    });
  });

  test('allows callers to cap non-streaming provider timeout', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: { role: 'assistant', content: 'ok' },
            finish_reason: 'stop',
          },
        ],
      },
    });

    const { invokeChat } = require('./chat_proxy');
    await invokeChat({
      model: 'kimi-k2.6',
      messages: [{ role: 'user', content: 'fast answer' }],
      timeoutMs: 25000,
    });

    expect(axios.post.mock.calls[0][2]).toEqual(expect.objectContaining({ timeout: 25000 }));
  });
});
