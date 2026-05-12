'use strict';

// Notification helpers — writes into GMS's existing `notifications` table
// so HR events show up alongside guest-message notifications in the bell.
//
// The notifications table is owned by GMS. We don't ALTER it; we just
// INSERT rows with type='hr_*' so they're recognized as HR events on the
// reading side. GMS's bell ignores types it doesn't know — safe.
//
// Tenant isolation: GMS's notifications table has RLS enforced via
// `app.current_tenant`. We set it via SET LOCAL inside a transaction
// before inserting.

const { pool } = require('../database/client');

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

/** Returns the user IDs of everyone holding hr_time_off:approve. For v1,
 *  that's anyone with role='admin' or role='director' in the GMS users
 *  table. Future: read from a dedicated permissions table. */
async function findTimeOffApprovers() {
  const { rows } = await pool.query(
    `SELECT id, display_name FROM users
     WHERE role IN ('admin', 'director') AND is_active = true`,
  );
  return rows;
}

/** Insert one notification per recipient. Uses a transaction with the
 *  tenant SET LOCAL so the RLS policy admits the inserts. Failures are
 *  logged but don't throw — a missed notification is bad UX, not a
 *  data-integrity problem. */
async function createNotifications(recipients, payload) {
  if (!Array.isArray(recipients) || recipients.length === 0) return 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.current_tenant = '${DEFAULT_TENANT_ID}'`);
    let n = 0;
    for (const r of recipients) {
      if (!r?.id) continue;
      await client.query(
        `INSERT INTO notifications (user_id, type, title, subtitle, preview, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [r.id, payload.type, payload.title, payload.subtitle || null, payload.preview || null, DEFAULT_TENANT_ID],
      );
      n++;
    }
    await client.query('COMMIT');
    return n;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.warn('[hr/notifications] insert failed:', e.message);
    return 0;
  } finally {
    client.release();
  }
}

module.exports = {
  findTimeOffApprovers,
  createNotifications,
};
