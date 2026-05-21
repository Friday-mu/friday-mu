'use strict';

// Hybrid email classifier — heuristics first (cheap, deterministic),
// LLM fallback for ambiguous cases. Decisions cache to
// email_classification_cache keyed by sender email, so repeat senders
// classify in O(1) without re-running either path.
//
// Heuristic signals (per locked decision §6, 2026-05-17):
//   - Sender email in `owners` table → owner
//   - Sender domain matches a known vendor (vendors table) → vendor
//   - Sender email/domain matches a Guesty reservation guest → guest
//   - Sender domain in tenant allowlist (@friday.mu) → team
//   - Otherwise → LLM fallback (uses @anthropic-ai/sdk)
//
// LLM prompt sketch:
//   "Given this email sender + subject + body, classify the audience as
//    one of: guest, owner, vendor, team, unclassified. Return JSON
//    {audience, confidence (0-1), reason}."
//
// Cache TTL: forever in v1 — same sender writing again hits cache.
// Manual override (operator drag-drops a thread between audiences)
// updates the cache row with classifier='manual'.

const { query } = require('../database/client');

const VALID_AUDIENCES = new Set(['guest', 'owner', 'vendor', 'team', 'unclassified']);

/**
 * Cache lookup. Returns null when no entry exists; caller should run
 * heuristics + LLM.
 */
async function getCached(tenantId, senderEmail) {
  if (!senderEmail) return null;
  const { rows } = await query(
    `SELECT classified_audience, classifier, confidence, reason, classified_at
     FROM email_classification_cache
     WHERE tenant_id = $1 AND sender_email = $2`,
    [tenantId, senderEmail.toLowerCase()],
  );
  return rows[0] || null;
}

async function setCached(tenantId, senderEmail, decision) {
  if (!senderEmail || !decision || !VALID_AUDIENCES.has(decision.audience)) return;
  await query(
    `INSERT INTO email_classification_cache (
       tenant_id, sender_email, classified_audience, classifier, confidence, reason
     ) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (tenant_id, sender_email) DO UPDATE SET
       classified_audience = EXCLUDED.classified_audience,
       classifier = EXCLUDED.classifier,
       confidence = EXCLUDED.confidence,
       reason = EXCLUDED.reason,
       classified_at = NOW()`,
    [tenantId, senderEmail.toLowerCase(), decision.audience, decision.classifier,
     decision.confidence ?? null, decision.reason ?? null],
  );
}

/**
 * Run heuristic classification. Returns a decision or null if no
 * heuristic fires. Each heuristic carries its own confidence — direct
 * row match in owners/vendors is high-confidence; domain match is
 * weaker.
 *
 * NOTE: The actual table lookups against owners / vendors / guests
 * are stubbed — those modules haven't been built yet. The shape lets
 * us wire them when the data lands.
 */
async function heuristicClassify(tenantId, senderEmail) {
  if (!senderEmail) return null;
  const email = senderEmail.toLowerCase();
  const domain = email.split('@')[1] || '';

  // 1. Team — Friday-internal sender by domain.
  //    Allowlist drives this; defaults to friday.mu.
  const teamDomains = (process.env.GMAIL_OAUTH_DOMAIN_ALLOWLIST || 'friday.mu')
    .split(',').map((s) => s.trim().toLowerCase());
  if (teamDomains.includes(domain)) {
    return { audience: 'team', classifier: 'heuristic', confidence: 0.95,
             reason: `sender domain '${domain}' is in the tenant allowlist` };
  }

  // 2. Owner — exact-email match against the owners table.
  //    TODO: owners table is owned by the Owners module (not yet
  //    shipped). When it lands, the lookup becomes:
  //      SELECT id FROM owners WHERE tenant_id=$1 AND LOWER(email)=$2
  //    For v1 this branch is dormant.

  // 3. Vendor — domain match against vendors table.
  //    TODO: same — vendors table not yet shipped. Stubbed.

  // 4. Guest — email match against Guesty reservations.
  //    Source of truth lives on the friday-gms side; fad-backend
  //    accesses via the existing `inbox_messages` table populated
  //    by GMS. Stubbed in v1 (cheap to wire when needed).

  return null;
}

/**
 * LLM fallback — wraps the Anthropic SDK to classify a single message.
 * The model gets sender, subject, and a body excerpt; returns JSON.
 *
 * Returns null on parse failure (caller defaults to 'unclassified' +
 * caches that decision so we don't retry on every repeat sender).
 *
 * @param {object} args
 * @param {string} args.fromEmail
 * @param {string} [args.fromName]
 * @param {string} [args.subject]
 * @param {string} [args.bodyExcerpt] — first ~500 chars of body_text
 */
async function llmClassify({ fromEmail, fromName, subject, bodyExcerpt }) {
  // Lazy require: don't pull the SDK into memory until we actually need it.
  let Anthropic;
  try {
    Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
  } catch (_e) {
    // SDK not installed yet → fail soft, caller defaults to 'unclassified'
    return null;
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  const prompt = [
    'Classify the audience of this email. Return ONLY JSON: ',
    '{ "audience": "guest"|"owner"|"vendor"|"team"|"unclassified", ',
    '"confidence": 0.0-1.0, "reason": "<short string>" }.',
    '',
    `From: ${fromName ? `${fromName} <${fromEmail}>` : fromEmail}`,
    `Subject: ${subject || '(none)'}`,
    `Body excerpt: ${(bodyExcerpt || '').slice(0, 500)}`,
    '',
    'Definitions:',
    '- guest: someone booking, asking about, or staying at a Friday Retreats property',
    '- owner: a property owner discussing their listing, payments, or operations',
    '- vendor: a supplier, contractor, or service provider',
    '- team: Friday Retreats internal staff (@friday.mu or known team domain)',
    '- unclassified: signal too weak to decide',
  ].join('\n');
  try {
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = resp?.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!VALID_AUDIENCES.has(parsed.audience)) return null;
    return {
      audience: parsed.audience,
      classifier: 'llm',
      confidence: Number(parsed.confidence) || 0.6,
      reason: String(parsed.reason || '').slice(0, 500),
    };
  } catch (e) {
    console.warn('[email/classifier] LLM call failed:', e.message);
    return null;
  }
}

/**
 * Public entry point. Cache → heuristic → LLM → default('unclassified').
 * Writes the resolved decision back to cache so repeat senders don't
 * retrigger either expensive path.
 */
async function classifyEmail({ tenantId, fromEmail, fromName, subject, bodyExcerpt }) {
  if (!fromEmail) return { audience: 'unclassified', classifier: 'heuristic', confidence: 0 };
  const cached = await getCached(tenantId, fromEmail);
  if (cached) {
    return {
      audience: cached.classified_audience,
      classifier: cached.classifier,
      confidence: cached.confidence != null ? Number(cached.confidence) : null,
      reason: cached.reason,
      cached: true,
    };
  }
  const heuristic = await heuristicClassify(tenantId, fromEmail);
  if (heuristic) {
    await setCached(tenantId, fromEmail, heuristic);
    return heuristic;
  }
  const llm = await llmClassify({ fromEmail, fromName, subject, bodyExcerpt });
  const decision = llm || {
    audience: 'unclassified',
    classifier: 'heuristic',
    confidence: 0,
    reason: 'no heuristic match; LLM unavailable or failed',
  };
  await setCached(tenantId, fromEmail, decision);
  return decision;
}

module.exports = {
  classifyEmail,
  heuristicClassify,
  llmClassify,
  getCached,
  setCached,
};
