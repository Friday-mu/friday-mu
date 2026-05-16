'use strict';

// Resend-backed transactional email for tenant billing + onboarding.
// Single `sendEmail` API + a handful of template factories. Templates
// return { subject, html, text } and the caller composes them with
// sendEmail — keeps templates trivially unit-testable (pure functions
// of their inputs) and keeps the send path tiny.
//
// If RESEND_API_KEY is unset (dev / CI), sendEmail logs a warning and
// resolves with { id: null, success: false, stubbed: true } instead of
// throwing — same shape as backend/src/website_inbox/resend.js so the
// rest of the system can't error on a missing key.
//
// Callers should treat sends as fire-and-forget; never block an HTTP
// response on the Resend round-trip. The recommended pattern is
//   sendEmail(...).catch(() => {});
// since template-rendering errors should be visible in logs but must
// not break the user-facing flow (signup, invoice issuance, etc.).

const axios = require('axios');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM_EMAIL || 'FridayOS Design <hello@friday.mu>';

const DASHBOARD_URL = 'https://gms.friday.mu/fad';
const BILLING_URL = `${DASHBOARD_URL}?m=billing`;

// Fallback bank details when a tenant hasn't set their own
// payment_instructions. Matches the BdM account used elsewhere in the
// system. Real production tenants of other Friday entities will want
// their own — but FR is the only legal entity right now (per CLAUDE.md).
const DEFAULT_BANK_DETAILS = {
  bank: 'Banque des Mascareignes (BdM)',
  account_name: 'Friday Retreats Ltd',
  account_number: '0001-0123456-78',
  swift: 'MASBMUMU',
  iban: 'MU17 MASB 0901 2345 6789 0123 456 MUR',
};

// ─────────────────────────── send ───────────────────────────

async function sendEmail({ to, subject, html, text }) {
  if (!to || !subject || !html) {
    console.warn('[tenants/email] missing required fields — skipping send', { to, subject });
    return { id: null, success: false, stubbed: true };
  }
  if (!RESEND_API_KEY) {
    console.warn('[tenants/email] RESEND_API_KEY not set — skipping email to', to, '—', subject);
    return { id: null, success: false, stubbed: true };
  }
  try {
    const { data } = await axios.post(
      'https://api.resend.com/emails',
      {
        from: RESEND_FROM,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text: text || _htmlToText(html),
      },
      {
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 15_000,
      },
    );
    return { id: data?.id || null, success: true };
  } catch (e) {
    // Resend errors carry a useful body. Log but don't rethrow — caller
    // is fire-and-forget.
    const detail = e?.response?.data || e.message;
    console.error('[tenants/email] send failed:', detail);
    return { id: null, success: false, error: e.message };
  }
}

// Best-effort HTML → text fallback. Real text templates are passed
// through; this is the safety-net path when a caller forgot.
function _htmlToText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|h\d|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─────────────────────────── shared template chrome ────────────

// Common wrapper — minimal inline styles, tested in Gmail/Outlook/Apple
// Mail. Keep this tight; complex CSS bites in email clients.
function _wrap(bodyHtml) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #14233d;">
      ${bodyHtml}
      <hr style="border: 0; border-top: 1px solid #e6e1d6; margin: 24px 0;">
      <p style="font-size: 11px; color: #9b9b9b;">FridayOS Design · Mauritius · <a href="https://friday.mu" style="color: #2B4A93;">friday.mu</a></p>
    </div>
  `.trim();
}

function _money(invoice) {
  const major = (Number(invoice?.amount_minor) || 0) / 100;
  const code = invoice?.currency_code || 'USD';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(major);
  } catch {
    return `${major.toFixed(2)} ${code}`;
  }
}

function _date(d) {
  if (!d) return 'TBC';
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return String(d);
  }
}

function _bankDetailsHtml(tenant) {
  // tenant.payment_instructions is optional (free-form text the tenant
  // can override per-row). Fall back to BdM defaults otherwise.
  const custom = tenant?.payment_instructions;
  if (custom && typeof custom === 'string' && custom.trim()) {
    return `<pre style="background: #f4f1ea; padding: 12px; border-radius: 6px; font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; white-space: pre-wrap;">${_esc(custom)}</pre>`;
  }
  const b = DEFAULT_BANK_DETAILS;
  return `
    <div style="background: #f4f1ea; padding: 12px 16px; border-radius: 6px; font-size: 13px;">
      <div><strong>Bank:</strong> ${_esc(b.bank)}</div>
      <div><strong>Account name:</strong> ${_esc(b.account_name)}</div>
      <div><strong>Account #:</strong> ${_esc(b.account_number)}</div>
      <div><strong>SWIFT:</strong> ${_esc(b.swift)}</div>
      <div><strong>IBAN:</strong> ${_esc(b.iban)}</div>
    </div>
  `.trim();
}

function _bankDetailsText(tenant) {
  const custom = tenant?.payment_instructions;
  if (custom && typeof custom === 'string' && custom.trim()) {
    return custom;
  }
  const b = DEFAULT_BANK_DETAILS;
  return [
    `Bank: ${b.bank}`,
    `Account name: ${b.account_name}`,
    `Account #: ${b.account_number}`,
    `SWIFT: ${b.swift}`,
    `IBAN: ${b.iban}`,
  ].join('\n');
}

function _esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─────────────────────────── templates ───────────────────────

// tplInvoiceIssued — sent when FR admin creates a new invoice.
function tplInvoiceIssued({ tenant, invoice, tenantConfig, pdfUrl }) {
  const company = tenant?.name || 'there';
  const num = invoice?.invoice_number || 'INV-XXXX';
  const amount = _money(invoice);
  const due = _date(invoice?.due_date);
  const ref = num; // bank-transfer reference = invoice number
  const subject = `Your FridayOS Design invoice ${num} is ready.`;

  const html = _wrap(`
    <h1 style="font-size: 18px; margin: 0 0 16px; font-weight: 500;">Invoice ${_esc(num)}</h1>
    <p>Hi ${_esc(company)},</p>
    <p>A new invoice has been issued for your FridayOS Design subscription.</p>
    <div style="background: #f4f1ea; padding: 16px; border-radius: 8px; margin: 16px 0;">
      <div><strong>Invoice:</strong> ${_esc(num)}</div>
      <div><strong>Amount:</strong> ${_esc(amount)}</div>
      <div><strong>Due:</strong> ${_esc(due)}</div>
    </div>
    <p><strong>Payment by bank transfer.</strong> Please send the funds to:</p>
    ${_bankDetailsHtml(tenantConfig || tenant)}
    <p style="margin-top: 12px;"><strong>Reference:</strong> <code style="background: #f4f1ea; padding: 2px 6px; border-radius: 3px;">${_esc(ref)}</code> — please include this in the transfer so we can match the payment.</p>
    ${pdfUrl ? `<p><a href="${_esc(pdfUrl)}" style="color: #2B4A93;">Download invoice PDF</a></p>` : ''}
    <p style="margin-top: 20px;">Once you've sent the transfer, <a href="${BILLING_URL}" style="color: #2B4A93;">log in and mark it as paid</a>. We'll confirm on our end as soon as the funds land.</p>
    <p style="margin-top: 24px;">— The Friday team</p>
  `);

  const text = [
    `Invoice ${num}`,
    '',
    `Hi ${company},`,
    '',
    `A new invoice has been issued for your FridayOS Design subscription.`,
    '',
    `Invoice: ${num}`,
    `Amount:  ${amount}`,
    `Due:     ${due}`,
    '',
    'Payment by bank transfer. Please send the funds to:',
    '',
    _bankDetailsText(tenantConfig || tenant),
    '',
    `Reference: ${ref} — please include this in the transfer so we can match the payment.`,
    pdfUrl ? `PDF: ${pdfUrl}` : '',
    '',
    `Once you've sent the transfer, log in and mark it as paid: ${BILLING_URL}`,
    '',
    '— The Friday team',
  ].filter(Boolean).join('\n');

  return { subject, html, text };
}

// tplPaymentConfirmed — sent when FR admin confirms a paid invoice.
function tplPaymentConfirmed({ tenant, invoice }) {
  const company = tenant?.name || 'there';
  const num = invoice?.invoice_number || 'INV-XXXX';
  const amount = _money(invoice);
  const subject = `Payment received — ${num}`;

  const html = _wrap(`
    <h1 style="font-size: 18px; margin: 0 0 16px; font-weight: 500;">Payment received</h1>
    <p>Hi ${_esc(company)},</p>
    <p>We've received and confirmed your payment. Thank you.</p>
    <div style="background: #f4f1ea; padding: 16px; border-radius: 8px; margin: 16px 0;">
      <div><strong>Invoice:</strong> ${_esc(num)}</div>
      <div><strong>Amount:</strong> ${_esc(amount)}</div>
      <div><strong>Status:</strong> Paid</div>
    </div>
    <p>Your subscription is up to date. You can view your full billing history at any time in <a href="${BILLING_URL}" style="color: #2B4A93;">Billing</a>.</p>
    <p style="margin-top: 24px;">— The Friday team</p>
  `);

  const text = [
    'Payment received',
    '',
    `Hi ${company},`,
    '',
    `We've received and confirmed your payment. Thank you.`,
    '',
    `Invoice: ${num}`,
    `Amount:  ${amount}`,
    `Status:  Paid`,
    '',
    `Your subscription is up to date. Billing history: ${BILLING_URL}`,
    '',
    '— The Friday team',
  ].join('\n');

  return { subject, html, text };
}

// tplWelcome — sent right after signup.
function tplWelcome({ tenant, adminUser, trialEndsAt }) {
  const company = tenant?.name || 'there';
  const firstName = (adminUser?.display_name || adminUser?.email || '').split(/[\s@]/)[0] || '';
  const trialEnd = _date(trialEndsAt || tenant?.trial_ends_at);
  const subject = `Welcome to FridayOS Design, ${company}.`;

  const html = _wrap(`
    <h1 style="font-size: 18px; margin: 0 0 16px; font-weight: 500;">Welcome to FridayOS Design</h1>
    <p>${firstName ? `Hi ${_esc(firstName)},` : 'Hi,'}</p>
    <p>Your <strong>${_esc(company)}</strong> workspace is ready. You're on a 14-day free trial — no payment needed until ${_esc(trialEnd)}.</p>
    <div style="background: #f4f1ea; padding: 16px; border-radius: 8px; margin: 16px 0;">
      <div style="font-weight: 500; margin-bottom: 6px;">What's next:</div>
      <ul style="margin: 0; padding-left: 18px; color: #5b6776;">
        <li>Set up your studio brand + Annex A in <a href="${DASHBOARD_URL}?m=settings" style="color: #2B4A93;">Settings</a></li>
        <li>Start a project — generate moodboards, floor plans, and budgets in seconds</li>
        <li>Invite your team from the <a href="${DASHBOARD_URL}?m=team" style="color: #2B4A93;">Team</a> page</li>
      </ul>
    </div>
    <p><a href="${DASHBOARD_URL}" style="display: inline-block; background: #2B4A93; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none;">Open the dashboard</a></p>
    <p style="margin-top: 20px;">Reply to this email any time — we read every message.</p>
    <p style="margin-top: 24px;">— The Friday team</p>
  `);

  const text = [
    'Welcome to FridayOS Design',
    '',
    firstName ? `Hi ${firstName},` : 'Hi,',
    '',
    `Your ${company} workspace is ready. You're on a 14-day free trial — no payment needed until ${trialEnd}.`,
    '',
    `What's next:`,
    `  • Set up your studio brand + Annex A in Settings: ${DASHBOARD_URL}?m=settings`,
    `  • Start a project — generate moodboards, floor plans, and budgets`,
    `  • Invite your team: ${DASHBOARD_URL}?m=team`,
    '',
    `Open the dashboard: ${DASHBOARD_URL}`,
    '',
    'Reply to this email any time — we read every message.',
    '',
    '— The Friday team',
  ].join('\n');

  return { subject, html, text };
}

// tplTrialEndingSoon — fired 3 days before trial_ends_at (cron wires
// this up later; the template is here so it's ready).
function tplTrialEndingSoon({ tenant, daysLeft }) {
  const company = tenant?.name || 'there';
  const days = Number(daysLeft) || 3;
  const subject = `${days} day${days === 1 ? '' : 's'} left on your FridayOS Design trial.`;

  const html = _wrap(`
    <h1 style="font-size: 18px; margin: 0 0 16px; font-weight: 500;">${_esc(String(days))} day${days === 1 ? '' : 's'} left on your trial</h1>
    <p>Hi ${_esc(company)},</p>
    <p>Your FridayOS Design trial ends in <strong>${_esc(String(days))} day${days === 1 ? '' : 's'}</strong>. After that, we'll issue your first invoice based on the modules you have active.</p>
    <p>You don't need to do anything right now — we'll email the invoice with bank-transfer instructions when it's issued. If you'd like to change which modules you're subscribed to before then, head to <a href="${DASHBOARD_URL}?m=settings" style="color: #2B4A93;">Settings → Modules</a>.</p>
    <p>Questions? Reply to this email.</p>
    <p style="margin-top: 24px;">— The Friday team</p>
  `);

  const text = [
    `${days} day${days === 1 ? '' : 's'} left on your trial`,
    '',
    `Hi ${company},`,
    '',
    `Your FridayOS Design trial ends in ${days} day${days === 1 ? '' : 's'}. After that, we'll issue your first invoice based on the modules you have active.`,
    '',
    `You don't need to do anything right now — we'll email the invoice with bank-transfer instructions. To change modules first: ${DASHBOARD_URL}?m=settings`,
    '',
    'Questions? Reply to this email.',
    '',
    '— The Friday team',
  ].join('\n');

  return { subject, html, text };
}

// tplPasswordReset — sent when a user requests a password reset.
function tplPasswordReset({ user, resetUrl }) {
  const firstName = (user?.display_name || user?.email || '').split(/[\s@]/)[0] || '';
  const subject = 'Reset your FridayOS Design password.';

  const html = _wrap(`
    <h1 style="font-size: 18px; margin: 0 0 16px; font-weight: 500;">Reset your password</h1>
    <p>${firstName ? `Hi ${_esc(firstName)},` : 'Hi,'}</p>
    <p>We received a request to reset your FridayOS Design password. Click below to set a new one — the link expires in 1 hour.</p>
    <p style="margin: 20px 0;"><a href="${_esc(resetUrl)}" style="display: inline-block; background: #2B4A93; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none;">Reset password</a></p>
    <p style="font-size: 12px; color: #5b6776;">Or copy this link into your browser:<br><code style="word-break: break-all;">${_esc(resetUrl)}</code></p>
    <p style="margin-top: 20px; font-size: 12px; color: #9b9b9b;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
    <p style="margin-top: 24px;">— The Friday team</p>
  `);

  const text = [
    'Reset your password',
    '',
    firstName ? `Hi ${firstName},` : 'Hi,',
    '',
    `We received a request to reset your FridayOS Design password. Open this link to set a new one (expires in 1 hour):`,
    '',
    resetUrl,
    '',
    `If you didn't request this, you can safely ignore this email — your password won't change.`,
    '',
    '— The Friday team',
  ].join('\n');

  return { subject, html, text };
}

// tplInvitation — sent when a tenant admin invites a teammate. The
// acceptUrl carries the single-use token; the recipient lands on a
// public page that lets them set a password and join the workspace.
function tplInvitation({ tenant, inviter, role, acceptUrl }) {
  const company = tenant?.name || 'a FridayOS Design workspace';
  const inviterName = inviter?.display_name || inviter?.email || 'A teammate';
  const roleLabel = role === 'admin' ? 'an admin' : 'a teammate';
  const subject = `You're invited to join ${company} on FridayOS Design.`;

  const html = _wrap(`
    <h1 style="font-size: 18px; margin: 0 0 16px; font-weight: 500;">You're invited</h1>
    <p>${_esc(inviterName)} has invited you to join <strong>${_esc(company)}</strong> on FridayOS Design as ${_esc(roleLabel)}.</p>
    <p>FridayOS Design is the workspace your studio uses for moodboards, floor plans, budgets, and project handoffs.</p>
    <p style="margin: 20px 0;"><a href="${_esc(acceptUrl)}" style="display: inline-block; background: #2B4A93; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none;">Accept invitation</a></p>
    <p style="font-size: 12px; color: #5b6776;">Or copy this link into your browser:<br><code style="word-break: break-all;">${_esc(acceptUrl)}</code></p>
    <p style="margin-top: 20px; font-size: 12px; color: #9b9b9b;">This invitation expires in 7 days. If you weren't expecting it, you can safely ignore this email.</p>
    <p style="margin-top: 24px;">— The Friday team</p>
  `);

  const text = [
    `You're invited`,
    '',
    `${inviterName} has invited you to join ${company} on FridayOS Design as ${roleLabel}.`,
    '',
    `Accept the invitation:`,
    acceptUrl,
    '',
    `This invitation expires in 7 days. If you weren't expecting it, you can safely ignore this email.`,
    '',
    '— The Friday team',
  ].join('\n');

  return { subject, html, text };
}

// Sent when someone is assigned to a task (including the case where
// the assignee changes from one user to another — only the new
// assignee gets the email). `assigner` is the user who made the
// change; both names default to email-localpart when display_name is
// unset.
function tplTaskAssigned({ tenant, task, assigner, taskUrl }) {
  const company = tenant?.name || 'your workspace';
  const assignerName = assigner?.display_name || assigner?.email || 'A teammate';
  const dueLine = task?.due_date
    ? `Due ${_date(task.due_date)}.`
    : 'No due date set.';
  const priority = task?.priority || 'medium';
  const priorityLabel = priority === 'urgent' || priority === 'high'
    ? ` (priority: ${priority})`
    : '';
  const subject = `${assignerName} assigned you a task: ${task?.title || 'Untitled'}${priorityLabel}`;

  const html = _wrap(`
    <h1 style="font-size: 18px; margin: 0 0 16px; font-weight: 500;">New task assigned</h1>
    <p>${_esc(assignerName)} assigned you a task in <strong>${_esc(company)}</strong>:</p>
    <p style="margin: 16px 0; padding: 12px 16px; border-left: 3px solid #2B4A93; background: #f7f9fc;">
      <strong>${_esc(task?.title || 'Untitled')}</strong><br>
      <span style="color: #5b6776; font-size: 13px;">${_esc(dueLine)} Priority: ${_esc(priority)}.</span>
    </p>
    ${task?.description ? `<p>${_esc(task.description)}</p>` : ''}
    ${taskUrl ? `<p style="margin: 20px 0;"><a href="${_esc(taskUrl)}" style="display: inline-block; background: #2B4A93; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none;">View task</a></p>` : ''}
    <p style="margin-top: 24px;">— The Friday team</p>
  `);

  const text = [
    `New task assigned`,
    '',
    `${assignerName} assigned you a task in ${company}:`,
    '',
    `  ${task?.title || 'Untitled'}`,
    `  ${dueLine} Priority: ${priority}.`,
    '',
    task?.description ? task.description : '',
    taskUrl ? `\nView task: ${taskUrl}` : '',
    '',
    '— The Friday team',
  ].filter(Boolean).join('\n');

  return { subject, html, text };
}

module.exports = {
  sendEmail,
  tplInvoiceIssued,
  tplPaymentConfirmed,
  tplWelcome,
  tplTrialEndingSoon,
  tplPasswordReset,
  tplInvitation,
  tplTaskAssigned,
};
