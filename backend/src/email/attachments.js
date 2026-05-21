'use strict';

// Email attachment download + storage helpers. Per locked decision §8,
// v1 stores to local disk under EMAIL_ATTACHMENT_ROOT (default
// /var/www/fad-attachments/email/). Future S3 migration swaps these
// two functions.
//
// Status: skeleton — actual Gmail attachment fetch (via
// messages.attachments.get) wires once gmail_client is reachable.

const fs = require('fs').promises;
const path = require('path');
const { randomUUID } = require('crypto');

const ROOT = process.env.EMAIL_ATTACHMENT_ROOT || '/var/www/fad-attachments/email';

/**
 * Persist a downloaded attachment buffer to disk. Returns the relative
 * storage_path that should land in the email_attachments.storage_path
 * column. Filenames are UUIDs to avoid collisions; the original
 * filename is preserved as a sibling column.
 */
async function persist({ tenantId, messageId, buffer, ext }) {
  const dir = path.join(ROOT, tenantId, messageId);
  await fs.mkdir(dir, { recursive: true });
  const fname = `${randomUUID()}${ext ? `.${ext.replace(/^\./, '')}` : ''}`;
  const abs = path.join(dir, fname);
  await fs.writeFile(abs, buffer);
  // Return the relative path (under ROOT) so we're portable across
  // future storage backends.
  return path.relative(ROOT, abs);
}

/**
 * Read an attachment back from disk. Resolves the relative path
 * against ROOT — caller is responsible for the auth check before
 * calling this.
 */
async function read(storagePath) {
  const abs = path.resolve(ROOT, storagePath);
  if (!abs.startsWith(path.resolve(ROOT))) {
    throw new Error('attachment path traversal blocked');
  }
  return fs.readFile(abs);
}

module.exports = { persist, read, ROOT };
