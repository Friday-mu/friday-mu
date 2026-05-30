'use strict';

// Staff CRUD endpoints. All require Director-level permission for v1
// (hr_staff:read / read_sensitive / write). Sensitive fields (email,
// phone, leave_reason, leave_notes, notes) are stripped from the
// response for callers without :read_sensitive.

const express = require('express');
const { query } = require('../database/client');
const { requireHrPerm, hasPerm } = require('./auth');

const router = express.Router();

// Tenant scope. v1: single tenant (Friday Retreats). Future: read from req.
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const SENSITIVE_FIELDS = ['email', 'phone', 'leave_reason', 'leave_notes', 'notes'];

function shapeStaff(row, canSeeSensitive) {
  const base = {
    id: row.id,
    name: row.name,
    role: row.role,
    department: row.department,
    zone: row.zone,
    hire_date: row.hire_date,
    status: row.status,
    last_worked_date: row.last_worked_date,
    archived_at: row.archived_at,
    user_id: row.user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (canSeeSensitive) {
    for (const f of SENSITIVE_FIELDS) base[f] = row[f];
  }
  return base;
}

// GET /api/hr/staff — list (filterable by status). Returns sensitive
// fields only when caller has :read_sensitive.
router.get('/', requireHrPerm('hr_staff:read'), async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    const sql = status
      ? `SELECT * FROM hr_staff WHERE tenant_id = $1 AND status = $2 ORDER BY name`
      : `SELECT * FROM hr_staff WHERE tenant_id = $1 ORDER BY status, name`;
    const params = status ? [DEFAULT_TENANT_ID, status] : [DEFAULT_TENANT_ID];
    const { rows } = await query(sql, params);
    const canSeeSensitive = hasPerm(req.identity.userRole, 'hr_staff:read_sensitive');
    res.json({ results: rows.map((r) => shapeStaff(r, canSeeSensitive)) });
  } catch (e) {
    console.error('[hr/staff] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/hr/staff/:id — detail.
router.get('/:id', requireHrPerm('hr_staff:read'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM hr_staff WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Staff not found' });
    const canSeeSensitive = hasPerm(req.identity.userRole, 'hr_staff:read_sensitive');
    res.json(shapeStaff(rows[0], canSeeSensitive));
  } catch (e) {
    console.error('[hr/staff] detail error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/hr/staff — create. Director-only.
router.post('/', requireHrPerm('hr_staff:write'), async (req, res) => {
  try {
    const {
      name, email, phone, role, department, zone, hire_date, notes,
    } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const { rows } = await query(
      `INSERT INTO hr_staff (tenant_id, name, email, phone, role, department, zone, hire_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        DEFAULT_TENANT_ID,
        name.trim(),
        email || null,
        phone || null,
        role || null,
        department || null,
        zone || null,
        hire_date || null,
        notes || null,
      ],
    );
    // Auto-link to auth user if email matches
    if (email) {
      await query(
        `UPDATE hr_staff SET user_id = u.id FROM users u
         WHERE hr_staff.id = $1 AND LOWER(u.email) = LOWER($2) AND hr_staff.user_id IS NULL`,
        [rows[0].id, email],
      ).catch(() => { /* users table may not be readable; that's fine */ });
    }
    res.status(201).json(shapeStaff(rows[0], true));
  } catch (e) {
    console.error('[hr/staff] create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/hr/staff/:id — partial update. Sensitive-fields gated.
router.patch('/:id', requireHrPerm('hr_staff:write'), async (req, res) => {
  try {
    const allowed = ['name', 'email', 'phone', 'role', 'department', 'zone', 'hire_date', 'notes'];
    const sets = [];
    const params = [DEFAULT_TENANT_ID, req.params.id];
    let idx = 3;
    for (const field of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
        sets.push(`${field} = $${idx++}`);
        params.push(req.body[field] === '' ? null : req.body[field]);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No allowed fields to update' });
    sets.push('updated_at = NOW()');
    const sql = `UPDATE hr_staff SET ${sets.join(', ')} WHERE tenant_id = $1 AND id = $2 RETURNING *`;
    const { rows } = await query(sql, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Staff not found' });
    res.json(shapeStaff(rows[0], true));
  } catch (e) {
    console.error('[hr/staff] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/hr/staff/:id/archive — mark archived with mandatory leave context.
router.post('/:id/archive', requireHrPerm('hr_staff:write'), async (req, res) => {
  try {
    const { last_worked_date, leave_reason, leave_notes } = req.body || {};
    if (!last_worked_date || !leave_reason) {
      return res.status(400).json({ error: 'last_worked_date and leave_reason are required' });
    }
    const { rows } = await query(
      `UPDATE hr_staff
       SET status = 'archived',
           last_worked_date = $3,
           leave_reason = $4,
           leave_notes = $5,
           archived_at = NOW(),
           archived_by = $6,
           updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND status = 'active'
       RETURNING *`,
      [
        DEFAULT_TENANT_ID,
        req.params.id,
        last_worked_date,
        leave_reason,
        leave_notes || null,
        req.identity.userId || null,
      ],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Active staff record not found' });
    }
    res.json(shapeStaff(rows[0], true));
  } catch (e) {
    console.error('[hr/staff] archive error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/hr/staff/:id/reactivate — undo archive. Clears leave fields.
router.post('/:id/reactivate', requireHrPerm('hr_staff:write'), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE hr_staff
       SET status = 'active',
           archived_at = NULL,
           archived_by = NULL,
           leave_reason = NULL,
           leave_notes = NULL,
           last_worked_date = NULL,
           updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND status = 'archived'
       RETURNING *`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Archived staff record not found' });
    }
    res.json(shapeStaff(rows[0], true));
  } catch (e) {
    console.error('[hr/staff] reactivate error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
