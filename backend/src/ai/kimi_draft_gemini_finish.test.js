'use strict';

process.env.KIMI_API_KEY = 'test-kimi-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.GEMINI_DRAFT_MODEL = 'gemini-test-model';

jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('../tenants/ai_usage', () => ({ recordUsage: jest.fn(() => Promise.resolve()) }));

const axios = require('axios');
const { recordUsage } = require('../tenants/ai_usage');
const { generateDraftReply } = require('./kimi_draft');

describe('Gemini draft finish reason handling', () => {
  beforeEach(() => {
    axios.post.mockReset();
    recordUsage.mockClear();
  });

  test('falls back to Kimi when Gemini returns partial text with a non-stop finish reason', async () => {
    axios.post
      .mockResolvedValueOnce({
        data: {
          candidates: [{
            content: { parts: [{ text: 'Partial answer cut mid-task id' }] },
            finishReason: 'MAX_TOKENS',
          }],
          usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 60 },
        },
      })
      .mockResolvedValueOnce({
        data: {
          choices: [{ message: { content: 'Complete fallback answer.' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 310, completion_tokens: 24 },
        },
      });

    const result = await generateDraftReply({
      system: 'Draft safely.',
      user: 'Review visible schedule.',
      meter: { feature: 'ops_consult' },
      maxRetries: 0,
    });

    expect(result).toMatchObject({
      ok: true,
      text: 'Complete fallback answer.',
      model: 'kimi-k2.6',
      finishReason: 'stop',
    });
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(String(axios.post.mock.calls[0][0])).toContain('/models/gemini-test-model:generateContent');
    expect(String(axios.post.mock.calls[1][0])).toContain('/chat/completions');
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      model: 'kimi-k2.6',
    }));
  });
});
