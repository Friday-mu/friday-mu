import { apiFetch } from '../../../components/types';

// Expense capture API client — Path A from a Task.
// Mirrors fridayClient.ts / intentClient.ts shape.

export interface ExpenseCategory {
  code: string;
  name: string;
  default_bill_to: string;
  applies_to_path: 'path_a' | 'path_b' | 'both';
  sort_order: number;
}

export interface ParseReceiptResponse {
  extracted: {
    vendor_name: string | null;
    amount: number | null;
    currency: 'MUR' | 'EUR' | 'USD' | null;
    date: string | null;
    category_hint: string | null;
    line_items: Array<{ description: string; amount: number | null }> | null;
    notes: string | null;
  };
  confidence: 'high' | 'medium' | 'low';
  source: string;
  model: string | null;
  durationMs: number;
}

export interface ReceiptUploadInput {
  file_name: string;
  content_type: string;
  base64: string;
  ocr_extracted?: ParseReceiptResponse['extracted'];
}

export interface CreateExpenseInput {
  /** Defaults to 'path_a' server-side. Pass 'path_b' for admin-direct
   *  entry without a task; in that case task_id may be omitted and
   *  property_code is required. */
  entry_mode?: 'path_a' | 'path_b';
  /** Required for path_a; omit for path_b. */
  task_id?: string;
  /** Required for path_b; ignored for path_a (task wins). Can be a
   *  property code like 'VV-47' or the meta code 'OFFICE'. */
  property_code?: string;
  vendor_name?: string;
  vendor_id?: string;
  amount: number;
  currency: 'MUR' | 'EUR' | 'USD';
  category_code: string;
  bill_to?: string;
  description: string;
  labour_hours?: number;
  labour_work_type?: string;
  receipts?: ReceiptUploadInput[];
}

export interface ExpenseRow {
  id: string;
  entry_mode: 'path_a' | 'path_b';
  task_id: string | null;
  property_code: string | null;
  vendor_id: string | null;
  vendor_name_freetext: string | null;
  vendor_canonical_name: string | null;
  vendor_unrecognized: boolean;
  amount_minor: number;
  currency: string;
  category_code: string;
  category_name: string | null;
  bill_to: string;
  bill_to_overridden: boolean;
  description: string;
  labour_hours_numeric: number | null;
  labour_work_type: string | null;
  status: string;
  capturer_user_id: string;
  capturer_name: string | null;
  submitted_at: string;
  approved_at: string | null;
  posted_at: string | null;
  created_at: string;
  receipt_count: number;
}

export function fetchExpenseCategories(path: 'path_a' | 'path_b' = 'path_a'): Promise<{ categories: ExpenseCategory[] }> {
  return apiFetch(`/api/expenses/categories?path=${path}`) as Promise<{ categories: ExpenseCategory[] }>;
}

export function fetchExpensesForTask(taskId: string): Promise<{ expenses: ExpenseRow[] }> {
  return apiFetch(`/api/expenses?task_id=${encodeURIComponent(taskId)}`) as Promise<{ expenses: ExpenseRow[] }>;
}

export function createExpense(input: CreateExpenseInput): Promise<ExpenseRow> {
  return apiFetch('/api/expenses', {
    method: 'POST',
    body: JSON.stringify(input),
  }) as Promise<ExpenseRow>;
}

// ───────────────── Receipt list + content (slice 3d, T4.22) ─────────────────

export interface ReceiptMeta {
  id: string;
  expense_id: string;
  storage_kind: 'inline_base64' | 'do_spaces';
  file_name: string | null;
  content_type: string | null;
  byte_size: number | null;
  sha256_hash: string;
  uploaded_at: string;
  ocr_extracted: ParseReceiptResponse['extracted'] | null;
}

export type ReceiptContent =
  | { kind: 'signed_url'; url: string; ttl_sec: number; file_name: string | null; content_type: string | null; byte_size: number | null }
  | { kind: 'inline_base64'; base64: string; file_name: string | null; content_type: string | null; byte_size: number | null };

export function fetchReceiptsForExpense(expenseId: string): Promise<{ receipts: ReceiptMeta[] }> {
  return apiFetch(`/api/expenses/${encodeURIComponent(expenseId)}/receipts`) as Promise<{ receipts: ReceiptMeta[] }>;
}

export function fetchReceiptContent(receiptId: string): Promise<ReceiptContent> {
  return apiFetch(`/api/expenses/receipts/${encodeURIComponent(receiptId)}/content`) as Promise<ReceiptContent>;
}

/** Materialize the receipt content into a URL the browser can render
 *  (img src, link href, etc.). Returns a data: URL for inline rows and
 *  the signed URL directly for DO Spaces rows. */
export function receiptDisplayUrl(content: ReceiptContent): string {
  if (content.kind === 'signed_url') return content.url;
  const type = content.content_type || 'application/octet-stream';
  return `data:${type};base64,${content.base64}`;
}

export function parseReceipt(input: {
  image_base64: string;
  content_type: string;
  hint?: string;
}): Promise<ParseReceiptResponse> {
  return apiFetch('/api/intent/parse-receipt', {
    method: 'POST',
    body: JSON.stringify(input),
  }) as Promise<ParseReceiptResponse>;
}

// File → base64 helper. Strips the data URL prefix so the backend
// receives raw base64 bytes (matches the receipt_parser contract).
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unexpected FileReader result type'));
        return;
      }
      // result is "data:image/jpeg;base64,XXXXX" — strip the prefix.
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}
