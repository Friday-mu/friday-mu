'use strict';

function normalizeProjectText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsNormalizedPhrase(haystack, phrase) {
  if (!haystack || !phrase) return false;
  return new RegExp(`(^| )${escapeRegExp(phrase)}($| )`).test(haystack);
}

const COMMON_PROJECT_TOKENS = new Set([
  'apartment',
  'bathroom',
  'bedroom',
  'design',
  'home',
  'house',
  'kitchen',
  'project',
  'renovation',
  'room',
  'villa',
]);

function isUsefulProjectToken(token) {
  if (!token) return false;
  if (COMMON_PROJECT_TOKENS.has(token)) return false;
  if (/\d/.test(token)) return token.length >= 2;
  return token.length >= 4;
}

function normalizeProjectForMeta(project, source = 'inferred', confidence = 0.8) {
  if (!project?.id || !project?.name) return null;
  return {
    id: String(project.id),
    name: String(project.name),
    slug: project.slug ? String(project.slug) : null,
    source,
    confidence,
  };
}

function matchDesignProjectFromText(text, projects) {
  const rawText = String(text || '');
  const normalizedText = normalizeProjectText(rawText);
  if (!normalizedText) return null;

  let best = null;
  for (const project of projects || []) {
    const slug = String(project.slug || '').trim().toLowerCase();
    const normalizedSlug = normalizeProjectText(slug);
    const normalizedName = normalizeProjectText(project.name);

    let score = 0;
    if (slug && new RegExp(`(^|\\s)#${escapeRegExp(slug)}(?=$|[\\s.,;:!?()[\\]{}<>])`, 'i').test(rawText)) {
      score = 1;
    } else if (isUsefulProjectToken(normalizedSlug) && containsNormalizedPhrase(normalizedText, normalizedSlug)) {
      score = 0.9;
    } else if (isUsefulProjectToken(normalizedName) && containsNormalizedPhrase(normalizedText, normalizedName)) {
      score = 0.85;
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { project, score };
    }
  }

  if (!best) return null;
  return normalizeProjectForMeta(best.project, 'inferred', best.score);
}

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

module.exports = {
  isUuid,
  matchDesignProjectFromText,
  normalizeProjectForMeta,
  normalizeProjectText,
};
