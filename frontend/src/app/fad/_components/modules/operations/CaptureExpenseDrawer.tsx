'use client';

// Path A capture form — opened from TaskDetail when the operator clicks
// "Capture expense". Locked design Notion 34e43ca8849281fa8085f120b211c689.
// Slice 2 of expense-capture work (Ishant ask 2026-05-23).
//
// Receipt photo → parse-receipt LLM (Gemini 3.5 Flash) → pre-fills the
// form fields. Operator reviews + adjusts + submits. The submit POSTs
// to /api/expenses with the receipts inline (base64). DO Spaces lands
// in slice 3.

import { useEffect, useMemo, useState } from 'react';
import type { Task } from '../../../_data/tasks';
import { TASK_PROPERTIES } from '../../../_data/tasks';
import {
  createExpense,
  fetchExpenseCategories,
  fileToBase64,
  parseReceipt,
  type ExpenseCategory,
  type ParseReceiptResponse,
  type ReceiptUploadInput,
} from '../../../_data/expensesClient';
import { useHydratePropertiesFromGuesty } from '../../../_data/propertiesClient';
import { fireToast } from '../../Toaster';
import { IconClose, IconPlus, IconSparkle } from '../../icons';

interface Props {
  open: boolean;
  /** Path A: caller passes the task — property is locked from task.
   *  Path B: caller passes `null` (or omits) — drawer shows a property
   *  picker (TASK_PROPERTIES + 'OFFICE' meta) and the operator chooses.
   *  Both modes hit POST /api/expenses with the right `entry_mode`. */
  task?: Task | null;
  onClose: () => void;
  onCreated: () => void;
}

type Currency = 'MUR' | 'EUR' | 'USD';
const CURRENCIES: Currency[] = ['MUR', 'EUR', 'USD'];

// Approval-tier thresholds (MUR-denominated, minor units = cents).
// Matches the existing breezeway.ts FINANCE_THRESHOLD_MINOR (500_000 = Rs 5k)
// and the locked design Notion 34e43ca8849281fa8085f120b211c689.
//   ≤ Rs 5,000   → routine        green — auto-approved on submit
//   ≤ Rs 100,000 → medium         amber — owner approval, 24h auto
//   > Rs 100,000 → major          red   — owner pre-approval required
const TIER_ROUTINE_MAX_MINOR = 500_000;
const TIER_MEDIUM_MAX_MINOR = 10_000_000;

type ApprovalTier = 'routine' | 'medium' | 'major';

function approvalTierFor(amountMinor: number): ApprovalTier {
  if (amountMinor <= TIER_ROUTINE_MAX_MINOR) return 'routine';
  if (amountMinor <= TIER_MEDIUM_MAX_MINOR) return 'medium';
  return 'major';
}

function tierMeta(tier: ApprovalTier): { color: 'green' | 'amber' | 'red'; label: string; hint: string } {
  if (tier === 'routine') return { color: 'green', label: 'Auto-approved', hint: 'Posts immediately on submit.' };
  if (tier === 'medium') return { color: 'amber', label: 'Owner approval', hint: '24h auto-approve window after submit.' };
  return { color: 'red', label: 'Owner pre-approval required', hint: 'No auto-approve — owner must approve first.' };
}

// Pretty-print a category_hint from the LLM by best-effort matching it
// to a known FR code. Falls back to the first category if nothing
// matches; the operator can re-pick.
function pickCategoryFromHint(hint: string, categories: ExpenseCategory[]): string | null {
  const h = hint.toLowerCase();
  const score = (c: ExpenseCategory) => {
    const n = c.name.toLowerCase();
    if (h === n) return 100;
    if (n.split(/[ /]/).some((tok) => h.includes(tok) || tok.includes(h))) return 60;
    return 0;
  };
  const ranked = categories
    .map((c) => ({ c, s: score(c) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  return ranked[0]?.c.code || null;
}

export function CaptureExpenseDrawer({ open, task, onClose, onCreated }: Props) {
  // Mode derived from the presence of a task. Path A locks property from
  // the task; Path B exposes a property picker (incl. an OFFICE meta).
  const mode: 'path_a' | 'path_b' = task ? 'path_a' : 'path_b';
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [vendorName, setVendorName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('MUR');
  const [categoryCode, setCategoryCode] = useState('');
  const [billTo, setBillTo] = useState('internal_fr');
  const [description, setDescription] = useState('');
  const [labourMode, setLabourMode] = useState(false);
  const [labourHours, setLabourHours] = useState('');
  const [labourWorkType, setLabourWorkType] = useState('');
  const [pendingReceipts, setPendingReceipts] = useState<ReceiptUploadInput[]>([]);
  const [ocrThinking, setOcrThinking] = useState(false);
  const [ocrConfidence, setOcrConfidence] = useState<ParseReceiptResponse['confidence'] | null>(null);
  const [ocrNotes, setOcrNotes] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Path B: operator picks a property (or 'OFFICE' meta for non-property spend).
  const [pickedPropertyCode, setPickedPropertyCode] = useState<string>('');
  // Path B needs PROPERTIES populated (TASK_PROPERTIES is a derived shim of
  // PROPERTIES + OFFICE meta). If the operator opens "Capture expense" from
  // Finance without visiting Properties first, PROPERTIES is empty and the
  // dropdown only shows OFFICE — Franny reported this 2026-05-23 (feedback
  // 77914bf2). Hydrating here ensures the property list is populated
  // regardless of entry point. `rev` increments on successful hydrate so we
  // include it in dependency arrays / useMemo keys downstream that read
  // the TASK_PROPERTIES array (PROPERTIES is mutated in place, so without
  // `rev` consumers wouldn't re-render after the API replaces the array).
  const { rev: propertiesRev } = useHydratePropertiesFromGuesty();
  // Memoised list of pickable properties for Path B (excludes the OFFICE
  // meta — surfaced above with a clearer label). Re-derives when the
  // Guesty hydrate completes (propertiesRev increments).
  const availableProperties = useMemo(
    () => TASK_PROPERTIES.filter((p) => p.code !== 'OFFICE'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [propertiesRev],
  );

  // Property context. Path A pulls from task (locked). Path B uses
  // operator's pick; 'OFFICE' is a meta code for non-property spend
  // (admin / store / overhead) that backend validates via asPropertyCode.
  const propertyCode = mode === 'path_a' ? (task?.propertyCode || '') : pickedPropertyCode;
  const propertyMeta = useMemo(
    () => TASK_PROPERTIES.find((p) => p.code === propertyCode),
    [propertyCode],
  );

  // Reset on open + load categories. Fires in both modes — Path A keys
  // on task.id (re-fires per task), Path B keys on open (re-fires per
  // drawer open).
  useEffect(() => {
    if (!open) return;
    setVendorName('');
    setAmount('');
    setCurrency('MUR');
    setCategoryCode('');
    setBillTo('internal_fr');
    setDescription('');
    setLabourMode(false);
    setLabourHours('');
    setLabourWorkType('');
    setPendingReceipts([]);
    setOcrConfidence(null);
    setOcrNotes(null);
    setError(null);
    setPickedPropertyCode('');
    let cancelled = false;
    fetchExpenseCategories(mode)
      .then((res) => {
        if (cancelled) return;
        setCategories(res.categories);
        if (res.categories.length > 0 && !categoryCode) {
          setCategoryCode(res.categories[0].code);
          setBillTo(res.categories[0].default_bill_to);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setCategoriesError(e instanceof Error ? e.message : 'Failed to load categories');
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id, mode]);

  // When operator picks a category, reset bill-to to its default unless
  // they've manually overridden it (we'd need a flag to track that —
  // for now bill-to silently follows the category default; the audit
  // bit on submit captures whether it differs).
  useEffect(() => {
    const cat = categories.find((c) => c.code === categoryCode);
    if (cat) setBillTo(cat.default_bill_to);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryCode]);

  const onReceiptFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setOcrThinking(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        if (pendingReceipts.length >= 4) {
          fireToast('Max 4 receipts per expense.');
          break;
        }
        const base64 = await fileToBase64(file);
        // Fire parse-receipt only on the FIRST receipt — subsequent
        // ones are just attachments (multi-receipt for estimate + final
        // invoice, per locked design).
        let ocr: ParseReceiptResponse['extracted'] | undefined;
        let confidence: ParseReceiptResponse['confidence'] | null = null;
        if (pendingReceipts.length === 0) {
          try {
            const res = await parseReceipt({
              image_base64: base64,
              content_type: file.type || 'image/jpeg',
              hint: propertyMeta ? `Receipt for task at ${propertyMeta.code} (${propertyMeta.name}).` : undefined,
            });
            ocr = res.extracted;
            confidence = res.confidence;
            setOcrConfidence(confidence);
            setOcrNotes(res.extracted.notes || null);
            // Pre-fill form fields the operator hasn't touched yet.
            if (ocr.vendor_name && !vendorName) setVendorName(ocr.vendor_name);
            if (ocr.amount != null && !amount) setAmount(String(ocr.amount));
            if (ocr.currency) setCurrency(ocr.currency);
            if (ocr.category_hint && !categoryCode) {
              const pick = pickCategoryFromHint(ocr.category_hint, categories);
              if (pick) setCategoryCode(pick);
            }
            if (ocr.line_items && ocr.line_items.length > 0 && !description) {
              setDescription(ocr.line_items.map((li) => li.description).join(', '));
            }
          } catch (e) {
            // OCR failure is non-fatal — operator can fill manually.
            // T1.17 (2026-05-25): surface the failure visibly so the
            // operator knows the auto-fill didn't run — previously it
            // failed silently, looking like "nothing happened".
            const msg = e instanceof Error ? e.message : 'unknown error';
            setOcrNotes(`Auto-fill unavailable: ${msg}`);
            fireToast(`Receipt OCR failed — fill the form manually. (${msg.slice(0, 60)})`);
            console.warn('[CaptureExpense] parseReceipt failed:', e);
          }
        }
        setPendingReceipts((prev) => [
          ...prev,
          { file_name: file.name, content_type: file.type || 'image/jpeg', base64, ocr_extracted: ocr },
        ]);
      }
    } finally {
      setOcrThinking(false);
    }
  };

  const removeReceipt = (idx: number) => {
    setPendingReceipts((prev) => prev.filter((_, i) => i !== idx));
  };

  const validation = useMemo(() => {
    const issues: string[] = [];
    if (mode === 'path_b' && !pickedPropertyCode) {
      issues.push('Pick a property (or Office / Admin).');
    }
    if (!categoryCode) issues.push('Pick a category.');
    if (!amount.trim() || !(Number(amount) > 0)) issues.push('Enter the amount.');
    if (!description.trim()) issues.push('Enter a description.');
    if (!labourMode && !vendorName.trim() && pendingReceipts.length === 0) {
      issues.push('Enter the vendor name or upload a receipt.');
    }
    if (labourMode && !(Number(labourHours) > 0)) issues.push('Enter the labour hours.');
    return issues;
  }, [amount, categoryCode, description, labourHours, labourMode, mode, pendingReceipts.length, pickedPropertyCode, vendorName]);

  const submit = async () => {
    if (validation.length > 0) {
      setError(validation.join(' '));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createExpense({
        entry_mode: mode,
        ...(mode === 'path_a' && task ? { task_id: task.id } : {}),
        ...(mode === 'path_b' ? { property_code: pickedPropertyCode } : {}),
        vendor_name: vendorName.trim() || undefined,
        amount: Number(amount),
        currency,
        category_code: categoryCode,
        bill_to: billTo,
        description: description.trim(),
        labour_hours: labourMode ? Number(labourHours) : undefined,
        labour_work_type: labourMode ? labourWorkType.trim() || undefined : undefined,
        receipts: pendingReceipts,
      });
      fireToast('Expense captured.');
      onCreated();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Capture failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fad-drawer-overlay open" onClick={onClose} />
      <aside className="fad-drawer open fin-capture-drawer" style={{ maxWidth: 560 }}>
        <div className="fad-drawer-header">
          <div className="fad-drawer-title">
            {mode === 'path_a' ? 'Capture expense' : 'Capture expense · Admin direct'}
          </div>
          <button className="fad-util-btn" onClick={onClose} title="Close" style={{ marginLeft: 'auto' }}>
            <IconClose />
          </button>
        </div>
        <div className="fad-drawer-body ops-create-body">
          {mode === 'path_a' && task ? (
            <div className="ops-form-alert neutral">
              Linked to task: <strong>{task.title}</strong>
              {propertyMeta && <> · <span className="mono">{propertyMeta.code}</span> · {propertyMeta.name}</>}
            </div>
          ) : (
            <section className="ops-form-section">
              <div className="ops-form-section-title">Property</div>
              <label className="ops-form-field">
                <span>Property</span>
                <select
                  value={pickedPropertyCode}
                  onChange={(e) => setPickedPropertyCode(e.target.value)}
                >
                  <option value="">— pick a property —</option>
                  <option value="OFFICE">Office / Store / Admin (no property)</option>
                  {availableProperties.map((p) => (
                    <option key={p.code} value={p.code}>{p.code} · {p.name}</option>
                  ))}
                </select>
              </label>
            </section>
          )}

          {categoriesError && <div className="ops-form-alert failed">{categoriesError}</div>}

          {/* Receipt step — first, because OCR pre-fills the rest. */}
          <section className="ops-form-section ops-quickfill-section">
            <div className="ops-form-section-title">
              <IconSparkle size={12} /> Receipt
            </div>
            <label className="ops-evidence-pick">
              <input
                type="file"
                accept="image/*,.pdf"
                capture="environment"
                multiple
                disabled={ocrThinking || pendingReceipts.length >= 4}
                onChange={(e) => void onReceiptFiles(e.target.files)}
              />
              <span className="btn ghost sm">
                <IconPlus size={13} />
                {pendingReceipts.length === 0 ? ' Upload receipt' : ` Add another (${pendingReceipts.length}/4)`}
              </span>
            </label>
            {ocrThinking && (
              <div className="ops-form-alert neutral">
                <IconSparkle size={12} /> Reading the receipt…
              </div>
            )}
            {ocrConfidence && (
              <div className="ops-form-alert neutral">
                Friday read it (<em>{ocrConfidence}</em> confidence). Review the auto-filled fields below.
                {ocrNotes && <div style={{ marginTop: 4, opacity: 0.8 }}>{ocrNotes}</div>}
              </div>
            )}
            {pendingReceipts.length > 0 && (
              <div className="ops-receipt-list">
                {pendingReceipts.map((r, i) => (
                  <span key={i} className="ops-receipt-chip">
                    <span>{r.file_name}</span>
                    <button type="button" onClick={() => removeReceipt(i)} title="Remove">
                      <IconClose />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="ops-form-section">
            <div className="ops-form-section-title">Amount</div>
            <div className="ops-form-grid two">
              <label className="ops-form-field">
                <span>Amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </label>
              <label className="ops-form-field">
                <span>Currency</span>
                <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
            {/* Live approval-tier preview. Only shown for MUR right now —
                EUR/USD need a conversion step which lives in a later slice.
                Per locked design Notion 34e43ca8849281fa8085f120b211c689:
                operator should see the policy implication before submitting. */}
            {(() => {
              const amt = Number(amount);
              if (!Number.isFinite(amt) || amt <= 0) return null;
              if (currency !== 'MUR') {
                return (
                  <div className="ops-tier-preview is-muted">
                    <span className="ops-tier-dot is-muted" />
                    <span className="ops-tier-label">Tier set on submit (auto-converts to MUR).</span>
                  </div>
                );
              }
              const tier = approvalTierFor(Math.round(amt * 100));
              const meta = tierMeta(tier);
              return (
                <div className={`ops-tier-preview tier-${meta.color}`}>
                  <span className={`ops-tier-dot tier-${meta.color}`} />
                  <span className="ops-tier-label">{meta.label}</span>
                  <span className="ops-tier-hint">{meta.hint}</span>
                </div>
              );
            })()}
          </section>

          <section className="ops-form-section">
            <div className="ops-form-section-title">Classification</div>
            <label className="ops-form-field">
              <span>Category</span>
              <select value={categoryCode} onChange={(e) => setCategoryCode(e.target.value)}>
                {categories.map((c) => (
                  <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
                ))}
              </select>
            </label>
            <label className="ops-form-field">
              <span>Bill to</span>
              <select value={billTo} onChange={(e) => setBillTo(e.target.value)}>
                <option value="internal_fr">Friday Retreats (internal)</option>
                <option value="internal_fi">Friday Interiors (internal)</option>
                <option value="internal_s">Syndic (internal)</option>
                {propertyMeta && (
                  <option value={`owner_${propertyMeta.code.toLowerCase()}`}>Owner of {propertyMeta.code}</option>
                )}
              </select>
            </label>
          </section>

          <section className="ops-form-section">
            <div className="ops-form-section-title">Vendor + description</div>
            <label className="ops-form-field">
              <span>
                <input
                  type="checkbox"
                  checked={labourMode}
                  onChange={(e) => setLabourMode(e.target.checked)}
                  style={{ width: 'auto', marginRight: 6 }}
                />
                Internal labour (no vendor / receipt)
              </span>
            </label>
            {!labourMode ? (
              <label className="ops-form-field">
                <span>Vendor name</span>
                <input
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder="e.g. Pereybere Hardware"
                />
              </label>
            ) : (
              <div className="ops-form-grid two">
                <label className="ops-form-field">
                  <span>Hours</span>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    inputMode="decimal"
                    value={labourHours}
                    onChange={(e) => setLabourHours(e.target.value)}
                    placeholder="1.5"
                  />
                </label>
                <label className="ops-form-field">
                  <span>Work type</span>
                  <input
                    value={labourWorkType}
                    onChange={(e) => setLabourWorkType(e.target.value)}
                    placeholder="plumbing, electrical, …"
                  />
                </label>
              </div>
            )}
            <label className="ops-form-field">
              <span>Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What was bought / done?"
                rows={3}
              />
            </label>
          </section>

          {error && <div className="ops-form-alert failed">{error}</div>}

          <div className="ops-create-footer">
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button
              className="btn primary"
              type="button"
              disabled={submitting || validation.length > 0}
              onClick={() => void submit()}
            >
              {submitting ? 'Saving…' : 'Capture expense'}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
