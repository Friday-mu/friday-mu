#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DEFAULT_LIMIT = 100;
const SENSITIVE_TEXT_RE = /\b(wi-?fi|password|passcode|lock\s*box|lockbox|gate\s+code|access\s+code|key\s*safe|keysafe|pin\s+code)\b/i;
const CODE_RE = /\b[A-Z0-9]{2,5}-[A-Z0-9]+\b/g;
const COMBO_CHILDREN = {
  'LB-C': ['LB-1', 'LB-2', 'LB-3'],
  'VA-C': ['VA-1', 'VA-2', 'VA-3', 'VA-4'],
};
const SIZE_OVERRIDES = {
  'LB-1': 'medium',
  'LB-2': 'medium',
  'LB-3': 'medium',
  'VA-1': 'medium',
  'VA-2': 'medium',
  'VA-3': 'small',
  'VA-4': 'small',
};

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage:
  node backend/scripts/ops-property-metadata-preview.js [--source all|guesty|breezeway]
    [--limit 100] [--out report.json] [--guesty-keychain] [--breezeway-keychain]

Preview-only property metadata inventory for Ops planning. Pulls available
Guesty and/or Breezeway property fields, summarizes safe operational metadata,
and writes a report without mutating FAD tables or printing credentials.`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    source: 'all',
    limit: DEFAULT_LIMIT,
    guestyKeychain: false,
    breezewayKeychain: false,
    out: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--source') args.source = argv[++i];
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--guesty-keychain') args.guestyKeychain = true;
    else if (arg === '--breezeway-keychain') args.breezewayKeychain = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!['all', 'guesty', 'breezeway'].includes(args.source)) throw new Error('--source must be all, guesty, or breezeway');
  if (!Number.isFinite(args.limit) || args.limit < 1) throw new Error('--limit must be a positive number');
  args.limit = Math.min(Math.round(args.limit), 500);
  return args;
}

function keychainSecret(service, account) {
  return execFileSync('security', [
    'find-generic-password',
    '-s',
    service,
    '-a',
    account,
    '-w',
  ], { encoding: 'utf8' }).trim();
}

function configureGuestyKeychain() {
  if (!process.env.GUESTY_CLIENT_ID) {
    process.env.GUESTY_CLIENT_ID = keychainSecret('guesty-api', 'client-id');
  }
  if (!process.env.GUESTY_CLIENT_SECRET) {
    process.env.GUESTY_CLIENT_SECRET = keychainSecret('guesty-api', 'client-secret');
  }
  if (!process.env.GUESTY_SHARED_TOKEN_PATH) {
    process.env.GUESTY_SHARED_TOKEN_PATH = path.join(os.tmpdir(), 'fad-guesty-token.json');
  }
  if (!process.env.GUESTY_SHARED_TOKEN_META_PATH) {
    process.env.GUESTY_SHARED_TOKEN_META_PATH = path.join(os.tmpdir(), 'fad-guesty-token-meta.json');
  }
}

function knownPropertyCodes() {
  const dir = path.join(__dirname, '..', 'knowledge', 'properties');
  try {
    return new Set(fs.readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace(/\.json$/i, '').toUpperCase()));
  } catch {
    return new Set();
  }
}

function safeText(value, max = 220) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (SENSITIVE_TEXT_RE.test(text)) return '[redacted operational access detail]';
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function scalar(value) {
  if (value == null) return null;
  if (['string', 'number', 'boolean'].includes(typeof value)) return value;
  return null;
}

function numeric(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function listValues(value, max = 40) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return safeText(item, 80);
      if (item && typeof item === 'object') {
        return safeText(item.name || item.title || item.code || item.key || item.value, 80);
      }
      return null;
    })
    .filter(Boolean)
    .slice(0, max);
}

function oneLevelKeys(value) {
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value).sort();
}

function nestedKeyShape(value) {
  if (!value || typeof value !== 'object') return {};
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (Array.isArray(child)) out[key] = `array(${child.length})`;
    else if (child && typeof child === 'object') out[key] = Object.keys(child).sort().slice(0, 30);
    else out[key] = typeof child;
  }
  return out;
}

function codeCandidatesFromText(...values) {
  const out = [];
  for (const value of values) {
    const matches = String(value || '').toUpperCase().match(CODE_RE) || [];
    out.push(...matches);
  }
  return out;
}

function resolveCode(knownCodes, ...values) {
  const candidates = codeCandidatesFromText(...values);
  return candidates.find((code) => knownCodes.has(code)) || candidates[0] || null;
}

function textBlob(...values) {
  return values
    .map((value) => {
      if (Array.isArray(value)) return value.join(' ');
      if (value && typeof value === 'object') return JSON.stringify(value);
      return String(value || '');
    })
    .join(' ')
    .toLowerCase();
}

function inferOpsSize({ code, bedrooms, bathrooms, accommodates, propertyType, amenities }) {
  const normalizedCode = String(code || '').toUpperCase();
  if (COMBO_CHILDREN[normalizedCode]) {
    return { size: 'combo', confidence: 'locked', reason: `${normalizedCode} must split into child-unit tasks` };
  }
  if (SIZE_OVERRIDES[normalizedCode]) {
    return { size: SIZE_OVERRIDES[normalizedCode], confidence: 'locked', reason: 'Friday combo child override' };
  }
  const b = numeric(bedrooms);
  const bath = numeric(bathrooms);
  const guests = numeric(accommodates);
  const type = String(propertyType || '').toLowerCase();
  const amenityText = textBlob(amenities);
  if (type.includes('studio') || b === 0 || b === 1) {
    return { size: 'small', confidence: b == null ? 'medium' : 'high', reason: 'studio or one-bedroom rule' };
  }
  if (b === 2) {
    return { size: 'medium', confidence: 'medium', reason: 'two-bedroom default; verify unusually large exteriors manually' };
  }
  if (b >= 4) {
    return { size: 'large', confidence: 'high', reason: 'four-bedroom rule' };
  }
  if (b === 3) {
    const largeSignals = type.includes('villa') || type.includes('house') || type.includes('penthouse') || bath >= 3 || guests >= 7
      || /\b(pool|garden|yard|terrace|balcony|exterior)\b/.test(amenityText);
    return {
      size: largeSignals ? 'large' : 'medium',
      confidence: largeSignals ? 'medium' : 'low',
      reason: largeSignals ? 'three-bedroom with large/exterior signals' : 'three-bedroom without strong large signals',
    };
  }
  return { size: 'medium', confidence: 'low', reason: 'insufficient bedroom/type data; medium planning default' };
}

function guestySummary(listing, knownCodes) {
  const address = listing.address || {};
  const amenities = listValues(listing.amenities || listing.amenitiesNotIncluded || listing.amenitiesIncluded, 80);
  const code = resolveCode(knownCodes, listing.nickname, listing.title, listing.name, listing.internalName, listing.slug, listing._id);
  const bedrooms = numeric(listing.bedrooms ?? listing.bedroomsNumber ?? listing.roomCount);
  const bathrooms = numeric(listing.bathrooms ?? listing.bathroomsNumber);
  const accommodates = numeric(listing.accommodates ?? listing.accommodatesNumber ?? listing.occupancy);
  return {
    source: 'guesty',
    code,
    id: listing._id ? String(listing._id) : null,
    nickname: safeText(listing.nickname || listing.name),
    title: safeText(listing.title),
    active: listing.active !== false,
    city: safeText(address.city),
    country: safeText(address.country),
    latitude: numeric(address.lat ?? address.latitude ?? listing.lat ?? listing.latitude),
    longitude: numeric(address.lng ?? address.longitude ?? listing.lng ?? listing.longitude),
    propertyType: safeText(listing.propertyType || listing.type || listing.roomType),
    bedrooms,
    bathrooms,
    beds: numeric(listing.beds),
    accommodates,
    timezone: safeText(listing.timezone || listing.defaultTimezone),
    currency: safeText(listing.prices?.currency || listing.currency || listing.currencyCode),
    basePrice: numeric(listing.prices?.basePrice || listing.basePrice),
    amenities,
    operationalSignals: {
      hasPoolSignal: /\bpool\b/i.test(textBlob(amenities, listing.title, listing.nickname)),
      hasBalconyOrExteriorSignal: /\b(balcony|terrace|garden|yard|exterior)\b/i.test(textBlob(amenities, listing.title, listing.nickname)),
      photoCount: Array.isArray(listing.pictures) ? listing.pictures.length : null,
    },
    inferredOpsSize: inferOpsSize({
      code,
      bedrooms,
      bathrooms,
      accommodates,
      propertyType: listing.propertyType || listing.type || listing.roomType,
      amenities,
    }),
    rawKeys: oneLevelKeys(listing),
    rawShape: nestedKeyShape(listing),
  };
}

function breezewaySummary(property, knownCodes) {
  const code = resolveCode(
    knownCodes,
    property.name,
    property.nickname,
    property.reference_property_id,
    property.reference_external_property_id,
    property.internal_id,
  );
  const bedrooms = numeric(property.bedrooms ?? property.bedroom_count ?? property.num_bedrooms);
  const bathrooms = numeric(property.bathrooms ?? property.bathroom_count ?? property.num_bathrooms);
  const accommodates = numeric(property.max_occupancy ?? property.accommodates ?? property.occupancy);
  const amenities = listValues(property.amenities || property.tags || property.features, 80);
  return {
    source: 'breezeway',
    code,
    id: property.id != null ? String(property.id) : null,
    homeId: property.home_id != null ? String(property.home_id) : null,
    name: safeText(property.name || property.nickname),
    active: (property.active ?? property.is_active ?? true) !== false,
    referencePropertyId: safeText(property.reference_property_id),
    referenceExternalPropertyId: safeText(property.reference_external_property_id),
    city: safeText(property.city || property.address?.city),
    latitude: numeric(property.latitude ?? property.lat ?? property.address?.lat ?? property.address?.latitude),
    longitude: numeric(property.longitude ?? property.lng ?? property.address?.lng ?? property.address?.longitude),
    propertyType: safeText(property.property_type || property.type),
    bedrooms,
    bathrooms,
    accommodates,
    amenities,
    operationalSignals: {
      hasPoolSignal: /\bpool\b/i.test(textBlob(amenities, property.name, property.nickname)),
      hasBalconyOrExteriorSignal: /\b(balcony|terrace|garden|yard|exterior)\b/i.test(textBlob(amenities, property.name, property.nickname)),
    },
    inferredOpsSize: inferOpsSize({
      code,
      bedrooms,
      bathrooms,
      accommodates,
      propertyType: property.property_type || property.type,
      amenities,
    }),
    rawKeys: oneLevelKeys(property),
    rawShape: nestedKeyShape(property),
  };
}

function countKeys(items) {
  const counts = {};
  for (const item of items) {
    for (const key of item.rawKeys || []) counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function mergeByCode(guesty, breezeway) {
  const byCode = new Map();
  const add = (source, item) => {
    const key = item.code || `${source}:${item.id || item.homeId || item.name || Math.random()}`;
    const existing = byCode.get(key) || { code: item.code || null, guesty: null, breezeway: null };
    existing[source] = item;
    byCode.set(key, existing);
  };
  guesty.forEach((item) => add('guesty', item));
  breezeway.forEach((item) => add('breezeway', item));
  return [...byCode.values()].sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
}

async function pullGuesty(limit, knownCodes) {
  const { listListings } = require('../src/integrations/guesty');
  const listings = await listListings({ limit: Math.min(limit, 100), maxPages: Math.ceil(limit / 100) + 1 });
  return listings.slice(0, limit).map((listing) => guestySummary(listing, knownCodes));
}

async function pullBreezeway(limit, knownCodes, useKeychain) {
  const { apiGet, breezewayToken, TOKEN_CACHE } = require('../src/tasks/breezewayEnrichment');
  const token = await breezewayToken({ useKeychain, tokenCachePath: TOKEN_CACHE });
  const properties = [];
  for (let page = 1; page <= 20 && properties.length < limit; page += 1) {
    const data = await apiGet(token, '/public/inventory/v1/property', { limit: 100, page });
    const batch = Array.isArray(data) ? data : (data.results || data.data || []);
    properties.push(...batch);
    const pages = Number(data.total_pages || data.pages || data.num_pages || 1);
    if (page >= pages || batch.length === 0) break;
  }
  return properties
    .filter((property) => (property.active ?? property.is_active ?? true) !== false)
    .slice(0, limit)
    .map((property) => breezewaySummary(property, knownCodes));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.guestyKeychain) configureGuestyKeychain();
  const knownCodes = knownPropertyCodes();
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'preview_only',
    limit: args.limit,
    sourcesRequested: args.source,
    knownPropertyCodes: knownCodes.size,
    guesty: { count: 0, keyPresence: {}, properties: [], error: null },
    breezeway: { count: 0, keyPresence: {}, properties: [], error: null },
    merged: [],
    notes: [
      'No FAD rows were written.',
      'Raw external payloads are not stored in this report; only summarized keys and operational fields are included.',
      'Access-like fields are redacted if detected.',
      'Ops size inference is draft guidance; low/medium confidence rows need human confirmation before automated scheduling relies on them.',
    ],
  };

  if (args.source === 'all' || args.source === 'guesty') {
    try {
      report.guesty.properties = await pullGuesty(args.limit, knownCodes);
      report.guesty.count = report.guesty.properties.length;
      report.guesty.keyPresence = countKeys(report.guesty.properties);
    } catch (error) {
      report.guesty.error = error.message;
    }
  }

  if (args.source === 'all' || args.source === 'breezeway') {
    try {
      report.breezeway.properties = await pullBreezeway(args.limit, knownCodes, args.breezewayKeychain);
      report.breezeway.count = report.breezeway.properties.length;
      report.breezeway.keyPresence = countKeys(report.breezeway.properties);
    } catch (error) {
      report.breezeway.error = error.message;
    }
  }

  report.merged = mergeByCode(report.guesty.properties, report.breezeway.properties);

  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) {
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(args.out, json);
  }
  console.log(JSON.stringify({
    generatedAt: report.generatedAt,
    guesty: { count: report.guesty.count, error: report.guesty.error },
    breezeway: { count: report.breezeway.count, error: report.breezeway.error },
    mergedCount: report.merged.length,
    out: args.out || null,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[ops-property-metadata-preview] ${error.message}`);
  process.exit(1);
});
