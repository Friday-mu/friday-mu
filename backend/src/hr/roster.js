'use strict';

// Weekly HR roster availability endpoints. This persists Operations'
// staff/date availability grid. It deliberately does not model task
// assignment calendar slots; tasks remain scheduled through /api/tasks.

const express = require('express');
const { pool, query } = require('../database/client');
const {
  DEFAULT_TENANT_ID,
  attachIdentity,
  hasPerm,
  requireHrPerm,
} = require('./auth');

const router = express.Router();

const VALID_AVAILABILITY = new Set(['on', 'off', 'leave', 'standby']);
const VALID_ZONE = new Set(['north', 'west', 'office']);
const VALID_LEAVE_TYPE = new Set(['annual', 'sick', 'personal', 'unpaid', 'family', 'other']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(?::\d{2})?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tenantId(req) {
  return req.tenantId || req.identity?.tenantId || DEFAULT_TENANT_ID;
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function addDays(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

function safeUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value) ? value : null;
}

function timeText(value) {
  if (!value) return null;
  const s = String(value);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

function cleanString(value, maxLength = 1000) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function normaliseDay(input, weekStart, weekEnd) {
  const rawDate = input?.date || input?.work_date;
  if (!isIsoDate(rawDate)) throw new Error('Each roster day needs a valid date');
  if (rawDate < weekStart || rawDate > weekEnd) {
    throw new Error(`Roster day ${rawDate} is outside ${weekStart} to ${weekEnd}`);
  }

  const rawAvailability = input?.availability || 'on';
  if (!VALID_AVAILABILITY.has(rawAvailability)) {
    throw new Error(`availability must be one of: ${[...VALID_AVAILABILITY].join(', ')}`);
  }

  const rawStaffId = input?.staff_id || input?.staffId || input?.user_id || input?.userId;
  if (!safeUuid(rawStaffId)) throw new Error('Each roster day needs a valid staff_id');

  const zone = VALID_ZONE.has(input?.zone) && rawAvailability === 'on' ? input.zone : null;
  const leaveType = rawAvailability === 'leave' && VALID_LEAVE_TYPE.has(input?.leave_type || input?.leaveType)
    ? (input.leave_type || input.leaveType)
    : null;
  const startTime = input?.start_time || input?.startTime || null;
  const endTime = input?.end_time || input?.endTime || null;
  if (startTime && !TIME_RE.test(startTime)) throw new Error('start_time must be HH:MM');
  if (endTime && !TIME_RE.test(endTime)) throw new Error('end_time must be HH:MM');

  return {
    staffKey: rawStaffId,
    date: rawDate,
    availability: rawAvailability,
    zone,
    leaveType,
    startTime: startTime ? timeText(startTime) : null,
    endTime: endTime ? timeText(endTime) : null,
    notes: cleanString(input?.notes, 2000),
  };
}

function shapeWeek(row, days) {
  const weekStart = row.week_start || row.weekStart;
  return {
    id: row.id || null,
    tenant_id: row.tenant_id || DEFAULT_TENANT_ID,
    week_start: weekStart,
    week_end: row.week_end || row.weekEnd || (weekStart ? addDays(weekStart, 6) : null),
    status: row.status || 'draft',
    notes: row.notes || null,
    published_at: row.published_at || null,
    published_by: row.published_by || null,
    published_by_name: row.published_by_name || null,
    created_by: row.created_by || null,
    updated_by: row.updated_by || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    days: (days || []).map((day) => ({
      id: day.id,
      staff_id: day.staff_id,
      staff_name: day.staff_name || null,
      user_id: day.user_id || null,
      date: day.date || day.work_date,
      availability: day.availability,
      zone: day.zone || null,
      leave_type: day.leave_type || null,
      start_time: timeText(day.start_time),
      end_time: timeText(day.end_time),
      notes: day.notes || null,
      source: day.source || 'manual',
      created_at: day.created_at || null,
      updated_at: day.updated_at || null,
    })),
  };
}

async function staffForUser(userId, currentTenantId) {
  if (!safeUuid(userId)) return null;
  const { rows } = await query(
    `SELECT id, name
       FROM hr_staff
      WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'
      LIMIT 1`,
    [currentTenantId, userId],
  );
  return rows[0] || null;
}

async function loadWeek(currentTenantId, weekStart, opts = {}) {
  const params = [currentTenantId, weekStart];
  const { rows } = await query(
    `SELECT w.id,
            w.tenant_id,
            w.week_start::text AS week_start,
            w.week_end::text AS week_end,
            w.status,
            w.notes,
            w.published_at,
            w.published_by,
            COALESCE(u.display_name, u.username, u.email) AS published_by_name,
            w.created_by,
            w.updated_by,
            w.created_at,
            w.updated_at
       FROM hr_roster_weeks w
       LEFT JOIN users u ON u.id = w.published_by
      WHERE w.tenant_id = $1 AND w.week_start = $2
      LIMIT 1`,
    params,
  );

  const week = rows[0] || {
    id: null,
    tenant_id: currentTenantId,
    week_start: weekStart,
    week_end: addDays(weekStart, 6),
    status: 'draft',
  };

  if (!week.id) return shapeWeek(week, []);
  if (opts.publishedOnly && week.status !== 'published') return shapeWeek(week, []);

  const dayParams = [currentTenantId, week.id];
  let staffFilter = '';
  if (opts.staffId) {
    dayParams.push(opts.staffId);
    staffFilter = ` AND d.staff_id = $${dayParams.length}`;
  }

  const dayRows = await query(
    `SELECT d.id,
            d.staff_id,
            s.name AS staff_name,
            s.user_id,
            d.work_date::text AS date,
            d.availability,
            d.zone,
            d.leave_type,
            d.start_time::text AS start_time,
            d.end_time::text AS end_time,
            d.notes,
            d.source,
            d.created_at,
            d.updated_at
       FROM hr_roster_days d
       JOIN hr_staff s ON s.id = d.staff_id AND s.tenant_id = d.tenant_id
      WHERE d.tenant_id = $1 AND d.week_id = $2${staffFilter}
      ORDER BY d.work_date, s.name`,
    dayParams,
  );

  return shapeWeek(week, dayRows.rows);
}

async function resolveStaffIds(client, currentTenantId, staffKeys) {
  const keys = [...new Set(staffKeys.filter(Boolean))];
  if (keys.length === 0) return new Map();
  const { rows } = await client.query(
    `SELECT id, user_id
       FROM hr_staff
      WHERE tenant_id = $1
        AND status = 'active'
        AND (id = ANY($2::uuid[]) OR user_id = ANY($2::uuid[]))`,
    [currentTenantId, keys],
  );
  const out = new Map();
  for (const row of rows) {
    out.set(row.id, row.id);
    if (row.user_id) out.set(row.user_id, row.id);
  }
  return out;
}

// GET /api/hr/roster?week_start=YYYY-MM-DD
// Managers see the team roster. Staff without hr_roster:read see only
// the row linked to their own HR staff record.
router.get('/', attachIdentity, async (req, res) => {
  try {
    const weekStart = typeof req.query.week_start === 'string' ? req.query.week_start : null;
    if (!isIsoDate(weekStart)) return res.status(400).json({ error: 'week_start must be YYYY-MM-DD' });

    const currentTenantId = tenantId(req);
    let staffId = null;
    if (!hasPerm(req.identity.userRole, 'hr_roster:read')) {
      const me = await staffForUser(req.identity.userId, currentTenantId);
      if (!me) {
        return res.json({
          roster: shapeWeek({
            tenant_id: currentTenantId,
            week_start: weekStart,
            week_end: addDays(weekStart, 6),
            status: 'draft',
          }, []),
        });
      }
      staffId = me.id;
    }

    res.json({ roster: await loadWeek(currentTenantId, weekStart, {
      staffId,
      publishedOnly: Boolean(staffId),
    }) });
  } catch (e) {
    console.error('[hr/roster] get error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/hr/roster — save a draft week. Body:
// { week_start, days: [{ staff_id, date, availability, zone, ... }] }
router.put('/', requireHrPerm('hr_roster:write'), async (req, res) => {
  const currentTenantId = tenantId(req);
  const actorId = safeUuid(req.identity.userId);
  let client = null;
  try {
    const weekStart = req.body?.week_start || req.body?.weekStart;
    if (!isIsoDate(weekStart)) return res.status(400).json({ error: 'week_start must be YYYY-MM-DD' });
    if (!Array.isArray(req.body?.days) || req.body.days.length === 0) {
      return res.status(400).json({ error: 'days must be a non-empty array' });
    }

    const weekEnd = addDays(weekStart, 6);
    const days = req.body.days.map((day) => normaliseDay(day, weekStart, weekEnd));

    client = await pool.connect();
    await client.query('BEGIN');
    const week = await client.query(
      `INSERT INTO hr_roster_weeks
         (tenant_id, week_start, week_end, status, notes, created_by, updated_by)
       VALUES ($1, $2, $3, 'draft', $4, $5, $5)
       ON CONFLICT (tenant_id, week_start)
       DO UPDATE SET
         week_end = EXCLUDED.week_end,
         status = 'draft',
         notes = EXCLUDED.notes,
         published_at = NULL,
         published_by = NULL,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING id`,
      [currentTenantId, weekStart, weekEnd, cleanString(req.body?.notes, 2000), actorId],
    );

    const weekId = week.rows[0].id;
    const staffByKey = await resolveStaffIds(client, currentTenantId, days.map((day) => day.staffKey));
    const unknown = days.map((day) => day.staffKey).filter((key) => !staffByKey.has(key));
    if (unknown.length > 0) {
      throw new Error(`Unknown active HR staff record(s): ${[...new Set(unknown)].join(', ')}`);
    }

    for (const day of days) {
      await client.query(
        `INSERT INTO hr_roster_days
           (tenant_id, week_id, staff_id, work_date, availability, zone, leave_type,
            start_time, end_time, notes, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'manual')
         ON CONFLICT (tenant_id, week_id, staff_id, work_date)
         DO UPDATE SET
           availability = EXCLUDED.availability,
           zone = EXCLUDED.zone,
           leave_type = EXCLUDED.leave_type,
           start_time = EXCLUDED.start_time,
           end_time = EXCLUDED.end_time,
           notes = EXCLUDED.notes,
           source = 'manual',
           updated_at = NOW()`,
        [
          currentTenantId,
          weekId,
          staffByKey.get(day.staffKey),
          day.date,
          day.availability,
          day.zone,
          day.leaveType,
          day.startTime,
          day.endTime,
          day.notes,
        ],
      );
    }

    await client.query('COMMIT');
    res.json({ roster: await loadWeek(currentTenantId, weekStart) });
  } catch (e) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    const status = /must be|needs|outside|Unknown active/.test(e.message) ? 400 : 500;
    if (status >= 500) console.error('[hr/roster] save error:', e.message);
    res.status(status).json({ error: e.message });
  } finally {
    if (client) client.release();
  }
});

// POST /api/hr/roster/publish — publish an already saved week.
router.post('/publish', requireHrPerm('hr_roster:approve'), async (req, res) => {
  try {
    const weekStart = req.body?.week_start || req.body?.weekStart;
    if (!isIsoDate(weekStart)) return res.status(400).json({ error: 'week_start must be YYYY-MM-DD' });
    const currentTenantId = tenantId(req);
    const actorId = safeUuid(req.identity.userId);

    const existing = await query(
      `SELECT id
         FROM hr_roster_weeks
        WHERE tenant_id = $1 AND week_start = $2
        LIMIT 1`,
      [currentTenantId, weekStart],
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Save the roster draft before publishing' });
    }

    const counts = await query(
      `SELECT COUNT(*)::int AS count
         FROM hr_roster_days
        WHERE tenant_id = $1 AND week_id = $2`,
      [currentTenantId, existing.rows[0].id],
    );
    if ((counts.rows[0]?.count || 0) === 0) {
      return res.status(400).json({ error: 'Roster week has no saved days' });
    }

    await query(
      `UPDATE hr_roster_weeks
          SET status = 'published',
              published_at = NOW(),
              published_by = $3,
              updated_by = $3,
              updated_at = NOW()
        WHERE tenant_id = $1 AND week_start = $2`,
      [currentTenantId, weekStart, actorId],
    );

    res.json({ roster: await loadWeek(currentTenantId, weekStart) });
  } catch (e) {
    console.error('[hr/roster] publish error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
