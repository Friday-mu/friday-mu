'use strict';

// Resend client for the guest-facing confirmation email. We use the
// HTTP API directly (no SDK) so we don't add another dep. The mark-
// paid endpoint calls this AFTER the Guesty confirm has succeeded —
// if Guesty fails, we never email the guest a stale confirmation.
//
// If RESEND_API_KEY isn't set (dev / CI), this is a no-op that logs
// what it WOULD have sent — useful for local testing.

const axios = require('axios');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM_EMAIL || 'Friday Retreats <hello@friday.mu>';

async function sendBookingConfirmation({ toEmail, toName, residenceName, checkInDate, checkOutDate, reference }) {
  const subject = `Booking confirmed — ${residenceName || 'Friday Retreats'}`;
  const greeting = toName ? `Hi ${toName.split(' ')[0]},` : 'Hi,';
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #14233d;">
      <h1 style="font-size: 18px; margin: 0 0 16px; font-weight: 500;">Your stay is confirmed</h1>
      <p>${greeting}</p>
      <p>We've received your payment and confirmed your booking. Here are the details:</p>
      <div style="background: #f4f1ea; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <div style="font-weight: 500; font-size: 15px;">${residenceName || 'Friday Retreats'}</div>
        <div style="margin-top: 6px; color: #5b6776;">Check-in: ${checkInDate || 'TBC'}</div>
        <div style="color: #5b6776;">Check-out: ${checkOutDate || 'TBC'}</div>
        ${reference ? `<div style="color: #9b9b9b; font-family: monospace; font-size: 12px; margin-top: 8px;">Ref: ${reference}</div>` : ''}
      </div>
      <p>We'll be in touch closer to your arrival with the welcome details, directions, and your host's contact. If anything changes in the meantime, just reply to this email.</p>
      <p style="margin-top: 24px;">— The Friday team</p>
      <hr style="border: 0; border-top: 1px solid #e6e1d6; margin: 24px 0;">
      <p style="font-size: 11px; color: #9b9b9b;">Friday Retreats · Mauritius · <a href="https://friday.mu" style="color: #2B4A93;">friday.mu</a></p>
    </div>
  `.trim();

  const text = [
    'Your stay is confirmed',
    '',
    greeting,
    '',
    `We've received your payment and confirmed your booking — ${residenceName || 'Friday Retreats'}.`,
    `Check-in: ${checkInDate || 'TBC'}`,
    `Check-out: ${checkOutDate || 'TBC'}`,
    reference ? `Reference: ${reference}` : '',
    '',
    `We'll be in touch closer to your arrival with the welcome details. If anything changes in the meantime, just reply to this email.`,
    '',
    '— The Friday team',
  ].filter(Boolean).join('\n');

  if (!RESEND_API_KEY) {
    console.warn('[website_inbox/resend] RESEND_API_KEY not set — skipping email to', toEmail);
    return { skipped: true };
  }
  const { data } = await axios.post('https://api.resend.com/emails',
    {
      from: RESEND_FROM,
      to: [toEmail],
      subject,
      html,
      text,
    },
    {
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
    },
  );
  return data;
}

module.exports = { sendBookingConfirmation };
