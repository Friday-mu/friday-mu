'use strict';

// Invoice PDF renderer for the bank-transfer billing flow.
//
// Renders an invoice to a Buffer via pdfkit (already a backend dep, same
// path the W8 signed-agreement evidence PDF uses). Regenerated on every
// fetch — no on-disk caching. Layout is single-page A4, designed to be
// printable and to read cleanly as an email attachment.
//
// Sections (top → bottom):
//   1. Header  — issuer (FridayOS Design) + tenant company_name
//   2. Title   — INVOICE + invoice number
//   3. Meta    — issued / due / period dates
//   4. Lines   — for v1, one line "FridayOS Design — <period> subscription"
//   5. Totals  — subtotal / tax (0 for v0) / total
//   6. Status  — chip-style badge (pending / paid / etc.)
//   7. Bank    — payment instructions (tenant.payment_instructions JSONB
//              with hardcoded BdM fallback matching BillingModule v0)
//   8. Notes   — optional, only if invoice.notes is set
//   9. Footer  — pdf_footer_text + legal_jurisdiction_text + page numbers

const PDFDocument = require('pdfkit');

// Hardcoded BdM fallback matches FR_BANK_DETAILS in BillingModule.tsx so
// the PDF and the web view show the same wire instructions until tenants
// can configure payment_instructions per-tenant.
const FR_BANK_FALLBACK = {
  bank: 'Banque des Mascareignes',
  account: '60000000XXXXX',
  accountName: 'Friday Retreats Ltd',
  iban: 'MU17BOMM0101101030300200000MUR',
};

const ISSUER_NAME = 'FridayOS Design';
const STATUS_COPY = {
  pending: { label: 'PENDING', color: '#b45309', bg: '#fef3c7' },
  paid_pending_confirmation: { label: 'PAYMENT SUBMITTED', color: '#1e40af', bg: '#dbeafe' },
  paid: { label: 'PAID', color: '#166534', bg: '#dcfce7' },
  overdue: { label: 'OVERDUE', color: '#991b1b', bg: '#fee2e2' },
  cancelled: { label: 'CANCELLED', color: '#374151', bg: '#e5e7eb' },
  refunded: { label: 'REFUNDED', color: '#374151', bg: '#e5e7eb' },
};

// Format a minor-unit BIGINT as a major-unit display string. Uses
// Intl.NumberFormat with the invoice currency; falls back to a plain
// "<code> <major>" string if the currency code is bad.
function formatAmount(amountMinor, currencyCode) {
  const major = Number(amountMinor || 0) / 100;
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currencyCode || 'USD',
    }).format(major);
  } catch {
    return `${currencyCode || ''} ${major.toFixed(2)}`.trim();
  }
}

function formatDate(value) {
  if (!value) return '—';
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    // YYYY-MM-DD — short, locale-neutral, unambiguous for invoices.
    return d.toISOString().slice(0, 10);
  } catch {
    return String(value);
  }
}

function formatPeriod(start, end) {
  return `${formatDate(start)} → ${formatDate(end)}`;
}

// Resolve the bank details from the tenant row. tenant.payment_instructions
// is a JSONB column (not yet in schema — populated in a later migration);
// if missing, we fall back to the FR BdM details that the BillingModule UI
// hardcodes today.
function resolveBankDetails(tenant) {
  const pi = tenant && tenant.payment_instructions;
  if (pi && typeof pi === 'object') {
    return {
      bank: pi.bank || FR_BANK_FALLBACK.bank,
      account: pi.account || FR_BANK_FALLBACK.account,
      accountName: pi.account_name || pi.accountName || FR_BANK_FALLBACK.accountName,
      iban: pi.iban || FR_BANK_FALLBACK.iban,
      swift: pi.swift || pi.bic || null,
    };
  }
  return { ...FR_BANK_FALLBACK, swift: null };
}

// Render an invoice PDF and return a Buffer. Resolves once the pdfkit
// stream finishes; rejects if the stream errors out.
function renderInvoicePdf({ invoice, tenant, tenantConfig }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (e) => reject(e));

    try {
      _draw(doc, { invoice, tenant, tenantConfig });
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

function _draw(doc, { invoice, tenant, tenantConfig }) {
  const cfg = tenantConfig || {};
  const billedTo = (tenant && (tenant.name || tenant.slug)) || cfg.company_name || 'Customer';
  const currency = invoice.currency_code || 'USD';
  const amountMinor = Number(invoice.amount_minor || 0);
  const subtotal = amountMinor;
  const tax = 0; // v0: no VAT line; flip when tax_minor lands on the row.
  const total = subtotal + tax;

  // ── 1. Header ────────────────────────────────────────────────────
  doc.fontSize(9).fillColor('#6b7280').text('FROM', 50, 50);
  doc.fontSize(13).fillColor('#111827').text(ISSUER_NAME, 50, 64, { width: 250 });
  doc.fontSize(9).fillColor('#6b7280').text('Design and operations platform', 50, 82, { width: 250 });

  doc.fontSize(9).fillColor('#6b7280').text('BILL TO', 320, 50);
  doc.fontSize(13).fillColor('#111827').text(billedTo, 320, 64, { width: 225 });
  if (tenant && tenant.billing_email) {
    doc.fontSize(9).fillColor('#6b7280').text(String(tenant.billing_email), 320, 82, { width: 225 });
  }

  // ── 2. Title ─────────────────────────────────────────────────────
  doc.moveTo(50, 115).lineTo(545, 115).strokeColor('#e5e7eb').stroke();
  doc.fontSize(24).fillColor('#111827').text('INVOICE', 50, 130);
  doc.fontSize(12).fillColor('#374151')
    .text(invoice.invoice_number || '—', 50, 160, { width: 250 });

  // Status badge — top-right.
  _drawStatusBadge(doc, invoice.status, 545 - 160, 138, 160);

  // ── 3. Meta ──────────────────────────────────────────────────────
  let metaY = 195;
  _metaPair(doc, 'Issued', formatDate(invoice.issued_at || invoice.created_at), 50, metaY);
  _metaPair(doc, 'Due', formatDate(invoice.due_date), 220, metaY);
  _metaPair(doc, 'Period', formatPeriod(invoice.period_start, invoice.period_end), 380, metaY);

  // ── 4. Line items ────────────────────────────────────────────────
  let y = 245;
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
  y += 8;
  doc.fontSize(9).fillColor('#6b7280').text('DESCRIPTION', 50, y);
  doc.fontSize(9).fillColor('#6b7280').text('AMOUNT', 50, y, { width: 495, align: 'right' });
  y += 16;
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
  y += 10;

  const lineDesc = `${ISSUER_NAME} — ${formatPeriod(invoice.period_start, invoice.period_end)} subscription`;
  doc.fontSize(11).fillColor('#111827').text(lineDesc, 50, y, { width: 360 });
  doc.fontSize(11).fillColor('#111827').text(
    formatAmount(amountMinor, currency),
    50, y,
    { width: 495, align: 'right' },
  );
  y += 28;

  // ── 5. Totals ────────────────────────────────────────────────────
  doc.moveTo(330, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
  y += 6;
  _totalRow(doc, 'Subtotal', formatAmount(subtotal, currency), y);
  y += 16;
  _totalRow(doc, 'Tax', formatAmount(tax, currency), y);
  y += 16;
  doc.moveTo(330, y).lineTo(545, y).strokeColor('#d1d5db').stroke();
  y += 6;
  _totalRow(doc, 'Total', formatAmount(total, currency), y, true);
  y += 30;

  // ── 6. Bank-transfer details ─────────────────────────────────────
  const bank = resolveBankDetails(tenant);
  doc.fontSize(11).fillColor('#111827').text('Pay by bank transfer', 50, y);
  y += 16;
  doc.rect(50, y, 495, 90).fillAndStroke('#f9fafb', '#e5e7eb');
  const boxStartY = y + 10;
  _bankRow(doc, 'Bank', bank.bank, boxStartY);
  _bankRow(doc, 'Account name', bank.accountName, boxStartY + 14);
  _bankRow(doc, 'Account', bank.account, boxStartY + 28, true);
  _bankRow(doc, 'IBAN', bank.iban, boxStartY + 42, true);
  if (bank.swift) {
    _bankRow(doc, 'SWIFT / BIC', bank.swift, boxStartY + 56, true);
  }
  _bankRow(doc, 'Reference', invoice.invoice_number || '—', boxStartY + 70, true, true);
  y += 100;

  // ── 7. Notes (optional) ──────────────────────────────────────────
  if (invoice.notes && String(invoice.notes).trim()) {
    doc.fontSize(11).fillColor('#111827').text('Notes', 50, y);
    y += 14;
    doc.fontSize(10).fillColor('#374151').text(String(invoice.notes), 50, y, { width: 495 });
    y = doc.y + 10;
  }

  // ── 8. Footer ────────────────────────────────────────────────────
  // Anchor footer to a fixed bottom rather than the cursor — looks
  // tidier when notes are short. Page numbers via pdfkit's late
  // bufferPages-style: we only ever emit a single page, but we still
  // print "1 / 1" so multi-page upgrades are a layout-only change.
  const footerY = 760;
  doc.moveTo(50, footerY).lineTo(545, footerY).strokeColor('#e5e7eb').stroke();
  doc.fontSize(8).fillColor('#9ca3af').text(
    cfg.pdf_footer_text || 'FridayOS Design',
    50, footerY + 8,
    { width: 350 },
  );
  if (cfg.legal_jurisdiction_text) {
    doc.fontSize(8).fillColor('#9ca3af').text(
      String(cfg.legal_jurisdiction_text),
      50, footerY + 22,
      { width: 350 },
    );
  }
  doc.fontSize(8).fillColor('#9ca3af').text('Page 1 / 1', 50, footerY + 8, {
    width: 495, align: 'right',
  });
}

function _metaPair(doc, label, value, x, y) {
  doc.fontSize(9).fillColor('#6b7280').text(label.toUpperCase(), x, y);
  doc.fontSize(11).fillColor('#111827').text(String(value), x, y + 12, { width: 160 });
}

function _totalRow(doc, label, value, y, emphasize = false) {
  const labelOpts = { fontSize: emphasize ? 11 : 10, color: '#374151' };
  const valOpts = { fontSize: emphasize ? 13 : 10, color: '#111827' };
  doc.fontSize(labelOpts.fontSize).fillColor(labelOpts.color)
    .text(label, 330, y, { width: 110 });
  doc.fontSize(valOpts.fontSize).fillColor(valOpts.color)
    .text(value, 330, y, { width: 215, align: 'right' });
}

function _bankRow(doc, label, value, y, mono = false, highlight = false) {
  doc.fontSize(9).fillColor('#6b7280').text(label, 62, y, { width: 110 });
  doc.fontSize(10)
    .fillColor(highlight ? '#1d4ed8' : '#111827')
    .font(mono ? 'Courier' : 'Helvetica')
    .text(String(value), 180, y, { width: 355, align: 'left' });
  doc.font('Helvetica');
}

function _drawStatusBadge(doc, status, x, y, width) {
  const meta = STATUS_COPY[status] || { label: String(status || 'UNKNOWN').toUpperCase(), color: '#374151', bg: '#e5e7eb' };
  const height = 22;
  doc.roundedRect(x, y, width, height, 3).fillAndStroke(meta.bg, meta.bg);
  doc.fontSize(10).fillColor(meta.color)
    .text(meta.label, x, y + 6, { width, align: 'center' });
  doc.fillColor('#111827'); // reset
}

module.exports = {
  renderInvoicePdf,
};
