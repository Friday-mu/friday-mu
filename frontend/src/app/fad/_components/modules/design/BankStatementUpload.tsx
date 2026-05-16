'use client';

// MCB CSV parser + upload modal (design-be-24).
//
// CSV-only for v1 — PDF parsing is a v2 task; the user can export MCB
// statements to CSV easily. The parser is a pure function exported
// separately for unit testing.
//
// CSV peculiarities the parser handles:
//   - dates per the tenant's configured date_format (DD/MM/YYYY,
//     MM/DD/YYYY, or YYYY-MM-DD); falls back to DD/MM/YYYY (Mauritius
//     standard) when no format is supplied — see parseDateByFormat
//   - amounts as "1,234.56" (comma thousands, dot decimal)
//   - debit + credit in SEPARATE columns OR a single signed column
//   - column order varies between bank report types; we sniff headers
//
// The parser is conservative: rows that don't have a recognisable date
// or amount are skipped silently. The component surfaces the row-count
// + first-row preview so staff can sanity-check before submit.

import { useMemo, useState } from 'react';
import type { BankCode, BankTransactionInput, CreateBankStatementPayload } from '../../../_data/designClient';
import { useAnnexA } from '../../../_data/useAnnexA';

// ─────────────────────────── Parser ───────────────────────────

export interface ParseResult {
  ok: boolean;
  transactions: BankTransactionInput[];
  error?: string;
  /** Inferred period if dates were found in the CSV. */
  inferred_period_start?: string;
  inferred_period_end?: string;
}

/** Tenant-configurable date layouts the CSV parser understands. */
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

/**
 * Parse a CSV string into BankTransactionInput rows.
 * Handles "1,234.56" amounts, separate debit/credit columns OR signed
 * amount column. Date layout is per the tenant's configured format
 * (defaults to DD/MM/YYYY — Mauritius / EU standard).
 */
export function parseMcbCsv(raw: string, dateFormat: DateFormat = 'DD/MM/YYYY'): ParseResult {
  if (!raw || typeof raw !== 'string') {
    return { ok: false, transactions: [], error: 'Empty input' };
  }
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) {
    return { ok: false, transactions: [], error: 'CSV needs at least a header row and one data row' };
  }

  const header = splitCsvRow(lines[0]).map((h) => h.toLowerCase().trim());
  const cols = sniffColumns(header);
  if (cols.dateIdx < 0) {
    return { ok: false, transactions: [], error: `No date column found. Expected one of: date, posted date, transaction date. Got: ${header.join(', ')}` };
  }
  if (cols.amountIdx < 0 && (cols.debitIdx < 0 || cols.creditIdx < 0)) {
    return { ok: false, transactions: [], error: 'No amount column found. Expected either an "amount" column or separate "debit"/"credit" columns.' };
  }
  if (cols.descIdx < 0) {
    return { ok: false, transactions: [], error: `No descriptor column found. Expected one of: descriptor, description, narration, details. Got: ${header.join(', ')}` };
  }

  const transactions: BankTransactionInput[] = [];
  let minDate: string | undefined;
  let maxDate: string | undefined;

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvRow(lines[i]);
    if (cells.length === 0) continue;

    const dateRaw = cells[cols.dateIdx] || '';
    const isoDate = parseDateByFormat(dateRaw, dateFormat);
    if (!isoDate) continue; // skip malformed rows silently

    const descriptor = (cells[cols.descIdx] || '').trim();
    if (!descriptor) continue;

    let amountMinor: number | null = null;
    if (cols.amountIdx >= 0) {
      amountMinor = parseAmountToMinor(cells[cols.amountIdx] || '');
    } else {
      const debit = parseAmountToMinor(cells[cols.debitIdx] || '');
      const credit = parseAmountToMinor(cells[cols.creditIdx] || '');
      if (debit != null && debit !== 0) amountMinor = -Math.abs(debit);
      else if (credit != null && credit !== 0) amountMinor = Math.abs(credit);
    }
    if (amountMinor == null || amountMinor === 0) continue;

    const reference = cols.refIdx >= 0 ? (cells[cols.refIdx] || '').trim() || null : null;
    const valueDate = cols.valueDateIdx >= 0 ? parseDateByFormat(cells[cols.valueDateIdx] || '', dateFormat) : null;
    const balanceMinor = cols.balanceIdx >= 0 ? parseAmountToMinor(cells[cols.balanceIdx] || '') : null;

    transactions.push({
      posted_date: isoDate,
      value_date: valueDate,
      amount_minor: amountMinor,
      descriptor,
      reference,
      balance_minor: balanceMinor,
    });

    if (!minDate || isoDate < minDate) minDate = isoDate;
    if (!maxDate || isoDate > maxDate) maxDate = isoDate;
  }

  if (transactions.length === 0) {
    return { ok: false, transactions: [], error: 'No valid transactions parsed. Check the date / amount formats.' };
  }

  return {
    ok: true,
    transactions,
    inferred_period_start: minDate,
    inferred_period_end: maxDate,
  };
}

// Split a CSV row, respecting double-quoted cells (which may contain commas).
function splitCsvRow(line: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        buf += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        buf += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(buf);
      buf = '';
    } else {
      buf += c;
    }
  }
  out.push(buf);
  return out;
}

interface ColumnIndices {
  dateIdx: number;
  valueDateIdx: number;
  descIdx: number;
  amountIdx: number;
  debitIdx: number;
  creditIdx: number;
  refIdx: number;
  balanceIdx: number;
}

function sniffColumns(header: string[]): ColumnIndices {
  const idx = (matchers: string[]): number => header.findIndex((h) => matchers.some((m) => h.includes(m)));
  return {
    dateIdx: idx(['posted date', 'transaction date', 'trans date', 'date']),
    valueDateIdx: idx(['value date', 'val date']),
    descIdx: idx(['descriptor', 'description', 'narration', 'details', 'particulars']),
    amountIdx: idx(['amount']),
    debitIdx: idx(['debit']),
    creditIdx: idx(['credit']),
    refIdx: idx(['reference', 'ref no', 'ref.']),
    balanceIdx: idx(['balance']),
  };
}

/**
 * Parse a date string per the tenant's configured `format` and return
 * ISO ("YYYY-MM-DD"). Returns null on failure.
 *
 *   'DD/MM/YYYY' — Mauritius / EU standard (also accepts DD-MM-YYYY)
 *   'MM/DD/YYYY' — US standard (also accepts MM-DD-YYYY)
 *   'YYYY-MM-DD' — ISO
 *
 * As a convenience, an ISO-shaped input always passes through regardless
 * of `format` — banks that mix ISO with their locale format in the same
 * column don't break the parser.
 */
export function parseDateByFormat(raw: string, format: DateFormat = 'DD/MM/YYYY'): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  // ISO first — pass through regardless of `format`.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  if (format === 'YYYY-MM-DD') {
    // ISO-only tenant: anything that isn't ISO was already rejected above.
    return null;
  }
  // DD/MM/YYYY (or -) and MM/DD/YYYY (or -) share the same regex; the
  // only difference is which capture group is day vs. month.
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
  if (!m) return null;
  const first = m[1];
  const second = m[2];
  let y = m[3];
  if (y.length === 2) y = (Number(y) >= 50 ? '19' : '20') + y;
  const d = (format === 'MM/DD/YYYY' ? second : first).padStart(2, '0');
  const mo = (format === 'MM/DD/YYYY' ? first : second).padStart(2, '0');
  if (Number(d) < 1 || Number(d) > 31) return null;
  if (Number(mo) < 1 || Number(mo) > 12) return null;
  return `${y}-${mo}-${d}`;
}

/**
 * Backward-compat alias — old call sites + the existing test suite
 * reference `parseMauritiusDate`. New code should call `parseDateByFormat`.
 * @deprecated Use parseDateByFormat(raw, tenantDateFormat) instead.
 */
export function parseMauritiusDate(raw: string): string | null {
  return parseDateByFormat(raw, 'DD/MM/YYYY');
}

/**
 * Parse "1,234.56" or "(123.45)" or "-50.00" to signed minor units (cents).
 * Empty / unparseable returns null. Parentheses are treated as negative
 * (some bank exports use accounting notation).
 */
export function parseAmountToMinor(raw: string): number | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  let negative = false;
  let body = s;
  if (body.startsWith('(') && body.endsWith(')')) {
    negative = true;
    body = body.slice(1, -1);
  }
  if (body.startsWith('-')) {
    negative = !negative;
    body = body.slice(1);
  }
  // Strip currency symbol, spaces, thousands separators.
  body = body.replace(/[Rr][Ss]\.?\s*/g, '').replace(/[^0-9.]/g, '');
  if (!body) return null;
  const n = Number(body);
  if (!Number.isFinite(n)) return null;
  const minor = Math.round(n * 100);
  return negative ? -minor : minor;
}

// ─────────────────────────── Modal component ───────────────────────────

interface Props {
  projectId: string;
  onSubmit: (payload: CreateBankStatementPayload) => Promise<void>;
  onCancel: () => void;
}

export function BankStatementUpload({ projectId: _projectId, onSubmit, onCancel }: Props) {
  const [accountLabel, setAccountLabel] = useState('MCB Operating');
  const [bankCode, setBankCode] = useState<BankCode>('mcb');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [rawCsv, setRawCsv] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Per-tenant date format. The annex_a payload stores it on the JSONB
  // blob; fall back to DD/MM/YYYY when the row hasn't loaded yet or
  // when the value isn't a recognised format.
  const { data: annexAResp } = useAnnexA();
  const dateFormatRaw = annexAResp?.annex_a?.date_format;
  const dateFormat: DateFormat = (
    dateFormatRaw === 'MM/DD/YYYY' || dateFormatRaw === 'YYYY-MM-DD'
      ? dateFormatRaw
      : 'DD/MM/YYYY'
  );

  const parsed = useMemo(
    () => (rawCsv.trim() ? parseMcbCsv(rawCsv, dateFormat) : null),
    [rawCsv, dateFormat],
  );

  // Inferred period drives the form when the user hasn't typed dates yet.
  const effectiveStart = periodStart || parsed?.inferred_period_start || '';
  const effectiveEnd = periodEnd || parsed?.inferred_period_end || '';

  const canSubmit = !!parsed?.ok
    && accountLabel.trim().length > 0
    && effectiveStart.length > 0
    && effectiveEnd.length > 0
    && !submitting;

  const onFile = async (file: File) => {
    const text = await file.text();
    setRawCsv(text);
  };

  const handleSubmit = async () => {
    if (!parsed?.ok) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit({
        account_label: accountLabel.trim(),
        bank_code: bankCode,
        statement_period_start: effectiveStart,
        statement_period_end: effectiveEnd,
        raw_source_url: null,
        transactions: parsed.transactions,
      });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Upload bank statement"
      data-design-bank-upload
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 50, padding: 16,
      }}
    >
      <div style={{
        background: 'var(--color-background-primary)', borderRadius: 'var(--radius-md)',
        maxWidth: 720, width: '100%', maxHeight: '90vh', overflow: 'auto',
        padding: 20, border: '0.5px solid var(--color-border-secondary)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Upload bank statement</h3>
          <button type="button" onClick={onCancel} style={linkBtn()}>Cancel</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
          <label style={fieldLabel()}>
            Account label
            <input
              value={accountLabel}
              onChange={(e) => setAccountLabel(e.target.value)}
              placeholder='e.g. "MCB Operating"'
              style={inputStyle()}
              data-design-bank-upload-account
            />
          </label>
          <label style={fieldLabel()}>
            Bank
            <select value={bankCode} onChange={(e) => setBankCode(e.target.value as BankCode)} style={inputStyle()}>
              <option value="mcb">MCB</option>
              <option value="maubank">Maubank</option>
            </select>
          </label>
          <label style={fieldLabel()}>
            Period start
            <input
              type="date"
              value={effectiveStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              style={inputStyle()}
              data-design-bank-upload-period-start
            />
          </label>
          <label style={fieldLabel()}>
            Period end
            <input
              type="date"
              value={effectiveEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              style={inputStyle()}
              data-design-bank-upload-period-end
            />
          </label>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          <label style={{ ...fieldLabel(), marginBottom: 4 }}>
            CSV file
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
              style={{ fontSize: 12 }}
              data-design-bank-upload-file
            />
          </label>
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
            or paste raw CSV below — headers required (date, amount/debit/credit, descriptor)
          </span>
        </div>

        <textarea
          rows={6}
          value={rawCsv}
          onChange={(e) => setRawCsv(e.target.value)}
          placeholder={`Posted Date,Value Date,Descriptor,Debit,Credit,Balance\n13/05/2026,13/05/2026,PAYMENT TO COURTS LTD,15000.00,,123456.78`}
          style={{
            ...inputStyle(), resize: 'vertical', width: '100%', fontFamily: 'var(--font-mono-fad)',
            fontSize: 11, minHeight: 100,
          }}
          data-design-bank-upload-textarea
        />

        {parsed && (
          <div style={{ marginTop: 10, fontSize: 11, color: parsed.ok ? 'var(--color-text-success)' : 'var(--color-text-danger)' }}>
            {parsed.ok
              ? `Parsed ${parsed.transactions.length} transactions. Period: ${parsed.inferred_period_start} → ${parsed.inferred_period_end}.`
              : `Parse error: ${parsed.error}`}
          </div>
        )}

        {submitError && (
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--color-text-danger)' }}>
            Upload failed: {submitError}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button type="button" onClick={onCancel} style={secondaryBtn()}>Cancel</button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            style={canSubmit ? primaryBtn() : { ...primaryBtn(), opacity: 0.5, cursor: 'not-allowed' }}
            data-design-bank-upload-submit
          >
            {submitting ? 'Uploading…' : 'Upload + auto-match'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Local styles ───────────────────────────

function fieldLabel(): React.CSSProperties { return { fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', flexDirection: 'column', gap: 4 }; }
function inputStyle(): React.CSSProperties { return { padding: '6px 8px', fontSize: 12, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }; }
function primaryBtn(): React.CSSProperties { return { padding: '8px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--color-brand-accent)', color: '#fff', fontSize: 13, fontWeight: 500 }; }
function secondaryBtn(): React.CSSProperties { return { padding: '8px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)', fontSize: 13 }; }
function linkBtn(): React.CSSProperties { return { padding: 0, background: 'transparent', fontSize: 12, color: 'var(--color-text-tertiary)', textDecoration: 'underline' }; }
