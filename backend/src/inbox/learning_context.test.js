'use strict';

jest.mock('../database/client', () => ({
  query: jest.fn(),
}));

const { query } = require('../database/client');
const { loadActionFeedbackBlock } = require('./learning_context');

describe('inbox learning context', () => {
  beforeEach(() => {
    query.mockReset();
  });

  test('formats FAD action feedback taxonomy as positive, corrected, and avoid examples', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          feedback_type: 'accept',
          action_type: 'pending_action',
          original_text: 'Send check-in details after guest confirms ETA',
          edited_text: 'Done',
        },
        {
          feedback_type: 'edit',
          action_type: 'pending_action',
          original_text: 'Follow up about VA-2',
          edited_text: 'Follow up about GBH-C6 instead',
        },
        {
          feedback_type: 'reject',
          action_type: 'pending_action',
          original_text: 'Send another duplicate check-in',
          rejection_reason: 'Duplicate',
        },
      ],
    });

    const block = await loadActionFeedbackBlock();

    expect(query.mock.calls[0][0]).toContain("feedback_type IN ('teach', 'accept', 'edit', 'promote', 'reject')");
    expect(query.mock.calls[0][0]).not.toContain('auto_reject');
    expect(block).toContain('GOOD (pending_action): "Send check-in details');
    expect(block).toContain('CORRECTED (pending_action): "Follow up about VA-2" -> "Follow up about GBH-C6 instead"');
    expect(block).toContain('AVOID (pending_action): "Send another duplicate check-in" (reason: Duplicate)');
  });
});
