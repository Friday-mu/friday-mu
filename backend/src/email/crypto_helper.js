'use strict';

// AES-256-GCM helper for token storage at rest. Used by email/oauth.js
// to encrypt access_token + refresh_token before writing to bytea.
//
// Wire format (bytea contents):
//   [12-byte IV][16-byte auth tag][ciphertext]
//
// Key source: env var EMAIL_TOKEN_ENCRYPTION_KEY — 32 random bytes as
// hex (64 chars) or base64. Generate with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//
// Rotation: future helper can add a key-version byte at the front of
// the wire format. Not needed for v1 (no tokens written yet).

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;
  const raw = process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'EMAIL_TOKEN_ENCRYPTION_KEY env var not set; cannot encrypt/decrypt email OAuth tokens',
    );
  }
  // Accept hex (64 chars) or base64 (43-44 chars depending on padding)
  // for operator convenience. Reject anything that doesn't decode to 32
  // bytes — silent truncation would weaken the cipher.
  let key;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }
  if (key.length !== 32) {
    throw new Error(
      `EMAIL_TOKEN_ENCRYPTION_KEY must decode to 32 bytes; got ${key.length}`,
    );
  }
  cachedKey = key;
  return key;
}

/**
 * Encrypt a plaintext string. Returns a Buffer suitable for bytea
 * storage. Plaintext must be UTF-8.
 */
function encrypt(plaintext) {
  if (typeof plaintext !== 'string') throw new Error('encrypt expects a string');
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

/**
 * Decrypt a Buffer produced by encrypt(). Throws on auth-tag mismatch
 * (tampering / wrong key). Returns the original UTF-8 plaintext.
 */
function decrypt(blob) {
  if (!Buffer.isBuffer(blob) || blob.length < IV_LEN + TAG_LEN) {
    throw new Error('decrypt expects a buffer of at least 28 bytes');
  }
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

module.exports = { encrypt, decrypt };
