'use strict';

// Smoke test for the knowledge composer — verifies each declared
// surface loads without throwing and produces a non-empty system
// message. Run via:
//
//   cd backend && node src/knowledge/composer.test.js
//
// Mirrors friday-gms/src/services/knowledge-composer.test.ts so we
// can diff outputs against GMS during Phase 3.1 burn-in.

const path = require('path');
const { KnowledgeComposer } = require('./composer');

const KB = path.join(__dirname, '..', '..', 'knowledge');
const composer = new KnowledgeComposer(KB);

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}
function assert(cond, msg) {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

test('inbox-drafts loads with property card', () => {
  // Pick a property that exists in backend/knowledge/properties/.
  const result = composer.load('inbox-drafts', { property_code: 'BS-1' });
  assert(result.system_message.length > 0, 'system_message must be non-empty');
  assert(result.system_message.includes('canonical-source-discipline'), 'must include critical-rules content');
  assert(result.system_message.includes('property:BS-1'), 'must include property card section header');
  assert(result.metadata.property_code === 'BS-1', 'metadata.property_code must echo input');
  assert(result.metadata.loaded_skills.length >= 4, 'must load at least 4 skills');
});

test('inbox-drafts loads VA-1 property card', () => {
  const result = composer.load('inbox-drafts', { property_code: 'VA-1' });
  assert(result.system_message.includes('property:VA-1'), 'must include VA-1 property card section header');
  assert(result.system_message.includes('Convenient 2BR Apartment'), 'must include VA-1 listing title');
});

test('inbox-drafts loads without property card', () => {
  // Per Phase 3.1: inbox-drafts surface was relaxed to property_card:
  // optional so newly-stubbed conversations (no resolved property yet)
  // still produce a usable draft. Composer emits no property section
  // and metadata.property_code stays null.
  const result = composer.load('inbox-drafts');
  assert(result.system_message.length > 0, 'system_message must be non-empty');
  assert(result.metadata.property_code === null, 'no property card when none passed');
  assert(!result.system_message.includes('## property:'),
    'property section header must NOT appear when no card loaded');
});

test('inbox-advisory loads without property card', () => {
  const result = composer.load('inbox-advisory');
  assert(result.system_message.length > 0, 'system_message must be non-empty');
  assert(result.metadata.property_code === null, 'no property card when none passed');
});

test('inbox-advisory loads with optional property card', () => {
  const result = composer.load('inbox-advisory', { property_code: 'BS-1' });
  assert(result.system_message.includes('property:BS-1'), 'property card loads when passed');
});

test('pending-actions loads', () => {
  const result = composer.load('pending-actions');
  assert(result.system_message.length > 0, 'system_message must be non-empty');
});

test('inquiry-followup loads', () => {
  const result = composer.load('inquiry-followup');
  assert(result.system_message.length > 0, 'system_message must be non-empty');
});

test('learning-analyzer loads', () => {
  const result = composer.load('learning-analyzer');
  assert(result.system_message.length > 0, 'system_message must be non-empty');
});

test('lazy-loadable trigger keyword pulls in fragment', () => {
  // inbox-drafts has discount-bounds lazy-loaded on /discount|deal|promo/i
  const withDiscount = composer.load('inbox-drafts', {
    property_code: 'BS-1',
    task_signals: ['guest is asking about a discount'],
  });
  const withoutDiscount = composer.load('inbox-drafts', {
    property_code: 'BS-1',
    task_signals: ['guest is asking about check-in time'],
  });
  assert(withDiscount.metadata.loaded_skills.includes('discount-bounds'),
    'discount keyword should load discount-bounds');
  assert(!withoutDiscount.metadata.loaded_skills.includes('discount-bounds'),
    'absence of discount keyword should NOT load discount-bounds');
});

test('unknown surface throws', () => {
  let threw = false;
  try {
    composer.load('not-a-real-surface');
  } catch (e) {
    threw = true;
    assert(/unknown surface/i.test(e.message), 'error msg should mention unknown surface');
  }
  assert(threw, 'must throw on unknown surface');
});

function runStandalone() {
  let passed = 0;
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ✗ ${name}`);
      console.log(`    ${e.message}`);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

function isJestRuntime() {
  return typeof describe === 'function'
    && typeof it === 'function'
    && Boolean(process.env.JEST_WORKER_ID);
}

if (isJestRuntime()) {
  describe('knowledge composer smoke', () => {
    for (const { name, fn } of tests) {
      it(name, fn);
    }
  });
} else {
  runStandalone();
}
