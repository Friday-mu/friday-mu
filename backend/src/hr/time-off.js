'use strict';

// Time-off request endpoints. Authenticated staff can submit + cancel
// their OWN requests. Directors (hr_time_off:approve) can list all,
// approve, and reject.
//
// Notifications fire on submit (→ approvers) and on decision (→ requester).

const express = require('express');
const { query } = require('../database/client');
const { requireHrPerm, attachIdentity, hasPerm } = require('./auth');
const { findTimeOffApprovers, createNotifications } = require('./notifications');

const router = express.Router();

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const VALID_TYPES = ['annual', 'sick', 'unpaid', 'family', 'other'];

// Helper: resolve the hr_staff record for the authenticated user.
// Used by submit/cancel-own endpoints. Returns null if the user has no
// linked staff record (e.g. an external admin without HR presence).
async function staffForUser(userId) {
  if (!userId) return null;
  const { rows } = await query(
    `SELECT id, name FROM hr_staff WHERE tenant_id = $1 AND user_id = $2 LIMIT 1`,
    [DEFAULT_TENANT_ID, userId],
  );
  return rows[0] || null;
}

function shapeRequest(row) {
  return {
    id: row.id,
    staff_id: row.staff_id,
    staff_name: row.staff_name || null,
    start_date: row.start_date,
    end_date: row.end_date,
    type: row.type,
    reason: row.reason,
    status: row.status,
    reviewed_by: row.reviewed_by,
    reviewed_by_name: row.reviewed_by_name || null,
    reviewed_at: row.reviewed_at,
    review_notes: row.review_notes,
    created_at: row.created_at,
  };
}

// GET /api/hr/time-off?status=pending|approved|rejected|cancelled
// &staff_id=<uuid>
// Director sees all. Staff without :read permission only see their own.
router.get('/', attachIdentity, async (req, res) => {
  try {
    const canSeeAll = hasPerm(req.identity.userRole, 'hr_time_off:read');
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    const staffIdFilter = typeof req.query.staff_id === 'string' ? req.query.staff_id : null;

    const where = ['t.tenant_id = $1'];
    const params = [DEFAULT_TENANT_ID];
    let idx = 2;

    if (!canSeeAll) {
      const me = await staffForUser(req.identity.userId);
      if (!me) return res.json({ results: [] });
      where.push(`t.staff_id = $${idx++}`);
      params.push(me.id);
    } else if (staffIdFilter) {
      where.push(`t.staff_id = $${idx++}`);
      params.push(staffIdFilter);
    }
    if (status) {
      where.push(`t.status = $${idx++}`);
      params.push(status);
    }

    // Cast DATE columns to text so the response carries 'YYYY-MM-DD'
    // strings (no timezone-dependent parsing surprises on the client).
    const sql = `
      SELECT t.id, t.staff_id, t.type, t.reason, t.status,
             t.reviewed_by, t.reviewed_at, t.review_notes, t.created_at,
             t.start_date::text AS start_date,
             t.end_date::text AS end_date,
             s.name AS staff_name,
             r.name AS reviewed_by_name
      FROM hr_time_off_requests t
      LEFT JOIN hr_staff s ON s.id = t.staff_id
      LEFT JOIN hr_staff r ON r.id = t.reviewed_by
      WHERE ${where.join(' AND ')}
      ORDER BY t.created_at DESC
    `;
    const { rows } = await query(sql, params);
    res.json({ results: rows.map(shapeRequest) });
  } catch (e) {
    console.error('[hr/time-off] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/hr/time-off — any authenticated user submits a request on
// behalf of their own staff record. staff_id is derived from the JWT's
// user_id → hr_staff.user_id linkage; clients can't spoof it.
router.post('/', attachIdentity, async (req, res) => {
  try {
    const { start_date, end_date, type, reason } = req.body || {};
    if (!start_date || !end_date || !type) {
      return res.status(400).json({ error: 'start_date, end_date and type are required' });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
    }
    if (new Date(end_date) < new Date(start_date)) {
      return res.status(400).json({ error: 'end_date must be on or after start_date' });
    }
    const me = await staffForUser(req.identity.userId);
    if (!me) {
      return res.status(400).json({
        error: 'Your user account is not linked to a staff record. Ask HR to link them by email.',
      });
    }
    const { rows } = await query(
      `INSERT INTO hr_time_off_requests
         (tenant_id, staff_id, start_date, end_date, type, reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [DEFAULT_TENANT_ID, me.id, start_date, end_date, type, reason || null],
    );

    // Notify all approvers. Self-notification (when the requester is also
    // an approver — e.g. Ishant) is fine; the bell just shows it.
    const approvers = await findTimeOffApprovers();
    await createNotifications(approvers, {
      type: 'hr_time_off_request',
      title: `${me.name} requested time off`,
      subtitle: `${type} · ${start_date} → ${end_date}`,
      preview: reason || null,
    });

    res.status(201).json({ ...shapeRequest(rows[0]), staff_name: me.name });
  } catch (e) {
    console.error('[hr/time-off] create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/hr/time-off/:id — Director approves or rejects. Notifies
// the requester. Idempotent: re-approving a pending request is a no-op.
router.patch('/:id', requireHrPerm('hr_time_off:approve'), async (req, res) => {
  try {
    const { status, review_notes } = req.body || {};
    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
    }
    // Reviewer's staff record (for the foreign key)
    const reviewer = await staffForUser(req.identity.userId);
    const upd = await query(
      `UPDATE hr_time_off_requests
       SET status = $3,
           reviewed_by = $4,
           reviewed_at = NOW(),
           review_notes = $5
       WHERE tenant_id = $1 AND id = $2 AND status = 'pending'
       RETURNING id`,
      [DEFAULT_TENANT_ID, req.params.id, status, reviewer?.id || null, review_notes || null],
    );
    if (upd.rows.length === 0) {
      return res.status(404).json({ error: 'Pending time-off request not found' });
    }

    // Re-fetch with JOINs so the response carries reviewer + requester names.
    // Cast DATE columns to text so they round-trip as 'YYYY-MM-DD' strings —
    // pg otherwise parses bare DATEs through the server's local timezone,
    // which introduces an off-by-one outside UTC.
    const { rows: joined } = await query(
      `SELECT t.id, t.staff_id, t.type, t.reason, t.status,
              t.reviewed_by, t.reviewed_at, t.review_notes, t.created_at,
              t.start_date::text AS start_date,
              t.end_date::text AS end_date,
              s.name AS staff_name, s.user_id AS staff_user_id,
              r.name AS reviewed_by_name
       FROM hr_time_off_requests t
       LEFT JOIN hr_staff s ON s.id = t.staff_id
       LEFT JOIN hr_staff r ON r.id = t.reviewed_by
       WHERE t.id = $1`,
      [req.params.id],
    );
    const row = joined[0];

    if (row?.staff_user_id) {
      await createNotifications(
        [{ id: row.staff_user_id }],
        {
          type: 'hr_time_off_decision',
          title: `Time-off request ${status}`,
          subtitle: `${row.start_date} → ${row.end_date}`,
          preview: review_notes || null,
        },
      );
    }
    res.json(shapeRequest(row));
  } catch (e) {
    console.error('[hr/time-off] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/hr/time-off/:id/cancel — requester cancels their own pending request.
router.post('/:id/cancel', attachIdentity, async (req, res) => {
  try {
    const me = await staffForUser(req.identity.userId);
    if (!me) return res.status(400).json({ error: 'No linked staff record' });
    const { rows } = await query(
      `UPDATE hr_time_off_requests
       SET status = 'cancelled'
       WHERE tenant_id = $1 AND id = $2 AND staff_id = $3 AND status = 'pending'
       RETURNING *`,
      [DEFAULT_TENANT_ID, req.params.id, me.id],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Pending request not found or not yours' });
    }
    res.json(shapeRequest(rows[0]));
  } catch (e) {
    console.error('[hr/time-off] cancel error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
