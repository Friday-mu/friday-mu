'use strict';

// Residence slug → Guesty listing ID mapping. Loaded once at boot from
// property-map.json. friday.mu's _seed/properties.json is the source
// of truth for slugs; the Guesty listing IDs come from the Guesty
// dashboard (or are discoverable via a listings sync). We don't fetch
// remotely on every request because the map changes rarely and a
// missing slug should surface as a loud error in the DLQ, not a
// silent fallback to a random listing.

const path = require('node:path');
const fs = require('node:fs');

let cache = null;

function loadMap() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'property-map.json'), 'utf8');
    const parsed = JSON.parse(raw);
    cache = parsed.slugs && typeof parsed.slugs === 'object' ? parsed.slugs : {};
  } catch (err) {
    console.warn('[website_inbox/property-map] failed to load property-map.json:', err.message);
    cache = {};
  }
  return cache;
}

function listingIdForSlug(slug) {
  if (typeof slug !== 'string' || slug.trim().length === 0) return null;
  const map = loadMap();
  return map[slug.trim()] || null;
}

function knownSlugs() {
  return Object.keys(loadMap());
}

// Used by /admin smoke checks to validate config without exposing
// secrets.
function summary() {
  const map = loadMap();
  return { count: Object.keys(map).length, slugs: Object.keys(map) };
}

module.exports = { listingIdForSlug, knownSlugs, summary };
