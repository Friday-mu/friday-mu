'use strict';

// Saveable-link email for portal v2. Sent fire-and-forget from
// /api/public/threads/claim. Bilingual EN/FR; brand "Friday" (not
// "Friday Retreats") per website-side house style for guest copy.
//
// Subject + body copy locked with the website session 2026-05-25 —
// see ~/.openclaw/workspace/projects/friday-website/portal-v2/
// fad-questions-reply-2026-05-25.md section F2.

const { sendEmail } = require('../website_inbox/resend');

const SUBJECTS = {
  en: 'Your Friday portal — save this link',
  fr: 'Votre portail Friday — gardez ce lien',
};

function bodyEn({ name, portalUrl }) {
  const greeting = name ? `Hi ${name.split(' ')[0]},` : 'Hi,';
  return [
    greeting,
    '',
    'Thanks for getting in touch. We saved your request so you can pick up where you left off — view your portal here:',
    portalUrl,
    '',
    'The link works on any device. Bookmark it or keep this email; you can come back any time to see updates, message us, and confirm details.',
    '',
    '— The Friday team',
  ].join('\n');
}

function bodyFr({ name, portalUrl }) {
  const greeting = name ? `Bonjour ${name.split(' ')[0]},` : 'Bonjour,';
  return [
    greeting,
    '',
    'Merci de nous avoir contactés. Nous avons sauvegardé votre demande pour que vous puissiez la retrouver à tout moment — votre portail est ici :',
    portalUrl,
    '',
    'Le lien fonctionne sur tous vos appareils. Mettez-le en favoris ou conservez cet e-mail ; vous pouvez revenir quand vous voulez pour voir les nouveautés, nous écrire, ou confirmer les détails.',
    '',
    '— L\'équipe Friday',
  ].join('\n');
}

function htmlBody({ name, portalUrl, locale }) {
  const isFr = locale === 'fr';
  const greeting = name
    ? (isFr ? `Bonjour ${name.split(' ')[0]},` : `Hi ${name.split(' ')[0]},`)
    : (isFr ? 'Bonjour,' : 'Hi,');
  const intro = isFr
    ? 'Merci de nous avoir contactés. Nous avons sauvegardé votre demande pour que vous puissiez la retrouver à tout moment.'
    : 'Thanks for getting in touch. We saved your request so you can pick up where you left off.';
  const ctaLabel = isFr ? 'Ouvrir mon portail' : 'Open my portal';
  const footer = isFr
    ? 'Le lien fonctionne sur tous vos appareils. Mettez-le en favoris ou conservez cet e-mail.'
    : 'The link works on any device. Bookmark it or keep this email.';
  const signoff = isFr ? "— L'équipe Friday" : '— The Friday team';
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #14233d;">
      <p>${greeting}</p>
      <p>${intro}</p>
      <p style="margin: 24px 0;">
        <a href="${portalUrl}" style="display: inline-block; background: #2B4A93; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">${ctaLabel}</a>
      </p>
      <p style="font-size: 13px; color: #5b6776; word-break: break-all;">
        <a href="${portalUrl}" style="color: #2B4A93;">${portalUrl}</a>
      </p>
      <p style="font-size: 12px; color: #9b9b9b;">${footer}</p>
      <p style="margin-top: 24px;">${signoff}</p>
    </div>
  `.trim();
}

/**
 * Fire-and-forget. Caller does not await the network result; we log
 * + swallow errors so the claim response stays fast and never fails
 * just because Resend is having a bad day.
 *
 * Returns void.
 */
function sendSaveLinkEmail({ to, name, portalUrl, locale = 'en' }) {
  const lang = locale === 'fr' ? 'fr' : 'en';
  const subject = SUBJECTS[lang];
  const body = lang === 'fr' ? bodyFr({ name, portalUrl }) : bodyEn({ name, portalUrl });
  const html = htmlBody({ name, portalUrl, locale: lang });
  // Don't `await` — caller continues immediately. Errors are logged.
  Promise.resolve()
    .then(() => sendEmail({ to, toName: name || undefined, subject, body, html }))
    .catch((err) => {
      console.error('[public/portal_email] send failed:', err?.message || err);
    });
}

module.exports = { sendSaveLinkEmail };
