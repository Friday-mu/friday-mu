#!/usr/bin/env node
'use strict';

// fetch-bokun-experiences.js — ingest live Bokun Mauritius inventory into FAD's
// `experiences` supply hub (table from migration 106). Lifts the proven snapshot
// logic from friday.travel's scripts/fetch-bokun-content.mjs (OCTO pricing + REST
// HMAC content), normalizes to the provider-agnostic record, tags
// country='MU' + channels=['friday.mu','friday.travel'] (routing rule), and upserts
// by (tenant_id, provider, provider_id) so re-runs reconcile, never duplicate.
//
// Creds from env (BOKUN_OCTO_TOKEN / BOKUN_ACCESS_KEY / BOKUN_SECRET_KEY) — never
// committed; copied into the FAD VPS .env per the experiences spec.
//
//   node backend/scripts/fetch-bokun-experiences.js [--dry-run] [--tenant-id <uuid>]
//
// --dry-run prints the normalized set + counts without writing.

const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool } = require('../src/database/client');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const tenantArgIdx = args.indexOf('--tenant-id');
const TENANT_ID = (tenantArgIdx >= 0 && args[tenantArgIdx + 1])
  || process.env.DEFAULT_TENANT_ID
  || '00000000-0000-0000-0000-000000000001';

const OCTO = process.env.BOKUN_OCTO_TOKEN;
const ACCESS = process.env.BOKUN_ACCESS_KEY;
const SECRET = process.env.BOKUN_SECRET_KEY;
const REST = process.env.BOKUN_BASE_URL || 'https://api.bokun.io';

// Demo / bad-data products to exclude from the guest-facing set (per spec):
//   1103057 = "Fantasy Falls" demo product
//   1103059 = "3 Mamelles" has a wrong (snow) photo — skip until corrected
const EXCLUDE_IDS = new Set(['1103057', '1103059']);

if (!OCTO || !ACCESS || !SECRET) {
  console.error('Bokun credentials unavailable. Set BOKUN_OCTO_TOKEN / BOKUN_ACCESS_KEY / BOKUN_SECRET_KEY in backend/.env.');
  process.exit(1);
}

// ── Bokun REST HMAC-SHA1 auth (lifted from fetch-bokun-content.mjs) ──
function authHeaders(method, p) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  const sig = crypto.createHmac('sha1', SECRET).update(date + ACCESS + method + p, 'utf8').digest('base64');
  return { 'X-Bokun-Date': date, 'X-Bokun-AccessKey': ACCESS, 'X-Bokun-Signature': sig, Accept: 'application/json' };
}

// ── price → EUR (MUR÷49.5, USD÷1.09); minor units via currencyPrecision ──
const MUR = 49.5, USD = 1.09;
function toEur(p) {
  if (!p || typeof p.retail !== 'number') return null;
  const prec = typeof p.currencyPrecision === 'number' ? p.currencyPrecision : 2;
  const amt = p.retail / Math.pow(10, prec);
  const cur = (p.currency || 'EUR').toUpperCase();
  return cur === 'MUR' ? amt / MUR : cur === 'USD' ? amt / USD : amt;
}
function fromPrice(p) {
  let min = Infinity;
  for (const o of p.options || []) for (const u of o.units || []) {
    const e = toEur((u.pricingFrom || [])[0]);
    if (e != null && e > 0) min = Math.min(min, e);
  }
  return Number.isFinite(min) ? Math.round(min) : null; // null => "Price on request"
}

function photoUrl(ph) {
  if (!ph) return undefined;
  const der = Array.isArray(ph.derived) ? ph.derived : [];
  const pick = (n) => der.find((x) => x.name === n);
  const large = pick('large') || pick('preview');
  return large?.cleanUrl || large?.url || ph.originalUrl || ph.cleanUrl || ph.url;
}
function stripHtml(s) {
  if (!s) return undefined;
  const t = s.replace(/<\/(p|div|li|br|h[1-6])>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#39;|&rsquo;|&apos;/gi, '’')
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  return t || undefined;
}
function durationOf(a) {
  if (a.durationType === 'DAYS' && a.durationDays) return `${a.durationDays} day${a.durationDays > 1 ? 's' : ''}`;
  const h = a.durationHours || 0, m = a.durationMinutes || 0;
  if (h || m) return `${h ? h + 'h' : ''}${h && m ? ' ' : ''}${m ? m + 'm' : ''}`.trim();
  return a.durationText || undefined;
}
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

// Best-effort geo from the Bokun activity payload (fields vary; null when absent —
// refine later from source_payload).
function locationOf(a) {
  if (!a) return { lat: null, lng: null, area: null };
  const gp = a.googlePlace || a.place || a.location || {};
  const geo = gp.geoPoint || a.geoPoint || {};
  const lat = num(geo.lat ?? gp.lat ?? a.latitude);
  const lng = num(geo.lng ?? gp.lng ?? a.longitude);
  const area = (gp.city || gp.name || a.city || '').toString().trim() || null;
  return { lat, lng, area };
}

// Heuristic category from name+description → water|land|cultural|gastro|wellness|aerial.
function categoryOf(name, desc) {
  const t = `${name || ''} ${desc || ''}`.toLowerCase();
  if (/snorkel|scuba|dive|diving|dolphin|catamaran|\bboat\b|cruise|kayak|paddle|\bsail|fishing|underwater|submarine|sea ?kart|glass ?bottom|swim with/.test(t)) return 'water';
  if (/helicopter|parasail|paraglid|sky ?dive|zip ?line|aerial|seaplane|hot ?air|balloon|microlight/.test(t)) return 'aerial';
  if (/\bspa\b|massage|\byoga\b|wellness|retreat|meditation|hammam|thermal/.test(t)) return 'wellness';
  if (/\bfood\b|\bwine\b|tasting|culinary|cooking|gastro|street food|\brum\b|distillery|chef|degustation/.test(t)) return 'gastro';
  if (/temple|museum|heritage|cultural|culture|\bhistor|village|city tour|\bsega\b|\bmarket\b|colonial|botanical garden/.test(t)) return 'cultural';
  if (/hike|hiking|trek|mountain|forest|\bpark\b|nature|waterfall|\btrail|quad|buggy|safari|\bgorge|land\b|4x4|e-?bike|cycling/.test(t)) return 'land';
  return null;
}

async function main() {
  console.log(`[bokun→fad] ${DRY_RUN ? 'DRY-RUN' : 'APPLY'} · tenant=${TENANT_ID}`);
  const octo = await fetch('https://api.bokun.io/octo/v1/products', {
    headers: { authorization: `Bearer ${OCTO}`, 'Octo-Capabilities': 'octo/content,octo/pricing' },
  }).then((r) => r.json());
  if (!Array.isArray(octo)) throw new Error(`OCTO products fetch did not return an array: ${JSON.stringify(octo).slice(0, 200)}`);
  console.log(`[bokun→fad] OCTO products: ${octo.length}`);

  const records = [];
  let excluded = 0;
  for (const p of octo) {
    const id = String(p.id);
    if (EXCLUDE_IDS.has(id)) { excluded++; continue; }
    const ap = `/activity.json/${id}`;
    let a = null;
    try { const r = await fetch(REST + ap, { headers: authHeaders('GET', ap) }); if (r.ok) a = await r.json(); } catch { /* skip detail */ }

    const hero = photoUrl(a?.keyPhoto);
    const rest = (Array.isArray(a?.photos) ? a.photos : []).map(photoUrl).filter(Boolean);
    const photos = [...new Set([hero, ...rest].filter(Boolean))].slice(0, 6);
    const reviewCount = typeof a?.reviewCount === 'number' ? a.reviewCount : 0;
    const name = (a?.title || p.internalName || '').trim();
    const blurb = stripHtml(a?.excerpt) || null;
    const description = stripHtml(a?.description) || null;
    const { lat, lng, area } = locationOf(a);
    const rec = {
      id: `fad-exp-${id}`,
      provider: 'bokun',
      provider_id: id,
      status: 'active',
      country: 'MU',
      channels: ['friday.mu', 'friday.travel'], // MU → both, per routing rule
      name,
      area,
      lat,
      lng,
      category: categoryOf(name, description || blurb),
      duration_text: durationOf(a || {}) || null,
      price_from_eur: fromPrice(p),
      instant: p.instantConfirmation !== false,
      rating: reviewCount > 0 && a?.reviewRating > 0 ? Math.round(a.reviewRating * 100) / 100 : null,
      review_count: reviewCount,
      blurb,
      description,
      photos,
      book_mode: 'api',
      redirect_url: null,
      // Redacted provenance for refresh/refinement — public content only, capped.
      source_payload: { provider: 'bokun', providerId: id, vendor: a?.vendor?.title || a?.boxedVendor?.title || null, fetchedAt: new Date().toISOString() },
    };
    if (!rec.name) continue; // skip nameless
    records.push(rec);
    process.stdout.write('.');
  }
  console.log('');
  console.log(`[bokun→fad] normalized ${records.length} experiences (excluded ${excluded} demo/bad-photo)`);

  if (DRY_RUN) {
    for (const r of records) console.log(`  ${r.provider_id}  ${r.photos.length}ph  €${r.price_from_eur ?? 'POR'}  ${r.rating ?? 'new'}  ${r.category || '?'}  | ${r.name.slice(0, 48)}`);
    console.log(`[bokun→fad] DRY-RUN — no writes. Would upsert ${records.length} rows.`);
    await pool.end();
    return;
  }

  let inserted = 0, updated = 0;
  for (const r of records) {
    const res = await pool.query(
      `INSERT INTO experiences (
         id, tenant_id, provider, provider_id, status, country, channels, name, area, lat, lng,
         category, duration_text, price_from_eur, instant, rating, review_count, blurb, description,
         photos, book_mode, redirect_url, source_payload, synced_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21,$22,$23::jsonb,NOW(),NOW())
       ON CONFLICT (tenant_id, provider, provider_id) DO UPDATE SET
         country = EXCLUDED.country,
         channels = EXCLUDED.channels,
         name = EXCLUDED.name,
         area = COALESCE(EXCLUDED.area, experiences.area),
         lat = COALESCE(EXCLUDED.lat, experiences.lat),
         lng = COALESCE(EXCLUDED.lng, experiences.lng),
         category = COALESCE(EXCLUDED.category, experiences.category),
         duration_text = EXCLUDED.duration_text,
         price_from_eur = EXCLUDED.price_from_eur,
         instant = EXCLUDED.instant,
         rating = EXCLUDED.rating,
         review_count = EXCLUDED.review_count,
         blurb = EXCLUDED.blurb,
         description = EXCLUDED.description,
         photos = EXCLUDED.photos,
         source_payload = EXCLUDED.source_payload,
         synced_at = NOW(),
         updated_at = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [r.id, TENANT_ID, r.provider, r.provider_id, r.status, r.country, r.channels, r.name, r.area, r.lat, r.lng,
       r.category, r.duration_text, r.price_from_eur, r.instant, r.rating, r.review_count, r.blurb, r.description,
       JSON.stringify(r.photos), r.book_mode, r.redirect_url, JSON.stringify(r.source_payload)],
    );
    if (res.rows[0]?.inserted) inserted++; else updated++;
  }
  console.log(`[bokun→fad] APPLY complete — inserted ${inserted}, updated ${updated}, total ${records.length}`);
  await pool.end();
}

main().catch((e) => { console.error('[bokun→fad] FAILED:', e.message); process.exit(1); });
