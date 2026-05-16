'use client';

// Tenant-scoped settings — General / Brand / Vendor defaults. Reads
// /api/tenants/me and /api/design/annex_a. Editable for tenant admins;
// read-only for staff. Brand + Vendor defaults live in annex_a (existing
// design module storage) so the design-doc generator inherits whatever's
// configured here without a second table.

import { useEffect, useState } from 'react';
import { ModuleHeader } from '../ModuleHeader';
import { apiFetch } from '../../../../components/types';
import { useCurrentTenantRole } from '../../_data/useTenantIdentity';
import { useAnnexA } from '../../_data/useAnnexA';

interface Props {
  subPage: string;
  onChangeSubPage: (id: string) => void;
}

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'brand', label: 'Brand' },
  { id: 'vendors', label: 'Vendor defaults' },
  { id: 'billing', label: 'Payment instructions' },
  { id: 'users', label: 'Users' },
];

export function TenantSettingsModule({ subPage, onChangeSubPage }: Props) {
  const active = TABS.find((t) => t.id === subPage)?.id ?? 'general';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <ModuleHeader
        title="Settings"
        subtitle="Tenant profile, brand defaults, vendor configuration"
        tabs={TABS}
        activeTab={active}
        onTabChange={onChangeSubPage}
      />
      <div className="fad-module-body">
        {active === 'general' && <GeneralTab />}
        {active === 'brand' && <BrandTab />}
        {active === 'vendors' && <VendorsTab />}
        {active === 'billing' && <PaymentInstructionsTab />}
        {active === 'users' && <UsersTab />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// General tab
// ─────────────────────────────────────────────────────────────

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  country: string | null;
  locale: string | null;
  billing_email: string | null;
  notes: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  payment_method: string | null;
  created_at: string;
}

function GeneralTab() {
  const role = useCurrentTenantRole();
  const isAdmin = role === 'admin';

  const [tenant, setTenant] = useState<TenantRow | null>(null);
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [locale, setLocale] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const t = (await apiFetch('/api/tenants/me')) as TenantRow;
        setTenant(t);
        setName(t.name || '');
        setCountry(t.country || '');
        setLocale(t.locale || '');
        setBillingEmail(t.billing_email || '');
        setNotes(t.notes || '');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = (await apiFetch('/api/tenants/me', {
        method: 'PATCH',
        body: JSON.stringify({ name, country, locale, billing_email: billingEmail, notes }),
      })) as TenantRow;
      setTenant(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;
  if (!tenant) return <ErrorBlock message={error || 'Failed to load tenant.'} />;

  return (
    <Card>
      <SectionHeader title="General" description="Tenant profile and subscription overview." />

      <Subsection label="Subscription">
        <ReadOnlyRow label="Status" value={tenant.subscription_status || '—'} chip />
        <ReadOnlyRow label="Trial ends" value={formatDate(tenant.trial_ends_at)} />
        <ReadOnlyRow label="Payment method" value={tenant.payment_method || '—'} />
        <ReadOnlyRow label="Created" value={formatDate(tenant.created_at)} />
        <ReadOnlyRow label="Slug" value={tenant.slug} mono />
      </Subsection>

      <Subsection label="Profile">
        <Field label="Company name">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} style={inputStyle} />
        </Field>
        <Field label="Country" hint="ISO 3166-1 alpha-2 (e.g. MU, US, FR)">
          <input type="text" value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} maxLength={2} disabled={!isAdmin} style={inputStyle} />
        </Field>
        <Field label="Locale" hint="BCP 47 (e.g. en-US, fr-MU)">
          <input type="text" value={locale} onChange={(e) => setLocale(e.target.value)} disabled={!isAdmin} style={inputStyle} />
        </Field>
        <Field label="Billing email">
          <input type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} disabled={!isAdmin} style={inputStyle} />
        </Field>
        <Field label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} disabled={!isAdmin} style={{ ...inputStyle, resize: 'vertical' }} />
        </Field>
      </Subsection>

      {error && <ErrorMsg message={error} />}
      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          {saved && <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', alignSelf: 'center' }}>Saved.</span>}
          <button type="button" onClick={save} disabled={saving} style={primaryBtn()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
      {!isAdmin && (
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 16 }}>
          You need admin role to edit these fields.
        </p>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Brand tab
// ─────────────────────────────────────────────────────────────

interface AnnexA {
  tenant_id: string;
  annex_a: Record<string, unknown>;
  updated_at?: string | null;
}

const DATE_FORMATS = [
  { id: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { id: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { id: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
];

function BrandTab() {
  const role = useCurrentTenantRole();
  const isAdmin = role === 'admin';
  // Shared annex_a session cache — used here to refetch + re-apply the
  // ANNEX_A_DEFAULT.vatRate hot-patch after a successful save.
  const { refetch: refetchAnnexA } = useAnnexA();

  const [annexA, setAnnexA] = useState<Record<string, unknown> | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [pdfFooter, setPdfFooter] = useState('');
  const [legalJurisdiction, setLegalJurisdiction] = useState('');
  const [currency, setCurrency] = useState('');
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = (await apiFetch('/api/design/annex_a')) as AnnexA;
        const a = r.annex_a || {};
        setAnnexA(a);
        setCompanyName(strOf(a.company_name));
        setPdfFooter(strOf(a.pdf_footer_text));
        setLegalJurisdiction(strOf(a.legal_jurisdiction_text));
        setCurrency(strOf(a.currency_code) || 'USD');
        const df = strOf(a.date_format);
        setDateFormat(DATE_FORMATS.some((f) => f.id === df) ? df : 'DD/MM/YYYY');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    if (!annexA) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const merged = {
        ...annexA,
        company_name: companyName,
        pdf_footer_text: pdfFooter,
        legal_jurisdiction_text: legalJurisdiction,
        currency_code: currency.toUpperCase(),
        date_format: dateFormat,
      };
      const r = (await apiFetch('/api/design/annex_a', {
        method: 'PUT',
        body: JSON.stringify({ annex_a: merged }),
      })) as AnnexA;
      setAnnexA(r.annex_a);
      // Refresh the session-cached annex_a so the in-memory
      // ANNEX_A_DEFAULT.vatRate / date_format hot-patch picks up
      // the new values without a page reload.
      void refetchAnnexA();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;
  if (!annexA) return <ErrorBlock message={error || 'Failed to load brand settings.'} />;

  return (
    <Card>
      <SectionHeader title="Brand" description="Company-wide branding applied to generated PDFs and outbound docs." />
      <Subsection label="Document branding">
        <Field label="Company name" hint="Shown at the top of agreements, invoices, and design packs.">
          <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={!isAdmin} style={inputStyle} />
        </Field>
        <Field label="PDF footer text" hint="Single line. Tax IDs, registration numbers, etc.">
          <input type="text" value={pdfFooter} onChange={(e) => setPdfFooter(e.target.value)} disabled={!isAdmin} style={inputStyle} />
        </Field>
        <Field label="Legal jurisdiction" hint="Used in contract boilerplate (e.g. 'Republic of Mauritius').">
          <input type="text" value={legalJurisdiction} onChange={(e) => setLegalJurisdiction(e.target.value)} disabled={!isAdmin} style={inputStyle} />
        </Field>
      </Subsection>

      <Subsection label="Locale">
        <Field label="Currency code" hint="ISO 4217 (e.g. USD, EUR, MUR).">
          <input type="text" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} disabled={!isAdmin} style={{ ...inputStyle, maxWidth: 120 }} />
        </Field>
        <Field label="Date format">
          <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} disabled={!isAdmin} style={inputStyle}>
            {DATE_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </Field>
      </Subsection>

      {error && <ErrorMsg message={error} />}
      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          {saved && <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', alignSelf: 'center' }}>Saved.</span>}
          <button type="button" onClick={save} disabled={saving} style={primaryBtn()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Vendor defaults tab
// ─────────────────────────────────────────────────────────────

function VendorsTab() {
  const role = useCurrentTenantRole();
  const isAdmin = role === 'admin';

  const [annexA, setAnnexA] = useState<Record<string, unknown> | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = (await apiFetch('/api/design/annex_a')) as AnnexA;
        const a = r.annex_a || {};
        setAnnexA(a);
        const vd = a.vendor_defaults ?? {};
        setText(JSON.stringify(vd, null, 2));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    if (!annexA) return;
    setParseError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Invalid JSON');
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const merged = { ...annexA, vendor_defaults: parsed };
      const r = (await apiFetch('/api/design/annex_a', {
        method: 'PUT',
        body: JSON.stringify({ annex_a: merged }),
      })) as AnnexA;
      setAnnexA(r.annex_a);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;
  if (!annexA) return <ErrorBlock message={error || 'Failed to load vendor defaults.'} />;

  return (
    <Card>
      <SectionHeader title="Vendor defaults" description="Default payment terms, delivery windows, and trade names. Used as starting values when adding a new vendor to a design project." />
      <div
        style={{
          marginBottom: 8,
          padding: '8px 10px',
          background: 'var(--color-brand-accent-soft)',
          borderLeft: '2px solid var(--color-brand-accent)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 11,
          lineHeight: 1.5,
          color: 'var(--color-text-secondary)',
        }}
      >
        Raw JSON editor. Validated on save — invalid JSON will not be persisted.
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!isAdmin}
        rows={20}
        spellCheck={false}
        style={{
          ...inputStyle,
          fontFamily: 'var(--font-mono-fad, monospace)',
          fontSize: 12,
          resize: 'vertical',
          minHeight: 240,
        }}
      />
      {parseError && <ErrorMsg message={`JSON parse error: ${parseError}`} />}
      {error && <ErrorMsg message={error} />}
      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          {saved && <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', alignSelf: 'center' }}>Saved.</span>}
          <button type="button" onClick={save} disabled={saving} style={primaryBtn()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Payment instructions tab
// ─────────────────────────────────────────────────────────────

// Mirror of the JSONB shape on tenants.payment_instructions —
// see backend/migrations/039_payment_instructions.sql.
interface PaymentInstructions {
  bank_name?: string | null;
  account_name?: string | null;
  account_number?: string | null;
  iban?: string | null;
  swift?: string | null;
  currency?: string | null;
  instructions?: string | null;
}

function PaymentInstructionsTab() {
  const role = useCurrentTenantRole();
  const isAdmin = role === 'admin';

  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [iban, setIban] = useState('');
  const [swift, setSwift] = useState('');
  const [currency, setCurrency] = useState('');
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const t = (await apiFetch('/api/tenants/me')) as { payment_instructions?: PaymentInstructions };
        const p = t.payment_instructions || {};
        setBankName(p.bank_name || '');
        setAccountName(p.account_name || '');
        setAccountNumber(p.account_number || '');
        setIban(p.iban || '');
        setSwift(p.swift || '');
        setCurrency(p.currency || '');
        setInstructions(p.instructions || '');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      // Send empty strings as null so the backend doesn't persist
      // whitespace-y placeholders. Currency is stored as the literal
      // string the user enters (ISO 4217 — uppercased for sanity).
      const payload: PaymentInstructions = {
        bank_name: bankName.trim() || null,
        account_name: accountName.trim() || null,
        account_number: accountNumber.trim() || null,
        iban: iban.trim() || null,
        swift: swift.trim() || null,
        currency: currency.trim().toUpperCase() || null,
        instructions: instructions.trim() || null,
      };
      await apiFetch('/api/tenants/me', {
        method: 'PATCH',
        body: JSON.stringify({ payment_instructions: payload }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <Card>
      <SectionHeader
        title="Payment instructions"
        description="Where to send payment for your FridayOS Design subscription. These details are shown to your team on every pending invoice."
      />
      <Subsection label="Bank details">
        <Field label="Bank name">
          <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} disabled={!isAdmin} style={inputStyle} />
        </Field>
        <Field label="Account name">
          <input type="text" value={accountName} onChange={(e) => setAccountName(e.target.value)} disabled={!isAdmin} style={inputStyle} />
        </Field>
        <Field label="Account number">
          <input type="text" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} disabled={!isAdmin} style={inputStyle} />
        </Field>
        <Field label="IBAN">
          <input type="text" value={iban} onChange={(e) => setIban(e.target.value)} disabled={!isAdmin} style={inputStyle} />
        </Field>
        <Field label="SWIFT / BIC" hint="Optional — required for most international wires.">
          <input type="text" value={swift} onChange={(e) => setSwift(e.target.value)} disabled={!isAdmin} style={inputStyle} />
        </Field>
        <Field label="Currency" hint="ISO 4217 (e.g. USD, EUR, MUR).">
          <input type="text" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} disabled={!isAdmin} style={{ ...inputStyle, maxWidth: 120 }} />
        </Field>
      </Subsection>
      <Subsection label="Notes">
        <Field label="Additional instructions" hint="Shown below the bank details (e.g. transfer reference format, intermediary bank).">
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} disabled={!isAdmin} style={{ ...inputStyle, resize: 'vertical' }} />
        </Field>
      </Subsection>
      {error && <ErrorMsg message={error} />}
      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          {saved && <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', alignSelf: 'center' }}>Saved.</span>}
          <button type="button" onClick={save} disabled={saving} style={primaryBtn()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
      {!isAdmin && (
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 16 }}>
          You need admin role to edit these fields.
        </p>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Users tab
// ─────────────────────────────────────────────────────────────

// Mirrors the JSON shapes returned by backend/src/tenants/users.js.
interface TenantUser {
  id: string;
  email: string;
  role: string; // GMS role: 'admin' / 'manager' / 'staff' / etc.
  display_name: string | null;
  is_active: boolean;
  created_at: string;
}

interface TenantInvitation {
  id: string;
  email: string;
  role: 'admin' | 'agent';
  status: string;
  expires_at: string;
  created_at: string;
}

// GMS-role → display chip. 'admin' is the privileged tier; everything
// else maps to "Agent" in the UI. Keeps the chip stable while we
// migrate roles around in the backend.
function _roleLabel(gmsRole: string): { label: string; tone: 'admin' | 'agent' } {
  return gmsRole === 'admin'
    ? { label: 'Admin', tone: 'admin' }
    : { label: 'Agent', tone: 'agent' };
}

function UsersTab() {
  const role = useCurrentTenantRole();
  const isAdmin = role === 'admin';

  const [users, setUsers] = useState<TenantUser[] | null>(null);
  const [invites, setInvites] = useState<TenantInvitation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'agent'>('agent');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState<string | null>(null);

  // Per-row in-flight state — keyed by id, so we can disable the right
  // button without blocking the rest of the table.
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const refresh = async () => {
    setError(null);
    try {
      const [u, i] = await Promise.all([
        apiFetch('/api/tenants/me/users') as Promise<TenantUser[]>,
        apiFetch('/api/tenants/me/invitations') as Promise<TenantInvitation[]>,
      ]);
      setUsers(u);
      setInvites(i);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviteSent(null);
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await apiFetch('/api/tenants/me/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), role: inviteRole }),
      });
      setInviteSent(`Invitation sent to ${inviteEmail.trim().toLowerCase()}.`);
      setInviteEmail('');
      setInviteRole('agent');
      await refresh();
      setTimeout(() => setInviteSent(null), 3000);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setInviting(false);
    }
  };

  const revokeInvite = async (id: string) => {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await apiFetch(`/api/tenants/me/invitations/${id}`, { method: 'DELETE' });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[id]; return n; });
    }
  };

  const changeRole = async (userId: string, nextRole: 'admin' | 'agent') => {
    setBusy((b) => ({ ...b, [userId]: true }));
    try {
      await apiFetch(`/api/tenants/me/users/${userId}/role`, {
        method: 'POST',
        body: JSON.stringify({ role: nextRole }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[userId]; return n; });
    }
  };

  const deactivate = async (userId: string) => {
    setBusy((b) => ({ ...b, [userId]: true }));
    try {
      await apiFetch(`/api/tenants/me/users/${userId}/deactivate`, { method: 'POST' });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[userId]; return n; });
    }
  };

  if (loading) return <Loading />;
  if (!isAdmin) {
    return (
      <Card>
        <SectionHeader title="Users" description="Manage who has access to this workspace." />
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
          You need admin role to view or manage users.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <SectionHeader title="Invite a user" description="Send an email invitation. The recipient sets their own password to join your workspace." />
        <form onSubmit={submitInvite} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, alignItems: 'end' }}>
          <Field label="Email">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@studio.com"
              required
              style={inputStyle}
            />
          </Field>
          <Field label="Role">
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'admin' | 'agent')} style={inputStyle}>
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <button type="submit" disabled={inviting || !inviteEmail.trim()} style={{ ...primaryBtn(), height: 32 }}>
            {inviting ? 'Sending…' : 'Send invitation'}
          </button>
        </form>
        {inviteError && <ErrorMsg message={inviteError} />}
        {inviteSent && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-tertiary)' }}>{inviteSent}</div>
        )}
      </Card>

      <div style={{ height: 16 }} />

      <Card>
        <SectionHeader title="Pending invitations" description="Invitations awaiting acceptance. Each link expires 7 days after it's sent." />
        {!invites || invites.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No pending invitations.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Sent</th>
                <th style={thStyle}>Expires</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => (
                <tr key={inv.id}>
                  <td style={tdStyle}>{inv.email}</td>
                  <td style={tdStyle}>
                    <span className="chip info" style={{ fontSize: 11 }}>{inv.role === 'admin' ? 'Admin' : 'Agent'}</span>
                  </td>
                  <td style={tdStyle}>{formatDate(inv.created_at)}</td>
                  <td style={tdStyle}>{formatDate(inv.expires_at)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => revokeInvite(inv.id)}
                      disabled={!!busy[inv.id]}
                      style={ghostBtn()}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div style={{ height: 16 }} />

      <Card>
        <SectionHeader title="Team members" description="Everyone with access to your workspace." />
        {error && <ErrorMsg message={error} />}
        {!users || users.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No users yet.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const r = _roleLabel(u.role);
                const isUserAdmin = u.role === 'admin';
                return (
                  <tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.55 }}>
                    <td style={tdStyle}>{u.display_name || '—'}</td>
                    <td style={tdStyle}>{u.email}</td>
                    <td style={tdStyle}>
                      <span className="chip info" style={{ fontSize: 11 }}>{r.label}</span>
                    </td>
                    <td style={tdStyle}>
                      <span className="chip" style={{ fontSize: 11, opacity: 0.8 }}>
                        {u.is_active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        onClick={() => changeRole(u.id, isUserAdmin ? 'agent' : 'admin')}
                        disabled={!!busy[u.id] || !u.is_active}
                        style={ghostBtn()}
                        title={isUserAdmin ? 'Demote to Agent' : 'Promote to Admin'}
                      >
                        {isUserAdmin ? 'Demote' : 'Promote'}
                      </button>
                      {u.is_active && (
                        <button
                          type="button"
                          onClick={() => deactivate(u.id)}
                          disabled={!!busy[u.id]}
                          style={{ ...ghostBtn(), marginLeft: 6 }}
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};
const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  fontSize: 11,
  textTransform: 'uppercase',
  color: 'var(--color-text-tertiary)',
  letterSpacing: 0.5,
  borderBottom: '0.5px solid var(--color-border-secondary)',
  fontWeight: 500,
};
const tdStyle: React.CSSProperties = {
  padding: '8px',
  borderBottom: '0.5px solid var(--color-border-secondary)',
  verticalAlign: 'middle',
};

function ghostBtn(): React.CSSProperties {
  return {
    padding: '4px 10px',
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--color-text-primary)',
    fontSize: 12,
    border: '0.5px solid var(--color-border-secondary)',
    cursor: 'pointer',
  };
}

// ─────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return <div className="card" style={{ padding: 20 }}>{children}</div>;
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <>
      <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 500 }}>{title}</h3>
      <p style={{ margin: '0 0 16px', color: 'var(--color-text-tertiary)', fontSize: 13 }}>{description}</p>
    </>
  );
}

function Subsection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--color-text-tertiary)', letterSpacing: 0.5, marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function ReadOnlyRow({ label, value, chip, mono }: { label: string; value: string; chip?: boolean; mono?: boolean }) {
  return (
    <div className="settings-row">
      <div>
        <h5>{label}</h5>
      </div>
      {chip ? (
        <span className="chip info">{value}</span>
      ) : (
        <span className="settings-value" style={mono ? { fontFamily: 'var(--font-mono-fad, monospace)', fontSize: 12 } : undefined}>{value}</span>
      )}
    </div>
  );
}

function Loading() {
  return <div style={{ padding: 24, fontSize: 13, color: 'var(--color-text-tertiary)' }}>Loading…</div>;
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div style={{ padding: 24 }}>
      <ErrorMsg message={message} />
    </div>
  );
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
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function strOf(v: unknown): string {
  return typeof v === 'string' ? v : '';
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
