// Real Friday Retreats Ltd particulars used across every doc preview.
// Source: company registration + agreement template Sep 2025.
//
// @demo:config — These values are real and should NOT be replaced wholesale
// in v0.2; the backend should source them from a tenant-config endpoint
// so other future entities (FI/S) can override. Tag: PROD-DESIGN-FRIDAY-PARTICULARS.

export const FRIDAY = {
  legalName: 'Friday Retreats Ltd',
  brn: 'C24206082',
  vatNumber: '28238154',
  address: {
    line1: 'No. 34, Le Datier Complex',
    line2: 'Ave des Vergers, Morc Bismic',
    city: 'Flic en Flac',
    country: 'Mauritius',
  },
  phone: '+230 4084119',
  emails: {
    finance: 'finance@friday.mu',
    general: 'hello@friday.mu',
  },
  bank: {
    accountNumber: '000453205836',
    beneficiary: 'Friday Retreats Ltd',
    name: 'Mauritius Commercial Bank',
    iban: 'MU03MCBL0901000453205836000M',
  },
  signatories: {
    director: { name: 'Ishant Ayadassen', title: 'Director', idNumber: 'A1207962905878', email: 'ishant@friday.mu' },
    secondary: { name: 'Mary Oladimeji', title: 'Operations', email: 'mary@friday.mu' },
  },
  /** Document number prefix segment for Interior Design docs. */
  servicePrefix: 'ID',
  legalPrefix: 'FR',
  /** Late-payment + invoice term constants (per agreement §3.5). */
  invoice: {
    dueDays: 7,
    latePaymentRatePerMonth: 0.02,
    vatRate: 0.15,
  },
} as const;

/** Build a Friday-style document number — `${legalPrefix}-${servicePrefix}-${initials}-${seq}`.
 *  Example: FR-ID-DN-004 = Friday · Interior Design · Davisen Nursoo · #004. */
export function fridayDocNumber(initials: string, seq: number, options?: { service?: string }): string {
  const service = options?.service ?? FRIDAY.servicePrefix;
  const safeInitials = (initials || 'XX').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'XX';
  return `${FRIDAY.legalPrefix}-${service}-${safeInitials}-${String(seq).padStart(3, '0')}`;
}

/** Reusable formatted-date helper — `dd Mon yyyy`. */
export function formatDocDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(',', '');
}

/** dd.mm.yyyy — used by invoice numbering / formal headers. */
export function formatDocDateNumeric(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}.${mm}.${yy}`;
}

/** Best-effort initials from a counterparty / project name. "Davisen Nursoo" → "DN". */
export function deriveInitials(fullName: string | null | undefined): string {
  if (!fullName) return 'XX';
  const parts = fullName.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return 'XX';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
