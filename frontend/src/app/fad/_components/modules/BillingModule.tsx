'use client';

// Billing — two surfaces in one module:
//   • Tenant view: list-my-invoices, "I've paid" flow with bank details.
//   • FR-admin view (Friday Retreats tenant + admin role): list-all
//     invoices across tenants, confirm bank-transfer payments, and issue
//     new invoices.
//
// The FR admin sees a tabbed surface; everyone else only sees their own
// invoices.

import { useEffect, useState } from 'react';
import { ModuleHeader } from '../ModuleHeader';
import { apiFetch, API_BASE, getToken } from '../../../../components/types';
import { useCurrentTenantRole, useIsFrAdmin } from '../../_data/useTenantIdentity';

// Fetch the PDF as a blob (JWT goes in a header — can't use a plain
// <a href>) and open it in a new tab. We revoke the object URL after
// the new tab has had a chance to load it; if the user blocks popups
// the link in the catch path is a no-op (the parent caller surfaces
// the error message).
async function downloadInvoicePdf(path: string, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  // Open in a new tab so the user keeps their place in the dashboard.
  // Fall back to a hidden-anchor download if popups are blocked.
  const win = window.open(url, '_blank');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  // Give the new tab a beat to consume the URL, then revoke.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Per-tenant bank/transfer details — see migration 039_payment_instructions.sql
// for the JSONB shape. Sourced from /api/tenants/me; rendered by
// <BankDetails/> with a sensible empty-state fallback when unconfigured.
interface PaymentInstructions {
  bank_name?: string | null;
  account_name?: string | null;
  account_number?: string | null;
  iban?: string | null;
  swift?: string | null;
  currency?: string | null;
  instructions?: string | null;
}

function isPaymentInstructionsConfigured(p: PaymentInstructions | null | undefined): boolean {
  if (!p) return false;
  return Boolean(
    p.bank_name || p.account_name || p.account_number || p.iban || p.swift || p.instructions
  );
}

type InvoiceStatus = 'pending' | 'paid_pending_confirmation' | 'paid' | 'void' | 'overdue';

// Minimal subset of the tenant row used by the Stripe section + bank-
// details fallback. Mirrors the shapeTenant() server adapter.
interface TenantRow {
  id: string;
  payment_method: 'bank_transfer' | 'stripe' | string;
  stripe_customer_id?: string | null;
  payment_instructions?: PaymentInstructions | null;
}

interface Invoice {
  id: string;
  tenant_id: string;
  invoice_number: string;
  period_start: string | null;
  period_end: string | null;
  amount_minor: number;
  currency_code: string;
  amount_display: string;
  due_date: string | null;
  status: InvoiceStatus;
  bank_transfer_ref: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  // Admin-list responses join the tenant row
  tenant_name?: string;
  tenant_slug?: string;
}

export function BillingModule() {
  const isFrAdmin = useIsFrAdmin();
  const [adminTab, setAdminTab] = useState<'all' | 'mine'>('all');

  if (isFrAdmin) {
    const tabs = [
      { id: 'all', label: 'All tenant invoices' },
      { id: 'mine', label: 'My invoices' },
    ];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <ModuleHeader
          title="Billing"
          subtitle="Issue invoices, confirm payments, and review your own bill."
          tabs={tabs}
          activeTab={adminTab}
          onTabChange={(id) => setAdminTab(id as 'all' | 'mine')}
        />
        <div className="fad-module-body">
          {adminTab === 'all' ? <AdminAllInvoices /> : <TenantInvoices />}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <ModuleHeader title="Billing" subtitle="Your invoices and payment status." />
      <div className="fad-module-body">
        <TenantInvoices />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tenant view
// ─────────────────────────────────────────────────────────────

function TenantInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [tenant, setTenant] = useState<TenantRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch invoices + tenant row (for payment_instructions +
      // payment_method) in parallel. Tenant-row failure shouldn't block
      // the invoice list — we degrade to the "not configured" empty
      // state on the bank-details block.
      const [invRes, tenantRes] = await Promise.all([
        apiFetch('/api/tenants/me/invoices') as Promise<{ invoices: Invoice[] } | Invoice[]>,
        apiFetch('/api/tenants/me').catch(() => null) as Promise<TenantRow | null>,
      ]);
      setInvoices(Array.isArray(invRes) ? invRes : invRes.invoices || []);
      setTenant(tenantRes || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const paymentInstructions = tenant?.payment_instructions || null;

  useEffect(() => { void load(); }, []);

  if (loading) return <Loading />;
  if (error) return <ErrorBlock message={error} />;

  if (invoices.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tenant && <StripeSection tenant={tenant} onChange={load} />}
        <div className="card" style={{ padding: 24, textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 500 }}>No invoices yet</h3>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
            Invoices will appear here once Friday Retreats issues your first bill.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {tenant && <StripeSection tenant={tenant} onChange={load} />}
      {invoices.map((inv) => (
        <TenantInvoiceCard
          key={inv.id}
          invoice={inv}
          paymentInstructions={paymentInstructions}
          onRefresh={load}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Stripe section — switch payment method + launch Stripe checkout
// ─────────────────────────────────────────────────────────────
//
// v0 scaffolding: the backend routes return 503 until STRIPE_SECRET_KEY
// is set on the server. The UI is wired so flipping the env + Stripe
// price ID makes the buttons live without a frontend deploy.
//
// Two affordances:
//   • Payment method radio — bank_transfer ↔ stripe. PATCHes /me with
//     the new value; backend currently allows the toggle but doesn't
//     enforce flow (a tenant could flip to stripe without completing
//     checkout — the next webhook event reconciles state).
//   • "Send to Stripe checkout" — POSTs /me/stripe/checkout-session,
//     opens the returned URL in a new tab.
function StripeSection({ tenant, onChange }: { tenant: TenantRow; onChange: () => void }) {
  const [busy, setBusy] = useState<'checkout' | 'portal' | 'toggle' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const method = tenant.payment_method || 'bank_transfer';

  const flipMethod = async (next: 'bank_transfer' | 'stripe') => {
    if (next === method) return;
    setBusy('toggle');
    setError(null);
    try {
      await apiFetch('/api/tenants/me', {
        method: 'PATCH',
        body: JSON.stringify({ payment_method: next }),
      });
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const launchCheckout = async () => {
    setBusy('checkout');
    setError(null);
    try {
      const res = await apiFetch('/api/tenants/me/stripe/checkout-session', { method: 'POST' }) as { checkout_url?: string };
      if (res?.checkout_url) {
        window.open(res.checkout_url, '_blank', 'noopener,noreferrer');
      } else {
        setError('No checkout URL returned.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const launchPortal = async () => {
    setBusy('portal');
    setError(null);
    try {
      const res = await apiFetch('/api/tenants/me/stripe/portal-session', { method: 'POST' }) as { portal_url?: string };
      if (res?.portal_url) {
        window.open(res.portal_url, '_blank', 'noopener,noreferrer');
      } else {
        setError('No portal URL returned.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 500 }}>Payment method</h3>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Currently: <strong>{method === 'stripe' ? 'Stripe' : 'Bank transfer'}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="radio"
              name="payment_method"
              value="bank_transfer"
              checked={method === 'bank_transfer'}
              disabled={busy !== null}
              onChange={() => void flipMethod('bank_transfer')}
            />
            Bank transfer
          </label>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="radio"
              name="payment_method"
              value="stripe"
              checked={method === 'stripe'}
              disabled={busy !== null}
              onChange={() => void flipMethod('stripe')}
            />
            Stripe
          </label>
        </div>
      </div>

      {method === 'stripe' && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--color-border-tertiary)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={launchCheckout} disabled={busy !== null} style={primaryBtn()}>
            {busy === 'checkout' ? 'Opening…' : 'Send to Stripe checkout'}
          </button>
          {tenant.stripe_customer_id && (
            <button type="button" onClick={launchPortal} disabled={busy !== null} style={secondaryBtn()}>
              {busy === 'portal' ? 'Opening…' : 'Manage billing in Stripe'}
            </button>
          )}
        </div>
      )}

      {error && <ErrorMsg message={error} />}
    </div>
  );
}

function TenantInvoiceCard({
  invoice,
  paymentInstructions,
  onRefresh,
}: {
  invoice: Invoice;
  paymentInstructions: PaymentInstructions | null;
  onRefresh: () => void;
}) {
  const [bankRef, setBankRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const markPaid = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/tenants/me/invoices/${invoice.id}/mark-paid`, {
        method: 'POST',
        body: JSON.stringify({ bank_transfer_ref: bankRef.trim() || null }),
      });
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const downloadPdf = async () => {
    setPdfBusy(true);
    setError(null);
    try {
      await downloadInvoicePdf(
        `/api/tenants/me/invoices/${invoice.id}/pdf`,
        `invoice-${invoice.invoice_number}.pdf`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>{invoice.invoice_number}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {formatPeriod(invoice.period_start, invoice.period_end)} · Due {formatDate(invoice.due_date)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{invoice.amount_display}</div>
          <StatusChip status={invoice.status} />
          <div style={{ marginTop: 6 }}>
            <button
              type="button"
              onClick={downloadPdf}
              disabled={pdfBusy}
              style={linkBtn()}
            >
              {pdfBusy ? 'Downloading…' : 'Download PDF'}
            </button>
          </div>
        </div>
      </div>

      {invoice.status === 'pending' && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '0.5px solid var(--color-border-tertiary)' }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8, fontWeight: 500 }}>
            Where to send payment for your FridayOS Design subscription
          </div>
          <BankDetails reference={invoice.invoice_number} instructions={paymentInstructions} />
          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
              Bank transfer reference (optional — helps us match your payment)
            </label>
            <input
              type="text"
              value={bankRef}
              onChange={(e) => setBankRef(e.target.value)}
              placeholder="e.g. TX-2026-04-001"
              style={inputStyle}
            />
          </div>
          {error && <ErrorMsg message={error} />}
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={markPaid} disabled={submitting} style={primaryBtn()}>
              {submitting ? 'Submitting…' : "I've paid"}
            </button>
          </div>
        </div>
      )}

      {invoice.status === 'paid_pending_confirmation' && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--color-border-tertiary)', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          Awaiting confirmation from Friday Retreats.
          {invoice.bank_transfer_ref && <> Ref: <code>{invoice.bank_transfer_ref}</code></>}
        </div>
      )}

      {invoice.status === 'paid' && invoice.paid_at && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--color-border-tertiary)', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          ✓ Paid on {formatDate(invoice.paid_at)}.
        </div>
      )}
    </div>
  );
}

function BankDetails({
  reference,
  instructions,
}: {
  reference: string;
  instructions: PaymentInstructions | null;
}) {
  // Empty / unconfigured payment_instructions → support-contact fallback.
  // Treat any non-empty user-facing field as "configured"; currency alone
  // is not enough — without bank info there's nowhere to send money.
  if (!isPaymentInstructionsConfigured(instructions)) {
    return (
      <div
        style={{
          background: 'var(--color-background-tertiary)',
          borderRadius: 6,
          padding: 12,
          fontSize: 12,
          lineHeight: 1.6,
          color: 'var(--color-text-tertiary)',
        }}
      >
        Bank transfer details not yet configured — contact support.
      </div>
    );
  }

  // Reference always rendered (it's per-invoice, not per-tenant).
  return (
    <div style={{ background: 'var(--color-background-tertiary)', borderRadius: 6, padding: 12, fontSize: 12, lineHeight: 1.7 }}>
      {instructions!.bank_name && <BankRow label="Bank" value={instructions!.bank_name} />}
      {instructions!.account_number && <BankRow label="Account" value={instructions!.account_number} mono />}
      {instructions!.account_name && <BankRow label="Account name" value={instructions!.account_name} />}
      {instructions!.iban && <BankRow label="IBAN" value={instructions!.iban} mono />}
      {instructions!.swift && <BankRow label="SWIFT/BIC" value={instructions!.swift} mono />}
      {instructions!.currency && <BankRow label="Currency" value={instructions!.currency} />}
      <BankRow label="Reference" value={reference} mono highlight />
      {instructions!.instructions && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '0.5px solid var(--color-border-tertiary)', color: 'var(--color-text-tertiary)' }}>
          {instructions!.instructions}
        </div>
      )}
    </div>
  );
}

function BankRow({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: 'var(--color-text-tertiary)' }}>{label}</span>
      <span style={{
        fontFamily: mono ? 'var(--font-mono-fad, monospace)' : undefined,
        fontWeight: highlight ? 600 : 400,
        color: highlight ? 'var(--color-brand-accent)' : undefined,
      }}>{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FR admin view
// ─────────────────────────────────────────────────────────────

interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  active?: boolean;
  subscription_status?: string | null;
}

function AdminAllInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showIssue, setShowIssue] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [invRes, tRes] = await Promise.all([
        apiFetch('/api/tenants/admin/invoices') as Promise<{ results: Invoice[] } | Invoice[]>,
        apiFetch('/api/tenants/admin/list').catch(() => ({ results: [] })) as Promise<{ results: TenantSummary[] } | TenantSummary[]>,
      ]);
      setInvoices(Array.isArray(invRes) ? invRes : invRes.results || []);
      setTenants(Array.isArray(tRes) ? tRes : tRes.results || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const confirmPayment = async (id: string) => {
    try {
      await apiFetch(`/api/tenants/admin/invoices/${id}/confirm-payment`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (loading) return <Loading />;

  // Group by tenant for display
  const byTenant = new Map<string, { name: string; invoices: Invoice[] }>();
  invoices.forEach((inv) => {
    const key = inv.tenant_id;
    const name = inv.tenant_name || inv.tenant_slug || key;
    if (!byTenant.has(key)) byTenant.set(key, { name, invoices: [] });
    byTenant.get(key)!.invoices.push(inv);
  });

  return (
    <div>
      {/* Manage tenants — restore / hard-delete */}
      <AdminTenantList tenants={tenants} onChanged={() => void load()} />

      {/* Issue invoice */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 500 }}>Issue invoice</h3>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>Bill a tenant for the current period.</p>
          </div>
          <button type="button" onClick={() => setShowIssue((v) => !v)} style={secondaryBtn()}>
            {showIssue ? 'Cancel' : '+ New invoice'}
          </button>
        </div>
        {showIssue && (
          <IssueInvoiceForm
            tenants={tenants}
            onIssued={() => { setShowIssue(false); void load(); }}
          />
        )}
      </div>

      {error && <ErrorMsg message={error} />}

      {byTenant.size === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>No invoices issued yet.</p>
        </div>
      ) : (
        Array.from(byTenant.entries()).map(([tenantId, group]) => (
          <div key={tenantId} className="card" style={{ padding: 16, marginBottom: 12 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 500 }}>{group.name}</h4>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--color-text-tertiary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <th style={{ padding: '6px 8px' }}>Invoice</th>
                  <th style={{ padding: '6px 8px' }}>Period</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Amount</th>
                  <th style={{ padding: '6px 8px' }}>Due</th>
                  <th style={{ padding: '6px 8px' }}>Status</th>
                  <th style={{ padding: '6px 8px' }}></th>
                </tr>
              </thead>
              <tbody>
                {group.invoices.map((inv) => (
                  <tr key={inv.id} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                    <td style={{ padding: '8px', fontFamily: 'var(--font-mono-fad, monospace)' }}>{inv.invoice_number}</td>
                    <td style={{ padding: '8px' }}>{formatPeriod(inv.period_start, inv.period_end)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 500 }}>{inv.amount_display}</td>
                    <td style={{ padding: '8px' }}>{formatDate(inv.due_date)}</td>
                    <td style={{ padding: '8px' }}><StatusChip status={inv.status} /></td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => void downloadInvoicePdf(
                            `/api/tenants/admin/invoices/${inv.id}/pdf`,
                            `invoice-${inv.invoice_number}.pdf`,
                          ).catch((e) => setError(e instanceof Error ? e.message : String(e)))}
                          style={linkBtn()}
                          title="Download invoice PDF"
                        >
                          PDF
                        </button>
                        {inv.status === 'paid_pending_confirmation' && (
                          <button type="button" onClick={() => confirmPayment(inv.id)} style={primaryBtnXs()}>
                            Confirm payment
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}

function IssueInvoiceForm({ tenants, onIssued }: { tenants: TenantSummary[]; onIssued: () => void }) {
  const [tenantId, setTenantId] = useState('');
  const [amountMinor, setAmountMinor] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!tenantId) { setError('Pick a tenant.'); return; }
    const amt = Number(amountMinor);
    if (!Number.isFinite(amt) || amt <= 0) { setError('Amount (in cents) must be a positive number.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/api/tenants/admin/invoices', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: tenantId,
          amount_minor: amt,
          currency_code: currency.toUpperCase(),
          period_start: periodStart || null,
          period_end: periodEnd || null,
          due_date: dueDate || null,
          notes: notes.trim() || null,
        }),
      });
      onIssued();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '0.5px solid var(--color-border-tertiary)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <FieldInline label="Tenant">
          <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} style={inputStyle}>
            <option value="">— select —</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </FieldInline>
        <FieldInline label="Amount (cents)" hint="In minor units. 1000 = $10.00">
          <input type="number" value={amountMinor} onChange={(e) => setAmountMinor(e.target.value)} placeholder="1000" style={inputStyle} />
        </FieldInline>
        <FieldInline label="Currency">
          <input type="text" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} style={inputStyle} />
        </FieldInline>
        <FieldInline label="Period start">
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} style={inputStyle} />
        </FieldInline>
        <FieldInline label="Period end">
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} style={inputStyle} />
        </FieldInline>
        <FieldInline label="Due date">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
        </FieldInline>
        <div style={{ gridColumn: '1 / -1' }}>
          <FieldInline label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </FieldInline>
        </div>
      </div>
      {error && <ErrorMsg message={error} />}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" onClick={submit} disabled={submitting} style={primaryBtn()}>
          {submitting ? 'Issuing…' : 'Issue invoice'}
        </button>
      </div>
    </div>
  );
}

function FieldInline({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FR-admin tenant list — restore inactive tenants + hard-delete
// ─────────────────────────────────────────────────────────────
//
// Sits above the invoice list in the FR-admin view. Shows every
// tenant with its active/subscription_status, plus a Restore button
// for inactive (active=false) tenants and a Hard delete button (red,
// typed-slug confirmation) for permanent expunge.

function AdminTenantList({ tenants, onChanged }: { tenants: TenantSummary[]; onChanged: () => void }) {
  const [hardDeleteTarget, setHardDeleteTarget] = useState<TenantSummary | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const restore = async (id: string) => {
    setBusy((b) => ({ ...b, [id]: true }));
    setError(null);
    try {
      await apiFetch(`/api/tenants/admin/${id}/restore`, { method: 'POST' });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[id]; return n; });
    }
  };

  if (!tenants.length) return null;

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 500 }}>Tenants</h3>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
        Manage tenant lifecycle. Inactive tenants can be restored within a short window. Hard delete is permanent.
      </p>
      {error && <ErrorMsg message={error} />}
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--color-text-tertiary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <th style={{ padding: '6px 8px' }}>Name</th>
            <th style={{ padding: '6px 8px' }}>Slug</th>
            <th style={{ padding: '6px 8px' }}>Status</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}></th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((t) => {
            const inactive = t.active === false;
            return (
              <tr key={t.id} style={{ borderTop: '0.5px solid var(--color-border-tertiary)', opacity: inactive ? 0.65 : 1 }}>
                <td style={{ padding: '8px' }}>{t.name}</td>
                <td style={{ padding: '8px', fontFamily: 'var(--font-mono-fad, monospace)' }}>{t.slug}</td>
                <td style={{ padding: '8px' }}>
                  <span className="chip" style={{ fontSize: 11 }}>
                    {inactive ? 'Inactive' : 'Active'} · {t.subscription_status || '—'}
                  </span>
                </td>
                <td style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {inactive && (
                    <button
                      type="button"
                      onClick={() => void restore(t.id)}
                      disabled={!!busy[t.id]}
                      style={{ ...secondaryBtn(), marginRight: 6 }}
                    >
                      Restore
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setHardDeleteTarget(t)}
                    disabled={!!busy[t.id]}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      background: 'transparent',
                      color: 'var(--color-text-danger, #991b1b)',
                      fontSize: 12,
                      border: '0.5px solid var(--color-text-danger, #991b1b)',
                      cursor: 'pointer',
                    }}
                  >
                    Hard delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {hardDeleteTarget && (
        <HardDeleteDialog
          target={hardDeleteTarget}
          onClose={() => setHardDeleteTarget(null)}
          onDone={() => { setHardDeleteTarget(null); onChanged(); }}
        />
      )}
    </div>
  );
}

function HardDeleteDialog({
  target,
  onClose,
  onDone,
}: {
  target: TenantSummary;
  onClose: () => void;
  onDone: () => void;
}) {
  const [typedSlug, setTypedSlug] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (typedSlug !== target.slug) {
      setError(`Type "${target.slug}" to confirm.`);
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(`/api/tenants/admin/${target.id}/hard-delete`, {
        method: 'POST',
        headers: { 'X-Confirm-Hard-Delete': target.slug },
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-background-primary, #fff)',
          borderRadius: 8,
          padding: 24,
          maxWidth: 480,
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        }}
      >
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>
          Hard delete {target.name}
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 13 }}>
          This permanently deletes the tenant and every owned row across users,
          invoices, design projects, floor plans, chats, AI usage, modules,
          invitations, and assets. There is no recovery.
        </p>
        <p style={{ margin: '0 0 16px', fontSize: 13 }}>
          Type <code style={{ fontFamily: 'var(--font-mono-fad, monospace)' }}>{target.slug}</code> to confirm.
        </p>
        <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Tenant slug</label>
        <input
          type="text"
          value={typedSlug}
          onChange={(e) => setTypedSlug(e.target.value)}
          placeholder={target.slug}
          autoFocus
          style={{ ...inputStyle, marginBottom: 12 }}
        />
        {error && <ErrorMsg message={error} />}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onClose} disabled={submitting} style={secondaryBtn()}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || typedSlug !== target.slug}
            style={{ ...primaryBtn(), background: 'var(--color-text-danger, #991b1b)' }}
          >
            {submitting ? 'Deleting…' : 'Hard delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: InvoiceStatus }) {
  const map: Record<InvoiceStatus, { label: string; tone: 'info' | 'warn' | '' }> = {
    pending: { label: 'Pending', tone: 'warn' },
    paid_pending_confirmation: { label: 'Payment submitted', tone: 'info' },
    paid: { label: 'Paid', tone: 'info' },
    void: { label: 'Void', tone: '' },
    overdue: { label: 'Overdue', tone: 'warn' },
  };
  const entry = map[status] || { label: status, tone: '' };
  return <span className={'chip ' + entry.tone}>{entry.label}</span>;
}

function Loading() {
  return <div style={{ padding: 24, fontSize: 13, color: 'var(--color-text-tertiary)' }}>Loading…</div>;
}

function ErrorBlock({ message }: { message: string }) {
  return <div style={{ padding: 24 }}><ErrorMsg message={message} /></div>;
}

function ErrorMsg({ message }: { message: string }) {
  return (
    <div role="alert" style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--color-bg-danger, #fef2f2)', color: 'var(--color-text-danger, #991b1b)', fontSize: 12, marginTop: 8 }}>
      {message}
    </div>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

function formatPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return '—';
  return `${formatDate(start)} – ${formatDate(end)}`;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  fontSize: 13,
  borderRadius: 4,
  border: '0.5px solid var(--color-border-secondary)',
  background: 'var(--color-background-primary)',
  color: 'var(--color-text-primary)',
};

function primaryBtn(): React.CSSProperties {
  return {
    padding: '8px 16px',
    borderRadius: 'var(--radius-sm, 6px)',
    background: 'var(--color-brand-accent)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
  };
}

function primaryBtnXs(): React.CSSProperties {
  return {
    padding: '4px 10px',
    borderRadius: 'var(--radius-sm, 4px)',
    background: 'var(--color-brand-accent)',
    color: '#fff',
    fontSize: 11,
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
  };
}

function secondaryBtn(): React.CSSProperties {
  return {
    padding: '6px 12px',
    borderRadius: 'var(--radius-sm, 6px)',
    background: 'var(--color-background-tertiary)',
    color: 'var(--color-text-primary)',
    fontSize: 12,
    border: '0.5px solid var(--color-border-secondary)',
    cursor: 'pointer',
  };
}

// Plain text-link style — used for the "Download PDF" affordances so
// they don't compete visually with the primary action buttons.
function linkBtn(): React.CSSProperties {
  return {
    padding: 0,
    border: 'none',
    background: 'transparent',
    color: 'var(--color-brand-accent)',
    fontSize: 11,
    fontWeight: 500,
    textDecoration: 'underline',
    cursor: 'pointer',
  };
}
