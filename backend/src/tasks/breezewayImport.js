'use strict';

const crypto = require('crypto');

const DEFAULT_SAMPLE_SIZE = 5;
const DEFAULT_TIMEZONE_OFFSET = '+04:00';

const STATUS_MAP = new Map([
  ['not started', 'scheduled'],
  ['todo', 'scheduled'],
  ['scheduled', 'scheduled'],
  ['assigned', 'scheduled'],
  ['started', 'in_progress'],
  ['in progress', 'in_progress'],
  ['in_progress', 'in_progress'],
  ['paused', 'paused'],
  ['blocked', 'blocked'],
  ['finished', 'completed'],
  ['complete', 'completed'],
  ['completed', 'completed'],
  ['closed', 'closed'],
  ['cancelled', 'cancelled'],
  ['canceled', 'cancelled'],
]);

const PRIORITY_MAP = new Map([
  ['lowest', 'lowest'],
  ['low', 'low'],
  ['medium', 'medium'],
  ['normal', 'medium'],
  ['high', 'high'],
  ['urgent', 'urgent'],
  ['emergency', 'urgent'],
]);

const DEPARTMENT_MAP = new Map([
  ['cleaning', 'cleaning'],
  ['housekeeping', 'cleaning'],
  ['inspection', 'inspection'],
  ['maintenance', 'maintenance'],
  ['safety', 'maintenance'],
  ['office', 'office'],
  ['admin', 'office'],
  ['administration', 'office'],
]);

const FORMULA_PREFIX_RE = /^[=+\-@\t\r\n]/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SENSITIVE_TEXT_RE = /\b(wi-?fi|password|passcode|lock\s*box|lockbox|gate\s+code|access\s+code|key\s*safe|keysafe|pin\s+code)\b/i;

const TEXT_FIELDS_TO_REDACT = new Set([
  'Task title',
  'Task description',
  'Task summary',
  'Task tags',
  'Requested by',
  'Created by',
  'Completed by',
]);

function normalizeHeader(value) {
  return String(value || '').replace(/^\uFEFF/, '').trim();
}

function normalizeKey(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function slug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (ch === ',' && !quoted) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !quoted) {
      row.push(cell);
      if (row.some((value) => String(value || '').trim().length > 0)) rows.push(row);
      row = [];
      cell = '';
      if (ch === '\r' && next === '\n') i += 1;
      continue;
    }

    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => String(value || '').trim().length > 0)) rows.push(row);
  }

  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map(normalizeHeader);
  return {
    headers,
    rows: rows.slice(1).map((cells, index) => {
      const out = { __rowNumber: index + 2 };
      headers.forEach((header, colIndex) => {
        out[header] = cells[colIndex] == null ? '' : cells[colIndex];
      });
      return out;
    }),
  };
}

function safeCell(value, report, rowNumber, fieldName) {
  const input = String(value || '').trim();
  if (!input) return '';
  const eventKey = `${rowNumber}:${fieldName}`;

  if (TEXT_FIELDS_TO_REDACT.has(fieldName) && SENSITIVE_TEXT_RE.test(input)) {
    if (!report._redactionKeys.has(eventKey)) {
      report._redactionKeys.add(eventKey);
      report.sensitiveRedactions.push({
        rowNumber,
        field: fieldName,
        reason: 'sensitive operational/access detail',
      });
    }
    return '[redacted: sensitive operational detail]';
  }

  if (FORMULA_PREFIX_RE.test(input)) {
    if (!report._formulaKeys.has(eventKey)) {
      report._formulaKeys.add(eventKey);
      report.formulaEscapes.push({ rowNumber, field: fieldName });
    }
    return `'${input}`;
  }

  return input;
}

function sanitizeRawRow(row, report) {
  const out = {};
  for (const [field, value] of Object.entries(row)) {
    if (field === '__rowNumber') continue;
    out[field] = safeCell(value, report, row.__rowNumber, field);
  }
  return out;
}

function splitList(value) {
  return String(value || '')
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.toLowerCase() !== 'none' && item.toLowerCase() !== 'null');
}

function parseDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const month = slash[1].padStart(2, '0');
    const day = slash[2].padStart(2, '0');
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function parseClock(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  const ampm = match[4]?.toUpperCase();
  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59 || second > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

function timezoneOffset(value) {
  const raw = String(value || '').trim();
  if (!raw) return DEFAULT_TIMEZONE_OFFSET;
  if (/mauritius|indian\/mauritius/i.test(raw)) return '+04:00';
  const explicit = raw.match(/(?:utc|gmt)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?/i);
  if (explicit) {
    return `${explicit[1]}${explicit[2].padStart(2, '0')}:${(explicit[3] || '00').padStart(2, '0')}`;
  }
  return DEFAULT_TIMEZONE_OFFSET;
}

function combineTimestamp(dateValue, timeValue, tzValue) {
  const date = parseDate(dateValue);
  if (!date) return null;
  const time = parseClock(timeValue) || '00:00:00';
  return `${date}T${time}${timezoneOffset(tzValue)}`;
}

function parseDurationMinutes(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parts = raw.split(':').map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  if (parts.length === 3) return Math.round(parts[0] * 60 + parts[1] + parts[2] / 60);
  if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1]);
  if (parts.length === 1) return Math.round(parts[0]);
  return null;
}

function parseMoneyMinor(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;
  const amount = Number(cleaned);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

function countMapPush(map, value, rowNumber) {
  const key = String(value || '(empty)');
  const entry = map.get(key) || { value: key, count: 0, rows: [] };
  entry.count += 1;
  if (entry.rows.length < 10 && rowNumber) entry.rows.push(rowNumber);
  map.set(key, entry);
}

function mapToArray(map) {
  return [...map.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function createReport({ importBatchId, fileName }) {
  return {
    importBatchId,
    fileName: fileName || null,
    totalRows: 0,
    validRows: 0,
    insertableRows: 0,
    duplicates: {
      taskIds: [],
      externalRefs: [],
      existingExternalRefs: [],
    },
    unknownProperties: [],
    unknownAssignees: [],
    unknownStatuses: [],
    unknownPriorities: [],
    unknownDepartments: [],
    emptyCriticalFields: [],
    skippedRows: [],
    sensitiveRedactions: [],
    formulaEscapes: [],
    sampleTransformedRecords: [],
    apply: null,
  };
}

function resolveProperty(row, options, report) {
  const propertyMap = options.propertyMap || {};
  const known = options.knownPropertyCodes || new Set();
  const candidates = [
    row['Property Internal ID'],
    row['Property Marketing ID'],
    row.Property,
    row['Property ID'],
    row['Property Group'],
  ].map((value) => String(value || '').trim()).filter(Boolean);

  for (const candidate of candidates) {
    const normalized = normalizeKey(candidate);
    const mapped = propertyMap[candidate] || propertyMap[normalized] || propertyMap[candidate.toUpperCase()];
    if (mapped) return String(mapped).trim();
    if (known.has(candidate.toUpperCase())) return candidate.toUpperCase();
  }

  if (candidates.length > 0) {
    countMapPush(report._unknownProperties, candidates.join(' | '), row.__rowNumber);
  }
  return null;
}

function resolveUsers(row, options, report) {
  const userMap = options.userMap || {};
  const names = splitList(row.Assignees);
  const externalIds = splitList(row['Assigned Employee IDs']);
  const resolved = [];
  const unresolved = [];
  const max = Math.max(names.length, externalIds.length);

  for (let i = 0; i < max; i += 1) {
    const externalId = externalIds[i] || '';
    const name = names[i] || '';
    const mapped = userMap[externalId]
      || userMap[normalizeKey(externalId)]
      || userMap[name]
      || userMap[normalizeKey(name)];
    if (mapped && UUID_RE.test(String(mapped))) {
      if (!resolved.includes(mapped)) resolved.push(mapped);
    } else if (externalId || name) {
      unresolved.push({ externalId: externalId || null, name: name || null });
    }
  }

  unresolved.forEach((item) => {
    countMapPush(report._unknownAssignees, `${item.externalId || '(no id)'} | ${item.name || '(no name)'}`, row.__rowNumber);
  });

  return { resolved, names, externalIds, unresolved };
}

function transformRow(row, options, report, seenTaskIds, seenExternalRefs, existingExternalRefs) {
  const taskId = safeCell(row['Task ID'], report, row.__rowNumber, 'Task ID');
  if (!taskId) {
    report.emptyCriticalFields.push({ rowNumber: row.__rowNumber, field: 'Task ID' });
    return { skipped: true, reason: 'missing_task_id' };
  }

  const externalRef = `breezeway:${taskId}`;
  if (seenTaskIds.has(taskId)) {
    countMapPush(report._duplicateTaskIds, taskId, row.__rowNumber);
    return { skipped: true, reason: 'duplicate_task_id', taskId, externalRef };
  }
  if (seenExternalRefs.has(externalRef)) {
    countMapPush(report._duplicateExternalRefs, externalRef, row.__rowNumber);
    return { skipped: true, reason: 'duplicate_external_ref', taskId, externalRef };
  }
  seenTaskIds.add(taskId);
  seenExternalRefs.add(externalRef);

  if (existingExternalRefs.has(externalRef)) {
    countMapPush(report._existingExternalRefs, externalRef, row.__rowNumber);
    return { skipped: true, reason: 'existing_external_ref', taskId, externalRef };
  }

  const rawStatus = safeCell(row.Status, report, row.__rowNumber, 'Status');
  const status = STATUS_MAP.get(normalizeKey(rawStatus));
  if (!status) {
    countMapPush(report._unknownStatuses, rawStatus || '(empty)', row.__rowNumber);
    return { skipped: true, reason: 'unknown_status', taskId, externalRef };
  }

  const rawPriority = safeCell(row.Priority, report, row.__rowNumber, 'Priority');
  const priority = PRIORITY_MAP.get(normalizeKey(rawPriority)) || 'medium';
  if (rawPriority && !PRIORITY_MAP.has(normalizeKey(rawPriority))) {
    countMapPush(report._unknownPriorities, rawPriority, row.__rowNumber);
  }

  const rawDepartment = safeCell(row.Department, report, row.__rowNumber, 'Department');
  const department = DEPARTMENT_MAP.get(normalizeKey(rawDepartment)) || null;
  if (rawDepartment && !department) {
    countMapPush(report._unknownDepartments, rawDepartment, row.__rowNumber);
  }

  const title = safeCell(row['Task title'], report, row.__rowNumber, 'Task title') || `Breezeway task ${taskId}`;
  if (!String(row['Task title'] || '').trim()) {
    report.emptyCriticalFields.push({ rowNumber: row.__rowNumber, field: 'Task title' });
  }

  const taskDescription = safeCell(row['Task description'], report, row.__rowNumber, 'Task description');
  const taskSummary = safeCell(row['Task summary'], report, row.__rowNumber, 'Task summary');
  const requestedBy = safeCell(row['Requested by'], report, row.__rowNumber, 'Requested by');
  const createdBy = safeCell(row['Created by'], report, row.__rowNumber, 'Created by');
  const completedBy = safeCell(row['Completed by'], report, row.__rowNumber, 'Completed by');
  const tags = splitList(safeCell(row['Task tags'], report, row.__rowNumber, 'Task tags'));
  const propertyCode = resolveProperty(row, options, report);
  const users = resolveUsers(row, options, report);
  const propertyTz = row['Property Time Zone'];
  const sourceCreatedAt = combineTimestamp(row['Created date'], row['Created time'], propertyTz);
  const sourceUpdatedAt = combineTimestamp(row['Last updated date'], '', propertyTz);
  const sourceStartedAt = combineTimestamp(row['Started date'], row['Started time'], propertyTz);
  const sourceDueAt = combineTimestamp(row['Due date'], row['Due time'], propertyTz);
  const sourceCompletedAt = combineTimestamp(row['Completed date'], row['Completed time'], propertyTz);
  const dueDate = parseDate(row['Due date']);
  const dueTime = parseClock(row['Due time']);
  const spentMinutes = parseDurationMinutes(row['Total time']);
  const estimatedMinutes = parseDurationMinutes(row['Estimated time']);
  const totalCostMinor = parseMoneyMinor(row['Total cost']);
  const ratePaidMinor = parseMoneyMinor(row['Rate paid']);
  const currency = safeCell(row.Currency, report, row.__rowNumber, 'Currency').toUpperCase() || null;
  const subdepartment = row.Subdepartment ? slug(row.Subdepartment) || null : null;
  const historicalOpen = ['scheduled', 'ready', 'in_progress', 'paused', 'blocked', 'reported'].includes(status);
  const importTags = [
    'breezeway-import',
    'historical-import',
    `breezeway-status:${slug(rawStatus || status)}`,
    historicalOpen ? 'historical-open' : null,
    ...tags,
  ].filter(Boolean);

  const descriptionParts = [];
  if (taskDescription) descriptionParts.push(taskDescription);
  if (taskSummary) descriptionParts.push(`Summary: ${taskSummary}`);
  descriptionParts.push(`Imported from Breezeway task ${taskId}.`);

  const sourcePayload = {
    provider: 'breezeway',
    importBatchId: options.importBatchId,
    taskId,
    externalRef,
    originalStatus: rawStatus || null,
    originalPriority: rawPriority || null,
    property: {
      name: safeCell(row.Property, report, row.__rowNumber, 'Property') || null,
      breezewayId: safeCell(row['Property ID'], report, row.__rowNumber, 'Property ID') || null,
      marketingId: safeCell(row['Property Marketing ID'], report, row.__rowNumber, 'Property Marketing ID') || null,
      internalId: safeCell(row['Property Internal ID'], report, row.__rowNumber, 'Property Internal ID') || null,
      group: safeCell(row['Property Group'], report, row.__rowNumber, 'Property Group') || null,
      timezone: safeCell(row['Property Time Zone'], report, row.__rowNumber, 'Property Time Zone') || null,
      resolvedCode: propertyCode,
    },
    people: {
      assignees: users.names,
      assignedEmployeeIds: users.externalIds,
      unresolvedAssignees: users.unresolved,
      completedBy: completedBy || null,
      requestedBy: requestedBy || null,
      createdBy: createdBy || null,
    },
    time: {
      totalTime: safeCell(row['Total time'], report, row.__rowNumber, 'Total time') || null,
      estimatedTime: safeCell(row['Estimated time'], report, row.__rowNumber, 'Estimated time') || null,
      sourceCreatedAt,
      sourceUpdatedAt,
      sourceStartedAt,
      sourceDueAt,
      sourceCompletedAt,
    },
    cost: {
      ratePaidMinor,
      rateType: safeCell(row['Rate type'], report, row.__rowNumber, 'Rate type') || null,
      totalCostMinor,
      currency,
      billTo: safeCell(row['Bill to'], report, row.__rowNumber, 'Bill to') || null,
    },
    raw: sanitizeRawRow(row, report),
  };

  return {
    rowNumber: row.__rowNumber,
    taskId,
    externalRef,
    bzId: taskId,
    title,
    description: descriptionParts.filter(Boolean).join('\n\n'),
    status,
    priority,
    department,
    subdepartment,
    propertyCode,
    assigneeUserIds: users.resolved,
    dueDate,
    dueTime: dueTime ? dueTime.slice(0, 5) : null,
    estimatedMinutes,
    spentMinutes,
    completedAt: status === 'completed' || status === 'closed' ? sourceCompletedAt : null,
    sourceCreatedAt,
    sourceUpdatedAt,
    sourceStartedAt,
    sourceDueAt,
    sourceCompletedAt,
    tags: importTags,
    sourcePayload,
    sample: {
      rowNumber: row.__rowNumber,
      externalRef,
      bzId: taskId,
      title,
      status,
      priority,
      department,
      subdepartment,
      propertyCode,
      dueDate,
      dueTime: dueTime ? dueTime.slice(0, 5) : null,
      assigneeCount: users.resolved.length,
      unresolvedAssigneeCount: users.unresolved.length,
      sourceCompletedAt,
      totalCostMinor,
      currency,
    },
  };
}

async function loadExistingExternalRefs(db, tenantId, refs) {
  if (!db || !tenantId || refs.length === 0) return new Set();
  const { rows } = await db.query(
    `SELECT external_ref
     FROM tasks
     WHERE tenant_id = $1
       AND external_ref = ANY($2)
       AND status <> 'cancelled'`,
    [tenantId, refs],
  );
  return new Set(rows.map((row) => row.external_ref));
}

async function loadKnownPropertyCodes(db, tenantId) {
  const codes = new Set();
  if (!db || !tenantId) return codes;
  try {
    const { rows } = await db.query(
      `SELECT DISTINCT UPPER(property_code) AS code
       FROM tasks
       WHERE tenant_id = $1 AND property_code IS NOT NULL AND property_code <> ''`,
      [tenantId],
    );
    rows.forEach((row) => row.code && codes.add(row.code));
  } catch (_) {
    // Preview should still work without a live DB or property table.
  }
  return codes;
}

function initInternalMaps(report) {
  report._duplicateTaskIds = new Map();
  report._duplicateExternalRefs = new Map();
  report._existingExternalRefs = new Map();
  report._unknownProperties = new Map();
  report._unknownAssignees = new Map();
  report._unknownStatuses = new Map();
  report._unknownPriorities = new Map();
  report._unknownDepartments = new Map();
  report._redactionKeys = new Set();
  report._formulaKeys = new Set();
}

function finalizeReport(report) {
  report.duplicates.taskIds = mapToArray(report._duplicateTaskIds);
  report.duplicates.externalRefs = mapToArray(report._duplicateExternalRefs);
  report.duplicates.existingExternalRefs = mapToArray(report._existingExternalRefs);
  report.unknownProperties = mapToArray(report._unknownProperties);
  report.unknownAssignees = mapToArray(report._unknownAssignees);
  report.unknownStatuses = mapToArray(report._unknownStatuses);
  report.unknownPriorities = mapToArray(report._unknownPriorities);
  report.unknownDepartments = mapToArray(report._unknownDepartments);
  delete report._duplicateTaskIds;
  delete report._duplicateExternalRefs;
  delete report._existingExternalRefs;
  delete report._unknownProperties;
  delete report._unknownAssignees;
  delete report._unknownStatuses;
  delete report._unknownPriorities;
  delete report._unknownDepartments;
  delete report._redactionKeys;
  delete report._formulaKeys;
  return report;
}

async function previewBreezewayCsv(options) {
  const importBatchId = options.importBatchId || `breezeway-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
  const parsed = parseCsv(options.csvText || '');
  const report = createReport({ importBatchId, fileName: options.fileName });
  initInternalMaps(report);
  report.totalRows = parsed.rows.length;

  const refs = parsed.rows
    .map((row) => String(row['Task ID'] || '').trim())
    .filter(Boolean)
    .map((taskId) => `breezeway:${taskId}`);
  const existingExternalRefs = await loadExistingExternalRefs(options.db, options.tenantId, refs);
  const knownPropertyCodes = new Set([
    ...[...(options.knownPropertyCodes || [])].map((code) => String(code).toUpperCase()),
    ...[...(await loadKnownPropertyCodes(options.db, options.tenantId))],
  ]);

  const records = [];
  const seenTaskIds = new Set();
  const seenExternalRefs = new Set();
  const sampleSize = Number.isFinite(options.sampleSize) ? options.sampleSize : DEFAULT_SAMPLE_SIZE;
  const transformOptions = {
    ...options,
    importBatchId,
    knownPropertyCodes,
  };

  for (const row of parsed.rows) {
    const record = transformRow(row, transformOptions, report, seenTaskIds, seenExternalRefs, existingExternalRefs);
    if (record.skipped) {
      report.skippedRows.push({
        rowNumber: row.__rowNumber,
        taskId: record.taskId || null,
        externalRef: record.externalRef || null,
        reason: record.reason,
      });
      continue;
    }
    records.push(record);
    report.validRows += 1;
    if (report.sampleTransformedRecords.length < sampleSize) {
      report.sampleTransformedRecords.push(record.sample);
    }
  }

  report.insertableRows = records.length;
  return { report: finalizeReport(report), records, headers: parsed.headers };
}

async function applyBreezewayCsv(options) {
  if (!options.db) throw new Error('db is required for apply mode');
  if (!options.tenantId) throw new Error('tenantId is required for apply mode');

  const preview = await previewBreezewayCsv(options);
  const client = await options.db.connect();
  const apply = {
    inserted: 0,
    skippedExisting: preview.report.duplicates.existingExternalRefs.reduce((sum, item) => sum + item.count, 0),
    failed: 0,
    errors: [],
  };

  try {
    await client.query('BEGIN');
    for (const record of preview.records) {
      try {
        const { rows } = await client.query(
          `INSERT INTO tasks (
             tenant_id, bz_id, external_ref, title, description,
             status, priority, source, visibility,
             department, subdepartment, property_code,
             created_by_user_id, assignee_user_id, assignee_user_ids,
             due_date, due_time, estimated_minutes, spent_minutes,
             is_recurring, template, awaiting_human_approval, tags,
             import_batch_id, source_payload,
             source_created_at, source_updated_at, source_started_at,
             source_due_at, source_completed_at, completed_at
           )
           VALUES (
             $1, $2, $3, $4, $5,
             $6, $7, 'breezeway', 'team',
             $8, $9, $10,
             $11, $12, $13,
             $14, $15, $16, $17,
             FALSE, NULL, FALSE, $18,
             $19, $20::jsonb,
             $21, $22, $23,
             $24, $25, $26
           )
           ON CONFLICT (tenant_id, external_ref)
             WHERE external_ref IS NOT NULL AND status <> 'cancelled'
           DO NOTHING
           RETURNING id`,
          [
            options.tenantId,
            record.bzId,
            record.externalRef,
            record.title,
            record.description || null,
            record.status,
            record.priority,
            record.department,
            record.subdepartment,
            record.propertyCode,
            options.actorUserId || null,
            record.assigneeUserIds[0] || null,
            record.assigneeUserIds,
            record.dueDate,
            record.dueTime,
            record.estimatedMinutes,
            record.spentMinutes,
            record.tags,
            preview.report.importBatchId,
            JSON.stringify(record.sourcePayload),
            record.sourceCreatedAt,
            record.sourceUpdatedAt,
            record.sourceStartedAt,
            record.sourceDueAt,
            record.sourceCompletedAt,
            record.completedAt,
          ],
        );
        if (rows.length > 0) apply.inserted += 1;
        else apply.skippedExisting += 1;
      } catch (error) {
        apply.failed += 1;
        apply.errors.push({
          rowNumber: record.rowNumber,
          externalRef: record.externalRef,
          error: error.message,
        });
      }
    }

    if (apply.failed > 0) {
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
    }
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }

  preview.report.apply = {
    ...apply,
    committed: apply.failed === 0,
  };
  return preview.report;
}

module.exports = {
  parseCsv,
  previewBreezewayCsv,
  applyBreezewayCsv,
};
