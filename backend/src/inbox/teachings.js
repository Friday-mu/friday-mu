'use strict';

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');

const router = express.Router();

const VALID_STATUSES = new Set(['active', 'draft', 'revoked', 'retired', 'rejected']);
const VALID_SCOPES = new Set(['global', 'property']);
const VALID_POLARITY = new Set(['positive', 'negative']);

function actorName(req) {
  return req.identity?.displayName
    || req.identity?.username
    || req.identity?.userId
    || 'fad-user';
}

function normaliseInstruction(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normaliseScope(value) {
  return VALID_SCOPES.has(value) ? value : 'global';
}

function normalisePropertyCodes(value) {
  if (!Array.isArray(value)) return null;
  const codes = [...new Set(value
    .filter((v) => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean))];
  return codes.length > 0 ? codes : null;
}

function shapeTeaching(row) {
  if (!row) return null;
  return {
    id: row.id,
    instruction: row.instruction,
    scope: row.scope,
    property_code: row.property_code,
    property_codes: row.property_codes || null,
    source: row.source,
    status: row.status,
    taught_by: row.taught_by,
    taught_at: row.taught_at,
    approved_at: row.approved_at,
    approved_by: row.approved_by,
    evidence_count: row.evidence_count,
    confidence: row.confidence,
    polarity: row.polarity,
  };
}

router.get('/', attachIdentity, async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : 'active';
    const filters = ['tenant_id = $1'];
    const params = [req.tenantId];
    if (status !== 'all') {
      if (!VALID_STATUSES.has(status)) return res.status(400).json({ error: 'invalid status' });
      params.push(status);
      filters.push(`status = $${params.length}`);
    }
    const { rows } = await query(
      `SELECT id, instruction, scope, property_code, property_codes, source,
              status, taught_by, taught_at, approved_at, approved_by,
              evidence_count, confidence, polarity
         FROM teachings
        WHERE ${filters.join(' AND ')}
        ORDER BY taught_at DESC NULLS LAST
        LIMIT 500`,
      params,
    );
    res.json({ teachings: rows.map(shapeTeaching) });
  } catch (e) {
    console.error('[teachings] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', attachIdentity, async (req, res) => {
  try {
    const instruction = normaliseInstruction(req.body?.instruction);
    if (!instruction) return res.status(400).json({ error: 'instruction is required' });

    const scope = normaliseScope(req.body?.scope);
    const propertyCodes = normalisePropertyCodes(req.body?.property_codes);
    const propertyCode = typeof req.body?.property_code === 'string'
      ? req.body.property_code.trim() || null
      : (propertyCodes ? propertyCodes[0] : null);
    if (scope === 'property' && !propertyCode && !propertyCodes) {
      return res.status(400).json({ error: 'property_code or property_codes is required for property teachings' });
    }

    const polarity = VALID_POLARITY.has(req.body?.polarity) ? req.body.polarity : 'positive';
    const source = typeof req.body?.source === 'string' && req.body.source.trim()
      ? req.body.source.trim()
      : 'direct';
    const actor = actorName(req);

    const { rows } = await query(
      `INSERT INTO teachings (
         tenant_id, instruction, scope, property_code, property_codes,
         source, status, taught_by, taught_at, approved_at, approved_by,
         evidence_count, confidence, polarity
       )
       VALUES (
         $1, $2, $3, $4, $5,
         $6, 'active', $7, NOW(), NOW(), $7,
         1, 1, $8
       )
       RETURNING id, instruction, scope, property_code, property_codes, source,
                 status, taught_by, taught_at, approved_at, approved_by,
                 evidence_count, confidence, polarity`,
      [
        req.tenantId,
        instruction,
        scope,
        propertyCode,
        propertyCodes,
        source,
        actor,
        polarity,
      ],
    );
    res.status(201).json({ teaching: shapeTeaching(rows[0]) });
  } catch (e) {
    console.error('[teachings] create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', attachIdentity, async (req, res) => {
  try {
    const sets = [];
    const params = [];
    let i = 1;
    const setCol = (col, value) => {
      sets.push(`${col} = $${i++}`);
      params.push(value);
    };

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'instruction')) {
      const instruction = normaliseInstruction(req.body.instruction);
      if (!instruction) return res.status(400).json({ error: 'instruction cannot be empty' });
      setCol('instruction', instruction);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'scope')) {
      const scope = normaliseScope(req.body.scope);
      setCol('scope', scope);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'property_code')) {
      setCol('property_code', typeof req.body.property_code === 'string' && req.body.property_code.trim()
        ? req.body.property_code.trim()
        : null);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'property_codes')) {
      setCol('property_codes', normalisePropertyCodes(req.body.property_codes));
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'status')) {
      if (!VALID_STATUSES.has(req.body.status)) return res.status(400).json({ error: 'invalid status' });
      setCol('status', req.body.status);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'polarity')) {
      if (!VALID_POLARITY.has(req.body.polarity)) return res.status(400).json({ error: 'invalid polarity' });
      setCol('polarity', req.body.polarity);
    }

    if (sets.length === 0) return res.status(400).json({ error: 'no fields to update' });

    params.push(req.params.id, req.tenantId);
    const { rows } = await query(
      `UPDATE teachings
          SET ${sets.join(', ')}
        WHERE id = $${i++} AND tenant_id = $${i}
        RETURNING id, instruction, scope, property_code, property_codes, source,
                  status, taught_by, taught_at, approved_at, approved_by,
                  evidence_count, confidence, polarity`,
      params,
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Teaching not found' });
    res.json({ teaching: shapeTeaching(rows[0]) });
  } catch (e) {
    console.error('[teachings] update error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/pause', attachIdentity, async (req, res) => {
  try {
    const actor = actorName(req);
    const reason = typeof req.body?.reason === 'string' && req.body.reason.trim()
      ? req.body.reason.trim()
      : 'Paused from Friday Consult';
    const { rows } = await query(
      `UPDATE teachings
          SET status = 'revoked',
              revoked_by = $1,
              revoked_at = NOW(),
              revoke_reason = $2
        WHERE id = $3 AND tenant_id = $4
        RETURNING id, instruction, scope, property_code, property_codes, source,
                  status, taught_by, taught_at, approved_at, approved_by,
                  evidence_count, confidence, polarity`,
      [actor, reason, req.params.id, req.tenantId],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Teaching not found' });
    res.json({ teaching: shapeTeaching(rows[0]) });
  } catch (e) {
    console.error('[teachings] pause error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

module.exports._test = {
  normaliseInstruction,
  normaliseScope,
  normalisePropertyCodes,
};
