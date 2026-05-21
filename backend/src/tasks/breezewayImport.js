'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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
  ['watch', 'low'],
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
const DEFAULT_BUNDLE_FILES = {
  summary: 'breezeway-task-summary-export.csv',
  custom: 'breezeway-task-custom-export.csv',
  cost: 'breezeway-task-cost-export.csv',
  payroll: 'breezeway-task-payroll-export.csv',
  supplies: 'breezeway-task-supplies-export.csv',
};
const DEFAULT_POLICY_SKIP_PROPERTY_IDS = new Set(['1099484', '1268645']);
const DEFAULT_POLICY_SKIP_PROPERTY_LABELS = [
  { reason: 'admin_property', pattern: /office\s*\/\s*store\s*\/\s*admin/i },
  { reason: 'aggregate_property', pattern: /^gbh$/i },
];

const TEXT_FIELDS_TO_REDACT = new Set([
  'Task title',
  'Task description',
  'Task summary',
  'Task tags',
  'Cost description',
  'Supply description',
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

function parseNumber(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBooleanish(value) {
  const raw = normalizeKey(value);
  if (!raw) return null;
  if (['yes', 'y', 'true', '1', 'billable'].includes(raw)) return true;
  if (['no', 'n', 'false', '0', 'no charge', 'no charge/internal', 'internal'].includes(raw)) return false;
  return null;
}

function isOwnerCharge(value) {
  const raw = normalizeKey(value);
  return raw.includes('owner') && !raw.includes('no charge') && !raw.includes('internal');
}

function taskIdFromRow(row) {
  return String(row?.['Task ID'] || '').trim();
}

function mapRowsByTaskId(rows) {
  const out = new Map();
  for (const row of rows || []) {
    const taskId = taskIdFromRow(row);
    if (!taskId) continue;
    const list = out.get(taskId) || [];
    list.push(row);
    out.set(taskId, list);
  }
  return out;
}

function policySkipReason(row, options = {}) {
  if (options.skipPolicy === false) return null;
  const propertyId = String(row['Property ID'] || '').trim();
  const propertyLabel = String(row.Property || '').trim();
  const skipIds = new Set([
    ...DEFAULT_POLICY_SKIP_PROPERTY_IDS,
    ...(options.skipPropertyIds || []).map((id) => String(id).trim()).filter(Boolean),
  ]);
  if (skipIds.has(propertyId)) {
    return propertyId === '1268645' ? 'aggregate_property' : 'admin_property';
  }
  for (const { reason, pattern } of DEFAULT_POLICY_SKIP_PROPERTY_LABELS) {
    if (pattern.test(propertyLabel)) return reason;
  }
  return null;
}

function countMapPush(map, value, rowNumber) {
  const key = String(value || '(empty)');
  const entry = map.get(key) || { value: key, count: 0, rows: [] };
  entry.count += 1;
  if (entry.rows.length < 10 && rowNumber) entry.rows.push(rowNumber);
  map.set(key, entry);
}

function extractPropertyCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.toUpperCase().match(/^([A-Z]{1,5}(?:-[A-Z0-9]{1,5}){1,3})(?=\b|\s|$)/);
  return match ? match[1] : null;
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
    policySkippedRows: 0,
    sensitiveRedactions: [],
    formulaEscapes: [],
    sampleTransformedRecords: [],
    supplemental: null,
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

  const propertyCode = extractPropertyCode(row.Property);
  if (propertyCode) return propertyCode;

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

function normalizeCostType(value) {
  const raw = normalizeKey(value);
  if (raw.includes('labor') || raw.includes('labour')) return 'labor';
  if (raw.includes('material') || raw.includes('supply')) return 'material';
  if (raw.includes('tax')) return 'tax';
  if (raw.includes('mileage') || raw.includes('transport')) return 'mileage';
  if (raw.includes('markup')) return 'markup';
  return 'expense';
}

function normalizeSupplyCategory(row) {
  const dept = normalizeKey(row.Department);
  const sub = normalizeKey(row.Subdepartment);
  const name = normalizeKey(row['Supply name']);
  if (dept.includes('clean') || sub.includes('clean')) return 'cleaning';
  if (dept.includes('maintenance') || sub.includes('maintenance')) return 'maintenance';
  if (name.includes('linen') || sub.includes('linen')) return 'linen';
  if (name.includes('soap') || name.includes('shampoo') || name.includes('amenity')) return 'amenity';
  return 'other';
}

function supplementalCustomPayload(row, report) {
  if (!row) return null;
  const totalCostMinor = parseMoneyMinor(row['Total cost']);
  return {
    propertyLabel: safeCell(row.Property, report, row.__rowNumber, 'Property') || null,
    issues: parseNumber(row.Issues),
    comments: parseNumber(row.Comments),
    status: safeCell(row.Status, report, row.__rowNumber, 'Status') || null,
    priority: safeCell(row.Priority, report, row.__rowNumber, 'Priority') || null,
    guestArrivalRating: safeCell(row['Guest arrival rating'], report, row.__rowNumber, 'Guest arrival rating') || null,
    totalCostMinor,
    currency: safeCell(row['Currency (Total cost)'], report, row.__rowNumber, 'Currency (Total cost)').toUpperCase() || null,
    billTo: safeCell(row['Bill to'], report, row.__rowNumber, 'Bill to') || null,
    taskReportLink: safeCell(row['Task report link'], report, row.__rowNumber, 'Task report link') || null,
    raw: sanitizeRawRow(row, report),
  };
}

function costLineFromRow(row, report) {
  const amountMinor = parseMoneyMinor(row['Cost amount']);
  const description = safeCell(row['Cost description'], report, row.__rowNumber, 'Cost description');
  const costType = safeCell(row['Cost type'], report, row.__rowNumber, 'Cost type');
  if (!amountMinor || amountMinor <= 0) return null;
  return {
    type: normalizeCostType(costType),
    amountMinor,
    currencyCode: safeCell(row.Currency, report, row.__rowNumber, 'Currency').toUpperCase() || 'MUR',
    description: [
      description || costType || 'Breezeway task cost',
      `Breezeway cost row ${row.__rowNumber}`,
      row['Cost bill to'] ? `Bill to: ${safeCell(row['Cost bill to'], report, row.__rowNumber, 'Cost bill to')}` : null,
    ].filter(Boolean).join(' · '),
    ownerCharge: isOwnerCharge(row['Cost bill to'] || row['Bill to']),
    sourceRowNumber: row.__rowNumber,
    raw: sanitizeRawRow(row, report),
  };
}

function supplyLineFromRow(row, report) {
  const supplyId = safeCell(row['Supply ID'], report, row.__rowNumber, 'Supply ID');
  const supplyName = safeCell(row['Supply name'], report, row.__rowNumber, 'Supply name');
  const quantity = parseNumber(row['Supply quantity']);
  if (!supplyId || !supplyName || !quantity || quantity <= 0) return null;
  const billable = parseBooleanish(row['Supply is billable']);
  const ownerCharge = billable === true || isOwnerCharge(row['Supply bill to']);
  return {
    supplyId,
    supplyName,
    category: normalizeSupplyCategory(row),
    quantity,
    unit: safeCell(row['Supply unit type'], report, row.__rowNumber, 'Supply unit type') || 'unit',
    locationCode: extractPropertyCode(row.Property) || null,
    unitCostMinor: parseMoneyMinor(row['Supply unit cost'] || row['Supply price']),
    currencyCode: safeCell(row.Currency, report, row.__rowNumber, 'Currency').toUpperCase() || 'MUR',
    ownerCharge,
    sourceRowNumber: row.__rowNumber,
    raw: sanitizeRawRow(row, report),
  };
}

function payrollPayloadRows(rows, report) {
  return (rows || [])
    .filter((row) => ['Assignee', 'Employee ID', 'Rate paid', 'Rate type', 'Default rate', 'Default rate type', 'Estimated time', 'Total time']
      .some((field) => String(row[field] || '').trim()))
    .map((row) => ({
      rowNumber: row.__rowNumber,
      assignee: safeCell(row.Assignee, report, row.__rowNumber, 'Assignee') || null,
      employeeId: safeCell(row['Employee ID'], report, row.__rowNumber, 'Employee ID') || null,
      numberOfPeople: parseNumber(row['Number of people']),
      defaultRateMinor: parseMoneyMinor(row['Default rate']),
      ratePaidMinor: parseMoneyMinor(row['Rate paid']),
      defaultRateType: safeCell(row['Default rate type'], report, row.__rowNumber, 'Default rate type') || null,
      rateType: safeCell(row['Rate type'], report, row.__rowNumber, 'Rate type') || null,
      estimatedMinutes: parseDurationMinutes(row['Estimated time']),
      spentMinutes: parseDurationMinutes(row['Total time']),
      raw: sanitizeRawRow(row, report),
    }));
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

  const policyReason = policySkipReason(row, options);
  if (policyReason) {
    report.policySkippedRows += 1;
    return { skipped: true, reason: policyReason, taskId, externalRef };
  }

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
  const supplemental = options.supplementalByTaskId?.get(taskId) || {};
  const historicalOpen = ['scheduled', 'ready', 'in_progress', 'paused', 'blocked', 'reported'].includes(status);
  const importTags = [
    'breezeway-import',
    'historical-import',
    `breezeway-status:${slug(rawStatus || status)}`,
    rawPriority && !PRIORITY_MAP.has(normalizeKey(rawPriority)) ? `breezeway-priority:${slug(rawPriority)}` : null,
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
  const customPayload = supplementalCustomPayload(supplemental.customRow, report);
  const costLines = (supplemental.costRows || []).map((line) => costLineFromRow(line, report)).filter(Boolean);
  const supplyLines = [
    ...(supplemental.supplyRows || []),
    ...(supplemental.costRows || []).filter((line) => String(line['Supply ID'] || line['Supply name'] || '').trim()),
  ].map((line) => supplyLineFromRow(line, report)).filter(Boolean);
  const payrollRows = payrollPayloadRows(supplemental.payrollRows || [], report);
  if (customPayload || costLines.length > 0 || supplyLines.length > 0 || payrollRows.length > 0) {
    sourcePayload.supplemental = {
      custom: customPayload,
      costLines: costLines.map((line) => line.raw),
      payroll: payrollRows,
      supplies: supplyLines.map((line) => line.raw),
    };
  }

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
    costLines,
    supplyLines,
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

async function insertImportedCostLine(client, tenantId, taskId, actorUserId, line) {
  const existing = await client.query(
    `SELECT id FROM task_costs
     WHERE task_id = $1
       AND tenant_id = $2
       AND type = $3
       AND amount_minor = $4
       AND currency_code = $5
       AND COALESCE(description, '') = COALESCE($6, '')
       AND owner_charge = $7
     LIMIT 1`,
    [taskId, tenantId, line.type, line.amountMinor, line.currencyCode, line.description || null, line.ownerCharge === true],
  );
  if (existing.rows.length > 0) return { inserted: false, id: existing.rows[0].id };
  const { rows } = await client.query(
    `INSERT INTO task_costs (
       task_id, tenant_id, type, amount_minor, currency_code,
       description, added_by_user_id, owner_charge
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      taskId,
      tenantId,
      line.type,
      line.amountMinor,
      line.currencyCode,
      line.description || null,
      actorUserId || null,
      line.ownerCharge === true,
    ],
  );
  return { inserted: true, id: rows[0].id };
}

async function insertImportedSupplyLine(client, tenantId, taskId, actorUserId, line) {
  const existing = await client.query(
    `SELECT id, stock_movement_id
     FROM task_supplies
     WHERE task_id = $1
       AND tenant_id = $2
       AND supply_id = $3
       AND supply_name = $4
       AND quantity = $5::numeric
       AND unit = $6
       AND COALESCE(location_code, '') = COALESCE($7, '')
       AND COALESCE(unit_cost_minor, -1) = COALESCE($8, -1)
       AND currency_code = $9
       AND owner_charge = $10
     LIMIT 1`,
    [
      taskId,
      tenantId,
      line.supplyId,
      line.supplyName,
      line.quantity,
      line.unit,
      line.locationCode || null,
      line.unitCostMinor,
      line.currencyCode,
      line.ownerCharge === true,
    ],
  );
  if (existing.rows.length > 0) return { inserted: false, movementInserted: false, id: existing.rows[0].id };

  const { rows: movementRows } = await client.query(
    `INSERT INTO stock_movements (
       tenant_id, task_id, supply_id, supply_name, location_code,
       quantity_delta, unit, reason, created_by_user_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'task_use', $8)
     RETURNING id`,
    [
      tenantId,
      taskId,
      line.supplyId,
      line.supplyName,
      line.locationCode || null,
      -line.quantity,
      line.unit,
      actorUserId || null,
    ],
  );

  const { rows } = await client.query(
    `INSERT INTO task_supplies (
       task_id, tenant_id, supply_id, supply_name, category,
       quantity, unit, location_code, unit_cost_minor, currency_code,
       owner_charge, stock_movement_id, added_by_user_id
     )
     VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9, $10,
       $11, $12, $13
     )
     RETURNING id`,
    [
      taskId,
      tenantId,
      line.supplyId,
      line.supplyName,
      line.category,
      line.quantity,
      line.unit,
      line.locationCode || null,
      line.unitCostMinor,
      line.currencyCode,
      line.ownerCharge === true,
      movementRows[0].id,
      actorUserId || null,
    ],
  );
  return { inserted: true, movementInserted: true, id: rows[0].id };
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
    insertedCosts: 0,
    skippedCostDuplicates: 0,
    insertedSupplies: 0,
    skippedSupplyDuplicates: 0,
    insertedStockMovements: 0,
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
        if (rows.length > 0) {
          apply.inserted += 1;
          const taskId = rows[0].id;
          for (const line of record.costLines || []) {
            const result = await insertImportedCostLine(client, options.tenantId, taskId, options.actorUserId, line);
            if (result.inserted) apply.insertedCosts += 1;
            else apply.skippedCostDuplicates += 1;
          }
          for (const line of record.supplyLines || []) {
            const result = await insertImportedSupplyLine(client, options.tenantId, taskId, options.actorUserId, line);
            if (result.inserted) apply.insertedSupplies += 1;
            else apply.skippedSupplyDuplicates += 1;
            if (result.movementInserted) apply.insertedStockMovements += 1;
          }
        } else {
          apply.skippedExisting += 1;
        }
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

function readBundleParsed(directory, fileNames = DEFAULT_BUNDLE_FILES, fileTexts = null) {
  if (!directory && !fileTexts) throw new Error('directory or files is required');
  const dir = fileTexts ? 'uploaded-breezeway-bundle' : path.resolve(directory);
  const files = {};
  const parsed = {};
  for (const [kind, fileName] of Object.entries(fileNames)) {
    const uploaded = fileTexts ? fileTexts[kind] : null;
    const csvText = typeof uploaded === 'string'
      ? uploaded
      : (uploaded && typeof uploaded.csvText === 'string' ? uploaded.csvText : null);
    const effectiveFileName = uploaded && typeof uploaded.fileName === 'string' ? uploaded.fileName : fileName;
    const filePath = fileTexts ? effectiveFileName : path.join(dir, fileName);
    if (fileTexts && csvText == null) throw new Error(`Missing ${kind} export text`);
    if (!fileTexts && !fs.existsSync(filePath)) throw new Error(`Missing ${kind} export: ${filePath}`);
    const text = csvText == null ? fs.readFileSync(filePath, 'utf8') : csvText;
    files[kind] = {
      fileName: effectiveFileName,
      path: filePath,
      csvText: text,
    };
    parsed[kind] = parseCsv(text);
  }
  return { dir, files, parsed };
}

function rowHasAny(row, fields) {
  return fields.some((field) => String(row[field] || '').trim().length > 0);
}

function buildCustomRowsByTaskId(summaryRows, customRows) {
  const mismatches = [];
  const byTaskId = new Map();
  const comparedRows = Math.min(summaryRows.length, customRows.length);
  for (let i = 0; i < comparedRows; i += 1) {
    const summary = summaryRows[i];
    const custom = customRows[i];
    const matches = ['Task title', 'Due date', 'Created date', 'Last updated date']
      .every((field) => String(summary[field] || '').trim() === String(custom[field] || '').trim());
    if (!matches && mismatches.length < 25) {
      mismatches.push({
        rowNumber: custom.__rowNumber,
        summaryTaskId: taskIdFromRow(summary),
        summaryTitle: summary['Task title'] || null,
        customTitle: custom['Task title'] || null,
        summaryDueDate: summary['Due date'] || null,
        customDueDate: custom['Due date'] || null,
      });
    }
    const taskId = taskIdFromRow(summary);
    if (taskId) byTaskId.set(taskId, custom);
  }
  return {
    byTaskId,
    report: {
      rows: customRows.length,
      joinStrategy: 'row_order_with_summary_task_id',
      joinable: mismatches.length === 0 && summaryRows.length === customRows.length,
      comparedRows,
      mismatches,
      taskReportLinkRows: customRows.filter((row) => String(row['Task report link'] || '').trim()).length,
      propertyCodeRows: customRows.filter((row) => extractPropertyCode(row.Property)).length,
    },
  };
}

function buildSupplementalByTaskId(parsed) {
  const { byTaskId: customByTaskId, report: customReport } = buildCustomRowsByTaskId(parsed.summary.rows, parsed.custom.rows);
  const costByTaskId = mapRowsByTaskId(parsed.cost.rows);
  const payrollByTaskId = mapRowsByTaskId(parsed.payroll.rows);
  const suppliesByTaskId = mapRowsByTaskId(parsed.supplies.rows);
  const supplementalByTaskId = new Map();

  for (const row of parsed.summary.rows) {
    const taskId = taskIdFromRow(row);
    if (!taskId) continue;
    supplementalByTaskId.set(taskId, {
      customRow: customReport.joinable ? customByTaskId.get(taskId) : null,
      costRows: (costByTaskId.get(taskId) || []).filter((costRow) => rowHasAny(costRow, [
        'Cost type',
        'Cost description',
        'Cost amount',
        'Cost bill to',
        'Supply ID',
        'Supply name',
        'Supply quantity',
        'Supply unit cost',
        'Supply price',
        'Supply bill to',
      ])),
      payrollRows: (payrollByTaskId.get(taskId) || []).filter((payrollRow) => rowHasAny(payrollRow, [
        'Assignee',
        'Employee ID',
        'Rate paid',
        'Rate type',
        'Default rate',
        'Default rate type',
        'Estimated time',
        'Total time',
      ])),
      supplyRows: (suppliesByTaskId.get(taskId) || []).filter((supplyRow) => rowHasAny(supplyRow, [
        'Supply ID',
        'Supply name',
        'Supply quantity',
        'Supply unit cost',
        'Supply total cost',
        'Supply is billable',
        'Supply bill to',
        'Supply total charge',
      ])),
    });
  }

  return {
    supplementalByTaskId,
    report: {
      custom: customReport,
      cost: {
        rows: parsed.cost.rows.length,
        uniqueTaskIds: costByTaskId.size,
        lineRows: [...costByTaskId.values()].reduce((sum, rows) => sum + rows.filter((row) => rowHasAny(row, [
          'Cost type',
          'Cost description',
          'Cost amount',
          'Cost bill to',
          'Supply ID',
          'Supply name',
          'Supply quantity',
          'Supply unit cost',
          'Supply price',
          'Supply bill to',
        ])).length, 0),
      },
      payroll: {
        rows: parsed.payroll.rows.length,
        uniqueTaskIds: payrollByTaskId.size,
        provenanceRows: [...payrollByTaskId.values()].reduce((sum, rows) => sum + rows.filter((row) => rowHasAny(row, [
          'Assignee',
          'Employee ID',
          'Rate paid',
          'Rate type',
          'Default rate',
          'Default rate type',
          'Estimated time',
          'Total time',
        ])).length, 0),
        note: 'Payroll rows are preserved in source_payload; explicit cost export rows are inserted into task_costs.',
      },
      supplies: {
        rows: parsed.supplies.rows.length,
        uniqueTaskIds: suppliesByTaskId.size,
        lineRows: [...suppliesByTaskId.values()].reduce((sum, rows) => sum + rows.filter((row) => rowHasAny(row, [
          'Supply ID',
          'Supply name',
          'Supply quantity',
          'Supply unit cost',
          'Supply total cost',
          'Supply is billable',
          'Supply bill to',
          'Supply total charge',
        ])).length, 0),
      },
    },
  };
}

function attachBundleReport(report, bundle) {
  report.mode = report.apply ? 'bundle_apply' : 'bundle_preview';
  report.sourceDirectory = bundle.dir;
  report.files = Object.fromEntries(Object.entries(bundle.files).map(([kind, file]) => [
    kind,
    {
      fileName: file.fileName,
      path: file.path,
      rows: bundle.parsed[kind].rows.length,
      headers: bundle.parsed[kind].headers,
    },
  ]));
  report.supplemental = bundle.supplementalReport;
  return report;
}

function prepareBundleOptions(options) {
  const fileNames = options.fileNames || DEFAULT_BUNDLE_FILES;
  const fileTexts = options.fileTexts || options.uploadedFiles || null;
  const bundle = readBundleParsed(options.directory || options.dir, fileNames, fileTexts);
  const { supplementalByTaskId, report: supplementalReport } = buildSupplementalByTaskId(bundle.parsed);
  if (options.mode === 'apply' && !supplementalReport.custom.joinable) {
    throw new Error('Custom export row-order validation failed; refusing bundle apply');
  }
  bundle.supplementalReport = supplementalReport;
  return {
    bundle,
    common: {
      ...options,
      csvText: bundle.files.summary.csvText,
      fileName: bundle.files.summary.fileName,
      supplementalByTaskId,
    },
  };
}

async function previewBreezewayBundle(options) {
  const { bundle, common } = prepareBundleOptions(options);
  const { report, records, headers } = await previewBreezewayCsv(common);
  return { report: attachBundleReport(report, bundle), records, headers };
}

async function applyBreezewayBundle(options) {
  if (!options.db) throw new Error('db is required for apply mode');
  if (!options.tenantId) throw new Error('tenantId is required for apply mode');
  const { bundle, common } = prepareBundleOptions({ ...options, mode: 'apply' });
  const report = await applyBreezewayCsv(common);
  return attachBundleReport(report, bundle);
}

module.exports = {
  parseCsv,
  previewBreezewayCsv,
  applyBreezewayCsv,
  previewBreezewayBundle,
  applyBreezewayBundle,
  extractPropertyCode,
};
