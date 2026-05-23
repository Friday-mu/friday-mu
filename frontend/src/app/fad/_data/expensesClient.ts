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
  task_id: string;
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
