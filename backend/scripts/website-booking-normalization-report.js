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
  node backend/scripts/website-booking-normalization-report.js
    [--tenant-id <uuid>] [--limit 25] [--out report.json]

Dry-run only. Reads FAD website inbox booking/proof events and reports how
many can render as structured cards, how many proof uploads link to a request,
and which historical rows need manual review. It never updates inbox_events,
inbox_threads, or fad_portal_booking_requests.`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    tenantId: DEFAULT_TENANT_ID,
    limit: 25,
    out: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--tenant-id') args.tenantId = argv[++i];
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg === '--out') args.out = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!UUID_RE.test(args.tenantId)) throw new Error('--tenant-id must be a UUID');
  if (!Number.isFinite(args.limit) || args.limit < 0) throw new Error('--limit must be a non-negative number');
  args.limit = Math.min(Math.round(args.limit), 200);
  return args;
}

function payloadData(payload) {
  if (!payload || typeof payload !== 'object') return {};
  return payload.data && typeof payload.data === 'object' ? payload.data : payload;
}

function text(value) {
  const s = String(value || '').trim();
  return s.length > 0 ? s : null;
}

function pick(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function requestIdFor(row, data) {
  return text(
    pick(data, ['booking_request_id', 'request_id', 'reference'])
    || row.reference
    || row.sidecar_request_id,
  );
}

function normalizedRequest(row) {
  const data = payloadData(row.payload);
  const guest = data.guest && typeof data.guest === 'object' ? data.guest : {};
  const quote = data.quote && typeof data.quote === 'object' ? data.quote : {};
  const requestId = requestIdFor(row, data);
  const residence = text(pick(data, ['residence_name', 'residenceName']) || row.listing_title)
    || text(pick(data, ['residence_slug', 'residenceSlug']) || row.listing_slug)
    || text(data.guesty_listing_id);
  const guestIdentity = text(guest.email || row.guest_email) || text(guest.name || row.guest_name);
  const missing = [];
  if (!requestId) missing.push('request_id');
  if (!row.thread_id) missing.push('thread_id');
  if (!residence) missing.push('residence');
  if (!text(pick(data, ['check_in', 'checkIn']) || row.check_in)) missing.push('check_in');
  if (!text(pick(data, ['check_out', 'checkOut']) || row.check_out)) missing.push('check_out');
  if (!guestIdentity) missing.push('guest');
  if (quote.total == null && row.quoted_total_amount_minor == null) missing.push('quote_total');
  if (!text(quote.currency || row.quoted_total_currency)) missing.push('quote_currency');
  return {
    eventId: row.id,
    threadId: row.thread_id,
    requestId,
    eventVersion: data.event_version || null,
    legacyNormalized: data.event_version !== '2026-05-26',
    sidecarStatus: row.sidecar_status || null,
    missingCriticalFields: missing,
  };
}

function normalizedProof(row) {
  const data = payloadData(row.payload);
  const requestId = requestIdFor(row, data);
  const proofEvidence = text(pick(data, ['proof_viewer_url', 'proofViewerUrl', 'proof_url', 'proofUrl', 'file_name', 'fileName']));
  const missing = [];
  if (!requestId && !text(pick(data, ['thread_id', 'threadId']) || row.thread_id)) missing.push('request_or_thread_link');
  if (!proofEvidence && !text(row.proof_viewer_url || row.proof_url || row.proof_file_name)) missing.push('proof_evidence');
  return {
    eventId: row.id,
    threadId: row.thread_id,
    requestId,
    eventVersion: data.event_version || null,
    legacyNormalized: data.event_version !== '2026-05-26',
    proofViewerUrlPresent: Boolean(text(pick(data, ['proof_viewer_url', 'proofViewerUrl']) || row.proof_viewer_url)),
    missingCriticalFields: missing,
  };
}

function addToMap(map, key, value) {
  if (!key) return;
  const existing = map.get(key) || [];
  existing.push(value);
  map.set(key, existing);
}

function compactSample(items, limit) {
  if (limit === 0) return [];
  return items.slice(0, limit).map((item) => ({
    eventId: item.eventId,
    threadId: item.threadId,
    requestId: item.requestId,
    legacyNormalized: item.legacyNormalized,
    missingCriticalFields: item.missingCriticalFields,
  }));
}

async function loadEvents(tenantId) {
  const { rows } = await pool.query(
    `SELECT
       e.id, e.thread_id, e.reference, e.event_type, e.source, e.payload, e.created_at,
       t.guest_email, t.guest_name, t.guest_phone,
       br.id AS sidecar_id,
       br.request_id AS sidecar_request_id,
       br.status AS sidecar_status,
       br.listing_slug, br.listing_title,
       br.check_in, br.check_out,
       br.quoted_total_amount_minor, br.quoted_total_currency,
       br.proof_url, br.proof_viewer_url, br.proof_file_name,
       br.proof_received_at, br.proof_source, br.proof_event_id
     FROM inbox_events e
     LEFT JOIN inbox_threads t
       ON t.id = e.thread_id AND t.tenant_id = e.tenant_id
     LEFT JOIN LATERAL (
       SELECT *
         FROM fad_portal_booking_requests br
        WHERE br.tenant_id = e.tenant_id
          AND (
            br.thread_id = e.thread_id
            OR br.request_id = COALESCE(
              e.payload->>'booking_request_id',
              e.payload->>'request_id',
              e.payload->>'reference',
              e.reference
            )
          )
        ORDER BY br.updated_at DESC NULLS LAST, br.created_at DESC NULLS LAST
        LIMIT 1
     ) br ON TRUE
     WHERE e.tenant_id = $1
       AND e.event_type IN ('booking.request_submitted', 'booking.proof_uploaded')
       AND COALESCE(e.source, 'website') IN ('website', 'fad')
     ORDER BY e.created_at ASC, e.id ASC`,
    [tenantId],
  );
  return rows;
}

function analyze(rows, sampleLimit) {
  const requests = rows
    .filter((row) => row.event_type === 'booking.request_submitted')
    .map(normalizedRequest);
  const proofs = rows
    .filter((row) => row.event_type === 'booking.proof_uploaded')
    .map(normalizedProof);

  const byRequestId = new Map();
  const byThreadId = new Map();
  for (const request of requests) {
    addToMap(byRequestId, request.requestId, request);
    addToMap(byThreadId, request.threadId, request);
  }

  const proofLinkResults = proofs.map((proof) => {
    const candidates = [
      ...(byRequestId.get(proof.requestId) || []),
      ...(byThreadId.get(proof.threadId) || []),
    ];
    const unique = new Map(candidates.map((item) => [item.eventId, item]));
    return {
      proof,
      linkedCount: unique.size,
      linkedRequestIds: [...new Set([...unique.values()].map((item) => item.requestId).filter(Boolean))],
    };
  });

  const requestIdConflicts = [...byRequestId.entries()]
    .map(([requestId, items]) => ({
      requestId,
      eventCount: items.length,
      threadIds: [...new Set(items.map((item) => item.threadId).filter(Boolean))],
      eventIds: items.map((item) => item.eventId),
    }))
    .filter((item) => item.eventCount > 1 || item.threadIds.length > 1);

  const proofConflicts = proofLinkResults
    .filter((item) => item.linkedCount !== 1)
    .map((item) => ({
      proofEventId: item.proof.eventId,
      requestId: item.proof.requestId,
      threadId: item.proof.threadId,
      linkedCount: item.linkedCount,
      linkedRequestIds: item.linkedRequestIds,
    }));

  const sidecarStatusCounts = {};
  for (const request of requests) {
    const status = request.sidecarStatus || 'missing_sidecar';
    sidecarStatusCounts[status] = (sidecarStatusCounts[status] || 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: 'dry_run_read_only',
    scope: 'website_booking_request_and_payment_proof',
    counts: {
      historicalWebsiteRequestsFound: requests.length,
      fullyNormalized: requests.filter((item) => item.missingCriticalFields.length === 0).length,
      legacyRequestsFound: requests.filter((item) => item.legacyNormalized).length,
      missingCriticalFields: requests.filter((item) => item.missingCriticalFields.length > 0).length,
      proofUploadsFound: proofs.length,
      proofUploadsLinked: proofLinkResults.filter((item) => item.linkedCount === 1).length,
      proofUploadsUnlinked: proofLinkResults.filter((item) => item.linkedCount === 0).length,
      proofUploadConflicts: proofLinkResults.filter((item) => item.linkedCount > 1).length,
      requestDuplicatesOrConflicts: requestIdConflicts.length,
    },
    sidecarStatusCounts,
    samples: {
      missingCriticalRequests: compactSample(
        requests.filter((item) => item.missingCriticalFields.length > 0),
        sampleLimit,
      ),
      unlinkedOrConflictingProofs: proofConflicts.slice(0, sampleLimit),
      duplicateOrConflictingRequests: requestIdConflicts.slice(0, sampleLimit),
    },
    notes: [
      'No rows were written. Raw inbox_events payloads remain the source of audit history.',
      'FAD now prefers render-time normalization; persistent backfill should only create derived metadata if needed later.',
      'Proof events are considered linkable without guest.email when thread_id, booking_request_id, or reference matches a request.',
    ],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const report = analyze(await loadEvents(args.tenantId), args.limit);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) {
    const outPath = path.resolve(args.out);
    fs.writeFileSync(outPath, json);
    console.log(`Wrote website booking normalization dry-run report to ${outPath}`);
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
