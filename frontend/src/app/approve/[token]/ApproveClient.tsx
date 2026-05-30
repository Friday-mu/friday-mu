'use client';

import { useMemo, useState } from 'react';
import {
  formatCurrency,
  type FinExpense,
  type FinApprovalRecord,
  type FinProperty,
  type FinOwner,
  type FinCategory,
} from '../../fad/_data/finance';

interface Props {
  expense: FinExpense;
  approval: FinApprovalRecord;
  property: FinProperty | null | undefined;
  owner: FinOwner | null | undefined;
  category: FinCategory | undefined;
  amountEur: number;
}

type Action = 'approve' | 'decline';
type Lang = 'en' | 'fr';

const COPY: Record<Lang, {
  headline: string;
  sub: string;
  property: string;
  vendor: string;
  category: string;
  amount: string;
  receipt: string;
  optionalMessage: string;
  approve: string;
  decline: string;
  expiry: string;
  contact: string;
  declineReason: string;
  declinePlaceholder: string;
  approvedHeadline: string;
  approvedSub: string;
  declinedHeadline: string;
  declinedSub: string;
  alreadyHeadline: string;
  alreadySub: string;
}> = {
  en: {
    headline: 'Approval needed',
    sub: 'Friday Retreats has flagged an expense at your property for your review.',
    property: 'Property',
    vendor: 'Vendor',
    category: 'Category',
    amount: 'Amount',
    receipt: 'Tap to view receipt / estimate',
    optionalMessage: 'Optional message to Friday Retreats',
    approve: 'Approve',
    decline: 'Decline',
    expiry: 'Auto-approves in 24h if no response.',
    contact: 'Questions?',
    declineReason: 'Reason for decline',
    declinePlaceholder: 'Tell Friday Retreats why (briefly)…',
    approvedHeadline: 'Approved.',
    approvedSub: 'Friday Retreats has been notified. Thank you.',
    declinedHeadline: 'Declined.',
    declinedSub: 'Friday Retreats has been notified.',
    alreadyHeadline: 'Already actioned.',
    alreadySub: 'This approval has already been completed.',
  },
  fr: {
    headline: 'Approbation requise',
    sub: 'Friday Retreats a signalé une dépense à votre propriété pour examen.',
    property: 'Propriété',
    vendor: 'Fournisseur',
    category: 'Catégorie',
    amount: 'Montant',
    receipt: 'Toucher pour voir le reçu / devis',
    optionalMessage: 'Message à Friday Retreats (optionnel)',
    approve: 'Approuver',
    decline: 'Refuser',
    expiry: "Approbation automatique dans 24h sans réponse.",
    contact: 'Des questions ?',
    declineReason: 'Motif du refus',
    declinePlaceholder: 'Expliquez à Friday Retreats (brièvement)…',
    approvedHeadline: 'Approuvé.',
    approvedSub: 'Friday Retreats a été notifié. Merci.',
    declinedHeadline: 'Refusé.',
    declinedSub: 'Friday Retreats a été notifié.',
    alreadyHeadline: 'Déjà traité.',
    alreadySub: 'Cette approbation a déjà été complétée.',
  },
};

export function ApproveClient({
  expense, approval, property, owner, category, amountEur,
}: Props) {
  const [lang, setLang] = useState<Lang>(owner?.language || 'en');
  const [done, setDone] = useState<Action | null>(
    approval.status === 'explicitly_approved' || approval.status === 'deemed_approved'
      ? 'approve'
      : approval.status === 'rejected'
      ? 'decline'
      : null,
  );
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [message, setMessage] = useState('');
  const [declineReason, setDeclineReason] = useState('');

  const copy = COPY[lang];

  const expiryRemaining = useMemo(() => {
    if (!approval.expiresAt) return null;
    const ms = new Date(approval.expiresAt).getTime() - Date.now();
    if (ms < 0) return null;
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return { h, m };
  }, [approval.expiresAt]);

  if (done) {
    return (
      <div className="approve-page">
        <div className="approve-shell">
          <Brand lang={lang} setLang={setLang} />
          <div className="approve-card">
            <div className="approve-done">
              <div className={'approve-done-icon ' + (done === 'approve' ? 'approved' : 'declined')}>
                {done === 'approve' ? '✓' : '✕'}
              </div>
              <h1 className="approve-done-headline">
                {done === 'approve' ? copy.approvedHeadline : copy.declinedHeadline}
              </h1>
              <p className="approve-done-sub">
                {done === 'approve' ? copy.approvedSub : copy.declinedSub}
              </p>
            </div>
          </div>
          <Contact />
        </div>
      </div>
    );
  }

  return (
    <div className="approve-page">
      <div className="approve-shell">
        <Brand lang={lang} setLang={setLang} />

        <h1 className="approve-headline">{copy.headline}</h1>
        <p className="approve-sub">{copy.sub}</p>

        <div className="approve-card">
          <div className="approve-property">
            <div className="approve-property-img">{property?.code.split('-')[0] || 'FR'}</div>
            <div>
              <div className="approve-property-name">{property?.name || 'Friday property'}</div>
              <div className="approve-property-code">{property?.code || '—'}</div>
            </div>
          </div>

          <div className="approve-row">
            <div>
              <div className="approve-row-label">{copy.vendor}</div>
              <div>{expense.vendorName}</div>
            </div>
          </div>

          <div className="approve-row">
            <div>
              <div className="approve-row-label">{copy.category}</div>
              <div>{category?.name || expense.categoryCode}</div>
            </div>
          </div>

          <div className="approve-row" style={{ alignItems: 'center' }}>
            <div>
              <div className="approve-row-label">{copy.amount}</div>
              <div className="approve-amount">
                {formatCurrency(expense.amountMinor, expense.currency)}
              </div>
              <div className="approve-amount-sub">≈ € {amountEur.toLocaleString()}</div>
            </div>
          </div>

          <div className="approve-row" style={{ display: 'block', borderTop: 0, paddingTop: 14 }}>
            <div className="approve-row-label" style={{ marginBottom: 6 }}>Description</div>
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>{expense.description}</div>
          </div>

          {expense.receipts > 0 && (
            <div className="approve-receipt">
              📎 {copy.receipt} · {expense.receipts} file{expense.receipts > 1 ? 's' : ''}
            </div>
          )}
        </div>

        {confirming === 'decline' && (
          <div className="approve-card">
            <div className="approve-row-label" style={{ marginBottom: 8 }}>{copy.declineReason}</div>
            <textarea
              className="approve-message"
              placeholder={copy.declinePlaceholder}
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
            />
          </div>
        )}

        {!confirming && (
          <div className="approve-card">
            <div className="approve-row-label" style={{ marginBottom: 8 }}>{copy.optionalMessage}</div>
            <textarea
              className="approve-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        )}

        <div className="approve-actions">
          <button className="approve-btn decline" onClick={() => {
            if (confirming === 'decline') {
              setDone('decline');
            } else {
              setConfirming('decline');
            }
          }}>
            {copy.decline}
          </button>
          <button className="approve-btn approve" onClick={() => {
            setDone('approve');
          }}>
            {copy.approve}
          </button>
        </div>

        {expiryRemaining && (
          <div className="approve-expiry">
            ⏱ <strong>{copy.expiry}</strong>{' '}
            ({expiryRemaining.h}h {expiryRemaining.m}m remaining)
          </div>
        )}

        <Contact />
      </div>
    </div>
  );
}

function Brand({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div className="approve-brand">
      <div className="approve-brand-name">Friday Retreats</div>
      <div className="approve-lang" role="group" aria-label="language">
        <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
        <button className={lang === 'fr' ? 'active' : ''} onClick={() => setLang('fr')}>FR</button>
      </div>
    </div>
  );
}

function Contact() {
  return (
    <div className="approve-contact">
      <a href="https://wa.me/2305712XXXX">💬 WhatsApp</a> ·{' '}
      <a href="mailto:hello@friday.mu">hello@friday.mu</a>
    </div>
  );
}
