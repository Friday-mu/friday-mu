import { describe, expect, it } from 'vitest';
import { visibleFridayPromptGroupsForRole } from './FridayDrawer';

describe('visibleFridayPromptGroupsForRole', () => {
  it('hides finance, guest-inbox, and owner/intelligence prompts from field staff', () => {
    const prompts = visibleFridayPromptGroupsForRole('field').flatMap((group) => group.prompts);

    expect(prompts).toContain('What needs my attention today?');
    expect(prompts).toContain("What's the Breezeway roster for today?");
    expect(prompts.join(' | ')).not.toMatch(/tourist tax|Nitzana|refund/i);
    expect(prompts.join(' | ')).not.toMatch(/Marchand|returning guests|Villa Azur reviews/i);
    expect(prompts.join(' | ')).not.toMatch(/occupancy|North vs South/i);
  });

  it('keeps the full prompt set for directors', () => {
    const prompts = visibleFridayPromptGroupsForRole('director').flatMap((group) => group.prompts);

    expect(prompts).toContain('How much tourist tax do we owe for April?');
    expect(prompts).toContain('Draft a warm reply to Marchand about his transfer');
    expect(prompts).toContain('Compare occupancy: North vs South this month');
  });
});
