'use strict';

process.env.KIMI_API_KEY = 'test-kimi-key';
delete process.env.GEMINI_API_KEY;
delete process.env.NANOBANANA_API_KEY;

jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('../tenants/ai_usage', () => ({ recordUsage: jest.fn(() => Promise.resolve()) }));

const axios = require('axios');
const { recordUsage } = require('../tenants/ai_usage');
const { extractStructuredOutput, EXTRACT_MODEL } = require('./kimi_draft');

describe('kimi draft structured extraction', () => {
  beforeEach(() => {
    axios.post.mockReset();
    recordUsage.mockClear();
  });

  test('logs extraction usage with the resolved model without throwing', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        choices: [{ message: { content: '{"actions":[]}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 12, completion_tokens: 4 },
      },
    });

    const result = await extractStructuredOutput({
      system: 'Extract actions.',
      user: 'No action needed.',
      meter: { feature: 'inbox_action_detect' },
    });

    expect(result).toMatchObject({
      ok: true,
      parsed: { actions: [] },
      model: EXTRACT_MODEL,
      inputTokens: 12,
      outputTokens: 4,
    });
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({
      feature: 'inbox_action_detect',
      model: EXTRACT_MODEL,
      promptTokens: 12,
      completionTokens: 4,
      success: true,
    }));
  });
});
