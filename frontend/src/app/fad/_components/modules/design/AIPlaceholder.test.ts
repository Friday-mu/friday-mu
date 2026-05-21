import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * 11-feature AI sentinel: every AI hookpoint declared in the v0.1 build doc
 * must carry a `data-ai-feature="<name>"` attribute somewhere under the design
 * module. The wiring sprint reads these attributes to attach prompts.
 *
 * This is a static-source check (not a render check) so it catches accidental
 * renames even on stages that only render under specific conditions.
 */
const EXPECTED_FEATURES = [
  'site-visit-audit',
  'preference-brief',
  'rough-budget-estimate',
  'agreement-autofill',
  'moodboard-narrative',
  'design-pack-copy',
  'final-budget-suggest',
  'receipt-scan',
  'reconciliation-variance',
  'owner-update',
  'handover-report',
];

// Walk the design/ subtree AND the parent modules/ directory's DesignModule
// shell — `owner-update` lives in the dashboard which sits one level above.
const MODULES_DIR = dirname(__dirname);

function* walk(dir: string, depthLeft: number): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && depthLeft > 0) {
      yield* walk(full, depthLeft - 1);
    } else if (entry.isFile() && /\.(tsx|ts)$/.test(entry.name)) {
      yield full;
    }
  }
}

describe('AI feature sentinel — 11 hookpoints', () => {
  const sources = Array.from(walk(MODULES_DIR, 6))
    .filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))
    .map((f) => readFileSync(f, 'utf-8'))
    .join('\n');

  for (const feature of EXPECTED_FEATURES) {
    it(`carries data-ai-feature="${feature}" somewhere under design/`, () => {
      const re = new RegExp(`data-ai-feature=["']${feature}["']|feature=["']${feature}["']`);
      expect(re.test(sources), `missing AI feature attribute: ${feature}`).toBe(true);
    });
  }
});
