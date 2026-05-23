// DigitalOcean Spaces (S3-compatible) storage helper.
//
// Used for expense receipt blobs (slice 3c of the expense capture work).
// Replaces inline base64 storage in `expense_receipts.inline_base64` once
// Spaces credentials are configured on the host. The helper is INTENTIONALLY
// opt-in: if any of the required env vars are missing, `isSpacesConfigured()`
// returns false and callers fall back to inline base64. This means the code
// is safe to deploy ahead of credential provisioning.
//
// Required env vars on the VPS (.env):
//   DO_SPACES_ENDPOINT  e.g. https://fra1.digitaloceanspaces.com
//   DO_SPACES_REGION    e.g. fra1 (must match the endpoint subdomain)
//   DO_SPACES_BUCKET    e.g. friday-fad-receipts
//   DO_SPACES_KEY       (the Spaces access key id — DO control panel)
//   DO_SPACES_SECRET    (the Spaces secret access key — DO control panel)
//   DO_SPACES_PREFIX    optional, default 'receipts/'.
//
// Public URL pattern (only if the bucket is configured public-read):
//   ${DO_SPACES_ENDPOINT_HOST_PER_BUCKET}/${PREFIX}${KEY}
// We do NOT make receipts public. Backend serves them via a signed-URL
// route (lands in slice 3d alongside a /api/expenses/receipts/:id flow).
//
// SDK: @aws-sdk/client-s3 (v3 modular). Lazy-loaded inside the upload
// function so the module is not pulled into memory in environments
// where Spaces isn't used.

'use strict';

const crypto = require('crypto');

function isSpacesConfigured() {
  const have = (k) => typeof process.env[k] === 'string' && process.env[k].length > 0;
  return (
    have('DO_SPACES_ENDPOINT') &&
    have('DO_SPACES_REGION') &&
    have('DO_SPACES_BUCKET') &&
    have('DO_SPACES_KEY') &&
    have('DO_SPACES_SECRET')
  );
}

/**
 * Build a stable object key for a receipt.
 * `${PREFIX}${tenantId}/${expenseId}/${sha256Hash}-${safeFileName}`
 * sha256-prefix gives us cheap dedup even at the storage layer; the
 * unique-index in expense_receipts(expense_id, sha256_hash) prevents
 * dupes server-side anyway, but this keeps the keys stable for
 * fingerprinted caching / signed-URL TTLs.
 */
function buildReceiptKey({ tenantId, expenseId, sha256Hash, fileName }) {
  const prefix = process.env.DO_SPACES_PREFIX || 'receipts/';
  const safeName = String(fileName || 'receipt')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 80);
  return `${prefix}${tenantId}/${expenseId}/${sha256Hash}-${safeName}`;
}

/**
 * Upload a base64-encoded blob to Spaces. Returns the object key
 * (stored in expense_receipts.storage_ref). The caller is expected to
 * have already validated the size + computed the sha256 hash, and to
 * have started a DB transaction wrapping the upload — if the upload
 * fails the caller should ROLLBACK so the receipts row isn't orphaned.
 *
 * @returns {Promise<{ key: string; etag?: string }>}
 */
async function uploadReceipt({ tenantId, expenseId, sha256Hash, fileName, contentType, base64 }) {
  if (!isSpacesConfigured()) {
    throw new Error('DO Spaces is not configured — uploadReceipt should not have been called');
  }
  // Lazy import so the SDK isn't loaded when Spaces is unconfigured.
  // The eslint-disable for require() in a function body is intentional
  // — we want side-effect-free module top-level for envs without creds.
  // eslint-disable-next-line global-require
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

  const client = new S3Client({
    endpoint: process.env.DO_SPACES_ENDPOINT,
    region: process.env.DO_SPACES_REGION,
    credentials: {
      accessKeyId: process.env.DO_SPACES_KEY,
      secretAccessKey: process.env.DO_SPACES_SECRET,
    },
    forcePathStyle: false, // DO Spaces uses virtual-hosted-style by default
  });

  const key = buildReceiptKey({ tenantId, expenseId, sha256Hash, fileName });
  const body = Buffer.from(base64, 'base64');

  const cmd = new PutObjectCommand({
    Bucket: process.env.DO_SPACES_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType || 'application/octet-stream',
    // Receipts are private — never public read. Signed-URL access in slice 3d.
    ACL: 'private',
    // Lightweight metadata for ops debugging via DO control panel.
    Metadata: {
      'sha256': sha256Hash,
      'tenant-id': String(tenantId),
      'expense-id': String(expenseId),
    },
  });

  const out = await client.send(cmd);
  return { key, etag: out?.ETag };
}

/**
 * Cheap sanity check for a base64 blob's apparent type. We don't want
 * to upload anything non-image / non-pdf to Spaces. Caller should have
 * already validated by content_type from the client, this is defence
 * in depth.
 */
function isAllowedReceiptContentType(contentType) {
  if (typeof contentType !== 'string') return false;
  const ct = contentType.toLowerCase();
  return (
    ct.startsWith('image/') ||
    ct === 'application/pdf'
  );
}

module.exports = {
  isSpacesConfigured,
  uploadReceipt,
  buildReceiptKey,
  isAllowedReceiptContentType,
  // Re-exports for unit tests
  _crypto: crypto, // hash work lives in expenses.js for now; expose for tests
};
