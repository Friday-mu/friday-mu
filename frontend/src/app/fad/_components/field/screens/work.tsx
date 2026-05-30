'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../icons';
import { Badge, MLabel, SubHead, useFieldNav } from '../kit';
import { addSupply, fetchTask } from '../../../_data/tasksClient';
import {
  createExpense,
  fetchExpenseCategories,
  fileToBase64,
  parseReceipt,
  type ExpenseCategory,
  type ParseReceiptResponse,
} from '../../../_data/expensesClient';
import type { Task, TaskSupply, TaskSupplyCategory } from '../../../_data/tasks';
import { fireToast } from '../../Toaster';

/* shared: resolve the task this screen operates on (passed object or fetched by id).
   Mirrors useResolvedTask in detail.tsx — kept local because this file may only
   write work.tsx. */
function useResolvedTask(
  params: { task?: Task; taskId?: string },
): [Task | null, (t: Task) => void, () => void] {
  const [task, setTask] = useState<Task | null>(params.task ?? null);
  const refetch = () => {
    const id = task?.id ?? params.taskId;
    if (!id) return;
    fetchTask(id).then((t) => { if (t) setTask(t); }).catch(() => undefined);
  };
  useEffect(() => {
    if (!task && params.taskId) {
      fetchTask(params.taskId).then((t) => { if (t) setTask(t); }).catch(() => undefined);
    }
  }, [params.taskId]); // eslint-disable-line react-hooks/exhaustive-deps
  return [task, setTask, refetch];
}

function Loading() {
  return (
    <div className="fad">
      <div className="fad-body"><div className="fad-scroll">
        <div className="faint" style={{ textAlign: 'center', marginTop: 60, fontFamily: 'var(--mono)', fontSize: 12 }}>Loading…</div>
      </div></div>
    </div>
  );
}

/* money formatting — supplies/costs are MUR in the field */
function rs(n: number): string {
  return 'Rs ' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/* ─────────────────────────── Supplies ─────────────────────────── */

const SUPPLY_CATEGORIES: TaskSupplyCategory[] = [
  'linen', 'amenity', 'cleaning', 'maintenance', 'welcome', 'consumable', 'other',
];

const CATEGORY_LABEL: Record<TaskSupplyCategory, string> = {
  linen: 'Linen', amenity: 'Amenity', cleaning: 'Cleaning', maintenance: 'Maintenance',
  welcome: 'Welcome', consumable: 'Consumable', other: 'Other',
};

/* read-only display row for a recorded supply — design's .suprow look */
function SupRow({ supply }: { supply: TaskSupply }) {
  const metaParts = [
    CATEGORY_LABEL[supply.category] || supply.category,
    supply.unitCost != null ? `${rs(supply.unitCost)} / ${supply.unit}` : supply.unit,
  ];
  return (
    <div className="suprow">
      <span className="ch-ic" style={{ width: 34, height: 34, flex: '0 0 34px', borderRadius: 10, fontSize: 14 }}>
        <Icon n="box" s={1.8} />
      </span>
      <div className="sm">
        <div className="sname">{supply.supplyName}</div>
        <div className="smeta">{metaParts.join(' · ')}</div>
      </div>
      <div className="stepper" style={{ pointerEvents: 'none' }}>
        <span className="val" style={{ minWidth: 24, textAlign: 'center' }}>{supply.quantity}</span>
      </div>
    </div>
  );
}

export function ScreenSupplies(params: { task?: Task; taskId?: string }) {
  const nav = useFieldNav();
  const [task, , refetch] = useResolvedTask(params);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [category, setCategory] = useState<TaskSupplyCategory>('consumable');
  const [saving, setSaving] = useState(false);

  if (!task) return <Loading />;

  const supplies = task.supplies || [];
  // Parts cost = sum(unitCost × quantity) over priced lines only.
  const partsCost = supplies.reduce(
    (sum, s) => (s.unitCost != null ? sum + s.unitCost * s.quantity : sum),
    0,
  );
  const hasPriced = supplies.some((s) => s.unitCost != null);

  const confirmAdd = () => {
    const supplyName = name.trim();
    if (!supplyName || saving) return;
    setSaving(true);
    addSupply({
      taskId: task.id,
      supplyId: '',
      supplyName,
      category,
      quantity: qty,
      unit: 'unit',
      currency: 'MUR',
      ownerCharge: false,
    })
      .then(() => {
        // refetch the task so the list reflects the server's canonical row
        refetch();
        setName('');
        setQty(1);
        setCategory('consumable');
        setAdding(false);
      })
      .catch((e) => fireToast(`Couldn’t add supply — ${e instanceof Error ? e.message : 'try again'}`))
      .finally(() => setSaving(false));
  };

  return (
    <div className="fad">
      <SubHead task={task} title="Supplies used" />
      <div className="fad-body"><div className="fad-scroll">
        <div className="aigate">
          <span className="ic" style={{ fontSize: 15 }}><Icon n="sparkle" s={1.8} /></span>
          <span className="tx">
            <b>{supplies.length} item{supplies.length === 1 ? '' : 's'}</b> recorded for this {task.department} task. Confirm what you actually used, or add more.
          </span>
        </div>

        <MLabel rule={false} count={supplies.length}>Recorded</MLabel>
        <div className="stack-sm">
          {supplies.map((s) => <SupRow key={s.id} supply={s} />)}
          {supplies.length === 0 && (
            <div className="faint" style={{ fontSize: 12, padding: '8px 2px' }}>Nothing recorded yet — add what you used below.</div>
          )}
        </div>

        {adding ? (
          <div className="tcard" style={{ gap: 11, marginTop: 12 }}>
            <div className="field">
              <span className="flbl">Supply name</span>
              <input
                className="fin"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Replacement valve"
              />
            </div>
            <div className="field">
              <span className="flbl">Category</span>
              <select
                className="fin"
                value={category}
                onChange={(e) => setCategory(e.target.value as TaskSupplyCategory)}
              >
                {SUPPLY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                ))}
              </select>
            </div>
            <div className="between">
              <span className="flbl" style={{ marginBottom: 0 }}>Quantity</span>
              <div className="stepper">
                <button type="button" onClick={() => setQty((v) => Math.max(0, v - 1))}>−</button>
                <span className="val">{qty}</span>
                <button type="button" onClick={() => setQty((v) => v + 1)}>+</button>
              </div>
            </div>
            <div className="row gap6" style={{ marginTop: 2 }}>
              <button className="btn primary tap" style={{ flex: 1, height: 42 }} disabled={!name.trim() || saving} onClick={confirmAdd}>
                <Icon n="check" s={2} /> {saving ? 'Adding…' : 'Add supply'}
              </button>
              <button className="btn ghost tap" style={{ height: 42 }} onClick={() => { setAdding(false); setName(''); setQty(1); }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="btn ghost full mt12 tap" style={{ height: 42, borderStyle: 'dashed' }} onClick={() => setAdding(true)}>
            <Icon n="plus" s={2} /> Add supply
          </button>
        )}

        <div className="between mt16" style={{ padding: '0 2px' }}>
          <span className="faint" style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Parts cost</span>
          <span style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--mono)' }}>{hasPriced ? rs(partsCost) : '—'}</span>
        </div>
        {!hasPriced && supplies.length > 0 && (
          <div className="faint" style={{ fontSize: 10.5, margin: '6px 0 0', padding: '0 2px' }}>
            No unit costs on these lines — parts cost shows once priced supplies are recorded.
          </div>
        )}
      </div></div>
      <div className="composer">
        <button className="btn primary full tap" style={{ height: 46, fontSize: 14.5 }} onClick={() => nav.back()}>
          <Icon n="check" s={2} /> Save supplies used
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── Expense (receipt OCR) ─────────────────────────── */

type Phase = 'capture' | 'scanning' | 'done';

interface ScannedExpense {
  vendor: string;
  amount: number | null;
  currency: 'MUR' | 'EUR' | 'USD';
  date: string;
  categoryCode: string;
  description: string;
  lineItemCount: number;
  confidence: ParseReceiptResponse['confidence'] | null;
}

function matchCategoryCode(hint: string | null, cats: ExpenseCategory[]): string {
  if (cats.length === 0) return '';
  if (hint) {
    const h = hint.toLowerCase();
    const byCode = cats.find((c) => c.code.toLowerCase() === h);
    if (byCode) return byCode.code;
    const byName = cats.find(
      (c) => c.name.toLowerCase() === h || c.name.toLowerCase().includes(h) || h.includes(c.name.toLowerCase()),
    );
    if (byName) return byName.code;
  }
  return cats[0].code; // fall back to first category's code
}

export function ScreenExpense(params: { task?: Task; taskId?: string }) {
  const nav = useFieldNav();
  const [task] = useResolvedTask(params);

  const [phase, setPhase] = useState<Phase>('capture');
  const [cats, setCats] = useState<ExpenseCategory[]>([]);
  const [scan, setScan] = useState<ScannedExpense | null>(null);
  // the receipt file + its base64, retained so we can attach it on submit
  const [receipt, setReceipt] = useState<{ file: File; base64: string } | null>(null);
  const [extracted, setExtracted] = useState<ParseReceiptResponse['extracted'] | null>(null);
  const [busy, setBusy] = useState(false);

  // hidden file input ref via id (kept simple — capture=environment opens the camera on mobile)
  const fileInputId = useMemo(() => `expense-file-${Math.random().toString(36).slice(2, 8)}`, []);

  // Load Path-A categories once so we can map the OCR category_hint → a code.
  useEffect(() => {
    fetchExpenseCategories('path_a')
      .then((res) => setCats(res.categories || []))
      .catch(() => undefined);
  }, []);

  if (!task) return <Loading />;

  const onFile = (file: File | null | undefined) => {
    if (!file) return;
    setPhase('scanning');
    fileToBase64(file)
      .then((base64) => {
        setReceipt({ file, base64 });
        return parseReceipt({ image_base64: base64, content_type: file.type, hint: task.propertyCode })
          .then((res) => {
            setExtracted(res.extracted);
            const ex = res.extracted;
            const description = (ex.line_items && ex.line_items.length > 0)
              ? ex.line_items.map((li) => li.description).filter(Boolean).join(', ')
              : (ex.notes || '');
            setScan({
              vendor: ex.vendor_name || '',
              amount: ex.amount,
              currency: ex.currency || 'MUR',
              date: ex.date || '',
              categoryCode: matchCategoryCode(ex.category_hint, cats),
              description,
              lineItemCount: ex.line_items ? ex.line_items.length : 0,
              confidence: res.confidence,
            });
            setPhase('done');
          })
          .catch((e) => {
            // OCR failed — let the user fill it in manually, still advance to the editable form.
            fireToast(`Friday couldn’t read the receipt — fill it in manually. (${e instanceof Error ? e.message : 'error'})`);
            setExtracted(null);
            setScan({
              vendor: '',
              amount: null,
              currency: 'MUR',
              date: '',
              categoryCode: cats[0]?.code || '',
              description: '',
              lineItemCount: 0,
              confidence: null,
            });
            setPhase('done');
          });
      })
      .catch((e) => {
        fireToast(`Couldn’t read the file — ${e instanceof Error ? e.message : 'try again'}`);
        setPhase('capture');
      });
  };

  const patch = (p: Partial<ScannedExpense>) => setScan((s) => (s ? { ...s, ...p } : s));

  const submit = () => {
    if (!scan || busy) return;
    if (scan.amount == null || !(scan.amount > 0)) { fireToast('Enter the amount before submitting'); return; }
    if (!scan.categoryCode) { fireToast('Pick a category before submitting'); return; }
    setBusy(true);
    createExpense({
      task_id: task.id,
      vendor_name: scan.vendor || undefined,
      amount: scan.amount,
      currency: scan.currency,
      category_code: scan.categoryCode,
      description: scan.description || scan.vendor || `Expense for ${task.propertyCode}`,
      receipts: receipt
        ? [{
            file_name: receipt.file.name,
            content_type: receipt.file.type,
            base64: receipt.base64,
            // ocr_extracted carries the raw OCR field-set the backend stores
            // alongside the receipt (ParseReceiptResponse['extracted']).
            ocr_extracted: extracted || undefined,
          }]
        : undefined,
    })
      .then(() => nav.back())
      .catch((e) => fireToast(`Couldn’t submit expense — ${e instanceof Error ? e.message : 'try again'}`))
      .finally(() => setBusy(false));
  };

  const reset = () => {
    setPhase('capture');
    setScan(null);
    setReceipt(null);
    setExtracted(null);
  };

  const catName = (code: string) => cats.find((c) => c.code === code)?.name || code;
  // VAT is NOT in the OCR response — show a clearly-labelled client estimate (15%).
  const vatEstimate = scan && scan.amount != null ? scan.amount - scan.amount / 1.15 : null;

  return (
    <div className="fad">
      <SubHead task={task} title="Expense report" />
      <div className="fad-body"><div className="fad-scroll">

        {phase === 'capture' && (
          <div className="scanstage" style={{ marginTop: 10 }}>
            <label htmlFor={fileInputId} className="scandoc captured" style={{ cursor: 'pointer' }}>
              <span className="ln" style={{ top: 18, width: '40%' }} /><span className="ln" style={{ top: 34 }} />
              <span className="ln" style={{ top: 50 }} /><span className="ln" style={{ top: 66, width: '70%' }} />
              <span className="ln" style={{ top: 120 }} /><span className="ln s" style={{ top: 150, width: '55%' }} />
              <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx-3)', fontSize: 26 }}><Icon n="cam" s={1.6} /></span>
            </label>
            <label htmlFor={fileInputId} className="btn primary tap" style={{ height: 46, padding: '0 22px', fontSize: 14.5, cursor: 'pointer' }}>
              <Icon n="cam" s={1.9} /> Scan a receipt
            </label>
            <input
              id={fileInputId}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <div className="faint" style={{ fontSize: 11.5, textAlign: 'center', maxWidth: 240, lineHeight: 1.5 }}>
              Friday reads the merchant, amount &amp; category — you just check and accept.
            </div>
          </div>
        )}

        {phase === 'scanning' && (<>
          <div className="scanstage" style={{ marginTop: 10 }}>
            <div className="scandoc">
              <span className="scanbeam" />
              <span className="ln" style={{ top: 18, width: '40%' }} /><span className="ln" style={{ top: 34 }} />
              <span className="ln" style={{ top: 50 }} /><span className="ln" style={{ top: 66, width: '70%' }} />
              <span className="ln" style={{ top: 120 }} /><span className="ln s" style={{ top: 150, width: '55%' }} />
            </div>
            <div className="row gap6" style={{ color: 'var(--indigo-bright)', fontSize: 13, fontWeight: 500 }}>
              <Icon n="sparkle" s={1.7} /> Friday is reading your receipt…
            </div>
          </div>
          <MLabel rule={false}>Extracted details</MLabel>
          <div className="extracted tcard" style={{ padding: '2px 14px' }}>
            {['Merchant', 'Date', 'Category', 'Amount', 'VAT (est.)'].map((label, i) => (
              <div key={i} className="efield"><span className="el">{label}</span><span className="ev shimmer">··········</span></div>
            ))}
          </div>
        </>)}

        {phase === 'done' && scan && (<>
          <div className="receipt">
            <div className="rimg" />
            <div style={{ flex: 1 }}>
              <div className="row gap6">
                <Badge tone="green" dot>Scanned</Badge>
                {scan.confidence
                  ? <span className="ai-tag"><Icon n="sparkle" s={1.6} /> Friday read it · {scan.confidence}</span>
                  : <span className="ai-tag"><Icon n="alert" s={1.6} /> fill in manually</span>}
              </div>
              <div className="dim" style={{ fontSize: 12, marginTop: 8, fontFamily: 'var(--mono)' }}>{receipt?.file.name || 'receipt'}</div>
              <div className="faint" style={{ fontSize: 11, marginTop: 3 }}>just now · 1 page</div>
            </div>
          </div>

          <div className="aigate mt12">
            <span className="ic" style={{ fontSize: 15 }}><Icon n="sparkle" s={1.8} /></span>
            <span className="tx">
              {scan.confidence
                ? <><b>Friday filled the report</b> from your receipt. Check it and accept — or edit any field.</>
                : <><b>Friday couldn’t read this one.</b> Fill the fields in and accept.</>}
            </span>
          </div>

          <MLabel rule={false}>Extracted details</MLabel>
          <div className="extracted tcard" style={{ padding: '2px 14px' }}>
            <div className="efield pop" style={{ animationDelay: '0ms' }}>
              <span className="el">Merchant</span>
              <input className="ev" style={{ background: 'transparent', border: 'none', textAlign: 'right', font: 'inherit', color: 'inherit' }}
                value={scan.vendor} placeholder="Merchant" onChange={(e) => patch({ vendor: e.target.value })} />
            </div>
            <div className="efield pop" style={{ animationDelay: '70ms' }}>
              <span className="el">Date</span>
              <input className="ev" style={{ background: 'transparent', border: 'none', textAlign: 'right', font: 'inherit', color: 'inherit' }}
                value={scan.date} placeholder="YYYY-MM-DD" onChange={(e) => patch({ date: e.target.value })} />
            </div>
            <div className="efield pop" style={{ animationDelay: '140ms' }}>
              <span className="el">Category</span>
              <span className="ev" style={{ padding: '6px 10px' }}>
                <select
                  style={{ background: 'transparent', border: 'none', font: 'inherit', color: 'inherit', textAlign: 'right' }}
                  value={scan.categoryCode}
                  onChange={(e) => patch({ categoryCode: e.target.value })}
                >
                  {cats.length === 0 && <option value="">Loading…</option>}
                  {cats.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </span>
            </div>
            <div className="efield pop" style={{ animationDelay: '210ms' }}>
              <span className="el">Amount</span>
              <span className="ev big" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                <select
                  style={{ background: 'transparent', border: 'none', font: 'inherit', color: 'inherit', fontSize: 13 }}
                  value={scan.currency}
                  onChange={(e) => patch({ currency: e.target.value as ScannedExpense['currency'] })}
                >
                  <option value="MUR">Rs</option>
                  <option value="EUR">€</option>
                  <option value="USD">$</option>
                </select>
                <input
                  type="number"
                  inputMode="decimal"
                  style={{ background: 'transparent', border: 'none', textAlign: 'right', font: 'inherit', color: 'inherit', width: 110 }}
                  value={scan.amount ?? ''}
                  placeholder="0.00"
                  onChange={(e) => patch({ amount: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </span>
            </div>
            {/* @demo:logic — VAT estimate is client-computed (amount − amount/1.15).
                The OCR response carries no VAT field; real VAT should come from the
                receipt parser or finance config. Tag: PROD-FIELD-EXPENSE-VAT. */}
            <div className="efield pop" style={{ animationDelay: '280ms' }}>
              <span className="el">VAT (est.)</span>
              <span className="ev">{vatEstimate != null ? rs(vatEstimate) : '—'}</span>
            </div>
            <div className="efield pop" style={{ animationDelay: '350ms' }}>
              <span className="el">Linked task</span>
              <span className="ev" style={{ display: 'flex', alignItems: 'center', padding: '6px 10px' }}>
                <span className="badge gray">{task.propertyCode} · {task.title}</span>
              </span>
            </div>
          </div>

          {scan.description && (<>
            <MLabel rule={false}>Description</MLabel>
            <textarea
              className="fin area"
              style={{ width: '100%', minHeight: 56, resize: 'vertical' }}
              value={scan.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </>)}

          <div className="row gap6 mt12">
            <Badge tone="indigo"><Icon n="user" s={1.7} /> Reimbursable to you</Badge>
          </div>

          {scan.lineItemCount > 0 && (
            <div className="aigate mt12" style={{ borderStyle: 'solid' }}>
              <span className="ic" style={{ fontSize: 15 }}><Icon n="box" s={1.8} /></span>
              <span className="tx"><b>{scan.lineItemCount} line item{scan.lineItemCount === 1 ? '' : 's'}</b> read from this receipt. Add them under <b>Supplies used</b> if needed.</span>
            </div>
          )}
          <button className="btn ghost full sm tap mt8" onClick={() => nav.go('supplies', { task: task as unknown as Record<string, unknown> })}>
            <Icon n="box" s={1.8} /> View supplies
          </button>
        </>)}

      </div></div>
      {phase === 'done' && (
        <div className="composer" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn primary full tap" style={{ height: 46, fontSize: 14.5 }} disabled={busy} onClick={submit}>
            <Icon n="check" s={2} /> {busy ? 'Submitting…' : 'Accept & submit'}
          </button>
          <button className="btn ghost full sm tap" onClick={reset}>Re-scan</button>
        </div>
      )}
    </div>
  );
}
