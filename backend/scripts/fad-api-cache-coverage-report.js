#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../src/database/client');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FR_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_TENANT_ID = UUID_RE.test(process.env.DEFAULT_TENANT_ID || '')
  ? process.env.DEFAULT_TENANT_ID
  : FR_TENANT_ID;

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage:
  node backend/scripts/fad-api-cache-coverage-report.js
    [--tenant-id <uuid>] [--out report.json]

Read-only coverage check for the FAD/FridayOS API caches that should feed Ops:
Guesty listings, Guesty reservations, FAD property overlays, and Breezeway
tasks/enrichment. It does not call external Guesty/Breezeway APIs and does not
mutate rows.`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    tenantId: DEFAULT_TENANT_ID,
    out: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--tenant-id') args.tenantId = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!UUID_RE.test(args.tenantId)) throw new Error('--tenant-id must be a UUID');
  return args;
}

async function safeQuery(name, sql, params) {
  try {
    const { rows } = await pool.query(sql, params);
    return { name, ok: true, rows };
  } catch (error) {
    return { name, ok: false, error: error.message, rows: [] };
  }
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function percent(part, total) {
  const t = number(total);
  if (t === 0) return null;
  return Math.round((number(part) * 1000) / t) / 10;
}

function coverage(row, fields) {
  const total = number(row.total);
  return Object.fromEntries(fields.map((field) => ([
    field,
    {
      count: number(row[field]),
      pct: percent(row[field], total),
    },
  ])));
}

function addGap(gaps, condition, severity, area, message) {
  if (!condition) return;
  gaps.push({ severity, area, message });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');

  const [
    listingsResult,
    propertiesResult,
    reservationsResult,
    tasksResult,
  ] = await Promise.all([
    safeQuery('guesty_listings', `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE nickname IS NOT NULL)::int AS nickname,
        COUNT(*) FILTER (WHERE address_full IS NOT NULL OR address_city IS NOT NULL)::int AS address,
        COUNT(*) FILTER (WHERE property_type IS NOT NULL)::int AS property_type,
        COUNT(*) FILTER (WHERE bedrooms IS NOT NULL)::int AS bedrooms,
        COUNT(*) FILTER (WHERE bathrooms IS NOT NULL)::int AS bathrooms,
        COUNT(*) FILTER (WHERE accommodates IS NOT NULL)::int AS accommodates,
        COUNT(*) FILTER (
          WHERE jsonb_typeof(raw->'amenities') = 'array'
            AND jsonb_array_length(raw->'amenities') > 0
        )::int AS raw_amenities,
        COUNT(*) FILTER (
          WHERE NULLIF(raw #>> '{address,lat}', '') IS NOT NULL
             OR NULLIF(raw #>> '{address,lng}', '') IS NOT NULL
             OR NULLIF(raw #>> '{address,latitude}', '') IS NOT NULL
             OR NULLIF(raw #>> '{address,longitude}', '') IS NOT NULL
             OR NULLIF(raw->>'lat', '') IS NOT NULL
             OR NULLIF(raw->>'lng', '') IS NOT NULL
        )::int AS raw_geo,
        MAX(synced_at) AS last_synced_at
      FROM guesty_listings
      WHERE tenant_id = $1
    `, [args.tenantId]),
    safeQuery('fad_properties', `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE guesty_id IS NOT NULL)::int AS guesty_linked,
        COUNT(*) FILTER (WHERE code IS NOT NULL)::int AS code,
        COUNT(*) FILTER (WHERE bedrooms IS NOT NULL)::int AS bedrooms,
        COUNT(*) FILTER (WHERE bathrooms IS NOT NULL)::int AS bathrooms,
        COUNT(*) FILTER (WHERE max_occupancy IS NOT NULL)::int AS max_occupancy,
        COUNT(*) FILTER (WHERE geo_lat IS NOT NULL AND geo_lng IS NOT NULL)::int AS overlay_geo,
        COUNT(*) FILTER (WHERE is_combo = TRUE)::int AS combo_properties,
        MAX(updated_at) AS last_updated_at
      FROM fad_properties
      WHERE tenant_id = $1
    `, [args.tenantId]),
    safeQuery('guesty_reservations', `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE check_in_date IS NOT NULL AND check_out_date IS NOT NULL)::int AS stay_dates,
        COUNT(*) FILTER (WHERE listing_guesty_id IS NOT NULL)::int AS listing_link,
        COUNT(*) FILTER (WHERE guest_email IS NOT NULL OR guest_phone IS NOT NULL)::int AS guest_contact,
        COUNT(*) FILTER (WHERE guests_count IS NOT NULL OR adults IS NOT NULL OR children IS NOT NULL)::int AS party_size,
        COUNT(*) FILTER (WHERE total_amount_minor IS NOT NULL)::int AS total_amount,
        COUNT(*) FILTER (WHERE raw IS NOT NULL AND raw <> '{}'::jsonb)::int AS raw_payload,
        COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '14 days')::int AS updated_last_14d,
        MIN(check_in_date) AS min_check_in,
        MAX(check_out_date) AS max_check_out,
        MAX(synced_at) AS last_synced_at
      FROM guesty_reservations
      WHERE tenant_id = $1
    `, [args.tenantId]),
    safeQuery('breezeway_tasks', `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE external_ref LIKE 'breezeway:%')::int AS external_ref,
        COUNT(*) FILTER (WHERE source_payload ? 'apiEnrichment')::int AS api_enrichment,
        COUNT(*) FILTER (WHERE source_payload #>> '{apiEnrichment,sourceUpdatedAt}' IS NOT NULL)::int AS source_updated_at,
        COUNT(*) FILTER (WHERE due_date IS NOT NULL)::int AS due_date,
        COUNT(*) FILTER (WHERE due_time IS NOT NULL)::int AS due_time,
        COUNT(*) FILTER (WHERE array_length(assignee_user_ids, 1) > 0)::int AS assignees,
        COUNT(*) FILTER (
          WHERE COALESCE((source_payload #>> '{apiEnrichment,commentsCount}')::int, 0) > 0
        )::int AS api_comments,
        COUNT(*) FILTER (
          WHERE COALESCE((source_payload #>> '{apiEnrichment,costsCount}')::int, 0) > 0
        )::int AS api_costs,
        COUNT(*) FILTER (
          WHERE COALESCE((source_payload #>> '{apiEnrichment,suppliesCount}')::int, 0) > 0
        )::int AS api_supplies,
        COUNT(*) FILTER (
          WHERE title IS NULL
             OR title ILIKE 'Imported from Breezeway%'
             OR title ILIKE 'Breezeway task%'
             OR title ILIKE '%[redacted%'
        )::int AS weak_titles,
        MAX(updated_at) AS last_updated_at
      FROM tasks
      WHERE tenant_id = $1
        AND source = 'breezeway'
        AND status <> 'cancelled'
    `, [args.tenantId]),
  ]);

  const listings = listingsResult.rows[0] || {};
  const properties = propertiesResult.rows[0] || {};
  const reservations = reservationsResult.rows[0] || {};
  const tasks = tasksResult.rows[0] || {};
  const gaps = [];

  addGap(gaps, !listingsResult.ok, 'high', 'properties', listingsResult.error);
  addGap(gaps, !reservationsResult.ok, 'high', 'reservations', reservationsResult.error);
  addGap(gaps, !tasksResult.ok, 'high', 'breezeway_tasks', tasksResult.error);

  addGap(
    gaps,
    listingsResult.ok && number(listings.total) > 0 && number(listings.raw_geo) > number(properties.overlay_geo),
    'medium',
    'properties',
    'Guesty raw listings appear to contain more geo data than /api/properties currently exposes from fad_properties overlay.',
  );
  addGap(
    gaps,
    tasksResult.ok && number(tasks.total) > 0 && number(tasks.api_enrichment) < number(tasks.total),
    'medium',
    'breezeway_tasks',
    'Some imported Breezeway tasks have not been enriched from the Breezeway API, so comments/photos/costs/supplies may be missing.',
  );
  addGap(
    gaps,
    tasksResult.ok && number(tasks.weak_titles) > 0,
    'medium',
    'breezeway_tasks',
    'Some Breezeway task titles are placeholder/redacted-style labels and should be normalized from API detail where safe.',
  );
  addGap(
    gaps,
    reservationsResult.ok && number(reservations.updated_last_14d) === 0 && number(reservations.total) > 0,
    'high',
    'reservations',
    'No Guesty reservation cache rows updated in the last 14 days; ops scheduling may be stale.',
  );

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'dry_run_read_only',
    tenantId: args.tenantId,
    apiRuntimeTruth: {
      primarySource: 'FAD/FridayOS API cached tables',
      directGuestyOrBreezewayUse: 'Audit/backfill only, not normal runtime for Ops agent planning.',
      routesCheckedInCode: [
        '/api/properties -> guesty_listings + fad_properties overlay',
        '/api/reservations -> guesty_reservations + fad_reservations overlay',
        '/api/tasks -> FAD-native tasks including source=breezeway imports',
        '/api/tasks/imports/breezeway/* -> CSV bundle preview/apply',
      ],
      knownGap: 'Breezeway current-task API sync is script-based today; it is not yet a permanent always-on FridayOS API sync route.',
    },
    coverage: {
      guestyListings: {
        ok: listingsResult.ok,
        total: number(listings.total),
        lastSyncedAt: listings.last_synced_at || null,
        fields: coverage(listings, [
          'nickname', 'address', 'property_type', 'bedrooms', 'bathrooms',
          'accommodates', 'raw_amenities', 'raw_geo',
        ]),
      },
      fadPropertiesOverlay: {
        ok: propertiesResult.ok,
        total: number(properties.total),
        lastUpdatedAt: properties.last_updated_at || null,
        fields: coverage(properties, [
          'guesty_linked', 'code', 'bedrooms', 'bathrooms', 'max_occupancy',
          'overlay_geo', 'combo_properties',
        ]),
      },
      guestyReservations: {
        ok: reservationsResult.ok,
        total: number(reservations.total),
        minCheckIn: reservations.min_check_in || null,
        maxCheckOut: reservations.max_check_out || null,
        lastSyncedAt: reservations.last_synced_at || null,
        fields: coverage(reservations, [
          'stay_dates', 'listing_link', 'guest_contact', 'party_size',
          'total_amount', 'raw_payload', 'updated_last_14d',
        ]),
      },
      breezewayTasks: {
        ok: tasksResult.ok,
        total: number(tasks.total),
        lastUpdatedAt: tasks.last_updated_at || null,
        fields: coverage(tasks, [
          'external_ref', 'api_enrichment', 'source_updated_at', 'due_date',
          'due_time', 'assignees', 'api_comments', 'api_costs',
          'api_supplies', 'weak_titles',
        ]),
      },
    },
    gaps,
    recommendations: [
      'Use /api/properties, /api/reservations, and /api/tasks as the Ops agent runtime context path.',
      'Keep direct Guesty/Breezeway API pulls for preview/backfill/audit tools only.',
      'If Breezeway remains active tomorrow, promote breezeway-current-tasks-sync.js into an authenticated FridayOS admin sync route or scheduled worker.',
      'Before live roster/schedule generation, ensure property geo coverage is complete enough for travel-time routing.',
    ],
  };

  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) {
    const outPath = path.resolve(args.out);
    fs.writeFileSync(outPath, json);
    console.log(`Wrote FAD API cache coverage report to ${outPath}`);
  } else {
    process.stdout.write(json);
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
