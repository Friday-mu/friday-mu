'use strict';

const {
  matchDesignProjectFromText,
  normalizeProjectText,
} = require('./design_project_linker');

const projects = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Ocean House 2',
    slug: 'oh-2',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Albion Tasleem',
    slug: 'albion-tasleem',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'OT 5',
    slug: 'ot-5',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Villa',
    slug: 'villa',
  },
];

describe('design project linker', () => {
  test('normalizes punctuation and accents consistently', () => {
    expect(normalizeProjectText('  Albion-TaslÉem / Moodboard  ')).toBe('albion tasleem moodboard');
  });

  test('prefers an explicit hashtag slug match', () => {
    expect(matchDesignProjectFromText('Need approval for #oh-2 lights', projects)).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Ocean House 2',
      slug: 'oh-2',
      source: 'inferred',
      confidence: 1,
    });
  });

  test('matches exact project names and short slugs with digits', () => {
    expect(matchDesignProjectFromText('Albion Tasleem bathroom tiles', projects)?.id)
      .toBe('22222222-2222-4222-8222-222222222222');
    expect(matchDesignProjectFromText('OT-5 owner asked for revised pack', projects)?.id)
      .toBe('33333333-3333-4333-8333-333333333333');
  });

  test('does not match partial/common words', () => {
    expect(matchDesignProjectFromText('villa mood is not enough context', projects)).toBeNull();
    expect(matchDesignProjectFromText('Albion quote, not the full project name', projects)).toBeNull();
  });
});
