#!/usr/bin/env node
'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../src/database/client');

const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage:
  node backend/scripts/backfill-breezeway-task-assignees.js [--tenant-id <uuid>]
    [--apply --confirm] [--create-missing-users] [--out report.json]

Reads imported source=breezeway tasks, resolves preserved
source_payload.people.assignees into task assignee_user_ids, and links HR staff
to existing users by email. Preview is read-only. Apply only updates tasks with
empty assignee_user_ids unless code is changed deliberately.`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    tenantId: DEFAULT_TENANT_ID,
    apply: false,
    confirm: false,
    createMissingUsers: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') usage(0);
    else if (arg === '--tenant-id') args.tenantId = argv[++i];
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--confirm') args.confirm = true;
    else if (arg === '--create-missing-users') args.createMissingUsers = true;
    else if (arg === '--out') args.out = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!UUID_RE.test(args.tenantId)) throw new Error('--tenant-id must be a UUID');
  if (args.apply && !args.confirm) throw new Error('Apply mode requires --confirm');
  if (args.apply && !process.env.DATABASE_URL) throw new Error('Apply mode requires DATABASE_URL');
  return args;
}

function normalisePerson(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function slug(value) {
  const raw = normalisePerson(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return raw || 'assignee';
}

function addIdentity(map, key, userId) {
  const norm = normalisePerson(key);
  if (!norm || !UUID_RE.test(String(userId || ''))) return;
  if (!map.has(norm)) map.set(norm, userId);
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

async function loadUsersAndStaff(client, tenantId) {
  const users = await client.query(
    `SELECT id, username, email, display_name, role, is_active
     FROM users
     WHERE tenant_id = $1`,
    [tenantId],
  );
  const staff = await client.query(
    `SELECT
       h.id,
       h.user_id,
       h.name,
       h.email,
       h.role,
       h.status,
       u_by_email.id AS email_user_id
     FROM hr_staff h
     LEFT JOIN users u_by_email
       ON u_by_email.tenant_id = h.tenant_id
      AND LOWER(u_by_email.email) = LOWER(h.email)
     WHERE h.tenant_id = $1`,
    [tenantId],
  );
  return { users: users.rows, staff: staff.rows };
}

function buildIdentityMaps(users, staff) {
  const identityByName = new Map();
  const staffByName = new Map();
  const usersByEmail = new Map();

  users.forEach((user) => {
    const id = user.id;
    usersByEmail.set(String(user.email || '').toLowerCase(), user);
    addIdentity(identityByName, user.display_name, id);
    addIdentity(identityByName, user.username, id);
    addIdentity(identityByName, user.email, id);
  });

  staff.forEach((person) => {
    const norm = normalisePerson(person.name);
    if (norm) staffByName.set(norm, person);
    const userId = person.user_id || person.email_user_id;
    if (userId) {
      addIdentity(identityByName, person.name, userId);
      addIdentity(identityByName, person.email, userId);
    }
  });

  return { identityByName, staffByName, usersByEmail };
}

async function loadTasks(client, tenantId) {
  const { rows } = await client.query(
    `SELECT
       id,
       title,
       external_ref,
       assignee_user_ids,
       source_payload #> '{people,assignees}' AS source_assignees
     FROM tasks
     WHERE tenant_id = $1
       AND source = 'breezeway'
       AND jsonb_typeof(source_payload #> '{people,assignees}') = 'array'
     ORDER BY created_at ASC`,
    [tenantId],
  );
  return rows;
}

async function linkHrStaffByEmail(client, tenantId, report) {
  const { rows } = await client.query(
    `UPDATE hr_staff h
       SET user_id = u.id,
           updated_at = NOW()
      FROM users u
      WHERE h.tenant_id = $1
        AND u.tenant_id = h.tenant_id
        AND h.user_id IS NULL
        AND LOWER(h.email) = LOWER(u.email)
      RETURNING h.id, h.name, h.email, u.id AS user_id`,
    [tenantId],
  );
  report.linkedHrStaff = rows;
}

async function createUser(client, tenantId, person, fallbackName) {
  const displayName = person?.name || fallbackName;
  const isStaff = Boolean(person);
  const hash = crypto.createHash('sha1').update(`${tenantId}:${displayName}`).digest('hex').slice(0, 10);
  const email = isStaff && person.email
    ? person.email
    : `bz-${slug(displayName).slice(0, 20)}-${hash}@friday.local`;
  const existing = await client.query(
    `SELECT id FROM users WHERE tenant_id = $1 AND LOWER(email) = LOWER($2) LIMIT 1`,
    [tenantId, email],
  );
  if (existing.rows.length > 0) return { id: existing.rows[0].id, inserted: false, email, displayName };

  const passwordHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
  const { rows } = await client.query(
    `INSERT INTO users (
       username, email, password_hash, role, display_name,
       tenant_id, is_active, must_change_password
     )
     VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7)
     RETURNING id`,
    [
      email,
      email,
      passwordHash,
      'agent',
      displayName,
      tenantId,
      isStaff,
    ],
  );
  return { id: rows[0].id, inserted: true, email, displayName };
}

async function createMissingUsers(client, tenantId, missingNames, staffByName, identityByName, report) {
  for (const name of missingNames) {
    const norm = normalisePerson(name);
    if (!norm || identityByName.has(norm)) continue;
    const staff = staffByName.get(norm);
    const created = await createUser(client, tenantId, staff, name);
    identityByName.set(norm, created.id);
    report.createdUsers.push({
      id: created.id,
      email: created.email,
      displayName: created.displayName,
      kind: staff ? 'hr_staff_inactive_login' : 'inactive_external_assignee',
      inserted: created.inserted,
    });
    if (staff && !staff.user_id) {
      await client.query(
        `UPDATE hr_staff SET user_id = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3`,
        [created.id, tenantId, staff.id],
      );
    }
  }
}

function sourceAssignees(row) {
  return Array.isArray(row.source_assignees)
    ? row.source_assignees.map((name) => String(name || '').trim()).filter(Boolean)
    : [];
}

function buildTaskUpdates(tasks, identityByName) {
  const updates = [];
  const unresolved = new Map();
  let alreadyAssigned = 0;

  tasks.forEach((task) => {
    const existing = Array.isArray(task.assignee_user_ids) ? task.assignee_user_ids.filter(Boolean) : [];
    if (existing.length > 0) {
      alreadyAssigned += 1;
      return;
    }
    const names = sourceAssignees(task);
    const ids = unique(names.map((name) => identityByName.get(normalisePerson(name))).filter(Boolean));
    const missing = names.filter((name) => !identityByName.has(normalisePerson(name)));
    missing.forEach((name) => unresolved.set(name, (unresolved.get(name) || 0) + 1));
    if (ids.length > 0) {
      updates.push({
        id: task.id,
        externalRef: task.external_ref,
        title: task.title,
        names,
        assigneeUserIds: ids,
      });
    }
  });

  return { updates, unresolved, alreadyAssigned };
}

async function applyTaskUpdates(client, tenantId, updates) {
  let updated = 0;
  for (const item of updates) {
    const meta = {
      at: new Date().toISOString(),
      source: 'breezeway-source-payload',
      assignees: item.names,
      version: 1,
    };
    const { rowCount } = await client.query(
      `UPDATE tasks
          SET assignee_user_ids = $2::uuid[],
              assignee_user_id = $3::uuid,
              source_payload = jsonb_set(
                jsonb_set(
                  COALESCE(source_payload, '{}'::jsonb),
                  '{people,resolvedAssigneeUserIds}',
                  to_jsonb($2::uuid[]),
                  true
                ),
                '{fadAssigneeBackfill}',
                $4::jsonb,
                true
              ),
              updated_at = NOW()
        WHERE tenant_id = $5
          AND id = $1
          AND COALESCE(array_length(assignee_user_ids, 1), 0) = 0`,
      [
        item.id,
        item.assigneeUserIds,
        item.assigneeUserIds[0] || null,
        JSON.stringify(meta),
        tenantId,
      ],
    );
    updated += rowCount;
  }
  return updated;
}

async function run(args) {
  const client = await pool.connect();
  const report = {
    mode: args.apply ? 'apply' : 'preview',
    tenantId: args.tenantId,
    createMissingUsers: args.createMissingUsers,
    totalBreezewayTasksWithSourceAssignees: 0,
    tasksAlreadyAssigned: 0,
    distinctSourceAssigneeNames: [],
    linkedHrStaff: [],
    createdUsers: [],
    candidateTaskUpdates: 0,
    appliedTaskUpdates: 0,
    unresolvedAssignees: [],
    sampleUpdates: [],
  };

  try {
    await client.query('BEGIN');
    if (args.apply) {
      await linkHrStaffByEmail(client, args.tenantId, report);
    }

    const { users, staff } = await loadUsersAndStaff(client, args.tenantId);
    const { identityByName, staffByName } = buildIdentityMaps(users, staff);
    const tasks = await loadTasks(client, args.tenantId);
    report.totalBreezewayTasksWithSourceAssignees = tasks.length;

    const distinctNames = unique(tasks.flatMap(sourceAssignees)).sort((a, b) => a.localeCompare(b));
    report.distinctSourceAssigneeNames = distinctNames;
    const missingBeforeCreate = distinctNames.filter((name) => !identityByName.has(normalisePerson(name)));

    if (args.apply && args.createMissingUsers) {
      await createMissingUsers(client, args.tenantId, missingBeforeCreate, staffByName, identityByName, report);
    }

    const { updates, unresolved, alreadyAssigned } = buildTaskUpdates(tasks, identityByName);
    report.tasksAlreadyAssigned = alreadyAssigned;
    report.candidateTaskUpdates = updates.length;
    report.unresolvedAssignees = Array.from(unresolved.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    report.sampleUpdates = updates.slice(0, 15).map((item) => ({
      id: item.id,
      externalRef: item.externalRef,
      title: item.title,
      assignees: item.names,
      assigneeUserIds: item.assigneeUserIds,
    }));

    if (args.apply) {
      report.appliedTaskUpdates = await applyTaskUpdates(client, args.tenantId, updates);
      await client.query('COMMIT');
    } else {
      await client.query('ROLLBACK');
    }
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }

  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await run(args);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) {
    fs.writeFileSync(path.resolve(args.out), json);
    console.log(`Wrote Breezeway assignee backfill ${report.mode} report to ${path.resolve(args.out)}`);
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
